const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../backend/.env") });

async function searchIds() {
    const ids = ["69bbd65092666731efd21731", "6984d40db02c9d553f90e6c0"];
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const db = mongoose.connection.db;

        for (const id of ids) {
            console.log(`Searching for ID: ${id}`);
            const user = await db.collection("users").findOne({ _id: new mongoose.Types.ObjectId(id) });
            if (user) {
                console.log(`  Found as USER: ${user.userDisplayName} [${user.userRole}]`);
            } else {
                const userWithCorp = await db.collection("users").findOne({ "linkedCorporates._id": new mongoose.Types.ObjectId(id) });
                if (userWithCorp) {
                    const corp = userWithCorp.linkedCorporates.find(c => c._id.toString() === id);
                    console.log(`  Found as CORPORATE "${corp.corporateName}" inside USER: ${userWithCorp.userDisplayName}`);
                } else {
                    console.log(`  ID not found in users or linkedCorporates.`);
                }
            }
        }
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
searchIds();
