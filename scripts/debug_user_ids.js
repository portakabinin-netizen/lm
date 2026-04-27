const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: 'c:/hipk/backend/.env' });

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const { Users } = require('c:/hipk/backend/models/UsersCorporates');

        // Find a Sales user
        const salesUser = await Users.findOne({ userRole: 'Sales' });
        if (!salesUser) {
            console.log('No Sales user found for test');
            return;
        }

        console.log('--- Sales User Check ---');
        console.log('ID:', salesUser._id);
        console.log('Role:', salesUser.userRole);
        console.log('AccessCorporate:', JSON.stringify(salesUser.accessCorporate, null, 2));
        
        if (salesUser.accessCorporate) {
            console.log('corpAdminId Raw:', salesUser.accessCorporate.corpAdminId);
            console.log('corpAdminId Type:', typeof salesUser.accessCorporate.corpAdminId);
            const isValid = mongoose.Types.ObjectId.isValid(salesUser.accessCorporate.corpAdminId);
            const isObjectId = salesUser.accessCorporate.corpAdminId instanceof mongoose.Types.ObjectId;
            console.log('Is valid ObjectId:', isValid);
            console.log('Is internal ObjectId instance:', isObjectId);
        }

        // Find the Admin linked to this Sales user
        if (salesUser.accessCorporate && salesUser.accessCorporate.corpAdminId) {
            const admin = await Users.findById(salesUser.accessCorporate.corpAdminId);
            console.log('\n--- Linked Admin Check ---');
            console.log('Admin Found:', !!admin);
            if (admin) {
                console.log('Admin ID:', admin._id);
                console.log('Admin Role:', admin.userRole);
                const firstCorp = admin.linkedCorporates?.[0];
                console.log('First Linked Corporate ID:', firstCorp?._id);
                console.log('First Linked Corporate Name:', firstCorp?.corporateName);
            }
        }
    } catch (err) {
        console.error('Check failed:', err);
    } finally {
        await mongoose.disconnect();
    }
}
check();
