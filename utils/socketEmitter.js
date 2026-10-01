/**
 * socketEmitter.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin helper that standardises the payload shape for all Socket.IO events
 * broadcast to tenant rooms. Every controller MUST use this instead of calling
 * req.io.to().emit() directly — it keeps event names, payload formats, and
 * bandwidth consistent.
 *
 * Bandwidth Optimisations
 * ─────────────────────────────────────────────────────────────────────────────
 *  • geoHistory arrays are stripped from socket payloads (they can be MBs).
 *  • activity arrays on leads are stripped when > 20 entries (send latest 5 only).
 *  • Timestamps are ISO strings (not Date objects) to avoid re-serialisation.
 *
 * Usage in a controller:
 *
 *   const emit = require('../utils/socketEmitter');
 *
 *   // After creating a lead:
 *   emit(req, 'lead:created', { data: newLead });
 *
 *   // After updating an employee:
 *   emit(req, 'employee:updated', { data: updatedEmployee });
 *
 *   // After deleting a party:
 *   emit(req, 'party:deleted', { id: req.params.id });
 */

/**
 * Strip bandwidth-heavy fields from the emitted payload.
 * @param {object|null|undefined} data
 * @returns {object|null}
 */
function slimPayload(data) {
  if (!data || typeof data !== 'object') return data;

  // Work on a shallow copy so we never mutate the original
  const out = { ...data };

  // geoHistory can be thousands of coordinate ticks — never needed in push events
  if (out.geoHistory !== undefined) {
    out.geoHistory = undefined; // will be stripped on JSON.stringify
  }

  // Trim large activity arrays: keep the 5 most-recent entries only
  if (Array.isArray(out.activity) && out.activity.length > 20) {
    out.activity = out.activity.slice(-5);
  }

  // Recursively slim nested objects one level deep (e.g. Mongoose toObject results)
  // Do NOT recurse further to avoid O(n) on large arrays
  return out;
}

/**
 * @param {import('express').Request} req
 * @param {string} event      – Socket event name, e.g. 'lead:updated'
 * @param {object} [payload]  – Arbitrary payload; { data } will be slimmed
 */
function emit(req, event, payload = {}) {
  try {
    const dbName = req.tenantDbName || req.headers?.['x-tenant-id'] || req.body?.dbName;
    if (!dbName || !req.io) return;

    const optimised = { ...payload };
    if (optimised.data) {
      optimised.data = slimPayload(optimised.data);
    }

    req.io.to(dbName).emit(event, {
      ...optimised,
      _emittedAt: new Date().toISOString(),
      _dbName: dbName,
    });
  } catch (err) {
    console.warn(`[socketEmitter] Failed to emit "${event}":`, err.message);
  }
}

module.exports = emit;
module.exports.slimPayload = slimPayload;
