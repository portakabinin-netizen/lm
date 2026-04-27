const { MongoClient } = require("mongodb");

async function inspectCorpDataMaster() {
    const uri = "mongodb+srv://portakabinin:hipk2025@cluster0.kel8j1j.mongodb.net/lead_db?retryWrites=true&w=majority&appName=Cluster0";
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db("lead_db");
        
        console.log("--- CorpDataMaster ---");
        const hubs = await db.collection("corpdatamasters").find({}).toArray();
        hubs.forEach(h => {
            console.log(`Admin ID: ${h._id}`);
            if (h.corporateData) {
                for (let [key, data] of Object.entries(h.corporateData)) {
                    console.log(`  Corporate ID: ${key}`);
                    console.log(`  Name: ${data.profile?.corporateName}`);
                    console.log(`  PAN: ${data.profile?.corporatePAN}`);
                    console.log(`  dbName: ${data.profile?.dbName}`);
                }
            }
        });

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
    }
}

inspectCorpDataMaster();
