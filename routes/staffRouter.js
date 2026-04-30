const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const ctrl    = require("../controller/LegacyFinanceAdapter");

router.use(auth);

// ── Staff combined picker (for Finance form) ──────────────────────────────────
router.get("/picker",               ctrl.getStaffPicker);
router.post("/contact/add",         ctrl.addContact);
router.get("/contact/ledger/:mobile", ctrl.getContactLedger);

module.exports = router;
