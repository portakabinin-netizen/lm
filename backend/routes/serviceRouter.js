const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

// Import your modular services
const leadService = require("../controller/leadService");
const corporateService = require("../controller/corporateService");
const ledgerService = require("../controller/ledgerService");
const userService = require("../controller/useServicesNew");
const chatService = require("../controller/chatService");

// ✅ Service Mapping (No TypeScript syntax)
const serviceMap = {
  leads: leadService,
  corporate: corporateService,
  ledger: ledgerService,
  user: userService,
  chat: chatService,
};

// ✅ Apply JWT verification to all routes below
router.use(authMiddleware);

/**
 * ✅ CREATE (POST)
 */
router.post("/:type/create", async (req, res) => {
  const { type } = req.params;
  const service = serviceMap[type];

  if (!service || !service.create) {
    return res.status(400).json({ success: false, message: "Invalid service type" });
  }

  try {
    const payload = { ...req.body };

    // Attach corporateId for non-admins
    if (req.user.role !== "Admin" && req.user.corporateId) {
      payload.corporateId = req.user.corporateId;
    }

    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.query.dbName;
    const result = await service.create(payload, dbName);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("Error creating record:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * ✅ LIST (GET)
 */
router.get("/:type/list", async (req, res) => {
  const { type } = req.params;
  const service = serviceMap[type];

  if (!service || !service.list) {
    return res.status(400).json({ success: false, message: "Invalid service type" });
  }

  try {
    const filters = {};
    if (req.user.role !== "Admin" && req.user.corporateId) {
      filters.corporateId = req.user.corporateId;
    }

    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.query.dbName;
    const result = await service.list(filters, dbName);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("Error listing records:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * ✅ LEADS ANALYTICS (GET) — Must precede /:type/:id
 */
router.get("/leads/analytics", async (req, res) => {
  try {
    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.query.dbName;
    const data = await leadService.analytics(dbName, req.query);
    res.json({ success: true, total: data.total, data });
  } catch (err) {
    console.error("❌ Analytics Route Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * ✅ PROJECT ACTIVE LEADS (GET) — Must precede /:type/:id
 */
router.get("/leads/project-active", async (req, res) => {
  try {
    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.query.dbName;
    const data = await leadService.getProjectActive(dbName);
    res.json({ success: true, data: data || [] });
  } catch (err) {
    console.error("❌ Project Active Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * ✅ GET LEADS BY STATUS — Must precede /:type/:id
 */
router.get("/leads/status/:status", async (req, res) => {
  try {
    const { status } = req.params;
    const { corporateId } = req.query; 
    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.query.dbName;

    const result = await leadService.getLeadsByStatus(status, corporateId, dbName);
    
    res.json({ 
      success: true, 
      data: result || [] 
    });
  } catch (err) {
    console.error("❌ Route Error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 💬 CHAT ROUTES — Must precede /:type/:id
 */
router.get("/chat/messages", chatService.getMessages);
router.post("/chat/send", chatService.sendMessage);
router.put("/chat/seen", chatService.markSeen);
router.post("/chat/seen", chatService.markSeen);
router.get("/chat/latest-request", chatService.getLatestRequest);
router.put("/chat/requests/status", chatService.updateRequestStatus);
router.get("/chat/groups", chatService.getGroups);
router.post("/chat/groups", chatService.createGroup);

/**
 * ✅ GET BY ID (GET) — Only matches valid ObjectIds
 */
router.get("/:type/:id", async (req, res) => {
  const { type, id } = req.params;
  const service = serviceMap[type];

  if (!service || !service.getById) {
    return res.status(400).json({ success: false, message: "Invalid service type" });
  }

  // Guard against non-ObjectId strings like "project-active" or "analytics"
  if (!id || id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id)) {
    return res.status(404).json({ success: false, message: "Invalid ID format" });
  }

  try {
    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.query.dbName;
    const result = await service.getById(id, dbName);
    if (!result) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("Error fetching record:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * ✅ UPDATE (PUT)
 */
router.put("/:type/:id", async (req, res) => {
  const { type, id } = req.params;
  const service = serviceMap[type];

  if (!service || !service.update) {
    return res.status(400).json({ success: false, message: "Invalid service type" });
  }

  try {
    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.query.dbName;
    const result = await service.update(id, req.body, dbName);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("Error updating record:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * ✅ DELETE (DELETE)
 */
router.delete("/:type/:id", async (req, res) => {
  const { type, id } = req.params;
  const service = serviceMap[type];

  if (!service || !service.remove) {
    return res.status(400).json({ success: false, message: "Invalid service type" });
  }

  try {
    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.query.dbName;
    await service.remove(id, dbName);
    res.json({ success: true, message: "Deleted successfully" });
  } catch (err) {
    console.error("Error deleting record:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
/**
 * ✅ BULK CREATE LEADS (POST)
  */
router.post("/addmany", async (req, res) => {
  try {
    const leadsArray = req.body;
    if (!Array.isArray(leadsArray)) return res.status(400).json({ message: "Array required" });

    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.query.dbName;
    const result = await leadService.addMany(leadsArray, dbName);

    // FIX: Match the property names returned by the service
    return res.status(201).json({ 
      success: result.success, 
      insertedCount: result.insertedCount, // Changed from result.count
      skippedCount: result.skippedCount
    });
  } catch (err) {
    console.error("Bulk Insert Route Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * ✅ Add an Activity log to a specific lead
 */

router.post("/:id/activity", async (req, res) => {
  try {
    const dbName = req.headers["x-tenant-id"] || req.user?.dbName || req.headers["x-dbname"] || req.query.dbName;
    const updatedLead = await leadService.addActivity(req.params.id, req.body, dbName);
    
    if (!updatedLead) {
      return res.status(404).json({ success: false, message: "Lead not found" });
    }
    res.status(200).json({ success: true, data: updatedLead });
  } catch (error) {
    console.error("❌ Router Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});



module.exports = router;
