const express = require("express");
const router = express.Router();
const authController = require("../controller/authController");
const { validateAuth } = require("../middleware/validateAuth");
const authMiddleware = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const upload = multer({ dest: path.join(__dirname, "../uploads/") });
if (!fs.existsSync(path.join(__dirname, "../uploads/"))) {
    fs.mkdirSync(path.join(__dirname, "../uploads/"));
}

/**
 * ==========================================
 * PUBLIC ROUTES
 * (No Authorization Header Required)
 * ==========================================
 */

// Basic server status check
router.get('/health-check', authController.healthCheck); 

// Authentication flows
router.post("/send-otp",authController.sendOtp);
router.post("/search",authController.searchlinkCorp);
router.post("/verify-otp", authController.verifyOtp);
router.post("/check-unique", validateAuth, authController.checkUnique);
router.post("/register", validateAuth, authController.register);
router.post("/login", validateAuth, authController.login);
router.post("/verify-identity",validateAuth,authController.verifyIdentity);
router.post("/reset-password", authController.resetPassword);



/**
 * ==========================================
 * PROTECTED ROUTES
 * (Valid JWT / Authorization Header Required)
 * ==========================================
 */

// Apply authMiddleware to all routes defined below this point

router.use(authMiddleware);
router.post("/switch-corporate", authController.switchCorporate);
router.post("/update-profile-image", tenantMiddleware, authController.updateProfileImage);
router.post("/delete-profile-image", tenantMiddleware, authController.deleteProfileImage);
router.get("/get-profile-history", tenantMiddleware, authController.getProfileHistory);
router.put("/url-configure/:id", tenantMiddleware, authController.apiUrlsConfigureSave);
router.post("/provision-tenant", authController.provisionTenant);
router.post("/send-message", tenantMiddleware, authController.sendMessage);

module.exports = router;