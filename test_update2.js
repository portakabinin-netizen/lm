const mongoose = require('mongoose');

async function test() {
  const uri = "mongodb://portakabinin:hipk2025@ac-rrvwcud-shard-00-00.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-01.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-02.kel8j1j.mongodb.net:27017/mainDatabase?ssl=true&replicaSet=atlas-uzlky7-shard-0&authSource=admin&retryWrites=true&w=majority";
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  
  // Create schema manually instead of relying on TenantModels which might be complex
  const attendanceSchema = new mongoose.Schema({
    dutyEnd: { type: Date },
    hoursWorked: { type: Number, default: 0 },
    forcedOff: { type: Boolean },
    forcedOffReason: { type: String }
  }, { strict: false });

  const db = mongoose.connection.useDb('41414443543830373246');
  const Attendance = db.model('Attendance', attendanceSchema);

  const record = await Attendance.findById('6a11555409cb3227d67c0a40');
  if (!record) {
    console.log("No record");
    return process.exit(0);
  }

  console.log("Before:", record.dutyEnd);

  const update = {
      dutyEnd: new Date().toISOString(),
      forcedOff: true,
      forcedOffReason: 'Shift Change / Handover',
      hoursWorked: 5.5
  };

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
