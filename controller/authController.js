const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { Users, Corporates } = require("../models/UsersCorporates");
const jwt = require("jsonwebtoken");
const cloudinary = require('cloudinary').v2;
const { formatMobile } = require("../middleware/validateAuth");
const { userService } = require("./leadServices");

const otpStore = {}; 

function generateOtp(length = 6) {
    return Math.floor(Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1)).toString();
}

const sendOTPExternal = async (mobile, otp, channel = "whatsapp") => {
    try {
        const payload = {
            template_id: channel === "whatsapp" ? (process.env.MSG91_WHATSAPP_TEMPLATE_ID || process.env.MSG91_TEMPLATE_ID) : process.env.MSG91_TEMPLATE_ID,
            mobile,
            otp,
            otp_length: "6",
            otp_expiry: "5"
        };
        
        // 🚀 WHATSAPP INTEGRATION: Add channel if specified
        if (channel === "whatsapp") payload.channel = "whatsapp";

        const response = await fetch("https://api.msg91.com/api/v5/otp", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authkey": process.env.MSG91_API_KEY },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        // 🚀 FALLBACK: If WhatsApp fails (e.g., not registered), try SMS
        if (channel === "whatsapp" && (data.type === "error" || !response.ok)) {
            console.warn("[OTP] WhatsApp failed, falling back to SMS...");
            return sendOTPExternal(mobile, otp, "sms");
        }
        
        return data;
    } catch (err) {
        console.error("[OTP] sendOTPExternal error:", err);
        return { type: "error", message: err.message };
    }
};

exports.healthCheck = async (req, res) => {
    const isDBConnected = mongoose.connection.readyState === 1;
    res.status(isDBConnected ? 200 : 503).json({ online: true, database: isDBConnected ? "connected" : "disconnected", timestamp: new Date() });
};

exports.sendOtp = async (req, res) => {
    try {
        const { mobile, purpose = "register" } = req.body;
        if (!mobile) return res.status(400).json({ error: "mobile required" });
        const otp = generateOtp(6);
        otpStore[formatMobile(mobile).with91] = { otp, expiresAt: Date.now() + 5 * 60 * 1000, purpose };
        await sendOTPExternal(formatMobile(mobile).with91, otp);
        return res.json({ success: true, message: "OTP sent" });
    } catch (err) { return res.status(500).json({ error: err.message }); }
};

exports.verifyOtp = (req, res) => {
    try {
        const { mobile, otp } = req.body;
        const record = otpStore[formatMobile(mobile).with91];
        if (!record || record.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });
        delete otpStore[formatMobile(mobile).with91];
        return res.json({ success: true });
    } catch (err) { return res.status(500).json({ error: err.message }); }
};

exports.register = async (req, res) => {
    try {
        const data = req.body;
        if (await Users.findOne({ userMobile: data.userMobile })) return res.status(400).json({ success: false, message: "Mobile already registered" });
        let newUserPayload = { ...data, userActive: true };

        if (data.userRole === "CorpAdmin") {
            newUserPayload.linkedCorporates = [{
                corporateName: data.corporateName, corporateEmail: data.corporateEmail, corporatePAN: data.corporatePAN, corporateActive: true, 
                corporateTagName: "Welcome", CorpProfileImage: "https://img.icons8.com/?size=100&id=E6RfmLvxU30R&format=png&color=000000"
            }];
        } else {
            if (!data.accessCorporate?.corporateId) return res.status(400).json({ success: false, message: "Corporate link required" });
            newUserPayload.accessCorporate = { 
                corpAdminId: data.accessCorporate.corpAdminId, 
                linkedCorporates: [{ corporateId: data.accessCorporate.corporateId, accessAllow: false }] 
            };
        }
        const newUser = new Users(newUserPayload);
        await newUser.save();
        return res.status(201).json({ success: true, message: "User registered", userId: newUser._id });
    } catch (err) { return res.status(500).json({ success: false, message: err.message }); }
};

exports.login = async (req, res) => {
    try {
        const { mobile, password, corporateId: targetCorpId } = req.body;
        const cleanMobile = String(mobile).replace(/\s+/g, "").replace(/^(\+91|91)/, "");
        const user = await Users.findOne({ userMobile: cleanMobile, userActive: true });
        if (!user || !(await bcrypt.compare(password, user.userPassword))) return res.status(401).json({ success: false, message: "Invalid credentials" });

        let corpAdminId = null, corporateId = null, activeCorp = null, corporateName = "", accessAllow = false;
        let corporates = [];

        if (user.userRole === "CorpAdmin") {
            corporates = user.linkedCorporates || [];
            if (!corporates.length) return res.status(403).json({ success: false, message: "No corporates registered" });
            activeCorp = targetCorpId ? corporates.find(c => String(c._id) === String(targetCorpId)) : corporates[0];
            corpAdminId = user._id; accessAllow = true;
        } else {
            const link = user.accessCorporate;
            if (!link || !link.corpAdminId) return res.status(403).json({ success: false, message: "User not linked with any corporate" });
            
            const admin = await Users.findById(link.corpAdminId).select("linkedCorporates").lean();
            if (!admin) return res.status(403).json({ success: false, message: "Admin not found" });

            // Resolve all allowed corporates for this user
            corporates = (admin.linkedCorporates || []).filter(c => 
                (link.linkedCorporates || []).some(lc => String(lc.corporateId) === String(c._id) && lc.accessAllow)
            ).map(c => ({ ...c, ownerAdminId: admin._id }));

            if (!corporates.length) return res.status(403).json({ success: false, message: "Access pending or no active links" });
            
            activeCorp = targetCorpId ? corporates.find(c => String(c._id) === String(targetCorpId)) : corporates[0];
            if (activeCorp) { 
                corpAdminId = admin._id; 
                accessAllow = true; 
            } else {
                console.warn(`[Login] No activeCorp found for Sales user link ${user._id}`);
            }
        }

        if (activeCorp) corporateId = activeCorp._id;
        
        // Populate all allowed corporate IDs for global use
        const corporateIds = corporates.map(c => String(c._id));

        const token = jwt.sign({ 
            userId: String(user._id), 
            userRole: user.userRole, 
            corpAdminId: String(corpAdminId), 
            corporateId: String(corporateId), 
            corporateIds, 
            corporateName: activeCorp?.corporateName || "",
            CorpProfileImage: activeCorp?.CorpProfileImage || "",
            accessAllow 
        }, process.env.JWT_SECRET, { expiresIn: "90d" });

        return res.json({ success: true, token, userSession: { 
            userId: user._id, userDisplayName: user.userDisplayName, userRole: user.userRole, accessAllow, corporateId, corporateName: activeCorp?.corporateName || "",
            corporatePAN: activeCorp?.corporatePAN || "", corporateTagName: activeCorp?.corporateTagName || "", CorpProfileImage: activeCorp?.CorpProfileImage || "",
            userProfileImage: user.userProfileImage || "", corporates 
        }});
    } catch (err) { return res.status(500).json({ success: false, message: "Internal Error" }); }
};

exports.switchCorporate = async (req, res) => {
    try {
        const { corporateId } = req.body;
        const user = await Users.findById(req.user.userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        let targetCorp = null, corpAdminId = null;
        if (user.userRole === "CorpAdmin") {
            targetCorp = (user.linkedCorporates || []).find(c => String(c._id) === String(corporateId));
            corpAdminId = user._id;
        } else {
            const link = user.accessCorporate;
            if (link && link.corpAdminId) {
                const isAllowed = (link.linkedCorporates || []).some(lc => String(lc.corporateId) === String(corporateId) && lc.accessAllow);
                if (isAllowed) {
                    const admin = await Users.findById(link.corpAdminId).select("linkedCorporates").lean();
                    targetCorp = (admin?.linkedCorporates || []).find(c => String(c._id) === String(corporateId));
                    corpAdminId = link.corpAdminId;
                }
            }
        }
        if (!targetCorp) return res.status(403).json({ success: false, message: "Access denied" });

        // Resolve all accessible corporates for the switched session
        let corporates = [];
        if (user.userRole === "CorpAdmin") {
            corporates = user.linkedCorporates || [];
        } else {
            const link = user.accessCorporate;
            const admin = await Users.findById(link?.corpAdminId).select("linkedCorporates").lean();
            corporates = (admin?.linkedCorporates || []).filter(c => 
                (link?.linkedCorporates || []).some(lc => String(lc.corporateId) === String(c._id) && lc.accessAllow)
            ).map(c => ({ ...c, ownerAdminId: admin?._id }));
        }

        const corporateIds = corporates.map(c => String(c._id));

        const token = jwt.sign({ 
            userId: String(user._id), 
            userRole: user.userRole, 
            corpAdminId: String(corpAdminId), 
            corporateId: String(targetCorp._id), 
            corporateIds,
            accessAllow: true 
        }, process.env.JWT_SECRET, { expiresIn: "90d" });
        return res.json({ success: true, token, userSession: { 
            userId: user._id, userDisplayName: user.userDisplayName, userRole: user.userRole, accessAllow: true, 
            corporateId: targetCorp._id, corporateName: targetCorp.corporateName, corporatePAN: targetCorp.corporatePAN, 
            corporateTagName: targetCorp.corporateTagName || "", CorpProfileImage: targetCorp.CorpProfileImage, 
            userProfileImage: user.userProfileImage || "", corporates 
        } });
    } catch (err) { return res.status(500).json({ success: false, message: "Internal Error" }); }
};

exports.checkUnique = async (req, res) => {
    try {
        const { userMobile, userAadhar, corporatePAN } = req.body;
        let exists = false;
        if (userMobile) exists = await Users.exists({ userMobile });
        else if (userAadhar) exists = await Users.exists({ userAadhar });
        else if (corporatePAN) exists = await Users.exists({ "linkedCorporates.corporatePAN": corporatePAN });
        return res.json({ exists: Boolean(exists) });
    } catch (err) { return res.status(500).json({ error: err.message }); }
};

exports.updateProfileImage = async (req, res) => {
    try {
        const { userId, imageBase64, fieldToUpdate, corporateId } = req.body;
        const uploadRes = await cloudinary.uploader.upload(imageBase64.startsWith('data:image') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`, { folder: "profiles" });
        if (fieldToUpdate === "CorpProfileImage") {
            await Users.findOneAndUpdate({ _id: new mongoose.Types.ObjectId(userId), "linkedCorporates._id": new mongoose.Types.ObjectId(corporateId) }, { $set: { "linkedCorporates.$.CorpProfileImage": uploadRes.secure_url } });
        } else {
            await Users.findByIdAndUpdate(new mongoose.Types.ObjectId(userId), { $set: { userProfileImage: uploadRes.secure_url } });
        }
        return res.json({ success: true, url: uploadRes.secure_url });
    } catch (err) { return res.status(500).json({ success: false }); }
};

exports.verifyIdentity = async (req, res) => {
    const { aadhaar, pan, role } = req.body;
    const q = role === "CorpAdmin" ? { userAadhar: aadhaar, "linkedCorporates.corporatePAN": pan.toUpperCase() } : { userAadhar: aadhaar };
    const user = await Users.findOne(q);
    return user ? res.json({ success: true }) : res.status(404).json({ success: false });
};

exports.resetPassword = async (req, res) => {
    const { aadhaar, newPassword } = req.body;
    const hash = await bcrypt.hash(newPassword, 10);
    const ok = await Users.findOneAndUpdate({ userAadhar: aadhaar }, { userPassword: hash });
    return ok ? res.json({ success: true }) : res.status(404).json({ success: false });
};

exports.searchlinkCorp = async (req, res) => {
    const q = req.body.q || req.query.q;
    if (!q || q.length < 3) return res.status(400).json({ message: "Short query" });
    const admins = await Users.find({ userRole: "CorpAdmin", $or: [{ userDisplayName: { $regex: q, $options: "i" } }, { "linkedCorporates.corporateName": { $regex: q, $options: "i" } }, { "linkedCorporates.corporatePAN": { $regex: q, $options: "i" } }] }).limit(10).lean();
    const out = [];
    admins.forEach(a => (a.linkedCorporates || []).forEach(c => out.push({ _id: a._id, corporateId: c._id, corporateName: c.corporateName, corporateCity: c.corporateCity, adminName: a.userDisplayName })));
    res.json(out);
};

exports.apiUrlsConfigureSave = async (req, res) => {
    const result = await userService.apiUrlsConfigureSave(req.params.id, req.body);
    res.json({ success: !!result, data: result });
};
