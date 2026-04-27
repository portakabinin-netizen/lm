const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

// Import New Models
const { CorpDataMaster } = require("../models/CorpDataMaster");
const { TransactionMaster } = require("../models/TransactionMaster");

// Import Old Models
const { Users } = require("../models/UsersCorporates");
const { LeadsLedgers } = require("../models/LeadsLedgers");
const { StaffBook } = require("../models/StaffBook");
const { LedgerVoucherMaster } = require("../models/LedgerVoucherMaster");
const { SalesBook } = require("../models/SalPurBook");
const AttendanceLog = require("../models/AttendanceLog");
const Purchase = require("../models/purchase");

/**
 * 🛠️ Clean Migration Script: Leads & Users Only
 * Resets CorpDataMaster and re-populates only Leads and Users.
 */
async function migrate() {
    console.log("🚀 Starting Core Migration: Leads & Users Only...");

    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB.");

        // Clear existing Hub data
        console.log("🧹 Clearing CorpDataMaster collection...");
        await CorpDataMaster.deleteMany({});

        const corpAdmins = await Users.find({ userRole: "CorpAdmin" }).lean();
        console.log(`Auditing ${corpAdmins.length} Hubs.`);

        for (const admin of corpAdmins) {
            console.log(`\n📦 Processing Hub [Admin: ${admin.userDisplayName}]`);

            let corpHub = new CorpDataMaster({ _id: admin._id, corporateData: {} });

            for (const corp of admin.linkedCorporates) {
                const corpId = corp._id.toString();
                console.log(`  🔹 Spoke: ${corp.corporateName} (${corpId})`);

                const slot = {
                    clients: [], suppliers: [], employees: [], users: [], leads: [],
                    categories: [], products: [], rates: [], groups: [], ledgers: [],
                    vouchers: [], attendance: [], counters: { lead: 0, voucher: 0, invoice: 0 }
                };

                // --- 1. Users (Staff) ---
                const staffUsers = await Users.find({ 
                    "accessCorporate.corpAdminId": admin._id,
                    "accessCorporate.linkedCorporates.corporateId": corp._id 
                }).lean();

                slot.users = staffUsers.map(u => ({
                    _id: u._id, displayName: u.userDisplayName, email: u.userEmail, 
                    mobile: u.userMobile, password: u.userPassword, role: u.userRole, 
                    active: u.userActive, profileImage: u.userProfileImage 
                }));
                console.log(`    ✅ Users: ${slot.users.length}`);

                // --- 2. Leads (Correct Mapping) ---
                const leadHub = await LeadsLedgers.findById(admin._id).lean();
                if (leadHub && leadHub.corporateData?.[corpId]) {
                    const lData = leadHub.corporateData[corpId];
                    slot.leads = (lData.leads || []).map(l => ({
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
                    }));
                    slot.counters.lead = lData.leadCounters || 0;
                    console.log(`    ✅ Leads: ${slot.leads.length}`);
                }

                corpHub.corporateData.set(corpId, slot);
            }

            try {
                await corpHub.save();
                console.log(`  ✅ Successfully migrated Hub: ${admin.userDisplayName}`);
            } catch (saveErr) {
                console.error(`  ❌ Error saving Hub ${admin._id}:`, saveErr.message);
                throw saveErr;
            }
        }

        console.log("\n🚀 MIGRATION FINISHED: Leads and Users only.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration Error:", err.stack);
        process.exit(1);
    }
}

migrate();

