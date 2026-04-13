const { StaffBook } = require("../models/StaffBook");
const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — resolve / create hub + corporate slot
// ─────────────────────────────────────────────────────────────────────────────
async function getHub(corpAdminId, corporateId) {
    if (!corpAdminId || !corporateId) throw new Error("Corporate identity missing.");
    const id = new mongoose.Types.ObjectId(corpAdminId);
    let hub = await StaffBook.findById(id);
    if (!hub) hub = new StaffBook({ _id: id, corporateData: new Map() });
    if (!hub.corporateData.has(corporateId)) {
        hub.corporateData.set(corporateId, { employees: [], transporters: [], contacts: [] });
    }
    return hub;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEES
// ─────────────────────────────────────────────────────────────────────────────

exports.addEmployee = async (req, res) => {
    try {
        const corporateId = req.body.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const data = { ...req.body };
        delete data.corporateId;

        const hub = await getHub(corpAdminId, corporateId);
        const record = hub.corporateData.get(corporateId);
        record.employees.push(data);
        await hub.save();

        const saved = record.employees[record.employees.length - 1];
        res.status(201).json({ success: true, data: saved.toObject() });
    } catch (err) {
        res.status(err.name === "ValidationError" ? 400 : 500).json({ success: false, message: err.message });
    }
};

exports.listEmployees = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const { role, active } = req.query;

        const hub = await StaffBook.findById(new mongoose.Types.ObjectId(corpAdminId)).lean();
        const cid = corporateId?.toString();
        const record = hub?.corporateData instanceof Map
            ? hub.corporateData.get(cid)
            : hub?.corporateData?.[cid];

        if (!record) return res.json({ success: true, data: [] });

        let list = record.employees || [];
        if (role)   list = list.filter(e => e.role === role);
        if (active !== undefined) list = list.filter(e => e.active === (active === "true"));

        list.sort((a, b) => a.name.localeCompare(b.name));
        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.updateEmployee = async (req, res) => {
    try {
        const corporateId = req.body.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const { id } = req.params;

        const hub = await getHub(corpAdminId, corporateId);
        const record = hub.corporateData.get(corporateId);
        const doc = record.employees.id(id);
        if (!doc) return res.status(404).json({ success: false, message: "Employee not found" });

        const updates = { ...req.body };
        delete updates.corporateId;
        Object.keys(updates).forEach(k => { doc[k] = updates[k]; });

        await hub.save();
        res.json({ success: true, data: doc.toObject() });
    } catch (err) {
        res.status(err.name === "ValidationError" ? 400 : 500).json({ success: false, message: err.message });
    }
};

exports.deleteEmployee = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const hub = await getHub(corpAdminId, corporateId);
        const record = hub.corporateData.get(corporateId);
        record.employees.pull({ _id: req.params.id });
        await hub.save();
        res.json({ success: true, message: "Employee deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// TRANSPORTERS
// ─────────────────────────────────────────────────────────────────────────────

exports.addTransporter = async (req, res) => {
    try {
        const corporateId = req.body.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const data = { ...req.body };
        delete data.corporateId;

        const hub = await getHub(corpAdminId, corporateId);
        const record = hub.corporateData.get(corporateId);
        record.transporters.push(data);
        await hub.save();

        const saved = record.transporters[record.transporters.length - 1];
        res.status(201).json({ success: true, data: saved.toObject() });
    } catch (err) {
        res.status(err.name === "ValidationError" ? 400 : 500).json({ success: false, message: err.message });
    }
};

exports.listTransporters = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const { vehicle_type, active } = req.query;

        const hub = await StaffBook.findById(new mongoose.Types.ObjectId(corpAdminId)).lean();
        const cid = corporateId?.toString();
        const record = hub?.corporateData instanceof Map
            ? hub.corporateData.get(cid)
            : hub?.corporateData?.[cid];

        if (!record) return res.json({ success: true, data: [] });

        let list = record.transporters || [];
        if (vehicle_type) list = list.filter(t => t.vehicle_type === vehicle_type);
        if (active !== undefined) list = list.filter(t => t.active === (active === "true"));

        list.sort((a, b) => a.name.localeCompare(b.name));
        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.updateTransporter = async (req, res) => {
    try {
        const corporateId = req.body.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const { id } = req.params;

        const hub = await getHub(corpAdminId, corporateId);
        const record = hub.corporateData.get(corporateId);
        const doc = record.transporters.id(id);
        if (!doc) return res.status(404).json({ success: false, message: "Transporter not found" });

        const updates = { ...req.body };
        delete updates.corporateId;
        Object.keys(updates).forEach(k => { doc[k] = updates[k]; });

        await hub.save();
        res.json({ success: true, data: doc.toObject() });
    } catch (err) {
        res.status(err.name === "ValidationError" ? 400 : 500).json({ success: false, message: err.message });
    }
};

exports.deleteTransporter = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const hub = await getHub(corpAdminId, corporateId);
        const record = hub.corporateData.get(corporateId);
        record.transporters.pull({ _id: req.params.id });
        await hub.save();
        res.json({ success: true, message: "Transporter deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// COMBINED PICKER  — used by Finance form; returns employees, transporters, contacts
// ─────────────────────────────────────────────────────────────────────────────
exports.getStaffPicker = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const { type } = req.query; // "employee" | "transporter" | "contact" | undefined (all)

        const hub = await StaffBook.findById(new mongoose.Types.ObjectId(corpAdminId)).lean();
        const cid = corporateId?.toString();
        const record = hub?.corporateData instanceof Map
            ? hub.corporateData.get(cid)
            : hub?.corporateData?.[cid];

        const employees    = (record?.employees    || []).filter(e => e.active !== false);
        const transporters = (record?.transporters || []).filter(t => t.active !== false);
        const contacts     = (record?.contacts     || []).filter(c => c.active !== false);

        const result = {};
        if (!type || type === "employee")    result.employees    = employees;
        if (!type || type === "transporter") result.transporters = transporters;
        if (!type || type === "contact")     result.contacts     = contacts;

        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS (Party Ledger Accounts)
// ─────────────────────────────────────────────────────────────────────────────

exports.addContact = async (req, res) => {
    try {
        const corporateId = req.body.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const data = { ...req.body };
        delete data.corporateId;

        // Prevent duplicate mobile within same corporate
        const hub = await getHub(corpAdminId, corporateId);
        const record = hub.corporateData.get(corporateId);
        const cleanMobile = data.mobile?.replace(/\D/g, '').slice(-10);
        const exists = record.contacts.find(c => c.mobile?.replace(/\D/g, '').slice(-10) === cleanMobile);
        if (exists) {
            return res.status(409).json({ success: false, message: "Contact with this mobile already exists", data: exists.toObject() });
        }

        data.mobile = cleanMobile;
        record.contacts.push(data);
        hub.markModified("corporateData");
        await hub.save();

        const saved = record.contacts[record.contacts.length - 1];
        res.status(201).json({ success: true, data: saved.toObject() });
    } catch (err) {
        res.status(err.name === "ValidationError" ? 400 : 500).json({ success: false, message: err.message });
    }
};

exports.listContacts = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const { type, q } = req.query;

        const hub = await StaffBook.findById(new mongoose.Types.ObjectId(corpAdminId)).lean();
        const cid = corporateId?.toString();
        const record = hub?.corporateData instanceof Map
            ? hub.corporateData.get(cid)
            : hub?.corporateData?.[cid];

        if (!record) return res.json({ success: true, data: [] });

        let list = record.contacts || [];
        if (type) list = list.filter(c => c.type === type);
        if (q)    list = list.filter(c =>
            c.name?.toLowerCase().includes(q.toLowerCase()) ||
            c.mobile?.includes(q)
        );
        list.sort((a, b) => a.name.localeCompare(b.name));
        res.json({ success: true, data: list });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.updateContact = async (req, res) => {
    try {
        const corporateId = req.body.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const { id } = req.params;

        const hub = await getHub(corpAdminId, corporateId);
        const record = hub.corporateData.get(corporateId);
        const doc = record.contacts.id(id);
        if (!doc) return res.status(404).json({ success: false, message: "Contact not found" });

        const updates = { ...req.body };
        delete updates.corporateId;
        Object.keys(updates).forEach(k => { doc[k] = updates[k]; });
        hub.markModified("corporateData");
        await hub.save();
        res.json({ success: true, data: doc.toObject() });
    } catch (err) {
        res.status(err.name === "ValidationError" ? 400 : 500).json({ success: false, message: err.message });
    }
};

exports.deleteContact = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const hub = await getHub(corpAdminId, corporateId);
        const record = hub.corporateData.get(corporateId);
        record.contacts.pull({ _id: req.params.id });
        hub.markModified("corporateData");
        await hub.save();
        res.json({ success: true, message: "Contact deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET PARTY LEDGER  — all transactions for a contact identified by mobile
// Returns running balance (Dr/Cr), total loaned, total repaid etc.
// ─────────────────────────────────────────────────────────────────────────────
exports.getPartyLedger = async (req, res) => {
    try {
        const { mobile } = req.params;
        const corporateId = req.query.corporateId || req.user?.corporateId;
        const corpAdminId = req.user?.corpAdminId;
        const { PaymentBook } = require("../models/PaymentBook");

        const cleanMobile = mobile.replace(/\D/g, '').slice(-10);

        // 1. Get contact profile from StaffBook
        const staffHub = await StaffBook.findById(new mongoose.Types.ObjectId(corpAdminId)).lean();
        const cid = corporateId?.toString();
        const staffRecord = staffHub?.corporateData instanceof Map
            ? staffHub.corporateData.get(cid)
            : staffHub?.corporateData?.[cid];
        const contact = (staffRecord?.contacts || []).find(c => c.mobile?.replace(/\D/g, '').slice(-10) === cleanMobile);

        // 2. Get all transactions linked to this mobile from PaymentBook
        const payHub = await PaymentBook.findById(new mongoose.Types.ObjectId(corpAdminId)).lean();
        const payRecord = payHub?.corporateData instanceof Map
            ? payHub.corporateData.get(cid)
            : payHub?.corporateData?.[cid];

        const txns = (payRecord?.transactions || [])
            .filter(t => t.contact_mobile?.replace(/\D/g, '').slice(-10) === cleanMobile ||
                         t.party_name?.toLowerCase() === contact?.name?.toLowerCase())
            .sort((a, b) => new Date(b.txn_date) - new Date(a.txn_date));

        // 3. Compute running balance
        // PAYMENT = money out (Dr for us) = we owe them less / they owe us more
        // RECEIPT = money in (Cr for us)
        const totalPaid     = txns.filter(t => t.direction === "PAYMENT").reduce((s, t) => s + (t.amount || 0), 0);
        const totalReceived = txns.filter(t => t.direction === "RECEIPT").reduce((s, t) => s + (t.amount || 0), 0);
        const netBalance    = totalReceived - totalPaid; // positive = we owe them, negative = they owe us

        res.json({
            success: true,
            data: {
                contact: contact || { name: "Unknown", mobile: cleanMobile },
                transactions: txns,
                totalPaid,
                totalReceived,
                netBalance,  // positive = net inflow (we received more than we paid)
                txnCount: txns.length,
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
