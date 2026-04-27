const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const envPath = path.join(__dirname, "../.env");
require("dotenv").config({ path: envPath });

async function migrate() {
    console.log("🚀 Starting UserMaster Schema Upgrade...");

    try {
        if (!process.env.MONGO_URI) throw new Error("MONGO_URI not found in .env");
        
        await mongoose.connect(process.env.MONGO_URI);
        console.log("🖇️ Connected to MongoDB.");

        const db = mongoose.connection.db;
        const UserCol = db.collection("userMaster");

        // 1. BACKUP
        const backupPath = path.join(__dirname, `userMaster_backup_${Date.now()}.json`);
        const allUsers = await UserCol.find({}).toArray();
        fs.writeFileSync(backupPath, JSON.stringify(allUsers, null, 2));
        console.log(`💾 Backup saved to: ${backupPath}`);

        // 2. FETCH USERS NEEDING UPGRADE
        const users = await UserCol.find({
            $or: [
                { linkedCorporates: { $exists: true } },
                { linkedCorporate: { $exists: true } },
                { accessCorporate: { $type: 'object' } }
            ]
        }).toArray();

        console.log(`🔍 Found ${users.length} users to upgrade.`);

        for (const user of users) {
            console.log(`\n👤 Upgrading User: ${user.userMobile} (${user.userRole})`);
            
            let newAccessArray = [];

            // a) Capture from linkedCorporates (usually for Admin)
            if (Array.isArray(user.linkedCorporates)) {
                newAccessArray = [...user.linkedCorporates];
            }

            // b) Capture from linkedCorporate (legacy singular)
            if (user.linkedCorporate && typeof user.linkedCorporate === 'object') {
                newAccessArray.push(user.linkedCorporate);
            }

            // c) Capture from accessCorporate (if it's an object - usually for Sales)
            if (user.accessCorporate && !Array.isArray(user.accessCorporate) && typeof user.accessCorporate === 'object') {
                newAccessArray.push(user.accessCorporate);
            }

            // Deduplicate by dbName
            const uniqueAccess = [];
            const seenDbNames = new Set();
            for (const item of newAccessArray) {
                if (item.dbName && !seenDbNames.has(item.dbName)) {
                    uniqueAccess.push({
                        corporateName: item.corporateName || "",
                        corporatePAN:  item.corporatePAN || "",
                        dbName:        item.dbName,
                        locationId:    item.locationId || null,
                        isActive:      item.isActive !== undefined ? item.isActive : true
                    });
                    seenDbNames.add(item.dbName);
                }
            }

            // Apply Update
            const updateResult = await UserCol.updateOne(
                { _id: user._id },
                { 
                    $set: { accessCorporate: uniqueAccess },
                    $unset: { 
                        linkedCorporates: "", 
                        linkedCorporate: "" 
                    }
                }
            );

            if (updateResult.modifiedCount > 0) {
                console.log(`   ✅ Success: accessCorporate array set with ${uniqueAccess.length} entries.`);
            } else {
                console.log(`   ⚠️ No changes made (already compliant or data missing).`);
            }
        }

        console.log("\n✅ All specified users have been processed.");
    } catch (err) {
        console.error("❌ Migration failed:", err);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

migrate();
