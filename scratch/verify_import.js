const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function verifyMigration() {
    const uri = process.env.MONGO_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db("41414546483437393441"); // Portakabin Isolated DB
        
        const count = await db.collection("leads").countDocuments();
        console.log(`Total leads in new Portakabin DB: ${count}`);

        const counter = await db.collection("counters").findOne({ _id: "lead" });
        console.log(`Lead counter:`, counter);

        const sample = await db.collection("leads").find({}).limit(1).toArray();
        console.log(`Sample lead sender: ${sample[0]?.sender_name}`);

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
    }
}

verifyMigration();
