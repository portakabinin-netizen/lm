const mongoose = require('mongoose');

async function test() {
  const uri = "mongodb://portakabinin:hipk2025@ac-rrvwcud-shard-00-00.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-01.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-02.kel8j1j.mongodb.net:27017/mainDatabase?ssl=true&replicaSet=atlas-uzlky7-shard-0&authSource=admin&retryWrites=true&w=majority";
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  
  const dbs = ['41414443543830373246', '41414546483437393441', 'lead_db'];
  for (const dbName of dbs) {
    const db = mongoose.connection.client.db(dbName);
    const Attendance = db.collection('attendances');
    const activeDuties = await Attendance.find({
      $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }]
    }).toArray();
    console.log(`DB ${dbName}: ${activeDuties.length} active duties.`);
    for (let i=0; i<Math.min(2, activeDuties.length); i++) {
        console.log(`  Duty: ${JSON.stringify(activeDuties[i], null, 2)}`);
    }
  }
  process.exit(0);
}

test().catch(console.error);
