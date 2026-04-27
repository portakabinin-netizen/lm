/**
 * 🚀  Data Migration Script (Native Version): copyUsersToHubNative.js
 * 
 * PURPOSE:
 * Copies user accounts and corporate settings using the Native MongoDB driver
 * to avoid Mongoose buffering/instance issues.
 */

const { MongoClient, ObjectId } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function migrate() {
    const client = new MongoClient(process.env.MONGO_URI);
    try {
        console.log("Connecting to MongoDB...");
        await client.connect();
        const db = client.db();
        console.log("Connected Successfully.");

        const usersColl = db.collection("users");
        const hubColl = db.collection("corpdatamasters");

        const allUsers = await usersColl.find({}).toArray();
        console.log(`Found ${allUsers.length} users in the legacy collection.`);

        let processedAdmins = 0;
        let processedStaff = 0;

        // 1. Process All CorpAdmins first
        const admins = allUsers.filter(u => u.userRole === "CorpAdmin");
        for (const admin of admins) {
            console.log(`Processing Admin Hub: ${admin.userDisplayName}`);
            
            const adminProfile = {
                displayName: admin.userDisplayName,
                email: admin.userEmail,
                mobile: admin.userMobile,
                password: admin.userPassword,
                role: "CorpAdmin",
                aadhar: admin.userAadhar,
                dob: admin.userDoB,
                active: admin.userActive,
                profileImage: admin.userProfileImage,
                createdAt: admin.createdAt || new Date(),
                updatedAt: new Date()
            };

            const corporateData = {};
            if (admin.linkedCorporates && admin.linkedCorporates.length > 0) {
                admin.linkedCorporates.forEach(corp => {
                    const cid = corp._id.toString();
                    corporateData[cid] = {
                        profile: {
                            corporateName: corp.corporateName,
                            corporateTagName: corp.corporateTagName,
                            corporateEmail: corp.corporateEmail,
                            corporateAddress: corp.corporateAddress,
                            corporateCity: corp.corporateCity,
                            corporateDistrict: corp.corporateDistrict,
                            corporateState: corp.corporateState,
                            corporatePin: corp.corporatePin,
                            corporatePAN: corp.corporatePAN,
                            corporateActive: corp.corporateActive,
                            CorpProfileImage: corp.CorpProfileImage,
                            taxRegistrations: corp.taxRegistrations,
                            bankDetails: corp.bankDetails,
                            authorizedSignatory: corp.authorizedSignatory,
                            apiUrls: corp.apiUrls
                        },
                        users: [adminProfile], 
                        clients: [], suppliers: [], leads: [], products: [], categories: [], rates: [], groups: [], ledgers: [], vouchers: [], attendance: [],
                        counters: { lead: 0, voucher: 0, invoice: 0 }
                    };
                });
            }

            await hubColl.updateOne(
                { _id: admin._id },
                { 
                    $set: { 
                        adminProfile,
                        corporateData: corporateData,
                        updatedAt: new Date()
                    },
                    $setOnInsert: { createdAt: new Date() }
                },
                { upsert: true }
            );
            processedAdmins++;
        }

        // 2. Process All Staff
        const staff = allUsers.filter(u => u.userRole !== "CorpAdmin");
        for (const user of staff) {
            if (!user.accessCorporate || !user.accessCorporate.corpAdminId) continue;

            const adminId = user.accessCorporate.corpAdminId;
            const profile = {
                _id: user._id, 
                displayName: user.userDisplayName,
                email: user.userEmail,
                mobile: user.userMobile,
                password: user.userPassword,
                role: user.userRole,
                aadhar: user.userAadhar,
                dob: user.userDoB,
                active: user.userActive,
                profileImage: user.userProfileImage,
                createdAt: user.createdAt || new Date(),
                updatedAt: new Date()
            };

            const allowedIds = (user.accessCorporate.linkedCorporates || [])
                .filter(lc => lc.accessAllow)
                .map(lc => lc.corporateId.toString());

            for (const cid of allowedIds) {
                // Add user to the specific corporate slot array if not already there
                await hubColl.updateOne(
                    { _id: adminId, [`corporateData.${cid}`]: { $exists: true } },
                    { 
                        $addToSet: { [`corporateData.${cid}.users`]: profile } 
                    }
                );
            }
            processedStaff++;
        }

        console.log("Migration Completed.");
        console.log(`Summary: ${processedAdmins} Admin Hubs updated/created. ${processedStaff} Staff members processed.`);
        
    } catch (err) {
        console.error("Migration Failed:", err.message);
    } finally {
        await client.close();
    }
}

migrate();
