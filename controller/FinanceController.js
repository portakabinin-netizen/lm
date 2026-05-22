/**
 * 🏰 FinanceController.js (v2.0 - Enhanced)
 * 
 * PURPOSE:
 * Centralized accounting manager for 'LedgerVoucherMaster' hub.
 * Handles Groups, Ledgers, and Specialized Vouchers.
 * Includes auto-initialization for standard accounting structures.
 */

const mongoose = require("mongoose");

const BILLABLE_LEAD_STATES = ["accepted", "tax invoice", "fully paid"];

const normalizeLeadState = (value) => String(value || "").trim().toLowerCase();

const getLeadBillingState = (lead = {}) => normalizeLeadState(lead.status || lead.role);

const isBillableLead = (lead = {}) => BILLABLE_LEAD_STATES.includes(getLeadBillingState(lead));

const getLeadLedgerName = (lead = {}) => {
    const senderName = String(lead.sender_name || "").trim();
    return senderName || `Client-${lead.lead_no || lead._id}`;
};

const billableLeadQuery = {
    $or: [
        { status: { $regex: /^(Accepted|Tax Invoice|Fully Paid)$/i } },
        { role: { $regex: /^(Accepted|Tax Invoice|Fully Paid)$/i } }
    ]
};

const syncBillableLeadLedgers = async (tenantModels) => {
    const { Leads } = tenantModels;
    if (!Leads) return;

    const activeLeads = await Leads.find(billableLeadQuery).lean();
    for (const lead of activeLeads.filter(isBillableLead)) {
        await exports.ensureLedgerFolioInternal(tenantModels, {
            ledgerName: getLeadLedgerName(lead),
            groupName: "Sundry Debtors",
            parentGroup: "Current Assets",
            nature: "Dr",
            refId: lead._id,
            refType: "Lead"
        });
    }
};

const getActiveCashFlowUsers = async (tenantDbName) => {
    const userMaster = require("../models/userMaster");
    const query = {
        userActive: true,
        allowCashFlow: true
    };

    if (tenantDbName) {
        query.accessCorporate = { $elemMatch: { dbName: tenantDbName, isActive: { $ne: false } } };
    }

    return userMaster.find(query).select("userDisplayName allowCashFlow userActive").lean();
};

const syncActiveUserPettyCashBooks = async (tenantModels, tenantDbName) => {
    const staffList = await getActiveCashFlowUsers(tenantDbName);

    for (const staff of staffList) {
        const staffPettyCashName = `Petty Cash - ${staff.userDisplayName || "General User"}`;
        await exports.ensureLedgerFolioInternal(tenantModels, {
            name: staffPettyCashName,
            group: "Cash-in-hand",
            nature: "Dr",
            refId: staff._id,
            refType: "User"
        });
    }

    return staffList;
};

/**
 * 🛠️ Internal Helper: Ensure Ledger Folio
 * Used for auto-creating ledgers for Leads/Suppliers/Employees.
 */
exports.ensureLedgerFolioInternal = async (tenantModels, options) => {
    const finalName = options.ledgerName || options.name;
    const finalGroup = options.groupName || options.group;
    const { parentGroup, refId, refType, openingBalance, nature, leadIds, purchaseOrders } = options;
    const { Groups, Ledgers, Leads } = tenantModels;

    if (!finalGroup) throw new Error("Group name is required to ensure a ledger folio");
    if (!finalName) throw new Error("Ledger name is required to ensure a ledger folio");

    // 1. Resolve parent group to an ObjectId if it is specified as a string name
    let resolvedParentGroupId = null;
    if (parentGroup) {
        if (mongoose.Types.ObjectId.isValid(parentGroup)) {
            resolvedParentGroupId = parentGroup;
        } else {
            let parentGroupDoc = await Groups.findOne({ groupName: { $regex: new RegExp(`^${parentGroup}$`, "i") } });
            if (!parentGroupDoc) {
                let parentNature = "Asset";
                const pLower = parentGroup.toLowerCase();
                if (pLower.includes("liabilit")) {
                    parentNature = "Liability";
                } else if (pLower.includes("revenue") || pLower.includes("income")) {
                    parentNature = "Revenue";
                } else if (pLower.includes("expense") || pLower.includes("cost") || pLower.includes("purchase")) {
                    parentNature = "Expense";
                }
                parentGroupDoc = new Groups({
                    groupName: parentGroup,
                    parentGroup: null,
                    nature: parentNature
                });
                await parentGroupDoc.save();
            }
            resolvedParentGroupId = parentGroupDoc._id;
        }
    } else if (finalGroup.toLowerCase() === "sundry debtors" || finalGroup.toLowerCase() === "sundry debtor") {
        let parentGroupDoc = await Groups.findOne({ groupName: { $regex: new RegExp("^Current Assets$", "i") } });
        if (!parentGroupDoc) {
            parentGroupDoc = new Groups({
                groupName: "Current Assets",
                parentGroup: null,
                nature: "Asset"
            });
            await parentGroupDoc.save();
        }
        resolvedParentGroupId = parentGroupDoc._id;
    }

    // 2. Find or create group
    let groupDoc = await Groups.findOne({ groupName: { $regex: new RegExp(`^${finalGroup}$`, "i") } });
    if (!groupDoc) {
        // Resolve group nature to a valid category enum: ["Assets", "Liabilities", "Income", "Expenses"]
        let resolvedGroupNature = "Asset";
        const groupLower = finalGroup.toLowerCase();

        if (groupLower.includes("creditor") || groupLower.includes("liability") || groupLower.includes("payable") || groupLower.includes("capital")) {
            resolvedGroupNature = "Liability";
        } else if (groupLower.includes("debtor") || groupLower.includes("asset") || groupLower.includes("receivable") || groupLower.includes("cash") || groupLower.includes("bank")) {
            resolvedGroupNature = "Asset";
        } else if (groupLower.includes("expense") || groupLower.includes("purchase") || groupLower.includes("cost")) {
            resolvedGroupNature = "Expense";
        } else if (groupLower.includes("income") || groupLower.includes("sale") || groupLower.includes("revenue")) {
            resolvedGroupNature = "Revenue";
        } else if (parentGroup) {
            const parentLower = parentGroup.toLowerCase();
            if (parentLower.includes("liabilit") || parentLower.includes("income")) {
                resolvedGroupNature = parentLower.includes("liabilit") ? "Liability" : "Revenue";
            } else {
                resolvedGroupNature = parentLower.includes("expense") ? "Expense" : "Asset";
            }
        } else {
            // Default based on ledger's nature
            resolvedGroupNature = (nature && nature.toLowerCase() === "cr") ? "Liability" : "Asset";
        }

        groupDoc = new Groups({
            groupName: finalGroup,
            parentGroup: resolvedParentGroupId,
            nature: resolvedGroupNature
        });
        await groupDoc.save();
    } else if (resolvedParentGroupId && !groupDoc.parentGroup) {
        groupDoc.parentGroup = resolvedParentGroupId;
        await groupDoc.save();
    }

    // 2. Find or create ledger
    let ledger = null;
    let currentLead = null;
    if (refType === "Lead" && refId) {
        currentLead = await Leads.findById(refId);
        if (currentLead && currentLead.ledgerId) {
            ledger = await Ledgers.findById(currentLead.ledgerId);
        }
        if (!ledger && currentLead && currentLead.sender_mobile) {
            const cleanMobile = String(currentLead.sender_mobile).replace(/\D/g, '').slice(-10);
            if (cleanMobile.length === 10) {
                const otherLead = await Leads.findOne({
                    sender_mobile: { $regex: new RegExp(cleanMobile.split('').join('\\D*') + '\\D*$') },
                    ledgerId: { $exists: true, $ne: null }
                });
                if (otherLead) {
                    ledger = await Ledgers.findById(otherLead.ledgerId);
                }
            }
        }
    }

    if (!ledger) {
        ledger = await Ledgers.findOne({
            $or: [
                { ledgerName: { $regex: new RegExp(`^${finalName}$`, "i") } },
                ... (refId ? [{ refId }] : [])
            ]
        });
    }

    if (!ledger) {
        // Normalize explicit ledger nature: ["Dr", "Cr"]
        let ledgerNature = "Dr";
        if (nature && (nature.toLowerCase() === "dr" || nature.toLowerCase() === "cr")) {
            ledgerNature = nature.toLowerCase() === "dr" ? "Dr" : "Cr";
        } else {
            ledgerNature = (groupDoc.nature === "Asset" || groupDoc.nature === "Expense") ? "Dr" : "Cr";
        }

        ledger = new Ledgers({
            ledgerName: finalName,
            ledgerGroupId: groupDoc._id,
            refId: refId || null,
            refType: refType || "Manual",
            openingBalance: openingBalance || 0,
            openingBalanceType: ledgerNature,
            currentBalance: ledgerNature === "Cr" ? -(openingBalance || 0) : (openingBalance || 0),
            leadIds: leadIds || ((refType === "Lead" && refId) ? [refId] : []),
            purchaseOrders: purchaseOrders || []
        });
        await ledger.save();
    } else {
        let changed = false;
        if (finalName && ledger.ledgerName !== finalName) {
            ledger.ledgerName = finalName;
            changed = true;
        }
        if (refType === "Lead" && refId) {
            if (!ledger.leadIds) {
                ledger.leadIds = [];
            }
            if (!ledger.leadIds.some(id => String(id) === String(refId))) {
                ledger.leadIds.push(refId);
                changed = true;
            }
        }
        if (changed) {
            await ledger.save();
        }
    }

    // 3. Link back ledgerId to leads and sync leadIds in ledger
    if (refType === "Lead" && ledger) {
        if (currentLead && currentLead.sender_mobile) {
            const cleanMobile = String(currentLead.sender_mobile).replace(/\D/g, '').slice(-10);
            if (cleanMobile.length === 10) {
                const matchingLeads = await Leads.find({
                    sender_mobile: { $regex: new RegExp(cleanMobile.split('').join('\\D*') + '\\D*$') }
                });
                const matchingIds = matchingLeads.map(l => l._id);

                // Update ledgerId on all matching leads in the database
                await Leads.updateMany(
                    { _id: { $in: matchingIds } },
                    { $set: { ledgerId: ledger._id } }
                );

                // Ensure the ledger lists all matching lead IDs
                if (!ledger.leadIds) ledger.leadIds = [];
                let ledgerChanged = false;
                for (const lid of matchingIds) {
                    if (!ledger.leadIds.some(existingId => String(existingId) === String(lid))) {
                        ledger.leadIds.push(lid);
                        ledgerChanged = true;
                    }
                }
                if (ledgerChanged) {
                    await ledger.save();
                }
            }
        } else if (refId) {
            await Leads.updateOne({ _id: refId }, { $set: { ledgerId: ledger._id } });
            if (!ledger.leadIds) ledger.leadIds = [];
            if (!ledger.leadIds.some(existingId => String(existingId) === String(refId))) {
                ledger.leadIds.push(refId);
                await ledger.save();
            }
        }
    } else if (refType === "Staff" && ledger) {
        const { Employees } = tenantModels;
        if (Employees && refId) {
            await Employees.updateOne({ _id: refId }, { $set: { ledgerId: ledger._id } });
        }
    } else if ((refType === "Client" || refType === "Vendor") && ledger) {
        const { Parties } = tenantModels;
        if (Parties && refId) {
            await Parties.updateOne({ _id: refId }, { $set: { ledgerId: ledger._id } });
        }
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
                { groupName: "Capital Account", nature: "Liability" },
                { groupName: "Sundry Creditors", nature: "Liability" },
                { groupName: "Sundry Debtors", nature: "Asset" },
                { groupName: "Bank Accounts", nature: "Asset" },
                { groupName: "Cash-in-hand", nature: "Asset" },
                { groupName: "Sales Accounts", nature: "Revenue" },
                { groupName: "Purchase Accounts", nature: "Expense" },
                { groupName: "Direct Expenses", nature: "Expense" },
                { groupName: "Indirect Expenses", nature: "Expense" },
                { groupName: "Current Assets", nature: "Asset" },
                { groupName: "Current Liabilities", nature: "Liability" }
            ];
            groups = await Groups.insertMany(defaults);
        }

        // Proactive Ledger Initialization (Ensure core ledgers always exist)
        const ledgers = await Ledgers.find({}).lean();
        if (ledgers.length < 5) { // If very few ledgers, seed defaults
            const newLedgers = [];

            const cashG = groups.find(g => g.groupName === "Cash-in-hand");
            if (cashG) {
                const hasCash = ledgers.some(l => l.ledgerName === "Cash Book");
                if (!hasCash) {
                    newLedgers.push({ ledgerName: "Cash", ledgerGroupId: cashG._id, openingBalance: 0, openingBalanceType: "Dr", isDefault: true });
                    newLedgers.push({ ledgerName: "Cash Book", ledgerGroupId: cashG._id, openingBalance: 0, openingBalanceType: "Dr", isDefault: true });
                    newLedgers.push({ ledgerName: "Petty Cash", ledgerGroupId: cashG._id, openingBalance: 0, openingBalanceType: "Dr", isDefault: true });
                }
            }

            const salesG = groups.find(g => g.groupName === "Sales Accounts");
            if (salesG && !ledgers.some(l => l.ledgerName && l.ledgerName.includes("Sales"))) {
                newLedgers.push({ ledgerName: "Sales", ledgerGroupId: salesG._id, openingBalance: 0, openingBalanceType: "Cr", isDefault: true });
                newLedgers.push({ ledgerName: "Local Sales", ledgerGroupId: salesG._id, openingBalance: 0, openingBalanceType: "Cr", isDefault: true });
            }

            const purcG = groups.find(g => g.groupName === "Purchase Accounts");
            if (purcG && !ledgers.some(l => l.ledgerName && l.ledgerName.includes("Purchase"))) {
                newLedgers.push({ ledgerName: "Purchase", ledgerGroupId: purcG._id, openingBalance: 0, openingBalanceType: "Dr", isDefault: true });
                newLedgers.push({ ledgerName: "Local Purchase", ledgerGroupId: purcG._id, openingBalance: 0, openingBalanceType: "Dr", isDefault: true });
            }

            const directExpG = groups.find(g => g.groupName === "Direct Expenses");
            if (directExpG && !ledgers.some(l => l.ledgerName === "Salary & Wages")) {
                newLedgers.push({ ledgerName: "Salary & Wages", ledgerGroupId: directExpG._id, openingBalance: 0, openingBalanceType: "Dr", isDefault: true });
            }

            const debtG = groups.find(g => g.groupName === "Sundry Debtors");
            if (debtG && !ledgers.some(l => l.ledgerName === "Default Client")) {
                newLedgers.push({ ledgerName: "Default Client", ledgerGroupId: debtG._id, openingBalance: 0, openingBalanceType: "Dr", isDefault: true });
            }

            const credG = groups.find(g => g.groupName === "Sundry Creditors");
            if (credG && !ledgers.some(l => l.ledgerName === "Default Vendor")) {
                newLedgers.push({ ledgerName: "Default Vendor", ledgerGroupId: credG._id, openingBalance: 0, openingBalanceType: "Cr", isDefault: true });
            }

            if (newLedgers.length > 0) {
                await Ledgers.insertMany(newLedgers);
            }
        }

        // Auto-create user-specific petty cash books for active cash-flow users in this tenant
        try {
            await syncActiveUserPettyCashBooks(req.tenantModels, req.tenantDbName || req.user?.dbName);
        } catch (uErr) {
            console.error("Proactive Staff Petty Cash Sync Failed:", uErr.message);
        }

        // Auto-create ledgers for active billable clients (Leads) with Accepted or Tax Invoice state
        try {
            await syncBillableLeadLedgers(req.tenantModels);
        } catch (lErr) {
            console.error("Proactive Client Ledger Sync Failed:", lErr.message);
        }

        await recalculateAllLedgerBalances(req.tenantModels);

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

            // Auto-create user-specific petty cash books for active cash-flow users in this tenant
            try {
                await syncActiveUserPettyCashBooks(req.tenantModels, req.tenantDbName || req.user?.dbName);
            } catch (uErr) {
                console.error("Proactive Staff Petty Cash Sync Failed:", uErr.message);
            }

            // Auto-create ledgers for active billable clients (Leads)
            try {
                await syncBillableLeadLedgers(req.tenantModels);
            } catch (lErr) {
                console.error("Proactive Client Ledger Sync Failed:", lErr.message);
            }

            await recalculateAllLedgerBalances(req.tenantModels);

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
            const oldLedger = await Ledgers.findById(req.params.id);
            if (!oldLedger) return res.status(404).json({ success: false, message: "Ledger not found" });

            if (req.body.openingBalance !== undefined) {
                const diff = parseFloat(req.body.openingBalance) - (oldLedger.openingBalance || 0);
                req.body.currentBalance = (oldLedger.currentBalance || 0) + diff;
            }

            await Ledgers.findByIdAndUpdate(req.params.id, req.body, { new: true });
            await recalculateLedgerBalances(req.tenantModels, [req.params.id]);
            const ledger = await Ledgers.findById(req.params.id).lean();
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
                    ...billableLeadQuery,
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
const isAllowedUserCashFlowLedger = async (tenantModels, ledgerId, activeUserId) => {
    if (ledgerId === "cash_in_hand" || ledgerId === "main_bank") return true;
    if (!mongoose.Types.ObjectId.isValid(ledgerId)) return false;
    const ledger = await tenantModels.Ledgers.findById(ledgerId).lean();
    if (!ledger) return false;

    // If it's a Bank Account, anyone can transact through it
    const group = await tenantModels.Groups.findById(ledger.ledgerGroupId).lean();
    if (group && group.groupName === "Bank Accounts") {
        return true;
    }

    // If it's in Cash-in-hand, it must belong to the active user or be general
    if (group && group.groupName === "Cash-in-hand") {
        if (ledger.refType === "User") {
            return String(ledger.refId) === String(activeUserId);
        }
        return true;
    }

    return false;
};

const resolveAndValidateVoucher = async (req, voucherType, entries, leadId, legacyMetadata) => {
    const { Leads, Employees, Ledgers, Groups } = req.tenantModels;
    const resolvedEntries = [];

    // Active cash-flow users
    const activeCashFlowUsers = await getActiveCashFlowUsers(req.tenantDbName || req.user?.dbName);
    const activeUserIds = new Set(activeCashFlowUsers.map(user => String(user._id)));

    // Helper to check if a ledger is a cash flow account
    const isCashFlow = async (lId) => {
        if (lId === "cash_in_hand" || lId === "main_bank") return true;
        if (!mongoose.Types.ObjectId.isValid(lId)) return false;
        const ledgerDoc = await Ledgers.findById(lId).lean();
        if (!ledgerDoc) return false;
        if (ledgerDoc.refType === "User" && activeUserIds.has(String(ledgerDoc.refId))) {
            return true;
        }
        const gDoc = await Groups.findById(ledgerDoc.ledgerGroupId).lean();
        if (gDoc && (gDoc.groupName === "Bank Accounts" || gDoc.groupName === "Cash-in-hand")) {
            return true;
        }
        return false;
    };

    // Helper to check if a ledger is an employee account
    const isEmployeeLedger = async (lId) => {
        if (!mongoose.Types.ObjectId.isValid(lId)) return false;
        const ledgerDoc = await Ledgers.findById(lId).lean();
        return ledgerDoc && ledgerDoc.refType === "Staff";
    };

    // 1. Resolve all entries
    for (const entry of entries) {
        let ledgerId = entry.ledgerId;
        let ledgerName = entry.ledgerName || "";
        const accountType = entry.accountType;

        // A. Placeholders
        if (ledgerId === "cash_in_hand" || ledgerId === "main_bank" || ledgerId === "office_rent" ||
            ledgerId === "electricity_bill" || ledgerId === "stationary_expense" ||
            ledgerId === "interest_income" || ledgerId === "uniform_equipment") {

            let targetName = "Cash Book";
            let targetGroup = "Cash-in-hand";
            let nature = "Dr";
            let refId = null;
            let refType = null;

            if (ledgerId === "cash_in_hand") {
                targetName = `Petty Cash - ${req.user?.userDisplayName || "General User"}`;
                targetGroup = "Cash-in-hand";
                refId = req.user?._id || null;
                refType = "User";
            } else if (ledgerId === "main_bank") {
                targetName = "Main Bank Account";
                targetGroup = "Bank Accounts";
            } else if (ledgerId === "office_rent") {
                targetName = "Office Rent";
                targetGroup = "Indirect Expenses";
            } else if (ledgerId === "electricity_bill") {
                targetName = "Electricity Bill";
                targetGroup = "Indirect Expenses";
            } else if (ledgerId === "stationary_expense") {
                targetName = "Stationary & Printing";
                targetGroup = "Indirect Expenses";
            } else if (ledgerId === "interest_income") {
                targetName = "Interest Income";
                targetGroup = "Indirect Income";
                nature = "Cr";
            } else if (ledgerId === "uniform_equipment") {
                targetName = "Uniform & Equipment";
                targetGroup = "Direct Expenses";
            }

            const resolvedLedger = await exports.ensureLedgerFolioInternal(req.tenantModels, {
                name: targetName,
                group: targetGroup,
                nature,
                refId,
                refType
            });
            ledgerId = resolvedLedger._id;
            ledgerName = resolvedLedger.ledgerName || resolvedLedger.name;
        }
        // B. Lead placeholders
        else if (accountType === "Lead" || (mongoose.Types.ObjectId.isValid(ledgerId) && await Leads.exists({ _id: ledgerId }))) {
            const lead = await Leads.findById(ledgerId).lean();
            if (lead) {
                const resolvedLedger = await exports.ensureLedgerFolioInternal(req.tenantModels, {
                    name: lead.sender_name,
                    group: "Sundry Debtors",
                    refId: lead._id,
                    refType: "Lead",
                    nature: "Dr"
                });
                ledgerId = resolvedLedger._id;
                ledgerName = resolvedLedger.ledgerName || resolvedLedger.name;
            }
        }
        // C. Employee placeholders (Upgraded resolve: target Account Payables / nature Cr)
        else if (accountType === "Staff" || (mongoose.Types.ObjectId.isValid(ledgerId) && await Employees.exists({ _id: ledgerId }))) {
            const employee = await Employees.findById(ledgerId).lean();
            if (employee) {
                const resolvedLedger = await exports.ensureLedgerFolioInternal(req.tenantModels, {
                    name: employee.name,
                    group: "Account Payables",
                    parentGroup: "Current Liabilities",
                    refId: employee._id,
                    refType: "Staff",
                    nature: "Cr"
                });
                ledgerId = resolvedLedger._id;
                ledgerName = resolvedLedger.ledgerName || resolvedLedger.name;
            }
        }
        // D. Fallback for invalid ObjectIds
        else if (!mongoose.Types.ObjectId.isValid(ledgerId)) {
            const resolvedLedger = await exports.ensureLedgerFolioInternal(req.tenantModels, {
                name: ledgerName || "General Suspense",
                group: "Current Assets",
                nature: "Dr"
            });
            ledgerId = resolvedLedger._id;
            ledgerName = resolvedLedger.ledgerName || resolvedLedger.name;
        }

        resolvedEntries.push({
            ledgerId,
            ledgerName,
            debit: entry.debit || 0,
            credit: entry.credit || 0,
            accountType: entry.accountType
        });
    }

    // 2. Validate double-entry totals
    let totalDebit = 0;
    let totalCredit = 0;
    for (const e of resolvedEntries) {
        totalDebit += e.debit;
        totalCredit += e.credit;
    }
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
        return { error: "Voucher entries are unbalanced: Total Debits must equal Total Credits." };
    }

    // 3. Validation Rules by Voucher Type

    // Payment & Receipt rules
    if (voucherType === "Payment" || voucherType === "Receipt") {
        const mode = legacyMetadata?.mode;

        // Ensure there is at least one cash/bank ledger (cash flow source/destination)
        const cashFlowEntries = [];
        for (const entry of resolvedEntries) {
            if (await isCashFlow(entry.ledgerId)) {
                cashFlowEntries.push(entry);
            }
        }

        if (cashFlowEntries.length === 0) {
            return { error: `${voucherType} voucher must target at least one cash/bank account.` };
        }

        // Enforce that cash flow ledger must be Bank or the logged-in user's own Petty Cash book
        for (const cfEntry of cashFlowEntries) {
            const isAllowed = await isAllowedUserCashFlowLedger(req.tenantModels, cfEntry.ledgerId, req.user?._id);
            if (!isAllowed) {
                return { error: `${voucherType} cash flow must target Bank or your own Petty Cash book.` };
            }
        }

        // Check if any entry targets a Staff ledger
        let hasStaff = false;
        let staffDebitOnly = true;
        for (const entry of resolvedEntries) {
            if (await isEmployeeLedger(entry.ledgerId)) {
                hasStaff = true;
                if (entry.credit > 0) {
                    staffDebitOnly = false;
                }
            }
        }

        if (hasStaff) {
            if (mode !== "salary" && mode !== "advance") {
                return { error: `Employee accounts cannot be targeted in standard ${voucherType} vouchers. Use Salary or Advance mode.` };
            }
            if (!staffDebitOnly) {
                return { error: `Employee account must be debited in ${mode} mode.` };
            }
        }
    }

    // Contra rules
    else if (voucherType === "Contra") {
        if (resolvedEntries.length !== 2) {
            return { error: "Contra fund transfer must have exactly 2 entries (one Dr and one Cr)." };
        }
        // Both entries must be cash flow accounts
        for (const entry of resolvedEntries) {
            if (!(await isCashFlow(entry.ledgerId))) {
                return { error: "Contra entries must strictly mobilize funds between cash/bank accounts." };
            }
        }

        // Payer user checking (relaxed to check only if Cr is petty cash/user)
        const crEntry = resolvedEntries.find(e => e.credit > 0);
        if (crEntry) {
            const ledger = await Ledgers.findById(crEntry.ledgerId).lean();
            if (ledger && ledger.refType === "User") {
                const isAdmin = ["CorpAdmin", "userAdmin", "Finance"].includes(req.user?.userRole);
                if (!isAdmin && String(ledger.refId) !== String(req.user?._id)) {
                    return { error: "Contra: You can only transfer cash OUT of your own Petty Cash book." };
                }
            }
        }
    }

    // Journal rules
    else if (voucherType === "Journal") {
        for (const entry of resolvedEntries) {
            if (await isCashFlow(entry.ledgerId)) {
                return { error: "Journal vouchers cannot contain cash or bank accounts. Use Payment, Receipt, or Contra." };
            }
        }
    }

    // 4. Project-wise Analytics (leadId) enforcement
    let requiresLead = false;
    if (voucherType === "Sales" || voucherType === "Purchase") {
        requiresLead = true;
    }
    for (const entry of resolvedEntries) {
        if (await isEmployeeLedger(entry.ledgerId)) {
            requiresLead = true;
            break;
        }
        const ledger = await Ledgers.findById(entry.ledgerId).lean();
        if (ledger) {
            const group = await Groups.findById(ledger.ledgerGroupId).lean();
            if (group) {
                const gName = (group.groupName || "").toLowerCase();
                const gNature = (group.nature || "").toLowerCase();
                if (gNature === "expense" || gNature === "revenue" ||
                    gName.includes("expense") || gName.includes("purchase") ||
                    gName.includes("sales") || gName.includes("income") ||
                    gName.includes("revenue")) {
                    requiresLead = true;
                    break;
                }
            }
        }
    }

    if (requiresLead && (!leadId || !mongoose.Types.ObjectId.isValid(leadId))) {
        return { error: "Project/Enquiry linkage (leadId) is required for Sales, Purchase, Salary, and Expense entries." };
    }

    return { resolvedEntries };
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
            const { voucherType, locationId, entries, leadId, legacyMetadata } = req.body;

            // 1. Resolve Branch Location ID
            let resolvedLocId = locationId;
            if (!resolvedLocId || !mongoose.Types.ObjectId.isValid(resolvedLocId)) {
                const profile = await req.tenantModels.ProfileMaster.findOne({}).lean();
                resolvedLocId = profile?.locations?.[0]?._id || req.user?.accessibleLocationIds?.[0];
            }
            if (!resolvedLocId) {
                resolvedLocId = new mongoose.Types.ObjectId(); // Fallback to safe ObjectId to satisfy validation
            }

            if (!entries || !Array.isArray(entries)) {
                return res.status(400).json({ success: false, message: "entries array is required" });
            }

            // 2. Resolve and Validate entries using the unified helper
            const validation = await resolveAndValidateVoucher(req, voucherType, entries, leadId, legacyMetadata);
            if (validation.error) {
                return res.status(400).json({ success: false, message: validation.error });
            }

            const resolvedEntries = validation.resolvedEntries;

            // 3. Resolve Contra approvals and metadata if applicable
            let approvalPending = false;
            let contraMetadata = null;

            if (voucherType === "Contra") {
                const drEntry = resolvedEntries.find(e => e.debit > 0);
                let destUserId = null;
                if (drEntry) {
                    const drLedger = await req.tenantModels.Ledgers.findById(drEntry.ledgerId).lean();
                    if (drLedger && drLedger.refType === "User") {
                        destUserId = drLedger.refId;
                    }
                }

                const userRole = req.user?.userRole;
                const isAdmin = userRole === "CorpAdmin" || userRole === "userAdmin" || userRole === "Finance";

                if (isAdmin) {
                    approvalPending = false;
                    contraMetadata = {
                        payerUserId: req.user?._id,
                        receiverUserId: destUserId,
                        payerApproved: true,
                        receiverApproved: true,
                        payerDeclarationDate: new Date(),
                        receiverDeclarationDate: new Date()
                    };
                } else {
                    approvalPending = true;
                    contraMetadata = {
                        payerUserId: req.user?._id,
                        receiverUserId: destUserId,
                        payerApproved: true, // Payer declares paid immediately
                        receiverApproved: false,
                        payerDeclarationDate: new Date()
                    };
                }
            }

            // 4. Location-specific counter & Voucher generation
            const counterId = `voucher_${voucherType}_${resolvedLocId}`;
            const counter = await Counters.findByIdAndUpdate(counterId, { $inc: { seq: 1 } }, { upsert: true, new: true });

            const voucher = new Vouchers({
                ...req.body,
                locationId: resolvedLocId,
                entries: resolvedEntries,
                approvalPending,
                contraMetadata,
                voucherNo: `${voucherType.substring(0, 3).toUpperCase()}-${resolvedLocId.toString().slice(-4)}-${counter.seq}`
            });
            await voucher.save();

            const ledgerIds = voucher.entries.map(e => e.ledgerId);
            await recalculateLedgerBalances(req.tenantModels, ledgerIds);

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
            const oldVoucher = await Vouchers.findById(req.params.id).lean();
            if (!oldVoucher) return res.status(404).json({ success: false, message: "Voucher not found" });

            const voucherType = req.body.voucherType || oldVoucher.voucherType;
            const entries = req.body.entries || oldVoucher.entries;
            const leadId = req.body.leadId !== undefined ? req.body.leadId : oldVoucher.leadId;
            const legacyMetadata = req.body.legacyMetadata || oldVoucher.legacyMetadata;

            // Validate and resolve
            const validation = await resolveAndValidateVoucher(req, voucherType, entries, leadId, legacyMetadata);
            if (validation.error) {
                return res.status(400).json({ success: false, message: validation.error });
            }

            // Overwrite entries with resolved ones
            req.body.entries = validation.resolvedEntries;

            const oldLedgerIds = oldVoucher.entries.map(e => e.ledgerId);
            const item = await Vouchers.findByIdAndUpdate(req.params.id, req.body, { new: true });
            const newLedgerIds = item.entries.map(e => e.ledgerId);
            const allLedgerIds = [...oldLedgerIds, ...newLedgerIds];
            await recalculateLedgerBalances(req.tenantModels, allLedgerIds);

            req.io.to(req.tenantDbName).emit("voucher:updated", { data: item });
            res.json({ success: true, data: item });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },
    delete: async (req, res) => {
        try {
            const { Vouchers } = req.tenantModels;
            const oldVoucher = await Vouchers.findById(req.params.id).lean();
            const oldLedgerIds = oldVoucher ? oldVoucher.entries.map(e => e.ledgerId) : [];

            await Vouchers.findByIdAndDelete(req.params.id);
            await recalculateLedgerBalances(req.tenantModels, oldLedgerIds);

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
        let directExpG = await Groups.findOne({ groupName: "Direct Expenses" });
        if (!directExpG) {
            directExpG = new Groups({ groupName: "Direct Expenses", nature: "Expense" });
            await directExpG.save();
        }

        let salaryLedger = await Ledgers.findOne({ ledgerName: "Salary & Wages", ledgerGroupId: directExpG._id });
        if (!salaryLedger) {
            salaryLedger = new Ledgers({ ledgerName: "Salary & Wages", ledgerGroupId: directExpG._id, openingBalanceType: "Dr" });
            await salaryLedger.save();
        }

        // 2. Ensure "Current Liabilities" -> "Account Payables" -> Employee Ledger
        let currLiabG = await Groups.findOne({ groupName: "Current Liabilities" });
        if (!currLiabG) {
            currLiabG = new Groups({ groupName: "Current Liabilities", nature: "Liability" });
            await currLiabG.save();
        }

        let payablesG = await Groups.findOne({ groupName: "Account Payables", parentGroup: currLiabG._id });
        if (!payablesG) {
            payablesG = new Groups({ groupName: "Account Payables", parentGroup: currLiabG._id, nature: "Liability" });
            await payablesG.save();
        }

        let empLedger = await Ledgers.findOne({ refId: employeeId, refType: "Staff" });
        if (!empLedger) {
            empLedger = new Ledgers({
                ledgerName: employeeName || `Emp-${employeeId.toString().slice(-4)}`,
                ledgerGroupId: payablesG._id,
                openingBalanceType: "Cr",
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
            await recalculateLedgerBalances(req.tenantModels, voucher.entries.map(e => e.ledgerId));
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
            await recalculateLedgerBalances(req.tenantModels, voucher.entries.map(e => e.ledgerId));
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
        await recalculateLedgerBalances(req.tenantModels, voucher.entries.map(e => e.ledgerId));

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

/**
 * 💸 ADMIN REPORTING: View all users' petty cash balances
 */
exports.getPettyCashBalances = async (req, res) => {
    try {
        const { Ledgers, Vouchers } = req.tenantModels;

        // 1. Proactively sync/create user-specific petty cash books for active cash-flow users in this tenant first
        let activeCashFlowUsers = [];
        try {
            activeCashFlowUsers = await syncActiveUserPettyCashBooks(req.tenantModels, req.tenantDbName || req.user?.dbName);
        } catch (uErr) {
            console.error("Proactive Staff Petty Cash Sync Failed:", uErr.message);
        }

        const activeUserIds = new Set(activeCashFlowUsers.map(user => String(user._id)));
        const activePettyCashNames = new Set(
            activeCashFlowUsers.map(user => `Petty Cash - ${user.userDisplayName || "General User"}`.toLowerCase())
        );

        // 2. Fetch active cash-flow users' Petty Cash books only.
        const pettyCashLedgers = await Ledgers.find({
            $or: [
                { refType: "User", refId: { $in: [...activeUserIds] } },
                { ledgerName: { $in: [...activePettyCashNames].map(name => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")) } }
            ]
        }).lean();

        // 3. For each ledger, query the database to calculate current balance and count transactions
        const results = [];
        for (const ledger of pettyCashLedgers) {
            // Find all vouchers containing this ledgerId
            const vouchers = await Vouchers.find({ "entries.ledgerId": ledger._id }).lean();

            let totalDebit = 0;
            let totalCredit = 0;

            for (const v of vouchers) {
                // Contra pending receiver approval is not considered in receiver balance
                if (v.voucherType === "Contra" && v.approvalPending && String(v.contraMetadata?.receiverUserId) === String(ledger.refId)) {
                    continue;
                }
                const entry = v.entries.find(e => String(e.ledgerId) === String(ledger._id));
                if (entry) {
                    totalDebit += (entry.debit || 0);
                    totalCredit += (entry.credit || 0);
                }
            }

            // Since Petty Cash is a Dr nature Asset ledger:
            const currentBalance = (ledger.openingBalance || ledger.openingBal || 0) + totalDebit - totalCredit;
            const finalLedgerName = ledger.ledgerName || ledger.name || "";

            results.push({
                _id: ledger._id,
                name: finalLedgerName,
                userName: finalLedgerName ? finalLedgerName.replace(/^Petty Cash - /i, "") : "",
                refId: ledger.refId,
                userActive: true,
                allowCashFlow: true,
                openingBal: ledger.openingBalance || ledger.openingBal || 0,
                totalDebit,
                totalCredit,
                balance: currentBalance,
                transactionCount: vouchers.length
            });
        }

        res.json({ success: true, data: results });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * 💸 ADMIN REPORTING: View specific petty cash book's transaction history
 */
exports.getPettyCashTransactions = async (req, res) => {
    try {
        const { ledgerId } = req.query;
        const { startDate, endDate } = req.query;
        const { Ledgers, Vouchers } = req.tenantModels;

        if (!ledgerId) {
            return res.status(400).json({ success: false, message: "ledgerId is required" });
        }

        const ledger = await Ledgers.findById(ledgerId).lean();
        if (!ledger) {
            return res.status(404).json({ success: false, message: "Ledger not found" });
        }

        // Build Voucher Query
        const query = { "entries.ledgerId": ledgerId };

        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999); // include full day
                query.date.$lte = end;
            }
        }

        const vouchers = await Vouchers.find(query).sort({ date: 1 }).lean();

        // Map and extract details
        const transactions = vouchers.map(v => {
            const entry = v.entries.find(e => String(e.ledgerId) === String(ledgerId));
            const otherEntries = v.entries.filter(e => String(e.ledgerId) !== String(ledgerId));

            const isPending = v.voucherType === "Contra" && v.approvalPending && String(v.contraMetadata?.receiverUserId) === String(ledger.refId);

            return {
                _id: v._id,
                date: v.date,
                voucherNo: v.voucherNo,
                voucherType: v.voucherType,
                narration: v.narration || "No narration provided",
                debit: entry?.debit || 0,
                credit: entry?.credit || 0,
                type: (entry?.debit || 0) > 0 ? "Dr" : "Cr",
                amount: (entry?.debit || 0) > 0 ? entry.debit : (entry?.credit || 0),
                isPending: isPending || false,
                contraMetadata: v.contraMetadata || null,
                otherLegs: otherEntries.map(oe => ({
                    ledgerId: oe.ledgerId,
                    ledgerName: oe.ledgerName,
                    amount: oe.debit || oe.credit
                }))
            };
        });

        res.json({
            success: true,
            ledger: {
                _id: ledger._id,
                name: ledger.ledgerName || ledger.name || "",
                openingBal: ledger.openingBalance || ledger.openingBal || 0
            },
            data: transactions
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * 🔐 Contra Voucher Password Approval / Declaration
 */
exports.approveContraVoucher = async (req, res) => {
    try {
        const { Vouchers } = req.tenantModels;
        const { voucherId, action, password } = req.body;
        const userId = req.user?._id;

        if (!voucherId || !action || !password) {
            return res.status(400).json({ success: false, message: "voucherId, action, and password are required" });
        }

        // 1. Verify User Password
        const userMaster = require("../models/userMaster");
        const user = await userMaster.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const bcrypt = require("bcryptjs");
        const isMatch = await bcrypt.compare(password, user.userPassword);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Invalid verification password" });
        }

        // 2. Find Voucher
        const voucher = await Vouchers.findById(voucherId);
        if (!voucher) {
            return res.status(404).json({ success: false, message: "Voucher not found" });
        }

        if (voucher.voucherType !== "Contra") {
            return res.status(400).json({ success: false, message: "Only Contra vouchers require password approval" });
        }

        // 3. Process Action
        if (action === "pay") {
            voucher.contraMetadata = {
                ...voucher.contraMetadata,
                payerApproved: true,
                payerDeclarationDate: new Date()
            };
        } else if (action === "receive") {
            voucher.contraMetadata = {
                ...voucher.contraMetadata,
                receiverApproved: true,
                receiverDeclarationDate: new Date()
            };
            // Receiver approved -> clears pending flag!
            voucher.approvalPending = false;
        } else {
            return res.status(400).json({ success: false, message: "Invalid action. Must be 'pay' or 'receive'" });
        }

        await voucher.save();
        const ledgerIds = voucher.entries.map(e => e.ledgerId);
        await recalculateLedgerBalances(req.tenantModels, ledgerIds);
        res.json({ success: true, message: `Voucher successfully declared as ${action}ed.`, data: voucher });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

const recalculateLedgerBalances = async (tenantModels, ledgerIds) => {
    const { Ledgers, Vouchers } = tenantModels;
    const uniqueIds = [...new Set(ledgerIds.filter(Boolean).map(id => id.toString()))];
    if (uniqueIds.length === 0) return;

    const objectIds = uniqueIds.map(id => new mongoose.Types.ObjectId(id));
    const voucherSums = await Vouchers.aggregate([
        { $unwind: "$entries" },
        { $match: { "entries.ledgerId": { $in: objectIds } } },
        {
            $group: {
                _id: "$entries.ledgerId",
                totalDr: { $sum: "$entries.debit" },
                totalCr: { $sum: "$entries.credit" }
            }
        }
    ]);

    const sumMap = {};
    voucherSums.forEach(item => {
        if (item._id) {
            sumMap[item._id.toString()] = {
                totalDr: item.totalDr || 0,
                totalCr: item.totalCr || 0
            };
        }
    });

    for (const idStr of uniqueIds) {
        const ledger = await Ledgers.findById(idStr);
        if (!ledger) continue;
        const sums = sumMap[idStr] || { totalDr: 0, totalCr: 0 };
        const initialBal = ledger.openingBalanceType === 'Cr' ? -(ledger.openingBalance || 0) : (ledger.openingBalance || 0);
        const currentBalance = initialBal + sums.totalDr - sums.totalCr;
        if (ledger.currentBalance !== currentBalance) {
            await Ledgers.findByIdAndUpdate(idStr, { currentBalance });
        }
    }
};

const recalculateAllLedgerBalances = async (tenantModels) => {
    const { Ledgers, Vouchers } = tenantModels;
    const voucherSums = await Vouchers.aggregate([
        { $unwind: "$entries" },
        {
            $group: {
                _id: "$entries.ledgerId",
                totalDr: { $sum: "$entries.debit" },
                totalCr: { $sum: "$entries.credit" }
            }
        }
    ]);

    const sumMap = {};
    voucherSums.forEach(item => {
        if (item._id) {
            sumMap[item._id.toString()] = {
                totalDr: item.totalDr || 0,
                totalCr: item.totalCr || 0
            };
        }
    });

    const ledgers = await Ledgers.find({});
    for (const ledger of ledgers) {
        const sums = sumMap[ledger._id.toString()] || { totalDr: 0, totalCr: 0 };
        const initialBal = ledger.openingBalanceType === 'Cr' ? -(ledger.openingBalance || 0) : (ledger.openingBalance || 0);
        const currentBalance = initialBal + sums.totalDr - sums.totalCr;
        if (ledger.currentBalance !== currentBalance) {
            ledger.currentBalance = currentBalance;
            await ledger.save();
        }
    }
};

