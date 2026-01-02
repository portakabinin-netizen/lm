const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema({
  categoryName: String,
  productName: String,
  description: String,
  qty: Number,
  UoM: String,
  rate: Number,
  amount: Number,
});

const OrderFlowsSchema = new mongoose.Schema(
  {
    poNumber: { type: String, required: true, unique: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: "Vendors" },
    vendorName: String,
    vendorAddress: String,
    vendorGST: String,
    vendorMobile: String,

    orderDate: String,
    deliveryDate: String,

    deliveryAddress: String,
    deliveryState: String,
    deliveryPIN: String,

    items: [ItemSchema],

    grandTotal: Number,
  },
  { timestamps: true }
);

module.exports = mongoose.model("orderflows", OrderFlowsSchema);
