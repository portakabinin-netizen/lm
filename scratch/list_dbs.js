const mongoose = require("mongoose");
require("dotenv").config();

async function listAllDbs() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const admin = mongoose.connection.db.admin();
        const dbs = await admin.listDatabases();
        console.log("Databases on this instance:");
        dbs.databases.forEach(db => console.log(`- ${db.name}`));
        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err.message);
    }
}
listAllDbs();
