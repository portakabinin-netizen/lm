const mongoose = require("mongoose");

/**
 * 🛡️ StaffMonitoring Schema
 * Tracks alertness monitoring state per staff per attendance record.
 * Stored inside the tenant DB so it is isolated per corporate.
 */
const staffMonitoringSchema = new mongoose.Schema(
  {
    employeeId:       { type: mongoose.Schema.Types.ObjectId, required: true },
    attendanceId:     { type: mongoose.Schema.Types.ObjectId, ref: "Attendance" }, // linked open duty record
    employeeName:     { type: String, trim: true },
    siteName:         { type: String, trim: true },
    locationId:       { type: mongoose.Schema.Types.ObjectId },

    // ── Device type ──────────────────────────────────────────────────────────
    deviceType:       { type: String, enum: ["SMARTPHONE", "FEATURE_PHONE"], default: "SMARTPHONE" },
    hasSmartphone:    { type: Boolean, default: true },

    // ── Online status ─────────────────────────────────────────────────────────
    monitoringEnabled: { type: Boolean, default: false },
    onlineStatus:      { type: String, enum: ["ONLINE", "OFFLINE", "LOST"], default: "OFFLINE" },
    lastSeen:          { type: Date },
    batteryLevel:      { type: Number, default: null },
    lastLatitude:      { type: Number },
    lastLongitude:     { type: Number },

    // ── Challenge state ───────────────────────────────────────────────────────
    challengeStatus:    { type: String, enum: ["NONE", "PENDING", "PASSED", "FAILED"], default: "NONE" },
    challengeId:        { type: String },        // UUID for this challenge round
    challengeCode:      { type: String },        // 4-digit code generated server-side
    challengeCreatedAt: { type: Date },
    challengeExpiresAt: { type: Date },
    challengeAnsweredAt:{ type: Date },
    challengeFailures:  { type: Number, default: 0 }, // wrong attempts this round
    totalFailures:      { type: Number, default: 0 }, // cumulative across session

    // ── Escalation ────────────────────────────────────────────────────────────
    escalationLevel:  { type: Number, default: 0 }, // 0 = none, 1+ = escalated n times
    lastEscalatedAt:  { type: Date },

    // ── Next challenge schedule ───────────────────────────────────────────────
    nextChallengeAt:  { type: Date },
  },
  { timestamps: true, collection: "StaffMonitoring" }
);

staffMonitoringSchema.index({ employeeId: 1 });
staffMonitoringSchema.index({ onlineStatus: 1 });
staffMonitoringSchema.index({ monitoringEnabled: 1 });

module.exports = { staffMonitoringSchema };
