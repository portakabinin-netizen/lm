const mongoose = require("mongoose");
require("dotenv").config();

/**
 * 🔌 Database Connector (v2.2 - Optimised Multi-Tenant)
 *
 * CPU / RAM optimisations vs v2.1
 * ────────────────────────────────────────────────────────────────────────────
 *  • POOL TUNING: minPoolSize=2 / maxPoolSize=8 per tenant connection.
 *    Previously Mongoose defaulted to 100 connections which exhausted RAM on
 *    Atlas M10/M20 tiers. 8 concurrent ops per tenant is plenty for this app.
 *
 *  • CONNECTION REUSE: getTenantConnection() now validates readyState BEFORE
 *    creating a new connection so cold re-hits after a transient disconnect
 *    don't leak an extra connection object.
 *
 *  • IDLE TIMEOUT: serverSelectionTimeoutMS=5000 prevents requests from
 *    hanging indefinitely when Atlas temporarily throttles.
 *
 *  • socketTimeoutMS=30000 kills zombie sockets that are technically "open"
 *    but stalled, freeing the pool slot back for real requests.
 *
 *  • heartbeatFrequencyMS=20000 (was default 10s) — halves topology heartbeat
 *    CPU usage at the cost of a slightly slower failover detection window.
 *    Acceptable for a non-replica-set topology.
 *
 *  • AUTO-DISCONNECT: tenant connections that have had zero activity for
 *    IDLE_CLOSE_MS are closed and evicted from the Map so their socket + pool
 *    memory is reclaimed. Activity is tracked via a lastUsed timestamp.
 */

const SHARED_OPTS = {
  family: 4,
  maxPoolSize: 8,          // max concurrent ops per connection (was 100)
  minPoolSize: 2,          // keep 2 warm so first request is instant
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 30_000,
  connectTimeoutMS: 10_000,
  heartbeatFrequencyMS: 20_000, // halves heartbeat CPU vs default 10s
};

// ─── Connection registry ──────────────────────────────────────────────────────
const connections = new Map(); // dbName -> { conn, lastUsed }

// ─── Idle connection reaper ───────────────────────────────────────────────────
// Close and evict tenant connections that haven't been used for 30 minutes.
const IDLE_CLOSE_MS = 30 * 60 * 1000; // 30 min

setInterval(async () => {
  const now = Date.now();
  for (const [dbName, entry] of connections.entries()) {
    if (now - entry.lastUsed > IDLE_CLOSE_MS) {
      try {
        await entry.conn.close();
        console.log(`[dbConnector] Closed idle tenant connection: ${dbName}`);
      } catch (_) {}
      connections.delete(dbName);
    }
  }
}, 5 * 60 * 1000); // check every 5 minutes

// ─── Main Connection (Singleton) ─────────────────────────────────────────────
let mainConnection = null;

const dbConnector = {
  /**
   * Returns the main connection for userMaster.
   */
  getMainConnection: async () => {
    if (mainConnection && mainConnection.readyState === 1) return mainConnection;

    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI not found in environment");

    const baseUri = uri.replace(/\/[^/?]+(?=\?|$)/, "/mainDatabase");
    await mongoose.connect(baseUri, SHARED_OPTS);
    mainConnection = mongoose.connection;
    return mainConnection;
  },

  /**
   * Returns a specific tenant connection based on name.
   * @param {string} dbName - Target database name (Hex PAN)
   */
  getTenantConnection: async (dbName) => {
    const entry = connections.get(dbName);
    if (entry) {
      if (entry.conn.readyState === 1) {
        entry.lastUsed = Date.now();
        return entry.conn;
      }
      // Stale / disconnected — evict and reconnect
      connections.delete(dbName);
    }

    const masterUri = process.env.MONGO_URI;
    if (!masterUri) throw new Error("MONGO_URI missing");

    const tenantUri = masterUri.replace(/\/[^/?]+(?=\?|$)/, `/${dbName}`);

    try {
      const tenantConn = await mongoose.createConnection(tenantUri, SHARED_OPTS).asPromise();
      connections.set(dbName, { conn: tenantConn, lastUsed: Date.now() });

      // Schema migration runs in background — never blocks API requests
      try {
        const { migrateTenantDb } = require("./schemaMigrator");
        migrateTenantDb(tenantConn, dbName).catch((mErr) => {
          console.warn(`[Migrator] Background check warning (${dbName}):`, mErr.message);
        });
      } catch (_) {}

      return tenantConn;
    } catch (err) {
      console.error(`❌ Tenant Database Connection Error (${dbName}):`, err.message);
      throw err;
    }
  },

  /**
   * How many tenant connections are currently alive (diagnostic).
   */
  activeConnections: () => connections.size,
};

module.exports = dbConnector;
