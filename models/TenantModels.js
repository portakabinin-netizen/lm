const mongoose = require("mongoose");
const {
    fullAddressSchema,
    bankAccountSchema,
    employeeAddressSchema,
    corporateProfileSchema
} = require("./masterShared");

/**
 * 🏢 Tenant Models Factory
 * This file defines the operational schemas that will be instantiated 
 * per corporate database.
 */

// 1. Profile Master (Local Source of Truth in Tenant DB)
const profileMasterSchema = new mongoose.Schema(
    corporateProfileSchema.obj,
    { timestamps: true, collection: "profileMaster" }
);

// 2. Product & Category
const categorySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true }
});

const productSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Categories" },
    categoryName: { type: String, trim: true },
    hsn_sac: { type: String, trim: true },
    unit: { type: String, trim: true, default: "PCS" },
    description: { type: String, trim: true },
    standardRate: { type: Number, default: 0 },
    active: { type: Boolean, default: true }
}, { timestamps: true });

// 3. Parties (Clients/Suppliers)
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
    type: { type: String, enum: ["Client", "Supplier"], required: true },
    active: { type: Boolean, default: true },
}, { timestamps: true });

// 4. Employees
const employeeSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    father_name: { type: String, trim: true },
    role: { type: String, trim: true },
    mobile: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    pan: { type: String, trim: true, uppercase: true },
    aadhar: { type: String, trim: true },
    aadhar_no: { type: String, trim: true },
    enrollment_no: { type: String, trim: true },
    dob: { type: Date },
    joinDate: { type: Date },
    gender: { type: String, enum: ["Male", "Female", "Transgender"], default: "Male" },
    photo_url: { type: String, trim: true },
    daily_rate: { type: Number, default: 0 },
    monthly_rate: { type: Number, default: 0 },
    bank: bankAccountSchema,
    addresses: employeeAddressSchema,
    shiftEndTime: { type: String, trim: true }, // Default end time (e.g. "18:00")
    active: { type: Boolean, default: true }
}, { timestamps: true });

// 5. Leads (CRM)
const leadSchema = new mongoose.Schema({
    lead_no: { type: Number, unique: true },
    sender_name: { type: String, trim: true },
    sender_mobile: { type: String, trim: true },
    sender_email: { type: String, trim: true, lowercase: true },
    sender_city: { type: String, trim: true },
    sender_state: { type: String, trim: true },
    product_name: { type: String, trim: true },
    source: { type: String, trim: true },
    source_id: { type: String, trim: true, unique: true },
    status: { type: String, default: "Engaged" },
    generated_date: { type: Date, default: Date.now },
    clientId: { type: mongoose.Schema.Types.ObjectId },
    activity: [new mongoose.Schema({
        action: { type: String },
        byUser: { type: String },
        date: { type: Date, default: Date.now }
    }, { _id: false })],
    locationId: { type: mongoose.Schema.Types.ObjectId }, // Link to ProfileMaster.locations._id
    // ── Site Geo Location ──
    location: {
        lat: { type: Number },
        long: { type: Number },
        address: { type: String }
    },
}, { timestamps: true });

// 6. Attendance
// Shift Reference:
//   A = Morning   8h  (06:00–14:00)
//   B = Afternoon 8h  (14:00–22:00)
//   C = Night     8h  (22:00–06:00)
//   D = Day      12h  (06:00–18:00)
//   E = Night    12h  (18:00–06:00)
const attendanceSchema = new mongoose.Schema({
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employees', required: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ["Present", "Absent", "Leave"], default: "Present" },
    dutyLevel: { type: Number, default: 1 },
    rate: { type: Number, default: 0 },
    site_name: { type: String, trim: true },
    remarks: { type: String, trim: true },
    siteId: { type: String },
    leadId: { type: mongoose.Schema.Types.ObjectId },
    clientId: { type: mongoose.Schema.Types.ObjectId },
    locationId: { type: mongoose.Schema.Types.ObjectId },
    // ── Shift Control ──
    shiftCode: { type: String, enum: ['A', 'B', 'C', 'D', 'E', null], default: null },
    shiftType: { type: String, enum: ['8hr', '12hr'], default: '8hr' },
    shiftPeriod: { type: String, enum: ['Morning', 'Afternoon', 'Night', 'Day', 'Night12'], default: 'Morning' },
    shiftLockHours: { type: Number, default: 8 }, // 8 or 12 depending on shift
    // ── Double / Consecutive Shift ──
    isDoubleShift: { type: Boolean, default: false },           // true if worker continued into next shift
    previousShiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', default: null }, // links to prior shift record
    doubleShiftNotified: { type: Boolean, default: false },     // notification sent to supervisors?

    // ── Duty Toggle Fields ──
    dutyStart: { type: Date },
    dutyEnd: { type: Date },
    dutyEndScheduled: { type: Date },
    hoursWorked: { type: Number, default: 0 },
    forcedOff: { type: Boolean, default: false },
    forcedOffReason: { type: String, trim: true },
    // ── Emergency Control ──
    emergencyOff: { type: Boolean, default: false },       // true = ended via emergency override
    emergencyReason: { type: String, trim: true },         // Reason for emergency end
    emergencyByUser: { type: String, trim: true },         // Who triggered the emergency off
    // ── Geo & Tracking ──
    location: {                                            // Last known / duty-end location
        lat: { type: Number },
        long: { type: Number },
        address: { type: String }
    },
    geoHistory: [{
        lat: { type: Number },
        long: { type: Number },
        address: { type: String },
        accuracy: { type: Number },
        speed: { type: Number },
        type: { type: String, enum: ['start', 'end', 'tick', 'siteVisit'] },
        timestamp: { type: Date, default: Date.now }       // Renamed from 'time' for clarity
    }],
    isPosted: { type: Boolean, default: false },
    voucherId: { type: mongoose.Schema.Types.ObjectId, ref: "Vouchers" },
}, { timestamps: true });

// 7. Accounting
const groupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    parentGroup: { type: String },
    nature: { type: String, enum: ["Assets", "Liabilities", "Income", "Expenses"] }
});

const ledgerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Groups" },
    openingBal: { type: Number, default: 0 },
    nature: { type: String, enum: ["Dr", "Cr"] },
    refId: { type: mongoose.Schema.Types.ObjectId },
    refType: { type: String }
});

const voucherSchema = new mongoose.Schema({
    locationId: { type: mongoose.Schema.Types.ObjectId }, // Link to ProfileMaster.locations._id
    voucherType: { type: String, enum: ["Payment", "Receipt", "Journal", "Contra", "Sales", "Purchase"] },
    voucherNo: { type: String, unique: true },
    date: { type: Date, default: Date.now },
    narration: { type: String },
    entries: [new mongoose.Schema({
        ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: "Ledgers" },
        ledgerName: { type: String },
        debit: { type: Number, default: 0 },
        credit: { type: Number, default: 0 },
    }, { _id: false })],
    legacyMetadata: { type: mongoose.Schema.Types.Mixed }, // Stores flat transaction data for legacy FinanceDashboard
    leadId: { type: mongoose.Schema.Types.ObjectId },
}, { timestamps: true });

// 8. Commercial Documents
const { sellerSnapshotSchema, buyerSnapshotSchema, lineItemSchema, totalsSchema, conversionMetadataSchema } = require("./masterShared");

const documentCommon = {
    locationId: { type: mongoose.Schema.Types.ObjectId },
    docNo: { type: String, unique: true },
    date: { type: Date, default: Date.now },
    seller: sellerSnapshotSchema,
    buyer: buyerSnapshotSchema,
    items: [lineItemSchema],
    totals: totalsSchema,
    terms: { type: String },
    notes: { type: String },
    status: { type: String, default: "Draft" },
    conversion: conversionMetadataSchema,
};

const quotationSchema = new mongoose.Schema(documentCommon, { timestamps: true });
const purchaseOrderSchema = new mongoose.Schema(documentCommon, { timestamps: true });
const taxInvoiceSchema = new mongoose.Schema({
    ...documentCommon,
    voucherId: { type: mongoose.Schema.Types.ObjectId, ref: "Vouchers" }, // Link to accounting voucher
}, { timestamps: true });

// Counter Schema
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // e.g. 'lead', 'quotation_locId', 'sales_locId'
    seq: { type: Number, default: 0 }
});

/**
 * Factory function to bind models to a tenant connection
 */
const getTenantModels = (connection) => {
    return {
        ProfileMaster: connection.models.ProfileMaster || connection.model("ProfileMaster", profileMasterSchema),
        Categories: connection.models.Categories || connection.model("Categories", categorySchema),
        Products: connection.models.Products || connection.model("Products", productSchema),
        Parties: connection.models.Parties || connection.model("Parties", partySchema),
        Employees: connection.models.Employees || connection.model("Employees", employeeSchema),
        Leads: connection.models.Leads || connection.model("Leads", leadSchema),
        Attendance: connection.models.Attendance || connection.model("Attendance", attendanceSchema),
        Groups: connection.models.Groups || connection.model("Groups", groupSchema),
        Ledgers: connection.models.Ledgers || connection.model("Ledgers", ledgerSchema),
        Vouchers: connection.models.Vouchers || connection.model("Vouchers", voucherSchema),
        Quotations: connection.models.Quotations || connection.model("Quotations", quotationSchema),
        PurchaseOrders: connection.models.PurchaseOrders || connection.model("PurchaseOrders", purchaseOrderSchema),
        TaxInvoices: connection.models.TaxInvoices || connection.model("TaxInvoices", taxInvoiceSchema),
        Counters: connection.models.Counters || connection.model("Counters", counterSchema),
    };
};

module.exports = { getTenantModels };
