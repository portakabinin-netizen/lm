const { MongoClient } = require("mongodb");

async function inspectLegacyUsers() {
    const uri = "mongodb+srv://portakabinin:hipk2025@cluster0.kel8j1j.mongodb.net/lead_db?retryWrites=true&w=majority&appName=Cluster0";
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db("lead_db");
        
        console.log("--- Legacy Users ---");
        const users = await db.collection("users").find({}).toArray();
        users.forEach(u => {
            console.log(`Email: ${u.userEmail}, Role: ${u.userRole}, corporateId: ${u.corporateId}, access:`, JSON.stringify(u.accessCorporate));
        });

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
    }
}

inspectLegacyUsers();
