const { MongoClient } = require("mongodb");

async function findCorporateData() {
    const uri = "mongodb+srv://portakabinin:hipk2025@cluster0.kel8j1j.mongodb.net/lead_db?retryWrites=true&w=majority&appName=Cluster0";
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db("lead_db");
        const collections = await db.listCollections().toArray();

        for (const col of collections) {
            const count = await db.collection(col.name).countDocuments({
                $or: [
                    { corporateId: "69bbd65092666731efd21731" },
                    { [`corporateData.69bbd65092666731efd21731`]: { $exists: true } }
                ]
            });
            if (count > 0) {
                console.log(`Found ${count} matches in collection: ${col.name}`);
            }
        }

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
    }
}

findCorporateData();
