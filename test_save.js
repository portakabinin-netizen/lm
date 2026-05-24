const mongoose = require('mongoose');

async function test() {
  const uri = "mongodb://portakabinin:hipk2025@ac-rrvwcud-shard-00-00.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-01.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-02.kel8j1j.mongodb.net:27017/mainDatabase?ssl=true&replicaSet=atlas-uzlky7-shard-0&authSource=admin&retryWrites=true&w=majority";
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  
  require('./models/TenantModels.js');
  const db = mongoose.connection.client.db('41414443543830373246');
  const Attendance = mongoose.connection.useDb('41414443543830373246').model('Attendance');

  const record = await Attendance.findById('6a11571a09cb3227d67c0af1');
  if (!record) {
    console.log("No record");
    return process.exit(0);
  }

  const now = new Date();
  const elapsedHrs = (now - record.dutyStart) / 3600000;
  
  record.dutyEnd = now;
  record.geoHistory.push({ lat: undefined, long: undefined, address: '', type: 'end', timestamp: now });
  record.hoursWorked = parseFloat(Math.max(0, elapsedHrs).toFixed(2));

  try {
    await record.save();
    console.log("Saved successfully!");
  } catch (err) {
    console.log("Error saving:");
    console.log(err.message);
  }

  process.exit(0);
}

test().catch(console.error);
