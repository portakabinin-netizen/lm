const mongoose = require("mongoose");
const {
    lineItemSchema,
    additionalChargeSchema,
    termsSchema,
    totalsSchema,
    multiTenantSchema,
} = require("./sharedSchemas");

// ─────────────────────────────────────────────────────────────────────────────
// 📄  Tax Summary Row  (one row per HSN/SAC)
// ─────────────────────────────────────────────────────────────────────────────
const taxSummaryRowSchema = new mongoose.Schema(
    {
        hsn_sac:        { type: String, trim: true },
        taxable_value:  { type: Number, default: 0 },
        cgst_rate:      { type: Number, default: 0 },
        cgst_amount:    { type: Number, default: 0 },
        sgst_rate:      { type: Number, default: 0 },
        sgst_amount:    { type: Number, default: 0 },
        igst_rate:      { type: Number, default: 0 },
        igst_amount:    { type: Number, default: 0 },
        cess_amount:    { type: Number, default: 0 },
        total_tax:      { type: Number, default: 0 },
    },
    { _id: false }
);

// ─────────────────────────────────────────────────────────────────────────────
// 🧾  Main Tax Invoice Schema
// ─────────────────────────────────────────────────────────────────────────────
const invoiceSchema = new mongoose.Schema(
    {
        // ── Ownership / Tenancy ───────────────────────────────────────────────
        accessCorporate: multiTenantSchema,

        // ── Source Lead Reference ─────────────────────────────────────────────
        leadId: {
            type:  mongoose.Schema.Types.ObjectId,
            ref:   "Leads",
            index: true,
        },
        lead_no: { type: Number },                     // denormalised for display

        // ── Linked Quote (optional — invoice generated from a quote) ──────────
        quoteId: {
            type:  mongoose.Schema.Types.ObjectId,
            ref:   "SalesBook",
            index: true,
        },

        // ── Document Identity ─────────────────────────────────────────────────
        document_type: {
            type:    String,
            trim:    true,
            default: "TAX INVOICE",
            enum:    ["TAX INVOICE", "PROFORMA INVOICE", "CREDIT NOTE", "DEBIT NOTE", "DELIVERY CHALLAN"],
        },
        invoice_number:  { type: String, trim: true, unique: true, sparse: true },
        invoice_date:    { type: Date, default: Date.now },
        due_date:        { type: Date },
        financial_year:  { type: String, trim: true },   // e.g. "2025-26"

        // ── Reference Numbers ─────────────────────────────────────────────────
        purchase_order_number:    { type: String, trim: true },
        purchase_order_date:      { type: Date },
        delivery_challan_number:  { type: String, trim: true },
        e_way_bill_number:        { type: String, trim: true },
        e_invoice_irn:            { type: String, trim: true },

        // ── Supply Details ────────────────────────────────────────────────────
        place_of_supply:            { type: String, trim: true },
        reverse_charge_applicable:  { type: Boolean, default: false },
        payment_terms:              { type: String, trim: true, default: "Net 30 Days" },

        // ── Seller information ────────────────────────────────────────────────
        seller: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true },

        // ── Buyer information ─────────────────────────────────────────────────
        buyer: { type: mongoose.Schema.Types.ObjectId, ref: "Leads", required: true },

        // ── Line Items ────────────────────────────────────────────────────────
        items: {
            type:     [lineItemSchema],
            required: true,
            validate: {
                validator: (v) => Array.isArray(v) && v.length > 0,
                message:   "Invoice must have at least one line item.",
            },
        },

        // ── Additional Charges ────────────────────────────────────────────────
        additional_charges: { type: [additionalChargeSchema], default: [] },

        // ── Tax Summary ───────────────────────────────────────────────────────
        tax_summary: { type: [taxSummaryRowSchema], default: [] },

        // ── Totals ────────────────────────────────────────────────────────────
        totals: { type: totalsSchema },

        // ── Terms & Conditions ────────────────────────────────────────────────
        terms_and_conditions: { type: termsSchema },

        // ── Footer / Declaration ──────────────────────────────────────────────
        footer: {
            declaration:     { type: String, trim: true },
            for_label:       { type: String, trim: true },
            signature_label: { type: String, trim: true, default: "Authorised Signatory" },
        },

        // ── Print / Display Settings ──────────────────────────────────────────
        print_settings: {
            paper_size:   { type: String, trim: true, default: "A4" },
            orientation:  { type: String, trim: true, enum: ["portrait", "landscape"], default: "portrait" },
            color_theme: {
                primary:   { type: String, trim: true, default: "#1a3c6b" },
                secondary: { type: String, trim: true, default: "#f0f4f8" },
                border:    { type: String, trim: true, default: "#cccccc" },
                text:      { type: String, trim: true, default: "#222222" },
            },
            show_logo:      { type: Boolean, default: true },
            logo_position:  { type: String, trim: true, enum: ["left", "center", "right"], default: "left" },
            copies: {
                type:    [String],
                default: ["Original for Buyer", "Duplicate for Transporter", "Triplicate for Seller"],
            },
        },

        // ── Status & Workflow ─────────────────────────────────────────────────
        status: {
            type:    String,
            trim:    true,
            enum:    ["Draft", "Issued", "Sent", "Paid", "Partially Paid", "Overdue", "Cancelled", "Void"],
            default: "Draft",
            index:   true,
        },
        cancelled_reason: { type: String, trim: true },
        created_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref:  "Users",
        },
    },
    {
        timestamps:           true,
        toJSON: { getters: true },
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// 🔁  Auto-generate invoice_number before save  (INV/YYYY-YY/00001)
// ─────────────────────────────────────────────────────────────────────────────
invoiceSchema.pre("save", async function (next) {
    if (!this.isNew || this.invoice_number) return next();

    const d  = this.invoice_date ? new Date(this.invoice_date) : new Date();
    const yr = d.getMonth() >= 3
        ? `${d.getFullYear()}-${String(d.getFullYear() + 1).slice(2)}`
        : `${d.getFullYear() - 1}-${String(d.getFullYear()).slice(2)}`;

    this.financial_year = yr;

    // NOTE: In the Hub-and-Spoke model, sequence generation is typically handled
    // by the controller before pushing the subdocument (e.g., generateInvoiceNumber).
    // If we need to find the last sequence here, we need to inspect the parent document.
    const parent = this.ownerDocument ? this.ownerDocument() : null;
    let seq = 1;

    if (parent && this.accessCorporate?.corporateId) {
        const corpIdStr = this.accessCorporate.corporateId.toString();
        const corpData = parent.corporateData instanceof Map ? parent.corporateData.get(corpIdStr) : parent.corporateData[corpIdStr];
        
        if (corpData && corpData.invoices) {
            const allInvoices = corpData.invoices
                .filter(i => i.invoice_number && i.invoice_number.includes(yr))
                .map(i => i.invoice_number);

            if (allInvoices.length > 0) {
                allInvoices.sort();
                const lastNum = allInvoices[allInvoices.length - 1];
                const parts = lastNum.split("/");
                seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
            }
        }
    }

    this.invoice_number = `INV/${yr}/${String(seq).padStart(5, "0")}`;
    next();
});

// ─────────────────────────────────────────────────────────────────────────────
// 🧱  Corporate Invoices Hub Schema
// ─────────────────────────────────────────────────────────────────────────────
const corporateInvoicesSchema = new mongoose.Schema(
    {
        invoices: {
            type: [invoiceSchema],
            default: []
        }
    },
    { _id: false }
);

const TaxInvoiceHubSchema = new mongoose.Schema(
    {
        _id: { type: mongoose.Schema.Types.ObjectId, required: true },
        corporateData: {
            type: Map,
            of: corporateInvoicesSchema,
            default: {},
        },
    },
    { timestamps: true }
);

// ─────────────────────────────────────────────────────────────────────────────
// 📦  Export
// ─────────────────────────────────────────────────────────────────────────────
const Invoices = mongoose.models.Invoices || mongoose.model("Invoices", TaxInvoiceHubSchema);
module.exports = { Invoices };