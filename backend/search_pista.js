const mongoose = require('mongoose');
const uri = 'mongodb://portakabinin:hipk2025@ac-rrvwcud-shard-00-00.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-01.kel8j1j.mongodb.net:27017,ac-rrvwcud-shard-00-02.kel8j1j.mongodb.net:27017/mainDatabase?ssl=true&replicaSet=atlas-uzlky7-shard-0&authSource=admin&retryWrites=true&w=majority';

async function run() {
  try {
    await mongoose.connect(uri);
    const dbsToSearch = [
      'mainDatabase', 
      '41444c50503539303542', // Pratham Services
      '41414546483437393441', // portakabin.in
      '41455750433838343445', // Miscellaneous Receipt-Income
      '41414443543830373245'  // Team Security and HR Solutions
    ];
    
    console.log("Searching for 'Pista' in specific databases:", dbsToSearch);
    
    for (const dbName of dbsToSearch) {
      const conn = mongoose.connection.useDb(dbName);
      const collections = await conn.db.listCollections().toArray();
      
      for (const colInfo of collections) {
        const colName = colInfo.name;
        const col = conn.db.collection(colName);
        
        const docs = await col.find({}).toArray();
        for (const doc of docs) {
          const docStr = JSON.stringify(doc);
          if (docStr.toLowerCase().includes('pista')) {
            console.log(`Found in [${dbName}].[${colName}]:`);
            console.log(JSON.stringify(doc, null, 2));
          }
        }
      }
    }
    
    console.log("Search completed.");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
