/**
 * autoEndScheduler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Robust scheduler for auto-closing single-worker and scheduled shift attendance.
 * Provides both in-memory real-time timers and resilient database sweepers.
 *
 * Integrated Capabilities:
 * 1. File-backed leave engine (leaveManager.js / leaves.json) - workers on approved leave ignored.
 * 2. Gap-aware shift rollover - prevents early starts (e.g., M ends 11 AM, A starts 2 PM).
 * 3. Strict bound worker validation - never resurrects delinked workers from historical attendance.
 * 4. Slot suppression registry - prevents 60s sweeper from force-restarting removed/deleted shifts.
 * 5. 2-month inactivity daemon - auto-delinks workers with no duty started in > 60 days.
 */

'use strict';

const leaveManager = require('./leaveManager');

const MAX_TIMER_MS = 24 * 60 * 60 * 1000; // 24h cap

// Map: attendanceId (string) -> NodeJS.Timeout
const _timers = new Map();

// Valid billable / active lead statuses: strictly 'Accepted' only
const VALID_LEAD_STATUS_REGEX = /^accepted$/i;

const isValidLeadStatus = (status) => {
  if (!status) return false;
  return String(status).trim().toLowerCase() === 'accepted';
};

const VALID_LEAD_STATUSES_MONGO = ['Accepted', 'accepted'];

// ── Daily Shift Slot Suppression Registry ────────────────────────────────────
// Prevents the background sweeper from force-restarting a shift slot on the same
// day if a supervisor intentionally removed a worker who did not reach the site.
// Key format: `${tenantDbName}:${siteId}:${shiftCode}:${dateStr}` -> timestamp
const _suppressedSlots = new Map();

function suppressShiftSlot(tenantDbName, siteId, shiftCode, dateStr) {
  if (!tenantDbName || !siteId || !shiftCode) return;
  const dStr = dateStr || new Date().toISOString().split('T')[0];
  const key = `${tenantDbName}:${String(siteId)}:${String(shiftCode).trim().toUpperCase()}:${dStr}`;
  _suppressedSlots.set(key, Date.now());
  console.log(`🛡️ [autoEndScheduler] Suppressed shift slot for today: ${key}`);
}

function isShiftSlotSuppressed(tenantDbName, siteId, shiftCode, dateStr) {
  if (!tenantDbName || !siteId || !shiftCode) return false;
  const dStr = dateStr || new Date().toISOString().split('T')[0];
  const key = `${tenantDbName}:${String(siteId)}:${String(shiftCode).trim().toUpperCase()}:${dStr}`;
  return _suppressedSlots.has(key);
}

// Clean up suppression entries older than 24 hours to prevent memory leaks
function cleanupSuppressionCache() {
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  for (const [key, ts] of _suppressedSlots.entries()) {
    if (ts < oneDayAgo) {
      _suppressedSlots.delete(key);
    }
  }
}

// ── Debounced Bulk Notification State: "{Worker count} Rollover successfully" ──
const _pendingRolloverCounts = new Map(); // tenantDbName -> count
const _pendingRolloverTimers = new Map(); // tenantDbName -> NodeJS.Timeout

function recordRolloverSuccess(tenantDbName, io, count = 1) {
  if (!io || !tenantDbName || count <= 0) return;

  const currentCount = (_pendingRolloverCounts.get(tenantDbName) || 0) + count;
  _pendingRolloverCounts.set(tenantDbName, currentCount);

  if (_pendingRolloverTimers.has(tenantDbName)) {
    clearTimeout(_pendingRolloverTimers.get(tenantDbName));
  }

  const timer = setTimeout(() => {
    const finalCount = _pendingRolloverCounts.get(tenantDbName) || 0;
    _pendingRolloverCounts.delete(tenantDbName);
    _pendingRolloverTimers.delete(tenantDbName);

    if (finalCount > 0) {
      io.to(tenantDbName).emit('admin:broadcast', {
        id: 'rollover-bulk-' + Date.now(),
        title: 'Auto Shift Rollover Successful',
        message: `${finalCount} Rollover successfully`,
        priority: 'normal',
        targetRoles: ['CorpAdmin', 'userAdmin', 'Project'],
        sentBy: 'System',
        at: new Date().toISOString(),
      });
      console.log(`📢 [autoEndScheduler] Emitted bulk rollover notification for tenant ${tenantDbName}: "${finalCount} Rollover successfully"`);
    }
  }, 2500); // 2.5s debounce to aggregate all concurrent / sweeper workers

  _pendingRolloverTimers.set(tenantDbName, timer);
}

function scheduleAutoEnd(attendanceId, scheduledEndAt, AttendanceModel, tenantDbName, io) {
  const id = String(attendanceId);
  cancelAutoEnd(id); // cancel any existing timer (idempotent)

  const delayMs = Math.max(0, Math.min(new Date(scheduledEndAt).getTime() - Date.now(), MAX_TIMER_MS));

  const timer = setTimeout(async () => {
    _timers.delete(id);
    try {
      const endTime = new Date(scheduledEndAt);
      const result = await AttendanceModel.findOneAndUpdate(
        { _id: id, $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }] },
        { $set: { dutyEnd: endTime, status: 'Present', autoCompleted: true, autoCompletedAt: endTime } },
        { new: true }
      );
      if (!result) return; // already clocked out manually - no-op

      const dutyStartDt = result.dutyStart ? new Date(result.dutyStart) : endTime;
      const elapsedHrs = (endTime.getTime() - dutyStartDt.getTime()) / 3600000;
      const standardHours = result.shiftHours || result.shiftLockHours || 8;
      const hoursWorked = parseFloat(Math.max(0, elapsedHrs).toFixed(2));
      const overtimeHours = parseFloat(Math.max(0, hoursWorked - standardHours).toFixed(2));
      const overtimeRate = 1.0; // Single rate (1.0x, not 1.5x)
      const baseDailyRate = result.dailyRate || result.rate || 0;
      const baseHourlyRate = baseDailyRate / standardHours;
      const overtimeEarn = parseFloat((overtimeHours * baseHourlyRate * overtimeRate).toFixed(2));
      const dailyEarn = parseFloat(((hoursWorked / standardHours) * baseDailyRate).toFixed(2));

      await AttendanceModel.updateOne(
        { _id: id },
        {
          $set: {
            hoursWorked,
            dailyRate: baseDailyRate,
            dailyEarn,
            isOvertime: overtimeHours > 0,
            overtimeHours,
            overtimeRate: 1.0,
            overtimeEarn,
          },
        }
      );

      if (io && tenantDbName) {
        io.to(tenantDbName).emit('attendance:duty_off', {
          employeeId: String(result.employeeId),
          attendanceId: id,
          hoursWorked,
          autoCompleted: true,
        });
        io.to(tenantDbName).emit('attendance:active_updated');
        io.to(tenantDbName).emit('admin:broadcast', {
          id: 'auto-end-' + id,
          title: 'Shift Auto-Completed',
          message: 'Single-worker shift (' + (result.shiftCode || '') + ') closed at scheduled end time.',
          priority: 'normal',
          targetRoles: ['CorpAdmin', 'userAdmin', 'Project'],
          sentBy: 'System',
          at: endTime.toISOString(),
        });
      }
      console.log('[autoEndScheduler] Auto-closed attendance ' + id + ' at scheduled end.');

      // ── Trigger Auto Shift Rollover to next bound worker ──
      handleAutoShiftRollover(result, AttendanceModel, tenantDbName, io).catch((err) =>
        console.error('[autoEndScheduler] Rollover error:', err.message)
      );
    } catch (err) {
      console.error('[autoEndScheduler] Error auto-closing attendance ' + id + ':', err.message);
    }
  }, delayMs);

  _timers.set(id, timer);
  console.log('[autoEndScheduler] Scheduled auto-end for ' + id + ' in ' + Math.round(delayMs / 60000) + ' min');
}

/**
 * Auto-Shift Rollover Engine:
 * When a shift ends, automatically starts the next shift for the site's bound worker
 * ONLY IF:
 * 1. Next shift is contiguous (gap <= 30 mins). If next shift starts hours later (e.g. 11 AM vs 2 PM),
 *    rollover strictly DEFERS starting until the scheduled start time via autoStartScheduledShifts.
 * 2. Shift has an explicitly bound, active worker in siteShifts.boundWorkerId. Never guesses delinked workers.
 * 3. Worker is not on approved leave in leave.json.
 * 4. Slot has not been suppressed/cancelled for today.
 */
async function handleAutoShiftRollover(closedAttendance, AttendanceModel, tenantDbName, io) {
  const effectiveLeadId = closedAttendance.leadId || closedAttendance.siteId;
  if (!closedAttendance || !effectiveLeadId) return;
  try {
    const db = AttendanceModel.db;
    const Leads = db.models.Leads || db.model('Leads');
    const lead = await Leads.findById(effectiveLeadId).lean();
    if (!lead || !Array.isArray(lead.siteShifts) || lead.siteShifts.length === 0) return;

    // 1) Logic Check: Lead status must be strictly 'Accepted'
    if (!isValidLeadStatus(lead.status)) {
      console.log(
        `[autoEndScheduler] Site "${lead.sender_name || lead.name}" has status "${lead.status}" (only "Accepted" leads allowed for marking attendance). Skipping rollover.`
      );
      return;
    }

    const activeSiteShifts = lead.siteShifts.filter((s) => s.active !== false);
    if (activeSiteShifts.length === 0) return;

    // 2) Single-shift site schedule check:
    if (activeSiteShifts.length === 1) {
      console.log(
        `[autoEndScheduler] Site "${lead.sender_name || 'Site'}" is a single-shift schedule (${activeSiteShifts[0].shiftCode}). Will auto-start at next scheduled start time.`
      );
      return;
    }

    // 3. Determine next shiftCode in cycle (for multi-shift sites)
    const outgoingCode = String(closedAttendance.shiftCode || '').trim().toUpperCase();
    let nextShiftCode = '';

    if (outgoingCode === 'D' || outgoingCode === 'DAY') {
      const nightShift = activeSiteShifts.find((s) => /^(N2|N|NIGHT)$/i.test(s.shiftCode));
      nextShiftCode = nightShift ? nightShift.shiftCode : 'N2';
    } else if (outgoingCode === 'N2' || outgoingCode === 'N' || outgoingCode === 'NIGHT') {
      const dayShift = activeSiteShifts.find((s) => /^(D|DAY|MORNING|M)$/i.test(s.shiftCode));
      nextShiftCode = dayShift ? dayShift.shiftCode : 'D';
    } else if (outgoingCode === 'M' || outgoingCode === 'MORNING') {
      const aftShift = activeSiteShifts.find((s) => /^(A|AFTERNOON)$/i.test(s.shiftCode));
      nextShiftCode = aftShift ? aftShift.shiftCode : 'A';
    } else if (outgoingCode === 'A' || outgoingCode === 'AFTERNOON') {
      const nightShift = activeSiteShifts.find((s) => /^(N|N2|NIGHT)$/i.test(s.shiftCode));
      nextShiftCode = nightShift ? nightShift.shiftCode : 'N';
    } else if (outgoingCode === 'G') {
      nextShiftCode = 'G';
    } else {
      const other = activeSiteShifts.find((s) => s.shiftCode !== outgoingCode);
      nextShiftCode = other ? other.shiftCode : outgoingCode;
    }

    const matchedShift =
      activeSiteShifts.find(
        (s) =>
          s.shiftCode === nextShiftCode || s.shiftCode.toUpperCase() === nextShiftCode.toUpperCase()
      ) || activeSiteShifts[0];

    const targetShiftCode = matchedShift.shiftCode || nextShiftCode;
    const endTime = closedAttendance.dutyEnd ? new Date(closedAttendance.dutyEnd) : new Date();
    const todayStr = endTime.toISOString().split('T')[0];

    // ── Check Daily Shift Slot Suppression ──
    if (isShiftSlotSuppressed(tenantDbName, effectiveLeadId, targetShiftCode, todayStr)) {
      console.log(
        `🛡️ [autoEndScheduler] Slot ${targetShiftCode} at site "${lead.sender_name || 'Site'}" is suppressed for today. Skipping rollover.`
      );
      return;
    }

    // 4. Resolve bound worker for target shift:
    // STRICT RULE: Only use explicitly bound worker in siteShifts.boundWorkerId.
    // NEVER query historical attendance to resurrect delinked or former workers!
    const incomingWorkerId = matchedShift.boundWorkerId
      ? String(matchedShift.boundWorkerId._id || matchedShift.boundWorkerId)
      : null;

    if (!incomingWorkerId) {
      console.log(
        `[autoEndScheduler] No bound worker assigned for next shift ${targetShiftCode} at site "${lead.sender_name || 'site'}". Skipping rollover.`
      );
      if (io && tenantDbName) {
        io.to(tenantDbName).emit('attendance:reliever_needed', {
          siteId: String(lead._id),
          siteName: lead.sender_name || lead.name || 'Site',
          shiftCode: targetShiftCode,
          reason: 'No bound worker assigned to shift',
        });
      }
      return;
    }

    const Employees = db.models.Employees || db.model('Employees');
    const incomingEmp = await Employees.findById(incomingWorkerId).lean();

    // Guard: Worker must exist and be active
    if (!incomingEmp || incomingEmp.active === false) {
      console.log(
        `[autoEndScheduler] Bound worker ${incomingWorkerId} is inactive/delinked. Skipping rollover.`
      );
      if (io && tenantDbName) {
        io.to(tenantDbName).emit('attendance:reliever_needed', {
          siteId: String(lead._id),
          siteName: lead.sender_name || lead.name || 'Site',
          shiftCode: targetShiftCode,
          boundWorkerId: incomingWorkerId,
          boundWorkerName: incomingEmp?.name || matchedShift.boundWorkerName || 'Worker',
          reason: 'Bound worker is inactive/delinked',
        });
      }
      return;
    }

    const incomingWorkerName = incomingEmp.name || matchedShift.boundWorkerName || 'Worker';

    // ── Check Approved Leave from leaveManager (leaves.json) ──
    const approvedLeave = leaveManager.isWorkerOnApprovedLeave(tenantDbName, incomingWorkerId, todayStr);
    if (approvedLeave) {
      console.log(
        `🏖️ [autoEndScheduler] Worker ${incomingWorkerName} is on APPROVED LEAVE (${approvedLeave.fromDate} to ${approvedLeave.toDate}). Skipping rollover.`
      );
      if (io && tenantDbName) {
        io.to(tenantDbName).emit('attendance:reliever_needed', {
          siteId: String(lead._id),
          siteName: lead.sender_name || lead.name || 'Site',
          shiftCode: targetShiftCode,
          boundWorkerId: incomingWorkerId,
          boundWorkerName: incomingWorkerName,
          reason: `On Approved Leave until ${approvedLeave.toDate} (${approvedLeave.leaveType || 'Leave'})`,
        });
      }
      return;
    }

    // Guard: Prevent double-clocking if this incoming worker is already on duty anywhere
    const alreadyActive = await AttendanceModel.findOne({
      employeeId: incomingWorkerId,
      $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
    }).lean();

    if (alreadyActive) {
      console.log(`[autoEndScheduler] Bound worker ${incomingWorkerName} is already on duty. Skipping auto-clock in.`);
      return;
    }

    const startOfToday = new Date(endTime);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(endTime);
    endOfToday.setHours(23, 59, 59, 999);

    // Guard: Prevent double-clocking for the same shift if already marked today
    const alreadyDutyToday = await AttendanceModel.findOne({
      employeeId: incomingWorkerId,
      leadId: effectiveLeadId,
      shiftCode: targetShiftCode,
      date: { $gte: startOfToday, $lte: endOfToday },
    }).lean();

    if (alreadyDutyToday) {
      console.log(
        `[autoEndScheduler] Worker ${incomingWorkerName} already has attendance on shift ${targetShiftCode} today. Skipping auto-start.`
      );
      return;
    }

    // ── Check Weekly Rest, Shift Exemptions, Site Closure, and Allowed Holidays ──
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayOfWeek = days[endTime.getDay()];

    const isShiftRestDay =
      matchedShift.weeklyRestDay === dayOfWeek ||
      (Array.isArray(matchedShift.exemptDays) && matchedShift.exemptDays.includes(dayOfWeek));

    if (isShiftRestDay) {
      console.log(
        `[autoEndScheduler] Shift ${targetShiftCode} at ${lead.sender_name || 'Site'} has weekly rest on ${dayOfWeek}. Skipping auto-start.`
      );
      if (io && tenantDbName) {
        io.to(tenantDbName).emit('attendance:reliever_needed', {
          siteId: String(lead._id),
          siteName: lead.sender_name || lead.name || 'Site',
          shiftCode: targetShiftCode,
          boundWorkerId: incomingWorkerId,
          boundWorkerName: incomingWorkerName,
          reason: `${dayOfWeek} Weekly Rest`,
        });
      }
      return;
    }

    const nextDurationHrs = matchedShift.durationHrs || 8;

    // Strictly resolve scheduled shift start and end times from the shift definition
    let scheduledStartUtc = endTime;
    if (matchedShift.startTime) {
      const [mH, mM] = matchedShift.startTime.split(':').map(Number);
      const safeH = isNaN(mH) ? 8 : mH;
      const safeM = isNaN(mM) ? 0 : mM;

      const kolkataOffset = 5.5 * 3600000;
      const endTimeKolkata = new Date(endTime.getTime() + kolkataOffset);

      const targetToday = new Date(endTimeKolkata);
      targetToday.setUTCHours(safeH, safeM, 0, 0);

      const targetYesterday = new Date(targetToday.getTime() - 24 * 3600000);
      const targetTomorrow = new Date(targetToday.getTime() + 24 * 3600000);

      const diffs = [
        { diff: Math.abs(endTimeKolkata.getTime() - targetToday.getTime()), target: targetToday },
        { diff: Math.abs(endTimeKolkata.getTime() - targetYesterday.getTime()), target: targetYesterday },
        { diff: Math.abs(endTimeKolkata.getTime() - targetTomorrow.getTime()), target: targetTomorrow },
      ];
      diffs.sort((a, b) => a.diff - b.diff);
      const nearest = diffs[0].target;
      scheduledStartUtc = new Date(nearest.getTime() - kolkataOffset);
    }

    // ── 🛑 GAP & TIMING PROTECTION: 11:00 AM vs 2:00 PM Issue ────────────────
    // If outgoing shift ended at 11:00 AM, but next shift starts at 2:00 PM (14:00),
    // there is a 3-hour gap! We must NOT start the shift at 11:00 AM.
    // Rollover only immediately marks duty if shifts are contiguous (gap <= 30 mins).
    // Otherwise, we defer to autoStartScheduledShifts when 2:00 PM arrives.
    const MAX_ROLLOVER_HANDOVER_GAP_MS = 30 * 60 * 1000; // 30 minutes threshold
    const gapMs = scheduledStartUtc.getTime() - endTime.getTime();

    if (gapMs > MAX_ROLLOVER_HANDOVER_GAP_MS) {
      console.log(
        `⏱️ [autoEndScheduler] Non-continuous shift detected. Shift ${outgoingCode} ended at ${endTime.toISOString()}, but next shift ${targetShiftCode} starts at ${scheduledStartUtc.toISOString()} (${Math.round(gapMs / 60000)}m gap). Shift will auto-start at its scheduled start time.`
      );
      return; // Defer to autoStartScheduledShifts at scheduled start time!
    }

    const nextDutyEndScheduled = new Date(scheduledStartUtc.getTime() + nextDurationHrs * 3600000);
    const resolvedDailyRate = matchedShift.salaryRate || incomingEmp.daily_rate || incomingEmp.rate || 0;

    const newDuty = new AttendanceModel({
      employeeId: incomingWorkerId,
      employeeType: 'Employees',
      workerName: incomingWorkerName,
      role: incomingEmp?.role || closedAttendance.role || 'Security',
      leadId: effectiveLeadId,
      siteId: effectiveLeadId,
      clientId: closedAttendance.clientId || lead.clientId || null,
      site_name: lead.sender_name || lead.name || closedAttendance.site_name,
      status: 'Present',
      dutyLevel: 1,
      rate: resolvedDailyRate,
      dailyRate: resolvedDailyRate,
      date: scheduledStartUtc,
      dutyStart: scheduledStartUtc,
      dutyStartScheduled: scheduledStartUtc,
      dutyEndScheduled: nextDutyEndScheduled,
      shiftCode: targetShiftCode,
      shiftType: nextDurationHrs === 12 ? '12hr' : '8hr',
      shiftPeriod:
        matchedShift.shiftPeriod ||
        (targetShiftCode === 'N2' ? 'Night12' : targetShiftCode === 'D' ? 'Day' : 'General'),
      shiftHours: nextDurationHrs,
      shiftLockHours: nextDurationHrs,
      dutyEnd: null,
      forcedOff: false,
      markedByDevice: false,
      markedByUserName: 'Auto Shift Rollover',
      remarks: `Auto-bound handover from ${closedAttendance.workerName || 'previous shift'}`,
    });

    await newDuty.save();

    // Schedule auto-end strictly at shift schedule end time
    scheduleAutoEnd(newDuty._id, nextDutyEndScheduled, AttendanceModel, tenantDbName, io);

    if (io && tenantDbName) {
      io.to(tenantDbName).emit('attendance:created', { data: newDuty });
      io.to(tenantDbName).emit('attendance:active_updated');
      recordRolloverSuccess(tenantDbName, io, 1);
    }
    console.log(
      `[autoEndScheduler] Auto-rolled over duty at ${lead.sender_name} to ${incomingWorkerName} (${targetShiftCode})`
    );
  } catch (rErr) {
    console.error('[autoEndScheduler] handleAutoShiftRollover error:', rErr.message);
  }
}

function cancelAutoEnd(attendanceId) {
  const id = String(attendanceId);
  if (_timers.has(id)) {
    clearTimeout(_timers.get(id));
    _timers.delete(id);
  }
}

/**
 * Sweeper function that detects and auto-closes any expired open shifts in MongoDB.
 */
async function sweepExpiredShifts(AttendanceModel, tenantDbName, io) {
  if (!AttendanceModel) return;
  try {
    const now = new Date();
    const expiredRecords = await AttendanceModel.find({
      $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
      dutyEndScheduled: { $exists: true, $ne: null, $lte: now },
    }).lean();

    if (!expiredRecords || expiredRecords.length === 0) return;

    for (const rec of expiredRecords) {
      const endTime = rec.dutyEndScheduled ? new Date(rec.dutyEndScheduled) : now;
      const dutyStartDt = rec.dutyStart ? new Date(rec.dutyStart) : endTime;
      const elapsedHrs = (endTime.getTime() - dutyStartDt.getTime()) / 3600000;
      const standardHours = rec.shiftHours || rec.shiftLockHours || 8;
      const hoursWorked = parseFloat(Math.max(0, elapsedHrs).toFixed(2));
      const overtimeHours = parseFloat(Math.max(0, hoursWorked - standardHours).toFixed(2));
      const overtimeRate = 1.0;
      const baseDailyRate = rec.dailyRate || rec.rate || 0;
      const baseHourlyRate = baseDailyRate / standardHours;
      const overtimeEarn = parseFloat((overtimeHours * baseHourlyRate * overtimeRate).toFixed(2));
      const dailyEarn = parseFloat(((hoursWorked / standardHours) * baseDailyRate).toFixed(2));

      const updated = await AttendanceModel.findOneAndUpdate(
        { _id: rec._id, $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }] },
        {
          $set: {
            dutyEnd: endTime,
            status: 'Present',
            autoCompleted: true,
            autoCompletedAt: endTime,
            hoursWorked,
            dailyRate: baseDailyRate,
            isOvertime: overtimeHours > 0,
            overtimeHours,
            overtimeRate: 1.0,
            overtimeEarn,
            dailyEarn,
          },
        },
        { new: true }
      );

      if (updated && io && tenantDbName) {
        cancelAutoEnd(rec._id);
        io.to(tenantDbName).emit('attendance:duty_off', {
          employeeId: String(rec.employeeId),
          attendanceId: String(rec._id),
          hoursWorked,
          autoCompleted: true,
        });
        io.to(tenantDbName).emit('attendance:active_updated');

        handleAutoShiftRollover(updated, AttendanceModel, tenantDbName, io).catch((err) =>
          console.error('[autoEndScheduler] Sweeper rollover error:', err.message)
        );
      }
    }
  } catch (err) {
    console.error('[autoEndScheduler] sweepExpiredShifts error:', err.message);
  }
}

let _sweeperInterval = null;
let _isSweeping = false;
let _lastInactivitySweepDate = '';

/**
 * Auto-Starts scheduled shifts across all sites for a tenant.
 * - Strictly respects shift.boundWorkerId. Never falls back to historical records of delinked workers.
 * - Ignores workers on approved leave in leaveManager (leaves.json).
 * - Honors slot suppression so deleted shifts are not resurrected every 60s.
 */
async function autoStartScheduledShifts(conn, tenantDbName, io) {
  if (!conn) return;
  try {
    const { getTenantModels } = require('../models/TenantModels');
    const { Attendance, Leads, Employees, SiteRosterHolidays } = getTenantModels(conn);
    if (!Attendance || !Leads || !Employees) return;

    const now = new Date();
    const istOffsetMs = 5.5 * 3600000;
    const istDate = new Date(now.getTime() + istOffsetMs);
    const todayDateStr = istDate.toISOString().split('T')[0];
    const currentHour = istDate.getUTCHours();
    const currentMin = istDate.getUTCMinutes();
    const currentTotalMins = currentHour * 60 + currentMin;

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDayOfWeek = days[istDate.getUTCDay()];

    const leads = await Leads.find({
      status: { $in: VALID_LEAD_STATUSES_MONGO },
      'siteShifts.active': { $ne: false },
    }).lean();

    if (!Array.isArray(leads) || leads.length === 0) return;

    const validLeads = leads.filter((l) => isValidLeadStatus(l.status));

    for (const lead of validLeads) {
      if (!Array.isArray(lead.siteShifts) || lead.siteShifts.length === 0) continue;
      const activeShifts = lead.siteShifts.filter((s) => s.active !== false);

      for (const shift of activeShifts) {
        const shiftCode = String(shift.shiftCode || 'G').trim().toUpperCase();

        // ── Check Daily Shift Slot Suppression ──
        if (isShiftSlotSuppressed(tenantDbName, lead._id, shiftCode, todayDateStr)) {
          continue;
        }

        const durationHrs = shift.durationHrs || (shift.shiftType === '12hr' ? 12 : 8);
        const startTimeStr =
          shift.startTime || (shiftCode === 'N2' || shiftCode === 'N' ? '20:00' : '08:00');
        const [sH, sM] = startTimeStr.split(':').map(Number);
        const safeH = isNaN(sH) ? 8 : sH;
        const safeM = isNaN(sM) ? 0 : safeM;
        const shiftStartMins = safeH * 60 + safeM;

        let isWithinShift = false;
        let shiftStartedToday = true;
        const shiftEndMinsRaw = shiftStartMins + durationHrs * 60;
        if (shiftEndMinsRaw <= 1440) {
          isWithinShift = currentTotalMins >= shiftStartMins && currentTotalMins < shiftEndMinsRaw;
          shiftStartedToday = true;
        } else {
          const wrappedEndMins = shiftEndMinsRaw % 1440;
          if (currentTotalMins >= shiftStartMins) {
            isWithinShift = true;
            shiftStartedToday = true;
          } else if (currentTotalMins < wrappedEndMins) {
            isWithinShift = true;
            shiftStartedToday = false;
          }
        }

        if (!isWithinShift) continue;

        const shiftCodesList = [shift.shiftCode, shift.shiftName, shift.shiftPeriod].filter(Boolean);
        const siteOrConditions = [
          { leadId: lead._id },
          { leadId: String(lead._id) },
          { siteId: lead._id },
          { siteId: String(lead._id) },
        ];

        // 1. Check current active duty count for this site and shift slot
        const activeCount = await Attendance.countDocuments({
          $and: [
            { $or: siteOrConditions },
            { shiftCode: { $in: shiftCodesList } },
            { $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }] },
          ],
        });

        const targetSlots = shift.workerSlots || 1;
        if (activeCount >= targetSlots) {
          continue;
        }

        // 2. Compute scheduled times accurately
        let baseIstDateStr = todayDateStr;
        if (!shiftStartedToday) {
          const yesterdayIst = new Date(istDate.getTime() - 24 * 3600000);
          baseIstDateStr = yesterdayIst.toISOString().split('T')[0];
        }

        const scheduledStartIst = new Date(baseIstDateStr + 'T00:00:00.000Z');
        scheduledStartIst.setUTCHours(safeH, safeM, 0, 0);
        const scheduledStartUtc = new Date(scheduledStartIst.getTime() - istOffsetMs);
        const scheduledEndUtc = new Date(scheduledStartUtc.getTime() + durationHrs * 3600000);

        if (now >= scheduledEndUtc) continue;

        // Check if duty has already started today for this site & shift slot
        const alreadyRanDuty = await Attendance.findOne({
          $and: [
            { $or: siteOrConditions },
            { shiftCode: { $in: shiftCodesList } },
            {
              dutyStart: {
                $gte: new Date(scheduledStartUtc.getTime() - 2 * 3600000),
                $lte: scheduledEndUtc,
              },
            },
          ],
        }).lean();

        if (alreadyRanDuty) {
          continue;
        }

        // 3. Resolve Worker: STRICT BOUND WORKER ONLY.
        // NEVER fetch delinked workers from previous attendance history!
        const targetWorkerId = shift.boundWorkerId
          ? String(shift.boundWorkerId._id || shift.boundWorkerId)
          : null;

        if (!targetWorkerId) {
          if (io && tenantDbName) {
            io.to(tenantDbName).emit('attendance:reliever_needed', {
              siteId: String(lead._id),
              siteName: lead.sender_name || lead.name || 'Site',
              shiftCode: shift.shiftCode,
              reason: 'No bound worker assigned to shift',
            });
          }
          continue;
        }

        const emp = await Employees.findById(targetWorkerId).lean();
        if (!emp || emp.active === false) {
          if (io && tenantDbName) {
            io.to(tenantDbName).emit('attendance:reliever_needed', {
              siteId: String(lead._id),
              siteName: lead.sender_name || lead.name || 'Site',
              shiftCode: shift.shiftCode,
              boundWorkerId: targetWorkerId,
              boundWorkerName: emp?.name || shift.boundWorkerName || 'Worker',
              reason: 'Bound worker is inactive or delinked',
            });
          }
          continue;
        }

        const workerName = emp.name || shift.boundWorkerName || 'Worker';

        // ── Check Approved Leave from leaveManager (leaves.json) ──
        const approvedLeave = leaveManager.isWorkerOnApprovedLeave(tenantDbName, targetWorkerId, todayDateStr);
        if (approvedLeave) {
          console.log(
            `🏖️ [autoEndScheduler] Worker ${workerName} is on APPROVED LEAVE (${approvedLeave.fromDate} to ${approvedLeave.toDate}). Skipping auto-start.`
          );
          if (io && tenantDbName) {
            io.to(tenantDbName).emit('attendance:reliever_needed', {
              siteId: String(lead._id),
              siteName: lead.sender_name || lead.name || 'Site',
              shiftCode: shift.shiftCode,
              boundWorkerId: targetWorkerId,
              boundWorkerName: workerName,
              reason: `On Approved Leave until ${approvedLeave.toDate} (${approvedLeave.leaveType || 'Leave'})`,
            });
          }
          continue;
        }

        // 4. Guard: Worker already active on any duty?
        const workerBusy = await Attendance.findOne({
          employeeId: targetWorkerId,
          $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
        }).lean();

        if (workerBusy) continue;

        // 5. Guard: Weekly Rest Day & Exempt Days
        const isShiftRestDay =
          shift.weeklyRestDay === currentDayOfWeek ||
          (Array.isArray(shift.exemptDays) && shift.exemptDays.includes(currentDayOfWeek));

        if (isShiftRestDay) {
          if (io && tenantDbName) {
            io.to(tenantDbName).emit('attendance:reliever_needed', {
              siteId: String(lead._id),
              siteName: lead.sender_name || lead.name || 'Site',
              shiftCode: shift.shiftCode,
              boundWorkerId: targetWorkerId,
              boundWorkerName: workerName,
              reason: `${currentDayOfWeek} Weekly Rest`,
            });
          }
          continue;
        }

        // 6. Guard: SiteRosterHolidays
        if (SiteRosterHolidays) {
          const offRecord = await SiteRosterHolidays.findOne({
            siteId: lead._id,
            $or: [
              { workerId: targetWorkerId, type: 'WeeklyRest', restDayOfWeek: currentDayOfWeek },
              {
                workerId: targetWorkerId,
                date: todayDateStr,
                type: { $in: ['SickLeave', 'CasualLeave', 'OtherLeave', 'PaidHoliday'] },
              },
              { date: todayDateStr, type: 'SiteClosed' },
            ],
          }).lean();

          if (offRecord) {
            if (io && tenantDbName) {
              io.to(tenantDbName).emit('attendance:reliever_needed', {
                siteId: String(lead._id),
                siteName: lead.sender_name || lead.name || 'Site',
                shiftCode: shift.shiftCode,
                boundWorkerId: targetWorkerId,
                boundWorkerName: workerName,
                reason: offRecord.remark || offRecord.type,
              });
            }
            continue;
          }
        }

        // 7. Auto-start duty on clock set in client shift schedule
        const dutyStartActual = scheduledStartUtc;
        const dutyEndScheduled = scheduledEndUtc;
        const resolvedDailyRate = shift.salaryRate || emp.daily_rate || emp.rate || 0;

        const newDuty = new Attendance({
          employeeId: targetWorkerId,
          employeeType: 'Employees',
          workerName,
          role: emp?.role || 'Security',
          leadId: lead._id,
          siteId: lead._id,
          clientId: lead.clientId || null,
          site_name: lead.sender_name || lead.name || 'Site',
          status: 'Present',
          dutyLevel: 1,
          rate: resolvedDailyRate,
          dailyRate: resolvedDailyRate,
          date: scheduledStartUtc,
          dutyStart: dutyStartActual,
          dutyStartScheduled: scheduledStartUtc,
          dutyEndScheduled: dutyEndScheduled,
          shiftCode: shift.shiftCode,
          shiftType: durationHrs === 12 ? '12hr' : '8hr',
          shiftPeriod:
            shift.shiftPeriod ||
            (shiftCode === 'N2' ? 'Night12' : shiftCode === 'D' ? 'Day' : 'General'),
          shiftHours: durationHrs,
          shiftLockHours: durationHrs,
          dutyEnd: null,
          forcedOff: false,
          markedByDevice: false,
          markedByUserName: 'Auto Shift Rollover',
          remarks: `Auto-started duty for ${shift.shiftName || shiftCode} (Bound Worker)`,
        });

        await newDuty.save();

        scheduleAutoEnd(newDuty._id, dutyEndScheduled, Attendance, tenantDbName, io);

        if (io && tenantDbName) {
          io.to(tenantDbName).emit('attendance:created', { data: newDuty });
          io.to(tenantDbName).emit('attendance:active_updated');
          recordRolloverSuccess(tenantDbName, io, 1);
        }

        console.log(
          `[autoEndScheduler] Auto-started scheduled shift ${shiftCode} at site "${lead.sender_name || 'Site'}" for ${workerName} (${targetWorkerId})`
        );
      }
    }
  } catch (err) {
    console.error('[autoEndScheduler] autoStartScheduledShifts error:', err.message);
  }
}

/**
 * 2-Month Inactivity Daemon:
 * Detects workers who have not started duty for > 60 days (2 months).
 * Automatically marks them active: false and delinks them from siteShifts.boundWorkerId.
 */
async function autoDelinkInactiveWorkers(conn, tenantDbName, io) {
  if (!conn) return;
  try {
    const { getTenantModels } = require('../models/TenantModels');
    const { Employees, Attendance, Leads } = getTenantModels(conn);
    if (!Employees || !Attendance || !Leads) return;

    const twoMonthsAgo = new Date();
    twoMonthsAgo.setDate(twoMonthsAgo.getDate() - 60);

    const activeEmployees = await Employees.find({ active: { $ne: false } }).lean();
    if (!Array.isArray(activeEmployees) || activeEmployees.length === 0) return;

    let delinkedCount = 0;

    for (const emp of activeEmployees) {
      const latestDuty = await Attendance.findOne({ employeeId: emp._id })
        .sort({ dutyStart: -1 })
        .select('dutyStart')
        .lean();

      let isInactive = false;
      if (latestDuty && latestDuty.dutyStart) {
        if (new Date(latestDuty.dutyStart) < twoMonthsAgo) {
          isInactive = true;
        }
      } else {
        const createdDate = emp.createdAt ? new Date(emp.createdAt) : new Date(0);
        if (createdDate < twoMonthsAgo) {
          isInactive = true;
        }
      }

      if (isInactive) {
        await Employees.updateOne(
          { _id: emp._id },
          { $set: { active: false, inactiveReason: 'Auto-delinked: No duty in last 2 months' } }
        );

        await Leads.updateMany(
          { 'siteShifts.boundWorkerId': emp._id },
          {
            $set: {
              'siteShifts.$[elem].boundWorkerId': null,
              'siteShifts.$[elem].boundWorkerName': '',
            },
          },
          { arrayFilters: [{ 'elem.boundWorkerId': emp._id }] }
        );

        delinkedCount++;
        console.log(
          `🚪 [autoEndScheduler] Auto-delinked inactive worker ${emp.name} (${emp._id}) - no duty started in > 60 days.`
        );
      }
    }

    if (delinkedCount > 0 && io && tenantDbName) {
      io.to(tenantDbName).emit('admin:broadcast', {
        id: 'delink-inactive-' + Date.now(),
        title: 'Workforce Auto-Delink',
        message: `${delinkedCount} inactive worker(s) automatically marked delinked due to 60+ days without duty.`,
        priority: 'low',
        targetRoles: ['CorpAdmin', 'userAdmin'],
        sentBy: 'System',
        at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('[autoEndScheduler] autoDelinkInactiveWorkers error:', err.message);
  }
}

/**
 * Sweeps all active tenant databases to:
 * 1. Auto-close expired shifts and compute OT.
 * 2. Auto-start scheduled shifts across active sites.
 * 3. Daily check for inactive workers (> 60 days) to auto-delink.
 * Runs independently 24/7.
 */
async function sweepAllTenants(io) {
  if (_isSweeping) return;
  _isSweeping = true;
  try {
    cleanupSuppressionCache();

    const userMaster = require('../models/userMaster');
    const dbConnector = require('./dbConnector');
    const { getTenantModels } = require('../models/TenantModels');

    const dbNames = await userMaster.distinct('accessCorporate.dbName', {
      'accessCorporate.isActive': { $ne: false },
    });

    if (!Array.isArray(dbNames) || dbNames.length === 0) {
      _isSweeping = false;
      return;
    }

    const todayDateStr = new Date().toISOString().split('T')[0];
    const shouldRunDailyInactivitySweep = _lastInactivitySweepDate !== todayDateStr;

    for (const dbName of dbNames) {
      if (!dbName) continue;
      try {
        const conn = await dbConnector.getTenantConnection(dbName);
        if (conn && conn.readyState === 1) {
          const { Attendance } = getTenantModels(conn);
          if (Attendance) {
            await sweepExpiredShifts(Attendance, dbName, io);
          }
          await autoStartScheduledShifts(conn, dbName, io);

          if (shouldRunDailyInactivitySweep) {
            await autoDelinkInactiveWorkers(conn, dbName, io);
          }
        }
      } catch (tenantErr) {
        // Non-fatal per-tenant error
      }
    }

    if (shouldRunDailyInactivitySweep) {
      _lastInactivitySweepDate = todayDateStr;
    }
  } catch (err) {
    console.error('[autoEndScheduler] sweepAllTenants error:', err.message);
  } finally {
    _isSweeping = false;
  }
}

function startBackgroundSweeper(io, intervalMs = 60 * 1000) {
  if (_sweeperInterval) {
    clearInterval(_sweeperInterval);
  }

  const mins = Math.round(intervalMs / 60000);
  console.log(`⏱️ [autoEndScheduler] 24/7 Background Cron Sweeper active (every ${mins}m)`);

  setTimeout(() => {
    sweepAllTenants(io).catch((err) => console.error('[autoEndScheduler] Boot sweep failed:', err.message));
  }, 5000);

  _sweeperInterval = setInterval(() => {
    sweepAllTenants(io).catch((err) => console.error('[autoEndScheduler] Sweeper daemon failed:', err.message));
  }, intervalMs);

  return _sweeperInterval;
}

function activeTimerCount() {
  return _timers.size;
}

module.exports = {
  scheduleAutoEnd,
  cancelAutoEnd,
  sweepExpiredShifts,
  sweepAllTenants,
  startBackgroundSweeper,
  activeTimerCount,
  handleAutoShiftRollover,
  autoStartScheduledShifts,
  recordRolloverSuccess,
  suppressShiftSlot,
  isShiftSlotSuppressed,
  autoDelinkInactiveWorkers,
};
