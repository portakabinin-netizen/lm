const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

async function checkAttendance() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("No MONGO_URI found in .env");
    return;
  }
  
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const connection = mongoose.connection;
  console.log(`Connected to Database: ${connection.db.databaseName}`);

  // 1. Find user in userMaster
  const userMaster = connection.collection('usermasters');
  const user = await userMaster.findOne({ _id: new mongoose.Types.ObjectId("6a16c21848b0cc31bd7d4b1f") });
  
  if (!user) {
    console.log("User not found in userMaster with ID 6a16c21848b0cc31bd7d4b1f");
    // Try to find the tenant database directly
    // Look at all databases
    const adminDb = connection.db.admin();
    const dbs = await adminDb.listDatabases();
    console.log("Looking for attendance in all DBs...");
    for (const dbInfo of dbs.databases) {
       const tDb = connection.useDb(dbInfo.name);
       const tAttendances = tDb.collection('attendances');
       const count = await tAttendances.countDocuments({ 
           employeeId: new mongoose.Types.ObjectId("6a16c21848b0cc31bd7d4b1f")
       });
       if (count > 0) {
           console.log(`Found ${count} records in DB: ${dbInfo.name}`);
           const recs = await tAttendances.find({ employeeId: new mongoose.Types.ObjectId("6a16c21848b0cc31bd7d4b1f") }).toArray();
           recs.forEach(r => console.log(` - Date: ${r.date}, Status: ${r.status}, Site: ${r.site_name}`));
       }
    }
    process.exit(0);
  }

  const dbName = user.dbName || user.corpId; // Depending on how multi-tenant is mapped
  console.log(`User found! Tenant DB: ${dbName}`);

  const tenantConnection = mongoose.connection.useDb(dbName);
  const attendances = tenantConnection.collection('attendances');
  
  const query = {
    employeeId: new mongoose.Types.ObjectId("6a16c21848b0cc31bd7d4b1f"),
    date: {
      $gte: new Date("2026-07-01T00:00:00.000Z"),
      $lte: new Date("2026-07-31T23:59:59.999Z")
    },
    status: { $nin: ["Absent", "Leave"] }
  };

  const count = await attendances.countDocuments(query);
  console.log(`\n--- ATTENDANCE COUNT FOR JULY 2026 ---`);
  console.log(`Count: ${count}`);

  const records = await attendances.find(query).toArray();
  console.log(`\n--- ATTENDANCE RECORDS ---`);
  records.forEach((r, i) => {
    console.log(`${i+1}. Date: ${r.date}, Status: ${r.status}, Site: ${r.site_name}, dutyStart: ${r.dutyStart}`);
  });
  
  process.exit(0);
}

checkAttendance().catch(err => {
  console.error(err);
  process.exit(1);
});
