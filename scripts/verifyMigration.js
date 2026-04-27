const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const { CorpDataMaster } = require("../models/CorpDataMaster");
const { TransactionMaster } = require("../models/TransactionMaster");

async function verify() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Verified Connection.");

        const corpMasters = await CorpDataMaster.find();
        const transMasters = await TransactionMaster.find();

        console.log("\n--- Migration Audit ---");
        console.log(`CorpDataMaster Documents: ${corpMasters.length}`);
        console.log(`TransactionMaster Documents: ${transMasters.length}`);

        for (const master of corpMasters) {
            console.log(`\nAdmin: ${master._id}`);
            for (let [corpId, data] of master.corporateData) {
                console.log(`  Corporate: ${corpId}`);
                console.log(`    Clients:    ${data.clients.length}`);
                console.log(`    Suppliers:  ${data.suppliers.length}`);
                console.log(`    Employees:  ${data.employees.length}`);
                console.log(`    Users:      ${data.users.length}`);
                console.log(`    Leads:      ${data.leads.length}`);
                console.log(`    Vouchers:   ${data.vouchers.length}`);
                console.log(`    Attendance: ${data.attendance.length}`);
            }
        }

        for (const master of transMasters) {
            console.log(`\nAdmin (Transactions): ${master._id}`);
            for (let [corpId, data] of master.corporateData) {
                console.log(`  Corporate: ${corpId}`);
                console.log(`    Quotations: ${data.salesQuotations.length}`);
                console.log(`    Invoices:   ${data.salesInvoices.length}`);
                console.log(`    PO:         ${data.purchaseOrders.length}`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

verify();
