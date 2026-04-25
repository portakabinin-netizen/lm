const mongoose = require("mongoose");
require("dotenv").config({ path: "../.env" });

async function listAll() {
    const uri = process.env.MONGO_URI;
    const baseUri = uri.replace(/\/[^/?]+(?=\?|$)/, "/mainDatabase");
    await mongoose.connect(baseUri);
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    for (const col of collections) {
        const count = await db.collection(col.name).countDocuments();
        console.log(`Collection: ${col.name}, Count: ${count}`);
    }
    await mongoose.disconnect();
}

listAll();
