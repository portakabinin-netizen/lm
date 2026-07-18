const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

async function testMobileLookup() {
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
  
  const mobile = "8130688743";
  let q = {};
  const digits = String(mobile).replace(/\D/g, '');
  if (digits.length >= 10) {
      const ten = digits.slice(-10);
      q.mobile = { $regex: new RegExp(ten + '$', 'i') };
  } else if (mobile) {
      q.mobile = mobile;
  }

  const list = await Employees.find(q).toArray();
  console.log(`Found ${list.length} employees with mobile ${mobile}`);
  if (list.length > 0) {
      console.log(`ID: ${list[0]._id}`);
  }

  process.exit(0);
}

testMobileLookup().catch(err => console.log(err));
