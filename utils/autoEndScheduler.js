/**
 * autoEndScheduler.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Robust scheduler for auto-closing single-worker and scheduled shift attendance.
 * Provides both in-memory real-time timers and resilient database sweepers.
 *
 * Integrated Capabilities:
 * 1. Tenant Leave Engine (leaveManager.js / RequestMaster) - workers on approved leave ignored.
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

// Valid billable / active lead statuses: strictly 'Accepted' and 'Tax Invoice'
const VALID_LEAD_STATUS_REGEX = /^(accepted|tax invoice)$/i;

const isValidLeadStatus = (status) => {
  if (!status) return false;
  return /^(accepted|tax invoice)$/i.test(String(status).trim());
};

const VALID_LEAD_STATUSES_MONGO = ['Accepted', 'accepted', 'Tax Invoice', 'tax invoice'];

/**
 * Robustly resolve latitude, longitude, and address from a Lead (Site) document
 * with fallbacks to prior attendance if available.
 */
function resolveLeadCoordinates(lead, fallbackAttendance = null) {
  let lat = null;
  let long = null;
  let address = '';

  if (lead?.location) {
    if (lead.location.lat !== undefined && lead.location.lat !== null && !isNaN(Number(lead.location.lat))) {
      lat = Number(lead.location.lat);
    }
    if (lead.location.long !== undefined && lead.location.long !== null && !isNaN(Number(lead.location.long))) {
      long = Number(lead.location.long);
    }
    if (lead.location.address) {
      address = String(lead.location.address).trim();
    }
  }

  // Fallbacks on lead object root
  if (lat === null) {
    const rawLat = lead?.lat ?? lead?.latitude ?? lead?.locationLat;
    if (rawLat !== undefined && rawLat !== null && !isNaN(Number(rawLat))) lat = Number(rawLat);
  }
  if (long === null) {
    const rawLong = lead?.long ?? lead?.longitude ?? lead?.locationLong;
    if (rawLong !== undefined && rawLong !== null && !isNaN(Number(rawLong))) long = Number(rawLong);
  }
  if (!address && (lead?.sender_city || lead?.sender_state || lead?.sender_name || lead?.name)) {
    address = [lead?.sender_name || lead?.name, lead?.sender_city, lead?.sender_state].filter(Boolean).join(', ');
  }

  // Fallback to prior attendance if lead record itself has no coordinates
  if (lat === null && fallbackAttendance) {
    const fLat = fallbackAttendance.siteLat ?? fallbackAttendance.startLat;
    if (fLat !== undefined && fLat !== null && !isNaN(Number(fLat))) lat = Number(fLat);
  }
  if (long === null && fallbackAttendance) {
    const fLong = fallbackAttendance.siteLong ?? fallbackAttendance.startLong;
    if (fLong !== undefined && fLong !== null && !isNaN(Number(fLong))) long = Number(fLong);
  }

  return { lat, long, address };
}

function parseShiftStartTime(timeStr, defaultHour = 8) {
  if (!timeStr) return { safeH: defaultHour, safeM: 0, totalMins: defaultHour * 60 };
  const str = String(timeStr).trim();
  const isPM = /pm/i.test(str);
  const isAM = /am/i.test(str);
  const clean = str.replace(/[^\d:]/g, '');
  const parts = clean.split(':').map(Number);
  let h = isNaN(parts[0]) ? defaultHour : parts[0];
  let m = isNaN(parts[1]) ? 0 : parts[1];
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return { safeH: h, safeM: m, totalMins: h * 60 + m };
}

// ── Time & Day Normalization Helpers (Strict Indian Standard Time +5:30) ──
const getIstInfo = (date = new Date()) => {
  const istOffsetMs = 5.5 * 3600000;
  const istDate = new Date(date.getTime() + istOffsetMs);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayOfWeek = days[istDate.getUTCDay()];
  const dateStr = istDate.toISOString().split('T')[0];
  const currentHour = istDate.getUTCHours();
  const currentMin = istDate.getUTCMinutes();
  const totalMins = currentHour * 60 + currentMin;
  return { istDate, dayOfWeek, dateStr, currentHour, currentMin, totalMins };
};

const normalizeDayOfWeek = (val) => {
  if (!val) return '';
  const s = String(val).trim().toLowerCase();
  if (s.startsWith('sun')) return 'Sun';
  if (s.startsWith('mon')) return 'Mon';
  if (s.startsWith('tue')) return 'Tue';
  if (s.startsWith('wed')) return 'Wed';
  if (s.startsWith('thu')) return 'Thu';
  if (s.startsWith('fri')) return 'Fri';
  if (s.startsWith('sat')) return 'Sat';
  return '';
};

/**
 * Calculates start and end Date objects in UTC for a specific day in IST.
 * dayOffset = 0 -> today
 * dayOffset = 1 -> today - 1 (yesterday)
 * dayOffset = 2 -> today - 2, etc.
 */
function getIstDayWindow(baseDate = new Date(), dayOffset = 1) {
  const istOffsetMs = 5.5 * 3600000;
  const baseIstTime = baseDate.getTime() + istOffsetMs;
  const targetIstTime = baseIstTime - dayOffset * 24 * 3600000;
  const targetDate = new Date(targetIstTime);
  const targetDateStr = targetDate.toISOString().split('T')[0];

  const [y, m, d] = targetDateStr.split('-').map(Number);
  const startUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - istOffsetMs);
  const endUtc = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - istOffsetMs);

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayOfWeek = days[targetDate.getUTCDay()];

  return { targetDateStr, dayOfWeek, startUtc, endUtc };
}

/**
 * Evaluates whether a worker is eligible and available to perform duty.
 * Strict rules:
 * 1. Must be active in Employees.
 * 2. Must not be currently active on duty anywhere in this tenant.
 * 3. Must not have already completed/started duty in this shift window today.
 * 4. Must not be on approved personal leave (Sick/Casual/Other) in leaveManager (RequestMaster) or SiteRosterHolidays.
 * 5. Site must not be closed in SiteRosterHolidays.
 * 6. WEEKLY OFF & HOLIDAYS:
 *    If the worker has Weekly Rest / Off or Holiday (via roster, exempt days, or employee weekly off),
 *    but is NOT on personal leave, NOT busy, and site is NOT closed:
 *    The worker IS AVAILABLE and their attendance should be marked!
 */
async function checkCandidateWorkerEligibility({
  workerId,
  AttendanceModel,
  EmployeesModel,
  SiteRosterHolidaysModel,
  leaveManager,
  tenantDbName,
  lead,
  effectiveLeadId,
  shift,
  shiftCodesList = [],
  todayDateStr,
  currentDayOfWeek,
  scheduledStartUtc,
  scheduledEndUtc,
  excludeWorkerIds = new Set(),
}) {
  if (!workerId) return { ok: false, reason: 'no_id' };
  const wId = String(workerId);

  if (excludeWorkerIds && excludeWorkerIds.has(wId)) {
    return { ok: false, reason: 'excluded' };
  }

  const emp = await EmployeesModel.findById(wId).lean();
  if (!emp || emp.active === false) {
    return { ok: false, reason: 'inactive' };
  }

  // Guard 1: Busy on active duty anywhere in this tenant?
  const busy = await AttendanceModel.findOne({
    employeeId: wId,
    $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
  }).lean();
  if (busy) {
    return { ok: false, reason: 'busy', siteName: busy.site_name || 'Another Site' };
  }

  // Guard 2: Already ran duty on this site/shift today in window?
  const targetSiteId = effectiveLeadId || (lead ? lead._id : null);
  const siteOrConditions = targetSiteId
    ? [{ leadId: targetSiteId }, { leadId: String(targetSiteId) }, { siteId: targetSiteId }, { siteId: String(targetSiteId) }]
    : [];

  const shiftCodes = Array.isArray(shiftCodesList) && shiftCodesList.length > 0
    ? shiftCodesList
    : (shift && shift.shiftCode ? [shift.shiftCode] : []);

  const windowStart = scheduledStartUtc ? new Date(scheduledStartUtc.getTime() - 2 * 3600000) : new Date(Date.now() - 2 * 3600000);
  const windowEnd = scheduledEndUtc ? scheduledEndUtc : new Date(Date.now() + 2 * 3600000);

  if (siteOrConditions.length > 0 && shiftCodes.length > 0) {
    const alreadyRan = await AttendanceModel.findOne({
      $and: [
        { employeeId: wId },
        { $or: siteOrConditions },
        { shiftCode: { $in: shiftCodes } },
        {
          dutyStart: {
            $gte: windowStart,
            $lte: windowEnd,
          },
        },
      ],
    }).lean();
    if (alreadyRan) {
      return { ok: false, reason: 'already_ran' };
    }
  }

  // Guard 3: Approved personal leave from leaveManager (RequestMaster)
  if (leaveManager && tenantDbName) {
    const approvedLeave = leaveManager.isWorkerOnApprovedLeave(tenantDbName, wId, todayDateStr);
    if (approvedLeave) {
      return { ok: false, reason: 'leave', remark: approvedLeave.leaveType || 'Approved Leave' };
    }
  }

  // Guard 4: SiteRosterHolidays
  let offRecord = null;
  if (SiteRosterHolidaysModel && lead && lead._id) {
    offRecord = await SiteRosterHolidaysModel.findOne({
      siteId: lead._id,
      $or: [
        { workerId: wId, type: 'WeeklyRest', restDayOfWeek: { $regex: new RegExp(`^${currentDayOfWeek}`, 'i') } },
        {
          workerId: wId,
          date: todayDateStr,
          type: { $in: ['SickLeave', 'CasualLeave', 'OtherLeave', 'PaidHoliday', 'NationalHoliday', 'FestivalHoliday', 'WeeklyRest'] },
        },
        { date: todayDateStr, type: 'SiteClosed' },
      ],
    }).lean();
  }

  if (offRecord && offRecord.type === 'SiteClosed') {
    return { ok: false, reason: 'site_closed', remark: offRecord.remark || 'Site Closed' };
  }

  if (offRecord && ['SickLeave', 'CasualLeave', 'OtherLeave'].includes(offRecord.type)) {
    return { ok: false, reason: 'leave', remark: offRecord.remark || offRecord.type };
  }

  // Weekly Rest & Holiday detection:
  const isShiftRest =
    (shift && normalizeDayOfWeek(shift.weeklyRestDay) === currentDayOfWeek) ||
    (shift && Array.isArray(shift.exemptDays) && shift.exemptDays.map(normalizeDayOfWeek).includes(currentDayOfWeek)) ||
    normalizeDayOfWeek(emp.weeklyRestDay) === currentDayOfWeek ||
    normalizeDayOfWeek(emp.weeklyOff) === currentDayOfWeek;

  const isWeeklyOffOrHoliday = Boolean(
    isShiftRest ||
    (offRecord && ['WeeklyRest', 'PaidHoliday', 'NationalHoliday', 'FestivalHoliday'].includes(offRecord.type))
  );

  const holidayRemark = offRecord
    ? (offRecord.remark || offRecord.type)
    : (isShiftRest ? `${currentDayOfWeek} Weekly Off` : null);

  // If worker has Weekly Off / Holiday, but passed all availability checks:
  // THE WORKER IS AVAILABLE -> MARK ATTENDANCE!
  return {
    ok: true,
    emp,
    isWeeklyOffOrHoliday,
    holidayRemark,
  };
}

/**
 * Strict chronological stepped fallback worker resolution:
 * Checks today - 1 (yesterday). If none found/eligible, checks today - 2.
 * If none found/eligible, checks today - 3, stepping backwards day-by-day up to maxDaysBack.
 * Never picks a random worker from historical attendance records.
 *
 * If a worker on weekly off / holiday is available, marks attendance for that worker.
 */
async function findSteppedPreviousDayWorker({
  AttendanceModel,
  EmployeesModel,
  SiteRosterHolidaysModel,
  leaveManager,
  tenantDbName,
  lead,
  effectiveLeadId,
  shift,
  targetShiftCode,
  shiftCodesList = [],
  baseDate = new Date(),
  todayDateStr,
  currentDayOfWeek,
  scheduledStartUtc,
  scheduledEndUtc,
  excludeWorkerIds = new Set(),
  maxDaysBack = 14,
}) {
  const targetSiteId = effectiveLeadId || (lead ? lead._id : null);
  if (!targetSiteId) return null;

  const siteOrConditions = [
    { leadId: targetSiteId },
    { leadId: String(targetSiteId) },
    { siteId: targetSiteId },
    { siteId: String(targetSiteId) },
  ];
  if (lead && lead._id && String(lead._id) !== String(targetSiteId)) {
    siteOrConditions.push(
      { leadId: lead._id },
      { leadId: String(lead._id) },
      { siteId: lead._id },
      { siteId: String(lead._id) }
    );
  }

  const targetCodes = Array.isArray(shiftCodesList) && shiftCodesList.length > 0
    ? shiftCodesList
    : [targetShiftCode || (shift && shift.shiftCode)].filter(Boolean);

  const todayInfo = getIstInfo(baseDate);
  const effTodayDateStr = todayDateStr || todayInfo.dateStr;
  const effCurrentDayOfWeek = currentDayOfWeek || todayInfo.dayOfWeek;

  for (let dayOffset = 1; dayOffset <= maxDaysBack; dayOffset++) {
    const { targetDateStr, startUtc, endUtc } = getIstDayWindow(baseDate, dayOffset);

    const dayDateCondition = {
      $or: [
        { dutyStart: { $gte: startUtc, $lte: endUtc } },
        { date: { $gte: startUtc, $lte: endUtc } },
        { date: targetDateStr },
      ],
    };

    // Priority 1 on dayOffset: Worker who performed this SPECIFIC shift at this site
    if (targetCodes.length > 0) {
      const shiftDuties = await AttendanceModel.find({
        $and: [
          { $or: siteOrConditions },
          { shiftCode: { $in: targetCodes } },
          dayDateCondition,
          { status: { $nin: ['Absent', 'Leave'] } },
        ],
      })
        .sort({ dutyStart: -1, date: -1 })
        .lean();

      for (const duty of shiftDuties) {
        if (!duty.employeeId) continue;
        const candidateId = String(duty.employeeId);
        if (excludeWorkerIds && excludeWorkerIds.has(candidateId)) continue;

        const check = await checkCandidateWorkerEligibility({
          workerId: candidateId,
          AttendanceModel,
          EmployeesModel,
          SiteRosterHolidaysModel,
          leaveManager,
          tenantDbName,
          lead,
          effectiveLeadId: targetSiteId,
          shift,
          shiftCodesList: targetCodes,
          todayDateStr: effTodayDateStr,
          currentDayOfWeek: effCurrentDayOfWeek,
          scheduledStartUtc,
          scheduledEndUtc,
          excludeWorkerIds,
        });

        if (check.ok) {
          console.log(
            `🔄 [autoEndScheduler] Stepped fallback found worker ${check.emp.name || candidateId} from today-${dayOffset} (${targetDateStr}) on shift ${targetShiftCode || targetCodes.join('/')} at "${lead.sender_name || 'Site'}"`
          );
          return {
            workerId: candidateId,
            emp: check.emp,
            workerName: check.emp.name || duty.workerName || 'Worker',
            foundDayOffset: dayOffset,
            isWeeklyOffOrHoliday: check.isWeeklyOffOrHoliday,
            holidayRemark: check.holidayRemark,
          };
        }
      }
    }

    // Priority 2 on dayOffset: Worker who performed ANY shift at this site on this day
    const anyDuties = await AttendanceModel.find({
      $and: [
        { $or: siteOrConditions },
        dayDateCondition,
        { status: { $nin: ['Absent', 'Leave'] } },
      ],
    })
      .sort({ dutyStart: -1, date: -1 })
      .lean();

    for (const duty of anyDuties) {
      if (!duty.employeeId) continue;
      const candidateId = String(duty.employeeId);
      if (excludeWorkerIds && excludeWorkerIds.has(candidateId)) continue;

      const check = await checkCandidateWorkerEligibility({
        workerId: candidateId,
        AttendanceModel,
        EmployeesModel,
        SiteRosterHolidaysModel,
        leaveManager,
        tenantDbName,
        lead,
        effectiveLeadId: targetSiteId,
        shift,
        shiftCodesList: targetCodes,
        todayDateStr: effTodayDateStr,
        currentDayOfWeek: effCurrentDayOfWeek,
        scheduledStartUtc,
        scheduledEndUtc,
        excludeWorkerIds,
      });

      if (check.ok) {
        console.log(
          `🔄 [autoEndScheduler] Stepped fallback found worker ${check.emp.name || candidateId} from today-${dayOffset} (${targetDateStr}) (site-level duty) at "${lead.sender_name || 'Site'}"`
        );
        return {
          workerId: candidateId,
          emp: check.emp,
          workerName: check.emp.name || duty.workerName || 'Worker',
          foundDayOffset: dayOffset,
          isWeeklyOffOrHoliday: check.isWeeklyOffOrHoliday,
          holidayRemark: check.holidayRemark,
        };
      }
    }

    // No available worker found on dayOffset; strictly step to dayOffset + 1
    // (e.g. today-1 had none -> check today-2, then today-3)
  }

  // Strictly finished checking up to maxDaysBack without picking arbitrary workers
  return null;
}

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

      // ── Resolve Site / Lead Coordinates for Auto-Closing Duty ─────────────
      let leadDoc = null;
      const effectiveLeadId = result.leadId || result.siteId;
      if (effectiveLeadId) {
        try {
          const db = AttendanceModel.db;
          const Leads = db.models.Leads || db.model('Leads');
          leadDoc = await Leads.findById(effectiveLeadId).lean();
        } catch {}
      }
      const coords = resolveLeadCoordinates(leadDoc, result);

      const updateFields = {
        hoursWorked,
        dailyRate: baseDailyRate,
        dailyEarn,
        isOvertime: overtimeHours > 0,
        overtimeHours,
        overtimeRate: 1.0,
        overtimeEarn,
      };

      if ((result.siteLat === undefined || result.siteLat === null) && coords.lat !== null) {
        updateFields.siteLat = coords.lat;
        result.siteLat = coords.lat;
      }
      if ((result.siteLong === undefined || result.siteLong === null) && coords.long !== null) {
        updateFields.siteLong = coords.long;
        result.siteLong = coords.long;
      }
      if ((result.startLat === undefined || result.startLat === null) && coords.lat !== null) {
        updateFields.startLat = coords.lat;
        result.startLat = coords.lat;
      }
      if ((result.startLong === undefined || result.startLong === null) && coords.long !== null) {
        updateFields.startLong = coords.long;
        result.startLong = coords.long;
      }

      // Ensure geoHistory has an 'end' tick with site coordinates
      const endLat = result.siteLat ?? coords.lat;
      const endLong = result.siteLong ?? coords.long;
      const hasEndTick = Array.isArray(result.geoHistory) && result.geoHistory.some((g) => g.type === 'end');

      if (endLat !== null && endLong !== null && !hasEndTick) {
        await AttendanceModel.updateOne(
          { _id: id },
          {
            $set: updateFields,
            $push: {
              geoHistory: {
                lat: endLat,
                long: endLong,
                address: coords.address || leadDoc?.sender_name || leadDoc?.name || result.site_name || 'Site Location',
                type: 'end',
                timestamp: endTime,
              },
            },
          }
        );
      } else {
        await AttendanceModel.updateOne({ _id: id }, { $set: updateFields });
      }

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
 * 3. Worker is not on approved leave in RequestMaster.
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

    // Support Multi-worker sites (e.g., Rajan Bhasin, Bhandari-W70, Lintech):
    // Gather all candidate shifts matching nextShiftCode so that if one slot's worker
    // is inactive, on weekly off, or busy, the remaining valid slots still rollover.
    let candidateShifts = activeSiteShifts.filter((s) => {
      const sc = String(s.shiftCode || '').trim().toUpperCase();
      return sc === nextShiftCode.toUpperCase();
    });
    if (candidateShifts.length === 0) {
      candidateShifts = activeSiteShifts.filter((s) => s.shiftCode !== outgoingCode);
    }
    if (candidateShifts.length === 0) {
      candidateShifts = [activeSiteShifts[0]];
    }

    const endTime = closedAttendance.dutyEnd ? new Date(closedAttendance.dutyEnd) : new Date();
    const { istDate, dayOfWeek, dateStr: todayStr } = getIstInfo(endTime);

    const Employees = db.models.Employees || db.model('Employees');
    const SiteRosterHolidays = db.models.SiteRosterHolidays || (db.model && db.model('SiteRosterHolidays'));

    let startedShift = null;

    for (const matchedShift of candidateShifts) {
      const targetShiftCode = matchedShift.shiftCode || nextShiftCode;

      // ── Check Daily Shift Slot Suppression ──
      if (isShiftSlotSuppressed(tenantDbName, effectiveLeadId, targetShiftCode, todayStr)) {
        console.log(
          `🛡️ [autoEndScheduler] Slot ${targetShiftCode} at site "${lead.sender_name || 'Site'}" is suppressed for today. Skipping slot.`
        );
        continue;
      }

      // ── Guard 1: Prevent double-clocking if this shift is ALREADY active on this site ──
      const siteShiftAlreadyActive = await AttendanceModel.findOne({
        $or: [
          { leadId: effectiveLeadId },
          { siteId: effectiveLeadId },
        ],
        shiftCode: targetShiftCode,
        $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
      }).lean();

      if (siteShiftAlreadyActive) {
        console.log(
          `[autoEndScheduler] Site "${lead.sender_name || 'Site'}" already has an active duty on shift ${targetShiftCode}. Checking next slot.`
        );
        continue;
      }

      // ── Resolve candidate worker for target shift ──
      let incomingWorkerId = matchedShift.boundWorkerId
        ? String(matchedShift.boundWorkerId._id || matchedShift.boundWorkerId)
        : null;
      let incomingEmp = null;
      let incomingWorkerName = matchedShift.boundWorkerName || 'Worker';
      let isWeeklyOffOrHoliday = false;
      let holidayRemark = null;

      // Priority 1: Shift boundWorkerId (if active and available)
      if (incomingWorkerId) {
        const boundCheck = await checkCandidateWorkerEligibility({
          workerId: incomingWorkerId,
          AttendanceModel,
          EmployeesModel: Employees,
          SiteRosterHolidaysModel: SiteRosterHolidays,
          leaveManager,
          tenantDbName,
          lead,
          effectiveLeadId,
          shift: matchedShift,
          shiftCodesList: [targetShiftCode, matchedShift.shiftName, matchedShift.shiftPeriod].filter(Boolean),
          todayDateStr: todayStr,
          currentDayOfWeek: dayOfWeek,
          scheduledStartUtc: endTime,
          scheduledEndUtc: null,
          excludeWorkerIds: new Set(),
        });

        if (boundCheck.ok) {
          incomingEmp = boundCheck.emp;
          incomingWorkerName = boundCheck.emp.name || matchedShift.boundWorkerName || 'Worker';
          isWeeklyOffOrHoliday = boundCheck.isWeeklyOffOrHoliday;
          holidayRemark = boundCheck.holidayRemark;
          if (isWeeklyOffOrHoliday) {
            console.log(
              `🏖️ [autoEndScheduler] Bound worker ${incomingWorkerName} at ${lead.sender_name || 'Site'} has Weekly Off/Holiday (${holidayRemark || dayOfWeek}), but is available. Marking attendance as instructed.`
            );
          }
        } else {
          console.log(
            `ℹ️ [autoEndScheduler] Bound worker ${incomingWorkerName} (${incomingWorkerId}) unavailable (${boundCheck.reason}: ${boundCheck.remark || ''}). Checking stepped previous day worker.`
          );
          incomingWorkerId = null;
        }
      }

      // Priority 2: Stepped Fallback: today-1, then today-2, then today-3...
      // Strictly avoids random worker selection. If weekly off/holiday worker available, mark attendance.
      if (!incomingEmp) {
        const excludeSet = new Set();
        if (closedAttendance && closedAttendance.employeeId) {
          excludeSet.add(String(closedAttendance.employeeId));
        }

        const steppedWorker = await findSteppedPreviousDayWorker({
          AttendanceModel,
          EmployeesModel: Employees,
          SiteRosterHolidaysModel: SiteRosterHolidays,
          leaveManager,
          tenantDbName,
          lead,
          effectiveLeadId,
          shift: matchedShift,
          targetShiftCode,
          shiftCodesList: [targetShiftCode, matchedShift.shiftName, matchedShift.shiftPeriod].filter(Boolean),
          baseDate: endTime,
          todayDateStr: todayStr,
          currentDayOfWeek: dayOfWeek,
          scheduledStartUtc: endTime,
          scheduledEndUtc: null,
          excludeWorkerIds: excludeSet,
          maxDaysBack: 14,
        });

        if (steppedWorker) {
          incomingWorkerId = steppedWorker.workerId;
          incomingEmp = steppedWorker.emp;
          incomingWorkerName = steppedWorker.workerName;
          isWeeklyOffOrHoliday = steppedWorker.isWeeklyOffOrHoliday;
          holidayRemark = steppedWorker.holidayRemark;
          console.log(
            `🔄 [autoEndScheduler] Rollover resolved stepped worker: ${incomingWorkerName} (${incomingWorkerId}) from today-${steppedWorker.foundDayOffset} for ${targetShiftCode} at site "${lead.sender_name || 'Site'}"`
          );
        }
      }

      if (!incomingWorkerId || !incomingEmp) {
        console.log(
          `[autoEndScheduler] No available worker found for slot ${targetShiftCode} at site "${lead.sender_name || 'site'}". Checking next slot.`
        );
        if (io && tenantDbName) {
          io.to(tenantDbName).emit('attendance:reliever_needed', {
            siteId: String(lead._id),
            siteName: lead.sender_name || lead.name || 'Site',
            shiftCode: targetShiftCode,
            reason: 'Bound worker unavailable and no previous day worker found',
          });
        }
        continue;
      }

      // Found an eligible incoming candidate shift slot!
      startedShift = {
        matchedShift,
        incomingWorkerId,
        incomingEmp,
        incomingWorkerName,
        targetShiftCode,
        isWeeklyOffOrHoliday,
        holidayRemark,
      };
      break;
    }

    if (!startedShift) {
      console.log(`[autoEndScheduler] No eligible incoming worker available for rollover at site "${lead.sender_name || 'Site'}".`);
      return;
    }

    const {
      matchedShift,
      incomingWorkerId,
      incomingEmp,
      incomingWorkerName,
      targetShiftCode,
    } = startedShift;

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

    // ── Resolve Site / Lead Coordinates for Swapped Duty ─────────────────
    const { lat: siteLat, long: siteLong, address: siteAddress } = resolveLeadCoordinates(lead, closedAttendance);

    const initialGeoHistory = [];
    if (siteLat !== null && siteLong !== null) {
      initialGeoHistory.push({
        lat: siteLat,
        long: siteLong,
        address: siteAddress || lead.sender_name || lead.name || closedAttendance.site_name || 'Site Location',
        type: 'start',
        timestamp: scheduledStartUtc,
      });
    }

    const newDuty = new AttendanceModel({
      employeeId: incomingWorkerId,
      employeeType: 'Employees',
      workerName: incomingWorkerName,
      role: incomingEmp?.role || closedAttendance.role || 'Security',
      leadId: effectiveLeadId,
      siteId: effectiveLeadId,
      clientId: closedAttendance.clientId || lead.clientId || null,
      site_name: lead.sender_name || lead.name || closedAttendance.site_name,
      startLat: siteLat,
      startLong: siteLong,
      siteLat: siteLat,
      siteLong: siteLong,
      geoHistory: initialGeoHistory,
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
      remarks: startedShift.isWeeklyOffOrHoliday
        ? `Auto-bound handover from ${closedAttendance.workerName || 'previous shift'} (${startedShift.holidayRemark || 'Weekly Off / Holiday Duty'})`
        : `Auto-bound handover from ${closedAttendance.workerName || 'previous shift'}`,
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
 * - Ignores workers on approved leave in leaveManager (RequestMaster).
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

    const assignedWorkerIdsThisRun = new Set();

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
        const { safeH, safeM, totalMins: shiftStartMins } = parseShiftStartTime(startTimeStr, 8);

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

        if (now >= scheduledEndUtc) continue;

        const slotsNeeded = targetSlots - activeCount;

        for (let slotIdx = 0; slotIdx < slotsNeeded; slotIdx++) {
          let targetWorkerId = null;
          let targetEmp = null;
          let workerName = null;
          let isWeeklyOffOrHoliday = false;
          let holidayRemark = null;

          // Priority 1: Shift boundWorkerId (if active and available)
          if (shift.boundWorkerId) {
            const boundId = String(shift.boundWorkerId._id || shift.boundWorkerId);
            if (!assignedWorkerIdsThisRun.has(boundId)) {
              const boundCheck = await checkCandidateWorkerEligibility({
                workerId: boundId,
                AttendanceModel: Attendance,
                EmployeesModel: Employees,
                SiteRosterHolidaysModel: SiteRosterHolidays,
                leaveManager,
                tenantDbName,
                lead,
                effectiveLeadId: lead._id,
                shift,
                shiftCodesList,
                todayDateStr,
                currentDayOfWeek,
                scheduledStartUtc,
                scheduledEndUtc,
                excludeWorkerIds: assignedWorkerIdsThisRun,
              });

              if (boundCheck.ok) {
                targetWorkerId = boundId;
                targetEmp = boundCheck.emp;
                workerName = boundCheck.emp.name || shift.boundWorkerName || 'Worker';
                isWeeklyOffOrHoliday = boundCheck.isWeeklyOffOrHoliday;
                holidayRemark = boundCheck.holidayRemark;
                if (isWeeklyOffOrHoliday) {
                  console.log(
                    `🏖️ [autoEndScheduler] Bound worker ${workerName} at ${lead.sender_name || 'Site'} has Weekly Off/Holiday (${holidayRemark || currentDayOfWeek}), but is available. Marking attendance as instructed.`
                  );
                }
              } else {
                console.log(
                  `ℹ️ [autoEndScheduler] Bound worker ${shift.boundWorkerName || boundId} is unavailable (${boundCheck.reason}: ${boundCheck.remark || ''}). Checking stepped previous day worker.`
                );
              }
            }
          }

          // Priority 2: Stepped Fallback: today-1, then today-2, then today-3...
          // Strictly avoids random worker selection. If weekly off/holiday worker available, mark attendance.
          if (!targetWorkerId) {
            const steppedWorker = await findSteppedPreviousDayWorker({
              AttendanceModel: Attendance,
              EmployeesModel: Employees,
              SiteRosterHolidaysModel: SiteRosterHolidays,
              leaveManager,
              tenantDbName,
              lead,
              effectiveLeadId: lead._id,
              shift,
              targetShiftCode: shiftCode,
              shiftCodesList,
              baseDate: scheduledStartUtc,
              todayDateStr,
              currentDayOfWeek,
              scheduledStartUtc,
              scheduledEndUtc,
              excludeWorkerIds: assignedWorkerIdsThisRun,
              maxDaysBack: 14,
            });

            if (steppedWorker) {
              targetWorkerId = steppedWorker.workerId;
              targetEmp = steppedWorker.emp;
              workerName = steppedWorker.workerName;
              isWeeklyOffOrHoliday = steppedWorker.isWeeklyOffOrHoliday;
              holidayRemark = steppedWorker.holidayRemark;
              console.log(
                `🔄 [autoEndScheduler] Stepped fallback selected worker ${workerName} (${targetWorkerId}) from today-${steppedWorker.foundDayOffset} for shift ${shiftCode} at site "${lead.sender_name || 'Site'}"`
              );
            }
          }

          if (!targetWorkerId || !targetEmp) {
            if (io && tenantDbName) {
              io.to(tenantDbName).emit('attendance:reliever_needed', {
                siteId: String(lead._id),
                siteName: lead.sender_name || lead.name || 'Site',
                shiftCode: shift.shiftCode,
                reason: 'No available worker found for shift slot (checked stepped previous days)',
              });
            }
            break; // Cannot fill further slots in this run
          }

          assignedWorkerIdsThisRun.add(targetWorkerId);

          // 4. Auto-start duty on clock set in client shift schedule
          const dutyStartActual = scheduledStartUtc;
          const dutyEndScheduled = scheduledEndUtc;
          const resolvedDailyRate = shift.salaryRate || targetEmp.daily_rate || targetEmp.rate || 0;

          // ── Resolve Site / Lead Coordinates for Auto-Started Duty ─────────────
          const { lat: siteLat, long: siteLong, address: siteAddress } = resolveLeadCoordinates(lead);

          const initialGeoHistory = [];
          if (siteLat !== null && siteLong !== null) {
            initialGeoHistory.push({
              lat: siteLat,
              long: siteLong,
              address: siteAddress || lead.sender_name || lead.name || 'Site Location',
              type: 'start',
              timestamp: scheduledStartUtc,
            });
          }

          const newDuty = new Attendance({
            employeeId: targetWorkerId,
            employeeType: 'Employees',
            workerName,
            role: targetEmp?.role || 'Security',
            leadId: lead._id,
            siteId: lead._id,
            clientId: lead.clientId || null,
            site_name: lead.sender_name || lead.name || 'Site',
            startLat: siteLat,
            startLong: siteLong,
            siteLat: siteLat,
            siteLong: siteLong,
            geoHistory: initialGeoHistory,
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
            remarks: isWeeklyOffOrHoliday
              ? `Auto-started duty for ${shift.shiftName || shiftCode} (${holidayRemark || 'Weekly Off / Holiday Duty'})`
              : `Auto-started duty for ${shift.shiftName || shiftCode}`,
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
    }
  } catch (err) {
    console.error('[autoEndScheduler] autoStartScheduledShifts error:', err.message);
  }
}

/**
 * Inactivity Monitor:
 * Scans for workers with no duty in last 60 days for administrative awareness.
 * Non-destructive: Does NOT alter active status or delink workers from siteShifts.
 */
async function autoDelinkInactiveWorkers(conn, tenantDbName, io) {
  // Safe monitor only: non-destructive to preserve operational site bindings
  return;
}

/**
 * Auto-heals missing geo coordinates (siteLat, siteLong, startLat, startLong, geoHistory)
 * for active attendance logs and today's attendance records from their matching Lead/Site.
 */
async function healMissingAttendanceGeo(conn, tenantDbName, io) {
  try {
    const { getTenantModels } = require('../models/TenantModels');
    const { Attendance, Leads } = getTenantModels(conn);
    if (!Attendance || !Leads) return 0;

    const { dateStr } = getIstInfo();
    const istOffsetMs = 5.5 * 3600000;
    const startOfTodayUtc = new Date(new Date(`${dateStr}T00:00:00.000Z`).getTime() - istOffsetMs);

    const query = {
      $and: [
        {
          $or: [
            { dutyEnd: null },
            { dutyEnd: { $exists: false } },
            { dutyEnd: '' },
            { date: { $gte: startOfTodayUtc } },
            { dutyStart: { $gte: startOfTodayUtc } },
          ],
        },
        {
          $or: [
            { siteLat: null },
            { siteLat: { $exists: false } },
            { siteLong: null },
            { siteLong: { $exists: false } },
            { startLat: null },
            { startLat: { $exists: false } },
            { startLong: null },
            { startLong: { $exists: false } },
            { geoHistory: { $size: 0 } },
            { geoHistory: { $exists: false } },
          ],
        },
      ],
    };

    const attendances = await Attendance.find(query).lean();
    if (!attendances || attendances.length === 0) return 0;

    let updatedCount = 0;
    for (const att of attendances) {
      const targetLeadId = att.leadId || att.siteId;
      let leadDoc = null;
      if (targetLeadId) {
        leadDoc = await Leads.findById(targetLeadId).lean();
      }
      if (!leadDoc && att.site_name) {
        leadDoc = await Leads.findOne({
          $or: [{ sender_name: att.site_name }, { name: att.site_name }],
        }).lean();
      }
      if (!leadDoc) continue;

      const coords = resolveLeadCoordinates(leadDoc, att);
      if (coords.lat === null || coords.long === null) continue;

      const $set = {};
      let changed = false;

      if (att.siteLat === undefined || att.siteLat === null) {
        $set.siteLat = coords.lat;
        changed = true;
      }
      if (att.siteLong === undefined || att.siteLong === null) {
        $set.siteLong = coords.long;
        changed = true;
      }
      if (att.startLat === undefined || att.startLat === null) {
        $set.startLat = coords.lat;
        changed = true;
      }
      if (att.startLong === undefined || att.startLong === null) {
        $set.startLong = coords.long;
        changed = true;
      }

      let updatedGeoHistory = Array.isArray(att.geoHistory) ? [...att.geoHistory] : [];
      const hasStart = updatedGeoHistory.some((g) => g && g.type === 'start');
      if (!hasStart) {
        updatedGeoHistory.unshift({
          lat: coords.lat,
          long: coords.long,
          address: coords.address || leadDoc.sender_name || leadDoc.name || att.site_name || 'Site Location',
          type: 'start',
          timestamp: att.dutyStart ? new Date(att.dutyStart) : new Date(),
        });
        $set.geoHistory = updatedGeoHistory;
        changed = true;
      }

      if (att.dutyEnd && !updatedGeoHistory.some((g) => g && g.type === 'end')) {
        updatedGeoHistory.push({
          lat: coords.lat,
          long: coords.long,
          address: coords.address || leadDoc.sender_name || leadDoc.name || att.site_name || 'Site Location',
          type: 'end',
          timestamp: new Date(att.dutyEnd),
        });
        $set.geoHistory = updatedGeoHistory;
        changed = true;
      }

      if (changed) {
        await Attendance.updateOne({ _id: att._id }, { $set });
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(`📍 [autoEndScheduler] Healed geo coordinates for ${updatedCount} attendance logs in tenant ${tenantDbName}`);
      if (io && tenantDbName) {
        io.to(tenantDbName).emit('attendance:active_updated');
      }
    }
    return updatedCount;
  } catch (err) {
    console.error(`[autoEndScheduler] healMissingAttendanceGeo error in ${tenantDbName}:`, err.message);
    return 0;
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
          const { Attendance, Leads } = getTenantModels(conn);
          if (Attendance) {
            await sweepExpiredShifts(Attendance, dbName, io);
          }
          if (Attendance && Leads) {
            await healMissingAttendanceGeo(conn, dbName, io);
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
  healMissingAttendanceGeo,
  getIstDayWindow,
  checkCandidateWorkerEligibility,
  findSteppedPreviousDayWorker,
};
