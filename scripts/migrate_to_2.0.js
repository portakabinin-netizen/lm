const mongoose = require("mongoose");
const { CorpDataMaster } = require("../../backend/models/CorpDataMaster");
const { TransactionMaster } = require("../../backend/models/TransactionMaster");

// Legacy Models (Assume they exist in the codebase)
const { StaffBook } = require("../../backend/models/StaffBook");
const { LeadsLedgers: OldLeads } = require("../../backend/models/LeadsLedgers");
const { SalPurBook: OldSales } = require("../../backend/models/SalPurBook");
const { LedgerVoucherMaster: OldAccounting } = require("../../backend/models/LedgerVoucherMaster");
const OldPurchase = require("../../backend/models/purchase");

async function migrate() {
    console.log("🚀 Starting Migration to Hub-and-Spoke 2.0...");

    // 1. Migrate Staff & Suppliers
    const staffDocs = await StaffBook.find({});
    for (const doc of staffDocs) {
        const corpAdminId = doc._id;
        let master = await CorpDataMaster.findById(corpAdminId);
        if (!master) master = new CorpDataMaster({ _id: corpAdminId, corporateData: {} });

        for (const [cid, data] of doc.corporateData.entries()) {
            if (!master.corporateData.has(cid)) master.corporateData.set(cid, {});
            const slot = master.corporateData.get(cid);
            
            // Map Employees
            slot.employees = (data.staff || []).map(s => ({
                _id: s._id,
                name: s.staffName,
                role: s.role,
                mobile: s.mobile,
                joinDate: s.createdAt,
                active: true
            }));

            // Map Suppliers (from transporters/contacts)
            slot.suppliers = [
                ...(data.transporters || []).map(t => ({ name: t.name, mobile: t.mobile })),
                ...(data.contacts || []).map(c => ({ name: c.name, mobile: c.mobile }))
            ];
            
            // Attendance
            slot.attendance = (data.attendance || []).map(a => ({
                employeeId: a.staffId,
                date: a.date,
                status: a.status === "P" ? "Present" : a.status === "A" ? "Absent" : "Leave",
                siteId: a.siteName
            }));
        }
        await master.save();
    }
    console.log("✅ Staff Migration Complete");

    // 2. Migrate Leads
    const leadDocs = await OldLeads.find({});
    for (const doc of leadDocs) {
        const corpAdminId = doc._id;
        let master = await CorpDataMaster.findById(corpAdminId);
        if (!master) master = new CorpDataMaster({ _id: corpAdminId, corporateData: {} });

        for (const [cid, data] of doc.corporateData.entries()) {
            if (!master.corporateData.has(cid)) master.corporateData.set(cid, {});
            const slot = master.corporateData.get(cid);
            slot.leads = data.leads || [];
            slot.counters = slot.counters || {};
            slot.counters.lead = data.leadCounters || 0;
        }
        await master.save();
    }
    console.log("✅ Leads Migration Complete");

    // 3. Migrate Accounting
    const accDocs = await OldAccounting.find({});
    for (const doc of accDocs) {
        const corpAdminId = doc._id;
        let master = await CorpDataMaster.findById(corpAdminId);
        if (!master) master = new CorpDataMaster({ _id: corpAdminId, corporateData: {} });

        for (const [cid, data] of doc.corporateData.entries()) {
            if (!master.corporateData.has(cid)) master.corporateData.set(cid, {});
            const slot = master.corporateData.get(cid);
            slot.groups = data.groups || [];
            slot.ledgers = data.ledgers || [];
            // Vouchers are handled in TransactionMaster or here? 
            // In 2.0, non-commercial vouchers (Payment, Receipt, etc) go to CorpDataMaster
            // Commercial (Sales, Purchase) go to TransactionMaster
            slot.vouchers = (data.vouchers?.Payment || []).concat(data.vouchers?.Receipt || [], data.vouchers?.Journal || [], data.vouchers?.Contra || []);
        }
        await master.save();
    }
    console.log("✅ Accounting Migration Complete");

    // 4. Migrate Sales & Commercial
    const salesDocs = await OldSales.find({});
    for (const doc of salesDocs) {
        const corpAdminId = doc.corpAdminId; // Note: OldSales had corpAdminId as field
        let txMaster = await TransactionMaster.findById(corpAdminId);
        if (!txMaster) txMaster = new TransactionMaster({ _id: corpAdminId, corporateData: {} });

        for (const [cid, data] of doc.corporateData.entries()) {
            if (!txMaster.corporateData.has(cid)) txMaster.corporateData.set(cid, { transactions: [] });
            const slot = txMaster.corporateData.get(cid);
            
            const txs = [];
            (data.quotations || []).forEach(q => txs.push({ ...q.toObject(), txType: "Quote", txNo: q.quote_number, date: q.quote_date }));
            (data.purchaseOrders || []).forEach(p => txs.push({ ...p.toObject(), txType: "PO", txNo: p.po_number, date: p.po_date }));
            (data.taxInvoices || []).forEach(i => txs.push({ ...i.toObject(), txType: "Invoice", txNo: i.invoice_number, date: i.invoice_date }));
            
            slot.transactions = txs;
        }
        await txMaster.save();
    }
    // 5. Migrate Users
    const { Users } = require("../../backend/models/UsersCorporates");
    const userDocs = await Users.find({});
    for (const user of userDocs) {
        if (user.userRole === "CorpAdmin") continue; // Skip admin (he is the hub owner)

        // Find which corporate this user belongs to
        const access = user.accessCorporate;
        if (!access || !access.corpAdminId) continue;

        const corpAdminId = access.corpAdminId;
        let master = await CorpDataMaster.findById(corpAdminId);
        if (!master) continue;

        for (const link of access.linkedCorporates) {
            const cid = link.corporateId.toString();
            if (master.corporateData.has(cid)) {
                const slot = master.corporateData.get(cid);
                slot.users = slot.users || [];
                slot.users.push({
                    _id: user._id,
                    displayName: user.userDisplayName,
                    email: user.userEmail,
                    mobile: user.userMobile,
                    password: user.userPassword,
                    role: user.userRole === "Finance" ? "Finance" : user.userRole === "Project" ? "Project" : "Sales",
                    active: user.userActive
                });
            }
        }
        await master.save();
    }
    console.log("✅ Users Migration Complete");

    console.log("🎉 All Data Migrated successfully!");
}

module.exports = migrate;
