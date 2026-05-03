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
    const { name, group, parentGroup, refId, refType, openingBalance, nature } = options;
    const { Groups, Ledgers } = tenantModels;

    // 1. Find or create group
    let groupDoc = await Groups.findOne({ name: { $regex: new RegExp(`^${group}$`, "i") } });
    if (!groupDoc) {
        groupDoc = new Groups({ 
            name: group, 
            parentGroup: parentGroup || null,
            nature: nature || (parentGroup === "Liabilities" || group === "Current Liabilities" ? "Liabilities" : "Assets") 
        });
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
            nature: (groupDoc.nature === "Assets" || groupDoc.nature === "Expenses") ? "Dr" : "Cr"
        });
        await ledger.save();
    } else if (name && ledger.name !== name) {
        // Sync name if changed
        ledger.name = name;
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
                { name: "Direct Expenses", nature: "Expenses" },
                { name: "Indirect Expenses", nature: "Expenses" },
                { name: "Current Assets", nature: "Assets" },
                { name: "Current Liabilities", nature: "Liabilities" }
            ];
            groups = await Groups.insertMany(defaults);
        }

        // Proactive Ledger Initialization (Ensure core ledgers always exist)
        const ledgers = await Ledgers.find({}).lean();
        if (ledgers.length < 5) { // If very few ledgers, seed defaults
            const newLedgers = [];
            
            const cashG = groups.find(g => g.name === "Cash-in-hand");
            if (cashG) {
                const hasCash = ledgers.some(l => l.name === "Cash Book");
                if (!hasCash) {
                    newLedgers.push({ name: "Cash", groupId: cashG._id, openingBal: 0, nature: "Dr", isDefault: true });
                    newLedgers.push({ name: "Cash Book", groupId: cashG._id, openingBal: 0, nature: "Dr", isDefault: true });
                    newLedgers.push({ name: "Petty Cash", groupId: cashG._id, openingBal: 0, nature: "Dr", isDefault: true });
                }
            }
            
            const salesG = groups.find(g => g.name === "Sales Accounts");
            if (salesG && !ledgers.some(l => l.name.includes("Sales"))) {
                newLedgers.push({ name: "Sales", groupId: salesG._id, openingBal: 0, nature: "Cr", isDefault: true });
                newLedgers.push({ name: "Local Sales", groupId: salesG._id, openingBal: 0, nature: "Cr", isDefault: true });
            }
            
            const purcG = groups.find(g => g.name === "Purchase Accounts");
            if (purcG && !ledgers.some(l => l.name.includes("Purchase"))) {
                newLedgers.push({ name: "Purchase", groupId: purcG._id, openingBal: 0, nature: "Dr", isDefault: true });
                newLedgers.push({ name: "Local Purchase", groupId: purcG._id, openingBal: 0, nature: "Dr", isDefault: true });
            }

            const directExpG = groups.find(g => g.name === "Direct Expenses");
            if (directExpG && !ledgers.some(l => l.name === "Salary & Wages")) {
                newLedgers.push({ name: "Salary & Wages", groupId: directExpG._id, openingBal: 0, nature: "Dr", isDefault: true });
            }
            
            const debtG = groups.find(g => g.name === "Sundry Debtors");
            if (debtG && !ledgers.some(l => l.name === "Default Client")) {
                newLedgers.push({ name: "Default Client", groupId: debtG._id, openingBal: 0, nature: "Dr", isDefault: true });
            }
            
            const credG = groups.find(g => g.name === "Sundry Creditors");
            if (credG && !ledgers.some(l => l.name === "Default Vendor")) {
                newLedgers.push({ name: "Default Vendor", groupId: credG._id, openingBal: 0, nature: "Cr", isDefault: true });
            }

            if (newLedgers.length > 0) {
                await Ledgers.insertMany(newLedgers);
            }
        }

        const finalLedgers = await Ledgers.find({}).lean();
        res.json({ success: true, data: { groups, ledgers: finalLedgers } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/**
 * 📈 FINANCE ANALYTICS
 */
exports.getAnalytics = async (req, res) => {
    try {
        const { Quotations, TaxInvoices, PurchaseOrders } = req.tenantModels;
        
        const qList = await Quotations.find({}).lean();
        const iList = await TaxInvoices.find({}).lean();
        const pList = await PurchaseOrders.find({}).lean();
        
        let quotationAmount = 0;
        qList.forEach(q => quotationAmount += (q.totals?.grandTotal || 0));
        
        let invoiceAmount = 0;
        iList.forEach(i => invoiceAmount += (i.totals?.grandTotal || 0));
        
        let poAmount = 0;
        pList.forEach(p => poAmount += (p.totals?.grandTotal || 0));

        // Month-wise Aggregation (Last 6 Months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthWiseAgg = await TaxInvoices.aggregate([
            { $match: { date: { $gte: sixMonthsAgo } } },
            { 
                $group: { 
                    _id: { $dateToString: { format: "%Y-%m", date: "$date" } }, 
                    tax: { $sum: "$totals.total_tax" },
                    revenue: { $sum: "$totals.grand_total" }
                } 
            },
            { $sort: { _id: 1 } },
            { 
                $project: { 
                    month: "$_id", 
                    tax: 1, 
                    revenue: 1, 
                    _id: 0 
                } 
            }
        ]);

        res.json({
            success: true,
            data: {
                quotationAmount,
                invoiceAmount,
                poAmount,
                invoiceReceivedAmount: 0,
                pendingBills: poAmount * 0.1, // mock
                pendingInvoices: invoiceAmount * 0.2, // mock
                quoteVsInvoice: [
                    { label: "Quotations", value: quotationAmount },
                    { label: "Invoices", value: invoiceAmount }
                ],
                poVsInvoiceReceived: [
                    { label: "POs Issued", value: poAmount },
                    { label: "Invoices Recv", value: poAmount * 0.8 } // mock
                ],
                pendingComparison: [
                    { label: "Pending Bills", value: poAmount * 0.1 },
                    { label: "Pending Inv", value: invoiceAmount * 0.2 }
                ],
                financeTrend: monthWiseAgg
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
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
    },
    update: async (req, res) => {
        try {
            const { Vouchers } = req.tenantModels;
            const item = await Vouchers.findByIdAndUpdate(req.params.id, req.body, { new: true });
            if (!item) return res.status(404).json({ success: false, message: "Voucher not found" });
            req.io.to(req.tenantDbName).emit("voucher:updated", { data: item });
            res.json({ success: true, data: item });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    delete: async (req, res) => {
        try {
            const { Vouchers } = req.tenantModels;
            await Vouchers.findByIdAndDelete(req.params.id);
            req.io.to(req.tenantDbName).emit("voucher:deleted", { id: req.params.id });
            res.json({ success: true, message: "Voucher deleted" });
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
            const { locationId, status, vendorId } = req.query;
            
            const q = {};
            if (status) q.status = status;
            if (vendorId) q.vendorId = vendorId;
            
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

/**
 * 💸 SALARY & PAYROLL ACCOUNTING
 */
exports.postSalaryJournal = async (req, res) => {
    try {
        const { Groups, Ledgers, Vouchers, Counters } = req.tenantModels;
        const { employeeId, employeeName, amount, clientId, leadId, month, locationId, attendanceIds } = req.body;

        if (!amount || amount <= 0) return res.status(400).json({ success: false, message: "Invalid amount" });

        // 1. Ensure "Direct Expenses" -> "Salary & Wages"
        let directExpG = await Groups.findOne({ name: "Direct Expenses" });
        if (!directExpG) {
            directExpG = new Groups({ name: "Direct Expenses", nature: "Expenses" });
            await directExpG.save();
        }

        let salaryLedger = await Ledgers.findOne({ name: "Salary & Wages", groupId: directExpG._id });
        if (!salaryLedger) {
            salaryLedger = new Ledgers({ name: "Salary & Wages", groupId: directExpG._id, nature: "Dr" });
            await salaryLedger.save();
        }

        // 2. Ensure "Current Liabilities" -> "Account Payables" -> Employee Ledger
        let currLiabG = await Groups.findOne({ name: "Current Liabilities" });
        if (!currLiabG) {
            currLiabG = new Groups({ name: "Current Liabilities", nature: "Liabilities" });
            await currLiabG.save();
        }

        let payablesG = await Groups.findOne({ name: "Account Payables", parentGroup: "Current Liabilities" });
        if (!payablesG) {
            payablesG = new Groups({ name: "Account Payables", parentGroup: "Current Liabilities", nature: "Liabilities" });
            await payablesG.save();
        }

        let empLedger = await Ledgers.findOne({ refId: employeeId, refType: "Staff" });
        if (!empLedger) {
            empLedger = new Ledgers({ 
                name: employeeName || `Emp-${employeeId.toString().slice(-4)}`, 
                groupId: payablesG._id, 
                nature: "Cr", 
                refId: employeeId, 
                refType: "Staff" 
            });
            await empLedger.save();
        }

        // 3. Check for existing voucher for this month & employee
        let voucher = await Vouchers.findOne({
            "legacyMetadata.month": month,
            "legacyMetadata.type": "SalaryJournal",
            "entries.ledgerId": empLedger._id
        });

        const { Attendance } = req.tenantModels;

        if (voucher) {
            // Unpost old records linked to this voucher
            await Attendance.updateMany({ voucherId: voucher._id }, { $set: { isPosted: false, voucherId: null } });

            // Update existing voucher
            voucher.entries = [
                { ledgerId: salaryLedger._id, ledgerName: salaryLedger.name, debit: amount, credit: 0 },
                { ledgerId: empLedger._id, ledgerName: empLedger.name, debit: 0, credit: amount }
            ];
            voucher.narration = `Salary Dues for ${month || 'Current Month'} - ${employeeName} (Updated)`;
            voucher.date = new Date();
            await voucher.save();
        } else {
            // Create New Journal Voucher
            const counterId = `voucher_Journal_${locationId || 'global'}`;
            const counter = await Counters.findByIdAndUpdate(counterId, { $inc: { seq: 1 } }, { upsert: true, new: true });
            
            voucher = new Vouchers({
                locationId,
                voucherType: "Journal",
                voucherNo: `JRN-${(locationId || '0000').toString().slice(-4)}-${counter.seq}`,
                date: new Date(),
                narration: `Salary Dues for ${month || 'Current Month'} - ${employeeName}`,
                leadId, 
                entries: [
                    { ledgerId: salaryLedger._id, ledgerName: salaryLedger.name, debit: amount, credit: 0 },
                    { ledgerId: empLedger._id, ledgerName: empLedger.name, debit: 0, credit: amount }
                ],
                legacyMetadata: { clientId, month, type: 'SalaryJournal' }
            });
            await voucher.save();
        }

        // 4. Mark Attendance as Posted
        if (Array.isArray(attendanceIds) && attendanceIds.length > 0) {
            const { Attendance } = req.tenantModels;
            await Attendance.updateMany(
                { _id: { $in: attendanceIds } },
                { $set: { isPosted: true, voucherId: voucher._id } }
            );
        }

        res.status(201).json({ success: true, data: voucher });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.postSalaryPayment = async (req, res) => {
    try {
        const { Ledgers, Vouchers, Counters } = req.tenantModels;
        const { employeeId, amount, bankLedgerId, clientId, leadId, month, locationId, employeeName } = req.body;

        if (!amount || amount <= 0) return res.status(400).json({ success: false, message: "Invalid amount" });
        if (!bankLedgerId) return res.status(400).json({ success: false, message: "Bank/Cash ledger required" });

        const empLedger = await Ledgers.findOne({ refId: employeeId, refType: "Staff" });
        if (!empLedger) return res.status(404).json({ success: false, message: "Employee ledger not found. Post journal first." });

        const bankLedger = await Ledgers.findById(bankLedgerId);
        if (!bankLedger) return res.status(404).json({ success: false, message: "Bank/Cash ledger not found" });

        // Create Payment Voucher
        const counterId = `voucher_Payment_${locationId || 'global'}`;
        const counter = await Counters.findByIdAndUpdate(counterId, { $inc: { seq: 1 } }, { upsert: true, new: true });

        const voucher = new Vouchers({
            locationId,
            voucherType: "Payment",
            voucherNo: `PMT-${(locationId || '0000').toString().slice(-4)}-${counter.seq}`,
            date: new Date(),
            narration: `Salary Payment for ${month || 'Current Month'} - ${employeeName || ''}`,
            leadId,
            entries: [
                { ledgerId: empLedger._id, ledgerName: empLedger.name, debit: amount, credit: 0 },
                { ledgerId: bankLedger._id, ledgerName: bankLedger.name, debit: 0, credit: amount }
            ],
            legacyMetadata: { clientId, month, type: 'SalaryPayment' }
        });
        await voucher.save();

        res.status(201).json({ success: true, data: voucher });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getSalaryVoucher = async (req, res) => {
    try {
        const { Vouchers, Ledgers } = req.tenantModels;
        const { employeeId, month } = req.query;

        const empLedger = await Ledgers.findOne({ refId: employeeId, refType: "Staff" });
        if (!empLedger) return res.json({ success: true, data: null });

        const voucher = await Vouchers.findOne({
            "legacyMetadata.month": month,
            "legacyMetadata.type": "SalaryJournal",
            "entries.ledgerId": empLedger._id
        }).lean();

        res.json({ success: true, data: voucher });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
