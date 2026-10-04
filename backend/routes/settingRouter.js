// ─────────────────────────────────────────────────────────────────────────────
//  settingRouter.js
// ─────────────────────────────────────────────────────────────────────────────

const express        = require("express");
const router         = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");
const setting        = require("../controller/settingService");

// ── Auth guard on every route ─────────────────────────────────────────────────
router.use(authMiddleware);

// ── Corporate (Isolated Profile) ──────────────────────────────────────────────
router.get ("/update/corporate", tenantMiddleware, setting.updateCorporate.getCorporate);
router.put ("/update/corporate", tenantMiddleware, setting.updateCorporate.postCorporate);
router.post("/update/add-corporate", setting.updateCorporate.addCorporate);

// ── Admin user ────────────────────────────────────────────────────────────────
router.get ("/update/user", tenantMiddleware, setting.updateAdminUser.getAdminUser);
router.put ("/update/user", tenantMiddleware, setting.updateAdminUser.postAdminUser);

// ── Other users (Sales / Project) ─────────────────────────────────────────────
router.get ("/update/other-user",     tenantMiddleware, setting.otherUser.getOtherUser);
router.get ("/update/other-user/:id", tenantMiddleware, setting.otherUser.getOtherUserById);
router.put ("/update/other-user/:id", tenantMiddleware, setting.otherUser.postOtherUser);

// ── Assign Corporate (Search and Link) ────────────────────────────────────────
router.get ("/search/user",              tenantMiddleware, setting.otherUser.searchUser);
router.put ("/assign-corporate/:id",     tenantMiddleware, setting.otherUser.assignCorporate);
router.delete("/assign-corporate/:id",   tenantMiddleware, setting.otherUser.unassignCorporate);

module.exports = router;