const mongoose = require("mongoose");
require("dotenv").config();

async function listCollections() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log("Collections in Main DB:", collections.map(c => c.name));
        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err.message);
    }
}
listCollections();
