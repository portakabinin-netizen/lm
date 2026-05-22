/**
 * 🔄 LegacyFinanceAdapter.js
 * 
 * PURPOSE:
 * This controller serves as a translation layer. It exposes the old `payment/list`, `payment/summary`,
 * and `staff/picker` endpoints that `FinanceDashboard.tsx` expects, but it reads and writes 
 * to the NEW multi-tenant `Vouchers`, `Ledgers`, `Leads`, and `Employees` models.
 */

const mongoose = require("mongoose");
const { ensureLedgerFolioInternal } = require("./FinanceController");

const PAYMENT_TYPES = [
    "vendor_payment", "labour_charge", "freight_cartage", "misc_expense", 
    "capital_expense", "advance_employee", "loan_repayment"
];
const RECEIPT_TYPES = [
    "client_invoice_payment", "direct_income", "scrap_sale", 
    "misc_income", "client_advance", "loan_received"
];

function resolveDirection(txn_type) {
    if (PAYMENT_TYPES.includes(txn_type)) return "PAYMENT";
    if (RECEIPT_TYPES.includes(txn_type)) return "RECEIPT";
    return "JOURNAL";
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. LEADS PICKER
// ─────────────────────────────────────────────────────────────────────────────
exports.getLeadsForPicker = async (req, res) => {
    try {
        const { Leads } = req.tenantModels;
        // Find leads that are "Accepted", "Tax Invoice", or "Fully Paid"
        const ACTIVE_STATUSES = ["Accepted", "Tax Invoice", "Fully Paid"];
        const leads = await Leads.find({ status: { $in: ACTIVE_STATUSES } }).lean();

        // Proactively check and create ledgers for Accepted / Tax Invoice / Fully Paid leads
        for (const lead of leads) {
            const statusLower = lead.status?.toLowerCase() || "";
            if (statusLower === "accepted" || statusLower === "tax invoice" || statusLower === "fully paid") {
                try {
                    await ensureLedgerFolioInternal(req.tenantModels, {
                        name: lead.sender_name || "Client-" + lead.lead_no,
                        group: "Sundry Debtors",
                        parentGroup: "Current Assets",
                        refId: lead._id,
                        refType: "Lead",
                        nature: "Dr"
                    });
                } catch (pcErr) {
                    console.error(`Failed to auto-create ledger for lead ${lead.lead_no}:`, pcErr.message);
                }
            }
        }

        // Map to legacy format
        const picker = leads.map(l => ({
            _id:          l._id,
            lead_no:      l.lead_no,
            sender_name:  l.sender_name,
            sender_mobile: l.sender_mobile,
            product_name: l.product_name,
            status:       l.status,
            totalPaid:    0, // Could be aggregated from Vouchers if needed
            totalReceived:0,
        })).sort((a, b) => (b.lead_no || 0) - (a.lead_no || 0));

        res.json({ success: true, data: picker });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. STAFF PICKER
// ─────────────────────────────────────────────────────────────────────────────
exports.getStaffPicker = async (req, res) => {
    try {
        const { Employees, Parties } = req.tenantModels;
        
        const employees = await Employees.find({ active: true }).lean();
        const parties = await Parties.find({ active: true }).lean();

        // Legacy format split transporters, employees, contacts
        const mappedEmployees = employees.map(e => {
            const hist = e.employmentHistory || [];
            const active = hist.find(h => h.active) || hist[hist.length - 1] || {};
            return {
                _id: e._id, 
                name: e.name, 
                mobile: e.mobile, 
                role: e.role,
                pay_type: active.pay_type || "Daily", 
                daily_rate: active.daily_rate || 0,
                monthly_salary: active.monthly_salary || 0
            };
        });

        // We'll treat some Parties as transporters or contacts
        const mappedTransporters = parties.filter(p => p.type === "Supplier").map(p => ({
            _id: p._id, name: p.name, mobile: p.mobile, vehicle_type: "Truck", vehicle_no: ""
        }));

        const mappedContacts = parties.filter(p => p.type !== "Supplier").map(p => ({
            _id: p._id, name: p.name, mobile: p.mobile, type: p.type
        }));

        res.json({
            success: true,
            data: {
                employees: mappedEmployees,
                transporters: mappedTransporters,
                contacts: mappedContacts
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.addContact = async (req, res) => {
    try {
        const { Parties } = req.tenantModels;
        const isSupplier = req.body.type === "Supplier";
        const newParty = new Parties({
            name: req.body.name,
            mobile: req.body.mobile,
            type: isSupplier ? "Supplier" : "Client" // Simplified mapping
        });
        await newParty.save();

        // Auto-create ledger folio
        try {
            const ledger = await ensureLedgerFolioInternal(req.tenantModels, {
                ledgerName: newParty.name,
                groupName: isSupplier ? "Sundry Creditors" : "Sundry Debtors",
                parentGroup: isSupplier ? "Current Liabilities" : "Current Assets",
                refId: newParty._id,
                refType: isSupplier ? "Vendor" : "Client",
                nature: isSupplier ? "Cr" : "Dr"
            });
            if (ledger) {
                newParty.ledgerId = ledger._id;
                await newParty.save();
            }
        } catch (err) {
            console.error("Legacy addContact ledger creation failed:", err.message);
        }

        res.status(201).json({
            success: true,
            data: {
                _id: newParty._id,
                name: newParty.name,
                mobile: newParty.mobile,
                type: req.body.type,
                ledgerId: newParty.ledgerId
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. CREATE TRANSACTION (Legacy Flat -> Double Entry Voucher)
// ─────────────────────────────────────────────────────────────────────────────
exports.createTransaction = async (req, res) => {
    try {
        const { Vouchers, Counters, Groups, Ledgers } = req.tenantModels;
        const txnData = { ...req.body };
        const locationId = req.user?.accessibleLocationIds?.[0] || new mongoose.Types.ObjectId(); // Fallback location if needed

        const direction = resolveDirection(txnData.txn_type);
        txnData.direction = direction;
        txnData.txn_number = `LEGACY-${Date.now()}`;
        txnData.recorded_by = req.user?._id;

        // Auto-create User-specific Petty Cash Ledger for Double Entry
        const pettyCashName = `Petty Cash - ${req.user?.userDisplayName || "General User"}`;
        const cashLedger = await ensureLedgerFolioInternal(req.tenantModels, {
            name: pettyCashName,
            group: "Cash-in-hand",
            nature: "Dr",
            refId: req.user?._id || null,
            refType: "User"
        });

        let partyLedgerName = txnData.party_name || txnData.txn_type;
        let partyLedger;
        if (txnData.ref_lead_id && mongoose.Types.ObjectId.isValid(txnData.ref_lead_id)) {
            const { Leads } = req.tenantModels;
            const lead = await Leads.findById(txnData.ref_lead_id).lean();
            if (lead) {
                partyLedger = await ensureLedgerFolioInternal(req.tenantModels, {
                    name: lead.sender_name || partyLedgerName,
                    group: "Sundry Debtors",
                    parentGroup: "Current Assets",
                    refId: lead._id,
                    refType: "Lead",
                    nature: "Dr"
                });
            }
        }
        if (!partyLedger) {
            partyLedger = await ensureLedgerFolioInternal(req.tenantModels, {
                name: partyLedgerName,
                group: direction === "PAYMENT" ? "Sundry Creditors" : "Sundry Debtors",
                nature: direction === "PAYMENT" ? "Cr" : "Dr"
            });
        }

        // Double Entry setup
        const amount = parseFloat(txnData.amount) || 0;
        const entries = [];
        
        if (direction === "PAYMENT") {
            // Debit Party, Credit Cash
            entries.push({ ledgerId: partyLedger._id, ledgerName: partyLedger.ledgerName, debit: amount, credit: 0 });
            entries.push({ ledgerId: cashLedger._id, ledgerName: cashLedger.ledgerName, debit: 0, credit: amount });
        } else {
            // Debit Cash, Credit Party
            entries.push({ ledgerId: cashLedger._id, ledgerName: cashLedger.ledgerName, debit: amount, credit: 0 });
            entries.push({ ledgerId: partyLedger._id, ledgerName: partyLedger.ledgerName, debit: 0, credit: amount });
        }

        const counterId = `voucher_${direction}_${locationId}`;
        const counter = await Counters.findByIdAndUpdate(counterId, { $inc: { seq: 1 } }, { upsert: true, new: true });
        
        const voucher = new Vouchers({
            locationId,
            voucherType: direction === "PAYMENT" ? "Payment" : "Receipt",
            voucherNo: `${direction.substring(0,3)}-${locationId.toString().slice(-4)}-${counter.seq}`,
            date: txnData.txn_date || new Date(),
            narration: txnData.description || `${direction} via Dashboard`,
            entries: entries,
            leadId: txnData.ref_lead_id || null,
            legacyMetadata: txnData // ⬅️ STORE FLAT DATA HERE FOR DASHBOARD
        });

        await voucher.save();
        
        // Return exactly what the legacy UI expects
        res.status(201).json({ success: true, data: { ...txnData, _id: voucher._id } });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. LIST TRANSACTIONS (Reconstruct Flat from Vouchers)
// ─────────────────────────────────────────────────────────────────────────────
exports.listTransactions = async (req, res) => {
    try {
        const { Vouchers } = req.tenantModels;
        const vouchers = await Vouchers.find({ legacyMetadata: { $exists: true } })
                                       .sort({ date: -1 })
                                       .limit(50)
                                       .lean();
        
        const txns = vouchers.map(v => ({
            ...v.legacyMetadata,
            _id: v._id,
            txn_date: v.date,
        }));

        res.json({ success: true, data: txns, total: txns.length });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET SUMMARY (Reconstruct Dashboard Stats)
// ─────────────────────────────────────────────────────────────────────────────
exports.getPaymentSummary = async (req, res) => {
    try {
        const { Vouchers } = req.tenantModels;
        const vouchers = await Vouchers.find({ legacyMetadata: { $exists: true } }).lean();
        
        const txns = vouchers.map(v => v.legacyMetadata);

        const cleared = txns.filter(t => t.status !== "Cancelled");
        const totalPayments = cleared.filter(t => t.direction === "PAYMENT").reduce((s, t) => s + (t.amount || 0), 0);
        const totalReceipts = cleared.filter(t => t.direction === "RECEIPT").reduce((s, t) => s + (t.amount || 0), 0);

        const leadLinkedPayments = cleared.filter(t => t.direction === "PAYMENT" && t.ref_lead_id).reduce((s, t) => s + (t.amount || 0), 0);
        const leadLinkedReceipts = cleared.filter(t => t.direction === "RECEIPT" && t.ref_lead_id).reduce((s, t) => s + (t.amount || 0), 0);

        const byType = {};
        cleared.forEach(t => { byType[t.txn_type] = (byType[t.txn_type] || 0) + (t.amount || 0); });

        const PAYMENT_LABELS = {
            vendor_payment: "Purchases", labour_charge: "Labour", freight_cartage: "Freight",
            advance_employee: "Staff Advance", loan_repayment: "Loan Repayment", misc_expense: "Misc Expenses"
        };
        const RECEIPT_LABELS = {
            client_invoice_payment: "Sales Revenue", direct_income: "Direct Income",
            client_advance: "Advances", scrap_sale: "Scrap", loan_received: "Loans", misc_income: "Misc Income"
        };

        const paymentBreakdown = Object.entries(PAYMENT_LABELS).map(([k, l]) => ({ label: l, value: byType[k] || 0 })).filter(i => i.value > 0);
        const receiptBreakdown = Object.entries(RECEIPT_LABELS).map(([k, l]) => ({ label: l, value: byType[k] || 0 })).filter(i => i.value > 0);

        const purchases = byType["vendor_payment"] || 0;
        const sales = byType["client_invoice_payment"] || 0;
        const directExpenses = (byType["labour_charge"] || 0) + (byType["freight_cartage"] || 0);
        const directIncome = byType["direct_income"] || 0;
        const indirectExpenses = byType["misc_expense"] || 0;
        const indirectIncome = (byType["scrap_sale"] || 0) + (byType["misc_income"] || 0);

        const grossMargin = (sales + directIncome) - (purchases + directExpenses);
        const netProfit = grossMargin + indirectIncome - indirectExpenses;

        const recentTransactions = [...txns].sort((a, b) => new Date(b.txn_date) - new Date(a.txn_date)).slice(0, 10);

        res.json({
            success: true,
            data: {
                totalPayments, totalReceipts, netBalance: totalReceipts - totalPayments,
                leadLinkedPayments, leadLinkedReceipts,
                purchases, sales, directExpenses, directIncome, indirectExpenses, indirectIncome, grossMargin, netProfit,
                byType, paymentBreakdown, receiptBreakdown, recentTransactions,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. DELETE TRANSACTION
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteTransaction = async (req, res) => {
    try {
        const { Vouchers } = req.tenantModels;
        await Vouchers.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Transaction deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. GET LEAD LEDGER
// ─────────────────────────────────────────────────────────────────────────────
exports.getLeadLedger = async (req, res) => {
    try {
        const { Vouchers, Leads } = req.tenantModels;
        const lead = await Leads.findById(req.params.leadId).lean();
        if (!lead) return res.json({ success: true, data: null });

        // Resolve all lead IDs sharing this client/ledger to consolidate
        let leadIds = [lead._id];
        if (lead.ledgerId) {
            const relatedLeads = await Leads.find({ ledgerId: lead.ledgerId }).lean();
            leadIds = relatedLeads.map(l => l._id);
        } else if (lead.sender_mobile) {
            const cleanMobile = String(lead.sender_mobile).replace(/\D/g, '').slice(-10);
            if (cleanMobile.length === 10) {
                const relatedLeads = await Leads.find({
                    sender_mobile: { $regex: new RegExp(cleanMobile.split('').join('\\D*') + '\\D*$') }
                }).lean();
                leadIds = relatedLeads.map(l => l._id);
            }
        }

                const stringLeadIds = leadIds.map(id => id.toString());
        const vouchers = await Vouchers.find({ 
            $or: [
                { leadId: { $in: leadIds } },
                { "legacyMetadata.ref_lead_id": { $in: stringLeadIds } }
            ]
        }).sort({ date: 1 }).lean();
        
        const ledger = vouchers.map(v => {
            if (v.legacyMetadata) {
                const isPayment = v.legacyMetadata.direction === "PAYMENT";
                return {
                    _id: v._id,
                    voucherDate: v.date,
                    paymentType: isPayment ? "Dr" : "Cr",
                    amt: v.legacyMetadata.amount,
                    paymentFromTo: v.legacyMetadata.party_name || v.legacyMetadata.staff_name || v.legacyMetadata.txn_type,
                    voucherNarration: v.narration || v.legacyMetadata.description
                };
            } else {
                const isPayment = v.voucherType === "Payment";
                let amt = 0;
                let paymentFromTo = "";
                if (isPayment) {
                    const drEntry = (v.entries || []).find(e => e.debit > 0);
                    if (drEntry) {
                        amt = drEntry.debit;
                        paymentFromTo = drEntry.ledgerName;
                    }
                } else {
                    const crEntry = (v.entries || []).find(e => e.credit > 0);
                    if (crEntry) {
                        amt = crEntry.credit;
                        paymentFromTo = crEntry.ledgerName;
                    }
                }
                if (!paymentFromTo) {
                    paymentFromTo = v.entries?.[0]?.ledgerName || "Voucher Entry";
                    amt = v.entries?.[0]?.debit || v.entries?.[0]?.credit || 0;
                }
                return {
                    _id: v._id,
                    voucherDate: v.date,
                    paymentType: isPayment ? "Dr" : "Cr",
                    amt: amt,
                    paymentFromTo: paymentFromTo,
                    voucherNarration: v.narration
                };
            }
        });

        let totalCost = 0;
        let totalRevenue = 0;
        vouchers.forEach(v => {
            if (v.legacyMetadata) {
                if (v.legacyMetadata.direction === "PAYMENT") totalCost += v.legacyMetadata.amount || 0;
                if (v.legacyMetadata.direction === "RECEIPT") totalRevenue += v.legacyMetadata.amount || 0;
            } else {
                const isPayment = v.voucherType === "Payment";
                if (isPayment) {
                    const drEntry = (v.entries || []).find(e => e.debit > 0);
                    totalCost += drEntry ? (drEntry.debit || 0) : 0;
                } else {
                    const crEntry = (v.entries || []).find(e => e.credit > 0);
                    totalRevenue += crEntry ? (crEntry.credit || 0) : 0;
                }
            }
        });

        res.json({ 
            success: true, 
            data: { 
                lead_no: lead.lead_no,
                sender_name: lead.sender_name,
                product_name: lead.product_name,
                status: lead.status,
                ledger,
                totalCost,
                totalRevenue,
                grossMargin: totalRevenue - totalCost
            } 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 8. GET CONTACT LEDGER
// ─────────────────────────────────────────────────────────────────────────────
exports.getContactLedger = async (req, res) => {
    try {
        const { Vouchers, Parties, Employees, Ledgers, Leads } = req.tenantModels;
        const mobile = req.params.mobile;

        let ledgerDoc = null;
        let leadIds = [];
        let vouchers = [];

        // 1. Check if this mobile belongs to Leads (CRM client)
        const cleanMobile = String(mobile).replace(/\D/g, '').slice(-10);
        if (cleanMobile.length === 10) {
            const matchingLeads = await Leads.find({
                sender_mobile: { $regex: new RegExp(cleanMobile.split('').join('\\D*') + '\\D*$') }
            }).lean();
            if (matchingLeads.length > 0) {
                leadIds = matchingLeads.map(l => l._id);
                const leadWithLedger = matchingLeads.find(l => l.ledgerId);
                if (leadWithLedger) {
                    ledgerDoc = await Ledgers.findById(leadWithLedger.ledgerId).lean();
                }
            }
        }

        // 2. If it's a lead and we found a ledger, get vouchers for all linked leads / ledger
        if (ledgerDoc) {
            vouchers = await Vouchers.find({
                $or: [
                    { "entries.ledgerId": ledgerDoc._id },
                    { "legacyMetadata.ref_lead_id": { $in: leadIds.map(id => id.toString()) } }
                ]
            }).sort({ date: 1 }).lean();
        } else if (leadIds.length > 0) {
            // Found leads, but no ledger has been created yet (i.e. status not Accepted yet)
            return res.json({ success: true, data: { balance: 0, ledger: [] } });
        } else {
            // 3. Fallback to standard Staff/Party lookup
            let entity = await Employees.findOne({ mobile }).lean();
            if (!entity) {
                entity = await Parties.findOne({ mobile }).lean();
            }
            if (!entity) {
                return res.json({ success: true, data: { balance: 0, ledger: [] } });
            }
            ledgerDoc = await Ledgers.findOne({ refId: entity._id }).lean();
            if (ledgerDoc) {
                vouchers = await Vouchers.find({ "entries.ledgerId": ledgerDoc._id }).sort({ date: 1 }).lean();
            } else {
                vouchers = await Vouchers.find({ "legacyMetadata.contact_mobile": mobile }).sort({ date: 1 }).lean();
            }
        }

        // 4. Map vouchers to legacy format
        let balance = 0;
        const ledger = vouchers.map(v => {
            const entry = v.entries?.find(e => String(e.ledgerId) === String(ledgerDoc?._id)) || {};
            const amt = entry.debit || entry.credit || v.legacyMetadata?.amount || 0;
            const type = entry.debit > 0 ? "Dr" : (entry.credit > 0 ? "Cr" : (v.legacyMetadata?.direction === "PAYMENT" ? "Dr" : "Cr"));
            
            if (type === "Dr") balance += amt;
            else balance -= amt;

            return {
                _id: v._id,
                voucherDate: v.date,
                paymentType: type,
                amt: amt,
                voucherNarration: v.narration || v.legacyMetadata?.description || "Transaction"
            };
        });

        res.json({ success: true, data: { balance, ledger } });
    } catch (err) {
        console.error("🔴 getContactLedger Error:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Dummy exports for unused endpoints
exports.getTransactionsByLead = async (req, res) => res.json({ success: true, data: [] });
exports.getTransaction = async (req, res) => res.json({ success: true, data: {} });
exports.updateTransaction = async (req, res) => res.json({ success: true, data: {} });
exports.createVoucher = async (req, res) => res.json({ success: true, data: {} });
