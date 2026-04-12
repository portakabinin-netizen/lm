const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// ♻️  Shared sub-schemas  (used by both InquiryQuote and TaxInvoice)
//     Keeping them here avoids circular-require issues since both models
//     need the same structural blocks.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🧱  Seller Snapshot
 * Populated from Users → linkedCorporate at quote / invoice creation time.
 */
const sellerSnapshotSchema = new mongoose.Schema(
    {
        business_name: { type: String, trim: true },      // corporateName
        legal_name:    { type: String, trim: true },      // corporateTagName
        logo:          { type: String, trim: true },      // CorpProfileImage
        address: {
            line1:    { type: String, trim: true },       // corporateAddress
            city:     { type: String, trim: true },
            district: { type: String, trim: true },
            state:    { type: String, trim: true },
            pincode:  { type: String, trim: true },
            country:  { type: String, trim: true, default: "India" },
        },
        contact: {
            email:     { type: String, trim: true, lowercase: true },
            mobile:    { type: String, trim: true },
            telephone: { type: String, trim: true },
        },
        tax_registrations: {
            gstin:             { type: String, trim: true, uppercase: true },
            pan:               { type: String, trim: true, uppercase: true },
            tan:               { type: String, trim: true, uppercase: true },
            cin:               { type: String, trim: true, uppercase: true },
            iec:               { type: String, trim: true, uppercase: true },
            msme_udyam:        { type: String, trim: true, uppercase: true },
            fssai:             { type: String, trim: true },
            drug_license:      { type: String, trim: true },
            import_export_code:{ type: String, trim: true },
        },
        bank_details: {
            bank_name:      { type: String, trim: true },
            branch:         { type: String, trim: true },
            account_number: { type: String, trim: true },
            ifsc_code:      { type: String, trim: true, uppercase: true },
            account_type:   { type: String, trim: true, default: "Current" },
            swift_code:     { type: String, trim: true, uppercase: true },
        },
        authorized_signatory: {
            name:            { type: String, trim: true },
            designation:     { type: String, trim: true },
            signature_label: { type: String, trim: true, default: "Authorised Signatory" },
        },
    },
    { _id: false }
);

/**
 * 🧱  Buyer Billing Snapshot
 * Populated from Leads → sender_* fields at quote / invoice creation time.
 */
const buyerBillingSchema = new mongoose.Schema(
    {
        company_name:   { type: String, trim: true },              // sender_name
        contact_person: { type: String, trim: true },
        city:           { type: String, trim: true },              // sender_city
        state:          { type: String, trim: true },              // sender_state
        mobile:         { type: String, trim: true },              // sender_mobile
        email:          { type: String, trim: true, lowercase: true }, // sender_email
        line1:          { type: String, trim: true },
        line2:          { type: String, trim: true },
        district:       { type: String, trim: true },
        state_code:     { type: String, trim: true },
        pincode:        { type: String, trim: true },
        country:        { type: String, trim: true, default: "India" },
        gstin:          { type: String, trim: true, uppercase: true },
        pan:            { type: String, trim: true, uppercase: true },
    },
    { _id: false }
);

/**
 * 🧱  Buyer Shipping Snapshot
 */
const buyerShippingSchema = new mongoose.Schema(
    {
        company_name:   { type: String, trim: true },
        contact_person: { type: String, trim: true },
        line1:          { type: String, trim: true },
        line2:          { type: String, trim: true },
        city:           { type: String, trim: true },
        district:       { type: String, trim: true },
        state:          { type: String, trim: true },
        state_code:     { type: String, trim: true },
        pincode:        { type: String, trim: true },
        country:        { type: String, trim: true, default: "India" },
        mobile:         { type: String, trim: true },
        same_as_billing:{ type: Boolean, default: false },
    },
    { _id: false }
);

/**
 * 🧱  Line Item  (one row in the items table)
 * Identical in both Quote and Invoice — GST split into CGST/SGST/IGST.
 */
const lineItemSchema = new mongoose.Schema(
    {
        sr_no:            { type: Number },
        item_code:        { type: String, trim: true },
        description:      { type: String, trim: true, required: true },
        hsn_sac:          { type: String, trim: true },
        batch_no:         { type: String, trim: true },
        expiry_date:      { type: Date },
        quantity:         { type: Number, required: true, min: 0 },
        unit:             { type: String, trim: true, default: "PCS" },
        rate:             { type: Number, required: true, min: 0 },    // per-unit price
        discount_percent: { type: Number, default: 0, min: 0, max: 100 },
        discount_amount:  { type: Number, default: 0, min: 0 },
        taxable_amount:   { type: Number, required: true, min: 0 },
        cgst_rate:        { type: Number, default: 0 },
        cgst_amount:      { type: Number, default: 0 },
        sgst_rate:        { type: Number, default: 0 },
        sgst_amount:      { type: Number, default: 0 },
        igst_rate:        { type: Number, default: 0 },
        igst_amount:      { type: Number, default: 0 },
        cess_rate:        { type: Number, default: 0 },
        cess_amount:      { type: Number, default: 0 },
        total_amount:     { type: Number, required: true, min: 0 },
    },
    { _id: true }
);

/**
 * 🧱  Additional Charges  (freight, packing, insurance …)
 */
const additionalChargeSchema = new mongoose.Schema(
    {
        label:   { type: String, trim: true, required: true },
        amount:  { type: Number, required: true, min: 0 },
        taxable: { type: Boolean, default: false },
        hsn:     { type: String, trim: true },
    },
    { _id: false }
);

/**
 * 🧱  Terms & Conditions  (array of plain-text lines)
 */
const termsSchema = new mongoose.Schema(
    { items: [{ type: String, trim: true }] },
    { _id: false }
);

/**
 * 🧱  Totals block  (shared structure for both Quote and Invoice)
 */
const totalsSchema = new mongoose.Schema(
    {
        subtotal:           { type: Number, default: 0 },  // before discount
        total_discount:     { type: Number, default: 0 },
        taxable_amount:     { type: Number, default: 0 },
        total_cgst:         { type: Number, default: 0 },
        total_sgst:         { type: Number, default: 0 },
        total_igst:         { type: Number, default: 0 },
        total_cess:         { type: Number, default: 0 },
        total_tax:          { type: Number, default: 0 },
        additional_charges: { type: Number, default: 0 },
        round_off:          { type: Number, default: 0 },
        grand_total:        { type: Number, default: 0 },
        amount_in_words:    { type: String, trim: true },
    },
    { _id: false }
);

/**
 * 🧱  Multi-Tenant / Corporate Identity Block
 * Used across multiple models to keep IDs nested and organized.
 */
const multiTenantSchema = new mongoose.Schema(
    {
        corporateId: { 
            type:  mongoose.Schema.Types.ObjectId,
            index: true
        },
    },
    { _id: false }
);

module.exports = {
    sellerSnapshotSchema,
    buyerBillingSchema,
    buyerShippingSchema,
    lineItemSchema,
    additionalChargeSchema,
    termsSchema,
    totalsSchema,
    multiTenantSchema,
};
