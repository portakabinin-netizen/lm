const express = require("express");
const router = express.Router();
const purchaseController = require("../controller/purchaseController");

// Vendors
router.post("/vendor/add", purchaseController.addVendor);
router.get("/vendor", purchaseController.getVendors);
router.put("/vendor/:id", purchaseController.updateVendor);
router.delete("/vendor/:id", purchaseController.deleteVendor);

// Categories
router.post("/category/add", purchaseController.addCategory);
router.get("/category", purchaseController.getCategories);
router.get("/category/single/:categoryId", purchaseController.getCategoryById);

// Products
router.post("/add", purchaseController.addProduct);

// Vendor Rates
router.post("/rate/add", purchaseController.addVendorRates);
router.get("/rate/vendor/:vendorId", purchaseController.getVendorRatesById);

module.exports = router;