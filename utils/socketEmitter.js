/**
 * socketEmitter.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin helper that standardises the payload shape for all Socket.IO events
 * broadcast to tenant rooms. Every controller uses this instead of calling
 * req.io.to().emit() directly, to keep event names and payload formats
 * consistent with what the mobile app's useTenantData hook expects.
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
 * @param {import('express').Request} req
 * @param {string} event
 * @param {object} payload
 */
function emit(req, event, payload = {}) {
    try {
        const dbName = req.tenantDbName || req.headers?.['x-tenant-id'] || req.body?.dbName;
        if (!dbName || !req.io) return;
        req.io.to(dbName).emit(event, {
            ...payload,
            _emittedAt: new Date().toISOString(),
            _dbName: dbName,
        });
    } catch (err) {
        console.warn(`[socketEmitter] Failed to emit "${event}":`, err.message);
    }
}

module.exports = emit;
