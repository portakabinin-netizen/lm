const mongoose = require("mongoose");
const { LeadsLedgers: DefaultLeads } = require("../models/LeadsLedgers");

function getModel(dbName) {
  if (dbName && typeof dbName === "string" && dbName.trim()) {
    const tConn = mongoose.connection.useDb(dbName.trim(), { useCache: true });
    return tConn.models.Leads || tConn.model("Leads", DefaultLeads.schema, "leads");
  }
  return DefaultLeads;
}

const Leads = DefaultLeads;

/**
 * ✅ Create a new lead
 */
exports.create = async (data, dbName = "") => {
  const Model = getModel(dbName);
  // 1. Check if source_id already exists to prevent crash
  if (data.source_id) {
    const existing = await Model.findOne({ source_id: data.source_id });
    if (existing) {
      throw new Error("A lead with this source_id already exists.");
    }
  }

  const lead = new Model(data);
  return await lead.save();
};

/**
 * ✅ Bulk insert leads (Add Many)
 * Handles the array of leads sent from the frontend batching logic
 */
exports.addMany = async (leadsArray, dbName = "") => {
  try {
    if (!Array.isArray(leadsArray) || leadsArray.length === 0) {
      return { success: true, insertedCount: 0, message: "Empty array received" };
    }

    const Model = getModel(dbName);

    // 1. Extract source_ids to check for duplicates
    const incomingSourceIds = leadsArray
      .map(l => l.source_id)
      .filter(id => id != null);
        
    // 2. Identify existing leads in DB
    const existingLeads = await Model.find(
      { source_id: { $in: incomingSourceIds } },
      { source_id: 1 }
    );
    
    const existingIdsSet = new Set(existingLeads.map(l => l.source_id));

    // 3. Filter the array: Only keep leads that DON'T exist yet
    const newLeadsToInsert = leadsArray.filter(
      lead => !existingIdsSet.has(lead.source_id)
    );

    if (newLeadsToInsert.length === 0) {
      return { success: true, insertedCount: 0, message: "All leads are duplicates." };
    }

    // 4. Get current lead numbering
    const lastLead = await Model.findOne().sort({ lead_no: -1 }).select("lead_no");
    let currentNo = lastLead ? lastLead.lead_no : 0;
    
    // 5. Final Preparation & Sanitization
    const finalizedLeads = newLeadsToInsert.map((lead) => {
      const sanitized = { ...lead };

      // 🔥 CRITICAL: Remove trailing spaces from IDs that cause "CastError"
      if (sanitized.corporateId) sanitized.corporateId = String(sanitized.corporateId).trim();
      if (sanitized.corpAdminId) sanitized.corpAdminId = String(sanitized.corpAdminId).trim();

      // Activity cleaning
      if (Array.isArray(sanitized.activity)) {
        sanitized.activity = sanitized.activity.filter(a => a && a.action && a.byUser);
      } else {
        sanitized.activity = [];
      }

      // Ledger cleaning
      if (Array.isArray(sanitized.ledger)) {
        sanitized.ledger = sanitized.ledger.filter(l => l && l.paymentType && l.voucherAmount?.value);
      } else {
        sanitized.ledger = [];
      }

      // Email cleaning
      if (!sanitized.sender_email?.trim()) {
        delete sanitized.sender_email;
      }

      sanitized.lead_no = ++currentNo;
      
      // Date formatting
      sanitized.generated_date = lead.generated_date ? new Date(lead.generated_date) : new Date();

      return sanitized;
    });

    // 6. Execution with ordered: false (if one fails, others still save)
    
    const result = await Model.insertMany(finalizedLeads, { 
      ordered: false,
      rawResult: true 
    });

    return {
      success: true,
      insertedCount: result.insertedCount || 0,
      skippedCount: leadsArray.length - (result.insertedCount || 0)
    };

  } catch (error) {
    console.error("🔥 DATABASE ERROR:", error);
    
    // Check if it was a partial success (insertMany error object)
    if (error.insertedDocs) {
        return {
            success: true,
            insertedCount: error.insertedDocs.length,
            message: "Partial success, some records failed validation",
            error: error.message
        };
    }

    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * ✅ List all leads (supports filters such as status or corporateId)
 */
exports.list = async (filters = {}, dbName = "") => {
  const Model = getModel(dbName);
  const query = {};

  if (filters.status) query.status = filters.status;
  if (filters.corporateId) query.corporateId = filters.corporateId;

  return await Model.find(query).sort({ createdAt: -1 });
};

/**
 * ✅ Get a single lead by ID
 */
exports.getById = async (id, dbName = "") => {
  const Model = getModel(dbName);
  return await Model.findById(id);
};

/**
 * ✅ Update an existing lead
 */
exports.update = async (id, data, dbName = "") => {
  const Model = getModel(dbName);
  return await Model.findByIdAndUpdate(id, data, { new: true });
};

/**
 * ✅ Delete a lead
 */
exports.remove = async (id, dbName = "") => {
  const Model = getModel(dbName);
  return await Model.findByIdAndDelete(id);
};

/* --------------------------------------------------
   📘 Additional Business Logic Functions
-------------------------------------------------- */

/**
 * ✅ Get leads filtered by status
 */
exports.getLeadsByStatus = async (status, corporateId, dbName = "") => {
  try {
    const Model = getModel(dbName);
    const query = {};
    
    if (status) {
      query.status = { $regex: `^${status.trim()}$`, $options: "i" };
    }
    
    if (corporateId && corporateId !== "undefined") {
      query.corporateId = String(corporateId).trim();
    }

    return await Model.find(query).sort({ createdAt: -1 });
  } catch (error) {
    console.error("❌ Service Error in getLeadsByStatus:", error.message);
    throw error; 
  }
};

/**
 * ✅ Get project active leads
 */
exports.getProjectActive = async (dbName = "") => {
  const Model = getModel(dbName);
  return await Model.find({ projectStatus: "Active" }).sort({ createdAt: -1 });
};

/**
 * ✅ Leads analytics aggregation for dashboard
 */
exports.analytics = async (dbName = "", filters = {}) => {
  const Model = getModel(dbName);
  const match = {};

  if (filters.fromDate && filters.fromDate === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    match.createdAt = { $gte: start };
  } else if (filters.fromDate && filters.fromDate === "7days") {
    const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    match.createdAt = { $gte: start };
  } else if (filters.fromDate && filters.fromDate === "30days") {
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    match.createdAt = { $gte: start };
  } else if (filters.fromDate) {
    const start = new Date(filters.fromDate);
    if (!isNaN(start.getTime())) match.createdAt = { $gte: start };
  }

  if (filters.toDate) {
    const end = new Date(filters.toDate);
    if (!isNaN(end.getTime())) {
      match.createdAt = match.createdAt || {};
      match.createdAt.$lte = end;
    }
  }

  if (filters.source) {
    match.source = filters.source;
  }

  const pipeline = [
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    {
      $group: {
        _id: "$source",
        total: { $sum: 1 },
        posCount: { $sum: { $cond: [{ $in: ["$status", ["Accepted", "Invoice", "Fully Paid"]] }, 1, 0] } },
        recycleCount: { $sum: { $cond: [{ $in: ["$status", ["Recycle", "Delete"]] }, 1, 0] } },
        pendingCount: { $sum: { $cond: [{ $in: ["$status", ["Recent", "Engaged"]] }, 1, 0] } }
      }
    }
  ];

  const sourceAgg = await Model.aggregate(pipeline);
  const sources = sourceAgg.map((s) => ({
    label: s._id || "Other",
    total: s.total,
    posCount: s.posCount,
    recycleCount: s.recycleCount,
    pendingCount: s.pendingCount
  }));

  const statusPipeline = [
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    }
  ];

  const statusAgg = await Model.aggregate(statusPipeline);
  const statuses = statusAgg.map((st) => ({
    label: st._id || "Other",
    value: st.count
  }));

  const total = await Model.countDocuments(match);

  return {
    total,
    sources,
    statuses,
    financeTrend: []
  };
};

/**
 * ✅ Update lead status and optionally add a comment
 */
exports.updateLeadStatus = async (id, status, comment, dbName = "") => {
  const Model = getModel(dbName);
  const updateData = { status };

  if (comment && comment.trim()) {
    updateData.$push = {
      comments: { text: comment, date: new Date() },
    };
  }

  return await Model.findByIdAndUpdate(id, updateData, { new: true });
};

/**
 * ✅ Add a ledger entry (finance-related)
 */
exports.addLedgerEntry = async (id, ledgerEntry, dbName = "") => {
  const Model = getModel(dbName);
  return await Model.findByIdAndUpdate(
    id,
    { $push: { ledgerEntries: ledgerEntry } },
    { new: true }
  );
};

/**
 * ✅ Add embedded ledger entry (if schema supports embeddedLedgers)
 */
exports.addEmbeddedLedger = async (id, ledgerEntry, dbName = "") => {
  const Model = getModel(dbName);
  return await Model.findByIdAndUpdate(
    id,
    { $push: { embeddedLedgers: ledgerEntry } },
    { new: true }
  );
};

/**
 * ✅ Add an Activity log to a specific lead
 */
exports.addActivity = async (id, activityData, dbName = "") => {
  try {
    const Model = getModel(dbName);
    const updatedLead = await Model.findByIdAndUpdate(
      id,
      { 
        $push: { 
          activity: {
            action: activityData.action,
            byUser: activityData.byUser,
            date: new Date()
          } 
        } 
      },
      { new: true } // Return the updated document
    );
    return updatedLead;
  } catch (error) {
    console.error("❌ Service Error in addActivity:", error.message);
    throw error;
  }
};