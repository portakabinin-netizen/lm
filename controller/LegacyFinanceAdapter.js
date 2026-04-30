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
        // Find leads that are "Engaged", "Accepted", or "Tax Invoice"
        const ACTIVE_STATUSES = ["Engaged", "Accepted", "Tax Invoice"];
        const leads = await Leads.find({ status: { $in: ACTIVE_STATUSES } }).lean();

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
        const mappedEmployees = employees.map(e => ({
            _id: e._id, name: e.name, mobile: e.mobile, role: e.role,
            pay_type: "Daily", daily_rate: e.daily_rate
        }));

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
        const newParty = new Parties({
            name: req.body.name,
            mobile: req.body.mobile,
            type: req.body.type === "Supplier" ? "Supplier" : "Client" // Simplified mapping
        });
        await newParty.save();
        res.status(201).json({ success: true, data: { _id: newParty._id, name: newParty.name, mobile: newParty.mobile, type: req.body.type } });
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

        // Auto-create Ledgers for Double Entry
        let cashLedger = await Ledgers.findOne({ name: "Cash" });
        if (!cashLedger) {
            let cashG = await Groups.findOne({ name: "Cash-in-hand" });
            if (!cashG) cashG = await Groups.create({ name: "Cash-in-hand", nature: "Assets" });
            cashLedger = await Ledgers.create({ name: "Cash", groupId: cashG._id, nature: "Dr" });
        }

        let partyLedgerName = txnData.party_name || txnData.txn_type;
        let partyLedger = await ensureLedgerFolioInternal(req.tenantModels, {
            name: partyLedgerName,
            group: direction === "PAYMENT" ? "Sundry Creditors" : "Sundry Debtors",
            nature: direction === "PAYMENT" ? "Cr" : "Dr"
        });

        // Double Entry setup
        const amount = parseFloat(txnData.amount) || 0;
        const entries = [];
        
        if (direction === "PAYMENT") {
            // Debit Party, Credit Cash
            entries.push({ ledgerId: partyLedger._id, ledgerName: partyLedger.name, debit: amount, credit: 0 });
            entries.push({ ledgerId: cashLedger._id, ledgerName: cashLedger.name, debit: 0, credit: amount });
        } else {
            // Debit Cash, Credit Party
            entries.push({ ledgerId: cashLedger._id, ledgerName: cashLedger.name, debit: amount, credit: 0 });
            entries.push({ ledgerId: partyLedger._id, ledgerName: partyLedger.name, debit: 0, credit: amount });
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

        const vouchers = await Vouchers.find({ "legacyMetadata.ref_lead_id": lead._id.toString() }).sort({ date: 1 }).lean();
        
        const ledger = vouchers.map(v => {
            const isPayment = v.legacyMetadata.direction === "PAYMENT";
            return {
                _id: v._id,
                voucherDate: v.date,
                paymentType: isPayment ? "Dr" : "Cr",
                amt: v.legacyMetadata.amount,
                paymentFromTo: v.legacyMetadata.party_name || v.legacyMetadata.staff_name || v.legacyMetadata.txn_type,
                voucherNarration: v.narration || v.legacyMetadata.description
            };
        });

        let totalCost = 0;
        let totalRevenue = 0;
        vouchers.forEach(v => {
            if (v.legacyMetadata.direction === "PAYMENT") totalCost += v.legacyMetadata.amount || 0;
            if (v.legacyMetadata.direction === "RECEIPT") totalRevenue += v.legacyMetadata.amount || 0;
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
        const { Vouchers, Parties } = req.tenantModels;
        const mobile = req.params.mobile;
        
        const party = await Parties.findOne({ mobile }).lean();
        if (!party) return res.json({ success: true, data: { ledger: [] } });

        const vouchers = await Vouchers.find({ "legacyMetadata.contact_mobile": mobile }).sort({ date: 1 }).lean();
        
        const ledger = vouchers.map(v => ({
            _id: v._id,
            voucherDate: v.date,
            paymentType: v.legacyMetadata.direction === "PAYMENT" ? "Dr" : "Cr",
            amt: v.legacyMetadata.amount,
            voucherNarration: v.narration || v.legacyMetadata.description
        }));
        
        res.json({ success: true, data: { ledger } });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Dummy exports for unused endpoints
exports.getTransactionsByLead = async (req, res) => res.json({ success: true, data: [] });
exports.getTransaction = async (req, res) => res.json({ success: true, data: {} });
exports.updateTransaction = async (req, res) => res.json({ success: true, data: {} });
exports.createVoucher = async (req, res) => res.json({ success: true, data: {} });
