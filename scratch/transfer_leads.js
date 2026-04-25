const mongoose = require("mongoose");
const path = require("path");

const SOURCE_URI = "mongodb+srv://portakabinin:hipk2025@cluster0.kel8j1j.mongodb.net/lead_db?retryWrites=true&w=majority";
const TARGET_DB_NAME = "41414546483437393441";
const TARGET_URI = `mongodb+srv://portakabinin:hipk2025@cluster0.kel8j1j.mongodb.net/${TARGET_DB_NAME}?retryWrites=true&w=majority`;

async function transfer() {
  let sourceConn, targetConn;
  try {
    sourceConn = await mongoose.createConnection(SOURCE_URI).asPromise();
    console.log("Connected to SOURCE: lead_db");

    targetConn = await mongoose.createConnection(TARGET_URI).asPromise();
    console.log(`Connected to TARGET: ${TARGET_DB_NAME}`);

    const sourceLeadsColl = sourceConn.db.collection("leads");
    const targetLeadsColl = targetConn.db.collection("leads");
    const targetCountersColl = targetConn.db.collection("counters");

    const hubs = await sourceLeadsColl.find({}).toArray();
    console.log(`Found ${hubs.length} hub documents in source.`);

    let totalLeadsMoved = 0;
    let maxLeadNo = 0;

    for (const hub of hubs) {
      if (!hub.corporateData) continue;

      for (const [corpId, data] of Object.entries(hub.corporateData)) {
        if (!data.leads || !Array.isArray(data.leads)) continue;

        console.log(`Processing ${data.leads.length} leads for corpId: ${corpId}`);

        const cleanedLeads = data.leads.map(lead => {
          const l = { ...lead };
          delete l.corpAdminId;
          delete l.corporateId;
          
          // Ensure _id is handled correctly (if it was an ObjectId, keep it as such)
          if (l._id && typeof l._id === 'string' && l._id.length === 24) {
             l._id = new mongoose.Types.ObjectId(l._id);
          }
          
          // Check for max lead_no
          if (l.lead_no && l.lead_no > maxLeadNo) maxLeadNo = l.lead_no;
          
          return l;
        });

        if (cleanedLeads.length > 0) {
          // Use bulkWrite or insertMany. Using insertMany but handling potential duplicates
          try {
            const result = await targetLeadsColl.insertMany(cleanedLeads, { ordered: false });
            totalLeadsMoved += result.insertedCount;
          } catch (insertErr) {
            if (insertErr.code === 11000) {
              // Some duplicates ignored
              totalLeadsMoved += insertErr.result.nInserted;
              console.log(`Skipped some duplicates for corpId: ${corpId}`);
            } else {
              console.error(`Error inserting leads for corpId: ${corpId}:`, insertErr.message);
            }
          }
        }
      }
    }

    console.log(`Transfer complete. Total leads moved: ${totalLeadsMoved}`);

    // Update counter
    if (maxLeadNo > 0) {
       await targetCountersColl.updateOne(
         { _id: "lead" },
         { $set: { seq: maxLeadNo } },
         { upsert: true }
       );
       console.log(`Updated lead counter to ${maxLeadNo}`);
    }

  } catch (err) {
    console.error("Transfer failed:", err);
  } finally {
    if (sourceConn) await sourceConn.close();
    if (targetConn) await targetConn.close();
  }
}

transfer();
