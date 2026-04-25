const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function cleanup() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        const db = mongoose.connection.db;
        const collection = db.collection("corpdatamasters");

        const hubs = await collection.find({}).toArray();
        console.log(`Found ${hubs.length} hubs to process.`);

        for (const hub of hubs) {
            const updateObj = {};
            if (hub.corporateData) {
                for (const corpId in hub.corporateData) {
                    const leads = hub.corporateData[corpId].leads;
                    if (leads && Array.isArray(leads)) {
                        for (let i = 0; i < leads.length; i++) {
                            // Unset the field in the array element
                            updateObj[`corporateData.${corpId}.leads.${i}.folderGallery`] = "";
                        }
                    }
                }
            }

            if (Object.keys(updateObj).length > 0) {
                await collection.updateOne(
                    { _id: hub._id },
                    { $unset: updateObj }
                );
                console.log(`✅ Cleaned Hub: ${hub._id}`);
            }
        }

        console.log("🚀 Cleanup finished.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Cleanup failed:", err);
        process.exit(1);
    }
}

cleanup();
