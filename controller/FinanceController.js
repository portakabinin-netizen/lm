/**
 * 🏰 FinanceController.js (v2.0 - Enhanced)
 * 
 * PURPOSE:
 * Centralized accounting manager for 'LedgerVoucherMaster' hub.
 * Handles Groups, Ledgers, and Specialized Vouchers.
 * Includes auto-initialization for standard accounting structures.
 */

const mongoose = require("mongoose");
const ExcelJS = require("exceljs");

const BILLABLE_LEAD_STATES = ["accepted"];

const normalizeLeadState = (value) => String(value || "").trim().toLowerCase();

const getLeadBillingState = (lead = {}) => normalizeLeadState(lead.status || lead.role);

const isBillableLead = (lead = {}) => BILLABLE_LEAD_STATES.includes(getLeadBillingState(lead));

const getLeadLedgerName = (lead = {}) => {
    const senderName = String(lead.sender_name || "").trim();
    return senderName || `Client-${lead.lead_no || lead._id}`;
};

const billableLeadQuery = {
    $or: [
        { status: { $regex: /^Accepted$/i } },
        { role: { $regex: /^Accepted$/i } }
    ]
};

const syncBillableLeadLedgers = async (tenantModels) => {
    const { Leads, Ledgers } = tenantModels;
    if (!Leads || !Ledgers) return;

    // 1. Clean up ledgers for Recycled leads
    const recycledLeads = await Leads.find({
        status: { $regex: /^Recycle$/i },
        ledgerId: { $ne: null }
    }).lean();

    if (recycledLeads.length > 0) {
        const recycledLedgerIds = recycledLeads.map(l => l.ledgerId).filter(Boolean);
        if (recycledLedgerIds.length > 0) {
            await Ledgers.deleteMany({ _id: { $in: recycledLedgerIds } });
            await Leads.updateMany(
                { ledgerId: { $in: recycledLedgerIds } },
                { $unset: { ledgerId: "" } }
            );
        }
    }

    // 2. Sync billable leads without ledgerId
    const query = {
        ...billableLeadQuery,
        ledgerId: { $in: [null, undefined] }
    };
    const activeLeads = await Leads.find(query).lean();
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
        $or: [
            { allowCashFlow: true },
            { userRole: { $in: ["CorpAdmin", "userAdmin", "Project", "Finance"] } }
        ]
    };

    if (tenantDbName) {
        query.accessCorporate = { $elemMatch: { dbName: tenantDbName, isActive: { $ne: false } } };
    }

    return userMaster.find(query).select("userDisplayName allowCashFlow userActive userRole").lean();
};

const syncActiveUserPettyCashBooks = async (tenantModels, tenantDbName) => {
    const staffList = await getActiveCashFlowUsers(tenantDbName);
    const { Ledgers } = tenantModels;
    if (!Ledgers) return staffList;

    const staffIds = staffList.map(s => s._id);
    const existingLedgers = await Ledgers.find({
        refId: { $in: staffIds },
        refType: "User"
    }).lean();
    const existingUserIds = new Set(existingLedgers.map(l => String(l.refId)));

    for (const staff of staffList) {
        if (existingUserIds.has(String(staff._id))) {
            continue;
        }
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

const getLedgerEnrollmentMap = async (tenantModels) => {
    const { Ledgers, Employees } = tenantModels;
    if (!Ledgers || !Employees) return new Map();

    const ledgers = await Ledgers.find({ refId: { $ne: null } }, "_id refId refType").lean();
    const employees = await Employees.find({}, "_id enrollment_no user_id").lean();

    const employeeEnrollmentMap = new Map();
    const userEnrollmentMap = new Map();
    employees.forEach(e => {
        if (e.enrollment_no) {
            employeeEnrollmentMap.set(String(e._id), e.enrollment_no);
            if (e.user_id) {
                userEnrollmentMap.set(String(e.user_id), e.enrollment_no);
            }
        }
    });

    const ledgerMap = new Map();
    ledgers.forEach(l => {
        if (l.refType === "Staff") {
            const en = employeeEnrollmentMap.get(String(l.refId));
            if (en) ledgerMap.set(String(l._id), en);
        } else if (l.refType === "User") {
            const en = userEnrollmentMap.get(String(l.refId));
            if (en) ledgerMap.set(String(l._id), en);
        }
    });

    return ledgerMap;
};

/**
 * 🛠️ Internal Helper: Ensure Ledger Folio
 * Used for auto-creating ledgers for Leads/Suppliers/Employees.
 */
exports.ensureLedgerFolioInternal = async (tenantModels, options) => {
    const finalName = options.ledgerName || options.name;
    const finalGroup = options.groupName || options.group;
    const { parentGroup, refId, refType, openingBalance, nature, leadIds, purchaseOrders } = options;
    const { Groups, Ledgers, Leads, Vouchers } = tenantModels;

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
                ... (refId ? [{ refId, ...(refType ? { refType } : {}) }] : [])
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
            groupName: groupDoc.groupName,
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
            
            // Cascade update ledgerName in all vouchers referencing this ledger
            await Vouchers.updateMany(
                { "entries.ledgerId": ledger._id },
                { $set: { "entries.$[elem].ledgerName": finalName } },
                { arrayFilters: [{ "elem.ledgerId": ledger._id }] }
            );
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
        let finalLeadIds = [];
        if (Array.isArray(leadIds) && leadIds.length > 0) {
            finalLeadIds = leadIds
                .filter(id => id && mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id));
        } else if (refId && mongoose.Types.ObjectId.isValid(refId)) {
            finalLeadIds = [new mongoose.Types.ObjectId(refId)];
        }

        if (finalLeadIds.length > 0) {
            // Update all matching leads to set ledgerId to ledger._id and push ledger._id to ledgerIds
            await Leads.updateMany(
                { _id: { $in: finalLeadIds } },
                { 
                    $set: { ledgerId: ledger._id },
                    $addToSet: { ledgerIds: ledger._id }
                }
            );

            // Ensure the ledger lists all these lead IDs
            if (!ledger.leadIds) ledger.leadIds = [];
            let ledgerChanged = false;
            for (const lid of finalLeadIds) {
                if (!ledger.leadIds.some(existingId => String(existingId) === String(lid))) {
                    ledger.leadIds.push(lid);
                    ledgerChanged = true;
                }
            }
            if (ledgerChanged) {
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

        // Bypassed global recalculateAllLedgerBalances on load for performance

        const finalLedgers = await Ledgers.find({}).lean();
        const ledgerEnrollmentMap = await getLedgerEnrollmentMap(req.tenantModels);
        const enhancedLedgers = finalLedgers.map(l => ({
            ...l,
            enrollmentNo: ledgerEnrollmentMap.get(String(l._id)) || ""
        }));
        res.json({ success: true, data: { groups, ledgers: enhancedLedgers } });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

/**
 * 📈 FINANCE ANALYTICS
 */
exports.getAnalytics = async (req, res) => {
    try {
        const { Quotations, TaxInvoices, PurchaseOrders, Vouchers, Groups, Ledgers } = req.tenantModels;

        // 1. Fetch CRM / Pipeline documents
        const qList = await Quotations.find({}).lean();
        const pList = await PurchaseOrders.find({}).lean();

        let quotationAmount = 0;
        qList.forEach(q => quotationAmount += (q.totals?.grand_total || q.totals?.grandTotal || 0));

        let poAmount = 0;
        pList.forEach(p => poAmount += (p.totals?.grand_total || p.totals?.grandTotal || 0));

        // 2. Fetch double entry components
        const groups = await Groups.find({}).lean();
        const ledgers = await Ledgers.find({}).lean();
        const vouchers = await Vouchers.find({}).lean();

        // 3. Build ledger maps to resolve group classifications
        const groupMap = {};
        groups.forEach(g => {
            groupMap[g._id.toString()] = g;
        });

        const ledgerGroupMap = {};
        ledgers.forEach(l => {
            const group = groupMap[l.ledgerGroupId?.toString()];
            if (group) {
                ledgerGroupMap[l._id.toString()] = {
                    groupName: group.groupName,
                    nature: group.nature
                };
            }
        });

        // 4. Calculate actual Sales Revenue from Sales Vouchers
        let invoiceAmount = 0;
        const salesVouchers = vouchers.filter(v => v.voucherType === "Sales");
        salesVouchers.forEach(v => {
            // Amount of Sales voucher is total debit/credit
            const amt = (v.entries || []).reduce((sum, e) => sum + (e.debit || 0), 0);
            invoiceAmount += amt;
        });

        // Fallback to TaxInvoices if no Sales vouchers exist
        if (invoiceAmount === 0) {
            const iList = await TaxInvoices.find({}).lean();
            iList.forEach(i => invoiceAmount += (i.totals?.grand_total || i.totals?.grandTotal || 0));
        }

        // 5. Calculate actual Purchase Invoices Received from Purchase Vouchers
        let invoiceReceivedAmount = 0;
        const purchaseVouchers = vouchers.filter(v => v.voucherType === "Purchase");
        purchaseVouchers.forEach(v => {
            // Amount of Purchase voucher is total debit/credit
            const amt = (v.entries || []).reduce((sum, e) => sum + (e.credit || 0), 0);
            invoiceReceivedAmount += amt;
        });

        // Fallback to poAmount * 0.8 if no Purchase vouchers exist
        if (invoiceReceivedAmount === 0) {
            invoiceReceivedAmount = poAmount * 0.8;
        }

        // 6. Calculate real receivables (debtors balance) & payables (creditors balance)
        const debtorLedgers = ledgers.filter(l => {
            const info = ledgerGroupMap[l._id.toString()];
            return info && info.groupName === "Sundry Debtors";
        });
        const creditorLedgers = ledgers.filter(l => {
            const info = ledgerGroupMap[l._id.toString()];
            return info && info.groupName === "Sundry Creditors";
        });

        let pendingInvoices = 0;
        debtorLedgers.forEach(l => {
            if (l.currentBalance > 0) {
                pendingInvoices += l.currentBalance;
            }
        });

        let pendingBills = 0;
        creditorLedgers.forEach(l => {
            if (l.currentBalance < 0) {
                pendingBills += Math.abs(l.currentBalance);
            }
        });

        // 7. Month-wise Aggregation (Last 6 Months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        let monthWiseAgg = [];
        const recentSalesVouchers = salesVouchers.filter(v => new Date(v.date) >= sixMonthsAgo);

        if (recentSalesVouchers.length > 0) {
            const monthMap = {};
            
            // Initialize last 6 months in the map
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const yyyymm = d.toISOString().slice(0, 7); // YYYY-MM
                monthMap[yyyymm] = { month: yyyymm, tax: 0, revenue: 0 };
            }

            recentSalesVouchers.forEach(v => {
                const dateObj = new Date(v.date);
                const yyyymm = dateObj.toISOString().slice(0, 7);
                if (!monthMap[yyyymm]) return;

                let voucherTax = 0;
                let voucherRevenue = 0;

                (v.entries || []).forEach(e => {
                    const ledId = e.ledgerId?.toString();
                    const info = ledgerGroupMap[ledId];
                    if (!info) return;

                    if (info.groupName === "Sales Accounts") {
                        voucherRevenue += (e.credit || 0);
                    } else if (info.groupName === "Duties & Taxes") {
                        voucherTax += (e.credit || 0);
                    }
                });

                monthMap[yyyymm].revenue += voucherRevenue;
                monthMap[yyyymm].tax += voucherTax;
            });

            monthWiseAgg = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
        } else {
            // Fallback to TaxInvoices aggregation
            const rawMonthAgg = await TaxInvoices.aggregate([
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

            // Fill missing months
            const monthMap = {};
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const yyyymm = d.toISOString().slice(0, 7);
                monthMap[yyyymm] = { month: yyyymm, tax: 0, revenue: 0 };
            }

            rawMonthAgg.forEach(item => {
                if (monthMap[item.month]) {
                    monthMap[item.month].revenue = item.revenue || 0;
                    monthMap[item.month].tax = item.tax || 0;
                }
            });

            monthWiseAgg = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month));
        }

        res.json({
            success: true,
            data: {
                quotationAmount,
                invoiceAmount,
                poAmount,
                invoiceReceivedAmount,
                pendingBills,
                pendingInvoices,
                quoteVsInvoice: [
                    { label: "Quotations", value: quotationAmount },
                    { label: "Invoices", value: invoiceAmount }
                ],
                poVsInvoiceReceived: [
                    { label: "POs Issued", value: poAmount },
                    { label: "Invoices Recv", value: invoiceReceivedAmount }
                ],
                pendingComparison: [
                    { label: "Pending Bills", value: pendingBills },
                    { label: "Pending Inv", value: pendingInvoices }
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

            // Bypassed global recalculateAllLedgerBalances on load for performance

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
            const { Ledgers, Vouchers } = req.tenantModels;
            const oldLedger = await Ledgers.findById(req.params.id);
            if (!oldLedger) return res.status(404).json({ success: false, message: "Ledger not found" });

            if (req.body.openingBalance !== undefined) {
                const diff = parseFloat(req.body.openingBalance) - (oldLedger.openingBalance || 0);
                req.body.currentBalance = (oldLedger.currentBalance || 0) + diff;
            }

            // Cascading updates to all vouchers referencing this ledger
            if (req.body.ledgerName && req.body.ledgerName !== oldLedger.ledgerName) {
                await Vouchers.updateMany(
                    { "entries.ledgerId": oldLedger._id },
                    { $set: { "entries.$[elem].ledgerName": req.body.ledgerName } },
                    { arrayFilters: [{ "elem.ledgerId": oldLedger._id }] }
                );
            }

            // Handle group change if provided (accept name or id)
            const providedGroup = req.body.group || req.body.groupName;
            if (providedGroup) {
                const { Groups } = req.tenantModels;
                // Try to find existing group by name (case-insensitive)
                let groupDoc = await Groups.findOne({ groupName: { $regex: new RegExp(`^${providedGroup}$`, "i") } });
                if (!groupDoc) {
                    // Determine nature based on ledger's existing nature
                    const ledgerNature = oldLedger.openingBalanceType || (oldLedger.currentBalance < 0 ? "Cr" : "Dr");
                    const resolvedGroupNature = ledgerNature === "Cr" ? "Liability" : "Asset";
                    groupDoc = new Groups({ groupName: providedGroup, parentGroup: null, nature: resolvedGroupNature });
                    await groupDoc.save();
                }
                // Set ledgerGroupId for update
                req.body.ledgerGroupId = groupDoc._id;
                req.body.groupName = groupDoc.groupName;
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
            const { type, query, leadId } = req.query; // Leads, Vendors
            const { Leads, Parties } = req.tenantModels;
            const q = query?.toLowerCase() || "";
            let results = [];

            if (type === "Leads") {
                if (leadId) {
                    const lead = await Leads.findById(leadId).lean();
                    if (!lead) {
                        return res.json({ success: true, data: [] });
                    }
                    const orConditions = [];
                    if (lead.sender_mobile) {
                        const cleanMobile = String(lead.sender_mobile).replace(/\D/g, '').slice(-10);
                        if (cleanMobile.length === 10) {
                            orConditions.push({
                                sender_mobile: { $regex: new RegExp(cleanMobile.split('').join('\\D*') + '\\D*$') }
                            });
                        }
                    }
                    if (lead.location && typeof lead.location.lat === "number" && typeof lead.location.long === "number") {
                        orConditions.push({
                            "location.lat": { $gte: lead.location.lat - 0.0002, $lte: lead.location.lat + 0.0002 },
                            "location.long": { $gte: lead.location.long - 0.0002, $lte: lead.location.long + 0.0002 }
                        });
                    }

                    if (orConditions.length === 0) {
                        return res.json({ success: true, data: [] });
                    }

                    const matchingLeads = await Leads.find({
                        _id: { $ne: lead._id },
                        $or: orConditions
                    }).lean();

                    results = matchingLeads.map(other => {
                        const reasons = [];
                        if (lead.sender_mobile && other.sender_mobile) {
                            const otherClean = String(other.sender_mobile).replace(/\D/g, '').slice(-10);
                            const leadClean = String(lead.sender_mobile).replace(/\D/g, '').slice(-10);
                            if (otherClean === leadClean) {
                                reasons.push("Same mobile number");
                            }
                        }
                        if (lead.location && typeof lead.location.lat === "number" && typeof lead.location.long === "number" &&
                            other.location && typeof other.location.lat === "number" && typeof other.location.long === "number") {
                            const latDiff = Math.abs(other.location.lat - lead.location.lat);
                            const longDiff = Math.abs(other.location.long - lead.location.long);
                            if (latDiff <= 0.0002 && longDiff <= 0.0002) {
                                reasons.push("Nearby location (< 20m)");
                            }
                        }
                        return {
                            ...other,
                            matchReason: reasons.join(" and ") || "Matched query attributes"
                        };
                    });
                } else {
                    results = await Leads.find({
                        ...billableLeadQuery,
                        sender_name: { $regex: new RegExp(q, "i") }
                    }).limit(10).lean();
                }
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
        let entryLeadId = entry.leadId;

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
                if (!entryLeadId) {
                    entryLeadId = lead._id;
                }
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
            accountType: entry.accountType,
            leadId: entryLeadId
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
        // Only enforce on the SOURCE of funds for Payment (Credit) and DESTINATION for Receipt (Debit)
        for (const cfEntry of cashFlowEntries) {
            if (voucherType === "Payment" && cfEntry.credit <= 0) continue;
            if (voucherType === "Receipt" && cfEntry.debit <= 0) continue;

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

    // 4. Project-wise Analytics (leadId) enforcement & populate entry-level leadId
    for (const entry of resolvedEntries) {
        let entryRequiresLead = false;
        if (voucherType === "Sales" || voucherType === "Purchase") {
            entryRequiresLead = true;
        } else {
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
                        entryRequiresLead = true;
                    }
                }
            }
        }

        const effectiveLeadId = entry.leadId || leadId;
        if (entryRequiresLead && voucherType !== "Journal") {
            if (!effectiveLeadId || !mongoose.Types.ObjectId.isValid(effectiveLeadId)) {
                return { error: `Project/Enquiry linkage (leadId) is required for Sales, Purchase, Salary, and Expense entry (${entry.ledgerName}).` };
            }
        }
        if (effectiveLeadId && mongoose.Types.ObjectId.isValid(effectiveLeadId)) {
            entry.leadId = effectiveLeadId;
        }
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

            if (leadId) {
                const { Leads } = req.tenantModels;
                let activityAction = null;
                const totalAmount = voucher.entries.filter(e => e.debit > 0).reduce((sum, e) => sum + e.debit, 0);

                if (voucherType === "Receipt") {
                    activityAction = `Bill Collection of ₹${totalAmount} recorded. (Ref: ${voucher.voucherNo})`;
                } else if (voucherType === "Payment") {
                    const isAdvance = req.body.legacyMetadata?.mode === "advance" || req.body.legacyMetadata?.mode === "salary";
                    const staffEntry = voucher.entries.find(e => e.accountType === "Staff" || isAdvance);
                    
                    if (staffEntry || isAdvance) {
                        const empName = staffEntry ? (staffEntry.ledgerName || "Employee") : "Employee";
                        const actionType = req.body.legacyMetadata?.mode === "salary" ? "Salary" : "Salary-Advance";
                        activityAction = `${actionType} paid to ${empName}: ₹${totalAmount}. (Ref: ${voucher.voucherNo})`;
                    }
                }
                
                if (activityAction) {
                    await Leads.findByIdAndUpdate(leadId, {
                        $push: { activity: { action: activityAction, byUser: req.user?.userDisplayName || "System", date: new Date() } }
                    });
                }
            }

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
            const ledgerEnrollmentMap = await getLedgerEnrollmentMap(req.tenantModels);
            const enrichedVouchers = vouchers.map(v => {
                const enrichedEntries = (v.entries || []).map(e => ({
                    ...e,
                    enrollmentNo: ledgerEnrollmentMap.get(String(e.ledgerId)) || ""
                }));
                return {
                    ...v,
                    entries: enrichedEntries
                };
            });
            res.json({ success: true, data: enrichedVouchers });
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

        if (leadId) {
            const { Leads } = req.tenantModels;
            const activityAction = `Salary Paid to ${employeeName || "Employee"}: ₹${amount}. (Ref: ${voucher.voucherNo})`;
            await Leads.findByIdAndUpdate(leadId, {
                $push: { activity: { action: activityAction, byUser: req.user?.userDisplayName || "System", date: new Date() } }
            });
        }

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
        const ledgerEnrollmentMap = await getLedgerEnrollmentMap(req.tenantModels);

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
                transactionCount: vouchers.length,
                enrollmentNo: ledgerEnrollmentMap.get(String(ledger._id)) || ""
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

        const ledgerEnrollmentMap = await getLedgerEnrollmentMap(req.tenantModels);

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
                    amount: oe.debit || oe.credit,
                    enrollmentNo: ledgerEnrollmentMap.get(String(oe.ledgerId)) || ""
                }))
            };
        });

        res.json({
            success: true,
            ledger: {
                _id: ledger._id,
                name: ledger.ledgerName || ledger.name || "",
                openingBal: ledger.openingBalance || ledger.openingBal || 0,
                enrollmentNo: ledgerEnrollmentMap.get(String(ledger._id)) || ""
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

    const ledgers = await Ledgers.find({ _id: { $in: uniqueIds } });
    const bulkOps = [];
    for (const ledger of ledgers) {
        const idStr = ledger._id.toString();
        const sums = sumMap[idStr] || { totalDr: 0, totalCr: 0 };
        const initialBal = ledger.openingBalanceType === 'Cr' ? -(ledger.openingBalance || 0) : (ledger.openingBalance || 0);
        const currentBalance = initialBal + sums.totalDr - sums.totalCr;
        if (ledger.currentBalance !== currentBalance) {
            bulkOps.push({
                updateOne: {
                    filter: { _id: ledger._id },
                    update: { $set: { currentBalance } }
                }
            });
        }
    }

    if (bulkOps.length > 0) {
        await Ledgers.bulkWrite(bulkOps);
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
    const bulkOps = [];
    for (const ledger of ledgers) {
        const sums = sumMap[ledger._id.toString()] || { totalDr: 0, totalCr: 0 };
        const initialBal = ledger.openingBalanceType === 'Cr' ? -(ledger.openingBalance || 0) : (ledger.openingBalance || 0);
        const currentBalance = initialBal + sums.totalDr - sums.totalCr;
        if (ledger.currentBalance !== currentBalance) {
            bulkOps.push({
                updateOne: {
                    filter: { _id: ledger._id },
                    update: { $set: { currentBalance } }
                }
            });
        }
    }

    if (bulkOps.length > 0) {
        await Ledgers.bulkWrite(bulkOps);
    }
};

exports.recalculateLedgerBalances = recalculateLedgerBalances;
exports.recalculateAllLedgerBalances = recalculateAllLedgerBalances;

exports.getLedgerTransactions = async (req, res) => {
    try {
        const { Ledgers, Vouchers } = req.tenantModels;
        const { accountId, accountType, from_date, to_date } = req.query;

        if (!accountId) {
            return res.status(400).json({ success: false, message: "accountId query parameter is required" });
        }

        let ledger = null;
        if (accountType === 'Staff') {
            ledger = await Ledgers.findOne({ refId: accountId, refType: { $in: ["Staff", "User"] } });
        } else if (accountType === 'Lead') {
            ledger = await Ledgers.findOne({ refId: accountId, refType: { $in: ["Client", "Lead"] } });
        }

        // Fallback to Category/ID match if not resolved
        if (!ledger) {
            if (mongoose.Types.ObjectId.isValid(accountId)) {
                ledger = await Ledgers.findById(accountId);
            }
        }

        if (!ledger) {
            return res.json({ success: true, data: [] });
        }

        const q = { "entries.ledgerId": ledger._id };
        
        // Enforce location filtering for non-CorpAdmins if needed
        const accessibleIds = req.user?.accessibleLocationIds;
        if (req.user?.userRole !== "CorpAdmin" && accessibleIds?.length > 0) {
            q.locationId = { $in: accessibleIds };
        }

        if (from_date || to_date) {
            q.date = {};
            if (from_date) q.date.$gte = new Date(from_date);
            if (to_date) {
                const end = new Date(to_date);
                end.setHours(23, 59, 59, 999);
                q.date.$lte = end;
            }
        }

        const vouchers = await Vouchers.find(q).sort({ date: -1 }).lean();

        const formatted = vouchers.map(v => {
            const entry = v.entries.find(e => String(e.ledgerId) === String(ledger._id));
            const amt = entry ? (entry.debit || entry.credit || 0) : 0;
            const paymentType = entry && entry.debit > 0 ? 'Dr' : 'Cr';

            return {
                amt,
                paymentType,
                voucherNarration: v.narration || "",
                voucherDate: v.date || v.createdAt
            };
        });

        res.json({ success: true, data: formatted });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * 📄 GET: Download Excel Voucher Upload Template
 * Generates an Excel sheet with 'Sales Vouchers' and 'Salary Payable Vouchers' tabs.
 */
exports.generateVoucherTemplate = async (req, res) => {
    try {
        const variant = String(req.query.variant || 'all').toLowerCase();
        const { Leads, Employees, Attendance } = req.tenantModels;
        const workbook = new ExcelJS.Workbook();

        // 1. Sales Vouchers Worksheet
        const salesSheet = workbook.addWorksheet('Sales Vouchers');
        salesSheet.columns = [
            { header: 'Date (YYYY-MM-DD)', key: 'date', width: 18 },
            { header: 'Voucher No / Ref', key: 'voucherNo', width: 18 },
            { header: 'Client Ledger Name', key: 'clientLedger', width: 25 },
            { header: 'Client Ledger _id', key: 'clientId', width: 28 },
            { header: 'Sales Ledger Name', key: 'salesLedger', width: 20 },
            { header: 'Amount', key: 'amount', width: 12 },
            { header: 'Narration', key: 'narration', width: 30 },
            { header: 'Project / Lead (No, Name or ID)', key: 'projectLead', width: 30 },
            { header: 'Project / Lead _id', key: 'projectLeadId', width: 28 }
        ];

        salesSheet.getRow(1).eachCell((cell) => {
            cell.font = { name: 'Arial', family: 4, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF1F497D' },
            };
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
        });

        // 2. Salary Payable Vouchers Worksheet
        const salarySheet = workbook.addWorksheet('Salary Payable Vouchers');
        salarySheet.columns = [
            { header: 'Date (YYYY-MM-DD)', key: 'date', width: 18 },
            { header: 'Voucher No / Ref', key: 'voucherNo', width: 18 },
            { header: 'Salary Expense Ledger Name', key: 'expenseLedger', width: 28 },
            { header: 'Employee Ledger Name', key: 'employeeLedger', width: 25 },
            { header: 'Employee Ledger _id', key: 'employeeId', width: 28 },
            { header: 'Amount', key: 'amount', width: 12 },
            { header: 'Narration', key: 'narration', width: 30 },
            { header: 'Project / Lead (No, Name or ID)', key: 'projectLead', width: 30 },
            { header: 'Project / Lead _id', key: 'projectLeadId', width: 28 }
        ];

        salarySheet.getRow(1).eachCell((cell) => {
            cell.font = { name: 'Arial', family: 4, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF375623' },
            };
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
        });

        // 3. Uniform & Equipment Issues Worksheet
        const uniformSheet = workbook.addWorksheet('Uniform & Equipment Issues');
        uniformSheet.columns = [
            { header: 'Date (YYYY-MM-DD)', key: 'date', width: 18 },
            { header: 'Voucher No / Ref', key: 'voucherNo', width: 18 },
            { header: 'Employee Ledger Name', key: 'employeeLedger', width: 25 },
            { header: 'Employee Ledger _id', key: 'employeeId', width: 28 },
            { header: 'Amount', key: 'amount', width: 12 },
            { header: 'Narration', key: 'narration', width: 30 },
            { header: 'Project / Lead (No, Name or ID)', key: 'projectLead', width: 30 },
            { header: 'Project / Lead _id', key: 'projectLeadId', width: 28 }
        ];

        uniformSheet.getRow(1).eachCell((cell) => {
            cell.font = { name: 'Arial', family: 4, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF7030A0' },
            };
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
        });

        const attendanceRecords = Attendance
            ? await Attendance.find({ dutyEnd: { $ne: null } }).sort({ dutyStart: -1 }).limit(40).lean()
            : [];

        const employeeIds = [...new Set(attendanceRecords.map((a) => String(a.employeeId)).filter(Boolean))];
        const leadIds = [...new Set(attendanceRecords.map((a) => String(a.leadId)).filter(Boolean))];

        const employeeMap = {};
        if (Employees && employeeIds.length > 0) {
            const employees = await Employees.find({ _id: { $in: employeeIds } }).select('_id enrollment_no name').lean();
            employees.forEach((emp) => {
                employeeMap[String(emp._id)] = emp;
            });
        }

        const leadMap = {};
        if (Leads && leadIds.length > 0) {
            const leads = await Leads.find({ _id: { $in: leadIds } }).select('_id lead_no sender_name').lean();
            leads.forEach((lead) => {
                leadMap[String(lead._id)] = lead;
            });
        }

        const addSalesSamplesFromAttendance = () => {
            const leadLookup = attendanceRecords
                .map((a) => String(a.leadId))
                .filter(Boolean)
                .reduce((acc, id) => {
                    acc[id] = acc[id] ? acc[id] + 1 : 1;
                    return acc;
                }, {});

            const sortedLeadIds = Object.keys(leadLookup).sort((a, b) => leadLookup[b] - leadLookup[a]).slice(0, 4);
            if (sortedLeadIds.length > 0) {
                sortedLeadIds.forEach((leadId, idx) => {
                    const lead = leadMap[leadId];
                    const record = attendanceRecords.find((a) => String(a.leadId) === leadId);
                    salesSheet.addRow({
                        date: record?.date ? formatDateToDDMMYYYY(new Date(record.date)) : '2026-06-14',
                        voucherNo: `SAL-${lead?.lead_no || '0000'}-${idx + 1}`,
                        clientLedger: lead?.sender_name || record?.site_name || 'Unknown Client',
                        clientId: leadId,
                        salesLedger: 'Sales',
                        amount: record?.dailyEarn || 1200,
                        narration: `Sales voucher for work at ${lead?.sender_name || record?.site_name}`,
                        projectLead: lead?.sender_name || record?.site_name || 'Unknown Site',
                        projectLeadId: leadId,
                    });
                });
                return;
            }

            salesSheet.addRow({
                date: '2026-06-01',
                voucherNo: 'SAL-2026-06-01',
                clientLedger: 'Acme Corporation',
                clientId: '',
                salesLedger: 'Sales',
                amount: 150000,
                narration: 'Sales invoice billing for June',
                projectLead: '1001',
                projectLeadId: '',
            });
        };

        const addSalarySamplesFromAttendance = () => {
            const empLookup = attendanceRecords
                .map((a) => String(a.employeeId))
                .filter(Boolean)
                .reduce((acc, id) => {
                    acc[id] = acc[id] ? acc[id] + 1 : 1;
                    return acc;
                }, {});

            const sortedEmpIds = Object.keys(empLookup).sort((a, b) => empLookup[b] - empLookup[a]).slice(0, 4);
            if (sortedEmpIds.length > 0) {
                sortedEmpIds.forEach((employeeId, idx) => {
                    const employee = employeeMap[employeeId];
                    const record = attendanceRecords.find((a) => String(a.employeeId) === employeeId);
                    const lead = record?.leadId ? leadMap[String(record.leadId)] : null;
                    salarySheet.addRow({
                        date: record?.date ? formatDateToDDMMYYYY(new Date(record.date)) : '2026-06-14',
                        voucherNo: `SALARY-${record?._id?.toString().slice(-6) || '000000'}-${idx + 1}`,
                        expenseLedger: 'Salary Expenses',
                        employeeLedger: employee?.name || record?.employeeName || 'Unknown Employee',
                        employeeId: employeeId,
                        amount: record?.dailyEarn || 25000,
                        narration: `Salary payable for duties at ${lead?.sender_name || record?.site_name}`,
                        projectLead: lead?.sender_name || record?.site_name || 'Unknown Site',
                        projectLeadId: record?.leadId ? String(record.leadId) : '',
                    });
                });
                return;
            }

            salarySheet.addRow({
                date: '2026-06-14',
                voucherNo: 'SALARY-2026-06',
                expenseLedger: 'Salary Expenses',
                employeeLedger: 'John Doe',
                employeeId: '',
                amount: 25000,
                narration: 'Salary payable for June 2026',
                projectLead: '1001',
                projectLeadId: '',
            });
        };

        if (variant === 'sales' || variant === 'all') {
            addSalesSamplesFromAttendance();
        } else {
            salesSheet.addRow({
                date: '2026-06-01',
                voucherNo: 'SAL-2026-06-01',
                clientLedger: 'Acme Corporation',
                clientId: '',
                salesLedger: 'Sales',
                amount: 150000,
                narration: 'Sales invoice billing for June',
                projectLead: '1001',
                projectLeadId: '',
            });
        }

        if (variant === 'salary' || variant === 'all') {
            addSalarySamplesFromAttendance();
        } else {
            salarySheet.addRow({
                date: '2026-06-14',
                voucherNo: 'SALARY-2026-06',
                expenseLedger: 'Salary Expenses',
                employeeLedger: 'John Doe',
                employeeId: '',
                amount: 25000,
                narration: 'Salary payable for June 2026',
                projectLead: '1001',
                projectLeadId: '',
            });
        }

        uniformSheet.addRow({
            date: '2026-06-15',
            voucherNo: 'UNI-2026-06-01',
            employeeLedger: 'John Doe',
            employeeId: '',
            amount: 1200,
            narration: 'Safety boots and safety vest issued',
            projectLead: '1001',
            projectLeadId: '',
        });
        uniformSheet.addRow({
            date: '2026-06-15',
            voucherNo: 'UNI-2026-06-02',
            employeeLedger: 'Jane Smith',
            employeeId: '',
            amount: 800,
            narration: 'Uniform shirt issued (2 pairs)',
            projectLead: '1002',
            projectLeadId: '',
        });

        const empSheet = workbook.addWorksheet('Employee Reference');
        empSheet.columns = [
            { header: '_objectId', key: '_id', width: 25 },
            { header: 'Enrollment Form Number', key: 'enrollment_no', width: 25 },
            { header: 'Employee Name', key: 'name', width: 30 }
        ];
        empSheet.getRow(1).eachCell((cell) => {
            cell.font = { name: 'Arial', family: 4, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF595959' },
            };
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
        });
        if (Employees) {
            const employees = await Employees.find({ active: true }).select('_id enrollment_no name').lean();
            employees.forEach((emp) => {
                empSheet.addRow({
                    _id: emp._id.toString(),
                    enrollment_no: emp.enrollment_no || '',
                    name: emp.name || '',
                });
            });
        }

        const clientSheet = workbook.addWorksheet('Client Reference');
        clientSheet.columns = [
            { header: '_objectId', key: '_id', width: 25 },
            { header: 'Lead No', key: 'lead_no', width: 20 },
            { header: 'Client Name', key: 'name', width: 30 }
        ];
        clientSheet.getRow(1).eachCell((cell) => {
            cell.font = { name: 'Arial', family: 4, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF595959' },
            };
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
        });
        if (Leads) {
            const leads = await Leads.find({}).select('_id lead_no sender_name').lean();
            leads.forEach((lead) => {
                clientSheet.addRow({
                    _id: lead._id.toString(),
                    lead_no: lead.lead_no || '',
                    name: lead.sender_name || '',
                });
            });
        }

        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', 'attachment; filename=Voucher_Upload_Template.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * 📥 POST: Parse Excel and Bulk Import Vouchers
 */
exports.bulkImportVouchers = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const previewOnly = String(req.query.preview || 'false').toLowerCase() === 'true';
        const { Leads, Employees, Ledgers, Groups, Vouchers, Counters, Parties } = req.tenantModels;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);

        const salesSheet = workbook.getWorksheet('Sales Vouchers') || workbook.getWorksheet(1);
        const salarySheet = workbook.getWorksheet('Salary Payable Vouchers') || workbook.getWorksheet(2);
        const uniformSheet = workbook.getWorksheet('Uniform & Equipment Issues') || workbook.getWorksheet(3);

        const errors = [];
        const parseDateVal = (val) => {
            if (val instanceof Date) return val;
            if (!val) return null;
            const d = new Date(val);
            return isNaN(d.getTime()) ? null : d;
        };

        const getCellValue = (cell) => {
            if (!cell) return null;
            if (cell.value && typeof cell.value === 'object') {
                if (cell.value.result !== undefined) return cell.value.result;
                if (cell.value.text !== undefined) return cell.value.text;
            }
            return cell.value;
        };

        // 1. Parse Sales Rows
        const salesRows = [];
        if (salesSheet) {
            salesSheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                    const dateVal = getCellValue(row.getCell(1));
                    const voucherNo = String(getCellValue(row.getCell(2)) || "").trim();
                    const clientLedger = String(getCellValue(row.getCell(3)) || "").trim();
                    const salesLedger = String(getCellValue(row.getCell(4)) || "").trim();
                    const amountVal = getCellValue(row.getCell(5));
                    const narration = String(getCellValue(row.getCell(6)) || "").trim();
                    const projectLead = String(getCellValue(row.getCell(7)) || "").trim();

                    // Skip empty rows
                    if (!dateVal && !clientLedger && !salesLedger && !amountVal) return;

                    salesRows.push({
                        rowNumber,
                        dateVal,
                        voucherNo,
                        clientLedger,
                        salesLedger,
                        amountVal,
                        narration,
                        projectLead
                    });
                }
            });
        }

        // 2. Parse Salary Rows
        const salaryRows = [];
        if (salarySheet) {
            salarySheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                    const dateVal = getCellValue(row.getCell(1));
                    const voucherNo = String(getCellValue(row.getCell(2)) || "").trim();
                    const expenseLedger = String(getCellValue(row.getCell(3)) || "").trim();
                    const employeeLedger = String(getCellValue(row.getCell(4)) || "").trim();
                    const amountVal = getCellValue(row.getCell(5));
                    const narration = String(getCellValue(row.getCell(6)) || "").trim();
                    const projectLead = String(getCellValue(row.getCell(7)) || "").trim();

                    // Skip empty rows
                    if (!dateVal && !expenseLedger && !employeeLedger && !amountVal) return;

                    salaryRows.push({
                        rowNumber,
                        dateVal,
                        voucherNo,
                        expenseLedger,
                        employeeLedger,
                        amountVal,
                        narration,
                        projectLead
                    });
                }
            });
        }

        // 3. Parse Uniform Rows
        const uniformRows = [];
        if (uniformSheet) {
            uniformSheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                    const dateVal = getCellValue(row.getCell(1));
                    const voucherNo = String(getCellValue(row.getCell(2)) || "").trim();
                    const employeeLedger = String(getCellValue(row.getCell(3)) || "").trim();
                    const amountVal = getCellValue(row.getCell(4));
                    const narration = String(getCellValue(row.getCell(5)) || "").trim();
                    const projectLead = String(getCellValue(row.getCell(6)) || "").trim();

                    // Skip empty rows
                    if (!dateVal && !employeeLedger && !amountVal) return;

                    uniformRows.push({
                        rowNumber,
                        dateVal,
                        voucherNo,
                        employeeLedger,
                        amountVal,
                        narration,
                        projectLead
                    });
                }
            });
        }

        if (salesRows.length === 0 && salaryRows.length === 0 && uniformRows.length === 0) {
            return res.status(400).json({ success: false, message: "Excel sheet is empty or contains no records." });
        }

        // Resolve default location ID for vouchers
        let resolvedLocId;
        const profile = await req.tenantModels.ProfileMaster.findOne({}).lean();
        resolvedLocId = profile?.locations?.[0]?._id || req.user?.accessibleLocationIds?.[0];
        if (!resolvedLocId) {
            resolvedLocId = new mongoose.Types.ObjectId();
        }

        // Cache all existing ledgers to speed up lookups and track planned creations
        const ledgerCache = {};
        const allLedgers = await Ledgers.find({}).lean();
        allLedgers.forEach(l => {
            ledgerCache[l.ledgerName.trim().toLowerCase()] = l;
        });

        // Group rows into Vouchers to support compound entries
        const salesVoucherGroups = {};
        let tempSalesIndex = 1;
        salesRows.forEach(row => {
            const key = row.voucherNo ? `SAL_${row.voucherNo}` : `TEMP_SAL_${tempSalesIndex++}`;
            if (!salesVoucherGroups[key]) {
                salesVoucherGroups[key] = [];
            }
            salesVoucherGroups[key].push(row);
        });

        const salaryVoucherGroups = {};
        let tempSalaryIndex = 1;
        salaryRows.forEach(row => {
            const key = row.voucherNo ? `JRN_${row.voucherNo}` : `TEMP_JRN_${tempSalaryIndex++}`;
            if (!salaryVoucherGroups[key]) {
                salaryVoucherGroups[key] = [];
            }
            salaryVoucherGroups[key].push(row);
        });

        const uniformVoucherGroups = {};
        let tempUniformIndex = 1;
        uniformRows.forEach(row => {
            const key = row.voucherNo ? `UNI_${row.voucherNo}` : `TEMP_UNI_${tempUniformIndex++}`;
            if (!uniformVoucherGroups[key]) {
                uniformVoucherGroups[key] = [];
            }
            uniformVoucherGroups[key].push(row);
        });

        const voucherPlans = [];

        // 3. Process Sales Groups (Dry Run Validation)
        for (const [key, rows] of Object.entries(salesVoucherGroups)) {
            const firstRow = rows[0];
            const date = parseDateVal(firstRow.dateVal);
            if (!date) {
                errors.push(`[Sales Vouchers Group ${key}] Date is invalid or empty.`);
                continue;
            }

            const entriesPlan = [];
            const originalRef = firstRow.voucherNo || "";

            for (const row of rows) {
                const rowAmt = parseFloat(row.amountVal);
                if (isNaN(rowAmt) || rowAmt <= 0) {
                    errors.push(`[Sales Row ${row.rowNumber}] Amount is invalid (must be greater than 0).`);
                    continue;
                }

                // Resolve Lead
                let leadId = null;
                if (!row.projectLead) {
                    errors.push(`[Sales Row ${row.rowNumber}] Project / Lead identifier is required.`);
                } else {
                    let lead = null;
                    if (mongoose.Types.ObjectId.isValid(row.projectLead)) {
                        lead = await Leads.findById(row.projectLead).lean();
                    }
                    if (!lead && !isNaN(Number(row.projectLead))) {
                        lead = await Leads.findOne({ lead_no: Number(row.projectLead) }).lean();
                    }
                    if (!lead) {
                        lead = await Leads.findOne({ sender_name: { $regex: new RegExp("^" + row.projectLead.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") } }).lean();
                    }
                    if (lead) {
                        leadId = lead._id;
                    } else {
                        errors.push(`[Sales Row ${row.rowNumber}] Project / Lead "${row.projectLead}" could not be resolved.`);
                    }
                }

                // Prepare Client Ledger (Sundry Debtors)
                const clientName = row.clientLedger;
                if (!clientName) {
                    errors.push(`[Sales Row ${row.rowNumber}] Client Ledger Name is required.`);
                    continue;
                }
                const clientCacheKey = clientName.toLowerCase();
                let clientLedgerPlan = ledgerCache[clientCacheKey];
                if (!clientLedgerPlan) {
                    const party = await Parties.findOne({ name: { $regex: new RegExp("^" + clientName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") }, type: "Client" }).lean();
                    clientLedgerPlan = {
                        isNew: true,
                        ledgerName: clientName,
                        groupName: "Sundry Debtors",
                        nature: "Dr",
                        refId: leadId || party?._id || null,
                        refType: leadId ? "Lead" : (party ? "Client" : "Manual")
                    };
                    ledgerCache[clientCacheKey] = clientLedgerPlan;
                }

                // Prepare Sales Ledger (Sales Accounts)
                const salesName = row.salesLedger || "Sales";
                const salesCacheKey = salesName.toLowerCase();
                let salesLedgerPlan = ledgerCache[salesCacheKey];
                if (!salesLedgerPlan) {
                    salesLedgerPlan = {
                        isNew: true,
                        ledgerName: salesName,
                        groupName: "Sales Accounts",
                        nature: "Cr"
                    };
                    ledgerCache[salesCacheKey] = salesLedgerPlan;
                }

                entriesPlan.push({
                    ledgerPlan: clientLedgerPlan,
                    debit: rowAmt,
                    credit: 0,
                    leadId
                });
                entriesPlan.push({
                    ledgerPlan: salesLedgerPlan,
                    debit: 0,
                    credit: rowAmt,
                    leadId
                });
            }

            const narrationParts = rows.map(r => r.narration).filter(Boolean);
            const narration = narrationParts.join("; ") || `Sales Voucher uploaded via Excel`;

            voucherPlans.push({
                voucherType: "Sales",
                date,
                narration,
                entriesPlan,
                originalRef,
                leadId: entriesPlan[0]?.leadId || null
            });
        }

        // 4. Process Salary Groups (Dry Run Validation)
        for (const [key, rows] of Object.entries(salaryVoucherGroups)) {
            const firstRow = rows[0];
            const date = parseDateVal(firstRow.dateVal);
            if (!date) {
                errors.push(`[Salary Vouchers Group ${key}] Date is invalid or empty.`);
                continue;
            }

            const entriesPlan = [];
            const originalRef = firstRow.voucherNo || "";

            for (const row of rows) {
                const rowAmt = parseFloat(row.amountVal);
                if (isNaN(rowAmt) || rowAmt <= 0) {
                    errors.push(`[Salary Row ${row.rowNumber}] Amount is invalid (must be greater than 0).`);
                    continue;
                }

                // Resolve Lead
                let leadId = null;
                if (!row.projectLead) {
                    errors.push(`[Salary Row ${row.rowNumber}] Project / Lead identifier is required.`);
                } else {
                    let lead = null;
                    if (mongoose.Types.ObjectId.isValid(row.projectLead)) {
                        lead = await Leads.findById(row.projectLead).lean();
                    }
                    if (!lead && !isNaN(Number(row.projectLead))) {
                        lead = await Leads.findOne({ lead_no: Number(row.projectLead) }).lean();
                    }
                    if (!lead) {
                        lead = await Leads.findOne({ sender_name: { $regex: new RegExp("^" + row.projectLead.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") } }).lean();
                    }
                    if (lead) {
                        leadId = lead._id;
                    } else {
                        errors.push(`[Salary Row ${row.rowNumber}] Project / Lead "${row.projectLead}" could not be resolved.`);
                    }
                }

                // Prepare Expense Ledger (Direct Expenses)
                const expenseName = row.expenseLedger || "Salary Expenses";
                const expenseCacheKey = expenseName.toLowerCase();
                let expenseLedgerPlan = ledgerCache[expenseCacheKey];
                if (!expenseLedgerPlan) {
                    expenseLedgerPlan = {
                        isNew: true,
                        ledgerName: expenseName,
                        groupName: "Direct Expenses",
                        nature: "Dr"
                    };
                    ledgerCache[expenseCacheKey] = expenseLedgerPlan;
                }

                // Prepare Employee Ledger (Account Payables)
                const employeeName = row.employeeLedger;
                if (!employeeName) {
                    errors.push(`[Salary Row ${row.rowNumber}] Employee Ledger Name is required.`);
                    continue;
                }
                const employeeCacheKey = employeeName.toLowerCase();
                let employeeLedgerPlan = ledgerCache[employeeCacheKey];
                if (!employeeLedgerPlan) {
                    const employee = await Employees.findOne({ name: { $regex: new RegExp("^" + employeeName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") } }).lean();
                    employeeLedgerPlan = {
                        isNew: true,
                        ledgerName: employeeName,
                        groupName: "Account Payables",
                        parentGroup: "Current Liabilities",
                        refId: employee?._id || null,
                        refType: employee ? "Staff" : "Manual",
                        nature: "Cr"
                    };
                    ledgerCache[employeeCacheKey] = employeeLedgerPlan;
                }

                entriesPlan.push({
                    ledgerPlan: expenseLedgerPlan,
                    debit: rowAmt,
                    credit: 0,
                    leadId
                });
                entriesPlan.push({
                    ledgerPlan: employeeLedgerPlan,
                    debit: 0,
                    credit: rowAmt,
                    leadId
                });
            }

            const narrationParts = rows.map(r => r.narration).filter(Boolean);
            const narration = narrationParts.join("; ") || `Salary Payable Voucher uploaded via Excel`;

            voucherPlans.push({
                voucherType: "Journal",
                date,
                narration,
                entriesPlan,
                originalRef,
                leadId: entriesPlan[0]?.leadId || null
            });
        }

        // 4b. Process Uniform Groups (Dry Run Validation)
        for (const [key, rows] of Object.entries(uniformVoucherGroups)) {
            const firstRow = rows[0];
            const date = parseDateVal(firstRow.dateVal);
            if (!date) {
                errors.push(`[Uniform Vouchers Group ${key}] Date is invalid or empty.`);
                continue;
            }

            const entriesPlan = [];
            const originalRef = firstRow.voucherNo || "";

            for (const row of rows) {
                const rowAmt = parseFloat(row.amountVal);
                if (isNaN(rowAmt) || rowAmt <= 0) {
                    errors.push(`[Uniform Row ${row.rowNumber}] Amount is invalid (must be greater than 0).`);
                    continue;
                }

                // Resolve Lead
                let leadId = null;
                if (row.projectLead) {
                    let lead = null;
                    if (mongoose.Types.ObjectId.isValid(row.projectLead)) {
                        lead = await Leads.findById(row.projectLead).lean();
                    }
                    if (!lead && !isNaN(Number(row.projectLead))) {
                        lead = await Leads.findOne({ lead_no: Number(row.projectLead) }).lean();
                    }
                    if (!lead) {
                        lead = await Leads.findOne({ sender_name: { $regex: new RegExp("^" + row.projectLead.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") } }).lean();
                    }
                    if (lead) {
                        leadId = lead._id;
                    } else {
                        errors.push(`[Uniform Row ${row.rowNumber}] Project / Lead "${row.projectLead}" could not be resolved.`);
                    }
                }

                // Prepare Employee Ledger (Account Payables) - Debiting Employee
                const employeeName = row.employeeLedger;
                if (!employeeName) {
                    errors.push(`[Uniform Row ${row.rowNumber}] Employee Ledger Name is required.`);
                    continue;
                }
                const employeeCacheKey = employeeName.toLowerCase();
                let employeeLedgerPlan = ledgerCache[employeeCacheKey];
                if (!employeeLedgerPlan) {
                    const employee = await Employees.findOne({ name: { $regex: new RegExp("^" + employeeName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + "$", "i") } }).lean();
                    employeeLedgerPlan = {
                        isNew: true,
                        ledgerName: employeeName,
                        groupName: "Account Payables",
                        parentGroup: "Current Liabilities",
                        refId: employee?._id || null,
                        refType: employee ? "Staff" : "Manual",
                        nature: "Cr"
                    };
                    ledgerCache[employeeCacheKey] = employeeLedgerPlan;
                }

                // Prepare Uniform & Equipment Ledger (Direct Expenses) - Crediting Uniform & Equipment
                const uniformSystemName = "Uniform & Equipment";
                const uniformCacheKey = uniformSystemName.toLowerCase();
                let uniformLedgerPlan = ledgerCache[uniformCacheKey];
                if (!uniformLedgerPlan) {
                    uniformLedgerPlan = {
                        isNew: true,
                        ledgerName: uniformSystemName,
                        groupName: "Direct Expenses",
                        nature: "Dr"
                    };
                    ledgerCache[uniformCacheKey] = uniformLedgerPlan;
                }

                // Debiting Employee Ledger
                entriesPlan.push({
                    ledgerPlan: employeeLedgerPlan,
                    debit: rowAmt,
                    credit: 0,
                    leadId
                });
                // Crediting Uniform & Equipment
                entriesPlan.push({
                    ledgerPlan: uniformLedgerPlan,
                    debit: 0,
                    credit: rowAmt,
                    leadId
                });
            }

            const narrationParts = rows.map(r => r.narration).filter(Boolean);
            const narration = narrationParts.join("; ") || `Uniform & Equipment Bulk Issued uploaded via Excel`;

            voucherPlans.push({
                voucherType: "Journal",
                date,
                narration,
                entriesPlan,
                originalRef,
                leadId: entriesPlan[0]?.leadId || null
            });
        }

        // Return error reports if any validation fails
        if (errors.length > 0) {
            return res.status(400).json({ success: false, message: "Excel sheet failed validation checks", errors });
        }

        // 5. Execution Phase (Save Vouchers and ensure ledgers exist)
        const savedVouchers = [];
        const affectedLedgerIds = new Set();

        for (const plan of voucherPlans) {
            const resolvedEntries = [];

            for (const entry of plan.entriesPlan) {
                let ledgerId;
                const lp = entry.ledgerPlan;

                if (lp.isNew) {
                    const createdLedger = await exports.ensureLedgerFolioInternal(req.tenantModels, {
                        name: lp.ledgerName,
                        group: lp.groupName,
                        parentGroup: lp.parentGroup,
                        refId: lp.refId,
                        refType: lp.refType,
                        nature: lp.nature
                    });
                    ledgerId = createdLedger._id;
                    lp.isNew = false;
                    lp._id = createdLedger._id;
                } else {
                    ledgerId = lp._id;
                }

                resolvedEntries.push({
                    ledgerId,
                    ledgerName: lp.ledgerName,
                    debit: entry.debit,
                    credit: entry.credit,
                    leadId: entry.leadId
                });

                affectedLedgerIds.add(ledgerId.toString());
            }

            const voucherType = plan.voucherType;
            const counterId = `voucher_${voucherType}_${resolvedLocId}`;
            const counter = await Counters.findByIdAndUpdate(counterId, { $inc: { seq: 1 } }, { upsert: true, new: true });
            const prefix = voucherType.substring(0, 3).toUpperCase();
            const voucherNo = `${prefix}-${resolvedLocId.toString().slice(-4)}-${counter.seq}`;

            const fullNarration = plan.narration + (plan.originalRef ? ` (Ref: ${plan.originalRef})` : "");

            const newVoucher = new Vouchers({
                locationId: resolvedLocId,
                voucherType,
                voucherNo,
                date: plan.date,
                narration: fullNarration,
                entries: resolvedEntries,
                leadId: plan.leadId,
                legacyMetadata: {
                    uploadRef: plan.originalRef || undefined,
                    source: "ExcelUpload"
                }
            });

            await newVoucher.save();
            savedVouchers.push(newVoucher);
        }

        // 6. Balance recalculation
        if (affectedLedgerIds.size > 0) {
            await recalculateLedgerBalances(req.tenantModels, Array.from(affectedLedgerIds));
        }

        res.json({
            success: true,
            message: `Successfully uploaded ${savedVouchers.length} vouchers containing ${savedVouchers.reduce((sum, v) => sum + v.entries.length, 0)} entries.`,
            count: savedVouchers.length
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * 📄 GET: Download Excel Salary Dues By Enrollment Template
 */
exports.generateSalaryDuesByEnrollmentTemplate = async (req, res) => {
    try {
        const ExcelJS = require("exceljs");
        const workbook = new ExcelJS.Workbook();
        
        const salarySheet = workbook.addWorksheet('Salary By Enrollment');
        salarySheet.columns = [
            { header: 'Enrollment Form Number', key: 'enrollment_no', width: 25 },
            { header: 'Amount', key: 'amount', width: 15 },
            { header: 'Narration (Optional)', key: 'narration', width: 35 }
        ];
        
        // Style headers
        salarySheet.getRow(1).eachCell((cell) => {
            cell.font = { name: 'Arial', family: 4, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF375623' } // dark green
            };
            cell.alignment = { vertical: 'middle', horizontal: 'left' };
        });
        
        // Sample rows
        salarySheet.addRow({
            enrollment_no: 'EMP-001',
            amount: 25000,
            narration: 'Salary dues'
        });
        
        res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', 'attachment; filename=Salary_By_Enrollment_Template.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/**
 * 📥 POST: Parse Excel and Bulk Import Salary Dues by Enrollment Number
 */
exports.bulkImportSalaryByEnrollment = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }

        const { Employees, Ledgers, Vouchers, Counters } = req.tenantModels;
        const ExcelJS = require("exceljs");
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);

        const salarySheet = workbook.getWorksheet(1);
        if (!salarySheet) {
            return res.status(400).json({ success: false, message: "No worksheet found" });
        }

        const successList = [];
        const failedList = [];
        
        const getCellValue = (cell) => {
            if (!cell) return null;
            if (cell.value && typeof cell.value === 'object') {
                if (cell.value.result !== undefined) return cell.value.result;
                if (cell.value.text !== undefined) return cell.value.text;
            }
            return cell.value;
        };

        // Cache Ledgers
        const ledgerCache = {};
        const allLedgers = await Ledgers.find({}).lean();
        allLedgers.forEach(l => {
            ledgerCache[l.ledgerName.trim().toLowerCase()] = l;
        });

        // Resolve Salary & Wages Expense Ledger
        const expenseName = "Salary & Wages";
        const expenseCacheKey = expenseName.toLowerCase();
        let expenseLedgerPlan = ledgerCache[expenseCacheKey];
        if (!expenseLedgerPlan) {
            expenseLedgerPlan = {
                isNew: true,
                ledgerName: expenseName,
                groupName: "Direct Expenses",
                nature: "Dr"
            };
            ledgerCache[expenseCacheKey] = expenseLedgerPlan;
        }

        const affectedLedgerIds = new Set();
        const voucherPlans = [];

        // Parse Rows
        const rowsToProcess = [];
        salarySheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const enrollment_no = String(getCellValue(row.getCell(1)) || "").trim();
                const amountVal = getCellValue(row.getCell(2));
                const narration = String(getCellValue(row.getCell(3)) || "").trim();

                if (!enrollment_no && !amountVal) return; // skip fully empty rows
                rowsToProcess.push({ rowNumber, enrollment_no, amountVal, narration });
            }
        });

        if (rowsToProcess.length === 0) {
            return res.status(400).json({ success: false, message: "Excel sheet is empty or contains no records." });
        }

        for (const row of rowsToProcess) {
            if (!row.enrollment_no) {
                failedList.push({ row: row.rowNumber, enrollment_no: row.enrollment_no, reason: "Enrollment number is empty" });
                continue;
            }
            const rowAmt = parseFloat(row.amountVal);
            if (isNaN(rowAmt) || rowAmt <= 0) {
                failedList.push({ row: row.rowNumber, enrollment_no: row.enrollment_no, reason: "Invalid amount" });
                continue;
            }

            // Find Employee
            const employee = await Employees.findOne({ enrollment_no: row.enrollment_no }).lean();
            if (!employee) {
                failedList.push({ row: row.rowNumber, enrollment_no: row.enrollment_no, reason: `Employee not found with enrollment no ${row.enrollment_no}` });
                continue;
            }

            // Employee Ledger
            const employeeName = employee.name;
            const employeeCacheKey = employeeName.toLowerCase();
            let employeeLedgerPlan = ledgerCache[employeeCacheKey];
            if (!employeeLedgerPlan) {
                employeeLedgerPlan = {
                    isNew: true,
                    ledgerName: employeeName,
                    groupName: "Account Payables",
                    parentGroup: "Current Liabilities",
                    refId: employee._id,
                    refType: "Staff",
                    nature: "Cr"
                };
                ledgerCache[employeeCacheKey] = employeeLedgerPlan;
            }

            const entriesPlan = [
                {
                    ledgerPlan: expenseLedgerPlan,
                    debit: rowAmt,
                    credit: 0
                },
                {
                    ledgerPlan: employeeLedgerPlan,
                    debit: 0,
                    credit: rowAmt
                }
            ];

            voucherPlans.push({
                rowNumber: row.rowNumber,
                enrollment_no: row.enrollment_no,
                amount: rowAmt,
                employeeName: employee.name,
                voucherType: "Journal",
                date: new Date(),
                narration: row.narration || `Salary dues for Enrollment No. ${row.enrollment_no}`,
                entriesPlan
            });
        }

        // Get Group IDs for new ledgers
        const { Groups } = req.tenantModels;
        const groupCache = {};
        const allGroups = await Groups.find({}).lean();
        allGroups.forEach(g => {
            groupCache[g.groupName.toLowerCase()] = g._id;
        });

        // Resolve LocId
        let resolvedLocId;
        const profile = await req.tenantModels.ProfileMaster.findOne({}).lean();
        resolvedLocId = profile?.locations?.[0]?._id || req.user?.accessibleLocationIds?.[0];
        if (!resolvedLocId) {
            resolvedLocId = new require('mongoose').Types.ObjectId();
        }

        const savedVouchers = [];

        for (const plan of voucherPlans) {
            try {
                const resolvedEntries = [];
                for (const entry of plan.entriesPlan) {
                    const lp = entry.ledgerPlan;
                    let ledgerId = lp._id;
                    if (lp.isNew) {
                        const grpId = groupCache[lp.groupName.toLowerCase()];
                        if (!grpId) throw new Error(`Accounting Group '${lp.groupName}' not found`);
                        const newLedger = new Ledgers({
                            ledgerName: lp.ledgerName,
                            ledgerGroupId: grpId,
                            openingBalance: 0,
                            openingBalanceType: lp.nature,
                            currentBalance: 0,
                            refId: lp.refId,
                            refType: lp.refType
                        });
                        await newLedger.save();
                        ledgerId = newLedger._id;
                        lp._id = ledgerId;
                        lp.isNew = false;
                    }
                    resolvedEntries.push({
                        ledgerId,
                        ledgerName: lp.ledgerName,
                        debit: entry.debit,
                        credit: entry.credit
                    });
                    affectedLedgerIds.add(ledgerId.toString());
                }

                const voucherType = plan.voucherType;
                const counterId = `voucher_${voucherType}_${resolvedLocId}`;
                const counter = await Counters.findByIdAndUpdate(counterId, { $inc: { seq: 1 } }, { upsert: true, new: true });
                const prefix = voucherType.substring(0, 3).toUpperCase();
                const voucherNo = `${prefix}-${resolvedLocId.toString().slice(-4)}-${counter.seq}`;

                const newVoucher = new Vouchers({
                    locationId: resolvedLocId,
                    voucherType,
                    voucherNo,
                    date: plan.date,
                    narration: plan.narration,
                    entries: resolvedEntries,
                    legacyMetadata: {
                        source: "ExcelUpload_EnrollmentSalary"
                    }
                });

                await newVoucher.save();
                savedVouchers.push(newVoucher);
                successList.push({ row: plan.rowNumber, enrollment_no: plan.enrollment_no, amount: plan.amount, employee: plan.employeeName });
            } catch (vErr) {
                failedList.push({ row: plan.rowNumber, enrollment_no: plan.enrollment_no, reason: vErr.message });
            }
        }

        if (affectedLedgerIds.size > 0) {
            await exports.recalculateLedgerBalances(req.tenantModels, Array.from(affectedLedgerIds));
        }

        res.json({
            success: true,
            message: `Processed ${rowsToProcess.length} rows. Success: ${successList.length}, Failed: ${failedList.length}`,
            successList,
            failedList
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.saveTempVoucher = async (req, res) => {
    try {
        const fs = require("fs");
        const path = require("path");
        const { voucherType, date, narration, entries, leadId, legacyMetadata } = req.body;
        
        const payload = {
            voucherType: voucherType || "Journal",
            date: date || new Date(),
            narration: narration || "",
            entries: entries || [],
            leadId,
            legacyMetadata
        };
        
        const tempFilePath = path.join(__dirname, "../temp_vch.json");
        fs.writeFileSync(tempFilePath, JSON.stringify(payload, null, 2), "utf8");
        
        res.status(200).json({ success: true, message: "Voucher saved to temp_vch.json successfully!" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.postFromTempVoucher = async (req, res) => {
    try {
        const fs = require("fs");
        const path = require("path");
        const { Vouchers, Counters } = req.tenantModels;
        
        const tempFilePath = path.join(__dirname, "../temp_vch.json");
        if (!fs.existsSync(tempFilePath)) {
            return res.status(400).json({ success: false, message: "temp_vch.json file not found. Save it first." });
        }
        
        const fileData = fs.readFileSync(tempFilePath, "utf8");
        const payload = JSON.parse(fileData);
        
        const { voucherType, date, narration, entries, leadId, legacyMetadata } = payload;
        
        // Validate using the helper
        const validation = await resolveAndValidateVoucher(req, voucherType || "Journal", entries, leadId, legacyMetadata);
        if (validation.error) {
            return res.status(400).json({ success: false, message: validation.error });
        }
        
        const resolvedEntries = validation.resolvedEntries;
        
        const type = voucherType || "Journal";
        const locationId = req.query.locationId || req.body.locationId;
        let resolvedLocId = locationId;
        if (!resolvedLocId || !mongoose.Types.ObjectId.isValid(resolvedLocId)) {
            const profile = await req.tenantModels.ProfileMaster.findOne({}).lean();
            resolvedLocId = profile?.locations?.[0]?._id || req.user?.accessibleLocationIds?.[0];
        }
        if (!resolvedLocId) {
            resolvedLocId = new mongoose.Types.ObjectId();
        }
        
        const counterId = `voucher_${type}_${resolvedLocId}`;
        const counter = await Counters.findByIdAndUpdate(counterId, { $inc: { seq: 1 } }, { upsert: true, new: true });
        
        const voucherNo = `${type.substring(0, 3).toUpperCase()}-${resolvedLocId.toString().slice(-4)}-${counter.seq}`;
        
        const newVoucher = new Vouchers({
            locationId: resolvedLocId,
            voucherType: type,
            voucherNo,
            date: date ? new Date(date) : new Date(),
            narration: narration || `Voucher posted from temp file`,
            entries: resolvedEntries,
            leadId,
            legacyMetadata
        });
        
        await newVoucher.save();
        
        await exports.recalculateLedgerBalances(req.tenantModels, resolvedEntries.map(e => e.ledgerId));
        
        // Remove temp file
        fs.unlinkSync(tempFilePath);
        
        res.status(201).json({ success: true, message: "Voucher posted from temp_vch.json successfully!", data: newVoucher });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

