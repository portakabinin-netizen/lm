const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// StaffBook — Hub-and-Spoke multi-tenant
//   _id          = corpAdminId
//   corporateData = Map<corporateId, staffBookSlot>
//
//  Three collections per corporate:
//    employees[]   – on-site workers, supervisors, electricians, plumbers …
//    transporters[] – freight/cartage partners, logistics vendors
//    contacts[]    – any non-client party: friends, family, freelancers,
//                    money lenders, misc vendors — identified by name + mobile
// ─────────────────────────────────────────────────────────────────────────────

// ── Bank details (shared) ──────────────────────────────────────────────────────
const bankSchema = new mongoose.Schema(
    {
        bank_name:      { type: String, trim: true },
        branch:         { type: String, trim: true },
        account_number: { type: String, trim: true },
        ifsc_code:      { type: String, trim: true, uppercase: true },
        account_type:   { type: String, trim: true, default: "Savings" },
        upi_id:         { type: String, trim: true },
    },
    { _id: false }
);

// ── Employee schema ────────────────────────────────────────────────────────────
const employeeSchema = new mongoose.Schema(
    {
        // Identity
        name:        { type: String, required: true, trim: true },
        mobile:      { type: String, trim: true },
        email:       { type: String, trim: true, lowercase: true },
        aadhar_no:   { type: String, trim: true },
        pan_no:      { type: String, trim: true, uppercase: true },

        // Role / trade
        role: {
            type: String,
            enum: [
                "Supervisor", "Worker", "Electrician", "Plumber",
                "Welder", "Carpenter", "Painter", "Helper",
                "Site Engineer", "Driver", "Other"
            ],
            default: "Worker",
        },
        specialisation: { type: String, trim: true },   // e.g. "AC installation"

        // Compensation
        pay_type: {
            type: String,
            enum: ["Daily", "Monthly", "Contract", "Per Job"],
            default: "Daily",
        },
        daily_rate:     { type: Number, default: 0 },   // ₹ per day
        monthly_salary: { type: Number, default: 0 },   // ₹ per month

        // Address
        address: { type: String, trim: true },
        city:    { type: String, trim: true },
        state:   { type: String, trim: true },

        // Banking
        bank: bankSchema,

        // Status
        active:    { type: Boolean, default: true },
        join_date: { type: Date },
        notes:     { type: String, trim: true },
    },
    { _id: true, timestamps: true }
);

// ── Transporter schema ─────────────────────────────────────────────────────────
const transporterSchema = new mongoose.Schema(
    {
        // Identity
        name:           { type: String, required: true, trim: true },
        mobile:         { type: String, trim: true },
        email:          { type: String, trim: true, lowercase: true },
        contact_person: { type: String, trim: true },

        // Vehicle / fleet
        vehicle_type: {
            type: String,
            enum: ["Tempo", "Truck", "Mini Truck", "Container", "Pickup", "Bike", "Other"],
            default: "Tempo",
        },
        vehicle_no:  { type: String, trim: true, uppercase: true },
        vehicle_capacity: { type: String, trim: true }, // e.g. "1 Ton", "5 Ton"

        // Rates
        rate_per_km:   { type: Number, default: 0 },
        rate_per_trip: { type: Number, default: 0 },

        // Tax
        gst_no:        { type: String, trim: true, uppercase: true },
        pan_no:        { type: String, trim: true, uppercase: true },

        // Address / Route
        from_city:  { type: String, trim: true },
        to_city:    { type: String, trim: true },
        coverage:   { type: String, trim: true }, // "Local" | "State" | "National"

        // Banking
        bank: bankSchema,

        // Status
        active: { type: Boolean, default: true },
        notes:  { type: String, trim: true },
    },
    { _id: true, timestamps: true }
);

// ── Contact / Party Ledger schema ─────────────────────────────────────────────
// Represents any identifiable non-client party: friend, family, freelancer,
// money lender, misc vendor. Identified uniquely by mobile number.
const contactSchema = new mongoose.Schema(
    {
        name:    { type: String, required: true, trim: true },
        mobile:  { type: String, required: true, trim: true, index: true }, // primary identifier
        email:   { type: String, trim: true, lowercase: true },
        type: {
            type: String,
            enum: ["Friend", "Family", "Freelancer", "Money Lender", "Misc Vendor", "Other"],
            default: "Other",
        },
        address: { type: String, trim: true },
        notes:   { type: String, trim: true },
        active:  { type: Boolean, default: true },
    },
    { _id: true, timestamps: true }
);

// ── Per-corporate staff book ───────────────────────────────────────────────────
const staffBookSchema = new mongoose.Schema(
    {
        employees:    { type: [employeeSchema],    default: [] },
        transporters: { type: [transporterSchema], default: [] },
        contacts:     { type: [contactSchema],     default: [] },  // Party Ledger accounts
    },
    { _id: false }
);

// ── Hub (one document per corpAdminId) ────────────────────────────────────────
const StaffBookHubSchema = new mongoose.Schema(
    {
        _id: { type: mongoose.Schema.Types.ObjectId, required: true },
        corporateData: {
            type: Map,
            of: staffBookSchema,
            default: {},
        },
    },
    { timestamps: true }
);

const StaffBook =
    mongoose.models.StaffBook ||
    mongoose.model("StaffBook", StaffBookHubSchema);

module.exports = { StaffBook };
