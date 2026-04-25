const { MongoClient } = require("mongodb");
require("dotenv").config();

async function cleanAndMigrate() {
    const dbName = "41414546483437393441";
    const uri = process.env.MONGO_URI.replace(/\/[^/?]+(?=\?|$)/, `/${dbName}`);
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db(dbName);
        
        const legacyData = {
            corporateEmail: "sales@portakabin.in",
            corporateTagName: "U/O Hiresh iSearch,India",
            corporateActive: true,
            corporatePAN: "AAEFH4794A",
            ownershipType: "Proprietorship",
            locations: [{
                locationName: "Head Office",
                locationType: "HO",
                isRegisteredOffice: true,
                address: {
                    line1: "Shop # 11, 70E/6 Garhi, Amritpuri-B,Main Maket",
                    city: "East of Kailash",
                    district: "South Delhi",
                    state: "Delhi",
                    pincode: "110065",
                    country: "India"
                },
                bankDetails: {
                    bank_name: "ICICI BANK Limited",
                    branch: "GK 1, New Delhi",
                    account_number: "002905017764",
                    ifsc_code: "ICIC0000029",
                    account_type: "Current"
                },
                gstin: "07AAEFH4794A1ZI",
                contactPerson: "Suresh Chauhan",
                contactMobile: "8368333343",
                active: true
            }],
            authorizedSignatory: {
                name: "Suresh Chauhan",
                designation: "Partner",
                signature_label: "Authorised Signatory"
            },
            apiUrls: {
                mailConfigure: {
                    host: "imap.gmail.com",
                    port: 993,
                    secure: true,
                    auth: {
                        user: "histore.india@gmail.com",
                        pass: "immc cizu nlsg axud"
                    },
                    isActive: true
                },
                leadApis: [{
                    b2bName: "TradeIndia",
                    url: "https://www.tradeindia.com/utils/my_inquiry.html",
                    userid: "23134696",
                    profile_id: "102656695",
                    key: "abef1268bf0df7863ae259fb1c2b611d",
                    isActive: true
                }]
            },
            centralRegistrations: {
                cin: "", 
                tan: "",
                iec: "",
                msme_udyam: "UDYAM-DL-08-0031789",
                corporateMobile: "8368333343",
                corporateTelephone: "01204183625",
                Quotation_TC: "​1. Payment Terms\n​Supply of Materials: 100% advance payment is required prior to dispatch.\n​Installation Services: * 50% advance to initiate mobilization.\n​30% upon completion of the Roof and Wall structure.\n​20% (Balance) immediately upon handover of the project.\n​Deemed Acceptance: In the absence of a signed document, the receipt of the initial advance payment by the Seller shall be considered as the Buyer’s absolute and unconditional acceptance of all terms and conditions outlined herein.\n​2. Scope of Work & Exclusions\n​Civil Works: All civil works (foundation, plinth, leveling, etc.) are strictly outside the Seller's scope of work.\n​Utility Connections: The Seller shall provide internal \"Government supply points\" only. Connection to main external lines (Water, Electricity, and Sewage) remains the sole responsibility of the Buyer.\n​Site Facilities: The Buyer is responsible for providing the following at the site at their own cost:\n​Lifting equipment (Hydra/Cranes), water, electricity, and ladders.\n​Safe storage for materials delivered to the site.\n​Any necessary work permits or NOCs from local authorities/departments.\n​3. Logistics & Delivery\n​Timeline: Delivery of material shall be completed within 7–10 working days from the date of final layout approval and receipt of advance.\n​Freight: Quoted prices are Ex-Works. Freight, transit insurance, and unloading/uplifting charges are not included and will be billed at actuals.\n​Final BOQ: The final Bill of Quantities (BOQ) and billing will be adjusted based on the final on-site measurements and approved layout.\n​4. Statutory Levies\n​All Government taxes, GST, and other levies will be charged extra as per the prevailing rates at the time of invoicing.\n​5. Force Majeure\n​The Seller shall not be held liable for delays caused by unforeseen circumstances beyond their control, including but not limited to weather conditions, strikes, or government restrictions.\n​6. Jurisdiction\n​All disputes arising from this agreement are subject to the exclusive jurisdiction of the Courts of Delhi only."
            },
            updatedAt: new Date()
        };

        const collections = ["profileMaster", "profilemasters"];

        for (const colName of collections) {
            console.log(`🛠️ Processing ${colName}...`);
            // Step 1: Update data
            await db.collection(colName).updateOne({}, { $set: legacyData }, { upsert: true });
            // Step 2: Remove redundant fields
            await db.collection(colName).updateOne({}, { 
                $unset: { 
                    "apiUrls.tradeindia": "", 
                    "apiUrls.key": "" 
                } 
            });
        }

        console.log(`✅ Redundancy removed and data updated in both collections.`);
    } catch (err) {
        console.error("❌ Operation failed:", err.message);
    } finally {
        await client.close();
    }
}

cleanAndMigrate();
