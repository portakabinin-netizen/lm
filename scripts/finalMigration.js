const mongoose = require("mongoose");
const crypto = require("crypto");
require("dotenv").config({ path: "../.env" });

async function finalMigration() {
    const legacyUri = "mongodb+srv://portakabinin:hipk2025@cluster0.kel8j1j.mongodb.net/lead_db?retryWrites=true&w=majority&appName=Cluster0";
    const mainUri = process.env.MONGO_URI.replace(/\/[^/?]+(?=\?|$)/, "/mainDatabase");

    console.log("📡 Connecting to both databases...");
    const legacyConn = await mongoose.createConnection(legacyUri).asPromise();
    const mainConn = await mongoose.createConnection(mainUri).asPromise();

    const legacyUsers = legacyConn.collection("users");
    const legacyHubs = legacyConn.collection("corpdatamasters");
    const mainUserMasters = mainConn.collection("usermasters");

    // 1. Clear mainUserMasters (as requested: "update mainDatabase, it only one collection userMaster")
    console.log("🧹 Clearing mainUserMasters...");
    await mainUserMasters.deleteMany({});

    // 2. Fetch legacy data
    const users = await legacyUsers.find({}).toArray();
    const hubs = await legacyHubs.find({}).toArray();

    // Create a map of corporateId -> dbName
    const corpMap = new Map();
    const adminMap = new Map();

    for (const hub of hubs) {
        if (hub.corporateData) {
            for (let [id, data] of Object.entries(hub.corporateData)) {
                // Generate a dbName if missing (e.g. "D" + random hex)
                let dbName = data.profile?.dbName || data.profile?.corporatePAN || ("D" + crypto.randomBytes(4).toString("hex"));
                dbName = dbName.toLowerCase().replace(/[^a-z0-9]/g, "");
                
                corpMap.set(String(id), {
                    dbName,
                    corporateName: data.profile?.corporateName || "Unnamed Corp",
                    locationId: null // We'll handle this manually or let users set it
                });

                if (!adminMap.has(String(hub._id))) adminMap.set(String(hub._id), []);
                adminMap.get(String(hub._id)).push({
                    _id: new mongoose.Types.ObjectId(id),
                    dbName,
                    corporateName: data.profile?.corporateName || "Unnamed Corp"
                });
            }
        }
    }

    // 3. Process and Insert Users
    console.log("🚀 Inserting refactored users...");
    const newUsers = users.map(u => {
        const newUser = { ...u };
        delete newUser.accessCorporate;
        
        if (u.userRole === "CorpAdmin") {
            newUser.linkedCorporates = adminMap.get(String(u._id)) || [];
        } else {
            // Sub-user
            const legacyAccess = u.accessCorporate?.linkedCorporates?.[0];
            const corpId = legacyAccess?.corporateId || u.accessCorporate?.corporateId;
            const mapping = corpMap.get(String(corpId));

            if (mapping) {
                newUser.accessCorporate = {
                    dbName: mapping.dbName,
                    locationId: null // To be assigned
                };
            }
        }
        return newUser;
    });

    if (newUsers.length > 0) {
        await mainUserMasters.insertMany(newUsers);
    }

    console.log(`✅ Migrated ${newUsers.length} users to mainDatabase.`);

    await legacyConn.close();
    await mainConn.close();
}

finalMigration().catch(err => console.error("❌ Migration error:", err));
