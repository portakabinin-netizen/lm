/**
 * 🛰️  Data Migration Script: copyUsersToHub.js
 * 
 * PURPOSE:
 * Copies user accounts and corporate settings from the old standalone collections
 * into the centralized 'CorpDataMaster' hub structure.
 * 
 * This follows the Hub-and-Spoke 2.0 design where identity and settings
 * live within the corporate admin's hub document.
 */

const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// ── Models ──────────────────────────────────────────────────────────────────
// We import directly from files to avoid register collisions
const { Users } = require("C:/oldmodels/UsersCorporates");
const { CorpDataMaster } = require("../models/CorpDataMaster");

async function migrate() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        
        // Ensure connection is fully established
        if (mongoose.connection.readyState !== 1) {
            await new Promise((resolve, reject) => {
                mongoose.connection.once('connected', resolve);
                mongoose.connection.once('error', reject);
            });
        }
        console.log("Connected Successfully.");

        const allUsers = await Users.find({}).lean();
        console.log(`Found ${allUsers.length} users in the legacy collection.`);

        let processedAdmins = 0;
        let processedStaff = 0;

        // 1. Process All CorpAdmins first (to create/init Hubs)
        const admins = allUsers.filter(u => u.userRole === "CorpAdmin");
        for (const admin of admins) {
            console.log(`Processing Admin: ${admin.userDisplayName} (${admin._id})`);
            
            // Map admin profile
            const adminProfile = {
                displayName: admin.userDisplayName,
                email: admin.userEmail,
                mobile: admin.userMobile,
                password: admin.userPassword,
                role: "CorpAdmin",
                aadhar: admin.userAadhar,
                dob: admin.userDoB,
                active: admin.userActive,
                profileImage: admin.userProfileImage
            };

            // Find or create Hub
            let hub = await CorpDataMaster.findById(admin._id);
            if (!hub) {
                hub = new CorpDataMaster({ _id: admin._id });
            }
            hub.adminProfile = adminProfile;

            // Map each linked corporate into its slot
            if (admin.linkedCorporates && admin.linkedCorporates.length > 0) {
                admin.linkedCorporates.forEach(corp => {
                    const cid = corp._id.toString();
                    if (!hub.corporateData.has(cid)) {
                        hub.corporateData.set(cid, { users: [], clients: [], suppliers: [], leads: [], products: [] });
                    }
                    
                    const slot = hub.corporateData.get(cid);
                    
                    // Copy corporate identity and settings into the 'profile' field
                    slot.profile = {
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
                    };
                });
            }

            await hub.save();
            processedAdmins++;
        }

        // 2. Process All Staff (Sales, Project, Finance)
        const staff = allUsers.filter(u => u.userRole !== "CorpAdmin");
        for (const user of staff) {
            if (!user.accessCorporate || !user.accessCorporate.corpAdminId) {
                console.warn(`Skipping user ${user.userDisplayName}: No admin linkage.`);
                continue;
            }

            const adminId = user.accessCorporate.corpAdminId;
            const hub = await CorpDataMaster.findById(adminId);
            if (!hub) {
                console.error(`Skipping staff ${user.userDisplayName}: Admin Hub ${adminId} not found.`);
                continue;
            }

            // Map user profile
            const profile = {
                displayName: user.userDisplayName,
                email: user.userEmail,
                mobile: user.userMobile,
                password: user.userPassword,
                role: user.userRole,
                aadhar: user.userAadhar,
                dob: user.userDoB,
                active: user.userActive,
                profileImage: user.userProfileImage
            };

            // Copy user into every corporate slot they have access to
            const allowedIds = (user.accessCorporate.linkedCorporates || [])
                .filter(lc => lc.accessAllow)
                .map(lc => lc.corporateId.toString());

            let userInserted = false;
            allowedIds.forEach(cid => {
                if (hub.corporateData.has(cid)) {
                    const slot = hub.corporateData.get(cid);
                    // Check if user already exists in this slot
                    const exists = slot.users.find(u => u.mobile === profile.mobile);
                    if (!exists) {
                        slot.users.push(profile);
                        userInserted = true;
                    }
                }
            });

            if (userInserted) {
                await hub.save();
                processedStaff++;
            }
        }

        console.log("Migration Completed.");
        console.log(`Summary: ${processedAdmins} Admins (including profile/settings) and ${processedStaff} Staff members copied to Hub.`);
        process.exit(0);

    } catch (err) {
        console.error("Migration Failed:", err.message);
        process.exit(1);
    }
}

migrate();
