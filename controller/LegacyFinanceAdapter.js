/**
 * 🔄 LegacyFinanceAdapter.js
 * 
 * PURPOSE:
 * This controller serves as a translation layer. It exposes the old `payment/list`, `payment/summary`,
 * and `staff/picker` endpoints that `FinanceDashboard.tsx` expects, but it reads and writes 
 * to the NEW multi-tenant `Vouchers`, `Ledgers`, `Leads`, and `Employees` models.
 */

const mongoose = require("mongoose");
const { ensureLedgerFolioInternal, recalculateLedgerBalances } = require("./FinanceController");

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
        const { Leads, Ledgers } = req.tenantModels;
        
        // Construct query filter with location-based scoping for non-CorpAdmin users
        const q = {};
        const accessibleIds = req.user?.accessibleLocationIds;
        if (req.user?.userRole !== "CorpAdmin" && accessibleIds?.length > 0) {
            q.locationId = { $in: accessibleIds };
        }

        const leads = await Leads.find(q).lean();

        // 1. Clean up ledgers for Recycled leads
        const recycledLeads = leads.filter(l => (l.status || "").toLowerCase() === "recycle");
        const recycledLedgerIds = recycledLeads.map(l => l.ledgerId).filter(Boolean);
        if (recycledLedgerIds.length > 0 && Ledgers) {
            try {
                await Ledgers.deleteMany({ _id: { $in: recycledLedgerIds } });
                await Leads.updateMany(
                    { ledgerId: { $in: recycledLedgerIds } },
                    { $unset: { ledgerId: "" } }
                );
                // Update local array elements
                leads.forEach(l => {
                    if (recycledLedgerIds.some(id => String(id) === String(l.ledgerId))) {
                        delete l.ledgerId;
                    }
                });
            } catch (cleanupErr) {
                console.error("Failed to clean up recycled ledgers:", cleanupErr.message);
            }
        }

        // 2. Proactively check and create ledgers for Accepted status leads only
        for (const lead of leads) {
            const statusLower = lead.status?.toLowerCase() || "";
            if (statusLower === "accepted") {
                if (lead.ledgerId) continue;
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
        const { Employees, Parties, Attendance } = req.tenantModels;
        
        const employees = await Employees.find({ active: true }).lean();
        const parties = await Parties.find({ active: true }).lean();

        const employeeIds = employees.map(e => e._id);
        const latestAttendances = await Attendance.aggregate([
            { $match: { employeeId: { $in: employeeIds }, dutyStart: { $exists: true, $ne: null } } },
            { $sort: { dutyStart: -1 } },
            { $group: {
                _id: "$employeeId",
                last_site_name: { $first: "$site_name" },
                last_date: { $first: "$dutyStart" }
            }}
        ]);

        const attendanceMap = {};
        latestAttendances.forEach(a => {
            attendanceMap[a._id.toString()] = a;
        });

        // Legacy format split transporters, employees, contacts
        const mappedEmployees = employees.map(e => {
            const hist = e.employmentHistory || [];
            const active = hist.find(h => h.active) || hist[hist.length - 1] || {};
            const empAtt = attendanceMap[e._id.toString()];
            return {
                _id: e._id, 
                name: e.name, 
                mobile: e.mobile, 
                role: e.role,
                pay_type: active.pay_type || "Daily", 
                daily_rate: active.daily_rate || 0,
                monthly_salary: active.monthly_salary || 0,
                photo: e.photo_url || e.photo,
                enrollment_no: e.enrollment_no,
                last_site_name: empAtt ? empAtt.last_site_name : null,
                last_attendance_date: empAtt ? empAtt.last_date : null
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
        
        // Sync ledger balances
        const ledgerIds = entries.map(e => e.ledgerId);
        await recalculateLedgerBalances(req.tenantModels, ledgerIds);
        
        // Return exactly what the legacy UI expects
        res.status(201).json({ success: true, data: { ...txnData, _id: voucher._id } });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions for Legacy Finance Adapter / Double-Entry Integration
// ─────────────────────────────────────────────────────────────────────────────

const getCategoryByGroupName = (groupName) => {
    if (!groupName) return null;
    const name = groupName.trim().toLowerCase();
    if (name === "sales accounts" || name === "sales account") return "Sales";
    if (name === "purchase accounts" || name === "purchase account") return "Purchases";
    if (name === "direct incomes" || name === "direct income") return "Direct Income";
    if (name === "direct expenses" || name === "direct expense") return "Direct Expenses";
    if (name === "indirect incomes" || name === "indirect income") return "Indirect Income";
    if (name === "indirect expenses" || name === "indirect expense") return "Indirect Expenses";
    if (name === "cash-in-hand" || name === "bank accounts" || name === "bank account") return "CashBank";
    return null;
};

const inferPaymentTxnType = (ledgerName, groupName) => {
    const lName = (ledgerName || "").toLowerCase();
    const gName = (groupName || "").toLowerCase();
    
    if (gName.includes("purchase")) return "vendor_payment";
    if (gName.includes("direct expense")) {
        if (lName.includes("freight") || lName.includes("cartage") || lName.includes("transp") || lName.includes("delivery")) {
            return "freight_cartage";
        }
        return "labour_charge";
    }
    if (gName.includes("indirect expense")) {
        return "misc_expense";
    }
    if (gName.includes("capital")) {
        return "capital_expense";
    }
    if (gName.includes("employee") || lName.includes("advance") || lName.includes("salary") || lName.includes("wage")) {
        return "advance_employee";
    }
    if (gName.includes("creditor")) {
        return "vendor_payment";
    }
    return "misc_expense";
};

const inferReceiptTxnType = (ledgerName, groupName) => {
    const lName = (ledgerName || "").toLowerCase();
    const gName = (groupName || "").toLowerCase();
    
    if (gName.includes("sale")) return "client_invoice_payment";
    if (gName.includes("direct income")) return "direct_income";
    if (gName.includes("indirect income") || gName.includes("other income")) {
        if (lName.includes("scrap")) return "scrap_sale";
        return "misc_income";
    }
    if (gName.includes("debtor")) {
        return "client_invoice_payment";
    }
    if (gName.includes("liability") && lName.includes("advance")) {
        return "client_advance";
    }
    return "misc_income";
};

const mapVoucherToLegacy = (v, ledgerGroupMap, leadMap) => {
    if (v.legacyMetadata) {
        return {
            ...v.legacyMetadata,
            _id: v._id,
            txn_date: v.date,
        };
    }

    let direction = "RECEIPT";
    if (v.voucherType === "Payment" || v.voucherType === "Purchase") {
        direction = "PAYMENT";
    }

    let amount = 0;
    let payment_mode = "Cash";
    let party_name = "";
    let txn_type = direction === "PAYMENT" ? "misc_expense" : "misc_income";

    const entries = v.entries || [];
    const cashBankEntries = [];
    const nonCashBankEntries = [];

    entries.forEach(e => {
        const ledId = e.ledgerId?.toString();
        const info = ledgerGroupMap[ledId];
        const cat = info ? getCategoryByGroupName(info.groupName) : null;
        if (cat === "CashBank") {
            cashBankEntries.push(e);
        } else {
            nonCashBankEntries.push(e);
        }
    });

    if (cashBankEntries.length > 0) {
        const primaryCB = cashBankEntries[0];
        const cbLedgerName = (primaryCB.ledgerName || "").toLowerCase();
        if (cbLedgerName.includes("bank") || cbLedgerName.includes("sbi") || cbLedgerName.includes("hdfc") || cbLedgerName.includes("icici") || cbLedgerName.includes("axis")) {
            payment_mode = "NEFT";
        }
        
        const totalCbDebit = cashBankEntries.reduce((sum, e) => sum + (e.debit || 0), 0);
        const totalCbCredit = cashBankEntries.reduce((sum, e) => sum + (e.credit || 0), 0);
        if (totalCbCredit > totalCbDebit) {
            direction = "PAYMENT";
            amount = totalCbCredit;
        } else {
            direction = "RECEIPT";
            amount = totalCbDebit;
        }
    } else {
        const totalDebit = entries.reduce((sum, e) => sum + (e.debit || 0), 0);
        amount = totalDebit;
    }

    if (nonCashBankEntries.length > 0) {
        const primaryNonCB = nonCashBankEntries[0];
        party_name = primaryNonCB.ledgerName || "";
        const ledId = primaryNonCB.ledgerId?.toString();
        const info = ledgerGroupMap[ledId];
        const gName = info ? info.groupName : "";
        if (direction === "PAYMENT") {
            txn_type = inferPaymentTxnType(party_name, gName);
        } else {
            txn_type = inferReceiptTxnType(party_name, gName);
        }
    }

    let lead_name = "";
    let lead_no = null;
    let project_name = "";
    let ref_lead_id = "";

    const leadDoc = v.leadId ? leadMap[v.leadId.toString()] : null;
    if (leadDoc) {
        lead_name = leadDoc.sender_name || "";
        lead_no = leadDoc.lead_no;
        project_name = leadDoc.product_name || "";
        ref_lead_id = leadDoc._id.toString();
    }

    return {
        _id: v._id,
        txn_number: v.voucherNumber || v.voucherNo || `VCH-${v._id.toString().slice(-6).toUpperCase()}`,
        txn_type,
        direction,
        amount,
        txn_date: v.date,
        party_name,
        ref_invoice_no: v.refDocNo || "",
        ref_lead_id,
        lead_no,
        lead_name,
        project_name,
        payment_mode,
        status: "Cleared",
        description: v.narration || "",
        createdAt: v.createdAt || v.date,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. LIST TRANSACTIONS (Reconstruct Flat from Vouchers)
// ─────────────────────────────────────────────────────────────────────────────
exports.listTransactions = async (req, res) => {
    try {
        const { Vouchers, Ledgers, Groups, Leads } = req.tenantModels;

        const groups = await Groups.find({}).lean();
        const ledgers = await Ledgers.find({}).lean();
        const leadsList = await Leads.find({}).lean();

        const groupMap = {};
        groups.forEach(g => {
            groupMap[g._id.toString()] = g;
        });

        const ledgerGroupMap = {};
        ledgers.forEach(l => {
            const group = groupMap[l.ledgerGroupId?.toString()];
            if (group) {
                ledgerGroupMap[l._id.toString()] = {
                    groupName: group.groupName,
                    nature: group.nature
                };
            }
        });

        const leadMap = {};
        leadsList.forEach(l => {
            leadMap[l._id.toString()] = l;
        });

        const vouchers = await Vouchers.find({})
                                       .sort({ date: -1 })
                                       .limit(50)
                                       .lean();
        
        const txns = vouchers.map(v => mapVoucherToLegacy(v, ledgerGroupMap, leadMap));

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
        const { Vouchers, Ledgers, Groups, Leads } = req.tenantModels;
        
        const groups = await Groups.find({}).lean();
        const ledgers = await Ledgers.find({}).lean();
        const leadsList = await Leads.find({}).lean();

        const groupMap = {};
        groups.forEach(g => {
            groupMap[g._id.toString()] = g;
        });

        const ledgerGroupMap = {};
        ledgers.forEach(l => {
            const group = groupMap[l.ledgerGroupId?.toString()];
            if (group) {
                ledgerGroupMap[l._id.toString()] = {
                    groupName: group.groupName,
                    nature: group.nature
                };
            }
        });

        const leadMap = {};
        leadsList.forEach(l => {
            leadMap[l._id.toString()] = l;
        });

        const vouchers = await Vouchers.find({}).lean();

        const txns = vouchers.map(v => mapVoucherToLegacy(v, ledgerGroupMap, leadMap));

        let purchases = 0;
        let sales = 0;
        let directExpenses = 0;
        let directIncome = 0;
        let indirectExpenses = 0;
        let indirectIncome = 0;

        vouchers.forEach(v => {
            if (v.legacyMetadata) {
                const amt = parseFloat(v.legacyMetadata.amount) || 0;
                const type = v.legacyMetadata.txn_type;
                const status = v.legacyMetadata.status;
                if (status === "Cancelled") return;

                if (type === "vendor_payment") {
                    purchases += amt;
                } else if (type === "client_invoice_payment") {
                    sales += amt;
                } else if (type === "labour_charge" || type === "freight_cartage") {
                    directExpenses += amt;
                } else if (type === "direct_income") {
                    directIncome += amt;
                } else if (type === "misc_expense") {
                    indirectExpenses += amt;
                } else if (type === "scrap_sale" || type === "misc_income") {
                    indirectIncome += amt;
                }
            } else {
                v.entries.forEach(entry => {
                    const ledId = entry.ledgerId?.toString();
                    const info = ledgerGroupMap[ledId];
                    if (!info) return;

                    const category = getCategoryByGroupName(info.groupName);

                    if (category === "Sales") {
                        sales += (entry.credit || 0) - (entry.debit || 0);
                    } else if (category === "Purchases") {
                        purchases += (entry.debit || 0) - (entry.credit || 0);
                    } else if (category === "Direct Income") {
                        directIncome += (entry.credit || 0) - (entry.debit || 0);
                    } else if (category === "Direct Expenses") {
                        directExpenses += (entry.debit || 0) - (entry.credit || 0);
                    } else if (category === "Indirect Income") {
                        indirectIncome += (entry.credit || 0) - (entry.debit || 0);
                    } else if (category === "Indirect Expenses") {
                        indirectExpenses += (entry.debit || 0) - (entry.credit || 0);
                    }
                });
            }
        });

        const cleared = txns.filter(t => t.status !== "Cancelled");
        const totalPayments = cleared.filter(t => t.direction === "PAYMENT").reduce((s, t) => s + (t.amount || 0), 0);
        const totalReceipts = cleared.filter(t => t.direction === "RECEIPT").reduce((s, t) => s + (t.amount || 0), 0);

        const leadLinkedPayments = cleared.filter(t => t.direction === "PAYMENT" && t.ref_lead_id).reduce((s, t) => s + (t.amount || 0), 0);
        const leadLinkedReceipts = cleared.filter(t => t.direction === "RECEIPT" && t.ref_lead_id).reduce((s, t) => s + (t.amount || 0), 0);

        const byType = {};
        cleared.forEach(t => { byType[t.txn_type] = (byType[t.txn_type] || 0) + (t.amount || 0); });

        const PAYMENT_LABELS = {
            vendor_payment: "Purchases", labour_charge: "Labour", freight_cartage: "Freight",
            advance_employee: "Staff Advance", loan_repayment: "Loan Repayment", misc_expense: "Misc Expenses",
            capital_expense: "Capital Expenses"
        };
        const RECEIPT_LABELS = {
            client_invoice_payment: "Sales Revenue", direct_income: "Direct Income",
            client_advance: "Advances", scrap_sale: "Scrap", loan_received: "Loans", misc_income: "Misc Income"
        };

        const paymentBreakdown = Object.entries(PAYMENT_LABELS).map(([k, l]) => ({ label: l, value: byType[k] || 0 })).filter(i => i.value > 0);
        const receiptBreakdown = Object.entries(RECEIPT_LABELS).map(([k, l]) => ({ label: l, value: byType[k] || 0 })).filter(i => i.value > 0);

        const grossMargin = (sales + directIncome) - (purchases + directExpenses);
        const netProfit = grossMargin + indirectIncome - indirectExpenses;

        const recentTransactions = [...txns].sort((a, b) => new Date(b.txn_date) - new Date(a.txn_date)).slice(0, 10);

        // Calculate pending salary and bills collections
        let pendingSalary = 0;
        let pendingBillsCollections = 0;

        ledgers.forEach(l => {
            const groupInfo = ledgerGroupMap[l._id.toString()];
            const gName = (groupInfo?.groupName || "").toLowerCase();

            if (l.refType === "Staff" || gName === "account payables") {
                if (l.currentBalance < 0) {
                    pendingSalary += Math.abs(l.currentBalance);
                }
            }

            if (gName === "sundry debtors") {
                if (l.currentBalance > 0) {
                    pendingBillsCollections += l.currentBalance;
                }
            }
        });

        res.json({
            success: true,
            data: {
                totalPayments, totalReceipts, netBalance: totalReceipts - totalPayments,
                leadLinkedPayments, leadLinkedReceipts,
                purchases, sales, directExpenses, directIncome, indirectExpenses, indirectIncome, grossMargin, netProfit,
                byType, paymentBreakdown, receiptBreakdown, recentTransactions,
                pendingSalary, pendingBillsCollections
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
        const voucher = await Vouchers.findById(req.params.id);
        if (voucher) {
            const ledgerIds = (voucher.entries || []).map(e => e.ledgerId);
            await Vouchers.findByIdAndDelete(req.params.id);
            await recalculateLedgerBalances(req.tenantModels, ledgerIds);
        } else {
            await Vouchers.findByIdAndDelete(req.params.id);
        }
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
                { "entries.leadId": { $in: leadIds } },
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
                const matchingEntries = (v.entries || []).filter(e => e.leadId && leadIds.some(lid => String(lid) === String(e.leadId)));
                let amt = 0;
                let paymentType = v.voucherType === "Payment" ? "Dr" : "Cr";
                let paymentFromTo = "";

                if (matchingEntries.length > 0) {
                    const totalDr = matchingEntries.reduce((sum, e) => sum + (e.debit || 0), 0);
                    const totalCr = matchingEntries.reduce((sum, e) => sum + (e.credit || 0), 0);
                    if (totalDr > totalCr) {
                        amt = totalDr - totalCr;
                        paymentType = "Dr";
                        const nonMatching = (v.entries || []).filter(e => !e.leadId || !leadIds.some(lid => String(lid) === String(e.leadId)));
                        paymentFromTo = nonMatching.map(e => e.ledgerName).join(", ") || matchingEntries.map(e => e.ledgerName).join(", ");
                    } else {
                        amt = totalCr - totalDr;
                        paymentType = "Cr";
                        const nonMatching = (v.entries || []).filter(e => !e.leadId || !leadIds.some(lid => String(lid) === String(e.leadId)));
                        paymentFromTo = nonMatching.map(e => e.ledgerName).join(", ") || matchingEntries.map(e => e.ledgerName).join(", ");
                    }
                } else {
                    const isPayment = v.voucherType === "Payment";
                    paymentType = isPayment ? "Dr" : "Cr";
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
                }
                return {
                    _id: v._id,
                    voucherDate: v.date,
                    paymentType: paymentType,
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
                const matchingEntries = (v.entries || []).filter(e => e.leadId && leadIds.some(lid => String(lid) === String(e.leadId)));
                const isPayment = v.voucherType === "Payment";
                if (isPayment) {
                    const drMatching = matchingEntries.filter(e => e.debit > 0);
                    if (drMatching.length > 0) {
                        totalCost += drMatching.reduce((sum, e) => sum + (e.debit || 0), 0);
                    } else {
                        const drEntry = (v.entries || []).find(e => e.debit > 0);
                        totalCost += drEntry ? (drEntry.debit || 0) : 0;
                    }
                } else {
                    const crMatching = matchingEntries.filter(e => e.credit > 0);
                    if (crMatching.length > 0) {
                        totalRevenue += crMatching.reduce((sum, e) => sum + (e.credit || 0), 0);
                    } else {
                        const crEntry = (v.entries || []).find(e => e.credit > 0);
                        totalRevenue += crEntry ? (crEntry.credit || 0) : 0;
                    }
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

exports.getEmployeeLedgerById = async (req, res) => {
    try {
        const { Vouchers, Ledgers, Employees } = req.tenantModels;
        const employeeId = req.params.id;

        let employeeDoc = await Employees.findOne({
            $or: [{ _id: employeeId }, { user_id: employeeId }]
        }).lean();

        let targetRefId = employeeDoc ? employeeDoc._id : employeeId;

        let ledgerDoc = await Ledgers.findOne({ refId: targetRefId }).lean();
        let vouchers = [];

        if (ledgerDoc) {
            vouchers = await Vouchers.find({ "entries.ledgerId": ledgerDoc._id }).sort({ date: 1 }).lean();
        }

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
        console.error("🔴 getEmployeeLedgerById Error:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Dummy exports for unused endpoints
exports.getTransactionsByLead = async (req, res) => res.json({ success: true, data: [] });
exports.getTransaction = async (req, res) => res.json({ success: true, data: {} });
exports.updateTransaction = async (req, res) => res.json({ success: true, data: {} });
exports.createVoucher = async (req, res) => res.json({ success: true, data: {} });
