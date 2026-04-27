const mongoose = require("mongoose");
require("dotenv").config();

/**
 * 🛠️ Bootstrap Script
 * Purpose: Initializes the 'mainDatabase' and 'userMaster' collection on the cluster.
 * Run this once to set up your primary identity layer.
 */

async function bootstrap() {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error("❌ MONGO_URI not found in .env");
        process.exit(1);
    }

    try {
        console.log("🔗 Connecting to cluster...");
        // Connect to the cluster (defaulting to mainDatabase)
        const connection = await mongoose.createConnection(uri).asPromise();
        
        console.log("✅ Cluster Connected.");
        
        // Use 'mainDatabasemainDatabase' explicitly
        const db = connection.useDb("mainDatabasemainDatabase");
        
        console.log("📦 Initializing 'userMaster' collection...");
        // Create collection if it doesn't exist
        await db.createCollection("userMaster");
        
        const userMaster = db.collection("userMaster");
        
        console.log("⚡ Creating Indexes...");
        await userMaster.createIndex({ userMobile: 1 }, { unique: true });
        await userMaster.createIndex({ userAadhar: 1 }, { unique: true, sparse: true });
        await userMaster.createIndex({ "linkedCorporates.corporatePAN": 1 });

        console.log("\n✨ Bootstrap Complete!");
        console.log("--------------------------------------------------");
        console.log("Database:   mainDatabasemainDatabase");
        console.log("Collection: userMaster");
        console.log("--------------------------------------------------");
        
        await connection.close();
        process.exit(0);
    } catch (err) {
        console.error("❌ Bootstrap Failed:", err.message);
        process.exit(1);
    }
}

bootstrap();
