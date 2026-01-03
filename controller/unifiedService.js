const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// Models
const { LeadsLedgers: Leads } = require("../models/LeadsLedgers");
const { Users, Corporates } = require("../models/UsersCorporates");

/* ============================================================
   1. LEADS SERVICE
   ============================================================ */
exports.leadService = {
  create: async (data) => {
    if (data.source_id) {
      const existing = await Leads.findOne({ source_id: data.source_id });
      if (existing) throw new Error("A lead with this source_id already exists.");
    }
    return await new Leads(data).save();
  },

  addMany: async (leadsArray) => {
    if (!Array.isArray(leadsArray) || leadsArray.length === 0) {
      return { success: true, insertedCount: 0, message: "Empty array" };
    }

    const incomingSourceIds = leadsArray.map(l => l.source_id).filter(id => id != null);
    const existingLeads = await Leads.find({ source_id: { $in: incomingSourceIds } }, { source_id: 1 });
    const existingIdsSet = new Set(existingLeads.map(l => l.source_id));

    const newLeadsToInsert = leadsArray.filter(l => !existingIdsSet.has(l.source_id));
    if (newLeadsToInsert.length === 0) return { success: true, insertedCount: 0, message: "All duplicates" };

    const lastLead = await Leads.findOne().sort({ lead_no: -1 }).select("lead_no");
    let currentNo = lastLead ? lastLead.lead_no : 0;

    const finalizedLeads = newLeadsToInsert.map(lead => {
      const sanitized = { ...lead };
      if (sanitized.corporateId) sanitized.corporateId = String(sanitized.corporateId).trim();
      
      // Sanitizing nested arrays
      sanitized.activity = Array.isArray(sanitized.activity) ? sanitized.activity.filter(a => a?.action) : [];
      sanitized.ledger = Array.isArray(sanitized.ledger) ? sanitized.ledger.filter(l => l?.paymentType) : [];
      
      sanitized.lead_no = ++currentNo;
      sanitized.generated_date = lead.generated_date ? new Date(lead.generated_date) : new Date();
      return sanitized;
    });

    const result = await Leads.insertMany(finalizedLeads, { ordered: false, rawResult: true });
    return { 
        success: true, 
        insertedCount: result.insertedCount || 0, 
        skippedCount: leadsArray.length - (result.insertedCount || 0) 
    };
  },

  list: async (filters = {}) => {
    const query = {};
    if (filters.status) query.status = filters.status;
    if (filters.corporateId) query.corporateId = filters.corporateId;
    return await Leads.find(query).sort({ createdAt: -1 });
  },

  getById: async (id) => await Leads.findById(id),
  
  update: async (id, data) => await Leads.findByIdAndUpdate(id, data, { new: true }),
  
  remove: async (id) => await Leads.findByIdAndDelete(id),

  getLeadsByStatus: async (status, corporateId) => {
    const query = {};
    if (status) query.status = { $regex: `^${status.trim()}$`, $options: "i" };
    if (corporateId && corporateId !== "undefined") query.corporateId = String(corporateId).trim();
    return await Leads.find(query).sort({ createdAt: -1 });
  },

  addActivity: async (id, activityData) => {
    return await Leads.findByIdAndUpdate(
      id,
      { $push: { activity: { ...activityData, date: new Date() } } },
      { new: true }
    );
  }
};

/* ============================================================
   2. CORPORATE SERVICE
   ============================================================ */
exports.corporateService = {
  create: async (data) => await new Corporates(data).save(),
  
  list: async (filters = {}) => await Corporates.find(filters).sort({ createdAt: -1 }),
  
  getById: async (id) => await Corporates.findById(id),
  
  update: async (id, data) => await Corporates.findByIdAndUpdate(id, data, { new: true }),
  
  remove: async (id) => await Corporates.findByIdAndDelete(id)
};

/* ============================================================
   3. LEDGER SERVICE (Refactored to check specific model)
   ============================================================ */
exports.ledgerService = {
  // Assuming Ledger is part of LeadsLedgers or a separate Model
  list: async (filters = {}) => await Leads.find({ "ledger.0": { $exists: true }, ...filters }),
  
  getById: async (id) => await Leads.findOne({ "ledger._id": id }, { "ledger.$": 1 }),
  
  update: async (id, data) => {
      // Logic for updating a specific ledger entry inside a lead
      return await Leads.findOneAndUpdate({ "ledger._id": id }, { $set: { "ledger.$": data } }, { new: true });
  }
};

/* ============================================================
   4. USER SERVICE
   ============================================================ */
exports.userService = {
  create: async (data) => {
    const { userMobile, userPassword, corporateId } = data;

    const existing = await Users.findOne({ userMobile });
    if (existing) throw new Error("Mobile number already registered");

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(userPassword, salt);

    const user = new Users({ ...data, userPassword: hashedPassword });
    await user.save();

    // Link User to Corporate
    if (corporateId && corporateId !== "None") {
      const corp = await Corporates.findById(corporateId);
      if (corp) {
        corp.linkedUsers.push(user._id);
        await corp.save();
      }
    }
    return user;
  },

  list: async (filters = {}) => await Users.find(filters).select("-userPassword"),
  
  getById: async (id) => await Users.findById(id).select("-userPassword"),
  
  update: async (id, data) => {
      if(data.userPassword) {
          const salt = await bcrypt.genSalt(10);
          data.userPassword = await bcrypt.hash(data.userPassword, salt);
      }
      return await Users.findByIdAndUpdate(id, data, { new: true });
  },

  remove: async (id) => await Users.findByIdAndDelete(id),
  
  findByMobile: async (mobile) => await Users.findOne({ userMobile: mobile, userActive: true })
};