const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function cleanupLeads() {
    const uri = process.env.MONGO_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const mainDb = client.db("mainDatabase");
        
        // Find all unique dbNames from userMaster
        const users = await mainDb.collection("userMaster").find({}).toArray();
        const dbNames = new Set();
        users.forEach(u => {
            if (u.accessCorporate?.dbName) dbNames.add(u.accessCorporate.dbName);
            if (u.linkedCorporates) {
                u.linkedCorporates.forEach(c => dbNames.add(c.dbName));
            }
        });

        console.log(`Found ${dbNames.size} tenant databases to clean:`, Array.from(dbNames));

        for (const dbName of dbNames) {
            console.log(`🧹 Cleaning leads in DB: ${dbName}`);
            const tenantDb = client.db(dbName);
            
            // 1. Remove legacy IDs and nested accessCorporate object
            const result = await tenantDb.collection("leads").updateMany(
                {},
                { $unset: { corporateId: "", corpAdminId: "", accessCorporate: "" } }
            );
            console.log(`   - Removed legacy IDs from ${result.modifiedCount} leads.`);

            // 2. Upgrade Schema: String to Date for generated_date
            const leadsToFix = await tenantDb.collection("leads").find({
                generated_date: { $type: "string" }
            }).toArray();

            if (leadsToFix.length > 0) {
                console.log(`   - Converting ${leadsToFix.length} generated_date strings to Dates.`);
                for (const lead of leadsToFix) {
                    await tenantDb.collection("leads").updateOne(
                        { _id: lead._id },
                        { $set: { generated_date: new Date(lead.generated_date) } }
                    );
                }
            }
        }

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
    }
}

cleanupLeads();
