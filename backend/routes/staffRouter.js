const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const tenant  = require("../middleware/tenantMiddleware");
const ctrl    = require("../controller/LegacyFinanceAdapter");

router.use(auth);
router.use(tenant);

// ── Staff combined picker (for Finance form) ──────────────────────────────────
router.get("/picker",               ctrl.getStaffPicker);
router.post("/contact/add",         ctrl.addContact);
router.get("/contact/ledger/:mobile", ctrl.getContactLedger);
router.get("/contact/ledger-by-id/:id", ctrl.getEmployeeLedgerById);

module.exports = router;
