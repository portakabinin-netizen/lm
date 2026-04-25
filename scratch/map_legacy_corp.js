const mongoose = require("mongoose");
require("dotenv").config();

async function mapLegacyCorp() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to mainDatabase");
        
        const legacyId = "6984d40db02c9d553f90e6c0";
        
        // Search in users' linkedCorporates
        const user = await mongoose.connection.db.collection("userMaster").findOne({
            "linkedCorporates._id": new mongoose.Types.ObjectId(legacyId)
        });
        
        if (user) {
            console.log(`!! Found match in User: ${user.userDisplayName}`);
            const corp = user.linkedCorporates.find(c => String(c._id) === legacyId);
            console.log(`   Corporate: ${corp.corporateName}`);
            console.log(`   Target dbName: ${corp.dbName}`);
        } else {
            console.log("No user found with this legacy corporate ID in linkedCorporates.");
        }
        
        await mongoose.disconnect();
    } catch (err) {
        console.error("Mapping Error:", err.message);
    }
}
mapLegacyCorp();
