const mongoose = require('mongoose');

async function check() {
    try {
        await mongoose.connect('mongodb+srv://portakabinin:hipk2025@cluster0.kel8j1j.mongodb.net/lead_db');
        const db = mongoose.connection.db;
        const hub = await db.collection('leads').findOne({ corporateData: { $exists: true } });
        
        if (!hub) {
            console.log("No Hub found.");
        } else {
            console.log("Hub ID:", hub._id);
            console.log("Admin ID:", hub.corpAdminId);
            const keys = Object.keys(hub?.corporateData || {});
            if (keys.length === 0) {
                console.log(`  - No corporate data found.`);
            }
            for (const k of keys) {
                const leads = hub?.corporateData?.[k];
                console.log(`- Corporate ${k}: ${Array.isArray(leads) ? leads.length : 'NOT ARRAY'} leads`);
                if (Array.isArray(leads) && leads.length > 0) {
                    console.log(`  Sample status of first lead:`, leads[0].status);
                }
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
