const mongoose = require("mongoose");
const { CorpDataMaster } = require("../models/CorpDataMaster");
const { TransactionMaster } = require("../models/TransactionMaster");

/**
 * 🧪 Test Script for Hub-and-Spoke Schemas
 * Validates the structure and cross-references.
 */
async function runTest() {
    console.log("🚀 Starting Schema Validation...");

    try {
        const corpAdminId = new mongoose.Types.ObjectId();
        const corporateId = new mongoose.Types.ObjectId();
        const clientId = new mongoose.Types.ObjectId();
        const leadId = new mongoose.Types.ObjectId();

        console.log("1. Testing CorpDataMaster structure...");
        const corpData = new CorpDataMaster({
            _id: corpAdminId,
            corporateData: {
                [corporateId.toString()]: {
                    clients: [{
                        _id: clientId,
                        name: "Test Client Corp",
                        pan: "ABCDE1234F",
                        gst: "27ABCDE1234F1Z5",
                        bank: {
                            bank_name: "ICICI Bank",
                            branch: "Mumbai Central",
                            account_number: "1234567890",
                            ifsc_code: "ICIC0001234"
                        },
                        billingAddress: {
                            line1: "123 Business Park",
                            city: "Mumbai",
                            state: "Maharashtra",
                            pincode: "400001"
                        }
                    }],
                    leads: [{
                        _id: leadId,
                        lead_no: 101,
                        clientId: clientId, // Linked to Client Master
                        productName: "Premium Cabin Hub"
                    }],
                    employees: [{
                        name: "John Doe",
                        addresses: {
                            permanent: { line1: "Home address", city: "Delhi", pincode: "110001" },
                            local: { line1: "Staff Quarter", city: "Mumbai", pincode: "400001" }
                        }
                    }],
                    users: [{
                        displayName: "Alice Sales",
                        mobile: "9876543210",
                        password: "hashed_password",
                        role: "Sales"
                    }]
                }
            }
        });

        const savedCorp = await corpData.validate();
        console.log("✅ CorpDataMaster Validation Passed!");

        console.log("2. Testing TransactionMaster structure...");
        const transMaster = new TransactionMaster({
            _id: corpAdminId,
            corporateData: {
                [corporateId.toString()]: {
                    salesQuotations: [{
                        leadId: leadId, // Linked to Lead in CorpData
                        document_no: "SQ-2025-001",
                        items: [{
                            description: "Main Unit",
                            quantity: 1,
                            rate: 50000,
                            taxable_amount: 50000,
                            total_amount: 59000
                        }],
                        totals: { grand_total: 59000 }
                    }]
                }
            }
        });

        await transMaster.validate();
        console.log("✅ TransactionMaster Validation Passed!");

        console.log("3. Testing conversion logic fields...");
        const po = {
            leadId: leadId,
            document_no: "PO-001",
            isConverted: true,
            conversionRef: {
                sourceId: new mongoose.Types.ObjectId(), // Imagine this is a PO ID
                sourceType: "PURCHASE_ORDER",
                bill_no: "BILL-999",
                bill_date: new Date()
            }
        };
        
        transMaster.corporateData.get(corporateId.toString()).purchaseOrders.push(po);
        await transMaster.validate();
        console.log("✅ Conversion Logic Validation Passed!");

    } catch (error) {
        console.error("❌ Validation Failed:", error.message);
        process.exit(1);
    }

    console.log("✨ All schemas are valid and consistent!");
    process.exit(0);
}

runTest();
