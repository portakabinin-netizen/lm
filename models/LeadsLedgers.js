const mongoose = require("mongoose");
const { regex } = require("../middleware/validateAuth");
const { buyerBillingSchema, buyerShippingSchema, multiTenantSchema } = require("./sharedSchemas");


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
    default: "No details",
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
        validator: function (v) {
          if (!v) return true; // Allow empty
          return /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(v);
        },
        message: props => `${props.value} is not a valid email!`
      },
    },
    source: String,
    source_id: {
      type: String,
      sparse: true,
      index: true
    },
    adminLink: String,
    corpLink: String,
    corporateId: { type: String, index: true },
    corpAdminId: { type: String, index: true },
    status: {
      type: String,
      default: "Recent",
      enum: ["Recent", "Engaged", "Accepted", "Tax Invoice", "Recycle", "Delete"]
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
    buyerInfo: {
      contact_person: { type: String, trim: true },
      company_name: { type: String, trim: true },
      billing_address: buyerBillingSchema,
      shipping_address: buyerShippingSchema,
      gst_no: { type: String, trim: true, uppercase: true },
      place_of_supply: { type: String, trim: true }
    },
    quotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "SalPurBook" }],
  },

  { timestamps: true, toJSON: { getters: true } }
);

const CorporateLeadsSchema = new mongoose.Schema(
  {
    leads: {
      type: [leadSchema],
      default: []
    },
    leadCounters: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const LeadsLedgersSchema = new mongoose.Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    // The keys are corporateIds (strings)
    corporateData: {
      type: Map,
      of: CorporateLeadsSchema,
      default: {},
    }
  },
  { timestamps: true }
);

const LeadsLedgers = mongoose.model("Leads", LeadsLedgersSchema);
module.exports = { LeadsLedgers };
