const mongoose = require("mongoose");
require("dotenv").config();

async function checkCorpData() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const count = await mongoose.connection.db.collection("corpdatamasters").countDocuments();
        console.log(`Documents in corpdatamasters: ${count}`);
        
        if (count > 0) {
            const sample = await mongoose.connection.db.collection("corpdatamasters").findOne();
            console.log("Sample CorpDataMaster ID:", sample._id);
            const corpIds = Object.keys(sample.corporateData || {});
            console.log("Corporate IDs in sample:", corpIds);
            if (corpIds.length > 0) {
                const leadsCount = sample.corporateData[corpIds[0]].leads?.length || 0;
                console.log(`Leads in first corp slot: ${leadsCount}`);
            }
        }
        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err.message);
    }
}
checkCorpData();
