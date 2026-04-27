const { MongoClient } = require("mongodb");
require("dotenv").config();

/**
 * 🧹 Legacy Cleanup Utility
 * Purpose: Attempts to drop the old database and provides guidance on permissions.
 */

async function cleanup() {
    const uri = process.env.MONGO_URI;
    const targetDbName = "mainDatabasemainDatabase"; // Confirmed target

    if (!uri) {
        console.error("❌ MONGO_URI missing from .env");
        return;
    }

    const client = new MongoClient(uri);

    try {
        console.log(`🔗 Connecting to cluster...`);
        await client.connect();
        
        const db = client.db(targetDbName);

        console.log(`⚠️ Attempting to DROP database: ${targetDbName}...`);
        
        try {
            await db.dropDatabase();
            console.log(`✨ SUCCESS: Database '${targetDbName}' has been dropped.`);
        } catch (dropErr) {
            console.error(`\n❌ DROP FAILED: ${dropErr.message}`);
            
            if (dropErr.message.includes("not authorized") || dropErr.code === 13) {
                console.log("\n--- HOW TO FIX IN MONGODB ATLAS ---");
                console.log("1. Log in to cloud.mongodb.com");
                console.log("2. Project -> Database Access");
                console.log("3. Edit your current user");
                console.log("4. Temporarily grant 'Project Data Access Admin' or 'Atlas Admin'");
                console.log("5. Run this script again.");
                console.log("6. Revoke the high-privilege role once done.");
                console.log("-----------------------------------\n");
            }
        }

    } catch (err) {
        console.error(`❌ Connection error: ${err.message}`);
    } finally {
        await client.close();
    }
}

cleanup();
