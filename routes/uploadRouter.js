const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const externalService = require("../utils/externalService");

// Simple local storage
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

router.post("/single", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const url = `/uploads/${req.file.filename}`;
    return res.json({ success: true, url });
});

router.post("/cloudinary", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        const leadFolder = req.body.lead_no || "general";
        
        const { ProfileMaster } = req.tenantModels || {};
        let customConfig = null;
        if (ProfileMaster) {
            const profile = await ProfileMaster.findOne({});
            if (profile?.apiUrls?.cloudinary?.isActive) {
                customConfig = profile.apiUrls.cloudinary;
            }
        }

        const result = await externalService.uploadMedia(req.file.path, {
            folder: `hipk/${req.tenantDbName}/leads/${leadFolder}`,
            resource_type: "auto",
            public_id: path.parse(req.file.originalname).name, 
            use_filename: true,
            unique_filename: false,
        }, customConfig);

        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        return res.json({ success: true, url: result.url, public_id: result.public_id });
    } catch (err) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
