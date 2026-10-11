const mongoose = require("mongoose");
const { Schema } = mongoose;

// PRODUCT COST PER CATEGORY
const VendorProductSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, required: true },
  productName: String,
  description: String,
  price: Number,
  UoM: { type: String }
});

const VendorCategorySchema = new Schema({
  categoryId: { type: Schema.Types.ObjectId, required: true },
  categoryName: String,
  products: [VendorProductSchema]  
});

// ------------------------
// Product Subschema
// ------------------------
const ProductSchema = new Schema({
  _id: { type: Schema.Types.ObjectId, auto: true },
  productName: { type: String, required: true },
  description: { type: String, required: true },
  UoM: { type: String, default: "SQM" },
  margin: { type: Number, default: 15 },
  createdAt: { type: Date, default: Date.now }
});


// Product Cost Subschema
/*
const ProductCostSchema = new Schema({
  categoryId: { type: Schema.Types.ObjectId, required: true },
  productId: { type: Schema.Types.ObjectId, required: true },
  productCostPrice: { type: Number, required: true }
});


const ProductCategorySchema = new Schema({
  categoryId: { type: Schema.Types.ObjectId, required: true },
  products: [ProductCostSchema] });*/

// ------------------------
// Category Subschema
// ------------------------
const CategorySchema = new Schema({
  _id: { type: Schema.Types.ObjectId, auto: true },
  categoryName: { type: String, required: true },
  products: [ProductSchema],
  createdAt: { type: Date, default: Date.now }
});

// ------------------------
// Vendor Subschema
// ------------------------

const VendorSchema = new Schema({
  _id: { type: Schema.Types.ObjectId, auto: true },
  vendorName: { type: String, required: true },
  mobileNo: { type: String, required: true },
  vendorAddress: { type: String, required: false },
  vendorGST: { type: String, required: false },
  contactPerson: { type: String, required: true },
  productCost: [VendorCategorySchema],
  corporateId: { type: String, default: "Not linked " },
  createdAt: { type: Date, default: Date.now }
});


// ------------------------
// Main Purchase Schema
// ------------------------
const PurchaseSchema = new Schema({
  vendors: [VendorSchema],
  categories: [CategorySchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("vendors", PurchaseSchema);
