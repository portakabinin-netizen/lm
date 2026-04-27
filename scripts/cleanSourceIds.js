const { MongoClient } = require("mongodb");
require("dotenv").config();
const dbConnector = require("../utils/dbConnector");

async function removeSourceIdPrefixes() {
    const dbName = "41414546483437393441";
    try {
        console.log(`📡 Connecting to Tenant DB: ${dbName}...`);
        const tenantConn = await dbConnector.getTenantConnection(dbName);
        const leadsColl = tenantConn.collection("leads");

        // Case-insensitive regex
        const prefixRegex = /^(TI_|IM_|JD_|MAIL_|email_|ti_|im_|jd_|mail_)/i;

        const leadsWithPrefix = await leadsColl.find({
            source_id: { $regex: prefixRegex }
        }).toArray();

        console.log(`🔍 Found ${leadsWithPrefix.length} leads with prefixes.`);

        let updatedCount = 0;
        let conflictDeletedCount = 0;

        for (const lead of leadsWithPrefix) {
            // Remove the prefix case-insensitively
            const cleanId = lead.source_id.replace(prefixRegex, "");
            
            const exists = await leadsColl.findOne({ source_id: cleanId, _id: { $ne: lead._id } });
            
            if (!exists) {
                await leadsColl.updateOne(
                    { _id: lead._id },
                    { $set: { source_id: cleanId } }
                );
                updatedCount++;
            } else {
                await leadsColl.deleteOne({ _id: lead._id });
                conflictDeletedCount++;
            }
        }

        console.log(`\n✨ Final Cleanup Summary:`);
        console.log(`   - Processed:        ${leadsWithPrefix.length}`);
        console.log(`   - IDs Normalized:   ${updatedCount}`);
        console.log(`   - Redundant Deleted: ${conflictDeletedCount}`);
        
        process.exit(0);
    } catch (err) {
        console.error("❌ Operation failed:", err.message);
        process.exit(1);
    }
}

removeSourceIdPrefixes();
