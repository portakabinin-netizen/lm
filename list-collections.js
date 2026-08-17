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
  console.log(`Connected to: ${tDb.name}`);
  const collections = await tDb.db.listCollections().toArray();
  console.log("Collections:");
  collections.forEach(c => console.log(` - ${c.name}`));
  
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
