const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const LEGACY_URI = "mongodb+srv://portakabinin:hipk2025@cluster0.kel8j1j.mongodb.net/lead_db?retryWrites=true&w=majority&appName=Cluster0";
const NEW_URI = process.env.MONGO_URI;

const PAN_MAP = {
    "6984d40db02c9d553f90e6c0": "AAEFH4794A",
    "69bbd65092666731efd21731": "AADCT8072F"
};

const encodeDbName = (pan) => Buffer.from(pan).toString('hex').toUpperCase();

async function migrateLeads() {
    const legacyClient = new MongoClient(LEGACY_URI);
    const newClient = new MongoClient(NEW_URI);

    try {
        await legacyClient.connect();
        await newClient.connect();

        const legacyDb = legacyClient.db("lead_db");
        const hubs = await legacyDb.collection("leads").find({}).toArray();

        console.log(`📡 Found ${hubs.length} legacy lead hubs.`);

        for (const hub of hubs) {
            if (!hub.corporateData) continue;

            for (const [cid, data] of Object.entries(hub.corporateData)) {
                const pan = PAN_MAP[cid];
                if (!pan) {
                    console.warn(`⚠️ No PAN mapping for corporateId: ${cid}. Skipping.`);
                    continue;
                }

                const dbName = encodeDbName(pan);
                const targetDb = newClient.db(dbName);
                
                console.log(`📦 Migrating ${data.leads?.length || 0} leads for ${pan} -> ${dbName}`);

                if (data.leads && data.leads.length > 0) {
                    // 1. Insert Leads
                    // Clean leads: remove legacy _id if needed or keep it.
                    // Usually better to keep it if they are already unique and needed for relations.
                    // But MongoDB might complain if they exist in multiple DBs. 
                    // Actually, isolated DBs are fine with same _id.
                    try {
                        await targetDb.collection("leads").insertMany(data.leads, { ordered: false });
                        console.log(`✅ Inserted ${data.leads.length} leads into ${dbName}.leads`);
                    } catch (err) {
                        if (err.code === 11000) {
                            console.warn(`ℹ️ Some leads already exist in ${dbName}.leads (Duplicate keys skipped)`);
                        } else {
                            console.error(`❌ Failed to insert leads for ${dbName}:`, err.message);
                        }
                    }
                }

                // 2. Sync Counters
                const lastNo = data.leadCounters || (data.leads && data.leads.length > 0 ? Math.max(...data.leads.map(l => l.lead_no || 0)) : 0);
                if (lastNo > 0) {
                    await targetDb.collection("counters").updateOne(
                        { _id: "lead" },
                        { $set: { seq: lastNo } },
                        { upsert: true }
                    );
                    console.log(`📈 Counter for 'lead' set to ${lastNo} in ${dbName}`);
                }
            }
        }

        console.log("🚀 Migration Finished!");

    } catch (err) {
        console.error("💥 Critical Migration Error:", err);
    } finally {
        await legacyClient.close();
        await newClient.close();
    }
}

migrateLeads();
