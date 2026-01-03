const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

// Import the Unified Service Object
const services = require("../controller/unifiedService");

// ✅ Simplified Service Mapping
// This matches the keys defined in your unifiedService.js exports
const serviceMap = {
  leads: services.leadService,
  corporate: services.corporateService,
  ledger: services.ledgerService,
  user: services.userService,
};

// Apply JWT verification to all routes
router.use(authMiddleware);

/* =============================================================
   1. SPECIALIZED ROUTES (Must be defined BEFORE generic routes)
   ============================================================= */

// ✅ LEADS BY STATUS
router.get("/leads/status/:status", async (req, res) => {
  try {
    const { status } = req.params;
    const { corporateId } = req.query; 
    const result = await services.leadService.getLeadsByStatus(status, corporateId);
    res.json({ success: true, data: result || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ BULK CREATE LEADS
router.post("/addmany", async (req, res) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ message: "Array required" });
    const result = await services.leadService.addMany(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ ADD ACTIVITY LOG
router.post("/:id/activity", async (req, res) => {
  try {
    const result = await services.leadService.addActivity(req.params.id, req.body);
    if (!result) return res.status(404).json({ success: false, message: "Lead not found" });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* =============================================================
   2. GENERIC FACTORY ROUTES (CRUD)
   ============================================================= */

/** ✅ CREATE (POST) */
router.post("/:type/create", async (req, res) => {
  const { type } = req.params;
  const service = serviceMap[type];

  if (!service || !service.create) {
    return res.status(400).json({ success: false, message: `Invalid service type: ${type}` });
  }

  try {
    const payload = { ...req.body };
    // Auto-inject corporateId for non-admins
    if (req.user.role !== "Admin" && req.user.corporateId) {
      payload.corporateId = req.user.corporateId;
    }

    const result = await service.create(payload);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** ✅ LIST (GET) */
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
    const result = await service.list(filters);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** ✅ GET BY ID (GET) */
router.get("/:type/:id", async (req, res) => {
  const { type, id } = req.params;
  const service = serviceMap[type];

  if (!service || !service.getById) {
    return res.status(400).json({ success: false, message: "Invalid service type" });
  }

  try {
    const result = await service.getById(id);
    if (!result) return res.status(404).json({ success: false, message: "Record not found" });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** ✅ UPDATE (PUT) */
router.put("/:type/:id", async (req, res) => {
  const { type, id } = req.params;
  const service = serviceMap[type];

  if (!service || !service.update) {
    return res.status(400).json({ success: false, message: "Invalid service type" });
  }

  try {
    const result = await service.update(id, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** ✅ DELETE (DELETE) */
router.delete("/:type/:id", async (req, res) => {
  const { type, id } = req.params;
  const service = serviceMap[type];

  if (!service || !service.remove) {
    return res.status(400).json({ success: false, message: "Invalid service type" });
  }

  try {
    await service.remove(id);
    res.json({ success: true, message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;