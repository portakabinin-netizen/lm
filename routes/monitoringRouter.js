const express  = require("express");
const router   = express.Router();
const auth     = require("../middleware/authMiddleware");
const tenant   = require("../middleware/tenantMiddleware");
const ctrl     = require("../controller/monitoringController");

// All monitoring routes require auth + tenant resolution
router.use(auth);
router.use(tenant);

// ── Guard-side routes ─────────────────────────────────────────────────────────
router.post("/start",      ctrl.startMonitoring);   // Start session when duty begins
router.post("/stop",       ctrl.stopMonitoring);    // End session when duty ends
router.post("/heartbeat",  ctrl.heartbeat);          // Heartbeat every 60 s
router.get("/challenge",   ctrl.getChallenge);       // Poll for active challenge
router.post("/respond",    ctrl.respondChallenge);   // Submit challenge answer
router.post("/failure",    ctrl.reportFailure);      // Report timeout/failure

// ── Supervisor-side routes ────────────────────────────────────────────────────
router.get("/status",      ctrl.getStatus);          // Dashboard: all guard statuses

module.exports = router;
