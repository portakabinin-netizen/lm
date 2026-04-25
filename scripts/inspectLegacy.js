const { MongoClient } = require("mongodb");
require("dotenv").config();

async function inspectLegacy() {
    const uri = process.env.MONGO_URI.replace(/\/[^/?]+(?=\?|$)/, "/lead_db");
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db("lead_db");
        const users = await db.collection("users").find({}).toArray();
        
        console.log("🔍 Legacy Users Found:", users.length);
        // Look for something related to portakabin or Suresh
        const target = users.find(u => 
            (u.corporateName && u.corporateName.toLowerCase().includes("portakabin")) ||
            (u.email && u.email.toLowerCase().includes("portakabin")) ||
            (u.name && u.name.toLowerCase().includes("suresh"))
        );

        if (target) {
            console.log("✅ Target User Found in Legacy DB:");
            console.log(JSON.stringify(target, null, 2));
        } else {
            console.log("❌ No matching user found in legacy DB.");
            // Print first few users to see the structure
            console.log("Sample Users:", JSON.stringify(users.slice(0, 2), null, 2));
        }
    } catch (err) {
        console.error("🔴 Error:", err.message);
    } finally {
        await client.close();
    }
}

inspectLegacy();
