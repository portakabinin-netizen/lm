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
const { resolveDatePreset } = require("../utils/dateUtils");

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
            const { id } = req.params;
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({ success: false, message: "Invalid ID format" });
            }
            const Model = req.tenantModels[modelName];
            const item = await Model.findById(id);
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

    getAllGallery: async (req, res) => {
        try {
            const { ProfileMaster } = req.tenantModels || {};
            const dbName = req.tenantDbName || req.user?.dbName;

            if (!dbName) return res.status(400).json({ success: false, message: "Missing tenant identification" });

            let customConfig = null;
            try {
                if (ProfileMaster) {
                    const profile = await ProfileMaster.findOne({}).lean();
                    if (profile?.apiUrls?.cloudinary?.isActive) {
                        customConfig = profile.apiUrls.cloudinary;
                    }
                }
            } catch (perr) {
                console.error("🔴 ProfileMaster query error:", perr.message);
            }

            const result = await externalService.fetchLeadsMedia(dbName, customConfig).catch((err) => {
                console.error("🔴 Fetch leads media error:", err.message);
                return { resources: [] };
            });

            const urls = (result.resources || []).map(r => r.secure_url);
            res.json({ success: true, data: urls });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
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
            
            if (fromDate || toDate) {
                const dateQuery = {};
                if (fromDate) {
                    const d = resolveDatePreset(fromDate);
                    if (d instanceof Date && !isNaN(d.getTime())) dateQuery.$gte = d;
                }
                if (toDate) {
                    const d = resolveDatePreset(toDate);
                    if (d instanceof Date && !isNaN(d.getTime())) dateQuery.$lte = d;
                }
                if (Object.keys(dateQuery).length > 0) q.generated_date = dateQuery;
            }
            if (source) q.source = source;

            // 1. Status Aggregation (Summary)
            const statusAgg = await Leads.aggregate([
                { $match: q },
                { $group: { _id: "$status", value: { $sum: 1 } } },
                { $project: { label: "$_id", value: 1, _id: 0 } }
            ]);

            // 2. Source-wise Grouping (Strict Quadrant Metrics)
            const sourceAgg = await Leads.aggregate([
                { $match: q },
                {
                    $group: {
                        _id: "$source",
                        totalLeads: { $sum: 1 },
                        posCount: {
                            $sum: {
                                $cond: [
                                    { $in: ["$status", ["Tax Invoice", "Fully Paid"]] },
                                    1,
                                    0
                                ]
                            }
                        },
                        recycleCount: {
                            $sum: {
                                $cond: [
                                    { $in: ["$status", ["Recycle", "Recycled", "recycled"]] },
                                    1,
                                    0
                                ]
                            }
                        },
                        pendingCount: {
                            $sum: {
                                $cond: [
                                    { $in: ["$status", ["Recent", "Engaged", "Accepted"]] },
                                    1,
                                    0
                                ]
                            }
                        }
                    }
                },
                { 
                    $project: { 
                        label: { $ifNull: ["$_id", "Other"] }, 
                        total: "$totalLeads", 
                        posCount: 1,
                        recycleCount: 1,
                        pendingCount: 1,
                        _id: 0 
                    } 
                },
                { $sort: { total: -1 } }
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
            const byUser = req.user?.userDisplayName || req.body.byUser || "System";
            const item = await Leads.findByIdAndUpdate(req.params.id, { 
                $push: { activity: { ...req.body, date: new Date(), byUser } } 
            }, { new: true });
            if (!item) return res.status(404).json({ success: false, message: "Lead not found" });
            
            // 🚀 REAL-TIME: Notify clients
            req.io.to(req.tenantDbName).emit("lead:updated", { data: item });

            res.json({ success: true, data: item });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    logSiteVisit: async (req, res) => {
        try {
            const { Leads, Attendance } = req.tenantModels;
            const { selfie_url, location, remarks } = req.body;
            
            const activityEntry = {
                action: "Site Visit",
                byUser: req.user?.userDisplayName || "System",
                date: new Date(),
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
            
            // 🚀 Also append to active attendance geoHistory if session exists
            const userId = req.user._id;
            const active = await Attendance.findOne({
                employeeId: userId,
                $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }]
            });
            if (active) {
                active.geoHistory.push({
                    lat: location?.latitude || location?.lat,
                    long: location?.longitude || location?.long,
                    timestamp: new Date(),
                    note: `Site Visit: ${lead.sender_name}`
                });
                await active.save();
            }

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

            if (leads.length === 0) {
                console.warn(`⚠️ [${req.tenantDbName}] Export failed: No leads found.`);
                return res.status(404).json({ success: false, message: "No leads found to export" });
            }

            emit(30, `Preparing Excel workbook for ${leads.length} leads...`);
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
 * 🏢 CORPORATE PROFILE MANAGEMENT
 */
exports.manageProfile = {
    get: async (req, res) => {
        try {
            const { ProfileMaster } = req.tenantModels;
            const profile = await ProfileMaster.findOne({}).lean();
            res.json({ success: true, data: profile });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    update: async (req, res) => {
        try {
            const { ProfileMaster } = req.tenantModels;
            const profile = await ProfileMaster.findOneAndUpdate({}, req.body, { new: true, upsert: true });
            res.json({ success: true, data: profile });
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
    get: (req, res) => manageSpoke.getById(req, res, "Employees"),
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
            const { from_date, to_date, employeeId } = req.query;
            let q = {};

            if (employeeId) {
                q.employeeId = employeeId;
            }

            if (from_date || to_date) {
                const dateFilter = {};
                if (from_date) {
                    const d = resolveDatePreset(from_date);
                    if (d) dateFilter.$gte = d;
                }
                if (to_date) {
                    const d = resolveDatePreset(to_date);
                    if (d) dateFilter.$lte = d;
                }
                
                if (Object.keys(dateFilter).length > 0) {
                    // Include either the date range OR anything that is still "On Duty" (if filtering for specific user)
                    if (q.employeeId) {
                        q = {
                            employeeId: q.employeeId,
                            $or: [
                                { date: dateFilter },
                                { dutyEnd: { $exists: false } },
                                { dutyEnd: null }
                            ]
                        };
                    } else {
                        q.date = dateFilter;
                    }
                }
            }
            const data = await Attendance.find(q).populate("employeeId").lean();
            res.json({ success: true, data });
        } catch (err) { 
            console.error("🔴 [Error] listAttendance Failed:", err);
            res.status(500).json({ success: false, message: err.message }); 
        }
    },
    markAttendance: async (req, res) => {
        try {
            const { Attendance } = req.tenantModels;
            const {
                employeeId, leadId, status, dutyLevel, rate, date, site_name, remarks,
                dutyStart, dutyEnd, forcedOff, forcedOffReason, clientId, location, geoHistory,
                // Shift fields
                shiftCode, shiftType, shiftPeriod, shiftLockHours
            } = req.body;

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
                geoHistory: geoHistory || [],
                // Shift
                shiftCode: shiftCode || null,
                shiftType: shiftType || '8hr',
                shiftPeriod: shiftPeriod || 'Morning',
                shiftLockHours: shiftLockHours || (shiftType === '12hr' ? 12 : 8)
            });
            await record.save();
            res.status(201).json({ success: true, message: "Attendance recorded", data: record });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    deleteAttendance: (req, res) => manageSpoke.delete(req, res, "Attendance"),
    updateAttendance: async (req, res) => {
        try {
            const { Attendance } = req.tenantModels;
            const allowed = [
                'dutyEnd', 'forcedOff', 'forcedOffReason', 'status', 'rate',
                'location', 'geoHistory', 'emergencyOff', 'emergencyReason',
                'emergencyByUser', 'shiftCode', 'shiftType', 'shiftPeriod'
            ];
            const update = {};
            allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

            // Allow $push for geoHistory ticks from background task
            const mongoUpdate = Object.keys(update).length ? { $set: update } : {};
            if (req.body.$push) mongoUpdate.$push = req.body.$push;

            // Auto-calculate hours worked on duty end
            if (update.dutyEnd) {
                const existing = await Attendance.findById(req.params.id).select('dutyStart').lean();
                if (existing?.dutyStart) {
                    const hrs = (new Date(update.dutyEnd) - new Date(existing.dutyStart)) / 3600000;
                    update.hoursWorked = parseFloat(Math.max(0, hrs).toFixed(2));
                    mongoUpdate.$set = { ...update };
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
    },
    getActiveAttendance: async (req, res) => {
        try {
            const { Attendance } = req.tenantModels;
            const { employeeId } = req.query;
            if (!employeeId) return res.status(400).json({ success: false, message: "employeeId required" });

            // Find an open session (dutyEnd not exists or null)
            const active = await Attendance.findOne({
                employeeId,
                $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }]
            }).sort({ dutyStart: -1 }).lean();

            res.json({ success: true, data: active || null });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    toggleAttendance: async (req, res) => {
        try {
            const { Attendance } = req.tenantModels;
            const {
                employeeId, type, lat, long, address,
                shiftCode, shiftType, shiftPeriod, shiftLockHours,
                site_name, siteId, leadId,
                forcedOff, forcedOffReason, emergencyOff, emergencyReason
            } = req.body;

            if (!employeeId || !type) return res.status(400).json({ success: false, message: "Missing params" });

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const queryId = mongoose.isValidObjectId(employeeId) ? new mongoose.Types.ObjectId(employeeId) : employeeId;

            // Find open session (not necessarily today — shift C and E can span midnight)
            let record = await Attendance.findOne({
                employeeId: queryId,
                $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }]
            }).sort({ dutyStart: -1 });

            if (type === 'ON') {
                if (record) {
                    // Already ON duty — just return current session
                    return res.json({ success: true, data: record, message: 'Already on duty' });
                }
                // Start new session
                const now = new Date();
                const lockHrs = shiftLockHours || (shiftType === '12hr' ? 12 : 8);
                const scheduledEnd = new Date(now.getTime() + lockHrs * 3600000);
                record = new Attendance({
                    employeeId,
                    date: now,
                    dutyStart: now,
                    dutyEndScheduled: scheduledEnd,
                    shiftCode: shiftCode || null,
                    shiftType: shiftType || '8hr',
                    shiftPeriod: shiftPeriod || 'Morning',
                    shiftLockHours: lockHrs,
                    location: { lat, long, address: address || '' },
                    geoHistory: [{ lat, long, address: address || '', type: 'start', timestamp: now }],
                    status: 'Present',
                    site_name: site_name || 'HQ/Remote',
                    siteId: siteId || null,
                    leadId: leadId || null
                });
                await record.save();
                req.io.to(req.tenantDbName).emit('attendance:duty_on', {
                    employeeId, attendanceId: record._id, shiftCode, shiftPeriod
                });
                return res.json({ success: true, data: record, message: 'Duty started' });

            } else { // OFF
                if (!record) return res.status(404).json({ success: false, message: "No active duty session found" });

                const now = new Date();
                const lockHrs = record.shiftLockHours || 8;
                const elapsedHrs = (now - record.dutyStart) / 3600000;
                const isLocked = elapsedHrs < lockHrs;

                // Shift lock enforcement
                const requesterRole = req.user?.userRole;
                const canOverride = ['CorpAdmin', 'Project', 'Admin'].includes(requesterRole);

                if (isLocked && !forcedOff && !emergencyOff && !canOverride) {
                    return res.status(403).json({
                        success: false,
                        locked: true,
                        message: `Shift lock active. ${lockHrs}h shift not complete (${elapsedHrs.toFixed(1)}h elapsed). Contact supervisor to override.`,
                        remainingHrs: parseFloat((lockHrs - elapsedHrs).toFixed(2))
                    });
                }

                record.dutyEnd = now;
                record.location = { ...record.location, lat, long, address: address || record.location?.address };
                record.geoHistory.push({ lat, long, address: address || '', type: 'end', timestamp: now });
                record.hoursWorked = parseFloat(Math.max(0, elapsedHrs).toFixed(2));

                if (forcedOff) { record.forcedOff = true; record.forcedOffReason = forcedOffReason || 'Manual override'; }
                if (emergencyOff) {
                    record.emergencyOff = true;
                    record.emergencyReason = emergencyReason || 'Emergency shutdown';
                    record.emergencyByUser = req.user?.userDisplayName || 'System';
                }
                await record.save();

                req.io.to(req.tenantDbName).emit('attendance:duty_off', {
                    employeeId, attendanceId: record._id, hoursWorked: record.hoursWorked, emergencyOff: !!emergencyOff
                });
                return res.json({ success: true, data: record, message: 'Duty ended' });
            }
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    /**
     * 🆘 Emergency End for a SINGLE employee
     * Authorized roles: CorpAdmin / Project / Admin only
     * Body: { employeeId, reason }
     */
    emergencyEndEmployee: async (req, res) => {
        try {
            const requesterRole = req.user?.userRole;
            if (!['CorpAdmin', 'Project', 'Admin'].includes(requesterRole)) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied. Only Project Users, Admin and CorpAdmin can trigger emergency off for an employee.'
                });
            }

            const { Attendance } = req.tenantModels;
            const { employeeId, reason } = req.body;
            if (!employeeId) return res.status(400).json({ success: false, message: 'employeeId is required' });

            const now = new Date();
            const byUser = req.user?.userDisplayName || 'System';
            const queryId = mongoose.isValidObjectId(employeeId)
                ? new mongoose.Types.ObjectId(employeeId) : employeeId;

            // Find the open session for this employee
            const record = await Attendance.findOne({
                employeeId: queryId,
                $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }]
            });

            if (!record) {
                return res.status(404).json({ success: false, message: 'No active duty session found for this employee' });
            }

            const elapsedHrs = (now - record.dutyStart) / 3600000;
            record.dutyEnd         = now;
            record.emergencyOff    = true;
            record.emergencyReason = reason || 'Emergency end by supervisor';
            record.emergencyByUser = byUser;
            record.forcedOff       = true;
            record.forcedOffReason = 'Emergency End by Supervisor';
            record.hoursWorked     = parseFloat(Math.max(0, elapsedHrs).toFixed(2));
            await record.save();

            // Notify the specific employee via Socket.IO
            req.io.to(req.tenantDbName).emit('attendance:emergency_end', {
                employeeId: String(employeeId),
                attendanceId: record._id,
                reason: record.emergencyReason,
                byUser,
                at: now.toISOString()
            });

            res.json({ success: true, message: `Emergency duty end applied for employee`, data: record });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    /**
     * 🔄 Continue Next Shift (Double Shift)
     * Closes current shift attendance, opens a NEW attendance record for the next shift.
     * Sends a double-shift notification to CorpAdmin / Admin / Project users.
     * Body: { employeeId, nextShiftCode, nextShiftType, nextShiftPeriod, lat, long, address, site_name, siteId, leadId }
     */
    continueShift: async (req, res) => {
        try {
            const { Attendance } = req.tenantModels;
            const {
                employeeId, nextShiftCode, nextShiftType, nextShiftPeriod,
                lat, long, address, site_name, siteId, leadId
            } = req.body;

            if (!employeeId || !nextShiftCode) {
                return res.status(400).json({ success: false, message: 'employeeId and nextShiftCode are required' });
            }

            const queryId = mongoose.isValidObjectId(employeeId)
                ? new mongoose.Types.ObjectId(employeeId) : employeeId;

            // 1. Find current open session
            const current = await Attendance.findOne({
                employeeId: queryId,
                $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }]
            }).sort({ dutyStart: -1 });

            if (!current) {
                return res.status(404).json({ success: false, message: 'No active duty session to continue from' });
            }

            const now = new Date();
            const lockHrs = current.shiftLockHours || 8;
            const elapsedHrs = (now - current.dutyStart) / 3600000;

            // Enforce: current shift must be at least complete (lock period elapsed)
            if (elapsedHrs < lockHrs) {
                return res.status(403).json({
                    success: false,
                    locked: true,
                    message: `Current shift ${current.shiftCode} not yet complete. ${(lockHrs - elapsedHrs).toFixed(1)}h remaining.`,
                    remainingHrs: parseFloat((lockHrs - elapsedHrs).toFixed(2))
                });
            }

            // 2. Close current shift
            current.dutyEnd     = now;
            current.hoursWorked = parseFloat(elapsedHrs.toFixed(2));
            current.geoHistory.push({ lat, long, address: address || '', type: 'end', timestamp: now });
            await current.save();

            // 3. Determine next shift lock hours
            const nextLockHrs = nextShiftType === '12hr' ? 12 : 8;
            const nextScheduledEnd = new Date(now.getTime() + nextLockHrs * 3600000);

            // 4. Create new attendance record for next shift (marked as double shift)
            const nextRecord = new Attendance({
                employeeId,
                date: now,
                dutyStart: now,
                dutyEndScheduled: nextScheduledEnd,
                shiftCode: nextShiftCode,
                shiftType: nextShiftType || '8hr',
                shiftPeriod: nextShiftPeriod || 'Morning',
                shiftLockHours: nextLockHrs,
                isDoubleShift: true,
                previousShiftId: current._id,
                doubleShiftNotified: true,
                location: { lat, long, address: address || '' },
                geoHistory: [{ lat, long, address: address || '', type: 'start', timestamp: now }],
                status: 'Present',
                site_name: site_name || current.site_name || 'HQ/Remote',
                siteId: siteId || current.siteId || null,
                leadId: leadId || current.leadId || null,
                rate: current.rate || 0
            });
            await nextRecord.save();

            // 5. Broadcast double-shift notification to supervisors
            const notification = {
                type: 'double_shift',
                employeeId: String(employeeId),
                previousShiftCode: current.shiftCode,
                nextShiftCode,
                attendanceId: nextRecord._id,
                at: now.toISOString(),
                message: `⚠️ Double Shift Alert: Employee continued into Shift ${nextShiftCode} after completing Shift ${current.shiftCode}.`
            };
            req.io.to(req.tenantDbName).emit('attendance:double_shift', notification);
            // Also send as broadcast alert targeted at supervisors
            req.io.to(req.tenantDbName).emit('admin:broadcast', {
                id: new mongoose.Types.ObjectId().toString(),
                title: '⚠️ Double Shift Alert',
                message: notification.message,
                priority: 'urgent',
                targetRoles: ['CorpAdmin', 'Admin', 'Project'],
                sentBy: 'System',
                sentByRole: 'System',
                at: now.toISOString()
            });

            res.json({
                success: true,
                message: `Shift ${current.shiftCode} closed. Shift ${nextShiftCode} started (Double Shift).`,
                closedShift: current,
                newShift: nextRecord
            });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    /** 📢 Send Broadcast Alert — CorpAdmin / Admin only */
    sendBroadcast: async (req, res) => {
        try {
            const requesterRole = req.user?.userRole;
            if (!['CorpAdmin', 'Admin'].includes(requesterRole)) {
                return res.status(403).json({ success: false, message: 'Only CorpAdmin and Admin can send broadcasts.' });
            }

            const { title, message, priority, targetRoles } = req.body;
            if (!message || !message.trim()) {
                return res.status(400).json({ success: false, message: 'Message is required' });
            }

            const payload = {
                id: new mongoose.Types.ObjectId().toString(),
                title: title || 'Message from Management',
                message: message.trim(),
                priority: priority || 'normal',   // 'normal' | 'urgent'
                targetRoles: targetRoles || [],    // empty = all users
                sentBy: req.user?.userDisplayName || 'Admin',
                sentByRole: requesterRole,
                corporateName: req.user?.corporateName || '',
                at: new Date().toISOString()
            };

            // Emit to all users in this tenant's room
            req.io.to(req.tenantDbName).emit('admin:broadcast', payload);

            res.json({ success: true, message: 'Broadcast sent successfully', data: payload });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    listActiveStaff: async (req, res) => {
        try {
            if (!req.tenantModels) {
                console.error("❌ [FAIL] req.tenantModels is MISSING");
                return res.status(500).json({ success: false, message: "Tenant models not initialized" });
            }

            const { Attendance, Employees } = req.tenantModels;
            if (!Attendance) {
                console.error("❌ [FAIL] Attendance model is MISSING");
                return res.status(500).json({ success: false, message: "Attendance model missing on tenant" });
            }
            if (!Employees) {
                console.error("❌ [FAIL] Employees model is MISSING");
                return res.status(500).json({ success: false, message: "Employees model missing on tenant" });
            }

            const connState = Attendance.db?.readyState;
            if (connState !== 1) {
                console.error("❌ [FAIL] Database is NOT connected! State:", connState);
                return res.status(500).json({ success: false, message: "Database not connected" });
            }

            let active;
            try {
                active = await Attendance.find({
                    $or: [
                        { dutyEnd: { $exists: false } },
                        { dutyEnd: null },
                        { dutyEnd: "" }
                    ]
                }).lean();
            } catch (dbErr) {
                console.error("❌ [STEP 1] FAILED — Attendance.find() threw:", dbErr.message);
                return res.status(500).json({ success: false, message: "Attendance DB query failed: " + dbErr.message });
            }

            if (active.length === 0) {
                return res.json({ success: true, data: [] });
            }

            const employeeIds = active
                .map(a => a.employeeId)
                .filter(id => {
                    if (!id) return false;
                    const idStr = String(id._id || id);
                    return mongoose.Types.ObjectId.isValid(idStr);
                })
                .map(id => String(id._id || id));

            let emps = [];
            try {
                emps = await Employees.find({ _id: { $in: employeeIds } }).select("name photo_url role").lean();
            } catch (empErr) {
                // Non-fatal
            }

            let users = [];
            try {
                users = await userMaster.find({ _id: { $in: employeeIds } })
                    .select("userDisplayName userProfileImage userRole")
                    .lean()
                    .maxTimeMS(5000);
            } catch (userErr) {
                // Non-fatal
            }

            const data = active.map((a) => {
                let currentLat = a.location?.lat;
                let currentLong = a.location?.long;

                if (a.geoHistory && a.geoHistory.length > 0) {
                    const latest = a.geoHistory[a.geoHistory.length - 1];
                    if (latest?.lat && latest?.long) {
                        currentLat = latest.lat;
                        currentLong = latest.long;
                    }
                }

                const targetId = String(a.employeeId?._id || a.employeeId);
                const emp = emps.find(e => String(e._id) === targetId);
                const user = users.find(u => String(u._id) === targetId);
                const displayName = emp?.name || user?.userDisplayName || "Unknown";

                return {
                    ...a,
                    location: { ...(a.location || {}), lat: currentLat, long: currentLong },
                    displayName,
                    photo: emp?.photo_url || user?.userProfileImage || null,
                    role: emp?.role || user?.userRole || "Staff"
                };
            });

            res.json({ success: true, data });

        } catch (err) {
            console.error("🔴 [CRITICAL] listActiveStaff UNEXPECTED CRASH:");
            console.error("   Message:", err.message);
            console.error("   Stack:\n", err.stack);
            res.status(500).json({ success: false, message: err.message, stack: err.stack });
        }
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
