const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: './.env' });

async function testListAttendance() {
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

  const Attendance = tenantDb.collection('attendances');
  const userMaster = connection.collection('usermasters');
  const Employees = tenantDb.collection('employees');

  const employeeId = "6a16c21848b0cc31bd7d4b1f";
  const queryId = new mongoose.Types.ObjectId(employeeId);

  let matchIds = [employeeId, queryId];
  
  let userDoc = await userMaster.findOne({ _id: queryId });
  let employeeDoc = await Employees.findOne({ _id: queryId });

  if (userDoc && !employeeDoc) {
      console.log("Found UserDoc, but no EmployeeDoc!");
  }

  if (employeeDoc) {
      matchIds.push(employeeDoc._id.toString());
      matchIds.push(employeeDoc._id);
      if (employeeDoc.user_id) {
          matchIds.push(employeeDoc.user_id.toString());
          matchIds.push(employeeDoc.user_id);
      }
  }

  console.log("Match IDs:", matchIds);

  const from_date = "2026-07-01T00:00:00.000Z";
  const to_date = "2026-07-31T23:59:59.999Z";

  // Date filter logic from listAttendance
  const fromD = new Date(from_date);
  const toD = new Date(to_date);
  const dateFilter = { $gte: fromD, $lte: toD };

  const q = {
      $and: [
          { employeeId: { $in: matchIds } },
          {
              $or: [
                  { date: dateFilter },
                  { dutyStart: dateFilter },
                  { dutyEnd: { $exists: false } },
                  { dutyEnd: null },
                  { dutyEnd: '' }
              ]
          }
      ]
  };

  console.log("Query:", JSON.stringify(q, null, 2));

  const records = await Attendance.find(q).toArray();
  console.log("Records found:", records.length);
  if (records.length > 0) {
      console.log("Sample record:", records[0].date, records[0].status);
  }

  process.exit(0);
}

testListAttendance().catch(err => console.log(err));
