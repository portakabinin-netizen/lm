const mongoose = require('mongoose');

async function test() {
  const uri = "mongodb://portakabinin:hipk2025@ac-rrvwcud-shard-00-00.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-01.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-02.kel8j1j.mongodb.net:27017/mainDatabase?ssl=true&replicaSet=atlas-uzlky7-shard-0&authSource=admin&retryWrites=true&w=majority";
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  
  require('./models/TenantModels.js');
  const db = mongoose.connection.useDb('41414443543830373246');
  const Attendance = db.model('Attendance');

  const record = await Attendance.findById('6a11555409cb3227d67c0a40');
  if (!record) {
    console.log("No record");
    return process.exit(0);
  }

  console.log("Found record with dutyEnd:", record.dutyEnd);

  // simulate updateAttendance
  const allowed = [
      'forcedOff', 'forcedOffReason', 'status', 'rate',
      'geoHistory', 'emergencyOff', 'emergencyReason',
      'emergencyByUser', 'shiftCode', 'shiftType', 'shiftPeriod', 'dutyEnd'
  ];
  
  const update = {
      dutyEnd: new Date().toISOString(),
      forcedOff: true,
      forcedOffReason: 'Shift Change / Handover'
  };

  if (update.dutyEnd) {
      const existing = await Attendance.findById(record._id).select('dutyStart').lean();
      if (existing?.dutyStart) {
          const hrs = (new Date(update.dutyEnd) - new Date(existing.dutyStart)) / 3600000;
          update.hoursWorked = parseFloat(Math.max(0, hrs).toFixed(2));
      }
  }

  Object.assign(record, update);
  
  try {
      await record.save();
      console.log("Saved successfully! New dutyEnd:", record.dutyEnd);
  } catch (err) {
      console.log("Validation error:", err.message);
  }

  process.exit(0);
}

test().catch(console.error);
