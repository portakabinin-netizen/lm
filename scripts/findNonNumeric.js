const { MongoClient } = require("mongodb");
require("dotenv").config();
const dbConnector = require("../utils/dbConnector");

async function findNonNumeric() {
    const dbName = "41414546483437393441";
    try {
        const tenantConn = await dbConnector.getTenantConnection(dbName);
        const leadsColl = tenantConn.collection("leads");
        
        // Match any source_id that contains non-digit characters
        const nonNumericLeads = await leadsColl.find({
            source_id: { $regex: /\D/ }
        }).toArray();
        
        console.log(`🔍 Found ${nonNumericLeads.length} non-numeric source_ids.`);
        
        if (nonNumericLeads.length > 0) {
            console.log("Samples:");
            nonNumericLeads.slice(0, 10).forEach(l => console.log(` - ${l.source_id} (${l.source})`));
        }
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

findNonNumeric();
