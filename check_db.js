const mongoose = require('mongoose');
const uri = 'mongodb://portakabinin:hipk2025@ac-rrvwcud-shard-00-00.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-01.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-02.kel8j1j.mongodb.net:27017/mainDatabase?ssl=true&replicaSet=atlas-uzlky7-shard-0&authSource=admin&retryWrites=true&w=majority';

async function run() {
  try {
    await mongoose.connect(uri);
    
    // Find the user to get the tenant DB
    const db = mongoose.connection.useDb('mainDatabase');
    const userColl = db.collection('usermasters');
    const user = await userColl.findOne({ 'accessCorporate.corporateName': 'Pratham Services' });
    if (!user) {
      console.log('User/Tenant not found in mainDatabase');
      process.exit(1);
    }
    
    const tenantDbName = user.accessCorporate.dbName;
    
    // Switch to tenant DB
    const tenantDb = mongoose.connection.useDb(tenantDbName);
    const profileColl = tenantDb.collection('profileMaster');
    
    const profile = await profileColl.findOne({});
    if (profile) {
      console.log('--- DB LOCATIONS ---');
      console.log(JSON.stringify(profile.locations, null, 2));
    } else {
      console.log('No profileMaster found in tenant DB');
    }
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
