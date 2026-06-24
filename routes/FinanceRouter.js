/**
 * 🚀 FinanceRouter.js
 * 
 * PURPOSE:
 * Centralized routing for financial data (LedgerVoucherMaster).
 * Handles Accounting Groups, Ledger Folios, and Double-Entry Vouchers.
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const auth = require("../middleware/authMiddleware");
const tenant = require("../middleware/tenantMiddleware");
const ctrl = require("../controller/FinanceController");

const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * 🔒 PROTECTED ALL FINANCE ROUTES
 */
router.use(auth);
router.use(tenant); // ⬅️ Resolve tenant connection for accounting routes

// --- 📊 MASTER ---
router.get("/master",           ctrl.getAccountingMaster);
router.get("/analytics",        ctrl.getAnalytics);

// --- 📑 GROUPS ---
router.get("/groups",           ctrl.manageGroups.list);
router.post("/groups",          ctrl.manageGroups.create);
router.put("/groups/:id",       ctrl.manageGroups.update);
router.delete("/groups/:id",    ctrl.manageGroups.delete);

// --- 📖 LEDGERS ---
router.get("/ledgers",                 ctrl.manageLedgers.list);
router.get("/ledgers/lookup",          ctrl.manageLedgers.lookupEntities);
router.post("/ledgers",                ctrl.manageLedgers.create);
router.put("/ledgers/:id",             ctrl.manageLedgers.update);
router.delete("/ledgers/:id",          ctrl.manageLedgers.delete);
router.get("/petty-cash/balances",     ctrl.getPettyCashBalances);
router.get("/petty-cash/transactions", ctrl.getPettyCashTransactions);
router.post("/contra/approve",         ctrl.approveContraVoucher);

// --- 🎫 VOUCHERS ---
router.get("/vouchers/bulk-template", ctrl.generateVoucherTemplate);
router.post("/vouchers/bulk-upload", upload.single("file"), ctrl.bulkImportVouchers);
router.get("/vouchers/salary-enrollment-template", ctrl.generateSalaryDuesByEnrollmentTemplate);
router.post("/vouchers/salary-enrollment-upload", upload.single("file"), ctrl.bulkImportSalaryByEnrollment);
router.get("/vouchers",          ctrl.manageVouchers.list);
router.get("/vouchers/ledger/:ledgerId", ctrl.manageVouchers.getByLedger);
router.post("/vouchers",         ctrl.manageVouchers.create);
router.put("/vouchers/:id",      ctrl.manageVouchers.update);
router.delete("/vouchers/:id",   ctrl.manageVouchers.delete);

// --- 💸 SALARY & PAYROLL ---
router.get("/salary/voucher",      ctrl.getSalaryVoucher);
router.post("/salary/post-journal", ctrl.postSalaryJournal);
router.post("/salary/post-payment", ctrl.postSalaryPayment);

// --- 📄 QUOTATIONS ---
router.get("/quotations",        ctrl.manageQuotations.list);
router.get("/quotations/:id",    ctrl.manageQuotations.get);
router.post("/quotations",       ctrl.manageQuotations.create);
router.put("/quotations/:id",    ctrl.manageQuotations.update);
router.delete("/quotations/:id", ctrl.manageQuotations.delete);

// --- 📄 PURCHASE ORDERS ---
router.get("/pos",               ctrl.managePurchaseOrders.list);
router.get("/pos/:id",           ctrl.managePurchaseOrders.get);
router.post("/pos",              ctrl.managePurchaseOrders.create);
router.put("/pos/:id",           ctrl.managePurchaseOrders.update);
router.delete("/pos/:id",        ctrl.managePurchaseOrders.delete);

// --- 📄 TAX INVOICES ---
router.get("/invoices",          ctrl.manageTaxInvoices.list);
router.get("/invoices/:id",      ctrl.manageTaxInvoices.get);
router.post("/invoices",         ctrl.manageTaxInvoices.create);
router.put("/invoices/:id",      ctrl.manageTaxInvoices.update);
router.delete("/invoices/:id",   ctrl.manageTaxInvoices.delete);

module.exports = router;
