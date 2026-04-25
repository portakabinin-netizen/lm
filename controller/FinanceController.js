/**
 * 🏰 FinanceController.js (v2.0 - Enhanced)
 * 
 * PURPOSE:
 * Centralized accounting manager for 'LedgerVoucherMaster' hub.
 * Handles Groups, Ledgers, and Specialized Vouchers.
 * Includes auto-initialization for standard accounting structures.
 */

const mongoose = require("mongoose");

/**
 * 🛠️ Internal Helper: Ensure Ledger Folio
 * Used for auto-creating ledgers for Leads/Suppliers/Employees.
 */
exports.ensureLedgerFolioInternal = async (tenantModels, options) => {
    const { name, group, refId, refType, openingBalance, nature } = options;
    const { Groups, Ledgers } = tenantModels;

    // 1. Find or create group
    let groupDoc = await Groups.findOne({ name: { $regex: new RegExp(`^${group}$`, "i") } });
    if (!groupDoc) {
        groupDoc = new Groups({ name: group, nature: nature || "Assets" });
        await groupDoc.save();
    }

    // 2. Find or create ledger
    let ledger = await Ledgers.findOne({
        $or: [
            { name: { $regex: new RegExp(`^${name}$`, "i") } },
            ... (refId ? [{ refId }] : [])
        ]
    });

    if (!ledger) {
        ledger = new Ledgers({
            name,
            groupId: groupDoc._id,
            refId: refId || null,
            refType: refType || "Manual",
            openingBal: openingBalance || 0,
            nature: nature || (groupDoc.nature === "Assets" || groupDoc.nature === "Expenses" ? "Dr" : "Cr")
        });
        await ledger.save();
    }

    return ledger;
};

/**
 * 📊 ACCOUNTING MASTER & INIT
 */
exports.getAccountingMaster = async (req, res) => {
    try {
        const { Groups, Ledgers } = req.tenantModels;
        let groups = await Groups.find({}).lean();

        // Auto-initialize standard Indian Accounting Groups if empty
        if (groups.length === 0) {
            const defaults = [
                { name: "Capital Account", nature: "Liabilities" },
                { name: "Sundry Creditors", nature: "Liabilities" },
                { name: "Sundry Debtors", nature: "Assets" },
                { name: "Bank Accounts", nature: "Assets" },
                { name: "Cash-in-hand", nature: "Assets" },
                { name: "Sales Accounts", nature: "Income" },
                { name: "Purchase Accounts", nature: "Expenses" },
                { name: "Indirect Expenses", nature: "Expenses" }
            ];
            groups = await Groups.insertMany(defaults);
            
            // Auto-create standard ledgers
            const cashG = groups.find(g => g.name === "Cash-in-hand");
            if (cashG) {
                const cashL = new Ledgers({ name: "Cash", groupId: cashG._id, openingBal: 0, nature: "Dr" });
                await cashL.save();
            }
        }

        const ledgers = await Ledgers.find({}).lean();
        res.json({ success: true, data: { groups, ledgers } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/**
 * 📑 GROUPS MANAGEMENT
 */
exports.manageGroups = {
    list: async (req, res) => {
        try {
            const { Groups } = req.tenantModels;
            const groups = await Groups.find({}).lean();
            res.json({ success: true, data: groups });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    create: async (req, res) => {
        try {
            const { Groups } = req.tenantModels;
            const group = new Groups(req.body);
            await group.save();
            
            // 🚀 REAL-TIME
            req.io.to(req.tenantDbName).emit("group:created", { data: group });

            res.status(201).json({ success: true, data: group });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    update: async (req, res) => {
        try {
            const { Groups } = req.tenantModels;
            const group = await Groups.findByIdAndUpdate(req.params.id, req.body, { new: true });
            if (!group) return res.status(404).json({ success: false, message: "Group not found" });
            res.json({ success: true, data: group });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    delete: async (req, res) => {
        try {
            const { Groups } = req.tenantModels;
            await Groups.findByIdAndDelete(req.params.id);
            
            // 🚀 REAL-TIME
            req.io.to(req.tenantDbName).emit("group:deleted", { id: req.params.id });

            res.json({ success: true, message: "Group deleted" });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    }
};

/**
 * 📖 LEDGER FOLIOS MANAGEMENT
 */
exports.manageLedgers = {
    list: async (req, res) => {
        try {
            const { Ledgers } = req.tenantModels;
            const ledgers = await Ledgers.find({}).lean();
            res.json({ success: true, data: ledgers });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    create: async (req, res) => {
        try {
            const ledger = await exports.ensureLedgerFolioInternal(req.tenantModels, req.body);
            
            // 🚀 REAL-TIME
            req.io.to(req.tenantDbName).emit("ledger:created", { data: ledger });

            res.status(201).json({ success: true, data: ledger });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    update: async (req, res) => {
        try {
            const { Ledgers } = req.tenantModels;
            const ledger = await Ledgers.findByIdAndUpdate(req.params.id, req.body, { new: true });
            if (!ledger) return res.status(404).json({ success: false, message: "Ledger not found" });
            res.json({ success: true, data: ledger });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    delete: async (req, res) => {
        try {
            const { Ledgers } = req.tenantModels;
            await Ledgers.findByIdAndDelete(req.params.id);
            
            // 🚀 REAL-TIME
            req.io.to(req.tenantDbName).emit("ledger:deleted", { id: req.params.id });

            res.json({ success: true, message: "Ledger deleted" });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    
    // Lookups for Linkage
    lookupEntities: async (req, res) => {
        try {
            const { type, query } = req.query; // Leads, Vendors
            const { Leads, Parties } = req.tenantModels;
            const q = query?.toLowerCase() || "";
            let results = [];
            
            if (type === "Leads") {
                results = await Leads.find({ 
                    status: "Accepted", 
                    sender_name: { $regex: new RegExp(q, "i") } 
                }).limit(10).lean();
            } else if (type === "Vendors") {
                results = await Parties.find({ 
                    type: "Supplier", 
                    name: { $regex: new RegExp(q, "i") } 
                }).limit(10).lean();
            }
            
            res.json({ success: true, data: results });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    }
};

/**
 * 🎫 VOUCHERS MANAGEMENT
 */
exports.manageVouchers = {
    list: async (req, res) => {
        try {
            const { Vouchers } = req.tenantModels;
            const { type, locationId } = req.query;
            
            const q = {};
            if (type) q.voucherType = type;
            
            // Enforce location filtering for non-CorpAdmins
            const accessibleIds = req.user?.accessibleLocationIds;
            if (req.user?.userRole !== "CorpAdmin" && accessibleIds?.length > 0) {
                q.locationId = { $in: accessibleIds };
            } else if (locationId) {
                q.locationId = locationId;
            }

            const vouchers = await Vouchers.find(q).sort({ date: -1 }).lean();
            res.json({ success: true, data: vouchers });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    create: async (req, res) => {
        try {
            const { Vouchers, Counters } = req.tenantModels;
            const { voucherType, locationId } = req.body;
            
            if (!locationId) return res.status(400).json({ success: false, message: "locationId is required" });

            // Location-specific counter
            const counterId = `voucher_${voucherType}_${locationId}`;
            const counter = await Counters.findByIdAndUpdate(counterId, { $inc: { seq: 1 } }, { upsert: true, new: true });
            
            const voucher = new Vouchers({ 
                ...req.body, 
                voucherNo: `${voucherType.substring(0,3).toUpperCase()}-${locationId.toString().slice(-4)}-${counter.seq}` 
            });
            await voucher.save();

            // 🚀 REAL-TIME: Notify clients
            req.io.to(req.tenantDbName).emit("voucher:created", { data: voucher });

            res.status(201).json({ success: true, data: voucher });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    getByLedger: async (req, res) => {
        try {
            const { ledgerId } = req.params;
            const { Vouchers } = req.tenantModels;
            
            const q = { "entries.ledgerId": ledgerId };
            const accessibleIds = req.user?.accessibleLocationIds;
            if (req.user?.userRole !== "CorpAdmin" && accessibleIds?.length > 0) {
                q.locationId = { $in: accessibleIds };
            }

            const vouchers = await Vouchers.find(q).sort({ date: -1 }).lean();
            res.json({ success: true, data: vouchers });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    }
};

/**
 * 📄 COMMERCIAL DOCUMENTS (Quotations, POs, Invoices)
 */
const manageCommercial = (modelName, docPrefix) => ({
    list: async (req, res) => {
        try {
            const Model = req.tenantModels[modelName];
            const { locationId, status } = req.query;
            
            const q = {};
            if (status) q.status = status;
            
            // Enforce location filtering for non-CorpAdmins
            const accessibleIds = req.user?.accessibleLocationIds;
            if (req.user?.userRole !== "CorpAdmin" && accessibleIds?.length > 0) {
                q.locationId = { $in: accessibleIds };
            } else if (locationId) {
                q.locationId = locationId;
            }

            const data = await Model.find(q).sort({ date: -1 }).lean();
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    get: async (req, res) => {
        try {
            const Model = req.tenantModels[modelName];
            const item = await Model.findById(req.params.id).lean();
            if (!item) return res.status(404).json({ success: false, message: "Document not found" });
            res.json({ success: true, data: item });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    create: async (req, res) => {
        try {
            const Model = req.tenantModels[modelName];
            const { Counters } = req.tenantModels;
            const { locationId } = req.body;

            if (!locationId) return res.status(400).json({ success: false, message: "locationId is required" });

            const counterId = `${modelName.toLowerCase()}_${locationId}`;
            const counter = await Counters.findByIdAndUpdate(counterId, { $inc: { seq: 1 } }, { upsert: true, new: true });

            const doc = new Model({
                ...req.body,
                docNo: `${docPrefix}-${locationId.toString().slice(-4)}-${counter.seq}`
            });
            await doc.save();
            
            // 🚀 REAL-TIME
            req.io.to(req.tenantDbName).emit(`${modelName.toLowerCase()}:created`, { data: doc });

            res.status(201).json({ success: true, data: doc });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    update: async (req, res) => {
        try {
            const Model = req.tenantModels[modelName];
            const item = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
            if (!item) return res.status(404).json({ success: false, message: "Document not found" });
            
            // 🚀 REAL-TIME
            req.io.to(req.tenantDbName).emit(`${modelName.toLowerCase()}:updated`, { data: item });

            res.json({ success: true, data: item });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    delete: async (req, res) => {
        try {
            const Model = req.tenantModels[modelName];
            await Model.findByIdAndDelete(req.params.id);
            
            // 🚀 REAL-TIME
            req.io.to(req.tenantDbName).emit(`${modelName.toLowerCase()}:deleted`, { id: req.params.id });

            res.json({ success: true, message: "Document deleted" });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    }
});

exports.manageQuotations = manageCommercial("Quotations", "QTN");
exports.managePurchaseOrders = manageCommercial("PurchaseOrders", "PO");
exports.manageTaxInvoices = manageCommercial("TaxInvoices", "INV");
