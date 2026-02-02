const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
//const crypto = require('crypto');
const jwt = require("jsonwebtoken");
const cloudinary = require('cloudinary').v2;
const { formatMobile } = require("../middleware/validateAuth");

console.log("Runtime:", typeof process, process?.versions?.node);

// In-memory OTP store (Use Redis for production)
const otpStore = {}; 

// --- Private Helpers ---
function generateOtp(length = 6) {
    const otpGenerated = Math.floor(
        Math.pow(10, length - 1) +
        Math.random() * 9 * Math.pow(10, length - 1) // Multiplied by 9 to ensure 6 digits
    ).toString();
    console.log("Generated OTP:", otpGenerated);
    return otpGenerated;
}
const sendOTPExternal = async (mobile,otp) => {
    const response = await fetch("https://api.msg91.com/api/v5/otp", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authkey": process.env.MSG91_API_KEY
        },
        body: JSON.stringify({
            template_id: process.env.MSG91_TEMPLATE_ID,
            mobile,
            otp : otp, // <--- App generated OTP here
            otp_length: "6",
            otp_expiry: "5"
        })
        
        
    });
    const result = await response.json();
    return result;
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
        await sendOTPExternal(toMobile.with91,otp);
        return res.json({ success: true, message: "OTP sent" });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

exports.verifyOtp = (req, res) => {
    try {
        const { mobile, otp, purpose = "register" } = req.body;
        const toMobile = formatMobile(mobile); 
        const record = otpStore[toMobile.with91]; // Key is with +91

        if (!record) return res.status(400).json({ error: "No OTP sent to this number" });
        if (record.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });
        delete otpStore[toMobile.with91]; 
        
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
        
        const cleanMobile = String(mobile).replace(/\s+/g, "").replace(/^(\+91|91)/, "");
        const user = await Users.findOne({ userMobile: cleanMobile, userActive: true });
        
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const match = await bcrypt.compare(password, user.userPassword);
        if (!match) return res.status(401).json({ success: false, message: "Invalid password" });

        // Initialize variables
        let corpAdminId = null, 
            corporateId = null, 
            corporateName = "", 
            accessAllow = false, 
            corporatePAN = "", 
            corporateGST = "", 
            CorpProfileImage = "",
            corporateTagName = ""

        // NEW: Capture the user's personal profile image from the DB record
        const userProfileImage = user.userProfileImage || "";

        if (user.userRole === "CorpAdmin") {
            corpAdminId = user._id;
            corporateId = user.apiUrls?._id || null;
            corporateName = user.linkedCorporate?.corporateName;
            corporatePAN = user.linkedCorporate?.corporatePAN ;
            corporateGST = user.linkedCorporate?.corporateGST || "URN-Business";
            accessAllow = true;
            CorpProfileImage = user.linkedCorporate?.CorpProfileImage;
            corporateTagName=user.linkedCorporate?.corporateTagName || " Welcome You !";
        } else {
            corpAdminId = user.accessCorporate?.corpAdminId || null;
            corporateId = user.accessCorporate?.corporateId || null;
            accessAllow = user.accessCorporate?.accessAllow || false;

            if (corpAdminId) {
                const adminData = await Users.findById(corpAdminId).select("linkedCorporate").lean();
                corporateName = adminData?.linkedCorporate?.corporateName || "No company linked!";
                corporateTagName = adminData?.linkedCorporate?.corporateTagName || "Welcome you!";
                corporatePAN = adminData?.linkedCorporate?.corporatePAN || "";
                corporateGST = adminData?.linkedCorporate?.corporateGST || "Un-Registered";
                // Fetches corporate logo from the Admin's record
                CorpProfileImage = adminData?.linkedCorporate?.CorpProfileImage || "";
            }
        }

        const token = jwt.sign(
            { 
                userId: String(user._id), 
                userRole: user.userRole, 
                accessAllow: Boolean(accessAllow) 
            },
            process.env.JWT_SECRET,
            { expiresIn: "90d" }
        );

        return res.json({
            success: true,
            token,
            userSession: { 
                userId: user._id, 
                userDisplayName: user.userDisplayName,
                corporateTagName,
                userRole: user.userRole, 
                userProfileImage, // ✅ ADDED: This ensures the personal photo shows in the drawer
                accessAllow, 
                corpAdminId, 
                CorpProfileImage, // ✅ This ensures corporate logo shows in the header
                corporateId, 
                corporateName, 
                corporatePAN, 
                corporateGST 
            }
        });
    } catch (err) {
        console.error("Login Error:", err);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

exports.updateProfileImage = async (req, res) => {
    try {
        const Users = mongoose.model("Users");
        const { userId, imageBase64, fieldToUpdate } = req.body;

        // Requester info from JWT Middleware
        const requesterId = req.user.userId; 
        const requesterRole = req.user.userRole;

        // 1. Validation check for payload
        if (!userId || !fieldToUpdate || !imageBase64) {
            return res.status(400).json({ success: false, message: "Missing required data" });
        }

        let dbPath = "";
        
        // 2. Logic Check: Permissions & DB Path Selection
        if (fieldToUpdate === "CorpProfileImage") {
            // ONLY CorpAdmin can update Corporate Logo
            if (requesterRole !== "CorpAdmin") {
                return res.status(403).json({ success: false, message: "Access Denied: Admin only" });
            }
            dbPath = "linkedCorporate.CorpProfileImage";
        } 
        else if (fieldToUpdate === "userProfileImage") {
            // Users can ONLY update their own profile
            if (requesterId !== userId) {
                return res.status(403).json({ success: false, message: "Access Denied: Cannot update another user" });
            }
            dbPath = "userProfileImage";
        } else {
            return res.status(400).json({ success: false, message: "Invalid update field" });
        }

        // 3. Cloudinary Upload
        // Note: We check if the string already has the data prefix to avoid duplication
        const uploadStr = imageBase64.startsWith('data:image') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
        
        const uploadRes = await cloudinary.uploader.upload(uploadStr, {
            folder: fieldToUpdate === "CorpProfileImage" ? "corporate_logos" : "user_profiles",
            transformation: [{ width: 500, height: 500, crop: "limit", quality: "auto" }]
        });

        // 4. Database Update with casting to ObjectId
        const updatedUser = await Users.findByIdAndUpdate(
            new mongoose.Types.ObjectId(userId), 
            { $set: { [dbPath]: uploadRes.secure_url } },
            { new: true }
        ).select("-userPassword");

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        return res.json({
            success: true,
            message: "Image updated successfully",
            url: uploadRes.secure_url,
            field: fieldToUpdate
        });

    } catch (error) {
        console.error("Update Profile Image Error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// --- STEP 1: VERIFY IDENTITY ---
exports.verifyIdentity = async (req, res) => {
    try {
        // Aligned with Frontend Keys: aadhaar, pan, role
        const { aadhaar, pan, role } = req.body;
        const Users = mongoose.model("Users");

        if (!aadhaar || !role) {
            return res.status(400).json({ 
                success: false, 
                message: "Aadhaar and Role are required" 
            });
        }

        let user = null;

        if (role === "CorpAdmin") {
            // ADMIN REQUIREMENT: Both PAN and Aadhaar must match the record
            if (!pan) return res.status(400).json({ success: false, message: "PAN is required for Admin" });
            
            user = await Users.findOne({ 
                userAadhar: aadhaar,
                "linkedCorporate.corporatePAN": pan.toUpperCase() 
            });
        } else {
            // USER REQUIREMENT: Only Aadhaar
            user = await Users.findOne({ userAadhar: aadhaar });
        }

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: "Verification failed. Records do not match our system." 
            });
        }

        return res.json({ 
            success: true, 
            message: "Identity verified successfully" 
        });

    } catch (err) {
        console.error("Verification Error:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
};

// --- STEP 2: RESET PASSWORD ---
exports.resetPassword = async (req, res) => {
    try {
        const { aadhaar, newPassword } = req.body;
        const Users = mongoose.model("Users");

        if (!aadhaar || !newPassword) {
            return res.status(400).json({ success: false, message: "Aadhaar and New Password required" });
        }

        // HASH the new password before saving so login works
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        const updatedUser = await Users.findOneAndUpdate(
            { userAadhar: aadhaar },
            { $set: { userPassword: hashedPassword } },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        return res.json({ success: true, message: "Password updated successfully" });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
};