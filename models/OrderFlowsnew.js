const mongoose = require("mongoose");
const { Schema } = mongoose;

/* ============================
   COMMON ITEM SCHEMA
============================ */
const ItemSchema = new Schema({
  categoryName: String,
  productName: String,
  description: String,
  BoQ: String,
  qty: Number,
  UoM: String,
  rate: Number,
  amount: Number,
  cgstRate: {type: Number, enum: [2.5, 9], default: 9},
  sgstRate: {type: Number, enum: [2.5, 9], default: 9},
  igstRate: {type: Number, enum: [5, 18], default: 18},
  HSNcode: String});

/* ============================
   PARTY SCHEMA (replacing VENDOR)
   A party can be Vendor or Customer
============================ */
const PartySchema = new Schema(
  {
    partyId: { type: Schema.Types.ObjectId, ref: "Parties" }, // shared collection

    partyType: {
      type: String,
      enum: ["customer", "vendor"],
      required: true,
    },

    partyName: String,
    partyAddress: String,
    partyGST: String,
    partyMobile: String,
  },
  { _id: false }
);

/* ============================
   SHARED DOCUMENT STRUCTURE
============================ */
const DocumentSchema = new Schema(
  {
    number: String,          // PI-2025-001, PO-2025-005, INV-2025-003
    date: String,            // dd-mm-yyyy
    dueDate: String,         // only for invoices

    party: PartySchema,      // vendor OR customer depending on document

    billingAddress: String,
    shippingAddress: String,

    items: [ItemSchema],
    grandTotal: Number,
    taxAmount: Number,
    netAmount: Number,
  },
  { _id: false }
);

/* ============================
   MAIN ORDER FLOWS SCHEMA
============================ */
const OrderFlowsSchema = new Schema(
  {
    /** PROFORMA INVOICE → ALWAYS CUSTOMER */
    performaInvoice: DocumentSchema,

    /** PURCHASE ORDER → ALWAYS VENDOR */
    purchaseOrder: DocumentSchema,

    /** TAX INVOICE → ALWAYS CUSTOMER */
    taxInvoice: DocumentSchema,

    /** DEBIT NOTE → CAN BE CUSTOMER OR VENDOR */
    debitNote: DocumentSchema,

    /** CREDIT NOTE → CAN BE CUSTOMER OR VENDOR */
    creditNote: DocumentSchema,
  },
  { timestamps: true }
);

module.exports = mongoose.model("orderflowsNew", OrderFlowsSchema);
