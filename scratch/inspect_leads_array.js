const mongoose = require("mongoose");
require("dotenv").config();

async function inspectLeadsArray() {
    try {
        const url = process.env.MONGO_URI.replace("/mainDatabase", "/lead_db");
        await mongoose.connect(url);
        console.log("Connected to lead_db");
        
        const doc = await mongoose.connection.db.collection("leads").findOne();
        if (doc) {
            console.log("Found Leads Hub Document");
            const corpIds = Object.keys(doc.corporateData || {});
            console.log("Corporate IDs in data:", corpIds);
            
            corpIds.forEach(cid => {
                const leads = doc.corporateData[cid];
                if (Array.isArray(leads)) {
                    console.log(`  - CorpID ${cid}: ${leads.length} leads`);
                    if (leads.length > 0) {
                        console.log("    Sample Lead:", JSON.stringify(leads[0], null, 2));
                    }
                } else {
                    console.log(`  - CorpID ${cid}: Data is not an array (Type: ${typeof leads})`);
                }
            });
        } else {
            console.log("No document found in 'leads' collection of 'lead_db'");
        }
        
        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err.message);
    }
}
inspectLeadsArray();
