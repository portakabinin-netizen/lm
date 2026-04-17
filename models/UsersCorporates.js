const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// ─────────────────────────────────────────────────────────────────────────────
// 🧱  Embedded Corporate Schema  (lives inside Admin's linkedCorporate)
// ─────────────────────────────────────────────────────────────────────────────
const embeddedCorporateSchema = new mongoose.Schema(
  {
    // ── Identity ────────────────────────────────────────────────────────────
    corporateName: { type: String, trim: true },
    corporateTagName: { type: String, trim: true },
    corporateEmail: { type: String, trim: true, lowercase: true },
    corporateAddress: { type: String, trim: true },
    corporateCity: { type: String, trim: true },
    corporateDistrict: { type: String, trim: true },
    corporateState: { type: String, trim: true },
    corporatePin: { type: String, trim: true },
    corporatePAN: { type: String, trim: true, uppercase: true },
    corporateActive: { type: Boolean, default: true },
    CorpProfileImage: { type: String, trim: true },

    // ── Tax Registrations ────────────────────────────────────────────────────
    taxRegistrations: {
      tan: { type: String, trim: true, uppercase: true },
      cin: { type: String, trim: true, uppercase: true },
      iec: { type: String, trim: true, uppercase: true },
      msme_udyam: { type: String, trim: true, uppercase: true },
      fssai: { type: String, trim: true },
      drug_license: { type: String, trim: true },
      import_export_code: { type: String, trim: true },
      corporateMobile: { type: String, trim: true },
      corporateTelephone: { type: String, trim: true },
      Quotation_TC: { type: String, trim: true },
      TaxInvoiceTC: { type: String, trim: true },
    },

    // ── Bank Details ─────────────────────────────────────────────────────────
    bankDetails: {
      bank_name: { type: String, trim: true },
      branch: { type: String, trim: true },
      account_number: { type: String, trim: true },
      ifsc_code: { type: String, trim: true, uppercase: true },
      account_type: { type: String, trim: true, default: "Current" },
      swift_code: { type: String, trim: true, uppercase: true },
      corporateGST: { type: String, trim: true, uppercase: true },
    },

    // ── Authorized Signatory ─────────────────────────────────────────────────
    authorizedSignatory: {
      name: { type: String, trim: true },
      designation: { type: String, trim: true },
      signature_label: { type: String, trim: true, default: "Authorised Signatory" },
    },

    // ── API / Integration URLs ────────────────────────────────────────────────
    // Simple URL-only integrations live here
    apiUrls: {
      SMS: { type: String, trim: true },
      Whatsapp: { type: String, trim: true },
      IndiaMart: { type: String, trim: true },
      JustDial: { type: String, trim: true },

      // ── Mail / IMAP Configuration ────────────────────────────────────────
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

      // ── TradeIndia Integration ──────────────────────────────────────────
      tradeindia: {
        url: { type: String, trim: true },
        userid: { type: String, trim: true },
        profile_id: { type: String, trim: true },
        key: { type: String, trim: true },
      },
    },
  },
  { _id: true }
);

// ─────────────────────────────────────────────────────────────────────────────
// 🧱  Access Link  (Sales / Project users only)
// ─────────────────────────────────────────────────────────────────────────────
const accessCorporateSchema = new mongoose.Schema(
  {
    corpAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
    linkedCorporates: [
      {
        corporateId: { type: mongoose.Schema.Types.ObjectId },
        accessAllow: { type: Boolean, default: false },
      }
    ],
  },
  { _id: false }
);

// ─────────────────────────────────────────────────────────────────────────────
// 🧱  Main User Schema
// ─────────────────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema(
  {
    userDisplayName: { type: String, required: true, trim: true },
    userEmail: { type: String, trim: true, lowercase: true },
    userMobile: { type: String, required: true, unique: true, trim: true },
    userPassword: { type: String, required: true },
    userRole: { type: String, enum: ["CorpAdmin", "Sales", "Project", "Finance"], required: true },
    userAadhar: { type: String, trim: true },
    userDoB: { type: Date },
    userActive: { type: Boolean, default: true },
    userProfileImage: { type: String, trim: true },

    // CorpAdmin only
    linkedCorporates: {
      type: [embeddedCorporateSchema],
      default: [],
    },

    // Sales / Project / Finance
    accessCorporate: {
      type: accessCorporateSchema,
      default: null,
    },
  },
  {
    timestamps: true,
    minimize: true,
  }
);

// ── Password hashing and Corporate Linkage middleware ────────────────────────
userSchema.pre("save", async function (next) {
  // 1. Password Hashing
  if (this.isModified("userPassword")) {
    const salt = await bcrypt.genSalt(10);
    this.userPassword = await bcrypt.hash(this.userPassword, salt);
  }

  if (this.userRole === "CorpAdmin") {
    if (this.linkedCorporates && this.linkedCorporates.length > 0) {
      this.linkedCorporates.forEach(corp => {
        if (!corp._id) corp._id = new mongoose.Types.ObjectId();
      });
    }
  }
  next();
});

const Users = mongoose.models.Users || mongoose.model("Users", userSchema);
const Corporates = mongoose.models.Corporates || mongoose.model("Corporates", embeddedCorporateSchema);

module.exports = { Users, Corporates };