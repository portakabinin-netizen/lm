const express = require("express");
const router = express.Router();
const authController = require("../controller/authController");
const { validateAuth } = require("../middleware/validateAuth");
const authMiddleware = require("../middleware/authMiddleware");

/**
 * ==========================================
 * PUBLIC ROUTES
 * (No Authorization Header Required)
 * ==========================================
 */

// Basic server status check
router.get('/health-check', authController.healthCheck); 

// Authentication flows
router.post("/send-otp", validateAuth, authController.sendOtp);
router.post("/verify-otp", authController.verifyOtp);
router.post("/check-unique", validateAuth, authController.checkUnique);
router.post("/register", validateAuth, authController.register);
router.post("/login", validateAuth, authController.login);

/**
 * ==========================================
 * PROTECTED ROUTES
 * (Valid JWT / Authorization Header Required)
 * ==========================================
 */

// Apply authMiddleware to all routes defined below this point
router.use(authMiddleware);

router.post("/update-profile-image", authController.updateProfileImage);

// You can add more protected routes here without repeating 'authMiddleware'
// router.get("/profile", authController.getProfile);

module.exports = router;