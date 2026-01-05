const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { regex } = require("../middleware/validateAuth");

/* Third party API for SMS, Whatsapp , IndiaMart , Gmail inbox */
const apiUrlschema = new mongoose.Schema(
  {
    apiUrls: {
      type: Map,
      of: String,
      default: {}
    }
  },
  { _id: true }
);

const embeddedCorporateSchema = new mongoose.Schema(
  {
    corporateName: { type: String, trim: true, match: regex.name },
    corporateTagName: { type: String, trim: true },
    CorpProfileImage: { type: String, trim: true, match: regex.url },
    corporateEmail: { type: String, trim: true, lowercase: true, match: regex.email },
    corporateAddress: { type: String, trim: true },
    corporateCity: { type: String, trim: true },
    corporateDistrict: { type: String, trim: true },
    corporateState: { type: String, trim: true },
    corporatePin: { type: String, trim: true, match: regex.pin },
    corporatePAN: { type: String, trim: true, uppercase: true, match: regex.pan },
    corporateGST: { type: String, trim: true, uppercase: true, match: regex.gst },
    corporateActive: { type: Boolean, default: true },

    apiUrls: {
      type: Map,
      of: {
        type: String,
        match: regex.url, // validates URL format
      },
      default: {},
      validate: {
        validator: function (map) {
          const allowedKeys = ["SMS", "Whatsapp", "IndiaMart", "TradeIndia", "JustDial"];
          return [...map.keys()].every((key) => allowedKeys.includes(key));
        },
        message: "Invalid API URL key. Allowed: SMS, Whatsapp, IndiaMart, TradeIndia, JustDial",
      },
    },
  },
  { _id: true, timestamps: true}
);

/* 🧱 Access Corporate Schema — For Sales/Project */
const accessCorporateSchema = new mongoose.Schema({
  corpAdminId: { type: String, default: "" },
  corporateId: { type: String, default: "" },
  accessAllow: { type: Boolean, default: false },
}, { _id: false });

/* 🧱 Main User Schema */
const userSchema = new mongoose.Schema({
  userDisplayName: { type: String, required: true, trim: true, match: regex.name },
  userEmail: { type: String, trim: true, lowercase: true, match: regex.email },
  userMobile: { type: String, required: true, unique: true, trim: true, match: regex.mobile },
  userPassword: { type: String, required: true, minlength: 8 },
  userRole: { type: String, enum: ["CorpAdmin", "Sales", "Project"], required: true },
  userAadhar: { type: String, trim: true, match: regex.aadhar },
  userProfileImage: { type: String, trim: true, match: regex.url },

  /* 🎂 Date of Birth — stored as Date, formatted as dd-mm-yyyy when returned */
  userDoB: {
    type: Date,
    trim: true,
    get: (date) => {
      if (!date) return null;
      const d = new Date(date);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    },
  },

  linkedCorporate: {
    type: embeddedCorporateSchema,
    default: function () {
      return this.userRole === "CorpAdmin" ? {} : undefined;
    },
  },
  accessCorporate: {
    type: accessCorporateSchema,
    default: function () {
      return ["Sales", "Project"].includes(this.userRole)
        ? { corpAdminId: "", corporateId: "", accessAllow: true }
        : undefined;
    },
  },
  userActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  toJSON: { getters: true },   
  toObject: { getters: true }, 
});

/* 🔒 Password Hash */
userSchema.pre("save", async function (next) {
  if (!this.isModified("userPassword")) return next();
  const salt = await bcrypt.genSalt(10);
  this.userPassword = await bcrypt.hash(this.userPassword, salt);
  next();
});

const Users = mongoose.models.Users || mongoose.model("Users", userSchema);
module.exports = { Users };
