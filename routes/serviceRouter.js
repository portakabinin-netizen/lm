const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

// Import your modular services
const leadService = require("../controller/leadService");
const corporateService = require("../controller/corporateService");
const ledgerService = require("../controller/ledgerService");
const userService = require("../controller/useServicesNew");


// ✅ Service Mapping (No TypeScript syntax)
const serviceMap = {
  leads: leadService,
  corporate: corporateService,
  ledger: ledgerService,
  user: userService,
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

    const result = await service.create(payload);
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

    const result = await service.list(filters);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error("Error listing records:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * ✅ GET BY ID (GET)
 */
router.get("/:type/:id", async (req, res) => {
  const { type, id } = req.params;
  const service = serviceMap[type];

  if (!service || !service.getById) {
    return res.status(400).json({ success: false, message: "Invalid service type" });
  }

  try {
    const result = await service.getById(id);
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
    const result = await service.update(id, req.body);
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
    await service.remove(id);
    res.json({ success: true, message: "Deleted successfully" });
  } catch (err) {
    console.error("Error deleting record:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * ✅ GET LEADS BY STATUS
 */
router.get("/leads/status/:status", async (req, res, next) => {
  try {
    const { status } = req.params;
    // Extract corporateId from query parameters
    const { corporateId } = req.query; 

    // Pass BOTH arguments to the service
    const result = await leadService.getLeadsByStatus(status, corporateId);
    
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
 * ✅ BULK CREATE LEADS (POST)
  */
router.post("/addmany", async (req, res) => {
  try {
    const leadsArray = req.body;
    if (!Array.isArray(leadsArray)) return res.status(400).json({ message: "Array required" });

    const result = await leadService.addMany(leadsArray);

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

    // 2. USE leadService instead of ledgerService
    const updatedLead = await leadService.addActivity(req.params.id, req.body);
    
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
