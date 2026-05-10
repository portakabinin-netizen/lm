const fs = require('fs');
const path = require('path');
const https = require('https');
const cloudinary = require('cloudinary').v2;

// Simple helper to download a file from a URL
const downloadFile = (url, destPath) => {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download file, status code: ${response.statusCode}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => {}); // Delete file on error
            reject(err);
        });
    });
};

exports.sendMessage = async (req, res) => {
    try {
        const { senderName, senderId, text, type, mediaUrl, mediaType, public_id, isOneToOne, receiverId } = req.body;
        const { Messages } = req.tenantModels;
        
        if (!Messages) {
            return res.status(400).json({ success: false, message: "Tenant models not initialized" });
        }

        let messageData = {
            senderName,
            senderId,
            text,
            type,
            status: 'unseen',
            mediaUrl,
            mediaType,
            isOneToOne,
            receiverId
        };

        // If message has media and was uploaded to Cloudinary, download it to server and delete from cloud
        if (mediaUrl && public_id) {
            try {
                const uploadDir = path.join(__dirname, '..', 'uploads');
                if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

                const fileName = `${Date.now()}-${path.basename(mediaUrl)}`;
                const localPath = path.join(uploadDir, fileName);

                console.log(`Downloading ${mediaUrl} to ${localPath}...`);
                await downloadFile(mediaUrl, localPath);

                // Update message with local path
                messageData.localPath = `/uploads/${fileName}`;
                messageData.mediaUrl = `/uploads/${fileName}`; // Point to local path
                
                // Delete from Cloudinary
                console.log(`Deleting ${public_id} from Cloudinary...`);
                await cloudinary.uploader.destroy(public_id);
                messageData.isCloudDeleted = true;
            } catch (err) {
                console.error("🔴 Media processing error:", err.message);
                // We still save the message even if cloud removal fails, but it will keep the original mediaUrl
            }
        }

        const msg = new Messages(messageData);
        await msg.save();

        // Emit to socket room for instant delivery
        if (req.io && req.user && req.user.dbName) {
            req.io.to(req.user.dbName).emit('newMessage', msg);
        }

        return res.status(201).json({ success: true, data: msg });
    } catch (err) {
        console.error("🔴 sendMessage Error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.getMessages = async (req, res) => {
    try {
        const { Messages } = req.tenantModels;
        if (!Messages) return res.status(400).json({ success: false, message: "Tenant models not initialized" });

        const { isOneToOne, receiverId, senderId } = req.query;
        
        let query = {};
        if (isOneToOne === 'true') {
            query = {
                isOneToOne: true,
                $or: [
                    { senderId, receiverId },
                    { senderId: receiverId, receiverId: senderId }
                ]
            };
        } else {
            query = { isOneToOne: { $ne: true } }; // Public chat
        }

        const messages = await Messages.find(query).sort({ createdAt: 1 }).limit(100);
        return res.json({ success: true, data: messages });
    } catch (err) {
        console.error("🔴 getMessages Error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.markAsSeen = async (req, res) => {
    try {
        const { Messages } = req.tenantModels;
        if (!Messages) return res.status(400).json({ success: false, message: "Tenant models not initialized" });

        const { messageIds } = req.body;
        console.log(`📩 [markAsSeen] Received seen report for ${messageIds?.length} messages`);
        
        await Messages.updateMany(
            { _id: { $in: messageIds } },
            { $set: { status: 'seen' } }
        );

        // Emit to socket room so sender knows messages were seen
        if (req.io && req.user && req.user.dbName) {
            console.log(`📡 [markAsSeen] Emitting messagesSeen to room ${req.user.dbName}`);
            req.io.to(req.user.dbName).emit('messagesSeen', { messageIds, seenBy: req.user.userId });
        }

        return res.json({ success: true, message: "Messages marked as seen" });
    } catch (err) {
        console.error("🔴 markAsSeen Error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};
