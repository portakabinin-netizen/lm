const mongoose = require("mongoose");
const { Schema } = mongoose;

// 1. PRODUCT & COST SCHEMAS (Inner-most level)
const VendorProductSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, required: true },
  price:     { type: Number, default: 0 },
  UoM:       { type: String }
}, { _id: false });

const VendorCategorySchema = new Schema({
  categoryId: { type: Schema.Types.ObjectId, required: true },
  products:   [VendorProductSchema]
}, { _id: false });

const ProductSchema = new Schema({
  _id:         { type: Schema.Types.ObjectId, auto: true },
  productName: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  hsn_sac:     { type: String, default: "" },
  UoM:         { type: String, default: "SQM" },
  margin:      { type: Number, default: 15 },
  createdAt:   { type: Date, default: Date.now }
});

const CategorySchema = new Schema({
  _id:          { type: Schema.Types.ObjectId, auto: true },
  categoryName: { type: String, required: true, trim: true },
  hsn_sac: {
    type: String,
    default: "",
    validate: {
      validator: (v) => v === "" || /^\d{4,8}$/.test(v),
      message: "HSN/SAC code must be 4–8 digits"
    }
  },
  products:  [ProductSchema],
  createdAt: { type: Date, default: Date.now }
});

const VendorSchema = new Schema({
  _id:           { type: Schema.Types.ObjectId, auto: true },
  vendorName:    { type: String, required: true, trim: true },
  mobileNo:      { type: String, required: true, trim: true },
  vendorAddress: { type: String, default: "" },
  vendorGST:     { type: String, default: "", uppercase: true },
  contactPerson: { type: String, required: true, trim: true },
  corporateId:   { type: Schema.Types.ObjectId, required: true },
  productCost:   [VendorCategorySchema],
  createdAt:     { type: Date, default: Date.now }
});

// 2. CORPORATE-LEVEL SCHEMA (Child Object)
const CorporatePurchaseSchema = new Schema({
  vendors:    { type: [VendorSchema], default: [] },
  categories: { type: [CategorySchema], default: [] }
}, { _id: false });

// 3. MAIN HUB SCHEMA (Root level)
// Desired Structure:
// _id (corpAdminId) -> { corporateId -> { vendors, categories } }
const PurchaseHubSchema = new Schema({
  _id: { 
    type: Schema.Types.ObjectId, 
    required: true 
  },
  // We use a Map to represent dynamic corporateId keys
  // This satisfies corpAdminId -> { corporateId -> { vendors, categories } }
  corporateData: {
    type: Map,
    of: CorporatePurchaseSchema,
    default: {}
  }
}, { timestamps: true });

module.exports = mongoose.model("Purchase", PurchaseHubSchema);
