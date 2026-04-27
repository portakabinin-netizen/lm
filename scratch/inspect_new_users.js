const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function inspectNewUsers() {
    const uri = process.env.MONGO_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db("mainDatabase");
        
        console.log("--- New Users ---");
        const users = await db.collection("userMaster").find({}).toArray();
        users.forEach(u => {
            console.log(`Email: ${u.userEmail}, Role: ${u.userRole}, dbName: ${u.dbName}, corporateId: ${u.corporateId}, access:`, JSON.stringify(u.accessCorporate));
        });

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
    }
}

inspectNewUsers();
