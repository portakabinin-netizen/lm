const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const userMaster = require("../models/userMaster");
const jwt = require("jsonwebtoken");
const { formatMobile } = require("../middleware/validateAuth");
const externalService = require("../utils/externalService");
const tenantSecurity = require("../utils/tenantSecurity");
const mongoProvisioner = require("../utils/mongoProvisioner");
const messagingService = require("../utils/messagingService");
const emailService = require("../utils/emailService");

const otpStore = {};

function generateOtp(length = 6) {
    return Math.floor(Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1)).toString();
}

const sendOTPExternal = messagingService.sendOTP;

exports.healthCheck = async (req, res) => {
    const isDBConnected = mongoose.connection.readyState === 1;
    res.status(isDBConnected ? 200 : 503).json({ online: true, database: isDBConnected ? "connected" : "disconnected", timestamp: new Date() });
};

exports.sendOtp = async (req, res) => {
    try {
        const { mobile, purpose = "register", dbName } = req.body;
        if (!mobile) return res.status(400).json({ error: "mobile required" });
        const otp = generateOtp(6);
        const mobileData = formatMobile(mobile);
        if (!mobileData) {
            return res.status(400).json({ error: "Invalid mobile number format. 10 digits required." });
        }
        const formatted = mobileData.with91;
        const cleanMobile = mobileData.plain; // Last 10 digits
        // 🚀 PROACTIVE CHECK: Don't send OTP if user is already registered
        if (purpose === "register") {
            const exists = await userMaster.exists({ userMobile: cleanMobile });
            if (exists) {
                return res.status(400).json({ error: "Mobile number already registered. Please Login." });
            }
        } else if (purpose === "reset") {
            const exists = await userMaster.exists({ userMobile: cleanMobile });
            if (!exists) {
                return res.status(404).json({ error: "Mobile number not found." });
            }
        }

        // 🚀 RESOLVE TENANT: Identify which corporate this user belongs to
        let targetDbName = dbName;
        if (!targetDbName) {
            const user = await userMaster.findOne({ userMobile: cleanMobile }).lean();
            if (user && user.accessCorporate && user.accessCorporate.length > 0) {
                targetDbName = user.accessCorporate[0].dbName;
            }
        }

        // 1. Try to fetch Tenant Config from MongoDB
        let config = null;
        if (targetDbName) {
            try {
                const dbConnector = require("../utils/dbConnector");
                const { getTenantModels } = require("../models/TenantModels");
                const conn = await dbConnector.getTenantConnection(targetDbName);
                const { ProfileMaster } = getTenantModels(conn);
                const profile = await ProfileMaster.findOne({}).lean();
                config = profile?.apiUrls || null;
            } catch (terr) {
                console.error(`⚠️ Tenant config lookup failed for ${targetDbName}:`, terr.message);
            }
        }

        // 2. 🚀 GLOBAL FALLBACK: If no tenant config or inactive, use .env (Registration/Reset ONLY)
        if (!config || !config.whatsapp_meta?.isActive) {
            config = {
                whatsapp_meta: {
                    token: process.env.WHATSAPP_TOKEN,
                    phone_number_id: process.env.PHONE_NUMBER_ID,
                    url: process.env.WHATSAPP_URL || "https://graph.facebook.com/v25.0",
                    templates: [
                        { purpose: "register", template_id: process.env.WHATSAPP_REGISTER_TEMPLATE || process.env.MSG91_WHATSAPP_TEMPLATE_ID || "hipk_singup" },
                        { purpose: "reset", template_id: process.env.WHATSAPP_RESET_TEMPLATE || process.env.MSG91_WHATSAPP_TEMPLATE_ID || "hipk_singup" }
                    ],
                    isActive: !!process.env.WHATSAPP_TOKEN
                },
                msg91: {
                    authkey: process.env.MSG91_API_KEY,
                    sender_id: process.env.MSG91_SENDER_ID || "portakabin",
                    template_id: process.env.MSG91_TEMPLATE_ID,
                    isActive: !!process.env.MSG91_API_KEY
                }
            };
        }

        otpStore[formatted] = { otp, expiresAt: Date.now() + 5 * 60 * 1000, purpose };

        const result = await sendOTPExternal(formatted, otp, "whatsapp", config, purpose);

        if (!result.success) {
            return res.status(500).json({ error: result.message || "Failed to send OTP" });
        }

        return res.json({
            success: true,
            message: result.message,
            toast: result.message
        });
    } catch (err) {
        console.error("🔴 sendOtp Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
};

exports.verifyOtp = (req, res) => {
    try {
        const { mobile, otp } = req.body;
        const formatted = formatMobile(mobile).with91;
        const record = otpStore[formatted];

        if (!record || record.otp !== otp) {

            return res.status(400).json({ error: "Invalid OTP" });
        }

        delete otpStore[formatted];
        return res.json({ success: true });
    } catch (err) { return res.status(500).json({ error: err.message }); }
};

exports.searchlinkCorp = async (req, res) => {
    try {
        const { query } = req.body;
        const searchCriteria = { userRole: "CorpAdmin" };
        
        if (query) {
            searchCriteria["accessCorporate.corporateName"] = { $regex: new RegExp(query, "i") };
        }
        
        const results = await userMaster.find(
            searchCriteria,
            { "accessCorporate": 1, userDisplayName: 1, userEmail: 1 }
        ).lean();

        const flatResults = [];
        results.forEach(r => {
            if (r.accessCorporate) {
                r.accessCorporate.forEach(corp => {
                    if (!query || (corp.corporateName && corp.corporateName.match(new RegExp(query, "i")))) {
                        flatResults.push({
                            ...corp,
                            corporateName: corp.corporateName || "Unknown",
                            adminName: r.userDisplayName,
                            _id: r._id, // Owner Admin ID
                            dbName: corp.dbName
                        });
                    }
                });
            }
        });

        return res.json({ success: true, data: flatResults });
    } catch (err) { return res.status(500).json({ error: err.message }); }
};

exports.register = async (req, res) => {
    try {
        const data = req.body;

        // 🚀 NORMALIZE: Ensure mobile is exactly 10 digits for consistent duplicate checking
        const cleanMobile = String(data.userMobile || "").replace(/\D/g, "").slice(-10);
        if (cleanMobile.length !== 10) return res.status(400).json({ success: false, message: "Invalid mobile number" });

        if (await userMaster.findOne({ userMobile: cleanMobile })) {
            return res.status(400).json({ success: false, message: "Mobile number already registered" });
        }

        let newUserPayload = { ...data, userMobile: cleanMobile, userActive: true };

        // Normalize: if frontend sends nested accessCorporate or linkedCorporate, pull it to top for logic
        const corpData = data.accessCorporate || data.linkedCorporate || {};

        if (data.userRole === "CorpAdmin") {
            const pan = corpData.corporatePAN || data.corporatePAN || "DEFAULT_PAN";

            const validation = require("../utils/validationHelper");
            if (!validation.isValidPAN(pan)) {
                return res.status(400).json({ success: false, message: "Valid 10-character PAN required for Corporate registration" });
            }

            const dbName = tenantSecurity.encodeDbName(pan);

            // 🚀 ISOLATION CHECK: One CorpAdmin per Database/PAN
            const existing = await userMaster.findOne({
                "accessCorporate.dbName": dbName,
                userRole: "CorpAdmin"
            });
            if (existing) {
                return res.status(400).json({
                    success: false,
                    message: `A Corporate with PAN ${pan} is already registered. Please Login or use a different PAN.`
                });
            }

            newUserPayload.accessCorporate = [{
                corporateName: corpData.corporateName || data.corporateName,
                corporatePAN: pan,
                dbName: dbName,
                locationId: null,
                isActive: true
            }];
        } else {
            const pan = corpData.corporatePAN || data.corporatePAN;
            let targetDbName = corpData.dbName || data.dbName;

            if (pan) {
                targetDbName = tenantSecurity.encodeDbName(pan);
                const owner = await userMaster.findOne({
                    "accessCorporate.dbName": targetDbName,
                    userRole: "CorpAdmin"
                }).lean();

                if (!owner) {
                    return res.status(400).json({ success: false, message: "Invalid Corporate PAN. Company not found." });
                }

                newUserPayload.accessCorporate = [{
                    corporateName: owner.accessCorporate?.[0]?.corporateName,
                    corporatePAN: pan,
                    dbName: targetDbName,
                    locationId: corpData.locationId || null,
                    isActive: true
                }];
            } else {
                return res.status(400).json({ success: false, message: "Corporate PAN required for staff registration" });
            }
        }

        const newUser = new userMaster(newUserPayload);
        await newUser.save();

        if (data.userRole === "CorpAdmin") {
            // 🚀 Trigger Remote Provisioning with Profile Seeding
            try {
                const pan = data.corporatePAN || "DEFAULT_PAN";
                const dbName = tenantSecurity.encodeDbName(pan);

                const profileData = {
                    corporateName: data.corporateName,
                    corporatePAN: pan,
                    corporateEmail: data.userEmail,
                    corporateActive: true
                };

                await mongoProvisioner.provisionDatabase(dbName, profileData);
            } catch (perr) {
                console.error("Critical: Provisioning failed:", perr.message);
                // We proceed but log the error - the admin might need to retry setup from UI
            }
        } else if (["Project", "Sales", "Finance"].includes(data.userRole)) {
            // 👷 Auto-create Employee Record for managed roles
            try {
                const dbConnector = require("../utils/dbConnector");
                const { getTenantModels } = require("../models/TenantModels");
                const targetDbName = newUserPayload.accessCorporate?.[0]?.dbName;
                
                if (targetDbName) {
                    const tenantConnection = await dbConnector.getTenantConnection(targetDbName);
                    const models = getTenantModels(tenantConnection);
                    
                    // Check if employee already exists
                    const existingEmp = await models.Employees.findOne({ mobile: cleanMobile });
                    if (!existingEmp) {
                        const newEmp = new models.Employees({
                            name: data.userDisplayName,
                            mobile: cleanMobile,
                            role: data.userRole,
                            active: true,
                            addresses: data.addresses,
                            employmentHistory: [{
                                joinDate: new Date(),
                                daily_rate: data.daily_rate || 0,
                                monthly_rate: data.monthly_rate || 0,
                                shiftStartTime: data.shiftStartTime || "08:00",
                                shiftHours: data.shiftHours || 8,
                                groupName: data.groupName || "MANG",
                                shiftName: data.shiftName || "Morning",
                                active: true,
                                notes: "Initial registration"
                            }]
                        });
                        await newEmp.save();
                        console.log(`Auto-created employee record for ${data.userDisplayName} in ${targetDbName}`);
                    }
                }
            } catch (empErr) {
                console.error("Failed to auto-create employee record:", empErr.message);
            }
        }
        // 💸 Auto-create Petty Cash Book on registration if allowed cash flow or has Project/Admin/Finance role
        if (newUser.allowCashFlow || ["CorpAdmin", "userAdmin", "Project", "Finance"].includes(newUser.userRole)) {
            try {
                const dbConnector = require("../utils/dbConnector");
                const { getTenantModels } = require("../models/TenantModels");
                const financeCtrl = require("./FinanceController");
                const targetDbName = newUserPayload.accessCorporate?.[0]?.dbName;
                if (targetDbName) {
                    const tenantConnection = await dbConnector.getTenantConnection(targetDbName);
                    const models = getTenantModels(tenantConnection);
                    await financeCtrl.ensureLedgerFolioInternal(models, {
                        name: `Petty Cash - ${newUser.userDisplayName}`,
                        group: "Cash-in-hand",
                        nature: "Dr",
                        refId: newUser._id,
                        refType: "User"
                    });
                    console.log(`Auto-created Petty Cash Book on registration for ${newUser.userDisplayName} in ${targetDbName}`);
                }
            } catch (pcErr) {
                console.error("Failed to auto-create Petty Cash Book on registration:", pcErr.message);
            }
        }

        return res.status(201).json({ success: true, message: "User registered", userId: newUser._id });
    } catch (err) {
        console.error("🔴 Registration Error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { mobile, password, corporateId: targetCorpId } = req.body;
        if (!mobile || !password) return res.status(400).json({ success: false, message: "Mobile and password required" });

        const cleanMobile = String(mobile || "").replace(/\D/g, "").slice(-10);
        const user = await userMaster.findOne({ userMobile: cleanMobile, userActive: true });

        if (!user || !user.userPassword) return res.status(401).json({ success: false, message: "Invalid credentials" });

        const isMatch = await bcrypt.compare(password, user.userPassword);
        if (!isMatch) return res.status(401).json({ success: false, message: "Invalid credentials" });

        const list = user.accessCorporate || [];
        if (list.length === 0) return res.status(403).json({ success: false, message: "User not linked with any corporate" });

        // If targetCorpId is provided, try to find it, else default to first
        let activeLink = list[0];
        if (targetCorpId) {
            activeLink = list.find(l => String(l._id) === String(targetCorpId) || l.dbName === targetCorpId) || list[0];
        }

        const token = jwt.sign({
            userId: String(user._id),
            userRole: user.userRole,
            dbName: activeLink.dbName,
            locationId: activeLink.locationId || null,
            corporateName: activeLink.corporateName || "",
            userEmail: user.userEmail || "",
            userDisplayName: user.userDisplayName || "",
            accessAllow: true
        }, process.env.JWT_SECRET, { expiresIn: "90d" });

        return res.json({
            success: true, token, userSession: {
                token,
                userId: String(user._id),
                userRole: user.userRole,
                dbName: activeLink.dbName,
                corporateName: activeLink.corporateName || "",
                corporatePAN: activeLink.corporatePAN || "",
                CorpProfileImage: activeLink.CorpProfileImage || "",
                locationId: activeLink.locationId || null,
                userDisplayName: user.userDisplayName,
                userProfileImage: user.userProfileImage || "",
                accessCorporate: list, // Return all so UI can switch
                accessAllow: true
            }
        });
    } catch (err) {
        console.error("Login Error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.unregisteredLogin = async (req, res) => {
    try {
        const { mobile, password } = req.body; // username=own mobile, password=ref mobile
        if (!mobile || !password) return res.status(400).json({ success: false, message: "Mobile and reference number required" });

        const cleanMobile = String(mobile || "").replace(/\D/g, "").slice(-10);
        const cleanRef = String(password || "").replace(/\D/g, "").slice(-10);

        // 1. Identify Database using reference number (Must be a non-admin user for unambiguous mapping)
        const refUser = await userMaster.findOne({ 
            userMobile: cleanRef, 
            userActive: true 
        });

        if (!refUser || !refUser.accessCorporate?.[0]?.dbName) {

            return res.status(404).json({
                success: false,
                message: "Reference number must be a registered staff member of the corporate."
            });
        }

        const dbConnector = require("../utils/dbConnector");
        const { getTenantModels } = require("../models/TenantModels");

        const clean10 = cleanMobile.slice(-10);
        const formats = [clean10, `0${clean10}`, `91${clean10}`, `+91${clean10}`];
        const query = { mobile: { $in: formats }, active: true };

        let role = "Client";
        let userData = { name: "Guest User", _id: cleanMobile, photo_url: "" };
        let finalDbName = null;
        let matchedCorp = null;

        // 🚀 Loop through all corporates linked to the reference user
        for (const corp of refUser.accessCorporate) {
            if (!corp.isActive) continue;

            const dbName = corp.dbName;
            const mobileRegex = new RegExp(cleanMobile.slice(-10).split('').join('\\D*') + '\\D*$');

            const tenantConnection = await dbConnector.getTenantConnection(dbName);
            const models = getTenantModels(tenantConnection);

            // 1. Search Staff (Try finding even if inactive first for debugging)
            const staff = await models.Employees.findOne({ mobile: mobileRegex }).lean();
            if (staff) {
                if (staff.active !== false) {
                    role = "Staff";
                    userData = { name: staff.name, _id: staff._id, photo_url: staff.photo_url };
                    finalDbName = dbName;
                    matchedCorp = corp;
                    break;
                }
            }

            // 2. Search Vendor
            const vendor = await models.Parties.findOne({ mobile: mobileRegex, type: "Supplier" }).lean();
            if (vendor) {
                role = "Vendor";
                userData = { name: vendor.name, _id: vendor._id, photo_url: "" };
                finalDbName = dbName;
                matchedCorp = corp;
                break;
            }

            // 3. Search Client (Parties)
            const client = await models.Parties.findOne({ mobile: mobileRegex, type: "Client" }).lean();
            if (client) {
                role = "Client";
                userData = { name: client.name, _id: client._id, photo_url: "" };
                finalDbName = dbName;
                matchedCorp = corp;
                break;
            }

            // 4. Search Client (Leads)
            const lead = await models.Leads.findOne({ sender_mobile: { $in: formats } }).lean();
            if (lead) {
                role = "Client";
                userData = { name: lead.sender_name, _id: lead._id, photo_url: "" };
                finalDbName = dbName;
                matchedCorp = corp;
                break;
            }
        }

        if (!finalDbName || !matchedCorp) {
            // Default to first corp if not found anywhere (Legacy behavior)
            finalDbName = refUser.accessCorporate[0].dbName;
            matchedCorp = refUser.accessCorporate[0];
        }

        // Generate a Authorized Token with the resolved role
        const token = jwt.sign({
            userId: String(userData._id),
            userRole: role,
            dbName: finalDbName,
            userDisplayName: userData.name,
            accessAllow: true,
            isGuest: true,
            ownMobile: cleanMobile,
            referenceMobile: cleanRef
        }, process.env.JWT_SECRET, { expiresIn: "90d" });


        return res.json({
            success: true,
            token,
            userSession: {
                token,
                userId: String(userData._id),
                userRole: role,
                dbName: finalDbName,
                corporateName: matchedCorp.corporateName || "",
                corporateTagName: matchedCorp.corporateTagName || "",
                userDisplayName: userData.name,
                CorpProfileImage: matchedCorp.CorpProfileImage || "",
                userProfileImage: userData.photo_url || "",
                referenceMobile: cleanRef, // 🚀 Added for "Call Supervisor" feature
                isGuest: true,
                accessAllow: true
            }
        });

    } catch (err) {
        console.error("Unregistered Login Error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.resolveGuestRole = async (req, res) => {
    try {
        const { dbName, ownMobile } = req.user;
        if (!dbName || !ownMobile) return res.status(400).json({ success: false, message: "Invalid guest token context" });

        const { getTenantModels } = require("../models/TenantModels");
        const dbConnector = require("../utils/dbConnector");
        const conn = await dbConnector.getTenantConnection(dbName);
        const models = getTenantModels(conn);

        // 📱 Handle multiple mobile formats for robust matching
        const clean10 = ownMobile.slice(-10);
        const formats = [clean10, `0${clean10}`, `91${clean10}`, `+91${clean10}`];
        const query = { mobile: { $in: formats }, active: true };

        let role = null;
        let userData = null;

        // 1. Search Staff
        userData = await models.Employees.findOne(query).lean();
        if (userData) role = "Staff";

        // 2. Search Vendor
        if (!userData) {
            userData = await models.Parties.findOne({ ...query, type: "Supplier" }).lean();
            if (userData) role = "Vendor";
        }

        // 4. Search Client (Leads)
        if (!userData) {
            userData = await models.Leads.findOne({ sender_mobile: { $in: formats } }).lean();
            if (userData) {
                role = "Client";
                userData.name = userData.sender_name;
            }
        }

        if (!userData) {
            role = "Client";
            userData = { name: "Guest User", _id: clean10 };
        }

        return res.json({
            success: true,
            role,
            userDisplayName: userData.name,
            userId: String(userData._id),
            userProfileImage: userData.photo_url || userData.userProfileImage || ""
        });
    } catch (err) {
        console.error("Guest Resolution Error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.switchCorporate = async (req, res) => {
    try {
        const { corporateId } = req.body;

        const user = await userMaster.findById(req.user.userId);
        if (!user) {

            return res.status(404).json({ success: false, message: "User not found" });
        }

        const list = user.accessCorporate || [];
        const activeLink = list.find(l => String(l._id) === String(corporateId) || l.dbName === corporateId);

        if (!activeLink) {
            console.log(`❌ [Switch] Target ${corporateId} not found in user's access list. Available:`, list.map(l => l.dbName));
            return res.status(403).json({ success: false, message: "Target corporate not found or unauthorized" });
        }


        const token = jwt.sign({
            userId: String(user._id),
            userRole: user.userRole,
            dbName: activeLink.dbName,
            locationId: activeLink.locationId || null,
            corporateName: activeLink.corporateName || "",
            userEmail: user.userEmail || "",
            userDisplayName: user.userDisplayName || "",
            accessAllow: true
        }, process.env.JWT_SECRET, { expiresIn: "90d" });

        return res.json({
            success: true, token, userSession: {
                token,
                userId: String(user._id),
                userRole: user.userRole,
                dbName: activeLink.dbName,
                corporateName: activeLink.corporateName || "",
                corporatePAN: activeLink.corporatePAN || "",
                CorpProfileImage: activeLink.CorpProfileImage || "",
                locationId: activeLink.locationId || null,
                userDisplayName: user.userDisplayName,
                userProfileImage: user.userProfileImage || "",
                accessCorporate: list,
                accessAllow: true
            }
        });
    } catch (err) {
        console.error("🔴 Switch Corporate Error:", err);
        return res.status(500).json({ success: false, message: "Internal Error" });
    }
};

exports.checkUnique = async (req, res) => {
    try {
        const { userMobile, userAadhar } = req.body;
        let exists = false;
        if (userMobile) exists = await userMaster.exists({ userMobile });
        else if (userAadhar) exists = await userMaster.exists({ userAadhar });
        return res.json({ exists: Boolean(exists) });
    } catch (err) { return res.status(500).json({ error: err.message }); }
};

// Removed duplicate updateProfileImage

// Consolidating getProfileHistory into the unified export at the bottom of the file

exports.verifyIdentity = async (req, res) => {
    try {
        const { aadhaar, role, pan } = req.body;
        const user = await userMaster.findOne({ userAadhar: aadhaar, userActive: true });

        if (!user) return res.status(404).json({ success: false, message: "Identity not found. Please check Aadhaar." });

        // 1. Check Role Match
        // "User" is a catch-all for all types of users (including admins).
        // "CorpAdmin" is specific and requires PAN check.
        if (role === "CorpAdmin" && user.userRole !== "CorpAdmin") {
            return res.status(403).json({ success: false, message: "This account does not have Admin privileges." });
        }

        // 2. Check PAN Match for CorpAdmin
        if (role === "CorpAdmin" && pan) {
            const hasPan = (user.accessCorporate || []).some(c => c.corporatePAN === pan);
            if (!hasPan) {
                return res.status(403).json({ success: false, message: "Corporate PAN mismatch for this Admin identity." });
            }
        }

        const mobile = user.userMobile;
        const otp = generateOtp(6);
        const mobileData = formatMobile(mobile);
        const formatted = mobileData.with91;
        const cleanMobile = mobileData.plain;

        // 1. Try to fetch Tenant Config from MongoDB
        let config = null;
        let dbName = req.tenantDbName || req.user?.dbName || (user.accessCorporate?.[0]?.dbName);

        if (dbName) {
            try {
                const dbConnector = require("../utils/dbConnector");
                const { getTenantModels } = require("../models/TenantModels");
                const conn = await dbConnector.getTenantConnection(dbName);
                const { ProfileMaster } = getTenantModels(conn);
                const profile = await ProfileMaster.findOne({}).lean();
                config = profile?.apiUrls || null;
            } catch (terr) {
                console.error(`⚠️ Identity tenant config lookup failed for ${dbName}:`, terr.message);
            }
        }

        // 2. 🚀 GLOBAL FALLBACK: If no tenant config or inactive, use .env (Registration/Reset ONLY)
        if (!config || !config.whatsapp_meta?.isActive) {
            config = {
                whatsapp_meta: {
                    token: process.env.WHATSAPP_TOKEN,
                    phone_number_id: process.env.PHONE_NUMBER_ID,
                    url: process.env.WHATSAPP_URL || "https://graph.facebook.com/v25.0",
                    templates: [
                        { purpose: "register", template_id: process.env.WHATSAPP_REGISTER_TEMPLATE || process.env.MSG91_WHATSAPP_TEMPLATE_ID || "hipk_singup" },
                        { purpose: "reset", template_id: process.env.WHATSAPP_RESET_TEMPLATE || process.env.MSG91_WHATSAPP_TEMPLATE_ID || "hipk_singup" }
                    ],
                    isActive: !!process.env.WHATSAPP_TOKEN
                },
                msg91: {
                    authkey: process.env.MSG91_API_KEY,
                    sender_id: process.env.MSG91_SENDER_ID || "portakabin",
                    template_id: process.env.MSG91_TEMPLATE_ID,
                    isActive: !!process.env.MSG91_API_KEY
                }
            };
        }

        otpStore[formatted] = { otp, expiresAt: Date.now() + 5 * 60 * 1000, purpose: "reset" };

        const result = await sendOTPExternal(formatted, otp, "whatsapp", config, "register");
        if (!result.success) {
            return res.status(500).json({ success: false, message: result.message || "Failed to send OTP" });
        }

        return res.json({
            success: true,
            message: `Identity Verified. ${result.message}`,
            tempMobile: mobile,
            toast: result.message
        });
    } catch (err) {
        console.error("🔴 Verify Identity Error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { aadhaar, newPassword } = req.body;
        const hash = await bcrypt.hash(newPassword, 10);
        const ok = await userMaster.findOneAndUpdate({ userAadhar: aadhaar, userActive: true }, { userPassword: hash });
        return ok ? res.json({ success: true }) : res.status(404).json({ success: false });
    } catch (err) {
        console.error("🔴 Reset Password Error:", err);
        return res.status(500).json({ success: false });
    }
};

/**
 * 🛠️ apiUrlsConfigureSave
 * Saves Integration URLs (SMS, Whatsapp) and Tenant Config (Mongo, Cloudinary)
 */
exports.apiUrlsConfigureSave = async (req, res) => {
    try {
        const { ProfileMaster } = req.tenantModels;
        if (!ProfileMaster) return res.status(400).json({ success: false, message: "Tenant models not initialized" });

        const { apiUrls } = req.body;
        await ProfileMaster.findOneAndUpdate({}, { $set: { apiUrls } }, { upsert: true, new: true });

        res.json({ success: true, message: "Configurations saved to tenant database" });
    } catch (err) {
        console.error("apiUrlsConfigureSave Error:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * 🛠️ provisionTenant
 * Manually trigger the creation of a tenant database and user.
 * Restricted to CorpAdmin.
 */
exports.provisionTenant = async (req, res) => {
    try {
        const { userId, userRole } = req.user;
        const { corporateId } = req.body;

        if (userRole !== "CorpAdmin") {
            return res.status(403).json({ success: false, message: "Unauthorized. Role must be CorpAdmin." });
        }

        // 1. Fetch Admin from Main Database
        const admin = await userMaster.findById(userId);
        if (!admin) return res.status(404).json({ success: false, message: "Admin user not found" });

        // 2. Locate Corporate Slot
        const corporate = admin.accessCorporate.id(corporateId);
        if (!corporate) return res.status(404).json({ success: false, message: "Corporate slot not found" });

        // 3. Generate Credentials if missing
        let { dbName, dbPassword } = corporate.apiUrls?.tenantDb || {};

        if (!dbName || !dbPassword) {
            const pan = corporate.corporatePAN || "DEFAULT_PAN";
            const dob = admin.userDoB || new Date(); // Use admin DOB as fallback

            dbName = tenantSecurity.encodeDbName(pan);
            dbPassword = tenantSecurity.encodeDbPassword(pan, dob);

            if (!corporate.apiUrls) corporate.apiUrls = {};
            corporate.apiUrls.tenantDb = { dbName, dbPassword, dbHost: "" };
            await admin.save();
        }

        // 4. Trigger Provisioning

        const profileData = {
            corporateName: corporate.corporateName,
            corporatePAN: corporate.corporatePAN,
            corporateEmail: admin.userEmail,
            corporateActive: true
        };

        const result = await mongoProvisioner.provisionDatabase(dbName, profileData);

        res.json({
            success: true,
            message: "Infrastructure provisioned successfully",
            dbName: result.dbName
        });

    } catch (err) {
        console.error("Provision Tenant Error:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * 📲 sendMessage
 * Generic endpoint to send SMS/WhatsApp using tenant configuration.
 */
exports.sendMessage = async (req, res) => {
    try {
        const { mobile, email, message, type = "whatsapp", templateId, placeholders, pdfUrl, subject } = req.body;
        const { ProfileMaster } = req.tenantModels;
        const profile = await ProfileMaster.findOne({}).lean();
        const config = profile?.apiUrls || null;

        let result;
        const finalMessage = pdfUrl ? `${message || 'Here is your document'}\n\n📄 View PDF: ${pdfUrl}` : message;

        if (type === "whatsapp") {
            const tid = templateId || config?.msg91?.whatsapp_template_id;
            const finalPlaceholders = pdfUrl
                ? { ...placeholders, pdf_url: pdfUrl }
                : (placeholders || { message: finalMessage });

            result = await messagingService.sendWhatsApp(mobile, tid, finalPlaceholders, config);
        } else if (type === "email") {
            if (!email) return res.status(400).json({ error: "Email address required for email type" });
            const emailBody = pdfUrl
                ? `${message || 'Please find the document attached or linked below.'}<br><br><a href="${pdfUrl}">View PDF Document</a>`
                : message;
            result = await emailService.sendEmail(email, subject || "Message from HIPK", emailBody, config);
        } else {
            result = await messagingService.sendSMS(mobile, finalMessage, config);
        }

        if (!result.success) return res.status(500).json({ error: result.message });
        return res.json({ success: true, message: result.message });
    } catch (err) {
        console.error("🔴 sendMessage Error:", err.message);
        return res.status(500).json({ error: err.message });
    }
};

/**
 * 🖼️ updateProfileImage
 * Uploads a profile image (User or Corporate) to Cloudinary.
 * No DB storage of the URL; we fetch directly from Cloudinary folders.
 */
exports.updateProfileImage = async (req, res) => {
    try {
        const { userId, fieldToUpdate, imageBase64 } = req.body;
        const dbName = req.tenantDbName || req.user?.dbName;
        const { userRole, userId: requesterId } = req.user;

        if (!imageBase64) return res.status(400).json({ success: false, message: "No image data provided" });
        if (!dbName) return res.status(400).json({ success: false, message: "Tenant context missing" });

        // 🛡️ PERMISSION CHECK
        if (fieldToUpdate === "userProfileImage") {
            if (requesterId.toString() !== userId?.toString()) {
                return res.status(403).json({ success: false, message: "You can only update your own profile image" });
            }
        } else if (fieldToUpdate === "CorpProfileImage" && userRole !== "CorpAdmin") {
            return res.status(403).json({ success: false, message: "Unauthorized: Only CorpAdmin can update corporate profile" });
        }

        let finalUrl = imageBase64;

        // If it's not an existing URL, we upload it
        if (!imageBase64.startsWith('http')) {
            const folder = fieldToUpdate === "userProfileImage" ? `user-profile/${userId}` : "corp-profile";
            const folderPath = `hipk/${dbName}/${folder}`;

            const { ProfileMaster } = req.tenantModels;
            const profile = await ProfileMaster.findOne({}).lean();
            const config = profile?.apiUrls?.cloudinary;

            const fileSource = imageBase64.startsWith('data:image') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
            const result = await externalService.uploadImage(fileSource, folderPath, config);
            finalUrl = result.secure_url || result.url;
        }

        // Save URL to MongoDB to persist choice natively
        if (fieldToUpdate === "userProfileImage") {
            await userMaster.findByIdAndUpdate(userId, { userProfileImage: finalUrl });
        } else if (fieldToUpdate === "CorpProfileImage") {
            await userMaster.updateMany(
                { "accessCorporate.dbName": dbName },
                { $set: { "accessCorporate.$[elem].CorpProfileImage": finalUrl } },
                { arrayFilters: [{ "elem.dbName": dbName }] }
            );
        }

        res.json({
            success: true,
            message: "Profile image updated successfully",
            url: finalUrl
        });

    } catch (err) {
        console.error("🔴 Update Profile Image Error:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * 🗑️ deleteProfileImage
 * Deletes an image from Cloudinary
 */
exports.deleteProfileImage = async (req, res) => {
    try {
        const { publicId, url } = req.body;
        const dbName = req.tenantDbName || req.user?.dbName;
        if (!dbName) return res.status(400).json({ error: "Tenant context missing" });

        const { ProfileMaster } = req.tenantModels;
        const profile = await ProfileMaster.findOne({}).lean();
        const config = profile?.apiUrls?.cloudinary;

        let pid = publicId;
        if (!pid && url) {
            // Extract public_id from Cloudinary URL if not provided
            const parts = url.split('/');
            const filename = parts.pop();
            const folderPath = parts.slice(parts.indexOf('upload') + 2).join('/');
            pid = folderPath ? `${folderPath}/${filename.split('.')[0]}` : filename.split('.')[0];
        }

        if (!pid) return res.status(400).json({ error: "No public_id or url provided" });

        await externalService.deleteMedia(pid, config);
        res.json({ success: true, message: "Image deleted" });
    } catch (err) {
        console.error("🔴 Delete Profile Image Error:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * 📂 getProfileHistory
 * Fetches the list of images from the user's specific profile folder.
 */
exports.getProfileHistory = async (req, res) => {
    try {
        const { type } = req.query;
        let { userId } = req.query;
        if (userId === "undefined" || !userId) {
            userId = req.user?.userId;
        }
        const dbName = req.tenantDbName || req.user?.dbName;

        if (!dbName) return res.status(400).json({ success: false, message: "Tenant context missing" });
        if (!userId && type === "user") return res.status(400).json({ success: false, message: "UserId required for user profile history" });

        // 🚀 FOLDER MAPPING FIX: Check both naming conventions
        const subFolder = type === "user" ? `user-profile/${userId}` : "corp-profile";
        const legacySubFolder = type === "user" ? `userProfile/${userId}` : "corporateProfile";
        
        const folderPath = `hipk/${dbName}/${subFolder}`;
        const legacyFolderPath = `hipk/${dbName}/${legacySubFolder}`;

        const { ProfileMaster } = req.tenantModels || {};
        let config = null;
        if (ProfileMaster) {
            const profile = await ProfileMaster.findOne({}).lean();
            config = profile?.apiUrls?.cloudinary || null;
        }

        console.log(`[getProfileHistory] Fetching for ${folderPath} and ${legacyFolderPath}...`);
        
        // Fetch from both folders and merge
        const [resources, legacyResources] = await Promise.all([
            externalService.fetchFolderMedia(folderPath, config).catch(() => []),
            externalService.fetchFolderMedia(legacyFolderPath, config).catch(() => [])
        ]);

        const mergedResources = [...resources, ...legacyResources].sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        // Fetch actual active DB profile image
        let activeUrl = null;
        if (mongoose.Types.ObjectId.isValid(userId)) {
            const me = await userMaster.findById(userId).lean();
            if (me) {
                activeUrl = type === "user" 
                    ? me.userProfileImage 
                    : me.accessCorporate?.find(c => c.dbName === dbName)?.CorpProfileImage;
            }
        }

        res.json({ success: true, resources: mergedResources, activeUrl });

    } catch (err) {
        console.error("🔴 Profile History Error:", err.message);
        res.status(500).json({ success: false, message: err.message });
    }
};
