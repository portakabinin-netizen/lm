const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

// Known tenant identifier to isolated MongoDB database mapping
const KNOWN_TENANTS = {
  "portakabin.in": "41414546483437393441",
  "portakabin": "41414546483437393441",
  "resident's hn347": "41455750433838343445",
  "residents hn347": "41455750433838343445",
  "resident": "41455750433838343445",
  "pratham services": "41444c50503539303542",
  "pratham": "41444c50503539303542",
  "team security and hr solutions pvt ltd": "41414443543830373245",
  "team security": "41414443543830373245",
  "aaefh4794a": "41414546483437393441",
  "aewpc8844e": "41455750433838343445",
  "adlpp5905b": "41444c50503539303542",
  "aadct8072f": "41414443543830373245",
};

const DEFAULT_DB = "41414546483437393441";

function resolveTenantDbName(raw) {
  if (!raw || typeof raw !== "string") return DEFAULT_DB;
  const clean = raw.trim().toLowerCase();
  if (KNOWN_TENANTS[clean]) return KNOWN_TENANTS[clean];
  // 10-char PAN
  if (/^[a-z]{5}[0-9]{4}[a-z]$/i.test(clean)) {
    return Buffer.from(clean.toUpperCase()).toString("hex");
  }
  // 20-char Hex DB name
  if (/^[0-9a-f]{20}$/i.test(clean)) {
    return clean;
  }
  // If invalid namespace characters are present, fallback safely
  if (clean.includes(".") || clean.includes(" ") || clean.includes("'") || clean.includes('"') || clean.includes("$")) {
    return DEFAULT_DB;
  }
  return clean || DEFAULT_DB;
}

function getTenantDb(rawDbName) {
  const target = resolveTenantDbName(rawDbName);
  
  // 1. Try native MongoClient (direct database reference)
  try {
    const client = mongoose.connection.getClient?.();
    if (client) {
      return client.db(target);
    }
  } catch (e) {}

  // 2. Try mongoose connection useDb
  try {
    const conn = mongoose.connection.useDb(target, { useCache: true });
    if (conn?.db) return conn.db;
  } catch (e) {}

  // 3. Fallback to mongoose default database
  if (mongoose.connection.db) {
    return mongoose.connection.db;
  }

  return null;
}

/**
 * 💬 Fetch Messages
 * GET /api/service/chat/messages
 */
exports.getMessages = async (req, res) => {
  try {
    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.query.dbName;
    const tDb = getTenantDb(dbName);
    if (!tDb) {
      return res.json({ success: true, data: [] });
    }

    const groupId = req.query.groupId;
    const query = {};
    if (groupId) {
      query.groupId = groupId;
    }

    const messages = await tDb.collection("messages")
      .find(query)
      .sort({ createdAt: 1 })
      .limit(300)
      .toArray();

    return res.json({ success: true, data: messages || [] });
  } catch (err) {
    console.error("❌ Chat getMessages error:", err.message);
    // Return empty list with 200 so the mobile app doesn't crash on AxiosError
    return res.json({ success: true, data: [], message: err.message });
  }
};

/**
 * 💬 Send Message
 * POST /api/service/chat/send
 */
exports.sendMessage = async (req, res) => {
  try {
    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.body.dbName;
    const tDb = getTenantDb(dbName);
    if (!tDb) {
      return res.status(503).json({ success: false, message: "Database not ready" });
    }

    const doc = {
      ...req.body,
      senderId: req.user?.userId || req.body.senderId,
      senderName: req.user?.userDisplayName || req.body.senderName || "User",
      createdAt: req.body.createdAt ? new Date(req.body.createdAt) : new Date(),
      updatedAt: new Date(),
      status: req.body.status || "unseen",
      isCloudDeleted: false,
    };

    const result = await tDb.collection("messages").insertOne(doc);
    doc._id = result.insertedId;

    const resolvedRoom = resolveTenantDbName(dbName);
    if (global.ioInstance) {
      if (resolvedRoom) global.ioInstance.to(resolvedRoom).emit("chat:new_message", doc);
      global.ioInstance.emit("chat:new_message", doc);
    }

    return res.json({ success: true, messageId: doc._id, data: doc });
  } catch (err) {
    console.error("❌ Chat sendMessage error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 💬 Mark Message(s) as Seen
 * PUT /api/service/chat/seen or POST /api/service/chat/seen
 */
exports.markSeen = async (req, res) => {
  try {
    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.body.dbName;
    const tDb = getTenantDb(dbName);
    if (!tDb) return res.json({ success: true });

    const ids = Array.isArray(req.body.ids) ? req.body.ids : (req.body.id ? [req.body.id] : []);

    const objIds = ids.map(id => {
      try {
        return new ObjectId(id);
      } catch (e) {
        return id;
      }
    });

    if (objIds.length > 0) {
      await tDb.collection("messages").updateMany(
        { _id: { $in: objIds } },
        { $set: { status: "seen", updatedAt: new Date() } }
      );
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ Chat markSeen error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 💬 Get Latest Chat Request
 * GET /api/service/chat/latest-request
 */
exports.getLatestRequest = async (req, res) => {
  try {
    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.query.dbName;
    const tDb = getTenantDb(dbName);
    if (!tDb) return res.json({ success: true, data: null });

    const doc = await tDb.collection("chatrequests").findOne({}, { sort: { createdAt: -1 } });
    return res.json({ success: true, data: doc || null });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 💬 Update Request Status
 * PUT /api/service/chat/requests/status
 */
exports.updateRequestStatus = async (req, res) => {
  try {
    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.body.dbName;
    const tDb = getTenantDb(dbName);
    if (!tDb) return res.json({ success: true, message: "Skipped" });

    const { _id, status } = req.body;
    let queryId = _id;
    try { queryId = new ObjectId(_id); } catch (e) {}

    await tDb.collection("chatrequests").updateOne(
      { _id: queryId },
      { $set: { status, updatedAt: new Date() } }
    );
    return res.json({ success: true, message: "Status updated" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 💬 Get Chat Groups
 * GET /api/service/chat/groups
 */
exports.getGroups = async (req, res) => {
  try {
    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.query.dbName;
    const tDb = getTenantDb(dbName);
    if (!tDb) return res.json({ success: true, data: [] });

    const groups = await tDb.collection("chatgroups").find({}).toArray();
    return res.json({ success: true, data: groups || [] });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * 💬 Create Chat Group
 * POST /api/service/chat/groups
 */
exports.createGroup = async (req, res) => {
  try {
    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.body.dbName;
    const tDb = getTenantDb(dbName);
    if (!tDb) return res.status(503).json({ success: false, message: "Database not ready" });

    const doc = { ...req.body, createdAt: new Date() };
    const result = await tDb.collection("chatgroups").insertOne(doc);
    return res.json({ success: true, groupId: result.insertedId, data: doc });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
