const { MongoClient } = require("mongodb");
require("dotenv").config();

async function checkCollections() {
    const dbName = "41414546483437393441";
    const uri = process.env.MONGO_URI.replace(/\/[^/?]+(?=\?|$)/, `/${dbName}`);
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(dbName);
        const collections = await db.listCollections().toArray();
        console.log(`📂 Collections in ${dbName}:`, collections.map(c => c.name));
        
        for (const col of collections) {
            const count = await db.collection(col.name).countDocuments();
            console.log(`   - ${col.name}: ${count} docs`);
            if (col.name.toLowerCase().includes("profile")) {
                const doc = await db.collection(col.name).findOne({});
                console.log(`📄 Sample Doc from ${col.name}:`, JSON.stringify(doc, null, 2));
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
    }
}

checkCollections();
