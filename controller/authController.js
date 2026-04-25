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

        // Resolve Tenant Config for MSG91
        let config = null;
        if (dbName) {
            try {
                const dbConnector = require("../utils/dbConnector");
                const { getTenantModels } = require("../models/TenantModels");
                const conn = await dbConnector.getTenantConnection(dbName);
                const { ProfileMaster } = getTenantModels(conn);
                const profile = await ProfileMaster.findOne({}).lean();
                config = profile?.apiUrls || null;
            } catch (terr) { console.log("⚠️ Tenant config skip:", terr.message); }
        }

        otpStore[formatted] = { otp, expiresAt: Date.now() + 5 * 60 * 1000, purpose };
        
        const result = await sendOTPExternal(formatted, otp, "whatsapp", config);
        
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
            console.log(`❌ OTP Verification FAILED for ${formatted}. Expected: ${record?.otp}, Got: ${otp}`);
            return res.status(400).json({ error: "Invalid OTP" });
        }
        
        console.log(`✅ OTP Verified successfully for ${formatted}`);
        delete otpStore[formatted];
        return res.json({ success: true });
    } catch (err) { return res.status(500).json({ error: err.message }); }
};

exports.searchlinkCorp = async (req, res) => {
    try {
        const { query } = req.body;
        const results = await userMaster.find(
            { 
                userRole: "CorpAdmin", 
                "linkedCorporates.corporateName": { $regex: new RegExp(query, "i") } 
            },
            { "linkedCorporates.$": 1, userDisplayName: 1, userEmail: 1 }
        ).lean();

        const flatResults = results.map(r => ({
            ...r.linkedCorporates[0],
            adminName: r.userDisplayName,
            _id: r._id, // Owner Admin ID
            dbName: r.linkedCorporates[0].dbName
        }));

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

        if (data.userRole === "CorpAdmin") {
            const pan = data.corporatePAN || "DEFAULT_PAN";
            const dob = data.userDoB || new Date();
            const dbName = tenantSecurity.encodeDbName(pan);
            const dbPassword = tenantSecurity.encodeDbPassword(pan, dob);
            
            newUserPayload.linkedCorporates = [{
                corporateName: data.corporateName,
                dbName,
                dbPassword,
                isActive: true
            }];
        } else {
            // 🚀 NEW: Resolve dbName from Corporate PAN for non-admins
            const pan = data.corporatePAN || data.accessCorporate?.corporatePAN;
            let targetDbName = data.accessCorporate?.dbName;

            if (pan) {
                targetDbName = tenantSecurity.encodeDbName(pan);
                // Verify this corporate actually exists in the Hub
                const exists = await userMaster.exists({ "linkedCorporates.dbName": targetDbName });
                if (!exists) {
                    return res.status(400).json({ success: false, message: "Invalid Corporate PAN. Company not found." });
                }
            }

            if (!targetDbName) {
                return res.status(400).json({ success: false, message: "Corporate PAN or dbName required for staff registration" });
            }

            newUserPayload.accessCorporate = { 
                dbName: targetDbName,
                locationId: data.accessCorporate?.locationId || null
            };
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
                console.log(`✅ Provisioned and Seeded DB ${dbName} for admin ${newUser.userDisplayName}`);
            } catch (perr) {
                console.error("Critical: Provisioning failed:", perr.message);
                // We proceed but log the error - the admin might need to retry setup from UI
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

        let activeCorp = null, accessAllow = false;
        let corporates = [];

        if (user.userRole === "CorpAdmin") {
            corporates = user.linkedCorporates || [];
            if (!corporates.length) return res.status(403).json({ success: false, message: "No corporates registered" });
            activeCorp = targetCorpId ? corporates.find(c => String(c._id) === String(targetCorpId)) : corporates[0];
            accessAllow = true;
        } else {
            const link = user.accessCorporate;
            if (!link || !link.dbName) return res.status(403).json({ success: false, message: "User not linked with any corporate" });
            
            // Find the admin who owns this dbName to resolve corporate labels
            const admin = await userMaster.findOne({ "linkedCorporates.dbName": link.dbName }).select("linkedCorporates").lean();
            if (!admin) return res.status(403).json({ success: false, message: "Admin not found" });

            activeCorp = admin.linkedCorporates.find(c => c.dbName === link.dbName);
            if (activeCorp) { 
                corporates = [activeCorp];
                accessAllow = true; 
            }
        }

        const corporateIds = corporates.map(c => String(c._id));

        const token = jwt.sign({ 
            userId: String(user._id), 
            userRole: user.userRole, 
            dbName: activeCorp?.dbName || null,
            corporateIds, 
            corporateName: activeCorp?.corporateName || "",
            userEmail: user.userEmail || "",
            userDisplayName: user.userDisplayName || "",
            accessAllow 
        }, process.env.JWT_SECRET, { expiresIn: "90d" });

        return res.json({ success: true, token, userSession: { 
            userId: user._id, userDisplayName: user.userDisplayName, userRole: user.userRole, accessAllow,
            dbName: activeCorp?.dbName || "",
            corporateName: activeCorp?.corporateName || "",
            userProfileImage: user.userProfileImage || "", corporates 
        }});
    } catch (err) { 
        console.error("Login Error:", err.message);
        return res.status(500).json({ success: false, message: err.message }); 
    }
};

exports.switchCorporate = async (req, res) => {
    try {
        const { corporateId } = req.body;
        const user = await userMaster.findById(req.user.userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        let targetCorp = null;
        if (user.userRole === "CorpAdmin") {
            targetCorp = (user.linkedCorporates || []).find(c => String(c._id) === String(corporateId));
        } else {
            const link = user.accessCorporate;
            if (link && link.dbName) {
                // For non-admins, targetCorp is their fixed dbName
                const admin = await userMaster.findOne({ "linkedCorporates.dbName": link.dbName }).select("linkedCorporates").lean();
                targetCorp = admin?.linkedCorporates.find(c => c.dbName === link.dbName);
            }
        }
        if (!targetCorp) return res.status(403).json({ success: false, message: "Access denied" });

        let corporates = [];
        if (user.userRole === "CorpAdmin") {
            corporates = user.linkedCorporates || [];
        } else {
            corporates = [targetCorp];
        }

        const corporateIds = corporates.map(c => String(c._id));

        const token = jwt.sign({ 
            userId: String(user._id), userRole: user.userRole,
            dbName: targetCorp.dbName,
            corporateIds, accessAllow: true,
            userEmail: user.userEmail || "",
            userDisplayName: user.userDisplayName || ""
        }, process.env.JWT_SECRET, { expiresIn: "90d" });

        return res.json({ success: true, token, userSession: { 
            userId: user._id, userDisplayName: user.userDisplayName, userRole: user.userRole, accessAllow: true, 
            dbName: targetCorp.dbName, corporateName: targetCorp.corporateName, 
            userProfileImage: user.userProfileImage || "", corporates 
        } });
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

exports.updateProfileImage = async (req, res) => {
    try {
        const { userId, imageBase64, fieldToUpdate } = req.body;
        const { ProfileMaster } = req.tenantModels || {};
        
        let customConfig = null;
        if (ProfileMaster) {
            const profile = await ProfileMaster.findOne({});
            if (profile?.apiUrls?.cloudinary?.isActive) {
                customConfig = profile.apiUrls.cloudinary;
            }
        }

        const fileSource = imageBase64.startsWith('data:image') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
        const uploadRes = await externalService.uploadMedia(fileSource, { folder: "profiles" }, customConfig);
        
        if (fieldToUpdate === "CorpProfileImage") {
             // Handle corporate profile image if needed, for now we just return the URL
             // If we want to save it to ProfileMaster, we could do:
             // if (ProfileMaster) await ProfileMaster.findOneAndUpdate({}, { $set: { corporateLogo: uploadRes.url } });
        } else {
            await userMaster.findByIdAndUpdate(new mongoose.Types.ObjectId(userId), { $set: { userProfileImage: uploadRes.url } });
        }
        return res.json({ success: true, url: uploadRes.url });
    } catch (err) { 
        console.error("🔴 Update Profile Image Error:", err);
        return res.status(500).json({ success: false, message: err.message }); 
    }
};

exports.verifyIdentity = async (req, res) => {
    try {
        const { aadhaar } = req.body;
        const user = await userMaster.findOne({ userAadhar: aadhaar, userActive: true });
        if (!user) return res.status(404).json({ success: false, message: "Aadhaar not found" });

        const mobile = user.userMobile;
        const otp = generateOtp(6);
        const mobileData = formatMobile(mobile);
        const formatted = mobileData.with91;

        // Resolve Tenant Config
        let config = null;
        const dbName = user.userRole === "CorpAdmin" ? user.linkedCorporates?.[0]?.dbName : user.accessCorporate?.dbName;
        if (dbName) {
            try {
                const dbConnector = require("../utils/dbConnector");
                const { getTenantModels } = require("../models/TenantModels");
                const conn = await dbConnector.getTenantConnection(dbName);
                const { ProfileMaster } = getTenantModels(conn);
                const profile = await ProfileMaster.findOne({}).lean();
                config = profile?.apiUrls || null;
            } catch (terr) { console.log("⚠️ Identity config skip:", terr.message); }
        }

        otpStore[formatted] = { otp, expiresAt: Date.now() + 5 * 60 * 1000, purpose: "reset" };
        
        const result = await sendOTPExternal(formatted, otp, "whatsapp", config);
        if (!result.success) {
            return res.status(500).json({ success: false, message: result.message || "Failed to send OTP" });
        }

        return res.json({ 
            success: true, 
            message: `Identity Verified. ${result.message}`,
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
        const ok = await userMaster.findOneAndUpdate({ userAadhar: aadhaar }, { userPassword: hash });
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
        const corporate = admin.linkedCorporates.id(corporateId);
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
        console.log(`🚀 Manual Provisioning for ${dbName}...`);
        const result = await mongoProvisioner.provisionDatabase(dbName, dbPassword);

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
