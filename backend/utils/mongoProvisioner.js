const { MongoClient } = require("mongodb");
require("dotenv").config();

/**
 * 🏗️ MongoDB Provisioner (v2.1 - Profile Master Seeding)
 * Handles the creation and initialization of isolated tenant databases.
 * Seeds the 'profileMaster' collection with the corporate metadata.
 */
const mongoProvisioner = {
    /**
     * Initializes a new isolated database and seeds the profile.
     * @param {string} dbName - Target database name (Hex PAN)
     * @param {object} profileData - Corporate metadata to seed
     */
    provisionDatabase: async (dbName, profileData) => {
        const uri = process.env.MONGO_URI;
        if (!uri) throw new Error("MONGO_URI missing");

        const client = new MongoClient(uri);

        try {
            await client.connect();

            const targetDb = client.db(dbName);
            
            // 1. Initialize System Tracker
            await targetDb.createCollection("system_init");
            await targetDb.collection("system_init").insertOne({ 
                initializedAt: new Date(),
                version: "1.3.0",
                provisioningType: "SharedAdmin_WithProfile"
            });

            // 2. Seed Profile Master (Isolation Source of Truth)
            if (profileData) {
                await targetDb.collection("profileMaster").insertOne({
                    ...profileData,
                    corporateActive: true,
                    createdAt: new Date(),
                    updatedAt: new Date()
                });
            }

            return { success: true, dbName };
        } catch (err) {
            console.error(`❌ Initialization Failed for ${dbName}:`, err.message);
            throw err;
        } finally {
            await client.close();
        }
    }
};

module.exports = mongoProvisioner;
