const { MongoClient } = require("mongodb");
require("dotenv").config();

async function cleanupRedundantCollection() {
    const dbName = "41414546483437393441";
    const uri = process.env.MONGO_URI.replace(/\/[^/?]+(?=\?|$)/, `/${dbName}`);
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(dbName);
        
        console.log("🗑️ Dropping redundant 'profilemasters' collection...");
        await db.collection("profilemasters").drop();
        console.log("✅ 'profilemasters' dropped successfully.");
    } catch (err) {
        console.log("⚠️ Info:", err.message);
    } finally {
        await client.close();
    }
}

cleanupRedundantCollection();
