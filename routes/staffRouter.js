const express = require("express");
const router  = express.Router();
const auth    = require("../middleware/authMiddleware");
const ctrl    = require("../controller/staffController");

router.use(auth);

// ── Staff combined picker (for Finance form) ──────────────────────────────────
router.get("/picker",               ctrl.getStaffPicker);

// ── Employees ─────────────────────────────────────────────────────────────────
router.post(  "/employee/add",      ctrl.addEmployee);
router.get(   "/employee/list",     ctrl.listEmployees);
router.put(   "/employee/:id",      ctrl.updateEmployee);
router.delete("/employee/:id",      ctrl.deleteEmployee);

// ── Transporters ──────────────────────────────────────────────────────────────
router.post(  "/transporter/add",   ctrl.addTransporter);
router.get(   "/transporter/list",  ctrl.listTransporters);
router.put(   "/transporter/:id",   ctrl.updateTransporter);
router.delete("/transporter/:id",   ctrl.deleteTransporter);

// ── Contacts (Party Ledger) ────────────────────────────────────────────────────────────────
router.post(  "/contact/add",       ctrl.addContact);
router.get(   "/contact/list",      ctrl.listContacts);
router.put(   "/contact/:id",       ctrl.updateContact);
router.delete("/contact/:id",       ctrl.deleteContact);
router.get(   "/contact/ledger/:mobile", ctrl.getPartyLedger);  // Party Ledger by mobile

// ── Attendance ────────────────────────────────────────────────────────────────
router.post(  "/attendance/mark",   ctrl.markAttendance);
router.get(   "/attendance/list",   ctrl.listAttendance);

module.exports = router;
