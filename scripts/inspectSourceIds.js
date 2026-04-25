const { MongoClient } = require("mongodb");
require("dotenv").config();
const dbConnector = require("../utils/dbConnector");

async function inspectSourceIds() {
    const dbName = "41414546483437393441";
    try {
        const tenantConn = await dbConnector.getTenantConnection(dbName);
        const leadsColl = tenantConn.collection("leads");
        
        const leads = await leadsColl.find({}).limit(100).toArray();
        console.log(`📄 Inspecting ${leads.length} leads in ${dbName}...`);
        
        const formats = new Set();
        leads.forEach(l => {
            const sid = String(l.source_id);
            if (sid.match(/\D/)) {
                formats.add(sid);
            }
        });
        
        if (formats.size > 0) {
            console.log("🚨 Found Non-Numeric Source IDs:");
            formats.forEach(f => console.log(` - ${f}`));
        } else {
            console.log("✅ All inspected IDs are numeric.");
        }
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

inspectSourceIds();
