const { MongoClient } = require("mongodb");
require("dotenv").config();

async function findPrefixes() {
    const dbNames = ["mainDatabase", "lead_db", "41414546483437393441"];
    const uri = process.env.MONGO_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        
        for (const dbName of dbNames) {
            console.log(`🔍 Checking DB: ${dbName}...`);
            const db = client.db(dbName);
            const collections = await db.listCollections().toArray();
            
            for (const col of collections) {
                if (col.name !== "leads") continue;
                
                const count = await db.collection(col.name).countDocuments({
                    source_id: { $regex: /^(TI_|IM_|JD_|MAIL_)/ }
                });
                
                if (count > 0) {
                    console.log(`   🚨 [${col.name}] Found ${count} leads with prefixes!`);
                    const sample = await db.collection(col.name).findOne({ source_id: { $regex: /^(TI_|IM_|JD_|MAIL_)/ } });
                    console.log(`      Sample: ${sample.source_id}`);
                } else {
                    console.log(`   ✅ [${col.name}] No prefixes found.`);
                }
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

findPrefixes();
