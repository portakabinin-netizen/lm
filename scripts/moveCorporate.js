const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../backend/.env") });

async function migrate() {
    // These are Corporate IDs from the user's request
    const sourceCorpId = "69bbd65092666731efd21731"; 
    const targetRefCorpId = "6984d40db02c9d553f90e6c0";

    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 30000 });
        const db = mongoose.connection.db;

        // 1. Locate Source User and Corporate object
        const sourceUser = await db.collection("users").findOne({ "linkedCorporates._id": new mongoose.Types.ObjectId(sourceCorpId) });
        if (!sourceUser) throw new Error("Source corporate not found inside any user.");

        const corpIndex = sourceUser.linkedCorporates.findIndex(c => c._id.toString() === sourceCorpId);
        const corpToMove = sourceUser.linkedCorporates[corpIndex];

        // 2. Locate Target User
        const targetUser = await db.collection("users").findOne({ "linkedCorporates._id": new mongoose.Types.ObjectId(targetRefCorpId) });
        if (!targetUser) throw new Error("Target reference corporate not found.");

        const sourceAdminId = sourceUser._id;
        const targetAdminId = targetUser._id;

        console.log(`Moving corporate "${corpToMove.corporateName}" [${sourceCorpId}]`);
        console.log(`From admin "${sourceUser.userDisplayName}" [${sourceAdminId}]`);
        console.log(`To admin "${targetUser.userDisplayName}" [${targetAdminId}]`);

        // 3. Update Users arrays
        await db.collection("users").updateOne(
            { _id: targetAdminId },
            { $push: { linkedCorporates: corpToMove } }
        );
        await db.collection("users").updateOne(
            { _id: sourceAdminId },
            { $pull: { linkedCorporates: { _id: new mongoose.Types.ObjectId(sourceCorpId) } } }
        );

        // 4. Move Hub Data (ONLY for this corporateId)
        const hubCollections = [
            { coll: "leads", name: "Leads" },
            { coll: "salepurchasebooks", name: "SalesBook" },
            { coll: "purchasehubs", name: "Purchase" }
        ];

        for (const { coll, name } of hubCollections) {
            console.log(`Extracting ${name} data for corporate ${sourceCorpId}...`);
            const sHub = await db.collection(coll).findOne({ corpAdminId: sourceAdminId });
            
            if (sHub && sHub?.corporateData && sHub?.corporateData?.[sourceCorpId]) {
                const updateOps = {
                    [`corporateData.${sourceCorpId}`]: sHub?.corporateData?.[sourceCorpId]
                };
                if (sHub.leadCounters && sHub.leadCounters[sourceCorpId]) {
                    updateOps[`leadCounters.${sourceCorpId}`] = sHub.leadCounters[sourceCorpId];
                }

                await db.collection(coll).updateOne(
                    { corpAdminId: targetAdminId },
                    { $set: updates },
                    { upsert: true }
                );

                // Remove from source
                const pulls = { [`corporateData.${sourceCorpId}`]: "" };
                if (sHub.leadCounters) pulls[`leadCounters.${sourceCorpId}`] = "";
                
                await db.collection(coll).updateOne(
                    { corpAdminId: sourceAdminId },
                    { $unset: pulls }
                );
                console.log(`  ${name} data transferred.`);
            }
        }

        // 5. Update Sub-Users linked to this corporate
        console.log("Updating sub-user linkages...");
        await db.collection("users").updateMany(
            { "accessCorporate.corpAdminId": sourceAdminId, "accessCorporate.corporateId": new mongoose.Types.ObjectId(sourceCorpId) },
            { $set: { "accessCorporate.corpAdminId": targetAdminId } }
        );

        console.log("MIGRATION SUCCESSFUL.");
        process.exit(0);

    } catch (err) {
        console.error("Migration Failed:", err);
        process.exit(1);
    }
}
migrate();
