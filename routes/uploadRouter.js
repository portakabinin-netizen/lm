// routes/uploadRouter.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const router = express.Router();

// Simple local storage; in production use S3 or cloud storage
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        // 🚀 PRESERVE ORIGINAL NAME (includes leadId and timestamp)
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const cloudinary = require("cloudinary").v2;

router.post("/single", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const url = `/uploads/${req.file.filename}`; // serve via static middleware in server.js
    return res.json({ success: true, url });
});

router.post("/cloudinary", upload.single("file"), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        const folder = req.body.folder || "general";
        
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: `hipk/leads/${folder}`,
            resource_type: "auto",
            public_id: path.parse(req.file.originalname).name, // Use the name without extension
            use_filename: true,
            unique_filename: false,
        });

        // Clean up local file after upload
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

        return res.json({ success: true, url: result.secure_url, public_id: result.public_id });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
// JavaScript source code
