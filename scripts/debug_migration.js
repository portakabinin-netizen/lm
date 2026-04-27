const mongoose = require("mongoose");
require("dotenv").config({ path: "../.env" });

async function debug() {
    const uri = process.env.MONGO_URI;
    const baseUri = uri.replace(/\/[^/?]+(?=\?|$)/, "/mainDatabase");
    await mongoose.connect(baseUri);
    const db = mongoose.connection.db;
    const userMasters = db.collection("usermasters");

    const users = await userMasters.find({ userRole: { $ne: "CorpAdmin" } }).limit(5).toArray();
    console.log("--- Sample Non-Admin Users ---");
    users.forEach(u => {
        console.log(`User: ${u.userEmail}, accessCorporate:`, JSON.stringify(u.accessCorporate));
    });

    const admins = await userMasters.find({ userRole: "CorpAdmin" }).limit(2).toArray();
    console.log("\n--- Sample Admins ---");
    admins.forEach(a => {
        console.log(`Admin: ${a.userEmail}`);
        if (a.linkedCorporates) {
            a.linkedCorporates.forEach(c => {
                console.log(`  Corp: ${c.corporateName}, ID: ${c._id}, Type: ${typeof c._id}, dbName: ${c.dbName}`);
            });
        }
    });

    await mongoose.disconnect();
}

debug();
