const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { CorpDataMaster } = require("../models/CorpDataMaster");

async function cleanup() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        const hubs = await CorpDataMaster.find({});
        console.log(`Found ${hubs.length} hubs to process.`);

        for (const hub of hubs) {
            let modified = false;
            // corporateData is a Mongoose Map
            for (const [corpId, slot] of hub.corporateData) {
                if (slot.leads && slot.leads.length > 0) {
                    for (const lead of slot.leads) {
                        if (lead.folderGallery !== undefined) {
                            // In Mongoose, we can just delete it or set it to undefined
                            // But since we updated the schema, Mongoose might already ignore it.
                            // To be sure we remove it from the DB, we use $unset
                            modified = true;
                        }
                    }
                }
            }

            if (modified) {
                // Since leads is an array of subdocuments, the easiest way to $unset deep nested fields 
                // in a Map of objects is to use a specific update for each slot.
                for (const [corpId, slot] of hub.corporateData) {
                    await CorpDataMaster.updateOne(
                        { _id: hub._id },
                        { $unset: { [`corporateData.${corpId}.leads.$[].folderGallery`]: "" } }
                    );
                }
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
