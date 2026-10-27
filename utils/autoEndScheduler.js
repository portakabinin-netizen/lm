/**
 * autoEndScheduler.js
 * Robust scheduler for auto-closing single-worker and scheduled shift attendance.
 * Provides both in-memory real-time timers and resilient database sweepers.
 */

'use strict';

const MAX_TIMER_MS = 24 * 60 * 60 * 1000; // 24h cap

// Map: attendanceId (string) -> NodeJS.Timeout
const _timers = new Map();

// Valid billable / active lead statuses: strictly 'Accepted' only
const VALID_LEAD_STATUS_REGEX = /^accepted$/i;

const isValidLeadStatus = (status) => {
  if (!status) return false;
  return String(status).trim().toLowerCase() === 'accepted';
};

const VALID_LEAD_STATUSES_MONGO = [
  'Accepted', 'accepted',
];

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

      const elapsedHrs = (endTime - result.dutyStart) / 3600000;
      const standardHours = result.shiftHours || result.shiftLockHours || 8;
      const hoursWorked = parseFloat(Math.max(0, elapsedHrs).toFixed(2));
      const overtimeHours = parseFloat(Math.max(0, hoursWorked - standardHours).toFixed(2));
      const overtimeRate = 1.0; // Single rate (1.0x, not 1.5x)
      const baseHourlyRate = (result.dailyRate || 0) / standardHours;
      const overtimeEarn = parseFloat((overtimeHours * baseHourlyRate * overtimeRate).toFixed(2));
      const dailyEarn = parseFloat(((hoursWorked / standardHours) * (result.dailyRate || 0)).toFixed(2));
      await AttendanceModel.updateOne({ _id: id }, {
        $set: {
          hoursWorked,
          dailyEarn,
          isOvertime: overtimeHours > 0,
          overtimeHours,
          overtimeRate: 1.0,
          overtimeEarn,
        }
      });

      if (io && tenantDbName) {
        io.to(tenantDbName).emit('attendance:duty_off', {
          employeeId: String(result.employeeId), attendanceId: id, hoursWorked, autoCompleted: true,
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
 * (always picked from previous duty on same shift & site) unless today is weekly rest / leave.
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
    // If site has only 1 active shift, it does not immediately roll over into another shift upon ending.
    // Its attendance will be marked at its next scheduled start time via autoStartScheduledShifts.
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

    // 4. Resolve bound worker for target shift:
    // Priority A: matchedShift.boundWorkerId
    // Priority B: Previous duty on same shift, same site
    // Priority C: Any previous duty at same site
    let incomingWorkerId = matchedShift.boundWorkerId ? String(matchedShift.boundWorkerId) : null;
    let prevDuty = null;

    if (!incomingWorkerId) {
      prevDuty = await AttendanceModel.findOne({
        $or: [
          { leadId: effectiveLeadId },
          { leadId: String(effectiveLeadId) },
          { siteId: effectiveLeadId },
          { siteId: String(effectiveLeadId) },
        ],
        shiftCode: targetShiftCode,
        dutyEnd: { $exists: true, $ne: null },
      })
        .sort({ dutyStart: -1 })
        .lean();

      if (!prevDuty) {
        prevDuty = await AttendanceModel.findOne({
          $or: [
            { leadId: effectiveLeadId },
            { leadId: String(effectiveLeadId) },
            { siteId: effectiveLeadId },
            { siteId: String(effectiveLeadId) },
          ],
        })
          .sort({ dutyStart: -1 })
          .lean();
      }

      if (prevDuty && prevDuty.employeeId) {
        incomingWorkerId = String(prevDuty.employeeId);
      }
    }

    if (!incomingWorkerId) {
      console.log(
        `[autoEndScheduler] No bound worker found for next shift ${targetShiftCode} at site ${lead.sender_name || 'site'}`
      );
      if (io && tenantDbName) {
        io.to(tenantDbName).emit('attendance:reliever_needed', {
          siteId: String(lead._id),
          siteName: lead.sender_name || lead.name || 'Site',
          shiftCode: targetShiftCode,
          reason: 'No bound worker found from previous duty',
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
      console.log(`[autoEndScheduler] Bound worker ${incomingWorkerId} is already on duty. Skipping auto-clock in.`);
      return;
    }

    const Employees = db.models.Employees || db.model('Employees');
    const incomingEmp = await Employees.findById(incomingWorkerId).lean();
    const incomingWorkerName =
      incomingEmp?.name || matchedShift.boundWorkerName || prevDuty?.workerName || 'Worker';

    const endTime = closedAttendance.dutyEnd ? new Date(closedAttendance.dutyEnd) : new Date();
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
    const todayStr = endTime.toISOString().split('T')[0];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayOfWeek = days[endTime.getDay()];

    // A) Check Shift Weekly Rest Day & Exempt Days from shift configuration
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

    // B) Check SiteRosterHolidays (Site-level holidays + Worker-specific leaves)
    const SiteRosterHolidays = db.models.SiteRosterHolidays || db.model('SiteRosterHolidays');
    let offRecord = null;
    if (SiteRosterHolidays) {
      // 1. Worker specific leave or rest
      let workerOff = null;
      if (incomingWorkerId) {
        workerOff = await SiteRosterHolidays.findOne({
          siteId: closedAttendance.leadId,
          workerId: incomingWorkerId,
          $or: [
            { type: 'WeeklyRest', restDayOfWeek: dayOfWeek },
            {
              date: todayStr,
              type: { $in: ['SickLeave', 'CasualLeave', 'OtherLeave', 'PaidHoliday'] },
            },
          ],
        }).lean();
      }

      if (workerOff) {
        offRecord = workerOff;
      } else {
        // 2. Site-wide holiday or closure
        const siteHolidays = await SiteRosterHolidays.find({
          siteId: closedAttendance.leadId,
          date: todayStr,
          type: { $in: ['SiteClosed', 'NationalHoliday', 'FestivalHoliday', 'PaidHoliday'] },
        }).lean();

        for (const h of siteHolidays) {
          if (h.type === 'SiteClosed') {
            offRecord = h;
            break;
          }
          // Check if this holiday is allowed on this shift (allowedHolidays)
          const shiftAllowedList = matchedShift.allowedHolidays;
          const isAllowedForShift =
            !Array.isArray(shiftAllowedList) ||
            shiftAllowedList.length === 0 ||
            shiftAllowedList.includes(todayStr);

          if (isAllowedForShift) {
            offRecord = h;
            break;
          }
        }
      }
    }

    if (offRecord) {
      if (offRecord.type === 'SiteClosed') {
        console.log(`[autoEndScheduler] Site is closed today (${offRecord.remark}). No shift auto-started.`);
        return;
      }
      console.log(
        `[autoEndScheduler] Worker ${incomingWorkerName} is on ${offRecord.type} (${offRecord.remark}) at site`
      );
      if (io && tenantDbName) {
        io.to(tenantDbName).emit('attendance:reliever_needed', {
          siteId: String(lead._id),
          siteName: lead.sender_name || lead.name || 'Site',
          shiftCode: targetShiftCode,
          boundWorkerId: incomingWorkerId,
          boundWorkerName: incomingWorkerName,
          reason: offRecord.remark || offRecord.type,
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

    const nextDutyEndScheduled = new Date(scheduledStartUtc.getTime() + nextDurationHrs * 3600000);

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
      rate: matchedShift.salaryRate || incomingEmp?.rate || 0,
      date: scheduledStartUtc,
      dutyStart: endTime,
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
      // Aggregate into bulk single notification: "{Worker count} Rollover successfully"
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
 * Ensures shifts are cleanly closed even after server restarts or network disconnects.
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
      const elapsedHrs = (endTime - new Date(rec.dutyStart)) / 3600000;
      const standardHours = rec.shiftHours || rec.shiftLockHours || 8;
      const hoursWorked = parseFloat(Math.max(0, elapsedHrs).toFixed(2));
      const overtimeHours = parseFloat(Math.max(0, hoursWorked - standardHours).toFixed(2));
      const overtimeRate = 1.0; // Single rate (1.0x, not 1.5x)
      const baseHourlyRate = (rec.dailyRate || 0) / standardHours;
      const overtimeEarn = parseFloat((overtimeHours * baseHourlyRate * overtimeRate).toFixed(2));
      const dailyEarn = parseFloat(((hoursWorked / standardHours) * (rec.dailyRate || 0)).toFixed(2));

      const updated = await AttendanceModel.findOneAndUpdate(
        { _id: rec._id, $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }] },
        {
          $set: {
            dutyEnd: endTime,
            status: 'Present',
            autoCompleted: true,
            autoCompletedAt: endTime,
            hoursWorked,
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

        // Trigger Auto Shift Rollover on sweeper
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

/**
 * Auto-Starts scheduled shifts across all sites for a tenant.
 * Reuses the reliever / worker resolution logic from Shift Change Management:
 * 1. Checks current time window for site's active shifts.
 * 2. If slot is vacant (< workerSlots) and no duty has started for today's slot:
 * 3. Priority 1: Shift boundWorkerId.
 *    Priority 2: Worker who performed the last duty on this shift at this site.
 * 4. Checks weekly rest day, exempt days, and SiteRosterHolidays (leaves, holidays).
 * 5. Auto-creates Attendance record, schedules autoEnd, and notifies via Socket.IO.
 */
async function autoStartScheduledShifts(conn, tenantDbName, io) {
  if (!conn) return;
  try {
    const { getTenantModels } = require('../models/TenantModels');
    const { Attendance, Leads, Employees, SiteRosterHolidays } = getTenantModels(conn);
    if (!Attendance || !Leads || !Employees) return;

    const now = new Date();
    // India Standard Time (IST) is UTC + 5:30 (330 minutes)
    const istOffsetMs = 5.5 * 3600000;
    const istDate = new Date(now.getTime() + istOffsetMs);
    const todayDateStr = istDate.toISOString().split('T')[0];
    const currentHour = istDate.getUTCHours();
    const currentMin = istDate.getUTCMinutes();
    const currentTotalMins = currentHour * 60 + currentMin;

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const currentDayOfWeek = days[istDate.getUTCDay()];

    // 1) Logic Check: Lead status must be strictly 'Accepted' only
    const leads = await Leads.find({
      status: { $in: VALID_LEAD_STATUSES_MONGO },
      'siteShifts.active': { $ne: false },
    }).lean();

    if (!Array.isArray(leads) || leads.length === 0) return;

    const validLeads = leads.filter((l) => isValidLeadStatus(l.status));
    let autoStartedCount = 0;

    for (const lead of validLeads) {
      if (!Array.isArray(lead.siteShifts) || lead.siteShifts.length === 0) continue;
      const activeShifts = lead.siteShifts.filter((s) => s.active !== false);

      for (const shift of activeShifts) {
        const shiftCode = String(shift.shiftCode || 'G').trim().toUpperCase();
        const durationHrs = shift.durationHrs || (shift.shiftType === '12hr' ? 12 : 8);
        const startTimeStr =
          shift.startTime || (shiftCode === 'N2' || shiftCode === 'N' ? '20:00' : '08:00');
        const [sH, sM] = startTimeStr.split(':').map(Number);
        const safeH = isNaN(sH) ? 8 : sH;
        const safeM = isNaN(sM) ? 0 : sM;
        const shiftStartMins = safeH * 60 + safeM;

        // Check if current time is within this shift's window
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
            shiftStartedToday = false; // Cross-midnight shift started yesterday evening
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
          continue; // Slot already full
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

        if (now >= scheduledEndUtc) continue; // Shift period has already expired

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
          continue; // Already started today
        }

        // 3. Resolve Worker:
        // Priority 1: Shift boundWorkerId
        // Priority 2: Worker who performed the last duty on this shift at this site
        // Priority 3: Worker who performed the last duty at this site
        let targetWorkerId = shift.boundWorkerId ? String(shift.boundWorkerId) : null;
        let workerName = shift.boundWorkerName || null;
        let prevDuty = null;

        if (!targetWorkerId) {
          prevDuty = await Attendance.findOne({
            $and: [
              { $or: siteOrConditions },
              { shiftCode: { $in: shiftCodesList } },
            ],
          })
            .sort({ dutyStart: -1 })
            .lean();

          if (!prevDuty) {
            prevDuty = await Attendance.findOne({ $or: siteOrConditions })
              .sort({ dutyStart: -1 })
              .lean();
          }

          if (prevDuty && prevDuty.employeeId) {
            targetWorkerId = String(prevDuty.employeeId);
            workerName = prevDuty.workerName || null;
          }
        }

        if (!targetWorkerId) {
          if (io && tenantDbName) {
            io.to(tenantDbName).emit('attendance:reliever_needed', {
              siteId: String(lead._id),
              siteName: lead.sender_name || lead.name || 'Site',
              shiftCode: shift.shiftCode,
              reason: 'No bound worker or previous duty performer found',
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

        const emp = await Employees.findById(targetWorkerId).lean();
        workerName = emp?.name || workerName || 'Worker';

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
          rate: shift.salaryRate || emp?.rate || 0,
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
          remarks: `Auto-started duty for ${shift.shiftName || shiftCode} (${shift.boundWorkerId ? 'Bound Worker' : 'Last Duty Performer'})`,
        });

        await newDuty.save();

        // Schedule auto-end timer
        scheduleAutoEnd(newDuty._id, dutyEndScheduled, Attendance, tenantDbName, io);

        if (io && tenantDbName) {
          io.to(tenantDbName).emit('attendance:created', { data: newDuty });
          io.to(tenantDbName).emit('attendance:active_updated');
          // Aggregate into bulk single notification: "{Worker count} Rollover successfully"
          recordRolloverSuccess(tenantDbName, io, 1);
        }

        autoStartedCount++;
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
 * Sweeps all active tenant databases to:
 * 1. Auto-close expired shifts and compute OT.
 * 2. Auto-start scheduled shifts across active sites (post-weekend, after weekly off, or shift start time).
 * Runs independently 24/7.
 */
async function sweepAllTenants(io) {
  if (_isSweeping) return;
  _isSweeping = true;
  try {
    const userMaster = require('../models/userMaster');
    const dbConnector = require('./dbConnector');
    const { getTenantModels } = require('../models/TenantModels');

    // Distinct tenant databases from userMaster
    const dbNames = await userMaster.distinct('accessCorporate.dbName', {
      'accessCorporate.isActive': { $ne: false },
    });

    if (!Array.isArray(dbNames) || dbNames.length === 0) {
      _isSweeping = false;
      return;
    }

    for (const dbName of dbNames) {
      if (!dbName) continue;
      try {
        const conn = await dbConnector.getTenantConnection(dbName);
        if (conn && conn.readyState === 1) {
          const { Attendance } = getTenantModels(conn);
          if (Attendance) {
            await sweepExpiredShifts(Attendance, dbName, io);
          }
          // Auto-start scheduled shifts for sites (post-weekend/holidays or normal scheduled start)
          await autoStartScheduledShifts(conn, dbName, io);
        }
      } catch (tenantErr) {
        // Non-fatal per-tenant error
      }
    }
  } catch (err) {
    console.error('[autoEndScheduler] sweepAllTenants error:', err.message);
  } finally {
    _isSweeping = false;
  }
}

/**
 * Starts persistent background sweeper daemon on the backend server.
 * Default interval: 1 minute (60,000 ms).
 */
function startBackgroundSweeper(io, intervalMs = 60 * 1000) {
  if (_sweeperInterval) {
    clearInterval(_sweeperInterval);
  }

  const mins = Math.round(intervalMs / 60000);
  console.log(`⏱️ [autoEndScheduler] 24/7 Background Cron Sweeper active (every ${mins}m)`);

  // Initial boot sweep after 5 seconds to catch up on any shifts expired during server restart
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
};
