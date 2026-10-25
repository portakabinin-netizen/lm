/**
 * autoEndScheduler.js
 * Robust scheduler for auto-closing single-worker and scheduled shift attendance.
 * Provides both in-memory real-time timers and resilient database sweepers.
 */

'use strict';

const MAX_TIMER_MS = 24 * 60 * 60 * 1000; // 24h cap

// Map: attendanceId (string) -> NodeJS.Timeout
const _timers = new Map();

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
  if (!closedAttendance || !closedAttendance.leadId) return;
  try {
    const db = AttendanceModel.db;
    const Leads = db.models.Leads || db.model('Leads');
    const lead = await Leads.findById(closedAttendance.leadId).lean();
    if (!lead || !Array.isArray(lead.siteShifts) || lead.siteShifts.length === 0) return;

    const activeSiteShifts = lead.siteShifts.filter((s) => s.active !== false);
    if (activeSiteShifts.length === 0) return;

    // 1. Determine next shiftCode in cycle
    const outgoingCode = String(closedAttendance.shiftCode || '').trim().toUpperCase();
    let nextShiftCode = '';

    if (outgoingCode === 'D' || outgoingCode === 'DAY') {
      nextShiftCode = 'N2';
    } else if (outgoingCode === 'N2' || outgoingCode === 'N' || outgoingCode === 'NIGHT') {
      nextShiftCode = 'D';
    } else if (outgoingCode === 'M' || outgoingCode === 'MORNING') {
      nextShiftCode = 'A';
    } else if (outgoingCode === 'A' || outgoingCode === 'AFTERNOON') {
      nextShiftCode = 'N';
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

    // 2. Resolve bound worker for target shift:
    // Priority A: matchedShift.boundWorkerId
    // Priority B: Always pick from previous duty on same shift, same site!
    let incomingWorkerId = matchedShift.boundWorkerId ? String(matchedShift.boundWorkerId) : null;
    let prevDuty = null;

    if (!incomingWorkerId) {
      prevDuty = await AttendanceModel.findOne({
        leadId: closedAttendance.leadId,
        shiftCode: targetShiftCode,
        dutyEnd: { $exists: true, $ne: null },
      })
        .sort({ dutyStart: -1 })
        .lean();

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

    // ── Guard: Auto attendance NOT applicable to workers who mark attendance own/self ──
    let isSelfMarkingWorker = false;

    // A) If employee has a registered user account (user_id), they have app access to mark themselves
    if (incomingEmp?.user_id) {
      isSelfMarkingWorker = true;
    }

    const endTime = closedAttendance.dutyEnd ? new Date(closedAttendance.dutyEnd) : new Date();
    const startOfToday = new Date(endTime);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(endTime);
    endOfToday.setHours(23, 59, 59, 999);

    // B) Check if worker has already marked attendance self/own today
    if (!isSelfMarkingWorker) {
      const selfDutyToday = await AttendanceModel.findOne({
        employeeId: incomingWorkerId,
        date: { $gte: startOfToday, $lte: endOfToday },
        markedByDevice: true,
      }).lean();

      if (selfDutyToday) {
        isSelfMarkingWorker = true;
      }
    }

    // C) Check if worker's recent duty history shows self-marking on their own device
    if (!isSelfMarkingWorker) {
      const recentSelfDuty = await AttendanceModel.findOne({
        employeeId: incomingWorkerId,
        markedByDevice: true,
        markedByUserName: { $nin: ['Auto Shift Rollover', 'System'] },
      })
        .sort({ dutyStart: -1 })
        .lean();

      if (recentSelfDuty) {
        isSelfMarkingWorker = true;
      }
    }

    if (isSelfMarkingWorker) {
      console.log(
        `[autoEndScheduler] Worker ${incomingWorkerName} (${incomingWorkerId}) marks attendance own/self. Auto attendance not applicable. Skipping auto-start.`
      );
      if (io && tenantDbName) {
        io.to(tenantDbName).emit('attendance:self_marking_worker_waiting', {
          siteId: String(lead._id),
          siteName: lead.sender_name || lead.name || 'Site',
          shiftCode: targetShiftCode,
          workerId: incomingWorkerId,
          workerName: incomingWorkerName,
          reason: 'Worker marks attendance own/self',
        });
      }
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
      const workerOff = await SiteRosterHolidays.findOne({
        siteId: closedAttendance.leadId,
        $or: [
          { workerId: incomingWorkerId, type: 'WeeklyRest', restDayOfWeek: dayOfWeek },
          {
            workerId: incomingWorkerId,
            date: todayStr,
            type: { $in: ['SickLeave', 'CasualLeave', 'OtherLeave', 'PaidHoliday'] },
          },
        ],
      }).lean();

      if (workerOff) {
        offRecord = workerOff;
      } else {
        // 2. Site-wide holiday or closure
        const siteHolidays = await SiteRosterHolidays.find({
          siteId: { $in: [closedAttendance.leadId, String(closedAttendance.leadId), '__all__'] },
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
    const nextDutyEndScheduled = new Date(endTime.getTime() + nextDurationHrs * 3600000);

    const newDuty = new AttendanceModel({
      employeeId: incomingWorkerId,
      employeeType: 'Employees',
      workerName: incomingWorkerName,
      role: incomingEmp?.role || closedAttendance.role || 'Security',
      leadId: closedAttendance.leadId,
      siteId: closedAttendance.leadId,
      clientId: closedAttendance.clientId || lead.clientId || null,
      site_name: lead.sender_name || lead.name || closedAttendance.site_name,
      status: 'Present',
      dutyLevel: 1,
      rate: matchedShift.salaryRate || incomingEmp?.rate || 0,
      date: endTime,
      dutyStart: endTime,
      dutyStartScheduled: endTime,
      dutyEndScheduled: nextDutyEndScheduled,
      shiftCode: targetShiftCode,
      shiftType: nextDurationHrs === 12 ? '12hr' : '8hr',
      shiftPeriod:
        matchedShift.shiftPeriod ||
        (targetShiftCode === 'N2' ? 'Night12' : targetShiftCode === 'D' ? 'Day' : 'General'),
      shiftLockHours: nextDurationHrs,
      dutyEnd: null,
      forcedOff: false,
      markedByDevice: false,
      markedByUserName: 'Auto Shift Rollover',
      remarks: `Auto-bound handover from ${closedAttendance.workerName || 'previous shift'}`,
    });

    await newDuty.save();

    // Schedule auto-end for this newly created shift
    scheduleAutoEnd(newDuty._id, nextDutyEndScheduled, AttendanceModel, tenantDbName, io);

    if (io && tenantDbName) {
      io.to(tenantDbName).emit('attendance:created', { data: newDuty });
      io.to(tenantDbName).emit('attendance:active_updated');
      io.to(tenantDbName).emit('admin:broadcast', {
        id: 'auto-start-' + newDuty._id,
        title: 'Auto Shift Rollover Successful',
        message: `${lead.sender_name || 'Site'}: ${targetShiftCode} shift auto-started for ${incomingWorkerName}`,
        priority: 'normal',
        targetRoles: ['CorpAdmin', 'userAdmin', 'Project'],
        sentBy: 'System',
        at: endTime.toISOString(),
      });
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
      shiftHours: { $exists: true },
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
 * Sweeps all active tenant databases to auto-close expired shifts, compute single-rate OT,
 * and trigger shift rollovers. Runs independently of user app state 24/7.
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
 * Default interval: 15 minutes (900,000 ms).
 */
function startBackgroundSweeper(io, intervalMs = 15 * 60 * 1000) {
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
};
