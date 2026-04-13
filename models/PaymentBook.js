const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// 💰  Payment Book — Hub-and-Spoke multi-tenant schema
//
//  PAYMENT directions  (money going OUT of company):
//    vendor_payment    – Material / goods payment to vendor/supplier
//    labour_charge     – Installation & labour charges to employees
//    freight_cartage   – Freight/cartage to transporters
//    advance_employee  – Advance given to employee
//    loan_repayment    – Repayment of loan to friends/family
//    misc_expense      – Any other miscellaneous outgoing
//
//  RECEIPT directions  (money coming IN to company):
//    client_invoice_payment – Client pays against a Tax Invoice
//    client_advance        – Advance received from client (before invoice)
//    scrap_sale            – Sale of scraps / salvage material
//    loan_received         – Loan taken from friends/family
//    misc_income           – Any other miscellaneous income
// ─────────────────────────────────────────────────────────────────────────────

const PAYMENT_TYPES = [
    "vendor_payment",
    "labour_charge",
    "freight_cartage",
    "advance_employee",
    "loan_repayment",
    "misc_expense",
    "capital_expense",
];

const RECEIPT_TYPES = [
    "client_invoice_payment",
    "client_advance",
    "scrap_sale",
    "loan_received",
    "misc_income",
    "direct_income",
];

const ALL_TXNS = [...PAYMENT_TYPES, ...RECEIPT_TYPES];

const transactionSchema = new mongoose.Schema(
    {
        // ── Core fields ──
        txn_number:   { type: String, trim: true, index: true },
        txn_type:     { type: String, enum: ALL_TXNS, required: true },
        direction:    { type: String, enum: ["PAYMENT", "RECEIPT"], required: true },
        amount:       { type: Number, required: true, min: 0 },
        txn_date:     { type: Date, default: Date.now },

        // ── Counter-party ──
        party_name:   { type: String, trim: true },      // vendor / employee / transporter / client / friend
        party_type:   { type: String, trim: true },      // "Vendor" | "Employee" | "Transporter" | "Client" | "Other"
        party_ref_id: { type: mongoose.Schema.Types.ObjectId }, // optional link to vendor / lead doc

        // ── Staff reference (employee or transporter from StaffBook) ──
        staff_ref_id: { type: mongoose.Schema.Types.ObjectId }, // linked employee / transporter _id
        staff_type:   { type: String, enum: ["employee", "transporter"] }, // which collection
        staff_name:   { type: String, trim: true },              // denormalised name for display
        staff_role:   { type: String, trim: true },              // denormalised role/vehicle_type

        // ── Contact / Party Ledger reference (friend, family, freelancer, money-lender…) ──
        // Identified primarily by mobile. contact_ref_id links to StaffBook.contacts[]._id
        contact_ref_id: { type: mongoose.Schema.Types.ObjectId }, // link to contacts[] sub-doc
        contact_mobile: { type: String, trim: true, index: true }, // mobile for quick ledger lookup
        contact_name:   { type: String, trim: true },              // denormalised for display
        contact_type:   { type: String, trim: true },              // "Friend"|"Family"|"Money Lender"…

        // ── Reference docs ──
        ref_invoice_no:  { type: String, trim: true },   // invoice paid against
        ref_po_no:       { type: String, trim: true },   // PO / work-order reference
        ref_lead_id:     { type: mongoose.Schema.Types.ObjectId }, // linked lead/project

        // ── Payment mode ──
        payment_mode: {
            type: String,
            enum: ["Cash", "Cheque", "NEFT", "RTGS", "IMPS", "UPI", "Credit Card", "Debit Card", "Other"],
            default: "Cash",
        },
        bank_name:    { type: String, trim: true },
        cheque_no:    { type: String, trim: true },
        utr_ref:      { type: String, trim: true }, // UTR / UPI Ref

        // ── Status / Reconciliation ──
        status: {
            type: String,
            enum: ["Pending", "Cleared", "Bounced", "Cancelled"],
            default: "Cleared",
        },

        // ── Project / Work context ──
        project_name: { type: String, trim: true },
        description:  { type: String, trim: true },

        // ── Attachments / receipts ──
        attachment_url: { type: String, trim: true },

        // ── GST (for vendor payments with tax invoice) ──
        taxable_amount: { type: Number, default: 0 },
        gst_amount:     { type: Number, default: 0 },
        tds_amount:     { type: Number, default: 0 },

        // ── Recorded by ──
        recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
    },
    { _id: true, timestamps: true }
);

// ── Per-corporate book ──
const paymentBookSchema = new mongoose.Schema(
    {
        financial_year: { type: String, trim: true },
        transactions:   [transactionSchema],
    },
    { _id: false }
);

// ── Hub (one document per corpAdminId) ──
const PaymentBookHubSchema = new mongoose.Schema(
    {
        _id: { type: mongoose.Schema.Types.ObjectId, required: true },
        corporateData: {
            type: Map,
            of: paymentBookSchema,
            default: {},
        },
    },
    { timestamps: true }
);

const PaymentBook =
    mongoose.models.PaymentBook ||
    mongoose.model("PaymentBook", PaymentBookHubSchema);

module.exports = { PaymentBook, PAYMENT_TYPES, RECEIPT_TYPES, ALL_TXNS };
