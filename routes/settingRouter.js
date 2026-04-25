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
// GET  /api/setting/update/corporate   → fetch profile from tenant profileMaster
// PUT  /api/setting/update/corporate   → patch tenant profile and sync label
router.get ("/update/corporate", tenantMiddleware, setting.updateCorporate.getCorporate);
router.put ("/update/corporate", tenantMiddleware, setting.updateCorporate.postCorporate);

// ── Admin user ────────────────────────────────────────────────────────────────
// GET  /api/setting/update/user        → return CorpAdmin profile
// PUT  /api/setting/update/user        → patch CorpAdmin profile / change password
router.get ("/update/user", setting.updateAdminUser.getAdminUser);
router.put ("/update/user", setting.updateAdminUser.postAdminUser);

// ── Other users (Sales / Project) ─────────────────────────────────────────────
// GET  /api/setting/update/other-user        → list all Sales+Project users (dropdown)
// GET  /api/setting/update/other-user/:id    → single user detail
// PUT  /api/setting/update/other-user/:id    → update a Sales/Project user
router.get ("/update/other-user",     setting.otherUser.getOtherUser);
router.get ("/update/other-user/:id", setting.otherUser.getOtherUserById);
router.put ("/update/other-user/:id", setting.otherUser.postOtherUser);

// ── Assign Corporate (Search and Link) ────────────────────────────────────────
// GET  /api/setting/search/user              → search user by mobile/aadhar
// PUT  /api/setting/assign-corporate/:id     → link user to admin's corporates
// DELETE /api/setting/assign-corporate/:id   → unlink user from admin
router.get ("/search/user",              setting.otherUser.searchUser);
router.put ("/assign-corporate/:id",     setting.otherUser.assignCorporate);
router.delete("/assign-corporate/:id",   setting.otherUser.unassignCorporate);

module.exports = router;