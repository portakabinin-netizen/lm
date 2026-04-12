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
router.get("/:id",             ctrl.getQuote);
router.put("/:id",             ctrl.updateQuote);
router.delete("/:id",          ctrl.deleteQuote);

module.exports = router;
