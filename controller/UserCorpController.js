/**
 * 🏰 UserCorpController.js (v2.1 - Reverted Identity Logic)
 * 
 * PURPOSE:
 * Unified management for 'CorpDataMaster' hub.
 * Reverted: Staff (Users) are now managed via the standalone 'Users' collection.
 */

const userMaster = require("../models/userMaster");
const mongoose = require("mongoose");
const ExcelJS = require("exceljs");
const externalService = require("../utils/externalService");

// Constants
const SENDERS = require('../models/senders.json');
const CITY_STATE_MAP = require('../models/cityStateMap.json');

/**
 * 🛠️ Internal Helper: Dynamic Spoke Resolver (for Hub Data)
 */
const manageSpoke = {
    list: async (req, res, modelName, filter = {}) => {
        try {
            const Model = req.tenantModels[modelName];
            
            // 🚀 Apply Hierarchical Location Filtering
            const q = { ...filter };
            const accessibleIds = req.user?.accessibleLocationIds;
            if (req.user?.userRole !== "CorpAdmin" && accessibleIds?.length > 0) {
                q.locationId = { $in: accessibleIds };
            }

            const data = await Model.find(q).lean();
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    getById: async (req, res, modelName) => {
        try {
            const Model = req.tenantModels[modelName];
            const item = await Model.findById(req.params.id);
            if (!item) return res.status(404).json({ success: false, message: "Entity not found" });
            res.json({ success: true, data: item });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    update: async (req, res, modelName) => {
        try {
            const Model = req.tenantModels[modelName];
            const item = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
            if (!item) return res.status(404).json({ success: false, message: "Entity not found" });
            res.json({ success: true, data: item });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    delete: async (req, res, modelName) => {
        try {
            const Model = req.tenantModels[modelName];
            await Model.findByIdAndDelete(req.params.id);
            res.json({ success: true, message: "Entity deleted" });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    }
};

/**
 * 🎯 LEADS & CRM MANAGEMENT
 */
exports.manageLeads = {
    list: (req, res) => manageSpoke.list(req, res, "Leads"),
    get: (req, res) => manageSpoke.getById(req, res, "Leads"),
    create: async (req, res) => {
        try {
            const { Leads, Counters } = req.tenantModels;
            const counter = await Counters.findByIdAndUpdate("lead", { $inc: { seq: 1 } }, { upsert: true, new: true });
            
            // Link lead to user's location if not provided
            const locationId = req.body.locationId || req.user.accessCorporate?.locationId;
            
            const lead = new Leads({ ...req.body, lead_no: counter.seq, locationId });
            await lead.save();
            
            // 🚀 REAL-TIME: Notify clients
            req.io.to(req.tenantDbName).emit("lead:created", { data: lead });
            
            res.status(201).json({ success: true, data: lead });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    update: async (req, res) => {
        try {
            const { Leads } = req.tenantModels;
            const lead = await Leads.findByIdAndUpdate(req.params.id, req.body, { new: true });
            if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });
            
            if (req.body.status === "Accepted") {
                try {
                    const FinanceController = require('./FinanceController');
                    await FinanceController.ensureLedgerFolioInternal(req.tenantModels, {
                        name: lead.sender_name || "Client",
                        group: "Sundry Debtors",
                        refId: lead._id,
                        refType: "Lead"
                    });
                } catch (ferr) { console.error("Leads-Finance Auto Linkage Failed:", ferr.message); }
            }
            
            // 🚀 REAL-TIME: Notify clients
            req.io.to(req.tenantDbName).emit("lead:updated", { data: lead });

            res.json({ success: true, data: lead });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    delete: async (req, res) => {
        try {
            const { Leads } = req.tenantModels;
            const item = await Leads.findByIdAndDelete(req.params.id);
            
            // 🚀 REAL-TIME: Notify clients
            if (item) req.io.to(req.tenantDbName).emit("lead:deleted", { id: req.params.id });

            res.json({ success: true, message: "Entity deleted" });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    analytics: async (req, res) => {
        try {
            const { Leads } = req.tenantModels;
            const { fromDate, toDate, source } = req.query;
            
            const q = {};
            
            // 1. Location Filtering
            const accessibleIds = req.user?.accessibleLocationIds;
            if (req.user?.userRole !== "CorpAdmin" && accessibleIds?.length > 0) {
                q.locationId = { $in: accessibleIds };
            }

            // 2. Date/Source Filtering
            if (fromDate || toDate) {
                q.generated_date = {};
                if (fromDate) q.generated_date.$gte = new Date(fromDate);
                if (toDate)   q.generated_date.$lte = new Date(toDate);
            }
            if (source) q.source = source;

            // 3. Status Aggregation
            const statusAgg = await Leads.aggregate([
                { $match: q },
                { $group: { _id: "$status", value: { $sum: 1 } } },
                { $project: { label: "$_id", value: 1, _id: 0 } }
            ]);

            // 4. Source Aggregation
            const sourceAgg = await Leads.aggregate([
                { $match: q },
                { $group: { _id: "$source", value: { $sum: 1 } } },
                { $project: { label: { $ifNull: ["$_id", "Unknown"] }, value: 1, _id: 0 } }
            ]);

            const total = await Leads.countDocuments(q);

            res.json({ 
                success: true, 
                data: {
                    statuses: statusAgg,
                    sources:  sourceAgg
                },
                total
            });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    addMany: async (req, res) => {
        try {
            const { Leads, Counters } = req.tenantModels;
            const leads = req.body; 
            if (!Array.isArray(leads)) return res.status(400).json({ success: false, message: "Array expected" });

            const results = [];
            for (const data of leads) {
                const counter = await Counters.findByIdAndUpdate("lead", { $inc: { seq: 1 } }, { upsert: true, new: true });
                const lead = new Leads({ ...data, lead_no: counter.seq });
                await lead.save();
                results.push(lead);
            }
            // 🚀 REAL-TIME: Notify clients
            req.io.to(req.tenantDbName).emit("lead:batch_created", { count: results.length });
            
            res.json({ success: true, count: results.length });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    searchByMobile: async (req, res) => {
        try {
            const { mobile } = req.query;
            const { Leads } = req.tenantModels;
            const clean = mobile.replace(/\D/g, '').slice(-10);
            const q = { sender_mobile: { $regex: new RegExp(clean + "$") } };
            const accessibleIds = req.user?.accessibleLocationIds;
            if (req.user?.userRole !== "CorpAdmin" && accessibleIds?.length > 0) {
                q.locationId = { $in: accessibleIds };
            }

            const lead = await Leads.findOne(q).lean();
            if (!lead) return res.json({ success: true, isNew: true, message: "No match" });
            res.json({ success: true, isNew: false, data: lead });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    getLeadsByStatus: async (req, res) => {
        try {
            const { status } = req.params;
            const { Leads } = req.tenantModels;
            
            const q = { status: { $regex: new RegExp(`^${status}$`, "i") } };
            const accessibleIds = req.user?.accessibleLocationIds;
            if (req.user?.userRole !== "CorpAdmin" && accessibleIds?.length > 0) {
                q.locationId = { $in: accessibleIds };
            }

            const list = await Leads.find(q).lean();
            res.json({ success: true, data: list });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    getProjectActive: async (req, res) => {
        try {
            const { Leads, ProfileMaster } = req.tenantModels;
            const activeTags = ["Engaged", "Accepted"];
            
            const q = { status: { $in: activeTags } };
            const accessibleIds = req.user?.accessibleLocationIds;
            if (req.user?.userRole !== "CorpAdmin" && accessibleIds?.length > 0) {
                q.locationId = { $in: accessibleIds };
            }

            const leads = await Leads.find(q).lean();
            const profile = await ProfileMaster.findOne({}).lean();
            
            try {
                // Isolated search using externalService
                const cloudConfig = profile?.apiUrls?.cloudinary || null;
                const searchRes = await externalService.searchLeadsMedia(req.tenantDbName, cloudConfig);
                const mediaMap = {};
                searchRes.resources.forEach(a => {
                    // Path: hipk/<dbName>/leads/<lead_no>/<filename>
                    // Split gives: ["hipk", "<dbName>", "leads", "<lead_no>", "<filename>"]
                    const parts = a.public_id.split('/');
                    const leadsIdx = parts.indexOf("leads");
                    if (leadsIdx !== -1 && parts[leadsIdx + 1]) {
                        const leadNo = parts[leadsIdx + 1];
                        if (!mediaMap[leadNo]) mediaMap[leadNo] = []; 
                        mediaMap[leadNo].push(a.secure_url); 
                    }
                });
                // Map by lead_no instead of _id
                leads.forEach(l => { l.folderGallery = mediaMap[String(l.lead_no)] || []; });
            } catch (ce) {
                console.error("Cloudinary Fetch Error:", ce.message);
            }

            res.json({ success: true, data: leads, corporateProfile: profile });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    addActivity: async (req, res) => {
        try {
            const { Leads } = req.tenantModels;
            const item = await Leads.findByIdAndUpdate(req.params.id, { 
                $push: { activity: { ...req.body, date: new Date(), byUser: req.user.userDisplayName } } 
            }, { new: true });
            if (!item) return res.status(404).json({ success: false, message: "Lead not found" });
            
            // 🚀 REAL-TIME: Notify clients
            req.io.to(req.tenantDbName).emit("lead:updated", { data: item });

            res.json({ success: true, data: item });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    logSiteVisit: async (req, res) => {
        try {
            const { Leads } = req.tenantModels;
            const { selfie_url, location, remarks } = req.body;
            
            const activityEntry = {
                action: "Site Visit",
                byUser: req.user.userDisplayName,
                date: new Date(),
                metadata: { selfie_url, location, remarks }
            };

            const updateQuery = {
                $push: { activity: activityEntry }
            };

            // Capture first-time location as anchor
            const lead = await Leads.findById(req.params.id);
            if (!lead) return res.status(404).json({ success: false, message: "Lead not found" });

            if (!lead.location || !lead.location.lat) {
                updateQuery.$set = {
                    location: {
                        lat: location?.latitude || location?.lat,
                        long: location?.longitude || location?.long,
                        address: location?.formattedAddress || location?.address
                    }
                };
            }

            const updatedLead = await Leads.findByIdAndUpdate(req.params.id, updateQuery, { new: true });
            req.io.to(req.tenantDbName).emit("lead:updated", { data: updatedLead });

            res.json({ success: true, data: updatedLead });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    download: async (req, res) => {
        try {
            const { Leads } = req.tenantModels;
            const q = {};
            
            const accessibleIds = req.user?.accessibleLocationIds;
            if (req.user?.userRole !== "CorpAdmin" && accessibleIds?.length > 0) {
                q.locationId = { $in: accessibleIds };
            }

            // 📡 Progress tracking via Socket.IO
            const emit = (p, t) => req.io && req.tenantDbName && req.io.to(req.tenantDbName).emit("sync:progress", { percent: Math.round(p), text: t });

            emit(10, "Fetching leads from database...");
            const leads = await Leads.find(q).sort({ lead_no: -1 }).lean();
            console.log(`📊 [${req.tenantDbName}] Found ${leads.length} leads for export.`);

            if (leads.length === 0) {
                console.warn(`⚠️ [${req.tenantDbName}] Export failed: No leads found.`);
                return res.status(404).json({ success: false, message: "No leads found to export" });
            }

            emit(30, `Preparing Excel workbook for ${leads.length} leads...`);
            console.log(`📝 [${req.tenantDbName}] Generating Excel workbook...`);
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet("Leads");
            
            sheet.columns = [
                { header: "Lead No", key: "lead_no", width: 10 },
                { header: "Date", key: "generated_date", width: 15 },
                { header: "Product", key: "product_name", width: 25 },
                { header: "Sender Name", key: "sender_name", width: 25 },
                { header: "Mobile", key: "sender_mobile", width: 15 },
                { header: "City", key: "sender_city", width: 15 },
                { header: "State", key: "sender_state", width: 15 },
                { header: "Source", key: "source", width: 15 },
                { header: "Status", key: "status", width: 12 },
            ];

            leads.forEach((l, i) => {
                if (i % 50 === 0) {
                    const progress = 30 + ((i / leads.length) * 60);
                    emit(progress, `Processing leads: ${i + 1}/${leads.length}`);
                }
                sheet.addRow({
                    lead_no: l.lead_no,
                    generated_date: l.generated_date ? new Date(l.generated_date).toLocaleDateString() : "",
                    product_name: l.product_name,
                    sender_name: l.sender_name,
                    sender_mobile: l.sender_mobile,
                    sender_city: l.sender_city,
                    sender_state: l.sender_state,
                    source: l.source,
                    status: l.status,
                });
            });

            emit(95, "Finalizing file for download...");
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", `attachment; filename=Leads_Export_${new Date().getTime()}.xlsx`);
            await workbook.xlsx.write(res);
            emit(100, "Download started successfully!");
            res.end();
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    readInbox: async (req, res) => {
        try {
            const { ProfileMaster } = req.tenantModels;
            const profile = await ProfileMaster.findOne({}).lean();
            
            if (!profile) {
                return res.status(404).json({ success: false, message: "Corporate profile not found" });
            }

            // 🚀 UNIFIED SYNC: Fetch from all sources, merge, and save
            externalService.emitProgress(req.io, req.tenantDbName, 5, "Gateway Handshake...", "general");

            const result = await externalService.syncAllExternalLeads(
                profile, 
                req.tenantModels, 
                req.tenantDbName, 
                req.user, 
                req.io
            );

            res.json({ 
                success: result.success, 
                status: result.success ? "success" : "error",
                message: result.count > 0 ? `Synced ${result.count} new leads` : (result.message || "No new leads found"), 
                count: result.count || 0,
                total: result.count || 0
            });
        } catch (err) {
            console.error("🔴 readInbox Critical Error:", err.message);
            res.status(500).json({ success: false, message: err.message });
        }
    },

    webInquiry: async (req, res) => {
        try {
            const { Leads, Counters } = req.tenantModels; 
            const counter = await Counters.findByIdAndUpdate("lead", { $inc: { seq: 1 } }, { upsert: true, new: true });
            
            const lead = new Leads({ 
                ...req.body, 
                lead_no: counter.seq, 
                source: 'Website', 
                status: 'Recent' 
            });
            await lead.save();

            // 🚀 REAL-TIME: Notify clients
            req.io.to(req.tenantDbName).emit("lead:created", { data: lead });

            res.status(201).json({ success: true, data: lead });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    }
};

/**
 * 📦 CATALOG & PRODUCTS
 */
exports.manageCatalog = {
    generateTemplate: async (req, res) => {
        try {
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet("Products");
            sheet.columns = [
                { header: "Category", key: "category", width: 20 },
                { header: "ProductName", key: "name", width: 30 },
                { header: "Description", key: "desc", width: 40 },
                { header: "UoM", key: "uom", width: 10 },
                { header: "Price", key: "price", width: 15 }
            ];
            sheet.addRow({ category: "Hardware", name: "Sample Tool", desc: "Heavy duty", uom: "PCS", price: 100 });
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", "attachment; filename=Bulk_Product_Template.xlsx");
            await workbook.xlsx.write(res);
            res.end();
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    uploadBulk: async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });
            const { Products } = req.tenantModels;
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(req.file.buffer);
            const sheet = workbook.getWorksheet(1);
            const products = [];
            sheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                    const category = row.getCell(1).value;
                    const name = row.getCell(2).value;
                    if (name) {
                        products.push({ 
                            name, 
                            categoryName: category, 
                            description: row.getCell(3).value || "",
                            unit: row.getCell(4).value || "PCS",
                            standardRate: row.getCell(5).value || 0
                        });
                    }
                }
            });
            await Products.insertMany(products);
            res.json({ success: true, message: "Bulk upload completed" });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    }
};

exports.manageProducts = {
    list: (req, res) => manageSpoke.list(req, res, "Products"),
    create: async (req, res) => {
        try {
            const { Products } = req.tenantModels;
            const prod = new Products(req.body);
            await prod.save();
            res.status(201).json({ success: true, data: prod });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    update: (req, res) => manageSpoke.update(req, res, "Products"),
    delete: (req, res) => manageSpoke.delete(req, res, "Products")
};

/**
 * 👷 EMPLOYEES & STAFF (Identity Reverted to Standalone Users)
 */
exports.manageEmployees = {
    list: (req, res) => manageSpoke.list(req, res, "Employees"),
    create: async (req, res) => {
        try {
            const { Employees } = req.tenantModels;
            const emp = new Employees(req.body);
            await emp.save();

            // 🚀 Auto-create Ledger
            try {
                const FinanceController = require('./FinanceController');
                await FinanceController.ensureLedgerFolioInternal(req.tenantModels, {
                    name: emp.name,
                    group: "Account Payables",
                    parentGroup: "Current Liabilities",
                    refId: emp._id,
                    refType: "Staff"
                });
            } catch (err) { console.error("Employee-Ledger Auto Init Failed:", err.message); }

            res.status(201).json({ success: true, data: emp });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    update: async (req, res) => {
        try {
            const { Employees } = req.tenantModels;
            const emp = await Employees.findByIdAndUpdate(req.params.id, req.body, { new: true });
            if (!emp) return res.status(404).json({ success: false, message: "Employee not found" });

            // 🚀 Auto-create/Update Ledger Name
            try {
                const FinanceController = require('./FinanceController');
                // Ensure ledger exists (postSalaryJournal logic handles existence)
                // We don't want to post a 0 journal every update, so maybe we need a dedicated ensureLedger logic
                // But the user said "create employee ledger if not exit", so I'll just use a dedicated helper if I add one.
                // Actually, I'll just use ensureLedgerFolioInternal for simplicity if available.
                await FinanceController.ensureLedgerFolioInternal(req.tenantModels, {
                    name: emp.name,
                    group: "Account Payables",
                    refId: emp._id,
                    refType: "Staff",
                    nature: "Cr"
                });
            } catch (err) { console.error("Employee-Ledger Auto Sync Failed:", err.message); }

            res.json({ success: true, data: emp });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    delete: (req, res) => manageSpoke.delete(req, res, "Employees"),
    listAttendance: async (req, res) => {
        try {
            const { Attendance } = req.tenantModels;
            const { from_date, to_date } = req.query;
            const q = {};
            if (from_date || to_date) {
                q.date = {};
                if (from_date) q.date.$gte = new Date(from_date);
                if (to_date) q.date.$lte = new Date(to_date);
            }
            const data = await Attendance.find(q).populate("employeeId").lean();
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    markAttendance: async (req, res) => {
        try {
            const { Attendance } = req.tenantModels;
            const { employeeId, leadId, status, dutyLevel, rate, date, site_name, remarks,
                    dutyStart, dutyEnd, forcedOff, forcedOffReason, clientId, location, geoHistory } = req.body;
            const record = new Attendance({
                employeeId,
                leadId,
                clientId: clientId || null,
                status: status || "Present",
                dutyLevel: dutyLevel ?? 1,
                rate: rate || 0,
                date: date || new Date(),
                site_name,
                remarks,
                dutyStart: dutyStart ? new Date(dutyStart) : new Date(),
                dutyEnd: dutyEnd ? new Date(dutyEnd) : undefined,
                forcedOff: !!forcedOff,
                forcedOffReason: forcedOffReason || "",
                location,
                geoHistory: geoHistory || []
            });
            await record.save();
            res.status(201).json({ success: true, message: "Attendance recorded", data: record });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    deleteAttendance: (req, res) => manageSpoke.delete(req, res, "Attendance"),
    updateAttendance: async (req, res) => {
        try {
            const { Attendance } = req.tenantModels;
            const allowed = ['dutyEnd', 'forcedOff', 'forcedOffReason', 'status', 'rate', 'location', 'geoHistory'];
            const update = {};
            
            // Handle standard fields
            allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
            
            // Handle $push explicitly for geoHistory if sent in body (for cleaner array appending)
            const mongoUpdate = { ...update };
            if (req.body.$push) mongoUpdate.$push = req.body.$push;

            // Auto-calculate hours worked
            if (update.dutyEnd) {
                const existing = await Attendance.findById(req.params.id).select('dutyStart').lean();
                if (existing?.dutyStart) {
                    update.hoursWorked = parseFloat(((new Date(update.dutyEnd) - new Date(existing.dutyStart)) / 3600000).toFixed(2));
                }
            }
            const record = await Attendance.findByIdAndUpdate(req.params.id, mongoUpdate, { new: true });
            if (!record) return res.status(404).json({ success: false, message: 'Record not found' });
            res.json({ success: true, data: record });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    getRateLookup: async (req, res) => {
        try {
            const { Attendance } = req.tenantModels;
            const { employeeId, leadId } = req.query;
            if (!employeeId || !leadId) {
                return res.status(400).json({ success: false, message: "employeeId and leadId required" });
            }
            const last = await Attendance
                .findOne({ employeeId, leadId, rate: { $gt: 0 } })
                .sort({ createdAt: -1 })
                .select("rate")
                .lean();
            res.json({ success: true, rate: last?.rate || null });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    }
};

/**
 * TEAM ACCESS MANAGEMENT (Standalone Users collection)
 */
exports.manageStaff = {
    list: async (req, res) => {
        try {
            const staff = await userMaster.find({
                "accessCorporate.dbName": req.tenantDbName || req.user.dbName
            }).select("-userPassword").lean();
            res.json({ success: true, data: staff });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    create: async (req, res) => {
        // Registration logic is already in authController.register
        res.status(400).json({ success: false, message: "Use /api/auth/register for new staff" });
    },
    update: async (req, res) => {
        try {
            const staff = await userMaster.findByIdAndUpdate(req.params.id, req.body, { new: true }).select("-userPassword");
            res.json({ success: true, data: staff });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    delete: async (req, res) => {
        try {
            await userMaster.findByIdAndDelete(req.params.id);
            res.json({ success: true, message: "Staff access removed" });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    }
};

/**
 * 👥 PARTIES (Clients & Suppliers)
 */
exports.manageClients = {
    list: (req, res) => manageSpoke.list(req, res, "Parties", { type: "Client" }),
    create: async (req, res) => {
        try {
            const { Parties } = req.tenantModels;
            const item = new Parties({ ...req.body, type: "Client" });
            await item.save();
            res.status(201).json({ success: true, data: item });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    update: (req, res) => manageSpoke.update(req, res, "Parties"),
    delete: (req, res) => manageSpoke.delete(req, res, "Parties")
};

exports.manageSuppliers = {
    list: (req, res) => manageSpoke.list(req, res, "Parties", { type: "Supplier" }),
    create: async (req, res) => {
        try {
            const { Parties } = req.tenantModels;
            const item = new Parties({ ...req.body, type: "Supplier" });
            await item.save();
            res.status(201).json({ success: true, data: item });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    update: (req, res) => manageSpoke.update(req, res, "Parties"),
    delete: (req, res) => manageSpoke.delete(req, res, "Parties")
};
