/**
 * relieverRotation.js (Phase 2c)
 * Auto-suggests the next reliever for a shift slot using a fixed rotation pattern.
 *
 * MANG: M -> A -> N -> M ... (8-hour shifts) - G (General) is strictly EXEMPT.
 * DaNi: D <-> N2 (12-hour shifts: Day <-> Night12)
 */

'use strict';

const ROTATION = {
  MANG: ['M', 'A', 'N'],
  DaNi: ['D', 'N2'],
};

function normalizeShiftCode(code) {
  if (!code) return '';
  const s = String(code).trim().toUpperCase();
  if (s === 'D' || s === 'DAY') return 'D';
  if (s === 'N2' || s === 'NIGHT12' || s === 'NIGHT') return 'N2';
  if (s === 'M' || s === 'MORNING') return 'M';
  if (s === 'A' || s === 'AFTERNOON') return 'A';
  if (s === 'N' || s === 'NIGHT8') return 'N';
  if (s === 'G' || s === 'GENERAL') return 'G';
  return s;
}

/**
 * Pure function: returns next shift code in rotation.
 * General shift (G) is strictly EXEMPT and returns null.
 */
function nextShiftCode(group, currentCode) {
  const normCurrent = normalizeShiftCode(currentCode);
  if (normCurrent === 'G') {
    return null; // G is exempt from rotational switching
  }
  const normGroup = group === 'DaNi' ? 'DaNi' : 'MANG';
  const seq = ROTATION[normGroup];
  if (!seq) return null;
  const i = seq.indexOf(normCurrent);
  if (i === -1) return seq[0];
  return seq[(i + 1) % seq.length];
}

/**
 * Resolve the next reliever for a given site/shift/date.
 *
 * @param {Object} params
 * @param {string} params.siteId          - leadId of the site
 * @param {string} params.shiftGroup      - 'MANG' or 'DaNi'
 * @param {string} params.targetShiftCode - shift code the reliever should work next
 * @param {Date}   params.date            - target date (used for lookback reference)
 * @param {Object} models                 - { Attendance, Employees, userMaster }
 * @returns {string|null}                - employeeId of suggested reliever, or null
 */
async function resolveReliever({ siteId, shiftGroup, targetShiftCode, date }, { Attendance }) {
  if (!siteId || !shiftGroup || !targetShiftCode || !Attendance) return null;

  const normTarget = normalizeShiftCode(targetShiftCode);
  if (normTarget === 'G') return null; // G is exempt

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
      if (expected === normTarget) {
        candidates.push(String(rec.employeeId));
      }
    }

    if (candidates.length > 0) break; // found candidates - stop looking further back
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

module.exports = { nextShiftCode, resolveReliever, normalizeShiftCode, ROTATION };
