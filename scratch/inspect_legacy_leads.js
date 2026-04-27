const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function inspectLeads() {
    const legacyUri = "mongodb+srv://portakabinin:hipk2025@cluster0.kel8j1j.mongodb.net/lead_db?retryWrites=true&w=majority&appName=Cluster0";
    const client = new MongoClient(legacyUri);

    try {
        await client.connect();
        const db = client.db("lead_db");
        const collection = db.collection("leads");

        console.log("--- Sample Leads ---");
        const allHubs = await collection.find({}).toArray();
        allHubs.forEach(h => {
            console.log(`Hub ID: ${h._id}, Corporates: ${Object.keys(h.corporateData || {})}`);
        });

        const count = await collection.countDocuments();
        console.log(`\nTotal leads in legacy: ${count}`);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
    }
}

inspectLeads();
