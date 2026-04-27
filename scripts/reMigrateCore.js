const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// Import Models
const { CorpDataMaster } = require("../models/CorpDataMaster");
const { Users } = require("../models/UsersCorporates");
const { LeadsLedgers } = require("../models/LeadsLedgers");

async function migrate() {
    console.log("🚀 Starting Core Migration: Leads & Users Only...");

    try {
        const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error("MONGO_URI not found in environment.");
        }

        await mongoose.connect(mongoUri);
        console.log("✅ Connected to MongoDB.");

        // 1. Reset CorpDataMaster
        console.log("🧹 Clearing CorpDataMaster collection...");
        await CorpDataMaster.deleteMany({});

        // 2. Fetch all CorpAdmins (Hub Owners)
        const corpAdmins = await Users.find({ userRole: "CorpAdmin" }).lean();
        console.log(`🔍 Found ${corpAdmins.length} CorpAdmins.`);

        for (const admin of corpAdmins) {
            console.log(`\n📦 Processing Hub: ${admin.userDisplayName} (${admin._id})`);

            const newHub = new CorpDataMaster({
                _id: admin._id,
                corporateData: {}
            });

            // 3. Fetch Old Leads Hub for this admin
            const oldLeadsHub = await LeadsLedgers.findById(admin._id).lean();

            for (const corp of admin.linkedCorporates) {
                const corpId = corp._id.toString();
                console.log(`  🔹 Spoke: ${corp.corporateName} (${corpId})`);

                const slot = {
                    clients: [],
                    suppliers: [],
                    employees: [],
                    users: [],
                    leads: [],
                    categories: [],
                    products: [],
                    rates: [],
                    groups: [],
                    ledgers: [],
                    vouchers: [],
                    attendance: [],
                    counters: { lead: 0, voucher: 0, invoice: 0 }
                };

                // --- A. Migrate Staff Users ---
                const staffUsers = await Users.find({
                    "accessCorporate.corpAdminId": admin._id,
                    "accessCorporate.linkedCorporates.corporateId": corp._id
                }).lean();

                slot.users = staffUsers.map(u => ({
                    _id: u._id,
                    displayName: u.userDisplayName,
                    email: u.userEmail,
                    mobile: u.userMobile,
                    password: u.userPassword,
                    role: u.userRole,
                    active: u.userActive,
                    profileImage: u.userProfileImage
                }));
                console.log(`    ✅ Migrated ${slot.users.length} users.`);

                // --- B. Migrate Leads ---
                if (oldLeadsHub && oldLeadsHub.corporateData) {
                    // Mongoose Map in lean() becomes a plain object
                    const oldSlot = oldLeadsHub.corporateData[corpId];
                    if (oldSlot) {
                        slot.leads = (oldSlot.leads || []).map(l => ({
                            _id: l._id,
                            lead_no: l.lead_no,
                            sender_name: l.sender_name,
                            sender_mobile: l.sender_mobile,
                            sender_email: l.sender_email,
                            sender_city: l.sender_city,
                            sender_state: l.sender_state,
                            product_name: l.product_name,
                            source: l.source,
                            status: l.status,
                            generated_date: l.generated_date,
                            activity: (l.activity || []).map(a => ({
                                action: a.action,
                                byUser: a.byUser,
                                date: a.date,
                                metadata: a.metadata || {}
                            })),
                            folderGallery: [] // Reset gallery or map if exists
                        }));
                        slot.counters.lead = oldSlot.leadCounters || 0;
                        console.log(`    ✅ Migrated ${slot.leads.length} leads (Counter: ${slot.counters.lead}).`);
                    }
                }

                newHub.corporateData.set(corpId, slot);
            }

            try {
                await newHub.save();
                console.log(`  🎉 Successfully processed Hub: ${admin.userDisplayName}`);
            } catch (err) {
                console.error(`  ❌ Error saving Hub ${admin._id}:`, err.message);
            }
        }

        console.log("\n🚀 CORE MIGRATION FINISHED: Leads and Users moved to Hub-and-Spoke 2.0");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration Error:", err.stack);
        process.exit(1);
    }
}

migrate();
