const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * 🧱 Corporate Data (Embedded inside Admin)
 */
const embeddedCorporateSchema = new mongoose.Schema({
  corporateName: { type: String, trim: true },
  corporateTagName: { type: String, trim: true },
  corporateEmail: { type: String, trim: true, lowercase: true },
  corporateAddress: { type: String, trim: true },
  corporateCity: { type: String, trim: true },
  corporateDistrict: { type: String, trim: true },
  corporateState: { type: String, trim: true },
  corporatePin: { type: String, trim: true },
  corporatePAN: { type: String, trim: true, uppercase: true },
  corporateGST: { type: String, trim: true, uppercase: true },
  corporateActive: { type: Boolean, default: true },
  CorpProfileImage: { type: String, trim: true },
  
  // 🔥 apiUrls is now nested INSIDE linkedCorporate per your recordset
  apiUrls: {
    SMS: { type: String, trim: true },
    Whatsapp: { type: String, trim: true },
    IndiaMart: { type: String, trim: true },
    TradeIndia: { type: String, trim: true },
    JustDial: { type: String, trim: true }
  }
}, { _id: true });

/**
 * 🧱 Access Link (For Sales/Project Users)
 */
const accessCorporateSchema = new mongoose.Schema({
  // Fixed: These are stored as ObjectIds in MongoDB
  corpAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users' },
  corporateId: { type: mongoose.Schema.Types.ObjectId }, 
  accessAllow: { type: Boolean, default: false }
}, { _id: false });

/**
 * 🧱 Main User Schema
 */
const userSchema = new mongoose.Schema({
  userDisplayName: { type: String, required: true, trim: true },
  userEmail: { type: String, trim: true, lowercase: true },
  userMobile: { type: String, required: true, unique: true, trim: true },
  userPassword: { type: String, required: true },
  userRole: { 
    type: String, 
    enum: ["CorpAdmin", "Sales", "Project"], 
    required: true 
  },
  userAadhar: { type: String, trim: true },
  userDoB: { type: Date },
  userActive: { type: Boolean, default: true },
  userProfileImage: { type: String, trim: true },

  // 🔥 ONLY for CorpAdmin
  linkedCorporate: {
    type: embeddedCorporateSchema,
    required: false
  },

  // 🔥 ONLY for Sales/Project
  accessCorporate: {
    type: accessCorporateSchema,
    required: false
  }
}, { 
  timestamps: true,
  minimize: true // Ensures empty objects {} are not saved to DB
});

// Password Hash
userSchema.pre("save", async function (next) {
  if (!this.isModified("userPassword")) return next();
  const salt = await bcrypt.genSalt(10);
  this.userPassword = await bcrypt.hash(this.userPassword, salt);
  next();
});

const Users = mongoose.models.Users || mongoose.model("Users", userSchema);
module.exports = { Users };