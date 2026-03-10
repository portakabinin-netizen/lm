const express    = require("express");
const router     = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const services       = require("../controller/leadServices");

// ── Service map for generic factory routes ─────────────────────────────────
const serviceMap = {
  leads:     services.leadService,
  corporate: services.corporateService,
  ledger:    services.ledgerService,
  user:      services.userService,
};

// ── Auth on every route ────────────────────────────────────────────────────
router.use(authMiddleware);

/* =========================================================================
   1. SPECIFIC LEADS ROUTES
   Must be registered BEFORE generic /:type/:id factory routes
   ========================================================================= */

// 📧 Read email inbox
router.get("/email/readInbox", services.leadService.readInbox);

// 📥 Bulk insert leads
router.post("/addmany", async (req, res) => {
  try {
    if (!Array.isArray(req.body))
      return res.status(400).json({ success: false, message: "Array required" });

    const result = await services.leadService.addMany(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 🔍 Search lead by mobile  — no :id param, must be above /:type/:id
router.get("/leads/search", services.leadService.searchByMobile);

// 📊 Filter leads by status — has :status param, must be above /:type/:id
router.get("/leads/status/:status", async (req, res) => {
  try {
    const { status }      = req.params;
    const { corporateId } = req.query;
    const result = await services.leadService.getLeadsByStatus(status, corporateId);
    res.json({ success: true, data: result || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 📝 Log activity against a lead
router.post("/leads/:id/activity", services.leadService.addActivity);

/* =========================================================================
   2. GENERIC FACTORY ROUTES  (leads / corporate / ledger / user)
   Registered AFTER all specific routes to avoid param conflicts
   ========================================================================= */

// ➕ Create
router.post("/:type/create", async (req, res) => {
  const service = serviceMap[req.params.type];
  if (!service?.create)
    return res.status(400).json({ success: false, message: `Invalid service: ${req.params.type}` });

  try {
    const payload = { ...req.body };
    if (req.user.role !== "Admin" && req.user.corporateId)
      payload.corporateId = req.user.corporateId;

    const result = await service.create(payload);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 📋 List
router.get("/:type/list", async (req, res) => {
  const service = serviceMap[req.params.type];
  if (!service?.list)
    return res.status(400).json({ success: false, message: "Invalid service type" });

  try {
    const filters = {};
    if (req.user.role !== "Admin" && req.user.corporateId)
      filters.corporateId = req.user.corporateId;

    const result = await service.list(filters);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 🔎 Get by ID
router.get("/:type/:id", async (req, res) => {
  const service = serviceMap[req.params.type];
  if (!service?.getById)
    return res.status(400).json({ success: false, message: "Invalid service type" });

  try {
    const result = await service.getById(req.params.id);
    if (!result)
      return res.status(404).json({ success: false, message: "Record not found" });

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✏️ Update
router.put("/:type/:id", async (req, res) => {
  const service = serviceMap[req.params.type];
  if (!service?.update)
    return res.status(400).json({ success: false, message: "Invalid service type" });

  try {
    const result = await service.update(req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 🗑️ Delete
router.delete("/:type/:id", async (req, res) => {
  const service = serviceMap[req.params.type];
  if (!service?.remove)
    return res.status(400).json({ success: false, message: "Invalid service type" });

  try {
    await service.remove(req.params.id);
    res.json({ success: true, message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;