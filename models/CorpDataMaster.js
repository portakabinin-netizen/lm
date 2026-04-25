const mongoose = require("mongoose");
const {
    fullAddressSchema,
    bankAccountSchema,
    employeeAddressSchema,
    multiTenantSchema
} = require("./masterShared");

// ─────────────────────────────────────────────────────────────────────────────
// 🏙️  Corporate Profile Schema (Corporate-specific Settings)
// ─────────────────────────────────────────────────────────────────────────────
const corporateProfileSchema = new mongoose.Schema({
    // 1️⃣  Central Corporate Identity (Fixed)
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

    // 2️⃣  Central Registration Details (Inherited by all branches)
    centralRegistrations: {
        cin:                { type: String, trim: true, uppercase: true }, // Company CIN
        tan:                { type: String, trim: true, uppercase: true },
        iec:                { type: String, trim: true, uppercase: true },
        msme_udyam:         { type: String, trim: true, uppercase: true },
        fssai:              { type: String, trim: true },
        drug_license:       { type: String, trim: true },
        import_export_code: { type: String, trim: true },
        Quotation_TC:       { type: String, trim: true },
        TaxInvoiceTC:       { type: String, trim: true },
    },

    // 3️⃣  Office Locations (Registered Office & Branches)
    // Each location has its own GST, Bank, and Address
    locations: [{
        locationName:       { type: String, trim: true, default: "Registered Office" },
        locationType:       { type: String, enum: ["HO", "RO", "BO"], default: "BO" },
        parentId:           { type: mongoose.Schema.Types.ObjectId, default: null }, // Self-reference to parent location ID
        isRegisteredOffice: { type: Boolean, default: false },
        address:            fullAddressSchema,
        gstin:              { type: String, trim: true, uppercase: true }, // State-wise GST
        bankDetails:        bankAccountSchema, // State/Branch wise bank
        contactPerson:      { type: String, trim: true },
        contactMobile:      { type: String, trim: true },
        contactEmail:       { type: String, trim: true, lowercase: true },
        active:             { type: Boolean, default: true }
    }],

    authorizedSignatory: {
        name: { type: String, trim: true },
        designation: { type: String, trim: true },
        signature_label: { type: String, trim: true, default: "Authorised Signatory" },
    },

    apiUrls: {
        SMS: { type: String, trim: true },
        Whatsapp: { type: String, trim: true },
        IndiaMart: { type: String, trim: true },
        JustDial: { type: String, trim: true },
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
        tradeindia: {
            url: { type: String, trim: true },
            userid: { type: String, trim: true },
            profile_id: { type: String, trim: true },
            key: { type: String, trim: true },
        },
        key: { type: String, trim: true },
    },
}, { _id: false });

// 📦 Product Master Schema
const productSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId },
    categoryName: { type: String, trim: true },
    hsn_sac: { type: String, trim: true },
    unit: { type: String, trim: true, default: "PCS" },
    description: { type: String, trim: true },
    standardRate: { type: Number, default: 0 },
    active: { type: Boolean, default: true }
}, { _id: true, timestamps: true });

// 📈 Rate Master Schema (Historical Tracking)
const rateMasterSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    buy_rate: { type: Number, default: 0 },
    sell_rate: { type: Number, default: 0 },
    effectiveFrom: { type: Date, default: Date.now },
}, { _id: true });

// 💼 Client / Supplier Schema
const partySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    pan: { type: String, trim: true, uppercase: true },
    gst: { type: String, trim: true, uppercase: true },
    bank: bankAccountSchema,
    billingAddress: fullAddressSchema,
    shippingAddress: fullAddressSchema,
    contact_person: { type: String, trim: true },
    mobile: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    active: { type: Boolean, default: true },
}, { _id: true, timestamps: true });

// 👷 Employee Schema
const employeeSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    father_name: { type: String, trim: true },
    role: { type: String, trim: true },
    mobile: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    pan: { type: String, trim: true, uppercase: true },
    aadhar: { type: String, trim: true },
    aadhar_no: { type: String, trim: true },
    dob: { type: Date },
    gender: { type: String, enum: ["Male", "Female", "Transgender"], default: "Male" },
    photo_url: { type: String, trim: true },
    daily_rate: { type: Number, default: 0 },
    monthly_rate: { type: Number, default: 0 },
    bank: bankAccountSchema,
    addresses: employeeAddressSchema,
    joinDate: { type: Date },
    active: { type: Boolean, default: true }
}, { _id: true, timestamps: true });

// 🎯 Lead Schema (CRM Spoke)
const leadSchema = new mongoose.Schema({
    lead_no: { type: Number },
    sender_name: { type: String, trim: true },
    sender_mobile: { type: String, trim: true },
    sender_email: { type: String, trim: true, lowercase: true },
    sender_city: { type: String, trim: true },
    sender_state: { type: String, trim: true },
    product_name: { type: String, trim: true },
    source: { type: String, trim: true },
    source_id: { type: String, trim: true },
    subject: { type: String, trim: true },
    message: { type: String, trim: true },
    status: { type: String, default: "Recent" },
    generated_date: { type: Date, default: Date.now },
    clientId: { type: mongoose.Schema.Types.ObjectId },
    activity: [new mongoose.Schema({
        action: { type: String },
        byUser: { type: String },
        date: { type: Date, default: Date.now },
        metadata: { type: mongoose.Schema.Types.Mixed }
    }, { _id: false })],
}, { _id: true, timestamps: true });

// 📑 Ledger / Voucher (Accounting Spokes)
const groupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    parentGroup: { type: String },
    nature: { type: String, enum: ["Assets", "Liabilities", "Income", "Expenses"] }
}, { _id: true });

const ledgerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    groupId: { type: mongoose.Schema.Types.ObjectId },
    openingBal: { type: Number, default: 0 },
    nature: { type: String, enum: ["Dr", "Cr"] }
}, { _id: true });

const voucherEntrySchema = new mongoose.Schema({
    ledgerId: { type: mongoose.Schema.Types.ObjectId },
    ledgerName: { type: String },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    leadId: { type: mongoose.Schema.Types.ObjectId },
}, { _id: false });

const voucherSchema = new mongoose.Schema({
    voucherType: { type: String, enum: ["Payment", "Receipt", "Journal", "Contra", "Sales", "Purchase"] },
    voucherNo: { type: String },
    date: { type: Date, default: Date.now },
    narration: { type: String },
    entries: [voucherEntrySchema],
    leadId: { type: mongoose.Schema.Types.ObjectId },
}, { _id: true, timestamps: true });

// 📅 Attendance Schema
const attendanceSchema = new mongoose.Schema({
    employeeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ["Present", "Absent", "Leave"], default: "Present" },
    siteId: { type: String },
    leadId: { type: mongoose.Schema.Types.ObjectId },
}, { _id: true, timestamps: true });

// 🎡 Corporate Data Slot
const corpDataSlotSchema = new mongoose.Schema({
    profile: corporateProfileSchema,
    clients: [partySchema],
    suppliers: [partySchema],
    employees: [employeeSchema],
    leads: [leadSchema],
    categories: [{ name: String, description: String }],
    products: [productSchema],
    rates: [rateMasterSchema],
    groups: [groupSchema],
    ledgers: [ledgerSchema],
    vouchers: [voucherSchema],
    attendance: [attendanceSchema],
    counters: {
        lead: { type: Number, default: 0 },
        voucher: { type: Number, default: 0 },
        invoice: { type: Number, default: 0 },
    }
}, { _id: false });

const CorpDataMasterHubSchema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.ObjectId, required: true }, // corpAdminId
    corporateData: {
        type: Map,
        of: corpDataSlotSchema,
        default: {},
    }
}, {
    timestamps: true,
    minimize: true
});

// 🚀 PERFORMANCE: Multikey indexes
CorpDataMasterHubSchema.index({ "corporateData.$*.vouchers.date": -1 });
CorpDataMasterHubSchema.index({ "corporateData.$*.leads.generatedAt": -1 });

const CorpDataMaster = mongoose.models.CorpDataMaster
    || mongoose.model("CorpDataMaster", CorpDataMasterHubSchema);

module.exports = { CorpDataMaster, corporateProfileSchema };
