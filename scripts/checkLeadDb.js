const mongoose = require("mongoose");
require("dotenv").config({ path: "../.env" });

async function checkLeadDb() {
    const uri = "mongodb+srv://portakabinin:hipk2025@cluster0.kel8j1j.mongodb.net/lead_db?retryWrites=true&w=majority&appName=Cluster0";
    console.log(`📡 Connecting to lead_db...`);
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    for (const col of collections) {
        const count = await db.collection(col.name).countDocuments();
        console.log(`Collection: ${col.name}, Count: ${count}`);
    }
    await mongoose.disconnect();
}

checkLeadDb();
