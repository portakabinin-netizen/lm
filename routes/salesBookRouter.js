const express = require("express");
const router  = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const ctrl = require("../controller/salesBookController");

// Auth on all operation routes
router.use(authMiddleware);

router.post("/quotation/create", ctrl.createQuote);
router.post("/po/create",        ctrl.createPO);
router.post("/invoice/create",   ctrl.createInvoice);

router.get("/quotation/list",  ctrl.listQuotations);
router.get("/po/list",         ctrl.listPOs);
router.get("/invoice/list",    ctrl.listInvoices);
router.get("/analytics",       ctrl.getFinanceAnalytics);

router.get("/quotation/:id",   ctrl.getQuote);
router.put("/quotation/:id",   ctrl.updateQuote);
router.delete("/quotation/:id",ctrl.deleteQuote);

router.get("/po/:id",          ctrl.getPO);
router.put("/po/:id",          ctrl.updatePO);
router.delete("/po/:id",       ctrl.deletePO);

router.get("/invoice/:id",     ctrl.getInvoice);
router.put("/invoice/:id",     ctrl.updateInvoice);
router.delete("/invoice/:id",  ctrl.deleteInvoice);

module.exports = router;
