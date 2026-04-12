const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { Users, Corporates } = require("../models/UsersCorporates");
//const crypto = require('crypto');
const jwt = require("jsonwebtoken");
const cloudinary = require('cloudinary').v2;
const { formatMobile } = require("../middleware/validateAuth");
const { userService } = require("./leadServices");

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

        // 1. Check for existing user
        const existingUser = await Users.findOne({ userMobile: data.userMobile });
        if (existingUser) {
            return res.status(400).json({ success: false, message: "Mobile number already registered" });
        }

        // 2. Base Payload
        let newUserPayload = {
            userDisplayName: data.userDisplayName,
            userEmail: data.userEmail,
            userMobile: data.userMobile,
            userPassword: data.userPassword,
            userRole: data.userRole,
            userAadhar: data.userAadhar,
            userDoB: data.userDoB,
            userActive: true,
        };

        // 3. Logic for CorpAdmin
        if (data.userRole === "CorpAdmin") {
            newUserPayload.linkedCorporates = [{
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
            }];
        } 
        // 4. Logic for Sales/Project (Non-Admin)
        else {
            // Pulling directly from the data.accessCorporate object sent by frontend
            const accessData = data.accessCorporate || {};
            
            newUserPayload.accessCorporate = {
                corpAdminId: accessData.corpAdminId || null,
                corporateId: accessData.corporateId || null,
                accessAllow: false
            };

            // Safety Check: If IDs are missing, don't let Mongoose try to save a null ObjectId
            if (!newUserPayload.accessCorporate.corporateId) {
                return res.status(400).json({ success: false, message: "Corporate linking information is missing" });
            }
        }

        const newUser = new Users(newUserPayload);
        await newUser.save();

        return res.status(201).json({ 
            success: true, 
            message: "User registered successfully", 
            userId: newUser._id 
        });

    } catch (err) {
        console.error("Registration Error:", err);
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.checkUnique = async (req, res) => {
    try {
        const { userMobile, userAadhar, corporatePAN } = req.body;
        let exists = false;

        if (userMobile) exists = await Users.exists({ userMobile });
        else if (userAadhar) exists = await Users.exists({ userAadhar });
        else if (corporatePAN) exists = await Users.exists({ "linkedCorporates.corporatePAN": corporatePAN });

        return res.json({ exists: Boolean(exists) });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

exports.login = async (req, res) => {
    try {
        let { mobile, password } = req.body;

        if (!mobile) return res.status(400).json({ success: false, message: "Mobile required" });
        
        const cleanMobile = String(mobile).replace(/\s+/g, "").replace(/^(\+91|91)/, "");
        const user = await Users.findOne({ userMobile: cleanMobile, userActive: true });
        
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const match = await bcrypt.compare(password, user.userPassword);
        if (!match) return res.status(401).json({ success: false, message: "Invalid password" });

        // Initialize variables
        let corpAdminId = null, 
            corporateId = null, 
            activeCorp  = null,
            corporateName = "", 
            accessAllow = false, 
            corporatePAN = "", 
            corporateGST = "", 
            CorpProfileImage = "",
            corporateTagName = "";

        // NEW: Capture the user's personal profile image from the DB record
        const userProfileImage = user.userProfileImage || "";

        let corporates = [];
        if (user.userRole === "CorpAdmin") {
            corpAdminId = user._id;
            corporates = user.linkedCorporates || [];
            
            // Default to first corporate if none specified in request
            const targetCorpId = req.body.corporateId;
            activeCorp = targetCorpId 
                ? corporates.find(c => c._id.toString() === targetCorpId)
                : corporates[0];

            if (activeCorp) {
                corporateId = activeCorp._id;
                corporateName = activeCorp.corporateName;
                corporatePAN = activeCorp.corporatePAN;
                corporateGST = activeCorp.bankDetails?.corporateGST || "URN-Business";
                CorpProfileImage = activeCorp.CorpProfileImage;
                corporateTagName = activeCorp.corporateTagName || " Welcome You !";
            }
            accessAllow = true;
        } else {
            corpAdminId = user.accessCorporate?.corpAdminId || null;
            corporateId = user.accessCorporate?.corporateId || null;
            accessAllow = user.accessCorporate?.accessAllow || false;

            if (corporateId) {
                const adminData = await Users.findById(corpAdminId).select("linkedCorporates").lean();
                activeCorp = adminData?.linkedCorporates?.find(c => c._id.toString() === corporateId.toString());
                
                corporateName = activeCorp?.corporateName || "No company linked!";
                corporateTagName = activeCorp?.corporateTagName || "Welcome you!";
                corporatePAN = activeCorp?.corporatePAN || "";
                corporateGST = activeCorp?.bankDetails?.corporateGST || "Un-Registered";
                CorpProfileImage = activeCorp?.CorpProfileImage || "";
            }
        }

        const token = jwt.sign(
            { 
                userId: String(user._id), 
                userRole: user.userRole, 
                corpAdminId: corpAdminId ? String(corpAdminId) : null,
                corporateId: corporateId ? String(corporateId) : null,
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
                userProfileImage, 
                accessAllow, 
                CorpProfileImage, 
                corporateId, 
                corporateName, 
                corporatePAN, 
                corporateGST,
                corporateEmail: activeCorp?.corporateEmail || "",
                corporateAddress: activeCorp?.corporateAddress || "",
                corporateCity: activeCorp?.corporateCity || "",
                corporateState: activeCorp?.corporateState || "",
                corporatePin: activeCorp?.corporatePin || "",
                corporateMobile: activeCorp?.taxRegistrations?.corporateMobile || activeCorp?.corporateMobile || "",
                corpAdminId: String(corpAdminId),
                corporates: user.userRole === "CorpAdmin" 
                    ? user.linkedCorporates 
                    : (user.accessCorporate?.corporateId ? [activeCorp] : [])
            }
        });
    } catch (err) {
        console.error("Login Error:", err);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

exports.switchCorporate = async (req, res) => {
    try {
        const { corporateId } = req.body;
        const userId = req.user.userId;

        const user = await Users.findById(userId).populate("linkedCorporates");
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        let targetCorp;
        if (user.userRole === "CorpAdmin") {
            targetCorp = (user.linkedCorporates || []).find(c => c._id.toString() === corporateId);
        } else {
            // Sub-user can only switch if they have access (though usually they only have one)
            if (user.accessCorporate?.corporateId?.toString() === corporateId && user.accessCorporate?.accessAllow) {
                const adminData = await Users.findById(user.accessCorporate.corpAdminId).select("linkedCorporates").lean();
                targetCorp = adminData?.linkedCorporates?.find(c => c._id.toString() === corporateId);
            }
        }

        if (!targetCorp) {
            return res.status(403).json({ success: false, message: "Access denied to this corporate" });
        }

        // Return new session data
        const token = jwt.sign(
            { 
                userId: String(user._id), 
                userRole: user.userRole, 
                corpAdminId: user.userRole === "CorpAdmin" ? String(user._id) : String(user.accessCorporate.corpAdminId),
                corporateId: String(targetCorp._id),
                accessAllow: true 
            },
            process.env.JWT_SECRET,
            { expiresIn: "90d" }
        );

        return res.json({
            success: true,
            token, // Return new token too
            userSession: {
                userId: user._id,
                userDisplayName: user.userDisplayName,
                corporateTagName: targetCorp.corporateTagName || "Welcome you",
                userRole: user.userRole,
                userProfileImage: user.userProfileImage || "",
                accessAllow: true,
                CorpProfileImage: targetCorp.CorpProfileImage || "",
                corporateId: targetCorp._id,
                corporateName: targetCorp.corporateName,
                corporatePAN: targetCorp.corporatePAN,
                corporateGST: targetCorp.bankDetails?.corporateGST || "URN-Business",
                corporateEmail: targetCorp.corporateEmail || "",
                corporateAddress: targetCorp.corporateAddress || "",
                corporateCity: targetCorp.corporateCity || "",
                corporateState: targetCorp.corporateState || "",
                corporatePin: targetCorp.corporatePin || "",
                corporateMobile: targetCorp.taxRegistrations?.corporateMobile || targetCorp.corporateMobile || "",
                corpAdminId: user.userRole === "CorpAdmin" ? String(user._id) : String(user.accessCorporate.corpAdminId),
                corporates: user.userRole === "CorpAdmin" 
                    ? user.linkedCorporates 
                    : (user.accessCorporate?.corporateId ? [targetCorp] : [])
            }
        });
    } catch (err) {
        console.error("Switch Corp Error:", err);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

exports.updateProfileImage = async (req, res) => {
    try {
        const Users = mongoose.model("Users");
        const { userId, imageBase64, fieldToUpdate, corporateId } = req.body;

        const requesterId = req.user.userId; 
        const requesterRole = req.user.userRole;

        if (!userId || !fieldToUpdate || !imageBase64) {
            return res.status(400).json({ success: false, message: "Missing required data" });
        }

        let updatedUser;
        const uploadStr = imageBase64.startsWith('data:image') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
        const uploadRes = await cloudinary.uploader.upload(uploadStr, {
            folder: fieldToUpdate === "CorpProfileImage" ? "corporate_logos" : "user_profiles",
            transformation: [{ width: 500, height: 500, crop: "limit", quality: "auto" }]
        });

        if (fieldToUpdate === "CorpProfileImage") {
            if (requesterRole !== "CorpAdmin") {
                return res.status(403).json({ success: false, message: "Admin only" });
            }
            if (!corporateId) {
                return res.status(400).json({ success: false, message: "Corporate ID required" });
            }
            updatedUser = await Users.findOneAndUpdate(
                { _id: new mongoose.Types.ObjectId(userId), "linkedCorporates._id": new mongoose.Types.ObjectId(corporateId) },
                { $set: { "linkedCorporates.$.CorpProfileImage": uploadRes.secure_url } },
                { new: true }
            );
        } else if (fieldToUpdate === "userProfileImage") {
            if (requesterId !== userId) {
                return res.status(403).json({ success: false, message: "Cannot update another user" });
            }
            updatedUser = await Users.findByIdAndUpdate(
                new mongoose.Types.ObjectId(userId), 
                { $set: { userProfileImage: uploadRes.secure_url } },
                { new: true }
            );
        } else {
            return res.status(400).json({ success: false, message: "Invalid field" });
        }

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: "User or Corporate record not found" });
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
                "linkedCorporates.corporatePAN": pan.toUpperCase() 
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
//---Search and link corporate wit non-admin user
exports.searchlinkCorp = async (req, res) => {
  try {
    const { q } = req.query;
    const Users = mongoose.model("Users");

    if (!q || q.length < 3) {
      return res.status(400).json({ message: "Search query too short" });
    }

    const results = await Users.find({
      userRole: "CorpAdmin",
      $or: [
        { "linkedCorporates.corporateName": { $regex: q, $options: "i" } },
        { "linkedCorporates.corporatePAN": { $regex: q, $options: "i" } },
      ],
    })
    .limit(10)
    .select("linkedCorporates _id")
    .lean();

    const formattedResults = [];
    results.forEach(admin => {
        (admin.linkedCorporates || []).forEach(corp => {
            if (corp.corporateName.toLowerCase().includes(q.toLowerCase()) || 
                corp.corporatePAN?.toLowerCase().includes(q.toLowerCase())) {
                formattedResults.push({
                   _id: admin._id,
                   corporateId: corp._id,
                   corporateName: corp.corporateName,
                   corporateCity: corp.corporateCity,
                   corporateState: corp.corporateState,
                });
            }
        });
    });

    res.status(200).json(formattedResults);
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.apiUrlsConfigureSave = async (req, res) => {
  try {
    const result = await userService.apiUrlsConfigureSave(req.params.id, req.body);
    if (!result) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};