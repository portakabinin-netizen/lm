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

const cleanupBroadcastMedia = async (Messages) => {
    try {
        const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
        const oldMessages = await Messages.find({
            isOneToOne: false,
            createdAt: { $lt: tenDaysAgo },
            localPath: { $ne: null }
        });

        for (const msg of oldMessages) {
            if (msg.localPath) {
                // Ensure we handle the leading slash correctly
                const relativePath = msg.localPath.startsWith('/') ? msg.localPath.substring(1) : msg.localPath;
                const fullPath = path.join(__dirname, '..', relativePath);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                    console.log(`🗑️ Auto-removed old broadcast media: ${fullPath}`);
                }
                msg.localPath = null;
                await msg.save();
            }
        }
    } catch (err) {
        console.error("🔴 Cleanup error:", err.message);
    }
};

exports.createGroup = async (req, res) => {
    try {
        const { name, members } = req.body;
        const { ChatGroups } = req.tenantModels;
        
        if (!ChatGroups) {
            return res.status(400).json({ success: false, message: "Tenant models not initialized" });
        }

        const group = new ChatGroups({
            name,
            members,
            createdBy: req.user.userId
        });

        await group.save();
        return res.status(201).json({ success: true, data: group });
    } catch (err) {
        console.error("🔴 createGroup Error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.getGroups = async (req, res) => {
    try {
        const { ChatGroups } = req.tenantModels;
        
        if (!ChatGroups) {
            return res.status(400).json({ success: false, message: "Tenant models not initialized" });
        }

        // Only fetch groups the current user is a member of
        const groups = await ChatGroups.find({ members: req.user.userId }).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: groups });
    } catch (err) {
        console.error("🔴 getGroups Error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.sendMessage = async (req, res) => {
    try {
        const { senderName, senderId, text, type, mediaUrl, mediaType, public_id, isOneToOne, isGroup, groupId, location, contact, receiverId } = req.body;
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
            isGroup,
            groupId,
            location,
            contact,
            receiverId
        };

        // If message has media and was uploaded to Cloudinary, download it to server and delete from cloud
        if (mediaUrl && public_id) {
            try {
                const uploadDir = path.join(__dirname, '..', 'uploads', 'chatMediaFolder');
                if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

                const fileName = `${Date.now()}-${path.basename(mediaUrl)}`;
                const localPath = path.join(uploadDir, fileName);

                console.log(`Downloading ${mediaUrl} to ${localPath}...`);
                await downloadFile(mediaUrl, localPath);

                // Update message with local path
                messageData.localPath = `/uploads/chatMediaFolder/${fileName}`;
                messageData.mediaUrl = `/uploads/chatMediaFolder/${fileName}`; // Point to local path
                
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
        const { Messages } = req.tenantModels || {};
        if (!Messages) {
            console.error(`❌ [Chat] Messages model missing for tenant: ${req.tenantDbName || 'unknown'}`);
            return res.status(400).json({ success: false, message: "Tenant models not initialized" });
        }

        // Lazy cleanup for broadcast media (older than 10 days)
        cleanupBroadcastMedia(Messages);

        const { isOneToOne, isGroup, groupId, receiverId, senderId } = req.query;
        
        let query = {};
        if (isGroup === 'true') {
            query = { isGroup: true, groupId: groupId };
        } else if (isOneToOne === 'true') {
            query = {
                isOneToOne: true,
                $or: [
                    { senderId, receiverId },
                    { senderId: receiverId, receiverId: senderId }
                ]
            };
        } else if (isOneToOne === 'false') {
            query = { isOneToOne: { $ne: true }, isGroup: { $ne: true } }; // Public chat
        } else {
            // Default: Fetch all public messages + private messages involving the current user + groups the user is in
            const currentUserId = req.user.userId;
            
            // To properly fetch group messages in default, we'd need to know user's groups, 
            // but usually getMessages is called per room or gets all relevant.
            // Let's assume if no specific filter is passed, we fetch everything relevant
            const { ChatGroups } = req.tenantModels;
            let userGroupIds = [];
            if (ChatGroups) {
                const userGroups = await ChatGroups.find({ members: currentUserId }).select('_id');
                userGroupIds = userGroups.map(g => g._id.toString());
            }

            query = {
                $or: [
                    { isOneToOne: { $ne: true }, isGroup: { $ne: true } }, // Public broadcast chat
                    { senderId: currentUserId },    // Sent by me
                    { receiverId: currentUserId },  // Received by me
                    { isGroup: true, groupId: { $in: userGroupIds } } // Group messages for my groups
                ]
            };
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
        const userId = req.user.userId;
        
        // Find messages to see what type they are
        const messages = await Messages.find({ _id: { $in: messageIds } });
        const oneToOneIds = messages.filter(m => m.isOneToOne).map(m => m._id);
        const groupIds = messages.filter(m => !m.isOneToOne).map(m => m._id);

        if (oneToOneIds.length > 0) {
            await Messages.updateMany(
                { _id: { $in: oneToOneIds } },
                { $set: { status: 'seen' } }
            );
        }

        if (groupIds.length > 0) {
            await Messages.updateMany(
                { _id: { $in: groupIds } },
                { $addToSet: { seenBy: userId } }
            );
        }

        // Emit to socket room so sender knows messages were seen
        if (req.io && req.user && req.user.dbName) {
            req.io.to(req.user.dbName).emit('messagesSeen', { messageIds, seenBy: req.user.userId });
        }

        return res.json({ success: true, message: "Messages marked as seen" });
    } catch (err) {
        console.error("🔴 markAsSeen Error:", err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};

exports.getUnreadCount = async (req, res) => {
    try {
        const { Messages } = req.tenantModels;
        if (!Messages) return res.status(400).json({ success: false, message: 'Tenant models not initialized' });

        const userId = req.user.userId;

        const count = await Messages.countDocuments({
            $or: [
                { isOneToOne: true, receiverId: userId, status: 'unseen' },
                { isOneToOne: false, senderId: { $ne: userId }, seenBy: { $ne: userId } }
            ]
        });

        return res.json({ success: true, count });
    } catch (err) {
        console.error('getUnreadCount Error:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
};
