/**
 * leaveManager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * File-backed leave management engine using JSON storage per tenant.
 * - Stores worker granted leaves linked to worker, project/site, and admin approver.
 * - Automatically prunes records older than 2 months (rolling 60-day window).
 * - Provides fast in-memory cache for O(1) worker availability lookup.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MAX_HISTORY_MONTHS = 2; // Rolling 2-month retention

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('[leaveManager] Failed to create data directory:', err.message);
  }
}

// In-memory cache: tenantDbName -> { loadedAt, records: [] }
const _leaveCache = new Map();

function getFilePath(tenantDbName) {
  if (!tenantDbName || tenantDbName === 'default' || tenantDbName === 'master') {
    return path.join(DATA_DIR, 'leave.json');
  }
  const safeName = String(tenantDbName).replace(/[^a-zA-Z0-9_-]/g, '_');
  const tenantPath = path.join(DATA_DIR, `leaves_${safeName}.json`);
  // If tenant-specific file doesn't exist yet but leave.json exists, allow reading leave.json
  return tenantPath;
}

/**
 * Generates an array of "YYYY-MM-DD" date strings between startDate and endDate (inclusive).
 */
function getDatesInRange(startDateStr, endDateStr) {
  const dates = [];
  const curr = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (isNaN(curr.getTime()) || isNaN(end.getTime())) {
    return [startDateStr];
  }
  while (curr <= end) {
    dates.push(curr.toISOString().split('T')[0]);
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

/**
 * Loads leave records for a tenant with automatic 2-month retention pruning.
 */
function loadLeaves(tenantDbName) {
  const filePath = getFilePath(tenantDbName);
  const fallbackPath = path.join(DATA_DIR, 'leave.json');
  const readPath = fs.existsSync(filePath) ? filePath : (fs.existsSync(fallbackPath) ? fallbackPath : filePath);
  let data = { lastPrunedAt: new Date().toISOString(), records: [] };

  if (fs.existsSync(readPath)) {
    try {
      const raw = fs.readFileSync(readPath, 'utf8');
      data = JSON.parse(raw);
      if (!Array.isArray(data.records)) {
        data.records = [];
      }
    } catch (err) {
      console.error(`[leaveManager] Error reading ${readPath}:`, err.message);
      data = { lastPrunedAt: new Date().toISOString(), records: [] };
    }
  }

  // Rolling 2-month pruning: discard records where endDate is older than 60 days
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - MAX_HISTORY_MONTHS);
  const cutoffDateStr = cutoff.toISOString().split('T')[0];

  const originalCount = data.records.length;
  data.records = data.records.filter((rec) => {
    const end = rec.toDate || rec.endDate || rec.fromDate || '';
    return end >= cutoffDateStr;
  });

  if (data.records.length !== originalCount) {
    data.lastPrunedAt = new Date().toISOString();
    saveLeaves(tenantDbName, data);
    console.log(
      `[leaveManager] Pruned ${originalCount - data.records.length} leave records older than 2 months (${cutoffDateStr}) for ${tenantDbName}`
    );
  }

  _leaveCache.set(tenantDbName, { loadedAt: Date.now(), records: data.records });
  return data;
}

/**
 * Persists leave records to disk.
 */
function saveLeaves(tenantDbName, data) {
  const filePath = getFilePath(tenantDbName);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    _leaveCache.set(tenantDbName, { loadedAt: Date.now(), records: data.records });
    return true;
  } catch (err) {
    console.error(`[leaveManager] Error writing ${filePath}:`, err.message);
    return false;
  }
}

/**
 * Checks if a worker has an approved leave on a specific date.
 */
function isWorkerOnApprovedLeave(tenantDbName, workerId, dateStr) {
  if (!workerId || !dateStr) return null;
  const wId = String(workerId);
  const targetDate = String(dateStr).split('T')[0];

  let cache = _leaveCache.get(tenantDbName);
  if (!cache || Date.now() - cache.loadedAt > 30000) {
    loadLeaves(tenantDbName);
    cache = _leaveCache.get(tenantDbName);
  }

  const records = cache ? cache.records : [];
  return (
    records.find(
      (r) =>
        String(r.workerId) === wId &&
        r.status === 'Approved' &&
        (!r.requestTypes || r.requestTypes.includes('leave')) &&
        Array.isArray(r.dates) &&
        r.dates.includes(targetDate)
    ) || null
  );
}

/**
 * Applies for a new request (Leave, Advance, and/or Articles).
 */
function applyLeave(tenantDbName, params) {
  const {
    workerId,
    workerName,
    workerRole,
    workerMobile,
    projectId,
    projectName,
    shiftCode,
    requestTypes = ['leave'],
    fromDate,
    toDate,
    leaveType,
    reason,
    advanceAmount,
    advanceDetails,
    articleItems,
    articlesDetails,
    duesSummary,
    appliedBy,
  } = params;

  if (!workerId) {
    throw new Error('workerId is required');
  }

  const hasLeave = Array.isArray(requestTypes) && requestTypes.includes('leave');
  const todayStr = new Date().toISOString().split('T')[0];
  const effFrom = fromDate || todayStr;
  const effTo = toDate || effFrom;

  const dates = hasLeave ? getDatesInRange(effFrom, effTo) : [];
  const noOfDays = dates.length;

  const data = loadLeaves(tenantDbName);

  const newRecord = {
    id: `REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    workerId: String(workerId),
    workerName: workerName || 'Worker',
    workerRole: workerRole || 'Security',
    workerMobile: workerMobile || '',
    userType: params.userType || (appliedBy?.userRole === 'worker' ? 'WORKER' : 'REGISTERED_USER'),
    projectId: projectId ? String(projectId) : '',
    projectName: projectName || 'Site Project',
    shiftCode: shiftCode || '',
    requestTypes: Array.isArray(requestTypes) && requestTypes.length > 0 ? requestTypes : ['leave'],
    fromDate: effFrom,
    toDate: effTo,
    noOfDays,
    dates,
    leaveType: leaveType || 'Casual',
    reason: reason || 'Request submitted',
    advanceAmount: Number(advanceAmount) || 0,
    advanceDetails: advanceDetails || null,
    articleItems: Array.isArray(articleItems) ? articleItems : [],
    articlesDetails: articlesDetails || null,
    duesSummary: duesSummary || null,
    status: 'Pending',
    approvedBy: null,
    approvedById: null,
    approvedAt: null,
    rejectionReason: null,
    appliedBy: appliedBy || {
      userId: '',
      userName: workerName || 'Self',
      userRole: 'worker',
      isSelf: true,
    },
    appliedAt: new Date().toISOString(),
  };

  data.records.unshift(newRecord);
  saveLeaves(tenantDbName, data);
  return newRecord;
}

/**
 * Reviews a leave request: Approve or Disapprove.
 */
function reviewLeave(tenantDbName, leaveId, action, adminInfo = {}) {
  const data = loadLeaves(tenantDbName);
  const record = data.records.find((r) => r.id === leaveId);

  if (!record) {
    throw new Error(`Leave record ${leaveId} not found`);
  }

  const isApproval = String(action).toLowerCase() === 'approved';

  // 🛑 RULE: Admin cannot approve their own leave request!
  const adminIdStr = String(adminInfo.id || '').trim();
  const workerIdStr = String(record.workerId || '').trim();
  const appliedByIdStr = String(record.appliedBy?.userId || '').trim();

  if (isApproval && adminIdStr && (adminIdStr === workerIdStr || adminIdStr === appliedByIdStr)) {
    throw new Error('Self-approval restricted: Admin cannot approve their own leave request. Another administrator must review this request.');
  }

  record.status = isApproval ? 'Approved' : 'Disapproved';
  record.approvedBy = adminInfo.name || 'Admin';
  record.approvedById = adminInfo.id ? String(adminInfo.id) : null;
  record.approvedAt = new Date().toISOString();
  if (!isApproval && adminInfo.reason) {
    record.rejectionReason = adminInfo.reason;
  }

  saveLeaves(tenantDbName, data);
  return record;
}

/**
 * Lists leave records with optional status, project, worker, or date filtering.
 */
function listLeaves(tenantDbName, filter = {}) {
  const data = loadLeaves(tenantDbName);
  let results = [...data.records];

  if (filter.status) {
    results = results.filter((r) => r.status.toLowerCase() === String(filter.status).toLowerCase());
  }
  if (filter.workerId) {
    results = results.filter((r) => String(r.workerId) === String(filter.workerId));
  }
  if (filter.projectId) {
    results = results.filter((r) => String(r.projectId) === String(filter.projectId));
  }
  if (filter.date) {
    const dStr = String(filter.date).split('T')[0];
    results = results.filter((r) => Array.isArray(r.dates) && r.dates.includes(dStr));
  }

  return results;
}

module.exports = {
  loadLeaves,
  saveLeaves,
  isWorkerOnApprovedLeave,
  applyLeave,
  reviewLeave,
  listLeaves,
  getDatesInRange,
};

