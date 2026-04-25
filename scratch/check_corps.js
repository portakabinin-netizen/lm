const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function checkCorps() {
    const uri = process.env.MONGO_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const mainDb = client.db("mainDatabase");
        const corps = await mainDb.collection("UsersCorporates").find({}).toArray();
        console.log("Corporates found:", corps.length);
        corps.forEach(c => console.log(`- ${c.corporateName} (dbName: ${c.dbName})`));
    } finally {
        await client.close();
    }
}

checkCorps();
