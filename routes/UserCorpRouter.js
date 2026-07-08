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
const chatCtrl = require("../controller/chatController");
const financeCtrl = require("../controller/FinanceController");

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
router.get("/leads/all/gallery", ctrl.manageLeads.getAllGallery);
router.get("/leads/project-active", ctrl.manageLeads.getProjectActive);
router.get("/leads/project-gallery", ctrl.manageLeads.getProjectGallery);
router.get("/leads/status/:status", ctrl.manageLeads.getLeadsByStatus);
router.get("/leads/:id",        ctrl.manageLeads.get);
router.post("/leads/create",    ctrl.manageLeads.create);
router.put("/leads/:id",        ctrl.manageLeads.update);
router.delete("/leads/:id",     ctrl.manageLeads.delete);
router.post("/leads/:id/activity", ctrl.manageLeads.addActivity);
router.post("/leads/:id/site-client-check", ctrl.manageLeads.addSiteClientCheck);
router.post("/leads/:id/site-visit", ctrl.manageLeads.logSiteVisit);
router.get("/leads/export/excel",  ctrl.manageLeads.download);
router.post("/email/readInbox",    ctrl.manageLeads.readInbox);
// ── Site Shift Configuration (CRUD per lead) ──
router.get("/leads/:id/shifts",    ctrl.manageLeads.getSiteShifts);
router.put("/leads/:id/shifts",    ctrl.manageLeads.updateSiteShifts);

// --- 📦 CATALOG (Inventory) ---
router.get("/catalog/template",  ctrl.manageCatalog.generateTemplate);
router.post("/catalog/bulk",     upload.single("file"), ctrl.manageCatalog.uploadBulk);
router.get("/catalog/products",  ctrl.manageProducts.list);
router.post("/catalog/products", ctrl.manageProducts.create);
router.put("/catalog/products/:id", ctrl.manageProducts.update);
router.delete("/catalog/products/:id", ctrl.manageProducts.delete);

// --- 👷 HR (Employees & Attendance) ---
router.get("/hr/employees",      ctrl.manageEmployees.list);
router.get("/hr/employees/:id",  ctrl.manageEmployees.get);
router.post("/hr/employees",     ctrl.manageEmployees.create);
router.put("/hr/employees/:id",  ctrl.manageEmployees.update);
router.delete("/hr/employees/:id", ctrl.manageEmployees.delete);
router.get("/hr/attendance",     ctrl.manageEmployees.listAttendance);
router.get("/hr/attendance-dashboard", ctrl.manageEmployees.getAttendanceDashboard);
router.get("/hr/attendance/bulk-template", ctrl.manageEmployees.generateAttendanceTemplate);
router.post("/hr/attendance/bulk-upload", upload.single("file"), ctrl.manageEmployees.bulkImportAttendance);
router.get("/hr/attendance/active", ctrl.manageEmployees.getActiveAttendance);
router.get("/hr/attendance/active-staff", ctrl.manageEmployees.listActiveStaff);
router.get("/hr/attendance/roster-suggestion", ctrl.manageEmployees.getRosterSuggestion); // Phase 2c
router.post("/hr/attendance/toggle", ctrl.manageEmployees.toggleAttendance);
router.post("/hr/attendance/emergency-end-employee", ctrl.manageEmployees.emergencyEndEmployee); // individual emergency off
router.post("/hr/attendance/continue-shift",         ctrl.manageEmployees.continueShift);         // double shift continuation
router.post("/hr/broadcast",                         ctrl.manageEmployees.sendBroadcast);

router.post("/hr/attendance/lock-worker", ctrl.manageEmployees.lockWorkerAttendance);
router.post("/hr/attendance",    ctrl.manageEmployees.markAttendance);
router.post("/hr/attendance/mark-paid", ctrl.manageEmployees.markPaid);
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

// --- 💬 CHAT ---
router.post("/chat/send", chatCtrl.sendMessage);
router.get("/chat/messages", chatCtrl.getMessages);
router.put("/chat/seen", chatCtrl.markAsSeen);

// --- 🏢 CORPORATE PROFILE ---
router.get("/profile",           ctrl.manageProfile.get);
router.put("/profile",           ctrl.manageProfile.update);

// --- 📊 FINANCE SERVICE ADAPTERS (for frontend LedgerDetailModal / ledger.ts) ---
router.get("/finance/ledgers", financeCtrl.getLedgerTransactions);
router.put("/finance/ledgers/:id", financeCtrl.manageLedgers.update);

module.exports = router;
