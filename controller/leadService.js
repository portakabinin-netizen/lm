const { LeadsLedgers: Leads } = require("../models/LeadsLedgers");
/**
 * ✅ Create a new lead
 */
exports.create = async (data) => {
  // 1. Check if source_id already exists to prevent crash
  if (data.source_id) {
    const existing = await Leads.findOne({ source_id: data.source_id });
    if (existing) {
      throw new Error("A lead with this source_id already exists.");
    }
  }

  const lead = new Leads(data);
  return await lead.save();
};

/**
 * ✅ Bulk insert leads (Add Many)
 * Handles the array of leads sent from the frontend batching logic
 */

exports.addMany = async (leadsArray) => {
  try {
    if (!Array.isArray(leadsArray) || leadsArray.length === 0) {
      return { success: true, insertedCount: 0, message: "Empty array received" };
    }

    // 1. Extract source_ids to check for duplicates
    const incomingSourceIds = leadsArray
      .map(l => l.source_id)
      .filter(id => id != null);
        
    // 2. Identify existing leads in DB
    const existingLeads = await Leads.find(
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
    const lastLead = await Leads.findOne().sort({ lead_no: -1 }).select("lead_no");
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
    
    const result = await Leads.insertMany(finalizedLeads, { 
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
exports.list = async (filters = {}) => {
  const query = {};

  if (filters.status) query.status = filters.status;
  if (filters.corporateId) query.corporateId = filters.corporateId;

  return await Leads.find(query).sort({ createdAt: -1 });
};

/**
 * ✅ Get a single lead by ID
 */
exports.getById = async (id) => {
  return await Leads.findById(id);
};

/**
 * ✅ Update an existing lead
 */
exports.update = async (id, data) => {
  return await Leads.findByIdAndUpdate(id, data, { new: true });
};

/**
 * ✅ Delete a lead
 */
exports.remove = async (id) => {
  return await Leads.findByIdAndDelete(id);
};

/* --------------------------------------------------
   📘 Additional Business Logic Functions
-------------------------------------------------- */

/**
 * ✅ Get leads filtered by status*/

exports.getLeadsByStatus = async (status, corporateId) => {
  try {
    const query = {};
    
    if (status) {
      query.status = { $regex: `^${status.trim()}$`, $options: "i" };
    }
    
    // Ensure corporateId is handled as a string and not "undefined" string
    if (corporateId && corporateId !== "undefined") {
      query.corporateId = String(corporateId).trim();
    }

    // This will now work because 'Leads' is the actual Mongoose Model
    const fetchedData = await Leads.find(query).sort({ createdAt: -1 });
    return fetchedData;
    
  } catch (error) {
    console.error("❌ Service Error in getLeadsByStatus:", error.message);
    throw error; 
  }
};

/**
 * ✅ Update lead status and optionally add a comment
 */
exports.updateLeadStatus = async (id, status, comment) => {
  const updateData = { status };

  if (comment && comment.trim()) {
    updateData.$push = {
      comments: { text: comment, date: new Date() },
    };
  }

  return await Leads.findByIdAndUpdate(id, updateData, { new: true });
};

/**
 * ✅ Add a ledger entry (finance-related)
 */
exports.addLedgerEntry = async (id, ledgerEntry) => {
  return await Leads.findByIdAndUpdate(
    id,
    { $push: { ledgerEntries: ledgerEntry } },
    { new: true }
  );
};

/**
 * ✅ Add embedded ledger entry (if schema supports embeddedLedgers)
 */
exports.addEmbeddedLedger = async (id, ledgerEntry) => {
  return await Leads.findByIdAndUpdate(
    id,
    { $push: { embeddedLedgers: ledgerEntry } },
    { new: true }
  );
};

/**
 * ✅ Add an Activity log to a specific lead
 */
exports.addActivity = async (id, activityData) => {
  try {
    // We use $push to add the new activity to the existing array
    const updatedLead = await Leads.findByIdAndUpdate(
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