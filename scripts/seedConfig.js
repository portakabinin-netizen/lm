const mongoose = require("mongoose");
require("dotenv").config();
const dbConnector = require("../utils/dbConnector");

async function seedConfig() {
    try {
        console.log("📡 Connecting to Main Database...");
        const mainConn = await dbConnector.getMainConnection();
        const userMaster = require("../models/userMaster");

        // 1. Get all corporate admins to find their tenant DBs
        const admins = await userMaster.find({ userRole: "CorpAdmin" });
        console.log(`🔍 Found ${admins.length} Corporate Admins.`);

        for (const admin of admins) {
            for (const corp of admin.linkedCorporates) {
                const dbName = corp.dbName; // Corrected path
                if (!dbName) continue;

                console.log(`📦 Updating Tenant DB: ${dbName}...`);
                const tenantConn = await dbConnector.getTenantConnection(dbName);
                
                // Use correct schema name: corporateProfileSchema
                const ProfileMaster = tenantConn.model("ProfileMaster", require("../models/masterShared").corporateProfileSchema);

                const result = await ProfileMaster.findOneAndUpdate({}, {
                    $set: {
                        "apiUrls.cloudinary": {
                            cloud_name: "dzoxp1a6x",
                            api_key: "896139215177423",
                            api_secret: "IAf5Pwi9QVHhtj_p4LIYw0TWk3E",
                            isActive: true
                        },
                        "apiUrls.leadApis": [{
                            b2bName: "TradeIndia",
                            url: "https://www.tradeindia.com/utils/my_inquiry.html",
                            userid: "23134696",
                            profile_id: "102656695",
                            key: "abef1268bf0df7863ae259fb1c2b611d",
                            isActive: true
                        }]
                    }
                }, { upsert: true, new: true });
                
                if (result) {
                    console.log(`✅ ${dbName} updated successfully. Cloudinary: ${result.apiUrls.cloudinary.cloud_name}`);
                } else {
                    console.log(`⚠️ ${dbName} - Failed to update/create ProfileMaster document.`);
                }
            }
        }

        console.log("✨ All configurations seeded.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Seeding failed:", err);
        process.exit(1);
    }
}

seedConfig();
