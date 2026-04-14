const express = require("express");
const router = express.Router();
const purchaseController = require("../controller/purchaseController");

// Vendors
router.post("/vendor/add", purchaseController.addVendor);
router.get("/vendor",      purchaseController.getVendors);
router.put("/vendor/:id",  purchaseController.updateVendor);
router.delete("/vendor/:id", purchaseController.deleteVendor);

// Categories
router.post("/category/add",                       purchaseController.addCategory);
router.get("/category",                            purchaseController.getCategories);
router.get("/category/single/:categoryId",         purchaseController.getCategoryById);
router.put("/category/:categoryId",                purchaseController.updateCategory);
router.delete("/category/:categoryId",             purchaseController.deleteCategory);

// Products  (categoryId + productId in path)
router.post("/add",                                purchaseController.addProduct);
router.put("/:categoryId/:productId",              purchaseController.updateProduct);
router.delete("/:categoryId/:productId",           purchaseController.deleteProduct);

// Vendor Rates
router.post("/rate/add",                           purchaseController.addVendorRates);
router.get("/rate/vendor/:vendorId",               purchaseController.getVendorRatesById);
router.get("/vendor/by-category/:categoryId",      purchaseController.getVendorsByCategory);
router.get("/rate/vendor/:vendorId/category/:categoryId", purchaseController.getVendorRatesByCategory);

// Bulk Excel Uploads
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

router.get("/bulk-upload/template", purchaseController.generateTemplate);
router.post("/bulk-upload", upload.single("file"), purchaseController.uploadBulk);

module.exports = router;