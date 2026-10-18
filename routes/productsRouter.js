const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const productController = require('../controller/productController');

// ── Categories ─────────────────────────────────────────────────────────────
router.get('/category', productController.getCategories);
router.post('/category/add', productController.addCategory);
router.get('/category/single/:categoryId', productController.getCategoryById);
router.put('/category/:categoryId', productController.updateCategory);
router.delete('/category/:categoryId', productController.deleteCategory);

// ── Products ───────────────────────────────────────────────────────────────
router.post('/add', productController.addProduct);
router.put('/:categoryId/:productId', productController.updateProduct);
router.delete('/:categoryId/:productId', productController.deleteProduct);

// ── Vendor Rates ───────────────────────────────────────────────────────────
router.post('/rate/add', productController.addVendorRates);
router.get('/rate/vendor/:vendorId', productController.getVendorRatesById);
router.get('/rate/vendor/:vendorId/category/:categoryId', productController.getVendorRatesByCategory);

// ── Bulk Upload ────────────────────────────────────────────────────────────
router.get('/bulk-upload/template', productController.generateTemplate);
router.post('/bulk-upload', upload.single('file'), productController.uploadBulk);

module.exports = router;
