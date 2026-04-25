const mongoose = require("mongoose");
require("dotenv").config();
const dbConnector = require("../utils/dbConnector");

async function checkProfile() {
    const dbName = "41414546483437393441";
    try {
        const tenantConn = await dbConnector.getTenantConnection(dbName);
        const ProfileMaster = tenantConn.model("ProfileMaster", require("../models/masterShared").corporateProfileSchema);
        const profile = await ProfileMaster.findOne({});
        console.log("📄 Updated Profile Snapshot:");
        console.log(JSON.stringify(profile, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkProfile();
