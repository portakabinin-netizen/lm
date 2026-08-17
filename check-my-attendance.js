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
  console.log(`Connected to Database: ${connection.db.databaseName}`);

  const empId = "6a15815f186bf5d91c760cf0";
  const empObjectId = new mongoose.Types.ObjectId(empId);

  const adminDb = connection.db.admin();
  const dbs = await adminDb.listDatabases();
  console.log(`Looking for attendance with employeeId: ${empId} in all DBs...`);
  
  for (const dbInfo of dbs.databases) {
     const tDb = connection.useDb(dbInfo.name);
     const tAttendances = tDb.collection('attendances');
     const count = await tAttendances.countDocuments({
         $or: [
             { employeeId: empId },
             { employeeId: empObjectId }
         ]
     });
     if (count > 0) {
         console.log(`Found ${count} records in DB: ${dbInfo.name}`);
         const recs = await tAttendances.find({
             $or: [
                 { employeeId: empId },
                 { employeeId: empObjectId }
             ]
         }).sort({ dutyStart: -1 }).limit(10).toArray();
         recs.forEach((r, idx) => {
             console.log(`  [${idx}] _id: ${r._id}, Date: ${r.date}, Status: ${r.status}, Site: ${r.site_name}, dutyStart: ${r.dutyStart}, dutyEnd: ${r.dutyEnd}, markedByDevice: ${r.markedByDevice}`);
         });
     }
  }
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
