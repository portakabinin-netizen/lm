const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const tenant = require("../middleware/tenantMiddleware");
const ctrl = require("../controller/chatController");

/**
 * 🔒 PROTECTED ALL CHAT ROUTES
 */
router.use(auth);
router.use(tenant); // Resolve tenant connection for chat routes

router.post("/send", ctrl.sendMessage);
router.get("/messages", ctrl.getMessages);
router.put("/seen", ctrl.markAsSeen);

module.exports = router;
