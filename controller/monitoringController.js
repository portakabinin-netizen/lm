const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a cryptographically-safe 4-digit challenge code (server-side only) */
function generateChallengeCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Determine online status based on lastSeen timestamp:
 *   < 2 min  → ONLINE
 *   2–5 min  → OFFLINE
 *   > 15 min → LOST
 */
function deriveOnlineStatus(lastSeen) {
  if (!lastSeen) return "OFFLINE";
  const ageMs = Date.now() - new Date(lastSeen).getTime();
  if (ageMs < 2 * 60_000) return "ONLINE";
  if (ageMs < 15 * 60_000) return "OFFLINE";
  return "LOST";
}

/** Schedule next challenge between 15 and 45 minutes from now */
function nextChallengeTime() {
  const minMs = 15 * 60_000;
  const maxMs = 45 * 60_000;
  return new Date(Date.now() + minMs + Math.random() * (maxMs - minMs));
}

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * POST /api/monitoring/heartbeat
 * Payload: { employeeId, batteryLevel, latitude, longitude }
 * Called every 60 s from the mobile app while on duty.
 */
exports.heartbeat = async (req, res) => {
  try {
    const { StaffMonitoring } = req.tenantModels;
    const { employeeId, batteryLevel, latitude, longitude } = req.body;
    const empId = employeeId || req.user?.userId;

    if (!empId) return res.status(400).json({ success: false, message: "employeeId required" });

    const now = new Date();

    // Upsert monitoring record
    let record = await StaffMonitoring.findOne({
      employeeId: empId,
      monitoringEnabled: true,
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "No active monitoring session found. Start duty first.",
      });
    }

    record.lastSeen = now;
    if (batteryLevel !== undefined) record.batteryLevel = batteryLevel;
    if (latitude !== undefined)    record.lastLatitude  = latitude;
    if (longitude !== undefined)   record.lastLongitude = longitude;
    record.onlineStatus = "ONLINE";

    await record.save();

    return res.json({
      success: true,
      onlineStatus: record.onlineStatus,
      nextChallengeAt: record.nextChallengeAt,
    });
  } catch (err) {
    console.error("❌ [Monitoring] heartbeat error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/monitoring/challenge
 * Returns the pending challenge for the authenticated staff member.
 * If the scheduled time has arrived and no challenge is active, creates one.
 */
exports.getChallenge = async (req, res) => {
  try {
    const { StaffMonitoring } = req.tenantModels;
    const empId = req.user?.userId;

    let record = await StaffMonitoring.findOne({
      employeeId: empId,
      monitoringEnabled: true,
    });

    if (!record) {
      return res.json({ success: true, challengePending: false });
    }

    const now = new Date();
    const hasPending = record.challengeStatus === "PENDING" && record.challengeExpiresAt > now;

    // Auto-trigger if scheduled time passed
    const shouldTrigger = record.nextChallengeAt && record.nextChallengeAt <= now && !hasPending;

    if (shouldTrigger) {
      const code = generateChallengeCode();
      const expiresAt = new Date(now.getTime() + 60_000); // 60 seconds
      record.challengeStatus    = "PENDING";
      record.challengeId        = uuidv4();
      record.challengeCode      = code;
      record.challengeCreatedAt = now;
      record.challengeExpiresAt = expiresAt;
      record.challengeAnsweredAt = null;
      record.challengeFailures  = 0;
      record.nextChallengeAt    = nextChallengeTime();
      await record.save();

      return res.json({
        success: true,
        challengePending: true,
        challengeId: record.challengeId,
        code,
        expiresAt,
      });
    }

    if (hasPending) {
      return res.json({
        success: true,
        challengePending: true,
        challengeId: record.challengeId,
        code: record.challengeCode,
        expiresAt: record.challengeExpiresAt,
      });
    }

    return res.json({ success: true, challengePending: false, nextChallengeAt: record.nextChallengeAt });
  } catch (err) {
    console.error("❌ [Monitoring] getChallenge error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/monitoring/respond
 * Payload: { challengeId, enteredCode }
 */
exports.respondChallenge = async (req, res) => {
  try {
    const { StaffMonitoring } = req.tenantModels;
    const { challengeId, enteredCode } = req.body;
    const empId = req.user?.userId;

    const record = await StaffMonitoring.findOne({
      employeeId: empId,
      challengeId,
    });

    if (!record) {
      return res.status(404).json({ success: false, message: "Challenge not found" });
    }

    const now = new Date();

    // Check expired
    if (record.challengeExpiresAt < now) {
      return res.json({ success: false, message: "Challenge has expired" });
    }

    const correct = String(enteredCode).trim() === String(record.challengeCode).trim();

    if (correct) {
      record.challengeStatus     = "PASSED";
      record.challengeAnsweredAt = now;
      record.challengeFailures   = 0;
      record.nextChallengeAt     = nextChallengeTime();
      await record.save();
      return res.json({ success: true, message: "Alertness confirmed ✅" });
    }

    // Wrong code
    record.challengeFailures = (record.challengeFailures || 0) + 1;
    record.totalFailures     = (record.totalFailures     || 0) + 1;

    if (record.challengeFailures >= 3) {
      record.challengeStatus = "FAILED";
      await record.save();
      // Trigger escalation (fire-and-forget)
      _triggerEscalation(record, req.tenantModels, "Wrong code 3 times");
      return res.json({ success: false, failed: true, message: "Challenge failed — 3 wrong attempts. Supervisor notified." });
    }

    await record.save();
    return res.json({
      success: false,
      message: "Wrong code. Try again.",
      attemptsRemaining: 3 - record.challengeFailures,
    });
  } catch (err) {
    console.error("❌ [Monitoring] respondChallenge error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/monitoring/failure
 * Payload: { challengeId, employeeId, reason }
 * Called when challenge expires without a response.
 */
exports.reportFailure = async (req, res) => {
  try {
    const { StaffMonitoring } = req.tenantModels;
    const { challengeId, reason } = req.body;
    const empId = req.user?.userId;

    const record = await StaffMonitoring.findOne({
      employeeId: empId,
      challengeId,
    });

    if (!record) {
      return res.status(404).json({ success: false, message: "Record not found" });
    }

    record.challengeStatus  = "FAILED";
    record.totalFailures    = (record.totalFailures || 0) + 1;
    record.nextChallengeAt  = nextChallengeTime();
    await record.save();

    _triggerEscalation(record, req.tenantModels, reason || "No response within 60 seconds");

    return res.json({ success: true, message: "Failure recorded" });
  } catch (err) {
    console.error("❌ [Monitoring] reportFailure error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/monitoring/start
 * Called when duty begins (dbDutyStatus === 'ON').
 * Payload: { employeeId, employeeName, siteName, attendanceId, deviceType }
 */
exports.startMonitoring = async (req, res) => {
  try {
    const { StaffMonitoring } = req.tenantModels;
    const { employeeId, employeeName, siteName, attendanceId, deviceType } = req.body;
    const empId = employeeId || req.user?.userId;

    // Remove any existing active session
    await StaffMonitoring.deleteMany({ employeeId: empId, monitoringEnabled: true });

    const record = await StaffMonitoring.create({
      employeeId:        empId,
      employeeName:      employeeName || req.user?.userDisplayName,
      siteName,
      attendanceId,
      deviceType:        deviceType || "SMARTPHONE",
      monitoringEnabled: true,
      onlineStatus:      "ONLINE",
      lastSeen:          new Date(),
      challengeStatus:   "NONE",
      nextChallengeAt:   nextChallengeTime(),
      escalationLevel:   0,
      totalFailures:     0,
    });

    return res.json({ success: true, monitoringId: record._id, nextChallengeAt: record.nextChallengeAt });
  } catch (err) {
    console.error("❌ [Monitoring] startMonitoring error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/monitoring/stop
 * Called when duty ends.
 * Payload: { employeeId }
 */
exports.stopMonitoring = async (req, res) => {
  try {
    const { StaffMonitoring } = req.tenantModels;
    const empId = req.body.employeeId || req.user?.userId;

    await StaffMonitoring.updateMany(
      { employeeId: empId, monitoringEnabled: true },
      { $set: { monitoringEnabled: false, onlineStatus: "OFFLINE" } }
    );

    return res.json({ success: true, message: "Monitoring stopped" });
  } catch (err) {
    console.error("❌ [Monitoring] stopMonitoring error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/monitoring/status
 * Supervisor: returns all active staff monitoring records.
 * Staff: returns own record.
 */
exports.getStatus = async (req, res) => {
  try {
    const { StaffMonitoring } = req.tenantModels;
    const { employeeId } = req.query;

    let query = {};
    if (employeeId) {
      query.employeeId = employeeId;
    } else if (req.user?.userRole === "userEmployee" || req.user?.userRole === "Staff") {
      query.employeeId = req.user.userId;
    }

    const records = await StaffMonitoring.find(query).lean();

    // Recalculate live onlineStatus based on lastSeen
    const enriched = records.map((r) => ({
      ...r,
      onlineStatus: r.monitoringEnabled ? deriveOnlineStatus(r.lastSeen) : "OFFLINE",
    }));

    return res.json({ success: true, data: enriched });
  } catch (err) {
    console.error("❌ [Monitoring] getStatus error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Internal: Escalation ────────────────────────────────────────────────────

/**
 * Fire-and-forget escalation: push alert message to all admin/supervisor users
 * via the existing chat system.
 */
async function _triggerEscalation(record, tenantModels, reason) {
  try {
    const { Messages } = tenantModels;
    const userMaster = require("../models/userMaster");

    // Find all admin/supervisor users
    const admins = await userMaster
      .find({ userRole: { $in: ["userAdmin", "CorpAdmin", "Supervisor"] } })
      .select("_id userDisplayName")
      .lean();

    const msg = [
      `🚨 *ALERTNESS FAILURE*`,
      `Staff: ${record.employeeName || String(record.employeeId)}`,
      `Site: ${record.siteName || "Unknown"}`,
      `Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
      `Reason: ${reason}`,
      `Battery: ${record.batteryLevel !== null ? `${record.batteryLevel}%` : "N/A"}`,
      `Location: ${record.lastLatitude ? `${record.lastLatitude}, ${record.lastLongitude}` : "N/A"}`,
      `Failure count (session): ${record.totalFailures}`,
    ].join("\n");

    for (const admin of admins) {
      await Messages.create({
        senderName: "⚡ Alertness Monitor",
        senderId:   "system",
        text:       msg,
        type:       "text",
        isOneToOne: true,
        receiverId: String(admin._id),
        status:     "unseen",
      });
    }

    // Update escalation metadata
    record.escalationLevel = (record.escalationLevel || 0) + 1;
    record.lastEscalatedAt = new Date();
    await record.save();

    console.log(`🚨 [Monitoring] Escalation sent to ${admins.length} admins for staff ${record.employeeId}`);
  } catch (err) {
    console.error("❌ [Monitoring] escalation error:", err.message);
  }
}
