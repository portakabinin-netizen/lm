/**
 * leaveManager.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Tenant-isolated in-memory cache and helper service for leave management.
 * Integrates directly with Tenant MongoDB (RequestMaster model (requestMaster collection)).
 * Does NOT read or write to disk JSON files.
 */

'use strict';

// In-memory cache per tenant: tenantDbName -> { loadedAt, records: [] }
const _leaveCache = new Map();

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
 * Refreshes approved leaves in-memory cache for a given tenant from MongoDB.
 */
async function refreshTenantLeaveCache(tenantDbName, connection) {
  if (!tenantDbName) return [];
  try {
    let conn = connection;
    if (!conn) {
      const dbConnector = require('./dbConnector');
      conn = await dbConnector.getTenantConnection(tenantDbName);
    }
    const { getTenantModels } = require('../models/TenantModels');
    const { RequestMaster, LeaveRequests } = getTenantModels(conn);
    const RequestMasterModel = RequestMaster || LeaveRequests;
    if (!RequestMasterModel) return [];

    const docs = await RequestMasterModel.find({
      status: 'Approved',
      requestTypes: 'leave',
    }).lean();

    _leaveCache.set(tenantDbName, {
      loadedAt: Date.now(),
      records: docs,
    });
    return docs;
  } catch (err) {
    console.warn(`[leaveManager] Error refreshing cache for ${tenantDbName}:`, err.message);
    return [];
  }
}

/**
 * Checks if a worker has an approved leave on a specific date in tenant's MongoDB.
 */
function isWorkerOnApprovedLeave(tenantDbName, workerId, dateStr) {
  if (!workerId || !dateStr) return null;
  const wId = String(workerId);
  const targetDate = String(dateStr).split('T')[0];

  const cache = _leaveCache.get(tenantDbName);
  if (!cache || Date.now() - cache.loadedAt > 60000) {
    refreshTenantLeaveCache(tenantDbName).catch(() => {});
  }

  const records = cache ? cache.records : [];
  return (
    records.find(
      (r) =>
        String(r.workerId) === wId &&
        r.status === 'Approved' &&
        Array.isArray(r.dates) &&
        r.dates.includes(targetDate)
    ) || null
  );
}

/**
 * Invalidate cache on leave status changes.
 */
function invalidateCache(tenantDbName) {
  if (tenantDbName) {
    _leaveCache.delete(tenantDbName);
  }
}

module.exports = {
  isWorkerOnApprovedLeave,
  refreshTenantLeaveCache,
  invalidateCache,
  getDatesInRange,
};
