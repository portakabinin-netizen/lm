// ─────────────────────────────────────────────────────────────────────────────
//  settingRouter.js
// ─────────────────────────────────────────────────────────────────────────────

const express        = require("express");
const router         = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const setting        = require("../controller/settingService");

// ── Auth guard on every route ─────────────────────────────────────────────────
router.use(authMiddleware);

// ── Corporate ─────────────────────────────────────────────────────────────────
// GET  /api/setting/update/corporate   → return the CorpAdmin's linkedCorporate
// PUT  /api/setting/update/corporate   → patch linkedCorporate fields
router.get ("/update/corporate", setting.updateCorporate.getCorporate);
router.put ("/update/corporate", setting.updateCorporate.postCorporate);

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

module.exports = router;