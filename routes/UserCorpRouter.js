/**
 * 🚀 UserCorpRouter.js
 * 
 * PURPOSE:
 * Centralized routing for corporate operational data (CorpDataMaster).
 * Consolidates Leads (CRM), Employees (HR), and Products (Catalog).
 */

const express = require("express");
const router = express.Router();
const multer = require("multer");
const auth = require("../middleware/authMiddleware");
const tenant = require("../middleware/tenantMiddleware");
const ctrl = require("../controller/UserCorpController");

// Setup Multer for Bulk Uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * 🌍 PUBLIC ROUTES
 */
router.post("/leads/public-inquiry", ctrl.manageLeads.webInquiry);

/**
 * 🔒 PROTECTED ROUTES
 */
router.use(auth);
router.use(tenant); // ⬅️ Resolve tenant connection for all operational routes

// --- 🎯 LEADS (CRM) ---
router.get("/leads/list",       ctrl.manageLeads.list);
router.post("/leads/addMany",    ctrl.manageLeads.addMany);
router.get("/leads/search",     ctrl.manageLeads.searchByMobile);
router.get("/leads/analytics",  ctrl.manageLeads.analytics);
router.get("/leads/project-active", ctrl.manageLeads.getProjectActive);
router.get("/leads/status/:status", ctrl.manageLeads.getLeadsByStatus);
router.get("/leads/:id",        ctrl.manageLeads.get);
router.post("/leads/create",    ctrl.manageLeads.create);
router.put("/leads/:id",        ctrl.manageLeads.update);
router.delete("/leads/:id",     ctrl.manageLeads.delete);
router.post("/leads/:id/activity", ctrl.manageLeads.addActivity);
router.post("/leads/:id/site-visit", ctrl.manageLeads.logSiteVisit);
router.get("/leads/export/excel",  ctrl.manageLeads.download);
router.post("/email/readInbox",    ctrl.manageLeads.readInbox);

// --- 📦 CATALOG (Inventory) ---
router.get("/catalog/template",  ctrl.manageCatalog.generateTemplate);
router.post("/catalog/bulk",     upload.single("file"), ctrl.manageCatalog.uploadBulk);
router.get("/catalog/products",  ctrl.manageProducts.list);
router.post("/catalog/products", ctrl.manageProducts.create);
router.put("/catalog/products/:id", ctrl.manageProducts.update);
router.delete("/catalog/products/:id", ctrl.manageProducts.delete);

// --- 👷 HR (Employees & Attendance) ---
router.get("/hr/employees",      ctrl.manageEmployees.list);
router.post("/hr/employees",     ctrl.manageEmployees.create);
router.put("/hr/employees/:id",  ctrl.manageEmployees.update);
router.delete("/hr/employees/:id", ctrl.manageEmployees.delete);
router.get("/hr/attendance",     ctrl.manageEmployees.listAttendance);
router.post("/hr/attendance",    ctrl.manageEmployees.markAttendance);
router.put("/hr/attendance/:id", ctrl.manageEmployees.updateAttendance);
router.delete("/hr/attendance/:id", ctrl.manageEmployees.deleteAttendance);
router.get("/hr/rate-lookup",   ctrl.manageEmployees.getRateLookup);


// --- 👥 PARTIES (Clients & Suppliers) ---
router.get("/parties/clients",   ctrl.manageClients.list);
router.post("/parties/clients",  ctrl.manageClients.create);
router.put("/parties/clients/:id", ctrl.manageClients.update);
router.delete("/parties/clients/:id", ctrl.manageClients.delete);

router.get("/parties/suppliers", ctrl.manageSuppliers.list);
router.post("/parties/suppliers", ctrl.manageSuppliers.create);
router.put("/parties/suppliers/:id", ctrl.manageSuppliers.update);
router.delete("/parties/suppliers/:id", ctrl.manageSuppliers.delete);

// --- 👤 STAFF (Users) ---
router.get("/staff",             ctrl.manageStaff.list);
router.post("/staff",            ctrl.manageStaff.create);
router.put("/staff/:id",         ctrl.manageStaff.update);
router.delete("/staff/:id",      ctrl.manageStaff.delete);

// --- 🏢 CORPORATE PROFILE ---
router.get("/profile",           ctrl.manageProfile.get);
router.put("/profile",           ctrl.manageProfile.update);

module.exports = router;
