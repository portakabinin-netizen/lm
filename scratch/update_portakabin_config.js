const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function updatePortakabinConfig() {
    const uri = process.env.MONGO_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const dbName = "41414546483437393441"; // Hex for AAEFH4794A
        console.log(`🚀 Updating configuration for Portakabin in DB: ${dbName}`);
        
        const tenantDb = client.db(dbName);
        
        const updateDoc = {
            $set: {
                "apiUrls.tradeindia": {
                    url: "https://www.tradeindia.com/utils/my_inquiry.html",
                    userid: "23134696",
                    profile_id: "102656695",
                    key: "abef1268bf0df7863ae259fb1c2b611d"
                },
                "apiUrls.mailConfigure": {
                    host: "imap.gmail.com",
                    port: 993,
                    secure: true,
                    auth: {
                        user: "histore.india@gmail.com",
                        pass: "immc cizu nlsg axud"
                    },
                    isActive: true
                },
                "centralRegistrations.corporateTagName": "U/o Hiresh iSearch"
            }
        };

        const result = await tenantDb.collection("profileMaster").updateOne({}, updateDoc, { upsert: true });
        
        if (result.matchedCount > 0 || result.upsertedCount > 0) {
            console.log("✅ Successfully updated Portakabin ProfileMaster configuration.");
        } else {
            console.log("⚠️ No changes made to ProfileMaster.");
        }

    } catch (err) {
        console.error("❌ Update Error:", err.message);
    } finally {
        await client.close();
    }
}

updatePortakabinConfig();
