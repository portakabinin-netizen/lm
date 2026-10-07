const mongoose = require('mongoose');

async function cleanup() {
  const uri = "mongodb://portakabinin:hipk2025@ac-rrvwcud-shard-00-00.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-01.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-02.kel8j1j.mongodb.net:27017/mainDatabase?ssl=true&replicaSet=atlas-uzlky7-shard-0&authSource=admin&retryWrites=true&w=majority";
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  
  const attendanceSchema = new mongoose.Schema({
    employeeId: { type: mongoose.Schema.Types.ObjectId },
    dutyStart: { type: Date },
    dutyEnd: { type: Date },
    hoursWorked: { type: Number, default: 0 }
  }, { strict: false });
  
  const dbNames = ['41414443543830373246', '41414546483437393441'];
  
  for (const dbName of dbNames) {
      const db = mongoose.connection.useDb(dbName);
      const Attendance = db.model('Attendance', attendanceSchema);
      
      const result = await Attendance.deleteMany({
          dutyEnd: { $ne: null },
          hoursWorked: { $lt: 2 }
      });
      
      console.log(`[${dbName}] Deleted ${result.deletedCount} completed attendance records with less than 2 hours worked.`);
  }
  
  console.log("Short duty cleanup complete!");
  process.exit(0);
}

cleanup().catch(console.error);
