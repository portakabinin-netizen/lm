const mongoose = require('mongoose');

async function migrate() {
    try {
        await mongoose.connect('mongodb+srv://portakabinin:hipk2025@cluster0.kel8j1j.mongodb.net/lead_db');
        const db = mongoose.connection.db;
        const leadsColl = db.collection('leads');

        // 1. Find all documents that are NOT hubs (i.e., have sender_name at root)
        const oldLeads = await leadsColl.find({ sender_name: { $exists: true } }).toArray();
        console.log(`Found ${oldLeads.length} old-style leads.`);

        for (const lead of oldLeads) {
            const corpAdminId = lead.accessCorporate?.corpAdminId;
            const corporateId = lead.accessCorporate?.corporateId;

            if (!corpAdminId || !corporateId) {
                console.warn(`Lead ${lead._id} is missing corpAdminId or corporateId. Skipping.`);
                continue;
            }

            // 2. Find or create the Hub for this corpAdminId
            let hub = await leadsColl.findOne({ corpAdminId: new mongoose.Types.ObjectId(corpAdminId), corporateData: { $exists: true } });
            
            if (!hub) {
                console.log(`Creating new Hub for admin ${corpAdminId}`);
                const res = await leadsColl.insertOne({
                    corpAdminId: new mongoose.Types.ObjectId(corpAdminId),
                    corporateData: {},
                    leadCounters: {}
                });
                hub = await leadsColl.findOne({ _id: res.insertedId });
            }

            // 3. Add the lead to the corporateData map
            const corpKey = corporateId.toString();
            if (!hub?.corporateData) hub.corporateData = {};
            if (!hub?.corporateData?.[corpKey]) hub.corporateData[corpKey] = [];
            
            // Safety check for mobile/source mapping
            const cleanMobile = lead.sender_mobile?.toString().replace(/\D/g, '').slice(-10);
            const isDuplicate = (hub?.corporateData?.[corpKey] || []).some(l => l.source_id === lead.source_id && lead.source_id);
            if (!isDuplicate) {
                hub?.corporateData?.[corpKey]?.push?.(lead);
                
                // Update counter
                if (!hub.leadCounters) hub.leadCounters = {};
                hub.leadCounters[corpKey] = Math.max(hub.leadCounters[corpKey] || 0, lead.lead_no || 0);

                const updateOps = {
                    [`corporateData.${corpKey}`]: hub?.corporateData?.[corpKey],
                    [`leadCounters.${corpKey}`]: hub.leadCounters?.[corpKey]
                };

                await leadsColl.updateOne(
                    { _id: hub._id },
                    { $set: updateOps }
                );
                console.log(`Migrated lead ${lead.lead_no} to hub.`);
            } else {
                console.log(`Lead ${lead.source_id} already in hub. Skipping.`);
            }

            // 4. Delete the old document
            await leadsColl.deleteOne({ _id: lead._id });
        }

        console.log("Migration finished.");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

migrate();
