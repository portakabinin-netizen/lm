const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

async function listUsers() {
  const uri = process.env.MONGO_URI;
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const connection = mongoose.connection;
  const userMaster = connection.collection('usermasters');

  const allUsers = await userMaster.find({}).toArray();
  console.log(`Total users found: ${allUsers.length}`);

  for (let i = 0; i < Math.min(10, allUsers.length); i++) {
      const u = allUsers[i];
      console.log(`User: ${u._id}, Name: ${u.name}, Mobile: ${u.mobile}, UserMobile: ${u.userMobile}, Username: ${u.username}`);
  }

  process.exit(0);
}

listUsers().catch(err => console.log(err));
