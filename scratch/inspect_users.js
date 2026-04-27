const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function inspectUsers() {
    const uri = process.env.MONGO_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db("mainDatabase");
        
        console.log("--- Collections ---");
        const collections = await db.listCollections().toArray();
        console.log(collections.map(c => c.name));

        console.log("\n--- Sample Users ---");
        const users = await db.collection("userMaster").find({}).toArray();
        users.forEach(u => {
            console.log(`Email: ${u.userEmail}, Role: ${u.userRole}, dbName: ${u.dbName}, access:`, JSON.stringify(u.accessCorporate));
        });

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
    }
}

inspectUsers();
