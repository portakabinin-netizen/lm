const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

async function testGetEmployee() {
  const uri = process.env.MONGO_URI;
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const connection = mongoose.connection;
  const adminDb = connection.db.admin();
  const dbs = await adminDb.listDatabases();
  
  let tenantDb;
  for (const dbInfo of dbs.databases) {
      if (dbInfo.name === '41444c50503539303542') {
         tenantDb = connection.useDb(dbInfo.name);
         break;
      }
  }

  const Employees = tenantDb.collection('employees');
  const userMaster = connection.collection('userMaster');

  // I need to find the userMaster ID! The user logged in with 8130688743 or similar.
  const allUsers = await userMaster.find({}).toArray();
  const matchingUser = allUsers.find(u => {
      const uMobile = u.mobile || u.userMobile || u.username || '';
      return uMobile.includes('8130688743');
  });

  if (matchingUser) {
      console.log("Found UserMaster:", matchingUser._id, matchingUser.name, matchingUser.userMobile);
      const id = matchingUser._id.toString();

      // NOW test getEmployee logic exactly!
      let employeeDoc = await Employees.findOne({
        $or: [{ _id: new mongoose.Types.ObjectId(id) }, { user_id: id }],
      });

      if (!employeeDoc) {
        console.log("No exact match, trying mobile fallback...");
        const userMobile = matchingUser.mobile || matchingUser.userMobile || matchingUser.username || '';
        const digits = String(userMobile).replace(/\D/g, '');
        const orConditions = [];
        if (digits.length >= 10) {
          const ten = digits.slice(-10);
          orConditions.push({ mobile: { $regex: new RegExp(ten + '$', 'i') } });
        } else if (userMobile) {
          orConditions.push({ mobile: userMobile });
        }
        console.log("orConditions:", orConditions);
        if (orConditions.length > 0) {
          employeeDoc = await Employees.findOne({ $or: orConditions });
        }
      }

      if (employeeDoc) {
          console.log("FOUND EMPLOYEE VIA FALLBACK! employee_id:", employeeDoc._id);
      } else {
          console.log("FAILED to find employee!");
      }
  } else {
      console.log("Could not find any user in userMaster with that number anywhere!");
  }

  process.exit(0);
}

testGetEmployee().catch(err => console.log(err));
