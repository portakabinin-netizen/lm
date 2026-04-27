const mongoose = require("mongoose");
require("dotenv").config();

async function findLegacyCorpName() {
    try {
        const url = process.env.MONGO_URI.replace("/mainDatabase", "/lead_db");
        await mongoose.connect(url);
        console.log("Connected to lead_db");
        
        // Check corpdatamasters or corporates collection
        const corpDoc = await mongoose.connection.db.collection("corpdatamasters").findOne();
        if (corpDoc) {
            const legacyId = "6984d40db02c9d553f90e6c0";
            const data = corpDoc.corporateData[legacyId];
            if (data && data.profile) {
                console.log(`Legacy Corporate Name for ${legacyId}: ${data.profile.corporateName}`);
            } else {
                console.log(`No profile found for ${legacyId} in corpdatamasters.`);
            }
        }
        
        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err.message);
    }
}
findLegacyCorpName();
