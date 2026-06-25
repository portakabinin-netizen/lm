/**
 * relieverRotation.js  (Phase 2c)
 * Auto-suggests the next reliever for a shift slot using a fixed rotation pattern.
 *
 * MANG: M -> A -> N -> M ...   (8-hour shifts)
 * DaNi: Day -> Night -> Day ...  (12-hour shifts)
 */

'use strict';

const ROTATION = {
  MANG: ['M', 'A', 'N'],
  DaNi: ['Day', 'Night'],
};

/**
 * Pure function: returns next shift code in rotation.
 * Falls back to first code if current not found.
 */
function nextShiftCode(group, currentCode) {
  const seq = ROTATION[group];
  if (!seq) return null;
  const i = seq.indexOf(currentCode);
  if (i === -1) return seq[0];
  return seq[(i + 1) % seq.length];
}

/**
 * Resolve the next reliever for a given site/shift/date.
 *
 * @param {Object} params
 * @param {string} params.siteId         - leadId of the site
 * @param {string} params.shiftGroup     - 'MANG' or 'DaNi'
 * @param {string} params.targetShiftCode - shift code the reliever should work next
 * @param {Date}   params.date           - target date (used for lookback reference)
 * @param {Object} models               - { Attendance, Employees, userMaster }
 * @returns {string|null}               - employeeId of suggested reliever, or null
 */
async function resolveReliever({ siteId, shiftGroup, targetShiftCode, date }, { Attendance }) {
  if (!siteId || !shiftGroup || !targetShiftCode || !Attendance) return null;

  const mongoose = require('mongoose');
  const targetDate = new Date(date || Date.now());

  // Lookback up to 7 days to handle absences/leaves
  const candidates = [];
  for (let daysBack = 1; daysBack <= 7; daysBack++) {
    const dayStart = new Date(targetDate);
    dayStart.setDate(dayStart.getDate() - daysBack);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const records = await Attendance.find({
      leadId: mongoose.isValidObjectId(siteId) ? new mongoose.Types.ObjectId(siteId) : siteId,
      shiftGroupName: shiftGroup,
      dutyStart: { $gte: dayStart, $lte: dayEnd },
      dutyEnd: { $exists: true, $ne: null }, // completed shifts only
    }).select('employeeId shiftCode').lean();

    for (const rec of records) {
      const expected = nextShiftCode(shiftGroup, rec.shiftCode);
      if (expected === targetShiftCode) {
        candidates.push(String(rec.employeeId));
      }
    }

    if (candidates.length > 0) break; // found candidates — stop looking further back
  }

  if (candidates.length === 0) return null;

  // Exclude workers currently on active duty elsewhere
  const activeSessions = await Attendance.find({
    employeeId: { $in: candidates.map((id) => mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : id) },
    $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
  }).select('employeeId').lean();

  const busyIds = new Set(activeSessions.map((a) => String(a.employeeId)));
  const available = candidates.filter((id) => !busyIds.has(id));

  return available.length > 0 ? available[0] : null;
}

module.exports = { nextShiftCode, resolveReliever, ROTATION };
