const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * 🧱 userMaster Schema
 * lives in the mainDatabase (userMaster collection).
 * Purpose: Identity layer and tenant connection resolver.
 */

const linkedCorporateSchema = new mongoose.Schema({
    corporateName: { type: String, required: true }, // Display Label for UI Switcher
    // ── Tenant Routing Metadata ────────────────────
    dbName: { type: String, required: true },
    dbPassword: { type: String, required: true },
    isActive: { type: Boolean, default: true }
}, { _id: true });

const userMasterSchema = new mongoose.Schema({
    userDisplayName: { type: String, required: true, trim: true },
    userEmail: { type: String, trim: true, lowercase: true },
    userMobile: { type: String, required: true, unique: true, trim: true },
    userPassword: { type: String, required: true },
    userRole: { type: String, enum: ["CorpAdmin", "ROAdmin", "Sales", "Project", "Finance"], required: true },
    userAadhar: { type: String, unique: true, sparse: true },
    userDoB: { type: Date },
    userActive: { type: Boolean, default: true },
    userProfileImage: { type: String },
    addresses: {
        permanent: {
            line1: { type: String, trim: true },
            city: { type: String, trim: true },
            state: { type: String, trim: true },
            pincode: { type: String, trim: true },
        },
        local: {
            line1: { type: String, trim: true },
            city: { type: String, trim: true },
            state: { type: String, trim: true },
            pincode: { type: String, trim: true },
        }
    },

    // 🛡️ Security / Locking (Disabled for now as requested)
    isLocked: { type: Boolean, default: false },

    // For CorpAdmin: Their owned corporates and DB credentials
    linkedCorporates: [linkedCorporateSchema],

    // For non-admins: Their assigned corporate identity
    accessCorporate: {
        dbName:     { type: String },
        locationId:  { type: mongoose.Schema.Types.ObjectId }
    }
}, { 
    timestamps: true,
    collection: "userMaster" 
});

// ── Middleware: Password Hashing ────────────────────────
userMasterSchema.pre("save", async function (next) {
    if (this.isModified("userPassword")) {
        const salt = await bcrypt.genSalt(10);
        this.userPassword = await bcrypt.hash(this.userPassword, salt);
    }
    next();
});

const userMaster = mongoose.models.userMaster || mongoose.model("userMaster", userMasterSchema);

module.exports = userMaster;
