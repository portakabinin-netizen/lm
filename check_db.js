const mongoose = require('mongoose');
const uri = 'mongodb://portakabinin:hipk2025@ac-rrvwcud-shard-00-00.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-01.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-02.kel8j1j.mongodb.net:27017/mainDatabase?ssl=true&replicaSet=atlas-uzlky7-shard-0&authSource=admin&retryWrites=true&w=majority';

async function run() {
  try {
    await mongoose.connect(uri);
    const db = mongoose.connection.useDb('mainDatabase');
    const userColl = db.collection('userMaster');
    const users = await userColl.find({}).toArray();
    console.log(`Found ${users.length} users in mainDatabase.`);
    users.forEach((user, idx) => {
      console.log(`--- User ${idx + 1} ---`);
      console.log(JSON.stringify(user, null, 2));
    });
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
