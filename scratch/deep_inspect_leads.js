const mongoose = require("mongoose");
require("dotenv").config();

async function deepInspectLeads() {
    try {
        const url = process.env.MONGO_URI.replace("/mainDatabase", "/lead_db");
        await mongoose.connect(url);
        console.log("Connected to lead_db");
        
        const doc = await mongoose.connection.db.collection("leads").findOne();
        if (doc) {
            const corpIds = Object.keys(doc.corporateData || {});
            if (corpIds.length > 0) {
                const data = doc.corporateData[corpIds[0]];
                console.log("Data structure for first CorpID:");
                console.log(JSON.stringify(data, null, 2).substring(0, 500) + "...");
                
                if (Array.isArray(data.leads)) {
                    console.log(`!! Found leads array inside corporateData[cid].leads !! Count: ${data.leads.length}`);
                }
            }
        }
        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err.message);
    }
}
deepInspectLeads();
