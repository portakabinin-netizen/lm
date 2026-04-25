const { MongoClient } = require("mongodb");

async function inspectCorpDataMasterLeads() {
    const uri = "mongodb+srv://portakabinin:hipk2025@cluster0.kel8j1j.mongodb.net/lead_db?retryWrites=true&w=majority&appName=Cluster0";
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db("lead_db");
        
        console.log("--- CorpDataMaster Collections ---");
        const hubs = await db.collection("corpdatamasters").find({}).toArray();
        hubs.forEach(h => {
            console.log(`Hub ID: ${h._id}`);
            if (h.corporateData) {
                Object.keys(h.corporateData).forEach(cid => {
                    const leads = h.corporateData[cid].leads || [];
                    console.log(`  Corporate ID: ${cid}, Lead Count: ${leads.length}`);
                });
            }
        });

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
    }
}

inspectCorpDataMasterLeads();
