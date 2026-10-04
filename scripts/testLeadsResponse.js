const axios = require('axios');

async function test() {
    try {
        // We'll simulate getting leads for a specific corporate
        // Corporate: 6984d40db02c9d553f90e6c0
        // Admin: 6984d40db02c9d553f90e6bf
        
        // I'll check the DB directly to see if any leads have status "Recent"
        const mongoose = require('mongoose');
        await mongoose.connect('mongodb+srv://portakabinin:hipk2025@cluster0.kel8j1j.mongodb.net/lead_db');
        const Leads = mongoose.model('Leads', new mongoose.Schema({ corporateData: Map }, { strict: false }));
        
        const hub = await Leads.findOne({ corpAdminId: new mongoose.Types.ObjectId('6984d40db02c9d553f90e6bf') }).lean();
        const data = hub?.corporateData?.['6984d40db02c9d553f90e6c0'] || [];
        
        console.log(`Total leads in Hub for 6984d40db02c9d553f90e6c0: ${data.length}`);
        
        const recent = data.filter(l => l.status === "Recent");
        console.log(`Leads with status 'Recent': ${recent.length}`);
        
        const engaged = data.filter(l => l.status === "Engaged");
        console.log(`Leads with status 'Engaged': ${engaged.length}`);

        const accepted = data.filter(l => l.status === "Accepted");
        console.log(`Leads with status 'Accepted': ${accepted.length}`);

        const delete_leads = data.filter(l => l.status === "Delete");
        console.log(`Leads with status 'Delete': ${delete_leads.length}`);

        if (data.length > 0) {
            console.log("Sample Lead Fields:", Object.keys(data[0]));
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

test();
