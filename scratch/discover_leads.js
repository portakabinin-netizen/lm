const mongoose = require("mongoose");
require("dotenv").config();

async function findOldLeads() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to Main DB");

        const users = await mongoose.connection.db.collection("userMaster").find({
            $or: [
                { "linkedCorporates.leads": { $exists: true } },
                { "leads": { $exists: true } }
            ]
        }).toArray();

        console.log(`Found ${users.length} users with legacy leads data`);
        if (users.length > 0) {
            users.forEach(u => {
                console.log(`User: ${u.userDisplayName} (${u.userMobile})`);
                (u.linkedCorporates || []).forEach(c => {
                    if (c.leads) console.log(`  - Corp: ${c.corporateName} (Leads: ${c.leads.length})`);
                });
            });
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error("Discovery Error:", err.message);
    }
}

findOldLeads();
