const mongoose = require('mongoose');

async function test() {
  const uri = "mongodb://portakabinin:hipk2025@ac-rrvwcud-shard-00-00.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-01.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-02.kel8j1j.mongodb.net:27017/mainDatabase?ssl=true&replicaSet=atlas-uzlky7-shard-0&authSource=admin&retryWrites=true&w=majority";
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  console.log("Connected to MongoDB");

  // Get databases
  const adminDb = mongoose.connection.client.db('admin');
  const dbs = await adminDb.admin().listDatabases();
  const dbNames = dbs.databases.map(d => d.name).filter(n => n.includes('tenant') || n.includes('hipk') || n.includes('portakabin'));
  console.log("Databases:", dbNames);
  
  // Use portakabinin-netizen
  const tenantDb = mongoose.connection.client.db('portakabinin-netizen');
  const Attendance = tenantDb.collection('attendances');

  const activeDuties = await Attendance.find({
    $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }]
  }).toArray();

  console.log(`Found ${activeDuties.length} active duties.`);
  for (let i=0; i<Math.min(3, activeDuties.length); i++) {
    console.log(`Duty ${i}:`, JSON.stringify(activeDuties[i], null, 2));
  }

  process.exit(0);
}

test().catch(console.error);
