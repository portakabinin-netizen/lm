const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function migrate() {
    console.log("🚀 Starting database migration...");

    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("🖇️ Connected to MongoDB.");

        const db = mongoose.connection.db;
        const backupDir = path.join(__dirname, "../backups", `backup_${Date.now()}`);
        if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

        // 1. BACKUP
        console.log("💾 Taking backup...");
        const collections = await db.listCollections().toArray();
        for (const col of collections) {
            const data = await db.collection(col.name).find({}).toArray();
            fs.writeFileSync(path.join(backupDir, `${col.name}.json`), JSON.stringify(data, null, 2));
            console.log(`   - Backed up ${col.name} (${data.length} docs)`);
        }

        const UserCol = db.collection("users");

        // 2. MIGRATE ADMINS
        console.log("🔧 Migrating Admin users (linkedCorporate -> linkedCorporates)...");
        const admins = await UserCol.find({ userRole: "CorpAdmin", linkedCorporate: { $exists: true } }).toArray();
        for (const admin of admins) {
            const corp = admin.linkedCorporate;
            if (!corp._id) corp._id = new mongoose.Types.ObjectId();
            
            await UserCol.updateOne(
                { _id: admin._id },
                { 
                    $push: { linkedCorporates: corp },
                    $unset: { linkedCorporate: "" }
                }
            );
            console.log(`   - Migrated admin ${admin.userMobile}`);
        }

        // 3. MIGRATE SUB-USERS
        console.log("🔧 Migrating Sub-users (linking to corpAdminId)...");
        const subUsers = await UserCol.find({ userRole: { $in: ["Sales", "Project"] } }).toArray();
        for (const user of subUsers) {
            const corpId = user.accessCorporate?.corporateId;
            if (corpId && !user.accessCorporate.corpAdminId) {
                // Find potential admin
                const admin = await UserCol.findOne({ 
                    "linkedCorporates._id": new mongoose.Types.ObjectId(corpId), 
                    userRole: "CorpAdmin" 
                });
                
                if (admin) {
                    await UserCol.updateOne(
                        { _id: user._id },
                        { $set: { "accessCorporate.corpAdminId": admin._id } }
                    );
                    console.log(`   - Linked sub-user ${user.userMobile} to admin ${admin.userMobile}`);
                } else {
                    console.warn(`   ⚠️ No admin found for corporateId ${corpId} used by ${user.userMobile}`);
                }
            }
        }

        console.log("✅ Migration completed successfully.");
    } catch (err) {
        console.error("❌ Migration failed:", err);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

migrate();
