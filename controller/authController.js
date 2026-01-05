const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
//const fetch = require('node-fetch');
const { formatMobile } = require("../middleware/validateAuth");
const cloudinary = require('cloudinary').v2;

// In-memory OTP store (Use Redis for production)
const otpStore = {}; 

// --- Private Helpers ---
function generateOtp(length = 6) {
    const num = crypto.randomInt(0, Math.pow(10, length));
    return String(num).padStart(length, "0");
}

const sendOTPExternal = async (mobile) => {
    const response = await fetch("https://api.msg91.com/api/v5/otp", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authkey": process.env.MSG91_API_KEY
        },
        body: JSON.stringify({
            template_id: process.env.MSG91_TEMPLATE_ID,
            mobile,
            otp_length: "6",
            otp_expiry: "5"
        })
    });
    return await response.json();
};

// --- Controller Exports ---

exports.healthCheck = async (req, res) => {
    const dbStatus = mongoose.connection.readyState;
    const isDBConnected = dbStatus === 1;
    res.status(isDBConnected ? 200 : 503).json({
        online: true,
        database: isDBConnected ? "connected" : "disconnected",
        timestamp: new Date()
    });
};

exports.sendOtp = async (req, res) => {
    try {
        const { mobile, purpose = "register" } = req.body;
        if (!mobile) return res.status(400).json({ error: "mobile required" });

        const otp = generateOtp(6);
        const expiresAt = Date.now() + 5 * 60 * 1000;
        const toMobile = formatMobile(mobile);

        otpStore[toMobile.with91] = { otp, expiresAt, purpose };
        await sendOTPExternal(toMobile.with91);

        return res.json({ success: true, message: "OTP sent" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

exports.verifyOtp = (req, res) => {
    try {
        const { mobile, otp, purpose = "register" } = req.body;
        const record = otpStore[mobile];

        if (!record) return res.status(400).json({ error: "No OTP sent to this number" });
        if (record.purpose !== purpose) return res.status(400).json({ error: "Purpose mismatch" });
        if (Date.now() > record.expiresAt) return res.status(400).json({ error: "OTP expired" });
        if (record.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });

        delete otpStore[mobile];
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

exports.register = async (req, res) => {
    try {
        const Users = mongoose.model("Users");
        const data = req.body;

        const existingUser = await Users.findOne({ userMobile: data.userMobile });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Mobile number already registered" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(data.userPassword, salt);

        let newUserPayload = {
            userDisplayName: data.userDisplayName,
            userEmail: data.userEmail,
            userMobile: data.userMobile,
            userPassword: hashedPassword,
            userRole: data.userRole,
            userAadhar: data.userAadhar,
            userDoB: data.userDoB,
            userActive: true,
        };

        if (data.userRole === "CorpAdmin") {
            newUserPayload.linkedCorporate = {
                corporateName: data.corporateName,
                corporateTagName: "Welcome",
                CorpProfileImage: "https://img.icons8.com/?size=100&id=E6RfmLvxU30R&format=png&color=000000",
                corporateEmail: data.corporateEmail,
                corporateAddress: data.corporateAddress,
                corporateCity: data.corporateCity,
                corporateDistrict: data.corporateDistrict,
                corporateState: data.corporateState,
                corporatePin: data.corporatePin,
                corporatePAN: data.corporatePAN,
                corporateGST: data.corporateGST,
                corporateActive: true
            };
        } else {
            const cleanCorpId = data.corporateId ? data.corporateId.trim() : null;
            newUserPayload.accessCorporate = {
                accessAllow: false,
                corpAdminId: null,
                corporateId: cleanCorpId === "None" ? null : cleanCorpId
            };
        }

        const newUser = new Users(newUserPayload);
        await newUser.save();

        return res.status(201).json({ success: true, message: "User registered", userId: newUser._id });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.checkUnique = async (req, res) => {
    try {
        const { userMobile, userAadhar, corporatePAN } = req.body;
        const Users = mongoose.model("Users");
        let exists = false;

        if (userMobile) exists = await Users.exists({ userMobile });
        else if (userAadhar) exists = await Users.exists({ userAadhar });
        else if (corporatePAN) exists = await Users.exists({ "linkedCorporate.corporatePAN": corporatePAN });

        return res.json({ exists: Boolean(exists) });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

exports.login = async (req, res) => {
    try {
        let { mobile, password } = req.body;
        const Users = mongoose.model("Users");

        if (!mobile) return res.status(400).json({ success: false, message: "Mobile required" });
        
        // Sanitize mobile input
        const cleanMobile = String(mobile).replace(/\s+/g, "").replace(/^(\+91|91)/, "");

        const user = await Users.findOne({ userMobile: cleanMobile, userActive: true });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const match = await bcrypt.compare(password, user.userPassword);
        if (!match) return res.status(401).json({ success: false, message: "Invalid password" });

        // Initialize variables properly
        let corpAdminId = null, 
            corporateId = null, 
            corporateName = "",
            corporateTagName="", 
            accessAllow = false, 
            corporatePAN = "", 
            corporateGST = "", 
            CorpProfileImage = "";
            userRole="";

        if (user.userRole === "CorpAdmin") {
            corpAdminId = user._id;
            corporateId= user.linkedCorporate?._id || null;
            corporateName = user.linkedCorporate?.corporateName || "";
            corporateTagName = user.linkedCorporate?.corporateTagName || "Welcome";
            corporatePAN = user.linkedCorporate?.corporatePAN || "";
            corporateGST = user.linkedCorporate?.corporateGST || "Un-Registered";
            accessAllow = true;
            CorpProfileImage = user.linkedCorporate?.CorpProfileImage || "";
            userRole= user.userRole || "Guest";
            
        } else {
            corpAdminId = user.accessCorporate?.corpAdminId || null;
            corporateId = user.accessCorporate?.corporateId || null;
            userRole= user.userRole || "Guest";
            corporateTagName = user.linkedCorporate?.corporateTagName || "Welcome";
            CorpProfileImage = user.linkedCorporate?.CorpProfileImage || "";
            accessAllow = user.accessCorporate?.accessAllow || false;

            if (corpAdminId) {
                const adminData = await Users.findById(corpAdminId).select("linkedCorporate").lean();
                corporateName = adminData?.linkedCorporate?.corporateName || "";
                corporateTagName = user.linkedCorporate?.corporateTagName || "Welcome";
                corporatePAN = adminData?.linkedCorporate?.corporatePAN || "";
                corporateGST = adminData?.linkedCorporate?.corporateGST || "Un-Registered";
                CorpProfileImage = adminData?.linkedCorporate?.CorpProfileImage || "";
            }
        }

        // SIGN TOKEN: Ensure the payload is a plain object
        const token = jwt.sign(
            { 
                userId: String(user._id), 
                userRole: user.userRole, 
                accessAllow: Boolean(accessAllow) 
            },
            process.env.JWT_SECRET,
            { expiresIn: "90d" }
        );

        // SEND RESPONSE: Ensure token is sent as a raw string
        return res.json({
            success: true,
            token, // This is a clean string
            userSession: { 
                userId: user._id, 
                userDisplayName: user.userDisplayName, 
                userRole: user.userRole, 
                accessAllow, 
                corpAdminId,
                corporateTagName, 
                CorpProfileImage, 
                corporateId, 
                corporateName, 
                corporatePAN, 
                corporateGST 
            }
        });
    } catch (err) {
        console.error("Login Error:", err); // Log the actual error for debugging
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

exports.updateProfileImage = async (req, res) => {
    const Users = mongoose.model("Users");
    try {
        const { userId, imageBase64, fieldToUpdate } = req.body;

        // 1. Extract IDs and Role
        const requesterId = (req.user._id || req.user.userId)?.toString();
        const targetUserId = userId?.toString();
        const requesterRole = req.user.userRole;

        if (!requesterId || !targetUserId) {
            return res.status(400).json({ success: false, message: "Invalid Request: Missing IDs" });
        }

        // 2. Define Permissions & Path
        let dbPath = "";
        const isAdmin = requesterRole === "CorpAdmin";
        const isSelf = requesterId === targetUserId;

        if (fieldToUpdate === "CorpProfileImage") {
            // ONLY CorpAdmin can update Corporate Image
            if (!isAdmin) {
                return res.status(403).json({ success: false, message: "Permission Denied: Admin only" });
            }
            dbPath = "linkedCorporate.CorpProfileImage";
        } else if (fieldToUpdate === "userProfileImage") {
            // CorpAdmin CAN update anyone's profile image
            // Other users CAN ONLY update their own
            if (!isAdmin && !isSelf) {
                return res.status(403).json({ success: false, message: "Permission Denied: Unauthorized access" });
            }
            dbPath = "userProfileImage";
        }

        // 3. Upload to Cloudinary
        // Ensure you have a check for imageBase64 content here
        const uploadRes = await cloudinary.uploader.upload(
            `data:image/jpeg;base64,${imageBase64}`,
            {
                folder: fieldToUpdate === "CorpProfileImage" ? "corporate_logos" : "user_profiles",
                transformation: [{ width: 500, height: 500, crop: "fill", gravity: "face" }]
            }
        );

        const finalUrl = uploadRes.secure_url;

        // 4. Update Database
        const updatedUser = await Users.findByIdAndUpdate(
            targetUserId,
            { $set: { [dbPath]: finalUrl } },
            { 
                new: true, 
                runValidators: false // Bypasses regex checks if the URL format differs slightly
            }
        ).select("-userPassword");

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            url: finalUrl,
            user: updatedUser
        });

    } catch (error) {
        console.error("Critical Update Error:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};