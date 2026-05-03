const { PaymentBook, PAYMENT_TYPES, RECEIPT_TYPES } = require("../models/PaymentBook");
const { LeadsLedgers } = require("../models/LeadsLedgers");
const mongoose = require("mongoose");
const { resolveDatePreset } = require("../utils/dateUtils");

// ─────────────────────────────────────────────────────────────────────────────
// LEAD-LINKED txn types — when these are recorded, a voucher is also posted
// into the matched lead's finance ledger for full audit trail.
//
//  PAYMENT types that credit the lead cost ledger (DR — money leaves company):
//    vendor_payment   → paymentFromTo: "Materials"
//    labour_charge    → paymentFromTo: "Labour"
//    freight_cartage  → paymentFromTo: "Materials"   (freight is a material cost)
//
//  RECEIPT types that credit the lead revenue ledger (CR — money enters company):
//    client_invoice_payment → paymentFromTo: "Client"
//    client_advance         → paymentFromTo: "Client"
// ─────────────────────────────────────────────────────────────────────────────

const LEAD_PAYMENT_MAP = {
    vendor_payment:          { paymentType: "Dr", paymentFromTo: "Materials" },
    labour_charge:           { paymentType: "Dr", paymentFromTo: "Labour"    },
    freight_cartage:         { paymentType: "Dr", paymentFromTo: "Materials" },
    client_invoice_payment:  { paymentType: "Cr", paymentFromTo: "Client"    },
    client_advance:          { paymentType: "Cr", paymentFromTo: "Client"    },
};

// txn_types that REQUIRE a lead link
// Note: advance_employee and freight_cartage do NOT require a lead —
// they can be linked to a staff member or stand alone as overhead.
const LEAD_REQUIRED_TYPES = new Set([
    "vendor_payment", "labour_charge",
    "client_invoice_payment", "client_advance",
]);

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve / create PaymentBook hub + corporate slot */
async function getHub(corpAdminId, corporateId) {
    if (!corpAdminId || !corporateId) throw new Error("Corporate identity missing.");
    const id = new mongoose.Types.ObjectId(corpAdminId);
    let hub = await PaymentBook.findById(id);
    if (!hub) hub = new PaymentBook({ _id: id, corporateData: new Map() });
    if (!hub?.corporateData?.has?.(corporateId)) {
        hub?.corporateData?.set?.(corporateId, { transactions: [] });
    }
    return hub;
}

/** Sequential txn numbering — PAY/2025-26/00001 or REC/2025-26/00001 */
async function generateTxnNumber(corpAdminId, corporateId, direction, txn_date) {
    const d = txn_date ? new Date(txn_date) : new Date();
    const yr =
        d.getMonth() >= 3
            ? `${d.getFullYear()}-${String(d.getFullYear() + 1).slice(2)}`
            : `${d.getFullYear() - 1}-${String(d.getFullYear()).slice(2)}`;
    const prefix = direction === "PAYMENT" ? "PAY" : "REC";

    const hub = await PaymentBook.findById(new mongoose.Types.ObjectId(corpAdminId)).lean();
    const cid = corporateId?.toString();
    const record = hub?.corporateData instanceof Map
        ? hub?.corporateData?.get?.(cid)
        : hub?.corporateData?.[cid];

    const existing = (record?.transactions || [])
        .filter(t => t.direction === direction && t.txn_number?.includes(yr))
        .map(t => t.txn_number);

    let seq = 1;
    if (existing.length > 0) {
        existing.sort();
        const last = existing[existing.length - 1];
        seq = (parseInt(last.split("/").pop(), 10) || 0) + 1;
    }
    return `${prefix}/${yr}/${String(seq).padStart(5, "0")}`;
}

/** Resolve direction from txn_type */
function resolveDirection(txn_type) {
    if (PAYMENT_TYPES.includes(txn_type)) return "PAYMENT";
    if (RECEIPT_TYPES.includes(txn_type)) return "RECEIPT";
    throw new Error(`Unknown txn_type: ${txn_type}`);
}

/**
 * Post a Dr/Cr voucher into the lead's finance ledger when a payment is
 * linked to a lead.  This keeps the per-lead P&L ledger in sync with the
 * central PaymentBook.
 */
async function postLeadVoucher(corpAdminId, corporateId, leadId, txnData) {
    try {
        const mapping = LEAD_PAYMENT_MAP[txnData.txn_type];
        if (!mapping || !leadId) return; // not a lead-linked type

        const hub = await LeadsLedgers.findById(corpAdminId);
        if (!hub) return;

        const cid = corporateId?.toString();
        const corpEntry = hub?.corporateData instanceof Map
            ? hub?.corporateData?.get?.(cid)
            : hub?.corporateData?.[cid];
        if (!corpEntry) return;

        const lead = corpEntry.leads.id(leadId.toString());
        if (!lead) return;

        // Build narration from txnData
        const narration = [
            txnData.txn_number,
            txnData.party_name ? `– ${txnData.party_name}` : "",
            txnData.description ? `| ${txnData.description}` : "",
            txnData.payment_mode ? `via ${txnData.payment_mode}` : "",
        ].filter(Boolean).join(" ");

        lead.ledger.push({
            voucherDate:     txnData.txn_date || new Date(),
            paymentType:     mapping.paymentType,           // "Dr" | "Cr"
            voucherAmount:   { value: txnData.amount, currency: "INR" },
            voucherNarration: narration,
            paymentFromTo:   mapping.paymentFromTo,         // "Materials"|"Labour"|"Client"
        });

        hub.markModified("corporateData");
        await hub.save();
    } catch (e) {
        // Non-fatal — log and continue; PaymentBook record is already saved
        console.error("[paymentController] postLeadVoucher error:", e.message);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET LEADS FOR PICKER
//   Returns a minimal list of leads (Accepted + Tax Invoice status) so the
//   Finance form can let users pick which project/lead a payment belongs to.
// ─────────────────────────────────────────────────────────────────────────────
exports.getLeadsForPicker = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;

        const hub = await LeadsLedgers.findById(corpAdminId).lean();
        const cid = corporateId?.toString();
        const corpEntry = hub?.corporateData instanceof Map
            ? hub?.corporateData?.get?.(cid)
            : hub?.corporateData?.[cid];

        const allLeads = corpEntry?.leads || [];

        // Return leads that are project-active (Accepted | Tax Invoice | Engaged)
        const ACTIVE_STATUSES = new Set(["Engaged", "Accepted", "Tax Invoice"]);
        const picker = allLeads
            .filter(l => ACTIVE_STATUSES.has(l.status))
            .map(l => ({
                _id:          l._id,
                lead_no:      l.lead_no,
                sender_name:  l.sender_name,
                sender_mobile: l.sender_mobile,
                product_name: l.product_name,
                status:       l.status,
                // Compute cumulative ledger totals for quick display
                totalPaid:    (l.ledger || []).filter(e => e.paymentType === "Dr").reduce((s, e) => s + (parseFloat(e.voucherAmount?.value) || 0), 0),
                totalReceived:(l.ledger || []).filter(e => e.paymentType === "Cr").reduce((s, e) => s + (parseFloat(e.voucherAmount?.value) || 0), 0),
            }))
            .sort((a, b) => (b.lead_no || 0) - (a.lead_no || 0));

        res.json({ success: true, data: picker });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE LEAD LEDGER  (all finance entries for one lead)
// ─────────────────────────────────────────────────────────────────────────────
exports.getLeadLedger = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const { leadId } = req.params;

        const hub = await LeadsLedgers.findById(corpAdminId).lean();
        const cid = corporateId?.toString();
        const corpEntry = hub?.corporateData instanceof Map
            ? hub?.corporateData?.get?.(cid)
            : hub?.corporateData?.[cid];

        const lead = (corpEntry?.leads || []).find(l => l._id.toString() === leadId);
        if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

        const ledger = lead.ledger || [];
        const totalCost    = ledger.filter(e => e.paymentType === "Dr").reduce((s, e) => s + (parseFloat(e.voucherAmount?.value) || 0), 0);
        const totalRevenue = ledger.filter(e => e.paymentType === "Cr").reduce((s, e) => s + (parseFloat(e.voucherAmount?.value) || 0), 0);

        res.json({
            success: true,
            data: {
                lead_no:      lead.lead_no,
                sender_name:  lead.sender_name,
                product_name: lead.product_name,
                status:       lead.status,
                ledger,
                totalCost,
                totalRevenue,
                grossMargin:  totalRevenue - totalCost,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET TRANSACTIONS BY LEAD  (from PaymentBook, filtered by ref_lead_id)
// ─────────────────────────────────────────────────────────────────────────────
exports.getTransactionsByLead = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const { leadId } = req.params;

        const hub = await PaymentBook.findById(new mongoose.Types.ObjectId(corpAdminId)).lean();
        const cid = corporateId?.toString();
        const record = hub?.corporateData instanceof Map
            ? hub?.corporateData?.get?.(cid)
            : hub?.corporateData?.[cid];

        if (!record) return res.json({ success: true, data: [] });

        const txns = (record.transactions || [])
            .filter(t => t.ref_lead_id?.toString() === leadId)
            .sort((a, b) => new Date(b.txn_date) - new Date(a.txn_date));

        res.json({ success: true, data: txns });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE TRANSACTION
// ─────────────────────────────────────────────────────────────────────────────
exports.createTransaction = async (req, res) => {
    try {
        const corporateId = req.body.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;

        const txnData = { ...req.body };
        delete txnData.corporateId;

        // Validate: lead-required types must have ref_lead_id
        if (LEAD_REQUIRED_TYPES.has(txnData.txn_type) && !txnData.ref_lead_id) {
            return res.status(400).json({
                success: false,
                message: `Transaction type "${txnData.txn_type}" must be linked to a lead/project. Please select a lead.`,
            });
        }

        // Resolve direction
        txnData.direction = resolveDirection(txnData.txn_type);

        // Auto-number
        if (!txnData.txn_number) {
            txnData.txn_number = await generateTxnNumber(
                corpAdminId, corporateId, txnData.direction, txnData.txn_date
            );
        }

        txnData.recorded_by = req.user?._id;

        // Save to PaymentBook
        const hub = await getHub(corpAdminId, corporateId);
        const record = hub?.corporateData?.get?.(corporateId);
        record.transactions.push(txnData);
        await hub.save();

        const saved = record.transactions[record.transactions.length - 1];

        // ── Mirror into lead ledger (async, non-blocking for response) ──
        if (txnData.ref_lead_id && LEAD_PAYMENT_MAP[txnData.txn_type]) {
            postLeadVoucher(corpAdminId, corporateId, txnData.ref_lead_id, saved.toObject())
                .catch(e => console.error("[postLeadVoucher]", e.message));
        }

        res.status(201).json({ success: true, data: saved.toObject() });
    } catch (err) {
        res.status(err.name === "ValidationError" ? 400 : 500).json({
            success: false,
            message: err.message,
        });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// LIST TRANSACTIONS  (filter by direction / txn_type / date range / leadId)
// ─────────────────────────────────────────────────────────────────────────────
exports.listTransactions = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const { direction, txn_type, status, from_date, to_date, party_name, ref_lead_id, limit, skip } = req.query;

        const hub = await PaymentBook.findById(new mongoose.Types.ObjectId(corpAdminId)).lean();
        const cid = corporateId?.toString();
        const record = hub?.corporateData instanceof Map
            ? hub?.corporateData?.get?.(cid)
            : hub?.corporateData?.[cid];

        if (!record) return res.json({ success: true, data: [], total: 0 });

        let txns = record.transactions || [];

        if (direction)    txns = txns.filter(t => t.direction === direction);
        if (txn_type)     txns = txns.filter(t => t.txn_type === txn_type);
        if (status)       txns = txns.filter(t => t.status === status);
        if (ref_lead_id)  txns = txns.filter(t => t.ref_lead_id?.toString() === ref_lead_id);
        if (party_name)   txns = txns.filter(t => t.party_name?.toLowerCase().includes(party_name.toLowerCase()));
        if (from_date) {
            const d = resolveDatePreset(from_date);
            if (d instanceof Date && !isNaN(d.getTime())) txns = txns.filter(t => new Date(t.txn_date) >= d);
        }
        if (to_date) {
            const d = resolveDatePreset(to_date);
            if (d instanceof Date && !isNaN(d.getTime())) txns = txns.filter(t => new Date(t.txn_date) <= d);
        }

        txns.sort((a, b) => new Date(b.txn_date) - new Date(a.txn_date));

        const totalCount = txns.length;
        const skipN  = parseInt(skip  || "0",  10);
        const limitN = parseInt(limit || "50", 10);
        txns = txns.slice(skipN, skipN + limitN);

        res.json({ success: true, data: txns, total: totalCount });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET SINGLE TRANSACTION
// ─────────────────────────────────────────────────────────────────────────────
exports.getTransaction = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const { id } = req.params;

        const hub = await PaymentBook.findById(new mongoose.Types.ObjectId(corpAdminId)).lean();
        const cid = corporateId?.toString();
        const record = hub?.corporateData instanceof Map
            ? hub?.corporateData?.get?.(cid)
            : hub?.corporateData?.[cid];

        const txn = record?.transactions?.find(t => t._id.toString() === id);
        if (!txn) return res.status(404).json({ success: false, message: "Transaction not found" });

        res.json({ success: true, data: txn });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE TRANSACTION
// ─────────────────────────────────────────────────────────────────────────────
exports.updateTransaction = async (req, res) => {
    try {
        const corporateId = req.body.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const { id } = req.params;

        const hub = await getHub(corpAdminId, corporateId);
        const record = hub?.corporateData?.get?.(corporateId);
        const txnDoc = record.transactions.id(id);

        if (!txnDoc) return res.status(404).json({ success: false, message: "Transaction not found" });

        const updates = { ...req.body };
        delete updates.corporateId;
        delete updates.txn_number; // immutable
        delete updates.direction;  // derived

        Object.keys(updates).forEach(k => { txnDoc[k] = updates[k]; });

        await hub.save();
        res.json({ success: true, data: txnDoc.toObject() });
    } catch (err) {
        res.status(err.name === "ValidationError" ? 400 : 500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE TRANSACTION
// ─────────────────────────────────────────────────────────────────────────────
exports.deleteTransaction = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const { id } = req.params;

        const hub = await getHub(corpAdminId, corporateId);
        const record = hub?.corporateData?.get?.(corporateId);
        record.transactions.pull({ _id: id });
        await hub.save();

        res.json({ success: true, message: "Transaction deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE SUMMARY  (analytics — now also includes per-lead breakdown)
// ─────────────────────────────────────────────────────────────────────────────
exports.getPaymentSummary = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const { from_date, to_date } = req.query;

        const hub = await PaymentBook.findById(new mongoose.Types.ObjectId(corpAdminId)).lean();
        const cid = corporateId?.toString();
        const record = hub?.corporateData instanceof Map
            ? hub?.corporateData?.get?.(cid)
            : hub?.corporateData?.[cid];

        const empty = {
            totalPayments: 0, totalReceipts: 0, netBalance: 0,
            byType: {}, recentTransactions: [], paymentBreakdown: [], receiptBreakdown: [],
            leadLinkedPayments: 0, leadLinkedReceipts: 0,
        };
        if (!record) return res.json({ success: true, data: empty });

        let txns = record.transactions || [];
        if (from_date) {
            const d = resolveDatePreset(from_date);
            if (d instanceof Date && !isNaN(d.getTime())) txns = txns.filter(t => new Date(t.txn_date) >= d);
        }
        if (to_date) {
            const d = resolveDatePreset(to_date);
            if (d instanceof Date && !isNaN(d.getTime())) txns = txns.filter(t => new Date(t.txn_date) <= d);
        }

        const cleared = txns.filter(t => t.status !== "Cancelled");

        const totalPayments = cleared.filter(t => t.direction === "PAYMENT").reduce((s, t) => s + (t.amount || 0), 0);
        const totalReceipts = cleared.filter(t => t.direction === "RECEIPT").reduce((s, t) => s + (t.amount || 0), 0);

        // Lead-linked sub-totals
        const leadLinkedPayments = cleared.filter(t => t.direction === "PAYMENT" && t.ref_lead_id).reduce((s, t) => s + (t.amount || 0), 0);
        const leadLinkedReceipts = cleared.filter(t => t.direction === "RECEIPT" && t.ref_lead_id).reduce((s, t) => s + (t.amount || 0), 0);

        const byType = {};
        cleared.forEach(t => {
            byType[t.txn_type] = (byType[t.txn_type] || 0) + (t.amount || 0);
        });

        const PAYMENT_LABELS = {
            vendor_payment:   "Purchases",
            labour_charge:    "Labour / Sub-contract",
            freight_cartage:  "Freight & Cartage",
            advance_employee: "Advance to Employees",
            loan_repayment:   "Loan Repayments",
            misc_expense:     "Indirect Expenses",
            capital_expense:  "Capital Expenses",
        };
        const RECEIPT_LABELS = {
            client_invoice_payment: "Sales Revenue",
            direct_income:          "Direct Income",
            client_advance:         "Client Advances",
            scrap_sale:             "Scrap Sales",
            loan_received:          "Loans Received",
            misc_income:            "Other Income",
        };

        const paymentBreakdown = Object.entries(PAYMENT_LABELS)
            .map(([key, label]) => ({ label, value: byType[key] || 0 }))
            .filter(i => i.value > 0);

        const receiptBreakdown = Object.entries(RECEIPT_LABELS)
            .map(([key, label]) => ({ label, value: byType[key] || 0 }))
            .filter(i => i.value > 0);

        // ── P&L / Trading Account Breakdown ──
        const purchases       = byType["vendor_payment"] || 0;
        const sales           = byType["client_invoice_payment"] || 0;
        
        const directExpenses  = (byType["labour_charge"] || 0) + (byType["freight_cartage"] || 0);
        const directIncome    = byType["direct_income"] || 0;
        
        const indirectExpenses = byType["misc_expense"] || 0;
        const indirectIncome   = (byType["scrap_sale"] || 0) + (byType["misc_income"] || 0);

        // Gross Margin (Trading logic)
        const grossMargin = (sales + directIncome) - (purchases + directExpenses);
        // Net Profit (P&L logic)
        const netProfit = grossMargin + indirectIncome - indirectExpenses;

        const recentTransactions = [...txns]
            .sort((a, b) => new Date(b.txn_date) - new Date(a.txn_date))
            .slice(0, 10);

        res.json({
            success: true,
            data: {
                totalPayments, totalReceipts,
                netBalance: totalReceipts - totalPayments,
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
// CREATE VOUCHER (MULTI-ENTRY)
// ─────────────────────────────────────────────────────────────────────────────
exports.createVoucher = async (req, res) => {
    try {
        const corporateId = req.body.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const { date, narration, entries } = req.body;

        if (!entries || !Array.isArray(entries) || entries.length < 2) {
            return res.status(400).json({ success: false, message: "A voucher must have at least two entries." });
        }

        // 1. Validate Balance
        const totalDr = entries.filter(e => e.type === "Dr").reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
        const totalCr = entries.filter(e => e.type === "Cr").reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);

        if (totalDr !== totalCr) {
            return res.status(400).json({ success: false, message: `Voucher is unbalanced. Dr (${totalDr}) != Cr (${totalCr})` });
        }

        const voucherId = req.body.voucherId || `V-${Date.now().toString(36).toUpperCase()}`;
        const hub = await getHub(corpAdminId, corporateId);
        const record = hub?.corporateData?.get?.(corporateId);

        const savedEntries = [];

        // 2. Map and Save individual transactions
        for (const entry of entries) {
            const direction = entry.type === "Dr" ? "RECEIPT" : "PAYMENT";
            const txn_number = await generateTxnNumber(corpAdminId, corporateId, direction, date);

            const txnData = {
                txn_number,
                txn_type: entry.type === "Dr" ? "misc_income" : "misc_expense", // Generic containers
                direction,
                amount: entry.amount,
                txn_date: date || new Date(),
                party_name: entry.accountName,
                party_type: entry.accountType === "Category" ? "Other" : entry.accountType,
                description: narration,
                voucher_id: voucherId,
                is_voucher: true,
                payment_mode: "Other",
                status: "Cleared",
                recorded_by: req.user?._id,
            };

            // Link Lead/Staff if applicable
            if (entry.accountType === "Lead") txnData.ref_lead_id = entry.accountId;
            if (entry.accountType === "Staff") txnData.staff_ref_id = entry.accountId;

            record.transactions.push(txnData);
            const saved = record.transactions[record.transactions.length - 1];
            savedEntries.push(saved);

            // Mirror to Lead Ledger if linked
            if (txnData.ref_lead_id && LEAD_PAYMENT_MAP[txnData.txn_type]) {
                postLeadVoucher(corpAdminId, corporateId, txnData.ref_lead_id, saved.toObject())
                    .catch(e => console.error("[postLeadVoucher]", e.message));
            }
        }

        await hub.save();

        res.status(201).json({ 
            success: true, 
            message: "Voucher posted successfully", 
            voucherId,
            entriesCount: savedEntries.length 
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

