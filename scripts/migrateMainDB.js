const mongoose = require("mongoose");
require("dotenv").config({ path: "../.env" });

async function migrate() {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error("MONGO_URI not found");
        return;
    }

    const baseUri = uri.replace(/\/[^/?]+(?=\?|$)/, "/mainDatabase");
    console.log(`📡 Connecting to ${baseUri}...`);

    try {
        await mongoose.connect(baseUri);
        const db = mongoose.connection.db;

        // 1. Cleanup Legacy Collections
        const collections = await db.listCollections().toArray();
        const required = ["usermasters", "sessions", "counters"]; // Basic required collections
        
        for (const col of collections) {
            const name = col.name;
            if (!required.includes(name)) {
                const count = await db.collection(name).countDocuments();
                if (count === 0) {
                    console.log(`🗑️ Dropping empty legacy collection: ${name}`);
                    await db.collection(name).drop();
                } else {
                    console.log(`⚠️ Collection ${name} has ${count} documents. Please check manually if it can be removed.`);
                    // Drop them if they match known legacy names
                    if (["corpdatamasters", "ledgervouchermasters"].includes(name)) {
                        console.log(`🚨 Dropping legacy hub collection: ${name}`);
                        await db.collection(name).drop();
                    }
                }
            }
        }

        // 2. Migrate User Access (corporateId -> dbName)
        console.log("🔄 Migrating user access corporateId -> dbName...");
        const userMasters = db.collection("usermasters");
        
        // Find all admins to use as reference
        const admins = await userMasters.find({ userRole: "CorpAdmin" }).toArray();
        let updatedCount = 0;

        for (const admin of admins) {
            const corporates = admin.linkedCorporates || [];
            for (const corp of corporates) {
                if (corp.dbName && corp._id) {
                    // Update all sub-users linked to this specific corporate ID
                    const result = await userMasters.updateMany(
                        { 
                            "accessCorporate.corporateId": corp._id,
                            "accessCorporate.dbName": { $exists: false }
                        },
                        { 
                            $set: { "accessCorporate.dbName": corp.dbName },
                            $unset: { 
                                "accessCorporate.corporateId": "", 
                                "accessCorporate.corpAdminId": "" 
                            }
                        }
                    );
                    updatedCount += result.modifiedCount;
                }
            }
        }

        console.log(`✅ Migration complete. Updated ${updatedCount} users.`);

    } catch (err) {
        console.error("❌ Migration failed:", err.message);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Disconnected.");
    }
}

migrate();
