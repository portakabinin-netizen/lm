const mongoose = require("mongoose");
require("dotenv").config();

async function deepDiscovery() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const users = await mongoose.connection.db.collection("userMaster").find({}).toArray();
        users.forEach(u => {
            const keys = Object.keys(u);
            console.log(`User ${u.userDisplayName} [${u.userRole}] - Fields: ${keys.join(", ")}`);
            if (u.linkedCorporates) {
                u.linkedCorporates.forEach(c => {
                    const cKeys = Object.keys(c);
                    console.log(`  Corp ${c.corporateName} - Fields: ${cKeys.join(", ")}`);
                    if (c.leads) console.log(`    !! FOUND LEADS ARRAY (${c.leads.length} items) !!`);
                });
            }
        });
        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err.message);
    }
}
deepDiscovery();
