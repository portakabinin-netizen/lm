const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log("Connected to MongoDB...");

    const db = mongoose.connection.db;
    const collection = db.collection("leads");

    const allHubs = await collection.find({}).toArray();
    console.log(`Found ${allHubs.length} hubs to migrate.`);

    for (const hub of allHubs) {
      // Skip if already migrated (if _id is corpAdminId and structure is new)
      // But how to tell? Hubs before had auto-ObjectId as _id and corpAdminId as field.
      if (!hub.corpAdminId) {
        console.log(`Skipping hub ${hub._id} - no corpAdminId found (maybe already migrated).`);
        continue;
      }

      const corpAdminId = hub.corpAdminId;
      const oldId = hub._id;

      const newCorporateData = {};
      
      // Handle corporateData Map
      // In raw mongo, Map is stored as an object
      if (hub?.corporateData) {
        for (const [cid, leads] of Object.entries(hub?.corporateData || {})) {
          newCorporateData[cid] = {
            leads: leads,
            leadCounters: (hub.leadCounters && hub.leadCounters[cid]) ? hub.leadCounters[cid] : 0
          };
          
          // Remove corpAdminId and corporateId from each lead if they exist
          newCorporateData[cid].leads.forEach(lead => {
             delete lead.corpAdminId;
             delete lead.corporateId;
          });
        }
      }

      const newHub = {
        _id: corpAdminId,
        corporateData: newCorporateData,
        createdAt: hub.createdAt || new Date(),
        updatedAt: new Date()
      };

      // Insert new hub with corpAdminId as _id
      try {
        await collection.deleteOne({ _id: hub._id });
        // Use upsert to be safe if multiple old records pointed to same corpAdminId (shouldn't happen)
        await collection.replaceOne({ _id: corpAdminId }, newHub, { upsert: true });
        console.log(`Migrated hub for corpAdminId: ${corpAdminId}`);
      } catch (err) {
        console.error(`Error migrating hub ${oldId}:`, err.message);
      }
    }

    console.log("Migration completed.");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

migrate();
