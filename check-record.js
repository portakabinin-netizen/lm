const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

async function check() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("No MONGO_URI found in .env");
    return;
  }
  
  await mongoose.connect(uri);
  const connection = mongoose.connection;
  const tDb = connection.useDb('41444c50503539303542');
  const tProfile = tDb.collection('profileMaster');
  
  const doc = await tProfile.findOne({});
  console.log("=== PROFILE MASTER DOC ===");
  console.log(JSON.stringify(doc, null, 2));
  
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
