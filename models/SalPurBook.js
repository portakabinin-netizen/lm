const mongoose = require("mongoose");
const {
    additionalChargeSchema,
    termsSchema,
    totalsSchema,
    sellerSnapshotSchema,
    buyerBillingSchema,
    buyerShippingSchema,
    multiTenantSchema,
} = require("./sharedSchemas");

// Dedicated Line Item Schema referencing vendor, category, product, and specific rates
const opLineItemSchema = new mongoose.Schema(
    {
        sr_no: { type: Number },

        categoryId: { type: mongoose.Schema.Types.ObjectId },
        productId: { type: mongoose.Schema.Types.ObjectId },
        vendorId: { type: mongoose.Schema.Types.ObjectId },

        hsn_sac: { type: String, trim: true },
        quantity: { type: Number, required: true, min: 0 },
        unit: { type: String, trim: true, default: "PCS" },

        // Context-specific rates as requested
        buy_rate: { type: Number, min: 0 },    // Used for Purchase Order
        sell_rate: { type: Number, min: 0 },   // Used for Quotation/Performa Invoice
        quote_value: { type: Number, min: 0 },   // Used for Tax/Retail Invoice

        discount_percent: { type: Number, default: 0, min: 0, max: 100 },
        taxable_amount: { type: Number, required: true, min: 0 },
        cgst_rate: { type: Number, default: 0 },
        cgst_amount: { type: Number, default: 0 },
        sgst_rate: { type: Number, default: 0 },
        sgst_amount: { type: Number, default: 0 },
        igst_rate: { type: Number, default: 0 },
        igst_amount: { type: Number, default: 0 },
        total_amount: { type: Number, required: true, min: 0 },
    },
    { _id: true }
);

// Part 1 Schema: Offers
const offerSchema = new mongoose.Schema(
    {
        leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Leads" },
        lead_no: { type: Number },
        vendorId: { type: mongoose.Schema.Types.ObjectId },

        quote_number: { type: String, trim: true },
        document_type: {
            type: String,
            enum: ["QUOTATION", "PROFORMA INVOICE"],
            default: "QUOTATION"
        },
        quote_date: { type: Date, default: Date.now },
        validity_date: { type: Date },

        place_of_supply: { type: String, trim: true },
        payment_terms: { type: String, trim: true, default: "Advance" },
        delivery_terms: { type: String, trim: true, default: "Ex-Works" },

        status: { type: String, default: "Draft" },
        revision_count: { type: Number, default: 0 },

        // For Offers, items.sell_rate is used
        items: [opLineItemSchema],
        additional_charges: [additionalChargeSchema],
        totals: totalsSchema,
        terms_and_conditions: termsSchema,

        // Structured snapshots as seen in SavedQuote type
        buyer: {
            billing_address: buyerBillingSchema,
            shipping_address: buyerShippingSchema,
        },
        seller: sellerSnapshotSchema,
    },
    { _id: true, timestamps: true }
);

// Part 2 Schema: Purchase Orders
const purchaseOrderSchema = new mongoose.Schema(
    {
        leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Leads" },
        lead_no: { type: Number },
        vendorId: { type: mongoose.Schema.Types.ObjectId, required: true },

        po_number: { type: String, trim: true },
        po_date: { type: Date, default: Date.now },
        delivery_date: { type: Date },

        payment_terms: { type: String, trim: true },
        delivery_terms: { type: String, trim: true },

        status: { type: String, default: "Issued" },

        // For POs, items.buy_rate is used
        items: [opLineItemSchema],
        additional_charges: [additionalChargeSchema],
        totals: totalsSchema,
        terms_and_conditions: termsSchema,

        // Structured snapshots
        buyer: {
            billing_address: buyerBillingSchema,
            shipping_address: buyerShippingSchema,
        },
        seller: sellerSnapshotSchema,
    },
    { _id: true, timestamps: true }
);

// Part 3 Schema: Tax & Retail Invoice
const invoiceSchema = new mongoose.Schema(
    {
        leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Leads" },
        lead_no: { type: Number },
        vendorId: { type: mongoose.Schema.Types.ObjectId },

        invoice_number: { type: String, trim: true },
        invoice_date: { type: Date, default: Date.now },
        due_date: { type: Date },

        place_of_supply: { type: String, trim: true },
        payment_terms: { type: String, trim: true, default: "Net 30 Days" },

        status: { type: String, default: "Unpaid" },

        // For Invoices, items.quote_value is used
        items: [opLineItemSchema],
        additional_charges: [additionalChargeSchema],
        totals: totalsSchema,
        terms_and_conditions: termsSchema,

        // Structured snapshots
        buyer: {
            billing_address: buyerBillingSchema,
            shipping_address: buyerShippingSchema,
        },
        seller: sellerSnapshotSchema,
    },
    { _id: true, timestamps: true }
);

const salesBookSchema = new mongoose.Schema(
    {
        // ── Source Lead Reference ──
        // ── Corporate Reference ──
        accessCorporate: multiTenantSchema,

        // ── Financial Year tracking ──
        financial_year: { type: String, trim: true },

        // ── 3 Parts As Requested ──
        quotations: [offerSchema],
        purchaseOrders: [purchaseOrderSchema],
        taxInvoices: [invoiceSchema],

        // ── Metadata ──
        created_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Users",
        },
    },
    {
        timestamps: true,
        toJSON: { getters: true },
    }
);

const SalesBookHubSchema = new mongoose.Schema(
    {
        _id: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },
        // One document can hold all corporate data in a Map
        // Key is the corporateId (string)
        corporateData: {
            type: Map,
            of: salesBookSchema,
            default: {},
        }
    },
    { timestamps: true }
);

// ─────────────────────────────────────────────────────────────────────────────
// 📦  Export
// ─────────────────────────────────────────────────────────────────────────────
const SalesBook = mongoose.models.SalPurBook
    || mongoose.model("SalPurBook", SalesBookHubSchema);

module.exports = { SalesBook };
