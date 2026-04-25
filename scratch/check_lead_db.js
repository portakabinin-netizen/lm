const mongoose = require("mongoose");
require("dotenv").config();

async function checkLeadDb() {
    try {
        const url = process.env.MONGO_URI.replace("/mainDatabase", "/lead_db");
        await mongoose.connect(url);
        console.log("Connected to lead_db");
        
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log("Collections:", collections.map(c => c.name));
        
        for (const col of collections) {
            const count = await mongoose.connection.db.collection(col.name).countDocuments();
            console.log(`- ${col.name}: ${count} documents`);
            if (count > 0) {
                const sample = await mongoose.connection.db.collection(col.name).findOne();
                console.log(`  Sample keys: ${Object.keys(sample).join(", ")}`);
            }
        }
        
        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err.message);
    }
}
checkLeadDb();
