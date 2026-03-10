const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { z } = require("zod");

// Models
const { LeadsLedgers: Leads } = require("../models/LeadsLedgers");
const { Users, Corporates } = require("../models/UsersCorporates");

// Define Regex Schemas using Zod
const emailSchema = z.string().email();
const mobileSchema = z.string().regex(/\b\d{10}\b/);

/* ============================================================
   1. LEADS SERVICE 
   ============================================================ */
const SENDERS      = require('../models/senders.json');
const CITY_STATE_MAP = require('../models/cityStateMap.json');

exports.leadService = {

readInbox: async (req, res) => {
   
  const { ImapFlow }     = require('imapflow');
  const { simpleParser } = require('mailparser');

  const stripHtml = (html) =>
    html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const findCityState = (text) => {
    const lower = text.toLowerCase();
    for (const [state, cities] of Object.entries(CITY_STATE_MAP)) {
      for (const city of cities) {
        if (lower.includes(city.toLowerCase())) return { city, state };
      }
    }
    return null;
  };

  const extractProductName = (subject) => {
    if (!subject) return null;
    if (subject.trim().startsWith('Buyer')) {
      const sp = subject.split(' for ');
      return sp.length > 1 ? sp[1].replace(/^"|"$/g, '').trim() : null;
    }
    const m = subject.match(/for\s+(.*?)\s+from/i);
    return m ? m[1].trim() : null;
  };

  const extractEmail = (text) => {
    const matches = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
    return [...new Set(matches)].find(e => !e.toLowerCase().endsWith('indiamart.com')) || null;
  };

  const extractMobile = (text) => (text.match(/\b\d{10}\b/g) || [])[0] || null;

  const toIST = (date) => {
    const d = date ? new Date(date) : new Date();
    return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().replace('Z', '+05:30');
  };

  // ── Normalize TradeIndia record to match IndiaMart schema ──
  const normalizeTradeIndia = (item, adminUser, corporate) => {
    const rawMobile = (item.sender_mobile || "").replace(/\D/g, '').slice(-10);
    return {
      source_id:      item.rfi_id       || null,
      generated_date: item.generated
                        ? toIST(new Date(item.generated * 1000))
                        : null,
      sender_name:    item.sender_name  || null,
      sender_mobile:  rawMobile         || null,
      sender_email:   item.sender_email || null,
      product_name:   item.product_name?.trim() || null,
      sender_city:    item.sender_city  || null,
      sender_state:   item.sender_state || null,
      source:         "TradeIndia",
      status:         "Recent",
      corpAdminId:    adminUser._id.toString(),
      corporateId:    corporate._id.toString(),
    };
  };

  try {
    const { corpAdminId, corporateId } = req.query;
    
    if (!corpAdminId || !corporateId) {
      return res.status(400).json({ success: false, 
      message: "corpAdminId and corporateId are required",
      received: req.query});
    }

    // ── Step 1: Validate Corp Admin User ─────────────────────
    const adminUser = await Users.findById(corpAdminId).lean();
    if (!adminUser)            return res.status(404).json({ success: false, message: "Corp admin user not found" });
    if (!adminUser.userActive) return res.status(403).json({ success: false, message: "Corp admin account is inactive" });

    // ── Step 2: Find linked Corporate by corporateId ──────────
    const corporate = adminUser.linkedCorporate;
    if (!corporate)                               return res.status(404).json({ success: false, message: "No corporate linked to this admin user" });
    if (corporate._id.toString() !== corporateId) return res.status(403).json({ success: false, message: "Corporate ID does not match linked corporate" });
    if (!corporate.corporateActive)               return res.status(403).json({ success: false, message: "Corporate account is inactive" });

    // ── Step 3: Validate Mail Config ──────────────────────────
    const mailConfig = corporate?.apiUrls?.mailConfigure;
    if (!mailConfig)          return res.status(404).json({ success: false, message: "Mail not configured for this corporate" });
    if (!mailConfig.isActive) return res.status(403).json({ success: false, message: "Mail configuration is inactive" });

    // ── Step 3b: Build TradeIndia URL & Fetch Data ────────────
    const tradeindiaConfig = corporate?.apiUrls?.tradeindia;
    let tradeindiaRecords  = [];

    if (tradeindiaConfig?.url && tradeindiaConfig?.userid && tradeindiaConfig?.profile_id && tradeindiaConfig?.key) {

      const now       = new Date();
      const toDate    = now.toISOString().split('T')[0];
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const fromDate  = yesterday.toISOString().split('T')[0];

      const params = new URLSearchParams({
        userid:     tradeindiaConfig.userid,
        profile_id: tradeindiaConfig.profile_id,
        key:        tradeindiaConfig.key,
        from_date:  fromDate,
        to_date:    toDate,
        limit:      tradeindiaConfig.limit   || 10,
        page_no:    tradeindiaConfig.page_no || 1,
      });

      const tradeindiaUrl = `${tradeindiaConfig.url}?${params.toString()}`;
            try {
        const tiResponse = await fetch(tradeindiaUrl);
        if (tiResponse.ok) {
          const tiJson = await tiResponse.json();
          // API may return array directly or nested under a key
          const tiArray = Array.isArray(tiJson)
            ? tiJson
            : (tiJson?.data || tiJson?.records || tiJson?.inquiries || []);

          tradeindiaRecords = tiArray.map(item =>
            normalizeTradeIndia(item, adminUser, corporate)
          );
         
        } else {
          console.warn(`⚠️ TradeIndia API responded with status: ${tiResponse.status}`);
        }
      } catch (tiErr) {
        console.error("❌ TradeIndia fetch error:", tiErr.message);
      }

    } else {
      console.log("⚠️ TradeIndia not configured or incomplete — skipping.");
    }

    // ── Step 4: IMAP Client ───────────────────────────────────
    const client = new ImapFlow({
      host:   mailConfig.host   || 'imap.gmail.com',
      port:   mailConfig.port   || 993,
      secure: mailConfig.secure ?? true,
      auth: {
        user: mailConfig.auth.user,
        pass: mailConfig.auth.pass
      },
      logger: false,
      socketTimeout:     60000,
      greetingTimeout:   30000,
      connectionTimeout: 30000
    });

    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    // ── Step 5: Collect unread UIDs from all senders ──────────
    const allUids = new Set();
    const since   = new Date();
    since.setDate(since.getDate() - 2);

    for (const sender of SENDERS) {
      const uids = await client.search({ seen: false, from: sender, since }, { uid: true });
      uids.forEach(uid => allUids.add(uid));
    }

    // ── Step 6: Fetch raw sources while lock is held ──────────
    const raw      = [];
    const uidArray = [...allUids].sort((a, b) => a - b);
    for await (const msg of client.fetch(uidArray, { source: true, uid: true }, { uid: true })) {
      raw.push({ uid: msg.uid, source: msg.source });
    }

    lock.release();

    // ── Step 7: Parse emails, build records ───────────────────
    const indiamartRecords = [];
    const toMarkRead       = [];

    for (const { uid, source } of raw) {
      const parsed    = await simpleParser(source);
      const subject   = parsed.subject || "";
      const plainText = parsed.text    || "";
      const htmlText  = parsed.html ? stripHtml(parsed.html) : "";
      const bodyText  = [plainText, htmlText, subject].join(" ");
      const match     = findCityState(bodyText);

      if (!match) continue;

      indiamartRecords.push({
        source_id:      uid,
        generated_date: toIST(parsed.date),
        sender_name:    (parsed.replyTo?.text || "").replace(/<.*?>/g, '').replace(/"/g, '').trim() || null,
        sender_mobile:  extractMobile(bodyText),
        sender_email:   extractEmail(bodyText),
        product_name:   extractProductName(subject),
        sender_city:    match.city,
        sender_state:   match.state,
        source:         "IndiaMart",
        status:         "Recent",
        corpAdminId:    adminUser._id.toString(),
        corporateId:    corporate._id.toString(),
      });

      toMarkRead.push(uid);
    }

    // ── Step 8: Mark matched emails as read ───────────────────
    if (toMarkRead.length > 0) {
      const markLock = await client.getMailboxLock('INBOX');
      for (const uid of toMarkRead) {
        await client.messageFlagsAdd({ uid }, ['\\Seen'], { uid: true });
      }
      markLock.release();
    }

    await client.logout();

    // ── Step 9: Merge IndiaMart + TradeIndia records ──────────
    const records = [...indiamartRecords, ...tradeindiaRecords];
    
    return res.json({
      success:          true,
      total:            records.length,
      indiamart_count:  indiamartRecords.length,
      tradeindia_count: tradeindiaRecords.length,
      records,
    });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
},

  /**
   * 🔍 Search lead by mobile (Triggered by /leads/search)
   */
// controller: searchByMobile

searchByMobile: async (req, res) => {
  try {
    const { mobile, corporateId } = req.query;

    if (!mobile) {
      return res.status(400).json({ success: false, message: "Mobile number is required" });
    }

    // Sanitization
    const cleanPhone = mobile.toString().replace(/\D/g, '').slice(-10);
    
    // Database Query
    const lead = await Leads.findOne({ 
      sender_mobile: cleanPhone,
      // corporate_id: corporateId // Uncomment if you filter by Corp ID
    })
    .select('sender_name status lead_no product_name sender_mobile')
    .lean();

    // IF NOT FOUND: Send 200 OK with "New Client" data instead of 404
    if (!lead) {
      return res.status(200).json({ 
        success: true, 
        isNew: true,
        data: {
          name: "New Client",
          status: "Fresh",
          leadNo: "N/A",
          product: "None",
          mobile: cleanPhone
        } 
      });
    }

    // IF FOUND: Send the actual lead
    return res.status(200).json({ 
      success: true, 
      isNew: false,
      data: {
        name: lead.sender_name,
        status: lead.status,
        leadNo: lead.lead_no,
        product: lead.product_name,
        mobile: lead.sender_mobile
      } 
    });

  } catch (error) {
    console.error("Search Error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
},

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
    if (filters.corporateId) query.corporateId = filters.corporateId;
    return await Leads.find(query).sort({ createdAt: -1 });
  },

  getById: async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return await Leads.findById(id);
  },
  
  update: async (id, data) => await Leads.findByIdAndUpdate(id, data, { new: true }),
  
  remove: async (id) => await Leads.findByIdAndDelete(id),

  getLeadsByStatus: async (status, corporateId) => {
    const query = {};
    if (status) query.status = { $regex: `^${status.trim()}$`, $options: "i" };
    if (corporateId && corporateId !== "undefined") query.corporateId = String(corporateId).trim();
    return await Leads.find(query).sort({lead_no : 1, updatedAt: 1 });
  },

 addActivity: async (req, res) => {
  console.log("✅ addActivity hit:", req.params.id, req.body);
  const id = req.params.id?.trim().replace(/[^a-fA-F0-9]/g, "");
  console.log(id);

  if (!id || !mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ success: false, message: `Invalid lead ID: "${req.params.id}"` });

  const { action, byUser } = req.body;

  if (!action?.trim())
    return res.status(400).json({ success: false, message: "Action is required" });

  try {
    const lead = await Leads.findByIdAndUpdate(
      new mongoose.Types.ObjectId(id),
      { $push: { activity: { action: action.trim(), byUser: byUser || "Agent", date: new Date() } } },
      { new: true }
    );

    if (!lead)
      return res.status(404).json({ success: false, message: "Lead not found" });

    res.json({ success: true, data: lead });
  } catch (err) {
    console.error("❌ Activity error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
},
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
   3. LEDGER SERVICE
   ============================================================ */
exports.ledgerService = {
  list: async (filters = {}) => await Leads.find({ "ledger.0": { $exists: true }, ...filters }),
  getById: async (id) => await Leads.findOne({ "ledger._id": id }, { "ledger.$": 1 }),
  update: async (id, data) => {
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