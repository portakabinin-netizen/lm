const mongoose = require('mongoose');

async function test() {
  const uri = "mongodb://portakabinin:hipk2025@ac-rrvwcud-shard-00-00.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-01.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-02.kel8j1j.mongodb.net:27017/mainDatabase?ssl=true&replicaSet=atlas-uzlky7-shard-0&authSource=admin&retryWrites=true&w=majority";
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  console.log("Connected to MongoDB");

  const adminDb = mongoose.connection.client.db('admin');
  const dbs = await adminDb.admin().listDatabases();
  console.log("All Databases:", dbs.databases.map(d => d.name));
  process.exit(0);
}

test().catch(console.error);
