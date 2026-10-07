const mongoose = require('mongoose');

async function cleanup() {
  const uri = "mongodb://portakabinin:hipk2025@ac-rrvwcud-shard-00-00.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-01.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-02.kel8j1j.mongodb.net:27017/mainDatabase?ssl=true&replicaSet=atlas-uzlky7-shard-0&authSource=admin&retryWrites=true&w=majority";
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  
  const attendanceSchema = new mongoose.Schema({
    dutyStart: { type: Date },
    dutyEnd: { type: Date },
    dutyEndScheduled: { type: Date },
    hoursWorked: { type: Number, default: 0 },
    forcedOff: { type: Boolean },
    forcedOffReason: { type: String }
  }, { strict: false });
  
  const dbNames = ['41414443543830373246', '41414546483437393441'];
  
  for (const dbName of dbNames) {
      const db = mongoose.connection.useDb(dbName);
      const Attendance = db.model('Attendance', attendanceSchema);
      
      const corrupted = await Attendance.find({
          dutyEnd: { $in: [null, undefined] },
          forcedOff: true,
          forcedOffReason: "Shift Change / Handover"
      });
      
      for (const att of corrupted) {
          const dutyEnd = att.dutyEndScheduled || new Date();
          att.dutyEnd = dutyEnd;
          if (att.dutyStart) {
              const hrs = (new Date(dutyEnd) - new Date(att.dutyStart)) / 3600000;
              att.hoursWorked = parseFloat(Math.max(0, hrs).toFixed(2));
          }
          await att.save();
          console.log(`[${dbName}] Cleaned up corrupted record: ${att._id}`);
      }
  }
  
  console.log("Cleanup complete!");
  process.exit(0);
}

cleanup().catch(console.error);
