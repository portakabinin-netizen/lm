const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

async function inspectSchema() {
    const uri = process.env.MONGO_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db("41414546483437393441");
        const sample = await db.collection("leads").findOne({});
        console.log("Sample lead keys:", Object.keys(sample));
        console.log("Full sample lead:", JSON.stringify(sample, null, 2));

        const types = await db.collection("leads").aggregate([
            { $project: { fieldList: { $objectToArray: "$$ROOT" } } },
            { $unwind: "$fieldList" },
            { $group: { _id: "$fieldList.k", count: { $sum: 1 } } }
        ]).toArray();
        console.log("Field distribution:", types);

    } finally {
        await client.close();
    }
}

inspectSchema();
