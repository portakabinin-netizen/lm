const express = require("express");
const router = express.Router();
const authController = require("../controller/authController");
const { validateAuth } = require("../middleware/validateAuth");
const authMiddleware = require("../middleware/authMiddleware");

// Public Identity Routes
router.post("/send-otp", validateAuth, authController.sendOtp);
router.post("/verify-otp", authController.verifyOtp);
router.post("/check-unique", validateAuth, authController.checkUnique);
router.post("/register", validateAuth, authController.register);
router.post("/login", validateAuth, authController.login);
router.post("/update-profile-image", authMiddleware, authController.updateProfileImage);
router.get('/health-check', authMiddleware, authController.healthCheck);

module.exports = router;