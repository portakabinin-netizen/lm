const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function mapCorporates() {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    
    // In our new system, corporates are in UsersCorporates
    const corporates = await db.collection("userscorporates").find({}).toArray();
    
    console.log("--- Corporate Mappings ---");
    corporates.forEach(c => {
        console.log(`ID: ${c._id}, Name: ${c.corporateName}, dbName: ${c.dbName}`);
    });

    await mongoose.disconnect();
}

mapCorporates();
