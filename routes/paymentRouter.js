const express = require("express");
const router  = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const ctrl = require("../controller/LegacyFinanceAdapter");

// All payment routes require authentication
router.use(authMiddleware);

// ── Lead-linked endpoints ─────────────────────────────────────────────────────
router.get("/leads-picker",          ctrl.getLeadsForPicker);        // GET: leads list for form picker
router.get("/lead-ledger/:leadId",   ctrl.getLeadLedger);            // GET: single lead full P&L ledger
router.get("/by-lead/:leadId",       ctrl.getTransactionsByLead);    // GET: all PaymentBook txns for a lead

// ── CRUD ─────────────────────────────────────────────────────────────────────
router.post(  "/voucher/create", ctrl.createVoucher);
router.post(  "/create",  ctrl.createTransaction);
router.get(   "/list",    ctrl.listTransactions);
router.get(   "/summary", ctrl.getPaymentSummary);
router.get(   "/:id",     ctrl.getTransaction);
router.put(   "/:id",     ctrl.updateTransaction);
router.delete("/:id",     ctrl.deleteTransaction);

module.exports = router;
