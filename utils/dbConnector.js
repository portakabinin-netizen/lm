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

const dbConnector = {
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
     * @param {string} dbName - Target database name (Hex PAN)
     */
    getTenantConnection: async (dbName) => {
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
            connections.set(dbName, tenantConn);
            return tenantConn;
        } catch (err) {
            console.error(`❌ Tenant Database Connection Error (${dbName}):`, err.message);
            throw err;
        }
    }
};

module.exports = dbConnector;
