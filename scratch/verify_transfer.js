const mongoose = require("mongoose");

const TARGET_DB_NAME = "41414546483437393441";
const TARGET_URI = `mongodb+srv://portakabinin:hipk2025@cluster0.kel8j1j.mongodb.net/${TARGET_DB_NAME}?retryWrites=true&w=majority`;

async function verify() {
  try {
    const conn = await mongoose.createConnection(TARGET_URI).asPromise();
    console.log(`Connected to TARGET: ${TARGET_DB_NAME}`);
    
    const count = await conn.db.collection("leads").countDocuments();
    console.log("Total leads in target:", count);
    
    const sample = await conn.db.collection("leads").findOne({ lead_no: 1182 });
    console.log("Sample lead (lead_no: 1182):", JSON.stringify(sample, null, 2));
    
    await conn.close();
  } catch (err) {
    console.error("Verification failed:", err);
  }
}

verify();
