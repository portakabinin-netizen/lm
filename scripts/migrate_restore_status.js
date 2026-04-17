const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

// Connect to DB (assuming the same MONGO_URI from the backend)
const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/hipk";

async function migrate() {
    try {
        await mongoose.connect(mongoUri);
        console.log("Connected to MongoDB.");

        const Leads = mongoose.model("Leads", new mongoose.Schema({
            corporateData: { type: Map, of: mongoose.Schema.Types.Mixed }
        }));

        const hubs = await Leads.find({});
        console.log(`Checking ${hubs.length} Hub documents...`);

        let totalUpdated = 0;

        for (const hub of hubs) {
            let modified = false;
            if (!hub?.corporateData) continue;
            console.log(`- Working on ${hub._id}`);
            const corporateData = hub?.corporateData;
            for (const [cid, corpEntry] of corporateData) {
                if (Array.isArray(corpEntry.leads)) {
                    corpEntry.leads.forEach(lead => {
                        if (lead.status === "Restore") {
                            lead.status = "Recycle";
                            modified = true;
                            totalUpdated++;
                        }
                    });
                }
            }

            if (modified) {
                hub.markModified("corporateData");
                await hub.save();
                console.log(`Updated Hub ${hub._id}`);
            }
        }

        console.log(`Migration complete. Total leads updated: ${totalUpdated}`);
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
