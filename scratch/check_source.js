const mongoose = require("mongoose");
const path = require("path");

const SOURCE_URI = "mongodb+srv://portakabinin:hipk2025@cluster0.kel8j1j.mongodb.net/lead_db?retryWrites=true&w=majority";

async function check() {
  try {
    const conn = await mongoose.createConnection(SOURCE_URI).asPromise();
    console.log("Connected to lead_db");
    
    const count = await conn.db.collection("leads").countDocuments();
    console.log("Total leads in lead_db:", count);
    
    const sample = await conn.db.collection("leads").findOne();
    console.log("Sample lead:", JSON.stringify(sample, null, 2));
    
    await conn.close();
  } catch (err) {
    console.error("Check failed:", err);
  }
}

check();
