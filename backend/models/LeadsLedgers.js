const mongoose = require("mongoose");
const { regex } = require("../middleware/validateAuth"); 

/**
 * 📌 Activity Schema
 * Tracks actions performed on a lead
 */
const activitySchema = new mongoose.Schema({
  date: {
    type: Date,
    default: Date.now,
    required: true,
  },
  action: {
    type: String,
    required: true,
    trim: true,
  },
  byUser: {
    type: String,
    required: true,
    trim: true,
  },
});

/**
 * 💰 Transaction Schema
 * Tracks financial entries for each lead
 */
const transactionSchema = new mongoose.Schema({
  voucherDate: {
    type: Date,
    default: Date.now,
    required: true,
  },
  paymentType: {
    type: String,
    enum: ["Dr", "Cr"], // Debit / Credit
    required: true,
  },
  voucherAmount: {
    value: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: v => parseFloat(v.toString()), 
    },
    currency: {
      type: String,
      enum: ["INR", "USD", "EUR"],
      default: "INR",
    },
  },
  voucherNarration: {
    type: String,
    trim: true,
  },
  paymentFromTo: {
    type: String,
    enum: ["Admin", "Client", "Materials", "Labour"],
    required: true,
  },
});

/**
 * 🧱 Lead Schema
 * Stores lead, contact, activity, and finance details
 */
const leadSchema = new mongoose.Schema(
  {
    lead_no: {
      type: Number,
      unique: true,
      index: true, 
    },
    product_name: {
      type: String,
      trim: true,
    },
    sender_name: {
      type: String,
      trim: true,
    },
    sender_city: {
      type: String,
      trim: true,
    },
    sender_state: {
      type: String,
      trim: true,
    },
    sender_mobile: {
      type: String,
      trim: true,
      
    },
   sender_email: {
      type: String,
      trim: true,
      lowercase: true,
      validate: {
        validator: function(v) {
          if (!v) return true; // Allow empty
          return /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(v);
        },
        message: props => `${props.value} is not a valid email!`
      },
    },
    source: String,
    source_id: { 
      type: String, 
      unique: true, 
      sparse: true, 
      index: true 
    },
    adminLink: String,
    corpLink: String,
    status: {
      type: String,
      default: "Recent",
      enum: ["Recent", "Engaged", "Accepted", "Recycle"]
    },
    generated_date: {
      type: Date,
      default: Date.now,
    },
    activity: {
      type: [activitySchema],
      default: [],
    },
    ledger: {
      type: [transactionSchema],
      default: [],
    },
     corpAdminId: { type: String, default: "" },
     corporateId: { type: String, default: "" },
  },
  
  { timestamps: true, toJSON: { getters: true } }
);

/**
 * 🔁 Auto-increment lead_no
 */
leadSchema.pre("save", async function (next) {
  if (this.isNew) {
    const lastLead = await mongoose
      .model("Leads")
      .findOne()
      .sort({ lead_no: -1 })
      .select("lead_no");

    this.lead_no = lastLead ? lastLead.lead_no + 1 : 1;
  }
  next();
});

const LeadsLedgers = mongoose.model("Leads", leadSchema);
module.exports = { LeadsLedgers };
