const { MongoClient } = require("mongodb");
require("dotenv").config();
const dbConnector = require("../utils/dbConnector");

/**
 * 🛠️ Lead Source ID Prefix Remover
 * Purpose: Removes legacy prefixes (TI_, IM_, MAIL_, etc.) from existing leads.
 * This prevents duplicate leads when the synchronization logic changes to clean IDs.
 */

async function removeSourceIdPrefixes() {
    const dbName = "41414546483437393441"; // Portakabin Tenant DB
    try {
        console.log(`📡 Connecting to Tenant DB: ${dbName}...`);
        const tenantConn = await dbConnector.getTenantConnection(dbName);
        const leadsColl = tenantConn.collection("leads");

        // 🔍 Find all leads that HAVE a prefix
        const leadsWithPrefix = await leadsColl.find({
            source_id: { $regex: /^(TI_|IM_|JD_|MAIL_)/ }
        }).toArray();

        console.log(`🔍 Found ${leadsWithPrefix.length} leads with prefixes.`);

        if (leadsWithPrefix.length === 0) {
            console.log("✅ No prefixed leads found. Database is already clean.");
            process.exit(0);
        }

        let updatedCount = 0;
        let conflictCount = 0;

        for (const lead of leadsWithPrefix) {
            const cleanId = lead.source_id.replace(/^(TI_|IM_|JD_|MAIL_)/, "");
            
            // 🛡️ Collision Check: Does a lead with the CLEAN ID already exist?
            const exists = await leadsColl.findOne({ source_id: cleanId, _id: { $ne: lead._id } });
            
            if (!exists) {
                await leadsColl.updateOne(
                    { _id: lead._id },
                    { $set: { source_id: cleanId } }
                );
                updatedCount++;
            } else {
                conflictCount++;
                // If a clean version already exists, we might want to delete the prefixed one
                // to avoid confusion, but for safety we just log it.
                console.log(`⚠️ Conflict: Clean ID '${cleanId}' already exists. Skipping prefixed lead #${lead.lead_no} (${lead.source_id}).`);
            }
        }

        console.log(`\n✨ Cleanup Summary:`);
        console.log(`   - Processed: ${leadsWithPrefix.length}`);
        console.log(`   - Cleaned:   ${updatedCount}`);
        console.log(`   - Conflicts: ${conflictCount}`);
        
        process.exit(0);
    } catch (err) {
        console.error("❌ Operation failed:", err.message);
        process.exit(1);
    }
}

removeSourceIdPrefixes();
