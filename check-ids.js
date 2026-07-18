const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

async function checkIds() {
  const uri = process.env.MONGO_URI;
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const connection = mongoose.connection;
  const userMaster = connection.collection('usermasters');
  
  const user = await userMaster.findOne({ 
      _id: new mongoose.Types.ObjectId("6a5af2fc629429d21d1de444") 
  });

  if (user) {
      console.log("Found UserMaster by ID:", user.name);
      console.log("Mobile:", user.mobile);
      console.log("UserMobile:", user.userMobile);
      console.log("Username:", user.username);
  } else {
      console.log("Could not find user 6a5af2fc629429d21d1de444");
  }

  process.exit(0);
}

checkIds().catch(err => console.log(err));
