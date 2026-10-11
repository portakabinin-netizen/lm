const mongoose = require("mongoose");
require("dotenv").config();

/**
 * 🔌 Database Connector (v2.1 - Simplified Multi-Tenant)
 * Manages the primary (mainDatabase) and secondary (tenantDatabase) connections.
 * Uses Shared Admin credentials for all databases.
 */
const connections = new Map();

// Main Primary Connection (Singleton)
let mainConnection = null;

const KNOWN_TENANTS = {
    "portakabin.in": "41414546483437393441",
    "portakabin": "41414546483437393441",
    "resident's hn347": "41455750433838343445",
    "residents hn347": "41455750433838343445",
    "resident": "41455750433838343445",
    "pratham services": "41444c50503539303542",
    "pratham": "41444c50503539303542",
    "team security and hr solutions pvt ltd": "41414443543830373245",
    "team security and hr solutions": "41414443543830373245",
    "team security": "41414443543830373245",
    "aaefh4794a": "41414546483437393441",
    "aewpc8844e": "41455750433838343445",
    "adlpp5905b": "41444c50503539303542",
    "aadct8072f": "41414443543830373245",
};

function normalizeTenantDb(raw) {
    if (!raw || typeof raw !== "string") return "41414546483437393441";
    const clean = raw.trim().toLowerCase();
    if (KNOWN_TENANTS[clean]) return KNOWN_TENANTS[clean];
    if (/^[a-z]{5}[0-9]{4}[a-z]$/i.test(clean)) {
        return Buffer.from(clean.toUpperCase()).toString("hex");
    }
    if (/^[0-9a-f]{20}$/i.test(clean)) {
        return clean;
    }
    if (clean.includes(".") || clean.includes(" ") || clean.includes("'") || clean.includes('"') || clean.includes("$")) {
        return "41414546483437393441";
    }
    return clean || "41414546483437393441";
}

const dbConnector = {
    normalizeTenantDb,

    /**
     * Returns the main connection for userMaster.
     */
    getMainConnection: async () => {
        if (mainConnection && mainConnection.readyState === 1) return mainConnection;

        const uri = process.env.MONGO_URI;
        if (!uri) throw new Error("MONGO_URI not found in environment");
        try {
            // Robustly replace the database name in the URI (prevents "doubling" names)
            const baseUri = uri.replace(/\/[^/?]+(?=\?|$)/, "/mainDatabase");

            await mongoose.connect(baseUri, { family: 4 });
            mainConnection = mongoose.connection;
            return mainConnection;
        } catch (err) {
            console.error("❌ Main Database Connection Error:", err.message);
            throw err;
        }
    },

    /**
     * Returns a specific tenant connection based on name.
     * Uses Primary Administrative Credentials for access.
     * @param {string} rawDbName - Target database name or alias
     */
    getTenantConnection: async (rawDbName) => {
        const dbName = normalizeTenantDb(rawDbName);

        if (connections.has(dbName)) {
            const conn = connections.get(dbName);
            if (conn.readyState === 1) return conn;
            connections.delete(dbName);
        }

        const masterUri = process.env.MONGO_URI;
        if (!masterUri) throw new Error("MONGO_URI missing");

        // Robustly replace the database name in the master URI for the tenant
        let tenantUri = masterUri.replace(/\/[^/?]+(?=\?|$)/, `/${dbName}`);

        try {
            const tenantConn = await mongoose.createConnection(tenantUri, { family: 4 }).asPromise();
            
            // Run schema migration to convert legacy documents
            const { migrateTenantDb } = require("./schemaMigrator");
            await migrateTenantDb(tenantConn, dbName);

            connections.set(dbName, tenantConn);
            return tenantConn;
        } catch (err) {
            console.error(`❌ Tenant Database Connection Error (${dbName}):`, err.message);
            throw err;
        }
    }
};

module.exports = dbConnector;
