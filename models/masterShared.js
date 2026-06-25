const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// ♻️  Master Shared Schemas (High-Fidelity)
//     Derived from sharedSchemas.js for safety, expanded for detailed masters.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🧱  Standard Address Schema
 */
const fullAddressSchema = new mongoose.Schema(
    {
        line1: { type: String, trim: true },
        city: { type: String, trim: true },
        district: { type: String, trim: true },
        state: { type: String, trim: true },
        pincode: { type: String, trim: true },
        country: { type: String, trim: true, default: "India" },
        lat: { type: Number },
        long: { type: Number },
    },
    { _id: false }
);

/**
 * 🧱  Detailed Bank Account Schema
 */
const bankAccountSchema = new mongoose.Schema(
    {
        bank_name: { type: String, trim: true },
        branch: { type: String, trim: true },
        account_number: { type: String, trim: true },
        ifsc_code: { type: String, trim: true, uppercase: true },
        account_type: { type: String, trim: true, default: "Current" },
        upi_id: { type: String, trim: true },
    },
    { _id: false }
);

/**
 * 🧱  Employee Address Block (Permanent & Local)
 */
const employeeAddressSchema = new mongoose.Schema(
    {
        permanent: fullAddressSchema,
        local: fullAddressSchema,
    },
    { _id: false }
);

/**
 * 🧱  Conversion Metadata
 * Tracks Quotation -> Invoice or PO -> Bill mappings
 */
const conversionMetadataSchema = new mongoose.Schema(
    {
        sourceId: { type: mongoose.Schema.Types.ObjectId },
        sourceType: { type: String, enum: ["QUOTATION", "PURCHASE_ORDER"] },
        convertedAt: { type: Date, default: Date.now },
        convertedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
        bill_no: { type: String, trim: true }, // For PO -> Bill
        bill_date: { type: Date },             // For PO -> Bill
    },
    { _id: false }
);

/**
 * 🧱  Seller Snapshot (Inherited)
 */
const sellerSnapshotSchema = new mongoose.Schema(
    {
        business_name: { type: String, trim: true },
        legal_name: { type: String, trim: true },
        logo: { type: String, trim: true },
        address: fullAddressSchema,
        contact: {
            email: { type: String, trim: true, lowercase: true },
            mobile: { type: String, trim: true },
            telephone: { type: String, trim: true },
        },
        tax_registrations: {
            gstin: { type: String, trim: true, uppercase: true },
            pan: { type: String, trim: true, uppercase: true },
            tan: { type: String, trim: true, uppercase: true },
            cin: { type: String, trim: true, uppercase: true },
        },
        bank_details: bankAccountSchema,
    },
    { _id: false }
);

/**
 * 🧱  Buyer Snapshot (Inherited/Consolidated)
 */
const buyerSnapshotSchema = new mongoose.Schema(
    {
        company_name: { type: String, trim: true },
        contact_person: { type: String, trim: true },
        billing: fullAddressSchema,
        shipping: fullAddressSchema,
        mobile: { type: String, trim: true },
        email: { type: String, trim: true, lowercase: true },
        gstin: { type: String, trim: true, uppercase: true },
        pan: { type: String, trim: true, uppercase: true },
    },
    { _id: false }
);

/**
 * 🧱  Line Item (Inherited)
 */
const lineItemSchema = new mongoose.Schema(
    {
        sr_no: { type: Number },
        item_code: { type: String, trim: true },
        description: { type: String, trim: true, required: true },
        hsn_sac: { type: String, trim: true },
        quantity: { type: Number, required: true, min: 0 },
        unit: { type: String, trim: true, default: "PCS" },
        rate: { type: Number, required: true, min: 0 },
        discount_percent: { type: Number, default: 0 },
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

/**
 * 🧱  Totals block (Inherited)
 */
const totalsSchema = new mongoose.Schema(
    {
        subtotal: { type: Number, default: 0 },
        taxable_amount: { type: Number, default: 0 },
        total_tax: { type: Number, default: 0 },
        grand_total: { type: Number, default: 0 },
        amount_in_words: { type: String, trim: true },
    },
    { _id: false }
);

/**
 * 🏙️  Corporate Profile Schema (Corporate-specific Settings)
 */
const corporateProfileSchema = new mongoose.Schema({
    corporateName:     { type: String, trim: true },
    corporateTagName:  { type: String, trim: true },
    corporateEmail:    { type: String, trim: true, lowercase: true },
    ownershipType:     { 
        type: String, 
        enum: ["Proprietorship", "Partnership", "LLP", "Private Limited", "Public Limited", "Trust", "Society"], 
        default: "Proprietorship" 
    },
    corporatePAN:      { type: String, trim: true, uppercase: true },
    corporateActive:   { type: Boolean, default: true },
    CorpProfileImage:  { type: String, trim: true },

    centralRegistrations: {
        cin:                { type: String, trim: true, uppercase: true },
        tan:                { type: String, trim: true, uppercase: true },
        iec:                { type: String, trim: true, uppercase: true },
        msme_udyam:         { type: String, trim: true, uppercase: true },
        fssai:              { type: String, trim: true },
        drug_license:       { type: String, trim: true },
        import_export_code: { type: String, trim: true },
        corporateMobile:    { type: String, trim: true },
        corporateTelephone: { type: String, trim: true },
        corporateMobile:    { type: String, trim: true },
        corporateTelephone: { type: String, trim: true },
        Quotation_TC:       { type: String, trim: true },
        TaxInvoiceTC:       { type: String, trim: true },
    },

    locations: [{
        locationName:       { type: String, trim: true, default: "Registered Office" },
        locationType:       { type: String, enum: ["HO", "RO", "BO"], default: "BO" },
        parentId:           { type: mongoose.Schema.Types.ObjectId, default: null },
        isRegisteredOffice: { type: Boolean, default: false },
        address:            fullAddressSchema,
        gstin:              { type: String, trim: true, uppercase: true },
        bankDetails:        bankAccountSchema,
        contactPerson:      { type: String, trim: true },
        contactMobile:      { type: String, trim: true },
        contactEmail:       { type: String, trim: true, lowercase: true },
        active:             { type: Boolean, default: true }
    }],

    authorizedSignatory: {
        name: { type: String, trim: true },
        designation: { type: String, trim: true },
        signature_label: { type: String, trim: true, default: "Authorised Signatory" },
        signature_img: { type: String, trim: true },
        stamp_img: { type: String, trim: true },
    },

    apiUrls: {
        msg91: {
            authkey: { type: String, trim: true },
            sender_id: { type: String, trim: true },
            template_id: { type: String, trim: true },
            whatsapp_template_id: { type: String, trim: true },
            url: { type: String, trim: true },
            isActive: { type: Boolean, default: false }
        },
        whatsapp_meta: {
            token: { type: String, trim: true },
            phone_number_id: { type: String, trim: true },
            waba_id: { type: String, trim: true },
            url: { type: String, trim: true },
            templates: [{
                purpose: { type: String, trim: true }, // e.g., "register", "login", "reset"
                template_id: { type: String, trim: true }
            }],
            isActive: { type: Boolean, default: false }
        },
        cloudinary: {
            cloud_name: { type: String, trim: true },
            api_key: { type: String, trim: true },
            api_secret: { type: String, trim: true },
            api_url: { type: String, trim: true },
            isActive: { type: Boolean, default: false }
        },
        leadApis: [{
            b2bName: { type: String, trim: true }, // IndiaMart, TradeIndia, JustDial, etc.
            url: { type: String, trim: true },
            userid: { type: String, trim: true },
            profile_id: { type: String, trim: true },
            key: { type: String, trim: true },
            isActive: { type: Boolean, default: true }
        }],
        mailConfigure: {
            host: { type: String, trim: true, default: "imap.gmail.com" },
            port: { type: Number, default: 993 },
            secure: { type: Boolean, default: true },
            auth: {
                user: { type: String, trim: true, lowercase: true },
                pass: { type: String, trim: true },
            },
            isActive: { type: Boolean, default: false },
        },
    },
}, { 
    timestamps: true,
    collection: "profileMaster" 
});

module.exports = {
    fullAddressSchema,
    bankAccountSchema,
    employeeAddressSchema,
    conversionMetadataSchema,
    sellerSnapshotSchema,
    buyerSnapshotSchema,
    lineItemSchema,
    totalsSchema,
    corporateProfileSchema
};
