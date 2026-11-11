/**
 * 🏰 UserCorpController.js (v2.1 - Reverted Identity Logic)
 *
 * PURPOSE:
 * Unified management for 'CorpDataMaster' hub.
 * Reverted: Staff (Users) are now managed via the standalone 'Users' collection.
 */

const userMaster = require('../models/userMaster');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const externalService = require('../utils/externalService');
const { resolveDatePreset } = require('../utils/dateUtils');
const autoEndScheduler = require('../utils/autoEndScheduler');
const relieverRotation = require('../utils/relieverRotation');

// ── Phase 2a: Unique partial index — one active session per worker ─────────────
// Track which tenant DBs already have the index so we only create it once.
const _indexedAttendanceDbs = new Set();
const ensureAttendanceIndex = async (AttendanceModel) => {
  try {
    const dbName = AttendanceModel?.db?.name;
    if (!dbName || _indexedAttendanceDbs.has(dbName)) return;
    await AttendanceModel.collection.createIndex(
      { employeeId: 1 },
      {
        unique: true,
        partialFilterExpression: { dutyEnd: null },
        background: true,
        name: 'unique_active_session_per_employee',
      }
    );
    _indexedAttendanceDbs.add(dbName);
  } catch (e) {
    // Index may already exist; not critical — fail silently
  }
};
// ─────────────────────────────────────────────────────────────────────────────


const getDistanceMetres = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371e3; // Earth radius in metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const resolveSiteNameForCoordinates = async (lat, long, LeadsModel) => {
  if (!lat || !long || !LeadsModel) return null;
  const leads = await LeadsModel.find({
    'location.lat': { $exists: true },
    'location.long': { $exists: true },
  }).lean();

  let minDist = 10; // strictly 10 meters
  let matchedName = null;

  for (const lead of leads) {
    const lLat = Number(lead.location.lat);
    const lLng = Number(lead.location.long);
    if (isNaN(lLat) || isNaN(lLng)) continue;

    const d = getDistanceMetres(lat, long, lLat, lLng);
    if (d < minDist) {
      minDist = d;
      matchedName = lead.sender_name || lead.name || 'Client';
    }
  }

  return matchedName;
};

const formatAddressWithSite = (address, siteName) => {
  if (!siteName) return address || '';
  const prefix = `At ${siteName}`;
  const currentAddress = address || '';
  if (currentAddress.startsWith(prefix) || currentAddress.includes(`At ${siteName}`)) {
    return currentAddress;
  }
  return currentAddress ? `${prefix}, ${currentAddress}` : prefix;
};

// Constants
const SENDERS = require('../models/senders.json');
const CITY_STATE_MAP = require('../models/cityStateMap.json');

const normalizeLeadStatusAlias = (body = {}) => {
  if (body.status || !body.role) return body;

  const roleAsStatus = String(body.role).trim().toLowerCase();
  if (roleAsStatus === 'accepted') return { ...body, status: 'Accepted' };
  if (roleAsStatus === 'tax invoice') return { ...body, status: 'Tax Invoice' };
  if (roleAsStatus === 'fully paid') return { ...body, status: 'Fully Paid' };
  return body;
};

// Helper: check if a lead status requires a Sundry Debtor ledger
const isBillableLeadStatus = (status = '') => {
  const s = String(status).trim().toLowerCase();
  return s === 'accepted' || s === 'tax invoice' || s === 'fully paid';
};

// Shift normalization maps
const SHIFT_CODE_MAP = {
  Morning: 'M',
  Afternoon: 'A',
  Night: 'N',
  General: 'G',
  Day: 'D',
  Night12: 'N2',
  M: 'M',
  A: 'A',
  N: 'N',
  G: 'G',
  D: 'D',
  N2: 'N2',
};

const SHIFT_PERIOD_MAP = {
  M: 'Morning',
  A: 'Afternoon',
  N: 'Night',
  G: 'General',
  D: 'Day',
  N2: 'Night12',
  Morning: 'Morning',
  Afternoon: 'Afternoon',
  Night: 'Night',
  General: 'General',
  Day: 'Day',
  Night12: 'Night12',
};

/**
 * 🛠️ Internal Helper: Dynamic Spoke Resolver (for Hub Data)
 */
const manageSpoke = {
  list: async (req, res, modelName, filter = {}) => {
    try {
      const Model = req.tenantModels[modelName];

      // 🚀 Apply Hierarchical Location Filtering
      const q = { ...filter };
      const accessibleIds = req.user?.accessibleLocationIds;
      if (req.query.all !== 'true' && req.user?.userRole !== 'CorpAdmin' && accessibleIds?.length > 0) {
        q.locationId = { $in: accessibleIds };
      }

      const data = await Model.find(q).lean();
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  getById: async (req, res, modelName) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid ID format' });
      }
      const Model = req.tenantModels[modelName];
      const item = await Model.findById(id);
      if (!item) return res.status(404).json({ success: false, message: 'Entity not found' });
      res.json({ success: true, data: item });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  update: async (req, res, modelName) => {
    try {
      const Model = req.tenantModels[modelName];
      const item = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!item) return res.status(404).json({ success: false, message: 'Entity not found' });
      const emit = require('../utils/socketEmitter');
      emit(req, `${modelName.toLowerCase()}:updated`, { data: item });
      res.json({ success: true, data: item });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  delete: async (req, res, modelName) => {
    try {
      const Model = req.tenantModels[modelName];
      await Model.findByIdAndDelete(req.params.id);
      const emit = require('../utils/socketEmitter');
      emit(req, `${modelName.toLowerCase()}:deleted`, { id: req.params.id });
      res.json({ success: true, message: 'Entity deleted' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

/**
 * 🚨 _dispatchRateChangeAlerts
 * Dispatches real-time broadcast and audit chat messages (both public tenant room and 1-on-1 direct message
 * to all CorpAdmin, userAdmin, and Admin users) whenever any user revises a Pay Rate or Bill Rate
 * from Shift Scheduler or Daily Roster screen.
 */
const _dispatchRateChangeAlerts = async ({ req, siteName, source, changes }) => {
  if (!Array.isArray(changes) || changes.length === 0) return;

  try {
    const { Messages } = req.tenantModels || {};
    const room = req.tenantDbName || req.user?.dbName;
    const modifierName = req.user?.userDisplayName || req.user?.name || 'Authorized User';
    const modifierRole = req.user?.userRole || 'User';
    const modifierId = String(req.user?._id || 'system');
    const now = new Date();
    const timeFormatted = now.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const auditHeader = `🚨 *PAY / BILL RATE REVISION ALERT*`;
    const auditMeta = [
      `📍 *Site / Project:* ${siteName || 'Site'}`,
      `🖥️ *Source:* ${source || 'Shift Scheduler & Daily Roster'}`,
      `👤 *Changed By:* ${modifierName} (${modifierRole})`,
      `🕒 *Timestamp:* ${timeFormatted}`,
    ].join('\n');

    const auditDetails = `\n📋 *Rate Revisions:*\n` + changes.join('\n');
    const fullAuditText = `${auditHeader}\n${auditMeta}\n${auditDetails}`;

    // 1. 📢 Real-Time Socket Broadcast to All Admin Devices
    if (req.io && room) {
      req.io.to(room).emit('admin:broadcast', {
        id: new mongoose.Types.ObjectId().toString(),
        title: '🚨 Pay/Bill Rate Changed',
        message: `Rate update on ${siteName} by ${modifierName}:\n${changes.slice(0, 3).join('\n')}${changes.length > 3 ? `\n...and ${changes.length - 3} more` : ''}`,
        fullAudit: fullAuditText,
        priority: 'urgent',
        targetRoles: ['CorpAdmin', 'userAdmin', 'Admin'],
        sentBy: modifierName,
        sentByRole: modifierRole,
        siteName: siteName,
        changesCount: changes.length,
        at: now.toISOString(),
      });
    }

    // 2. 💬 Post in Group Chatroom (Public / Tenant room)
    if (Messages) {
      const groupMsg = new Messages({
        senderName: '⚡ Rate Change Audit',
        senderId: modifierId,
        text: fullAuditText,
        type: 'text',
        isOneToOne: false,
        status: 'unseen',
      });
      await groupMsg.save();

      if (req.io && room) {
        req.io.to(room).emit('newMessage', groupMsg);
      }
    }

    // 3. 📩 Send 1-on-1 Direct Chat Message & Notification to All Admins
    if (Messages) {
      const adminQuery = {
        userRole: { $in: ['CorpAdmin', 'userAdmin', 'Admin'] },
        userActive: { $ne: false },
      };
      if (room) {
        adminQuery['accessCorporate.dbName'] = room;
      }
      const adminUsers = await userMaster
        .find(adminQuery)
        .select('_id userDisplayName userRole')
        .lean();

      for (const admin of adminUsers) {
        const adminMsg = new Messages({
          senderName: '⚡ Rate Change Audit',
          senderId: modifierId,
          text: fullAuditText,
          type: 'text',
          isOneToOne: true,
          receiverId: String(admin._id),
          status: 'unseen',
        });
        await adminMsg.save();

        if (req.io) {
          req.io.to(String(admin._id)).emit('newMessage', adminMsg);
          if (room) {
            req.io.to(room).emit('newMessage', adminMsg);
          }
        }
      }
    }

    console.log(`✅ [RateAudit] Broadcast & chat alerts sent for ${changes.length} rate changes on "${siteName}".`);
  } catch (err) {
    console.error('❌ [_dispatchRateChangeAlerts] error:', err.message);
  }
};

/**
 * 🎯 LEADS & CRM MANAGEMENT
 */
exports.manageLeads = {
  list: (req, res) => manageSpoke.list(req, res, 'Leads'),
  get: (req, res) => manageSpoke.getById(req, res, 'Leads'),
  create: async (req, res) => {
    try {
      const { Leads, Counters } = req.tenantModels;
      const counter = await Counters.findByIdAndUpdate(
        'lead',
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );

      // Link lead to user's location if not provided
      const locationId = req.body.locationId || req.user.accessCorporate?.locationId;

      const leadInput = normalizeLeadStatusAlias(req.body);
      if (leadInput.source === 'Other' && (!leadInput.status || leadInput.status === 'Recent')) {
        leadInput.status = 'Engaged';
      }
      const lead = new Leads({ ...leadInput, lead_no: counter.seq, locationId });
      await lead.save();

      // Auto-create ledger if status is Accepted, Tax Invoice, or Fully Paid
      if (isBillableLeadStatus(lead.status)) {
        try {
          const FinanceController = require('./FinanceController');
          await FinanceController.ensureLedgerFolioInternal(req.tenantModels, {
            ledgerName: lead.sender_name || 'Client-' + lead.lead_no,
            groupName: 'Sundry Debtors',
            parentGroup: 'Current Assets',
            refId: lead._id,
            refType: 'Lead',
            nature: 'Dr',
          });
        } catch (ferr) {
          console.error('Leads-Finance Auto Linkage Failed:', ferr.message);
        }
      }

      // 🚀 REAL-TIME: Notify clients
      req.io.to(req.tenantDbName).emit('lead:created', { data: lead });

      res.status(201).json({ success: true, data: lead });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  addSiteClientCheck: async (req, res) => {
    try {
      const { SiteClientCheck } = req.tenantModels;
      const { id } = req.params; // leadId
      const { employeeId, images, progressDescription } = req.body;

      if (!employeeId || !id) {
        return res.status(400).json({ success: false, message: 'employeeId and leadId (in params) are required' });
      }

      const check = new SiteClientCheck({
        employeeId,
        leadId: id,
        images: images || [],
        progressDescription: progressDescription || ''
      });

      await check.save();
      res.status(201).json({ success: true, data: check });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },


  getAllGallery: async (req, res) => {
    try {
      const { ProfileMaster } = req.tenantModels || {};
      const dbName = req.tenantDbName || req.user?.dbName;

      if (!dbName)
        return res.status(400).json({ success: false, message: 'Missing tenant identification' });

      let customConfig = null;
      try {
        if (ProfileMaster) {
          const profile = await ProfileMaster.findOne({}).lean();
          if (profile?.apiUrls?.cloudinary?.isActive) {
            customConfig = profile.apiUrls.cloudinary;
          }
        }
      } catch (perr) {
        console.error('🔴 ProfileMaster query error:', perr.message);
      }

      const result = await externalService.fetchLeadsMedia(dbName, customConfig).catch((err) => {
        console.error('🔴 Fetch leads media error:', err.message);
        return { resources: [] };
      });

      const urls = (result.resources || []).map((r) => r.secure_url);
      res.json({ success: true, data: urls });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  update: async (req, res) => {
    try {
      const { Leads } = req.tenantModels;
      const leadInput = normalizeLeadStatusAlias(req.body);
      const lead = await Leads.findByIdAndUpdate(req.params.id, leadInput, { new: true });
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

      // Auto-create ledger if status is Accepted, Tax Invoice, or Fully Paid
      if (isBillableLeadStatus(lead.status)) {
        try {
          const FinanceController = require('./FinanceController');
          await FinanceController.ensureLedgerFolioInternal(req.tenantModels, {
            ledgerName: lead.sender_name || 'Client-' + lead.lead_no,
            groupName: 'Sundry Debtors',
            parentGroup: 'Current Assets',
            refId: lead._id,
            refType: 'Lead',
            nature: 'Dr',
          });
        } catch (ferr) {
          console.error('Leads-Finance Auto Linkage Failed:', ferr.message);
        }
      }

      // 🚀 REAL-TIME: Notify clients
      req.io.to(req.tenantDbName).emit('lead:updated', { data: lead });

      res.json({ success: true, data: lead });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  delete: async (req, res) => {
    try {
      const { Leads } = req.tenantModels;
      const item = await Leads.findByIdAndDelete(req.params.id);

      // 🚀 REAL-TIME: Notify clients
      if (item) req.io.to(req.tenantDbName).emit('lead:deleted', { id: req.params.id });

      res.json({ success: true, message: 'Entity deleted' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  analytics: async (req, res) => {
    try {
      const { Leads } = req.tenantModels || {};
      if (!Leads) {
        console.error(
          `❌ [Analytics] Leads model missing for tenant: ${req.tenantDbName || 'unknown'}`
        );
        return res.status(400).json({ success: false, message: 'Tenant models not initialized' });
      }
      console.log(`📊 [Analytics] Fetching for tenant: ${req.tenantDbName}`);
      const { fromDate, toDate, source } = req.query;
      const q = {};

      if (fromDate || toDate) {
        const dateQuery = {};
        if (fromDate) {
          const d = resolveDatePreset(fromDate);
          if (d instanceof Date && !isNaN(d.getTime())) dateQuery.$gte = d;
        }
        if (toDate) {
          const d = resolveDatePreset(toDate);
          if (d instanceof Date && !isNaN(d.getTime())) dateQuery.$lte = d;
        }
        if (Object.keys(dateQuery).length > 0) q.generated_date = dateQuery;
      }
      if (source) q.source = source;

      // 1. Status Aggregation (Summary)
      const statusAgg = await Leads.aggregate([
        { $match: q },
        { $group: { _id: '$status', value: { $sum: 1 } } },
        { $project: { label: '$_id', value: 1, _id: 0 } },
      ]);

      // 2. Source-wise Grouping (Strict Quadrant Metrics)
      const sourceAgg = await Leads.aggregate([
        { $match: q },
        {
          $group: {
            _id: '$source',
            totalLeads: { $sum: 1 },
            posCount: {
              $sum: {
                $cond: [{ $in: ['$status', ['Tax Invoice', 'Fully Paid']] }, 1, 0],
              },
            },
            recycleCount: {
              $sum: {
                $cond: [{ $in: ['$status', ['Recycle', 'Recycled', 'recycled']] }, 1, 0],
              },
            },
            pendingCount: {
              $sum: {
                $cond: [{ $in: ['$status', ['Recent', 'Engaged', 'Accepted']] }, 1, 0],
              },
            },
          },
        },
        {
          $project: {
            label: { $ifNull: ['$_id', 'Other'] },
            total: '$totalLeads',
            posCount: 1,
            recycleCount: 1,
            pendingCount: 1,
            _id: 0,
          },
        },
        { $sort: { total: -1 } },
      ]);

      const total = await Leads.countDocuments(q);

      res.json({
        success: true,
        data: {
          statuses: statusAgg,
          sources: sourceAgg,
        },
        total,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  addMany: async (req, res) => {
    try {
      const { Leads, Counters } = req.tenantModels;
      const leads = req.body;
      if (!Array.isArray(leads))
        return res.status(400).json({ success: false, message: 'Array expected' });

      const results = [];
      for (const data of leads) {
        const counter = await Counters.findByIdAndUpdate(
          'lead',
          { $inc: { seq: 1 } },
          { upsert: true, new: true }
        );
        const leadInput = { ...data };
        if (leadInput.source === 'Other' && (!leadInput.status || leadInput.status === 'Recent')) {
          leadInput.status = 'Engaged';
        }
        const lead = new Leads({ ...leadInput, lead_no: counter.seq });
        await lead.save();

        // Auto-create ledger if status is Accepted, Tax Invoice, or Fully Paid
        if (isBillableLeadStatus(lead.status)) {
          try {
            const FinanceController = require('./FinanceController');
            await FinanceController.ensureLedgerFolioInternal(req.tenantModels, {
              ledgerName: lead.sender_name || 'Client-' + lead.lead_no,
              groupName: 'Sundry Debtors',
              parentGroup: 'Current Assets',
              refId: lead._id,
              refType: 'Lead',
              nature: 'Dr',
            });
          } catch (ferr) {
            console.error('Leads-Finance Auto Linkage Failed:', ferr.message);
          }
        }

        results.push(lead);
      }
      // 🚀 REAL-TIME: Notify clients
      req.io.to(req.tenantDbName).emit('lead:batch_created', { count: results.length });

      res.json({ success: true, count: results.length });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  searchByMobile: async (req, res) => {
    try {
      const { mobile } = req.query;
      const { Leads } = req.tenantModels;
      const clean = mobile.replace(/\D/g, '').slice(-10);
      const q = { sender_mobile: { $regex: new RegExp(clean.split('').join('\\D*') + '\\D*$') } };
      const accessibleIds = req.user?.accessibleLocationIds;
      if (req.query.all !== 'true' && req.user?.userRole !== 'CorpAdmin' && accessibleIds?.length > 0) {
        q.locationId = { $in: accessibleIds };
      }

      const lead = await Leads.findOne(q).lean();
      if (!lead) return res.json({ success: true, isNew: true, message: 'No match' });
      res.json({ success: true, isNew: false, data: lead });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  getLeadsByStatus: async (req, res) => {
    try {
      const { status } = req.params;
      const { Leads } = req.tenantModels;

      const q = { status: { $regex: new RegExp(`^${status}$`, 'i') } };
      const accessibleIds = req.user?.accessibleLocationIds;
      if (req.query.all !== 'true' && req.user?.userRole !== 'CorpAdmin' && accessibleIds?.length > 0) {
        q.locationId = { $in: accessibleIds };
      }

      const list = await Leads.find(q).lean();
      res.json({ success: true, data: list });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  getProjectActive: async (req, res) => {
    try {
      const { Leads, ProfileMaster } = req.tenantModels;
      const activeTags = ['Engaged', 'Accepted'];

      const q = { status: { $in: activeTags } };
      const accessibleIds = req.user?.accessibleLocationIds;
      if (req.query.all !== 'true' && req.user?.userRole !== 'CorpAdmin' && accessibleIds?.length > 0) {
        q.locationId = { $in: accessibleIds };
      }

      const leads = await Leads.find(q).lean();
      const profile = await ProfileMaster.findOne({}).lean();

      res.json({ success: true, data: leads, corporateProfile: profile });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  getProjectGallery: async (req, res) => {
    try {
      const { Leads, ProfileMaster } = req.tenantModels;
      
      const q = {};
      const accessibleIds = req.user?.accessibleLocationIds;
      if (req.query.all !== 'true' && req.user?.userRole !== 'CorpAdmin' && accessibleIds?.length > 0) {
        q.locationId = { $in: accessibleIds };
      }

      const leads = await Leads.find(q).lean();
      const profile = await ProfileMaster.findOne({}).lean();

      try {
        const cloudConfig = profile?.apiUrls?.cloudinary || null;
        const searchRes = await externalService.searchLeadsMedia(req.tenantDbName, cloudConfig);
        const mediaMap = {};
        searchRes.resources.forEach((a) => {
          const parts = a.public_id.split('/');
          const leadsIdx = parts.indexOf('leads');
          if (leadsIdx !== -1 && parts[leadsIdx + 1]) {
            const leadNo = parts[leadsIdx + 1];
            if (!mediaMap[leadNo]) mediaMap[leadNo] = [];
            mediaMap[leadNo].push(a.secure_url);
          }
        });
        leads.forEach((l) => {
          l.folderGallery = [
            ...(mediaMap[String(l.lead_no)] || []),
            ...(mediaMap[String(l._id)] || []),
          ];
        });
      } catch (ce) {
        console.error('Cloudinary Fetch Error:', ce.message);
      }

      // Only return leads that have at least some gallery or activity images
      const galleryLeads = leads.filter(l => {
        const hasFolderMedia = l.folderGallery && l.folderGallery.length > 0;
        const hasActivityMedia = (l.activity || []).some(a => 
          a.metadata?.media_url || a.metadata?.selfie_url || a.metadata?.site_image || a.metadata?.progress_image
        );
        return hasFolderMedia || hasActivityMedia;
      });

      res.json({ success: true, data: galleryLeads, corporateProfile: profile });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  addActivity: async (req, res) => {
    try {
      const { Leads } = req.tenantModels;
      const byUser = req.user?.userDisplayName || req.body.byUser || 'System';
      const item = await Leads.findByIdAndUpdate(
        req.params.id,
        {
          $push: { activity: { ...req.body, date: new Date(), byUser } },
        },
        { new: true }
      );
      if (!item) return res.status(404).json({ success: false, message: 'Lead not found' });

      // 🚀 REAL-TIME: Notify clients
      req.io.to(req.tenantDbName).emit('lead:updated', { data: item });

      res.json({ success: true, data: item });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  logSiteVisit: async (req, res) => {
    try {
      const { Leads, Attendance } = req.tenantModels;
      const { selfie_url, location, remarks } = req.body;

      const activityEntry = {
        action: 'PIN Site',
        byUser: req.user?.userDisplayName || 'System',
        date: new Date(),
      };

      const updateQuery = {
        $push: { activity: activityEntry },
        $set: {
          location: {
            lat: location?.latitude || location?.lat,
            long: location?.longitude || location?.long,
            address: location?.formattedAddress || location?.address,
          },
        },
      };

      // Capture location as anchor
      const lead = await Leads.findById(req.params.id);
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

      const updatedLead = await Leads.findByIdAndUpdate(req.params.id, updateQuery, { new: true });

      // 🚀 Also append to active attendance geoHistory if session exists
      const userId = req.user._id;
      const active = await Attendance.findOne({
        employeeId: userId,
        $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
      });
      if (active) {
        const tick = {
          lat: location?.latitude || location?.lat,
          long: location?.longitude || location?.long,
          timestamp: new Date(),
          note: `PIN Site: ${lead.sender_name}`,
        };
        active.geoHistory.push(tick);
        await active.save();
        req.io.to(req.tenantDbName).emit('attendance:geo_update', {
          attendanceId: active._id,
          tick,
        });
      }

      req.io.to(req.tenantDbName).emit('lead:updated', { data: updatedLead });
      res.json({ success: true, data: updatedLead });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  download: async (req, res) => {
    try {
      const { Leads } = req.tenantModels;
      const q = {};

      const accessibleIds = req.user?.accessibleLocationIds;
      if (req.query.all !== 'true' && req.user?.userRole !== 'CorpAdmin' && accessibleIds?.length > 0) {
        q.locationId = { $in: accessibleIds };
      }

      // 📡 Progress tracking via Socket.IO
      const emit = (p, t) =>
        req.io &&
        req.tenantDbName &&
        req.io.to(req.tenantDbName).emit('sync:progress', { percent: Math.round(p), text: t });

      emit(10, 'Fetching leads from database...');
      const leads = await Leads.find(q).sort({ lead_no: -1 }).lean();

      if (leads.length === 0) {
        console.warn(`⚠️ [${req.tenantDbName}] Export failed: No leads found.`);
        return res.status(404).json({ success: false, message: 'No leads found to export' });
      }

      emit(30, `Preparing Excel workbook for ${leads.length} leads...`);
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Leads');

      sheet.columns = [
        { header: 'Lead No', key: 'lead_no', width: 10 },
        { header: 'Date', key: 'generated_date', width: 15 },
        { header: 'Product', key: 'product_name', width: 25 },
        { header: 'Sender Name', key: 'sender_name', width: 25 },
        { header: 'Mobile', key: 'sender_mobile', width: 15 },
        { header: 'City', key: 'sender_city', width: 15 },
        { header: 'State', key: 'sender_state', width: 15 },
        { header: 'Source', key: 'source', width: 15 },
        { header: 'Status', key: 'status', width: 12 },
      ];

      leads.forEach((l, i) => {
        if (i % 50 === 0) {
          const progress = 30 + (i / leads.length) * 60;
          emit(progress, `Processing leads: ${i + 1}/${leads.length}`);
        }
        sheet.addRow({
          lead_no: l.lead_no,
          generated_date: l.generated_date ? new Date(l.generated_date).toLocaleDateString() : '',
          product_name: l.product_name,
          sender_name: l.sender_name,
          sender_mobile: l.sender_mobile,
          sender_city: l.sender_city,
          sender_state: l.sender_state,
          source: l.source,
          status: l.status,
        });
      });

      emit(95, 'Finalizing file for download...');
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=Leads_Export_${new Date().getTime()}.xlsx`
      );
      await workbook.xlsx.write(res);
      emit(100, 'Download started successfully!');
      res.end();
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  readInbox: async (req, res) => {
    try {
      const { ProfileMaster } = req.tenantModels;
      const profile = await ProfileMaster.findOne({}).lean();

      if (!profile) {
        return res.status(404).json({ success: false, message: 'Corporate profile not found' });
      }

      // 🚀 UNIFIED SYNC: Fetch from all sources, merge, and save
      externalService.emitProgress(req.io, req.tenantDbName, 5, 'Gateway Handshake...', 'general');

      const result = await externalService.syncAllExternalLeads(
        profile,
        req.tenantModels,
        req.tenantDbName,
        req.user,
        req.io
      );

      res.json({
        success: result.success,
        status: result.success ? 'success' : 'error',
        message:
          result.count > 0
            ? `Synced ${result.count} new leads`
            : result.message || 'No new leads found',
        count: result.count || 0,
        total: result.count || 0,
      });
    } catch (err) {
      console.error('🔴 readInbox Critical Error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  webInquiry: async (req, res) => {
    try {
      const { Leads, Counters } = req.tenantModels;
      const counter = await Counters.findByIdAndUpdate(
        'lead',
        { $inc: { seq: 1 } },
        { upsert: true, new: true }
      );

      const lead = new Leads({
        ...req.body,
        lead_no: counter.seq,
        source: 'Website',
        status: 'Recent',
      });
      await lead.save();

      // 🚀 REAL-TIME: Notify clients
      req.io.to(req.tenantDbName).emit('lead:created', { data: lead });

      res.status(201).json({ success: true, data: lead });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ── GET site shifts + live stats ──────────────────────────────────────────
  getSiteShifts: async (req, res) => {
    try {
      const { Leads, Attendance, SiteRoster, SiteRosterHolidays, Employees } = req.tenantModels;
      const RosterModel = SiteRoster || SiteRosterHolidays;
      const lead = await Leads.findById(req.params.id).lean();
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      // Check if this lead represents corporate Head Office
      const isTeamHO = /Team HO|Head Office|Corporate/i.test(lead.sender_name || lead.name || '');

      let rosterDoc = null;
      if (RosterModel) {
        rosterDoc = await RosterModel.findOne({
          $or: [
            { siteId: lead._id },
            { siteId: String(lead._id) },
            ...(isTeamHO ? [{ siteId: '__HO__' }, { siteName: /Head Office|Corporate/i }] : []),
          ],
        }).lean();
      }

      // Count monthly Present records at this lead per shift code
      const monthlyAgg = await Attendance.aggregate([
        {
          $match: {
            leadId: lead._id,
            status: 'Present',
            date: { $gte: monthStart, $lte: monthEnd },
          },
        },
        { $group: { _id: '$shiftCode', count: { $sum: 1 } } },
      ]);
      const monthlyCountByShift = {};
      monthlyAgg.forEach((r) => {
        monthlyCountByShift[r._id] = r.count;
      });

      // Count currently active (open session) workers per shift at this site
      const activeAgg = await Attendance.aggregate([
        {
          $match: {
            leadId: lead._id,
            $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
          },
        },
        { $group: { _id: '$shiftCode', count: { $sum: 1 } } },
      ]);
      const activeCountByShift = {};
      activeAgg.forEach((r) => {
        activeCountByShift[r._id] = r.count;
      });

      const shiftsWithStats = (lead.siteShifts || []).map((s, idx) => {
        let workers = Array.isArray(s.workers) && s.workers.length > 0 ? s.workers : [];

        // Check if roster has workers for this shift
        if (workers.length === 0 && rosterDoc?.shifts) {
          const matchingRosterShift = rosterDoc.shifts.find(
            (rsh) => rsh.shiftCode === s.shiftCode || String(rsh._id) === String(s._id)
          ) || rosterDoc.shifts[idx];
          if (matchingRosterShift && Array.isArray(matchingRosterShift.workers) && matchingRosterShift.workers.length > 0) {
            workers = matchingRosterShift.workers;
          }
        }

        // Fallback: If boundWorkerId exists, seed workers array with this bound worker
        if (workers.length === 0 && (s.boundWorkerId || s.boundWorkerName)) {
          const rawExempt = Array.isArray(s.exemptDays) ? s.exemptDays : [];
          const rawWeekly = (typeof s.weeklyRestDay === 'string' && s.weeklyRestDay.trim())
            ? s.weeklyRestDay.split(',').map((d) => d.trim()).filter(Boolean)
            : [];
          const combined = Array.from(new Set([...rawExempt, ...rawWeekly]));
          workers = [
            {
              workerId: String(s.boundWorkerId?._id || s.boundWorkerId || ''),
              workerName: s.boundWorkerName || 'Duty Worker',
              enrollmentNo: s.boundWorkerEnrollment || '',
              mobile: s.boundWorkerMobile || '',
              salaryRate: Number(s.salaryRate) || 0,
              billRate: Number(s.billRate) || 0,
              weeklyRestDay: combined.length > 0 ? combined.join(', ') : null,
              exemptDays: combined,
              status: 'Active',
            },
          ];
        }

        const resolvedWorkerSlots = Math.max(Number(s.workerSlots) || 1, workers.length || 1);
        const permittedThisMonth = resolvedWorkerSlots * daysInMonth;
        const actualThisMonth = monthlyCountByShift[s.shiftCode] || 0;
        const activeNow = activeCountByShift[s.shiftCode] || 0;
        return {
          ...s,
          workerSlots: resolvedWorkerSlots,
          workers,
          permittedThisMonth,
          actualThisMonth,
          activeNow,
          isExcess: actualThisMonth > permittedThisMonth,
          slotExcess: activeNow > resolvedWorkerSlots,
        };
      });

      const totalPermitted = shiftsWithStats.reduce((sum, s) => sum + s.permittedThisMonth, 0);
      const totalActual = shiftsWithStats.reduce((sum, s) => sum + s.actualThisMonth, 0);

      res.json({
        success: true,
        data: {
          leadId: lead._id,
          siteName: lead.sender_name || lead.name,
          daysInMonth,
          shifts: shiftsWithStats,
          totalPermittedThisMonth: totalPermitted,
          totalActualThisMonth: totalActual,
          totalExcess: Math.max(0, totalActual - totalPermitted),
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ── PUT site shifts (full replace of siteShifts array & 2-way Roster sync) ───────────────────
  updateSiteShifts: async (req, res) => {
    try {
      const { Leads, SiteRoster, SiteRosterHolidays, Employees } = req.tenantModels;
      const RosterModel = SiteRoster || SiteRosterHolidays;
      const { siteShifts } = req.body;
      if (!Array.isArray(siteShifts)) {
        return res.status(400).json({ success: false, message: 'siteShifts must be an array' });
      }

      const existingLead = await Leads.findById(req.params.id);
      if (!existingLead) return res.status(404).json({ success: false, message: 'Lead not found' });

      // GroupName strictly MANG or DaNi, preserve or set shiftStartDate
      const now = new Date();
      const isTeamHO = /Team HO|Head Office|Corporate/i.test(existingLead.sender_name || existingLead.name || '');
      const normalizedShifts = siteShifts.map((s) => {
        let workers = Array.isArray(s.workers) ? s.workers : [];

        // Fallback: If no workers array but bound worker exists
        if (workers.length === 0 && (s.boundWorkerId || s.boundWorkerName)) {
          const rawEx = Array.isArray(s.exemptDays) ? s.exemptDays : [];
          const rawWk = (typeof s.weeklyRestDay === 'string' && s.weeklyRestDay.trim())
            ? s.weeklyRestDay.split(',').map((d) => d.trim()).filter(Boolean)
            : [];
          const comb = Array.from(new Set([...rawEx, ...rawWk]));
          workers = [
            {
              workerId: String(s.boundWorkerId?._id || s.boundWorkerId || ''),
              workerName: s.boundWorkerName || 'Duty Worker',
              enrollmentNo: s.boundWorkerEnrollment || '',
              mobile: s.boundWorkerMobile || '',
              salaryRate: Number(s.salaryRate) || 0,
              billRate: Number(s.billRate) || 0,
              weeklyRestDay: comb.length > 0 ? comb.join(', ') : null,
              exemptDays: comb,
              status: 'Active',
            },
          ];
        }

        const normalizedWorkers = workers.map((w) => {
          const wEx = Array.isArray(w.exemptDays) ? w.exemptDays : [];
          const wWk = (typeof w.weeklyRestDay === 'string' && w.weeklyRestDay.trim())
            ? w.weeklyRestDay.split(',').map((d) => d.trim()).filter(Boolean)
            : [];
          const comb = Array.from(new Set([...wEx, ...wWk]));
          return {
            workerId: String(w.workerId?._id || w.workerId || ''),
            workerName: w.workerName || w.name || 'Worker',
            enrollmentNo: w.enrollmentNo || w.enrollment_no || '',
            mobile: w.mobile || '',
            salaryRate: Number(w.salaryRate) || 0,
            billRate: Number(w.billRate) || 0,
            weeklyRestDay: comb.length > 0 ? comb.join(', ') : null,
            exemptDays: comb,
            status: w.status || 'Active',
          };
        });

        const firstWorker = normalizedWorkers[0];
        const rawShiftEx = Array.isArray(s.exemptDays) ? s.exemptDays : [];
        const rawShiftWk = (typeof s.weeklyRestDay === 'string' && s.weeklyRestDay.trim())
          ? s.weeklyRestDay.split(',').map((d) => d.trim()).filter(Boolean)
          : [];
        const shiftCombRest = Array.from(new Set([...rawShiftEx, ...rawShiftWk]));

        return {
          ...s,
          groupName: s.groupName === 'DaNi' || Number(s.durationHrs) === 12 ? 'DaNi' : 'MANG',
          durationHrs: Number(s.durationHrs) || (s.groupName === 'DaNi' ? 12 : 8),
          shiftStartDate: s.shiftStartDate ? new Date(s.shiftStartDate) : now,
          workerSlots: Math.max(Number(s.workerSlots) || 1, normalizedWorkers.length || 1),
          billRate: Number(s.billRate) || 0,
          salaryRate: Number(s.salaryRate) || 0,
          active: s.active !== false,
          weeklyRestDay: shiftCombRest.length > 0 ? shiftCombRest.join(', ') : null,
          exemptDays: shiftCombRest,
          boundWorkerId: firstWorker?.workerId || s.boundWorkerId || null,
          boundWorkerName: firstWorker?.workerName || s.boundWorkerName || '',
          boundWorkerMobile: firstWorker?.mobile || s.boundWorkerMobile || '',
          boundWorkerEnrollment: firstWorker?.enrollmentNo || s.boundWorkerEnrollment || '',
          workers: normalizedWorkers,
        };
      });

      // ── Detect Pay Rate & Bill Rate revisions for Admin Alert & Chat ──
      const siteName = existingLead.sender_name || existingLead.client_name || existingLead.name || 'Site';
      const oldShifts = Array.isArray(existingLead.siteShifts) ? existingLead.siteShifts : [];
      const rateChanges = [];

      for (const s of normalizedShifts) {
        const shiftLabel = s.shiftName || s.shiftCode || 'Shift';
        const oldShift = oldShifts.find((os) =>
          (s.shiftCode && os.shiftCode && String(os.shiftCode).toLowerCase() === String(s.shiftCode).toLowerCase()) ||
          (s.shiftName && os.shiftName && String(os.shiftName).toLowerCase() === String(s.shiftName).toLowerCase()) ||
          (s._id && os._id && String(s._id) === String(os._id))
        );

        if (oldShift) {
          // 1. Shift Bill Rate
          const oldBill = Number(oldShift.billRate) || 0;
          const newBill = Number(s.billRate) || 0;
          if (oldBill !== newBill) {
            const diff = newBill - oldBill;
            const sign = diff > 0 ? `+₹${diff.toLocaleString('en-IN')}` : `-₹${Math.abs(diff).toLocaleString('en-IN')}`;
            rateChanges.push(`• Shift [${shiftLabel}]: Bill Rate revised from ₹${oldBill.toLocaleString('en-IN')} ➔ ₹${newBill.toLocaleString('en-IN')} (${sign})`);
          }

          // 2. Shift Pay Rate
          const oldSal = Number(oldShift.salaryRate) || 0;
          const newSal = Number(s.salaryRate) || 0;
          if (oldSal !== newSal) {
            const diff = newSal - oldSal;
            const sign = diff > 0 ? `+₹${diff.toLocaleString('en-IN')}` : `-₹${Math.abs(diff).toLocaleString('en-IN')}`;
            rateChanges.push(`• Shift [${shiftLabel}]: Pay Rate revised from ₹${oldSal.toLocaleString('en-IN')} ➔ ₹${newSal.toLocaleString('en-IN')} (${sign})`);
          }

          // 3. Worker-level rates
          const oldWorkers = Array.isArray(oldShift.workers) ? oldShift.workers : [];
          for (const w of s.workers || []) {
            const workerName = w.workerName || 'Worker';
            const oldWorker = oldWorkers.find((ow) =>
              (w.workerId && ow.workerId && String(w.workerId) === String(ow.workerId)) ||
              (w.workerName && ow.workerName && String(w.workerName).toLowerCase() === String(ow.workerName).toLowerCase()) ||
              (w.mobile && ow.mobile && String(w.mobile).slice(-10) === String(ow.mobile).slice(-10))
            ) || (oldShift.boundWorkerId && w.workerId && String(oldShift.boundWorkerId) === String(w.workerId) ? {
              workerName: oldShift.boundWorkerName,
              salaryRate: oldShift.salaryRate,
              billRate: oldShift.billRate,
            } : null);

            if (oldWorker) {
              const oldWPay = Number(oldWorker.salaryRate) || 0;
              const newWPay = Number(w.salaryRate) || 0;
              if (oldWPay !== newWPay) {
                const diff = newWPay - oldWPay;
                const sign = diff > 0 ? `+₹${diff.toLocaleString('en-IN')}` : `-₹${Math.abs(diff).toLocaleString('en-IN')}`;
                rateChanges.push(`• Worker [${workerName}] (${shiftLabel}): Pay Rate revised from ₹${oldWPay.toLocaleString('en-IN')} ➔ ₹${newWPay.toLocaleString('en-IN')} (${sign})`);
              }

              const oldWBill = Number(oldWorker.billRate) || 0;
              const newWBill = Number(w.billRate) || 0;
              if (oldWBill !== newWBill) {
                const diff = newWBill - oldWBill;
                const sign = diff > 0 ? `+₹${diff.toLocaleString('en-IN')}` : `-₹${Math.abs(diff).toLocaleString('en-IN')}`;
                rateChanges.push(`• Worker [${workerName}] (${shiftLabel}): Bill Rate revised from ₹${oldWBill.toLocaleString('en-IN')} ➔ ₹${newWBill.toLocaleString('en-IN')} (${sign})`);
              }
            } else {
              // Newly assigned worker
              if (Number(w.salaryRate) > 0) {
                rateChanges.push(`• Assigned Worker [${workerName}] (${shiftLabel}): Pay Rate set to ₹${Number(w.salaryRate).toLocaleString('en-IN')}`);
              }
              if (Number(w.billRate) > 0) {
                rateChanges.push(`• Assigned Worker [${workerName}] (${shiftLabel}): Bill Rate set to ₹${Number(w.billRate).toLocaleString('en-IN')}`);
              }
            }
          }
        } else {
          // Newly added shift
          if (Number(s.salaryRate) > 0) {
            rateChanges.push(`• New Shift [${shiftLabel}]: Pay Rate set to ₹${Number(s.salaryRate).toLocaleString('en-IN')}`);
          }
          if (Number(s.billRate) > 0) {
            rateChanges.push(`• New Shift [${shiftLabel}]: Bill Rate set to ₹${Number(s.billRate).toLocaleString('en-IN')}`);
          }
          for (const w of s.workers || []) {
            if (Number(w.salaryRate) > 0) {
              rateChanges.push(`• New Shift [${shiftLabel}] Worker [${w.workerName || 'Worker'}]: Pay Rate set to ₹${Number(w.salaryRate).toLocaleString('en-IN')}`);
            }
          }
        }
      }

      existingLead.siteShifts = normalizedShifts;
      const lead = await existingLead.save();
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

      // ── Bidirectional Sync: Site shifts -> SiteRoster (Unified Contract Master) ──
      if (RosterModel) {
        try {
          const siteId = lead._id;
          const siteName = lead.sender_name || lead.client_name || lead.name || 'Site';

          let rosterDoc = await RosterModel.findOne({ siteId });
          if (!rosterDoc) {
            rosterDoc = new RosterModel({
              siteId,
              siteName,
              clientId: lead.clientId || null,
              gstNo: lead.gst_number || '',
              billingAddress: {
                line1: lead.sender_address || lead.location?.address || '',
                city: lead.sender_city || '',
                state: lead.sender_state || '',
                pincode: lead.sender_pincode || '',
                country: 'India',
              },
              deliveryAddress: {
                isSameAsBilling: true,
                line1: lead.location?.address || lead.sender_address || '',
                city: lead.sender_city || '',
                state: lead.sender_state || '',
                pincode: lead.sender_pincode || '',
                country: 'India',
              },
              contactPerson: {
                name: lead.contact_person || lead.sender_name || '',
                mobile: lead.sender_mobile || '',
                email: lead.sender_email || '',
                waNumber: lead.sender_mobile || '',
              },
              shifts: [],
            });
          }

          // Build roster shifts matching normalizedShifts with multiple workers
          const rosterShifts = [];
          for (const s of normalizedShifts) {
            if (!s.shiftCode) continue;

            const rawExempt = Array.isArray(s.exemptDays) ? s.exemptDays : [];
            const rawWeekly = (typeof s.weeklyRestDay === 'string' && s.weeklyRestDay.trim())
              ? s.weeklyRestDay.split(',').map((d) => d.trim()).filter(Boolean)
              : [];
            const combinedRest = Array.from(new Set([...rawExempt, ...rawWeekly]));
            const restStr = combinedRest.length > 0 ? combinedRest.join(', ') : null;

            // Map all assigned workers for this shift
            let assignedWorkers = (s.workers || []).map((w) => ({
              workerId: w.workerId,
              workerName: w.workerName,
              enrollmentNo: w.enrollmentNo || '',
              mobile: w.mobile || '',
              salaryRate: Number(w.salaryRate) || 0,
              billRate: Number(w.billRate) || 0,
              weeklyRestDay: w.weeklyRestDay || null,
              exemptDays: w.exemptDays || [],
              assignedDate: s.shiftStartDate || now,
              status: w.status || 'Active',
            }));

            rosterShifts.push({
              shiftCode: s.shiftCode,
              shiftName: s.shiftName || 'Shift',
              groupName: s.groupName,
              startTime: s.startTime || '08:00',
              durationHrs: s.durationHrs,
              shiftStartDate: s.shiftStartDate || now,
              workerSlots: s.workerSlots,
              billRate: s.billRate,
              salaryRate: s.salaryRate,
              weeklyRestDay: restStr,
              exemptDays: combinedRest,
              active: s.active,
              workers: assignedWorkers,
            });
          }

          rosterDoc.siteName = siteName;
          rosterDoc.shifts = rosterShifts;
          rosterDoc.totalConfiguredShifts = rosterShifts.length;
          rosterDoc.totalRequiredWorkers = rosterShifts.reduce((acc, sh) => acc + (sh.active ? sh.workerSlots : 0), 0);
          rosterDoc.totalAssignedWorkers = rosterShifts.reduce((acc, sh) => acc + (sh.workers?.length || 0), 0);
          await rosterDoc.save();

          // If this is Head Office HO, also sync to '__HO__' corporate roster and UserMaster
          if (isTeamHO) {
            const { ProfileMaster } = req.tenantModels || {};
            let profileLocations = [];
            if (ProfileMaster) {
              try {
                const prof = await ProfileMaster.findOne({}).lean();
                if (prof && Array.isArray(prof.locations)) profileLocations = prof.locations;
              } catch {}
            }
            const isBO = /Branch Office|\bBO\b/i.test(lead.sender_name || lead.name || '');
            const locType = isBO ? 'BO' : 'HO';
            const hoLoc = profileLocations.find((l) => l.locationType === 'HO') || profileLocations[0] || null;
            const rawCity = (hoLoc?.address?.city || hoLoc?.address?.district || lead.sender_city || 'Delhi').trim();
            const cleanCity = rawCity.replace(/Head Office|Branch Office|Corporate Staff|Corporate/gi, '').replace(/^[-( ]+|[-) ]+$/g, '').trim() || 'Delhi';
            const canonicalCorpName = `Corporate Staff (${locType}-${cleanCity})`;

            let hoDoc = await RosterModel.findOne({ siteId: '__HO__' });
            if (!hoDoc) {
              hoDoc = new RosterModel({
                siteId: '__HO__',
                siteName: canonicalCorpName,
                shifts: [],
                holidays: [],
              });
            }
            hoDoc.siteName = canonicalCorpName;
            hoDoc.shifts = rosterShifts;
            hoDoc.totalConfiguredShifts = rosterShifts.length;
            hoDoc.totalRequiredWorkers = rosterShifts.reduce((acc, sh) => acc + (sh.active ? sh.workerSlots : 0), 0);
            hoDoc.totalAssignedWorkers = rosterShifts.reduce((acc, sh) => acc + (sh.workers?.length || 0), 0);
            await hoDoc.save();

            // 🗑️ Remove redundant separate siteRoster for this lead so it NEVER duplicates
            await RosterModel.deleteMany({ siteId: lead._id });

            // Sync UserMaster dutyShift config for corporate staff
            try {
              const userMaster = require('../models/userMaster');
              for (const s of normalizedShifts) {
                for (const w of s.workers || []) {
                  if (w.workerId && mongoose.Types.ObjectId.isValid(String(w.workerId))) {
                    await userMaster.findByIdAndUpdate(w.workerId, {
                      $set: {
                        'dutyShift.salaryRate': w.salaryRate,
                        'dutyShift.weeklyRestDay': w.weeklyRestDay,
                        'dutyShift.exemptDays': w.exemptDays,
                        weeklyRestDay: w.weeklyRestDay,
                        exemptDays: w.exemptDays,
                      },
                    });
                  }
                }
              }
            } catch (uErr) {
              console.warn('updateSiteShifts -> userMaster sync notice:', uErr.message);
            }
          }
        } catch (syncErr) {
          console.warn('updateSiteShifts -> SiteRoster sync error:', syncErr.message);
        }
      }

      // ── Dispatch Rate Revision Alert & Chat Notification to Admins ──
      if (rateChanges.length > 0) {
        await _dispatchRateChangeAlerts({
          req,
          siteName,
          source: 'Shift Scheduler',
          changes: rateChanges,
        });
      }

      res.json({ success: true, data: lead, rateChangesCount: rateChanges.length });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

/**
 * 🏢 CORPORATE PROFILE MANAGEMENT
 */
exports.manageProfile = {
  get: async (req, res) => {
    try {
      const { ProfileMaster } = req.tenantModels;
      const profile = await ProfileMaster.findOne({}).lean();
      res.json({ success: true, data: profile });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  update: async (req, res) => {
    try {
      const { ProfileMaster } = req.tenantModels;
      const profile = await ProfileMaster.findOneAndUpdate({}, req.body, {
        new: true,
        upsert: true,
      });
      res.json({ success: true, data: profile });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

/**
 * 📦 CATALOG & PRODUCTS
 */
exports.manageCatalog = {
  generateTemplate: async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Products');
      sheet.columns = [
        { header: 'Category', key: 'category', width: 20 },
        { header: 'ProductName', key: 'name', width: 30 },
        { header: 'Description', key: 'desc', width: 40 },
        { header: 'UoM', key: 'uom', width: 10 },
        { header: 'Price', key: 'price', width: 15 },
      ];
      sheet.addRow({
        category: 'Hardware',
        name: 'Sample Tool',
        desc: 'Heavy duty',
        uom: 'PCS',
        price: 100,
      });
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename=Bulk_Product_Template.xlsx');
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  uploadBulk: async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
      const { Products } = req.tenantModels;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const sheet = workbook.getWorksheet(1);
      const products = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          const category = row.getCell(1).value;
          const name = row.getCell(2).value;
          if (name) {
            products.push({
              name,
              categoryName: category,
              description: row.getCell(3).value || '',
              unit: row.getCell(4).value || 'PCS',
              standardRate: row.getCell(5).value || 0,
            });
          }
        }
      });
      await Products.insertMany(products);
      res.json({ success: true, message: 'Bulk upload completed' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

exports.manageProducts = {
  list: (req, res) => manageSpoke.list(req, res, 'Products'),
  create: async (req, res) => {
    try {
      const { Products } = req.tenantModels;
      const prod = new Products(req.body);
      await prod.save();
      res.status(201).json({ success: true, data: prod });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  update: (req, res) => manageSpoke.update(req, res, 'Products'),
  delete: (req, res) => manageSpoke.delete(req, res, 'Products'),
};

/**
 * Helper: Find a worker's latest work site from the Attendance collection in current month (or recent active window).
 * Checks attendance records for current calendar month matching the worker's ID, mobile, enrollment number, or name.
 * If month has just begun (e.g. 1st of month), smoothly checks recent 35 days (previous month cycle) so the worker's
 * real active work site is reliably retrieved instead of falling back to a dummy "Project Site" placeholder.
 * Resolves to actual site name or the linked project/lead name.
 */
const getWorkerLatestMonthSite = async (
  tenantModels,
  workerId,
  workerMobile,
  enrollmentNo,
  referenceDate,
  workerName
) => {
  try {
    const { Attendance, Leads, Employees } = tenantModels || {};
    if (!Attendance || (!workerId && !workerMobile && !enrollmentNo && !workerName)) return null;

    const refDate = referenceDate ? new Date(referenceDate) : new Date();
    const validRef = !isNaN(refDate.getTime()) ? refDate : new Date();

    // 1. Current calendar month boundary for the reference date
    const startOfMonth = new Date(validRef.getFullYear(), validRef.getMonth(), 1, 0, 0, 0, 0);
    const endOfMonth = new Date(validRef.getFullYear(), validRef.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfMonthStr = startOfMonth.toISOString().slice(0, 10);
    const endOfMonthStr = endOfMonth.toISOString().slice(0, 10);

    // 2. Also check recent 35 days (covers previous month cycle if current month is brand new or worker worked recently)
    const thirtyFiveDaysAgo = new Date(validRef.getTime() - 35 * 24 * 60 * 60 * 1000);
    const thirtyFiveDaysAgoStr = thirtyFiveDaysAgo.toISOString().slice(0, 10);

    const targetIds = new Set();
    if (workerId) targetIds.add(String(workerId));

    const empQuery = [];
    if (workerId && mongoose.Types.ObjectId.isValid(workerId)) {
      empQuery.push({ _id: new mongoose.Types.ObjectId(workerId) });
    }
    if (enrollmentNo) {
      const cleanEfn = String(enrollmentNo).replace(/^EFN#?\s*/i, '').trim();
      empQuery.push({ enrollment_no: cleanEfn });
      empQuery.push({ enrollment_no: String(enrollmentNo) });
    }
    if (workerMobile) {
      const cleanMob = String(workerMobile).replace(/\D/g, '').slice(-10);
      if (cleanMob.length >= 10) {
        empQuery.push({ mobile: { $regex: cleanMob + '$' } });
      }
    }
    if (workerName && String(workerName).trim().length > 2) {
      empQuery.push({ name: new RegExp('^' + String(workerName).trim() + '$', 'i') });
    }

    if (Employees && empQuery.length > 0) {
      const emp = await Employees.findOne({ $or: empQuery })
        .select('_id enrollment_no mobile name locationId')
        .lean()
        .catch(() => null);
      if (emp?._id) targetIds.add(String(emp._id));
    }

    const idConditions = [];
    targetIds.forEach((id) => {
      idConditions.push({ employeeId: id });
      idConditions.push({ workerId: id });
      if (mongoose.Types.ObjectId.isValid(id)) {
        idConditions.push({ employeeId: new mongoose.Types.ObjectId(id) });
      }
    });

    if (workerName && String(workerName).trim().length > 2) {
      idConditions.push({ workerName: new RegExp('^' + String(workerName).trim() + '$', 'i') });
    }

    if (idConditions.length === 0) return null;

    const isGenericSite = (s) =>
      !s || /^(project site|site project|hq\/remote|general|site)$/i.test(String(s).trim());

    // Helper to extract clean site name from lead or attendance
    const resolveSiteFromRecord = async (record) => {
      if (!record) return null;
      let site = (record.site_name || '').trim();
      let siteId = String(record.leadId || record.siteId || '');

      if (isGenericSite(site) && (record.leadId || record.siteId) && Leads) {
        const lead = await Leads.findById(record.leadId || record.siteId).lean().catch(() => null);
        if (lead) {
          site = (lead.sender_name || lead.project_name || lead.name || lead.company_name || '').trim();
        }
      }

      if (site && !isGenericSite(site)) {
        return {
          siteName: site,
          siteId,
          date: record.date || record.dutyStart || record.createdAt,
        };
      }
      return null;
    };

    // Attempt 1: Current month of reference date
    const currentMonthFilter = {
      $and: [
        { $or: idConditions },
        {
          $or: [
            { date: { $gte: startOfMonth, $lte: endOfMonth } },
            { dutyStart: { $gte: startOfMonth, $lte: endOfMonth } },
            { createdAt: { $gte: startOfMonth, $lte: endOfMonth } },
            { date: { $gte: startOfMonthStr, $lte: endOfMonthStr } },
          ],
        },
      ],
    };

    let records = await Attendance.find(currentMonthFilter)
      .sort({ date: -1, dutyStart: -1, createdAt: -1 })
      .limit(20)
      .lean()
      .catch(() => []);

    // Attempt 2: If none in current month, check recent 35 days (e.g. yesterday in previous month)
    if (!records || records.length === 0) {
      const recentFilter = {
        $and: [
          { $or: idConditions },
          {
            $or: [
              { date: { $gte: thirtyFiveDaysAgo } },
              { dutyStart: { $gte: thirtyFiveDaysAgo } },
              { createdAt: { $gte: thirtyFiveDaysAgo } },
              { date: { $gte: thirtyFiveDaysAgoStr } },
            ],
          },
        ],
      };
      records = await Attendance.find(recentFilter)
        .sort({ date: -1, dutyStart: -1, createdAt: -1 })
        .limit(20)
        .lean()
        .catch(() => []);
    }

    // Attempt 3: If still none, get latest attendance ever
    if (!records || records.length === 0) {
      records = await Attendance.find({ $or: idConditions })
        .sort({ date: -1, dutyStart: -1, createdAt: -1 })
        .limit(10)
        .lean()
        .catch(() => []);
    }

    if (!records || records.length === 0) return null;

    // Pick record with non-generic site name first
    let chosen = records.find((r) => r.site_name && !isGenericSite(r.site_name));
    if (!chosen) {
      chosen = records.find((r) => r.leadId || r.siteId) || records[0];
    }

    const resolved = await resolveSiteFromRecord(chosen);
    if (resolved) return resolved;

    // If chosen didn't resolve, loop through all records
    for (const r of records) {
      const res = await resolveSiteFromRecord(r);
      if (res) return res;
    }

    return null;
  } catch (err) {
    console.warn('getWorkerLatestMonthSite error:', err.message);
    return null;
  }
};

/**
 * 👷 EMPLOYEES & STAFF (Identity Reverted to Standalone Users)
 */
exports.manageEmployees = {
  list: async (req, res) => {
    try {
      const { Employees } = req.tenantModels;
      const accessibleIds = req.user?.accessibleLocationIds;
      const q = {};
      if (req.query.all !== 'true') {
        q.active = { $ne: false };
      }
      if (req.query.all !== 'true' && req.user?.userRole !== 'CorpAdmin' && accessibleIds?.length > 0) {
        q.locationId = { $in: accessibleIds };
      }
      let employeesList = await Employees.find(q).lean();

      if (req.query.excludeCorpAdmin === 'true') {
        employeesList = employeesList.filter((emp) => {
          const r = String(emp.userRole || emp.role || '').trim().toLowerCase().replace(/[\s_-]/g, '');
          return r !== 'corpadmin' && r !== 'corporateadmin' && r !== 'corpadminfull';
        });
      }

      const userMaster = require('../models/userMaster');
      const tenantDbName = req.tenantDbName || req.user?.dbName;
      const uQuery = { userActive: true };
      if (tenantDbName) {
        uQuery.accessCorporate = { $elemMatch: { dbName: tenantDbName, isActive: { $ne: false } } };
      }
      let userMasterList = await userMaster.find(uQuery).lean();
      if (req.query.excludeCorpAdmin === 'true') {
        userMasterList = userMasterList.filter((u) => {
          const r = String(u.userRole || u.role || '').trim().toLowerCase().replace(/[\s_-]/g, '');
          return r !== 'corpadmin' && r !== 'corporateadmin' && r !== 'corpadminfull';
        });
      }

      const userMapById = new Map();
      const userMapByMobile = new Map();
      const userMapByEmail = new Map();

      userMasterList.forEach((u) => {
        const name =
          u.userDisplayName ||
          u.name ||
          `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
          u.email;
        const mappedUser = {
          _id: u._id,
          name,
          mobile: u.userMobile || u.mobile,
          email: u.email,
          role: u.userRole || u.role || 'project',
          userRole: u.userRole || u.role,
          employeeType: 'userMaster',
          user_id: u._id,
          userActive: u.userActive,
          active: u.userActive,
          photo_url: u.userProfileImage || u.photo_url,
          daily_rate: 0,
          monthly_rate: 0,
          employmentHistory: [],
          selectedShift: 'G',
          shiftGroupName: 'MANG',
        };
        userMapById.set(String(u._id), mappedUser);
        if (mappedUser.mobile) {
          const cleanMobile = String(mappedUser.mobile).replace(/\D/g, '').slice(-10);
          if (cleanMobile.length === 10) {
            userMapByMobile.set(cleanMobile, mappedUser);
          }
        }
        if (mappedUser.email) {
          userMapByEmail.set(mappedUser.email.toLowerCase().trim(), mappedUser);
        }
      });

      const mergedList = [];
      const processedUserIds = new Set();

      employeesList.forEach((emp) => {
        let matchedUser = null;

        if (emp.user_id && userMapById.has(String(emp.user_id))) {
          matchedUser = userMapById.get(String(emp.user_id));
        }
        if (!matchedUser && emp.mobile) {
          const cleanMobile = String(emp.mobile).replace(/\D/g, '').slice(-10);
          if (cleanMobile.length === 10 && userMapByMobile.has(cleanMobile)) {
            matchedUser = userMapByMobile.get(cleanMobile);
          }
        }
        if (!matchedUser && emp.email) {
          const cleanEmail = emp.email.toLowerCase().trim();
          if (userMapByEmail.has(cleanEmail)) {
            matchedUser = userMapByEmail.get(cleanEmail);
          }
        }

        if (matchedUser) {
          console.log(
            `[hr/employees/list] Matched duplicate Employee (${emp.name}) with userMaster (${matchedUser.name}). Merging...`
          );
          matchedUser.aadhar_no = emp.aadhar_no || matchedUser.aadhar_no;
          matchedUser.enrollment_no = emp.enrollment_no || matchedUser.enrollment_no;
          matchedUser.dob = emp.dob || matchedUser.dob;
          if (emp.photo_url) matchedUser.photo_url = emp.photo_url;
          matchedUser.employmentHistory = emp.employmentHistory || matchedUser.employmentHistory;
          matchedUser.selectedShift = emp.selectedShift || matchedUser.selectedShift;
          matchedUser.shiftGroupName = emp.shiftGroupName || matchedUser.shiftGroupName;
          matchedUser.addresses = emp.addresses || matchedUser.addresses;
          matchedUser.daily_rate = emp.daily_rate || matchedUser.daily_rate;
          matchedUser.monthly_rate = emp.monthly_rate || matchedUser.monthly_rate;
          matchedUser.ledgerId = emp.ledgerId || matchedUser.ledgerId;
          if (emp.active !== undefined) matchedUser.active = emp.active;
          processedUserIds.add(String(matchedUser._id));
        } else {
          mergedList.push(emp);
        }
      });

      userMapById.forEach((mappedUser) => {
        mergedList.push(mappedUser);
      });

      res.json({ success: true, data: mergedList });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  get: async (req, res) => {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid ID format' });
      }

      const userMaster = require('../models/userMaster');
      let userDoc = await userMaster.findById(id).lean();

      const { Employees } = req.tenantModels;
      let employeeDoc = await Employees.findOne({
        $or: [{ _id: id }, { user_id: id }],
      }).lean();

      if (userDoc) {
        console.log(
          `[hr/employees/get] Matched registered user in userMaster: ${userDoc.name || userDoc.email} (ID: ${id}).`
        );
        const mappedUser = {
          _id: userDoc._id,
          name:
            userDoc.userDisplayName ||
            userDoc.name ||
            `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim() ||
            userDoc.email,
          mobile: userDoc.userMobile || userDoc.mobile,
          email: userDoc.email,
          role: userDoc.userRole || userDoc.role || 'project',
          employeeType: 'userMaster',
          user_id: userDoc._id,
          userActive: userDoc.userActive,
          active: employeeDoc?.active !== undefined ? employeeDoc.active : userDoc.userActive,
          photo_url: userDoc.userProfileImage || userDoc.photo_url,
          daily_rate: employeeDoc?.daily_rate || 0,
          monthly_rate: employeeDoc?.monthly_rate || 0,
          employmentHistory: employeeDoc?.employmentHistory || [],
          selectedShift: employeeDoc?.selectedShift || 'G',
          shiftGroupName: employeeDoc?.shiftGroupName || 'MANG',
          addresses: employeeDoc?.addresses,
          aadhar_no: employeeDoc?.aadhar_no,
          enrollment_no: employeeDoc?.enrollment_no,
          dob: employeeDoc?.dob,
          ledgerId: employeeDoc?.ledgerId,
        };
        return res.json({ success: true, data: mappedUser });
      }

      if (!employeeDoc) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }

      res.json({ success: true, data: employeeDoc });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  create: async (req, res) => {
    try {
      const { Employees, ProfileMaster } = req.tenantModels;

      // By default all employees are linked with corporate head office address (HO)
      if (!req.body.locationId && ProfileMaster) {
        try {
          const profile = await ProfileMaster.findOne({}).lean();
          const hoLoc =
            (profile?.locations || []).find((l) => l.locationType === 'HO') ||
            (profile?.locations || [])[0];
          if (hoLoc) {
            req.body.locationId = hoLoc._id;
          }
        } catch (perr) {
          console.error(
            'Failed to resolve HO locationId default in manageEmployees.create:',
            perr.message
          );
        }
      }

      const emp = new Employees(req.body);
      await emp.save();

      // 🚀 Auto-create Ledger
      try {
        const FinanceController = require('./FinanceController');
        const ledger = await FinanceController.ensureLedgerFolioInternal(req.tenantModels, {
          name: emp.name,
          group: 'Account Payables',
          parentGroup: 'Current Liabilities',
          refId: emp._id,
          refType: 'Staff',
        });
        if (ledger) {
          emp.ledgerId = ledger._id;
          await emp.save();
        }
      } catch (err) {
        console.error('Employee-Ledger Auto Init Failed:', err.message);
      }

      const emit = require('../utils/socketEmitter');
      emit(req, 'employee:created', { data: emp });

      res.status(201).json({ success: true, data: emp });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  update: async (req, res) => {
    try {
      const requesterRole = req.user?.userRole;

      if (!['CorpAdmin', 'userAdmin', 'Project'].includes(requesterRole)) {
        return res
          .status(403)
          .json({ success: false, message: 'Access denied. Insufficient permissions.' });
      }

      const { id } = req.params;
      const { Employees } = req.tenantModels;
      const userMaster = require('../models/userMaster');

      let userDoc = await userMaster.findById(id);
      if (userDoc) {
        console.log(
          `[hr/employees/update] Updating registered user: ${userDoc.name || userDoc.email} (ID: ${id}).`
        );

        if (req.body.name) userDoc.userDisplayName = req.body.name;
        if (req.body.mobile) userDoc.userMobile = req.body.mobile;
        if (req.body.role) userDoc.userRole = req.body.role;
        if (req.body.photo_url) userDoc.userProfileImage = req.body.photo_url;
        if (req.body.active !== undefined) userDoc.userActive = req.body.active;
        await userDoc.save();

        let employeeDoc = await Employees.findOne({
          $or: [{ _id: id }, { user_id: id }],
        });

        if (employeeDoc) {
          Object.assign(employeeDoc, req.body);
          await employeeDoc.save();
        } else {
          employeeDoc = new Employees({
            ...req.body,
            user_id: id,
          });
          await employeeDoc.save();
        }

        try {
          const FinanceController = require('./FinanceController');
          const ledger = await FinanceController.ensureLedgerFolioInternal(req.tenantModels, {
            name: req.body.name || userDoc.userDisplayName,
            group: 'Account Payables',
            refId: id,
            refType: 'User',
            nature: 'Cr',
          });
          if (ledger && !employeeDoc.ledgerId) {
            employeeDoc.ledgerId = ledger._id;
            await employeeDoc.save();
          }
        } catch (err) {
          console.error('Employee-Ledger Auto Sync Failed:', err.message);
        }

        const mappedUser = {
          _id: userDoc._id,
          name:
            userDoc.userDisplayName ||
            userDoc.name ||
            `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim() ||
            userDoc.email,
          mobile: userDoc.userMobile || userDoc.mobile,
          email: userDoc.email,
          role: userDoc.userRole || userDoc.role || 'project',
          employeeType: 'userMaster',
          user_id: userDoc._id,
          userActive: userDoc.userActive,
          active: employeeDoc.active !== undefined ? employeeDoc.active : userDoc.userActive,
          photo_url: userDoc.userProfileImage || userDoc.photo_url,
          daily_rate: employeeDoc.daily_rate || 0,
          monthly_rate: employeeDoc.monthly_rate || 0,
          employmentHistory: employeeDoc.employmentHistory || [],
          selectedShift: employeeDoc.selectedShift || 'G',
          shiftGroupName: employeeDoc.shiftGroupName || 'MANG',
          addresses: employeeDoc.addresses,
          aadhar_no: employeeDoc.aadhar_no,
          enrollment_no: employeeDoc.enrollment_no,
          dob: employeeDoc.dob,
          ledgerId: employeeDoc.ledgerId,
        };
        const emit = require('../utils/socketEmitter');
        emit(req, 'employee:updated', { data: mappedUser });
        return res.json({ success: true, data: mappedUser });
      }

      const emp = await Employees.findByIdAndUpdate(id, req.body, { new: true });
      if (!emp) return res.status(404).json({ success: false, message: 'Employee not found' });

      try {
        const FinanceController = require('./FinanceController');
        const ledger = await FinanceController.ensureLedgerFolioInternal(req.tenantModels, {
          name: emp.name,
          group: 'Account Payables',
          refId: emp._id,
          refType: 'Staff',
          nature: 'Cr',
        });
        if (ledger && !emp.ledgerId) {
          emp.ledgerId = ledger._id;
          await emp.save();
        }
      } catch (err) {
        console.error('Employee-Ledger Auto Sync Failed:', err.message);
      }

      const emit = require('../utils/socketEmitter');
      emit(req, 'employee:updated', { data: emp });

      res.json({ success: true, data: emp });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  delete: (req, res) => manageSpoke.delete(req, res, 'Employees'),
  generateAttendanceTemplate: async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Attendance');
      sheet.columns = [
        { header: 'Date (YYYY-MM-DD)', key: 'date', width: 18 },
        { header: 'Employee Name or Mobile', key: 'employeeIdentifier', width: 25 },
        { header: 'Site Name', key: 'siteName', width: 25 },
        { header: 'Shift Code (M/A/N/G/D/N2)', key: 'shiftCode', width: 20 },
        { header: 'Hours Worked', key: 'hoursWorked', width: 15 },
        { header: 'Daily Earn (₹)', key: 'dailyEarn', width: 15 },
        { header: 'Remarks', key: 'remarks', width: 30 },
      ];

      sheet.getRow(1).eachCell((cell) => {
        cell.font = { name: 'Arial', family: 4, size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF1F497D' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      });

      sheet.addRow({
        date: '2026-06-15',
        employeeIdentifier: 'Suresh Chauhan',
        siteName: 'Pratham Services',
        shiftCode: 'G',
        hoursWorked: 8,
        dailyEarn: 500,
        remarks: 'Regular general shift',
      });

      sheet.addRow({
        date: '2026-06-15',
        employeeIdentifier: '9876543210',
        siteName: 'Pratham Services',
        shiftCode: 'D',
        hoursWorked: 12,
        dailyEarn: 750,
        remarks: 'Day shift 12hr',
      });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', 'attachment; filename=Attendance_Upload_Template.xlsx');
      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  bulkImportAttendance: async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const { Attendance, Employees } = req.tenantModels;
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);

      const sheet = workbook.getWorksheet('Attendance') || workbook.getWorksheet(1);
      if (!sheet) {
        return res
          .status(400)
          .json({ success: false, message: 'Could not find Attendance worksheet' });
      }

      const rows = [];
      const getCellValue = (cell) => {
        if (!cell) return null;
        if (cell.value && typeof cell.value === 'object') {
          if (cell.value.result !== undefined) return cell.value.result;
          if (cell.value.text !== undefined) return cell.value.text;
        }
        return cell.value;
      };

      const parseDateVal = (val) => {
        if (val instanceof Date) return val;
        if (!val) return null;
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      };

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          const dateVal = getCellValue(row.getCell(1));
          const employeeIdentifier = String(getCellValue(row.getCell(2)) || '').trim();
          const siteName = String(getCellValue(row.getCell(3)) || '').trim();
          const shiftCode = String(getCellValue(row.getCell(4)) || '')
            .trim()
            .toUpperCase();
          const hoursWorkedVal = getCellValue(row.getCell(5));
          const dailyEarnVal = getCellValue(row.getCell(6));
          const remarks = String(getCellValue(row.getCell(7)) || '').trim();

          if (!dateVal && !employeeIdentifier && !shiftCode) return;

          rows.push({
            rowNumber,
            dateVal,
            employeeIdentifier,
            siteName,
            shiftCode,
            hoursWorkedVal,
            dailyEarnVal,
            remarks,
          });
        }
      });

      if (rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Excel sheet has no valid rows' });
      }

      const errors = [];
      const attendanceToInsert = [];

      for (const row of rows) {
        const date = parseDateVal(row.dateVal);
        if (!date) {
          errors.push(`[Row ${row.rowNumber}] Date is invalid or empty.`);
          continue;
        }

        if (!row.employeeIdentifier) {
          errors.push(`[Row ${row.rowNumber}] Employee Name or Mobile is required.`);
          continue;
        }

        // Find Employee
        let employee = null;
        const cleanMobile = row.employeeIdentifier.replace(/\D/g, '').slice(-10);
        if (cleanMobile.length === 10) {
          employee = await Employees.findOne({
            mobile: { $regex: new RegExp(cleanMobile.split('').join('\\D*') + '\\D*$') },
          });
        }
        if (!employee) {
          employee = await Employees.findOne({
            name: {
              $regex: new RegExp(
                '^' + row.employeeIdentifier.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '$',
                'i'
              ),
            },
          });
        }

        if (!employee) {
          errors.push(
            `[Row ${row.rowNumber}] Employee "${row.employeeIdentifier}" could not be resolved.`
          );
          continue;
        }

        // Resolve Shift start times and durations dynamically from Employee active arrangement
        const activeHistory = employee.employmentHistory?.find((h) => h.active === true);
        let shiftStartTime = activeHistory?.shiftStartTime || '';
        let shiftHours = activeHistory?.shiftHours || 8;
        let shiftGroupName = activeHistory?.groupName || employee.shiftGroupName;
        let shiftPeriod = activeHistory?.shiftName;

        const sc = row.shiftCode || 'G';
        const isDaNi = ['D', 'N2'].includes(sc);
        if (!shiftGroupName) {
          shiftGroupName = isDaNi ? 'DaNi' : 'MANG';
        }

        // Fallback standard presets if not dynamically resolved
        if (!shiftStartTime) {
          if (sc === 'D' || sc === 'M') {
            shiftStartTime = '06:00';
          } else if (sc === 'G') {
            shiftStartTime = '08:00';
          } else if (sc === 'A') {
            shiftStartTime = '14:00';
          } else if (sc === 'N2') {
            shiftStartTime = '18:00';
          } else if (sc === 'N') {
            shiftStartTime = '22:00';
          } else {
            shiftStartTime = '08:00';
          }
        }

        if (activeHistory?.shiftHours === undefined) {
          shiftHours = isDaNi ? 12 : 8;
        }

        if (!shiftPeriod) {
          if (sc === 'M') shiftPeriod = 'Morning';
          else if (sc === 'A') shiftPeriod = 'Afternoon';
          else if (sc === 'N') shiftPeriod = 'Night';
          else if (sc === 'G') shiftPeriod = 'General';
          else if (sc === 'D') shiftPeriod = 'Day';
          else if (sc === 'N2') shiftPeriod = 'Night12';
          else shiftPeriod = 'General';
        }

        const hoursWorked = parseFloat(row.hoursWorkedVal) || shiftHours;
        const dailyEarn = parseFloat(row.dailyEarnVal) || 0;

        // Construct dutyStart Date object
        const [hh, mm] = shiftStartTime.split(':').map(Number);
        const dutyStart = new Date(date);
        dutyStart.setHours(hh || 8, mm || 0, 0, 0);

        // Construct dutyEnd Date object
        const dutyEnd = new Date(dutyStart.getTime() + hoursWorked * 60 * 60 * 1000);

        attendanceToInsert.push({
          employeeId: employee._id,
          employeeType: 'Employees',
          date,
          status: 'Present',
          site_name: row.siteName || 'General',
          shiftGroupName,
          shiftCode: sc,
          shiftType: isDaNi ? '12hr' : '8hr',
          shiftPeriod,
          shiftHours,
          shiftLockHours: shiftHours,
          defaultShiftStart: shiftStartTime,
          hoursWorked,
          dailyEarn,
          dutyCount: 1,
          isPosted: false,
          dutyStartScheduled: dutyStart,
          dutyStart,
          dutyEnd,
          dutyEndScheduled: dutyEnd,
          remarks: row.remarks || 'Bulk Excel Import',
        });
      }

      if (errors.length > 0) {
        return res
          .status(400)
          .json({ success: false, message: 'Validation checks failed', errors });
      }

      const inserted = await Attendance.insertMany(attendanceToInsert);
      res.json({
        success: true,
        message: `Successfully imported ${inserted.length} attendance records.`,
        count: inserted.length,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  getAttendanceDashboard: async (req, res) => {
    try {
      let empResult = null;
      let attResult = null;

      const mockResEmp = {
        status: function() { return this; },
        json: function(data) { empResult = data; return this; }
      };

      const mockResAtt = {
        status: function() { return this; },
        json: function(data) { attResult = data; return this; }
      };

      await Promise.all([
        exports.manageEmployees.list(req, mockResEmp),
        exports.manageEmployees.listAttendance(req, mockResAtt)
      ]);

      res.json({
        success: true,
        employees: empResult?.data || [],
        attendance: attResult?.data || []
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  listAttendance: async (req, res) => {
    try {
      const { Attendance } = req.tenantModels;
      const { from_date, to_date, date, employeeId } = req.query;
      let q = {};

      let empClause = null;
      if (employeeId) {
        const empIdStr = String(employeeId);
        const isObjectId = mongoose.Types.ObjectId.isValid(empIdStr);
        const objId = isObjectId ? new mongoose.Types.ObjectId(empIdStr) : null;
        empClause = {
          $or: [
            { employeeId: empIdStr },
            ...(objId ? [{ employeeId: objId }] : []),
            { _id: isObjectId ? objId : empIdStr },
          ],
        };
      }

      let filterFrom = from_date;
      let filterTo = to_date;

      // Handle single-date queries like ?date=2026-10-07
      if (date && !from_date && !to_date) {
        const d = new Date(date);
        if (!isNaN(d.getTime())) {
          const startOfDay = new Date(d);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(d);
          endOfDay.setHours(23, 59, 59, 999);
          filterFrom = startOfDay;
          filterTo = endOfDay;
        } else {
          filterFrom = date;
          filterTo = date;
        }
      }

      if (filterFrom || filterTo) {
        const dateFilter = {};
        if (filterFrom) {
          const d = filterFrom instanceof Date ? filterFrom : resolveDatePreset(filterFrom);
          if (d) dateFilter.$gte = d;
        }
        if (filterTo) {
          const d = filterTo instanceof Date ? filterTo : resolveDatePreset(filterTo);
          if (d) dateFilter.$lte = d;
        }

        if (Object.keys(dateFilter).length > 0) {
          // If query specifies a historical period (to_date is in past), query date: dateFilter directly.
          // This avoids scanning open shifts from current dates and lets MongoDB use the date index directly.
          const isHistorical = dateFilter.$lte && (new Date(dateFilter.$lte).getTime() < (Date.now() - 24 * 60 * 60 * 1000));
          const periodClause = isHistorical
            ? { date: dateFilter }
            : { $or: [{ date: dateFilter }, { dutyEnd: { $exists: false } }, { dutyEnd: null }] };

          if (empClause) {
            q = { $and: [empClause, periodClause] };
          } else {
            q = periodClause;
          }
        }
      } else if (empClause) {
        q = empClause;
      } else {
        // Fallback default: past 30 days or active duty to prevent timeout/full scan
        const defaultStart = new Date();
        defaultStart.setDate(defaultStart.getDate() - 30);
        defaultStart.setHours(0, 0, 0, 0);
        q = {
          $or: [{ date: { $gte: defaultStart } }, { dutyEnd: { $exists: false } }, { dutyEnd: null }],
        };
      }
      const limitVal = req.query.limit ? parseInt(req.query.limit, 10) : 5000;
      const data = await Attendance.find(q)
        .select('_id employeeId employeeType leadId clientId siteId site_name shiftCode shiftPeriod shiftGroupName date status dutyLevel rate dutyStart dutyEnd markedByUserName hoursWorked dailyRate dailyEarn penaltyImposed penaltyDeducted penaltyWaivedOff violationType penaltyReason penaltyApprovedBy penaltyMediaUrl penaltyMedia geoHistory')
        .sort({ date: -1 })
        .limit(limitVal)
        .lean();

      const userMaster = require('../models/userMaster');
      const { Employees, Leads } = req.tenantModels;

      const userMasterIds = [];
      const employeeIds = [];
      const leadIds = [];
      for (const item of data) {
        if (item.employeeId) {
          if (item.employeeType === 'userMaster') {
            userMasterIds.push(item.employeeId);
          } else {
            employeeIds.push(item.employeeId);
          }
        }
        if (item.leadId) {
          leadIds.push(item.leadId);
        }
      }

      const uniqueUserMasterIds = [...new Set(userMasterIds.map((id) => id.toString()))];
      const uniqueEmployeeIds = [...new Set(employeeIds.map((id) => id.toString()))];
      const uniqueLeadIds = [...new Set(leadIds.map((id) => id.toString()))];

      const [usersList, empsList, leadsList] = await Promise.all([
        uniqueUserMasterIds.length > 0
          ? userMaster.find({ _id: { $in: uniqueUserMasterIds } }).select('_id name userDisplayName userProfileImage email mobile role').lean()
          : Promise.resolve([]),
        uniqueEmployeeIds.length > 0
          ? Employees.find({ _id: { $in: uniqueEmployeeIds } }).select('_id name enrollment_no role mobile photo photo_url daily_rate rate employmentHistory').lean()
          : Promise.resolve([]),
        uniqueLeadIds.length > 0
          ? Leads.find({ _id: { $in: uniqueLeadIds } }).select('_id sender_name displayName client_name siteShifts status').lean()
          : Promise.resolve([]),
      ]);

      const usersMap = {};
      for (const u of usersList) {
        usersMap[u._id.toString()] = {
          _id: u._id,
          name:
            u.userDisplayName ||
            u.name ||
            `${u.firstName || ''} ${u.lastName || ''}`.trim() ||
            u.email,
          mobile: u.userMobile || u.mobile,
          email: u.email,
          role: u.userRole || u.role || 'project',
          photo_url: u.userProfileImage || u.photo_url,
          employeeType: 'userMaster',
          user_id: u._id,
          userActive: u.userActive,
        };
      }

      const empsMap = {};
      for (const emp of empsList) {
        empsMap[emp._id.toString()] = emp;
      }

      const leadsMap = {};
      for (const lead of leadsList) {
        leadsMap[lead._id.toString()] = lead;
      }

      for (let item of data) {
        const idStr = item.employeeId?.toString();
        if (idStr) {
          if (item.employeeType === 'userMaster') {
            if (usersMap[idStr]) {
              item.employeeId = usersMap[idStr];
            }
          } else {
            if (empsMap[idStr]) {
              item.employeeId = empsMap[idStr];
            }
          }
        }

        const lIdStr = item.leadId?.toString();
        if (lIdStr && leadsMap[lIdStr]) {
          item.leadId = leadsMap[lIdStr];
        }
      }

      res.json({ success: true, data });
    } catch (err) {
      console.error('🔴 [Error] listAttendance Failed:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },
  markAttendance: async (req, res) => {
    try {
      const { Attendance, Employees, Leads } = req.tenantModels;
      // Phase 2a: ensure unique index exists for this tenant
      ensureAttendanceIndex(Attendance).catch(() => {});
      const {
        employeeId,
        leadId,
        status,
        dutyLevel,
        rate,
        date,
        site_name,
        remarks,
        dutyStart,
        dutyEnd,
        forcedOff,
        forcedOffReason,
        clientId,
        location,
        geoHistory,
        // Shift fields
        shiftCode,
        shiftType,
        shiftPeriod,
        shiftLockHours,
      } = req.body;

      // ─── ONE WORKER · ONE SHIFT · ONE ATTENDANCE ──────────────────────────
      // Reject if this employee already has an open (active) duty session.
      // This prevents duplicate attendance records regardless of which site or
      // which UI surface triggered the create request.
      if (employeeId && !dutyEnd) {
        const mongoose = require('mongoose');
        const qId = mongoose.isValidObjectId(employeeId)
          ? new mongoose.Types.ObjectId(employeeId)
          : employeeId;
        const openSession = await Attendance.findOne({
          employeeId: qId,
          $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
        })
          .select('shiftCode site_name leadId')
          .lean();
        if (openSession) {
          const where = openSession.site_name || 'another site';
          const code = openSession.shiftCode || 'active shift';
          return res.status(409).json({
            success: false,
            alreadyOnDuty: true,
            message: `Worker is already on duty (${code}) at ${where}. End that shift first.`,
            activeAttendanceId: openSession._id,
          });
        }
      }
      // ──────────────────────────────────────────────────────────────────────

      // ── SITE-SHIFT RESOLUTION ─────────────────────────────────────────────
      // If a leadId is provided, resolve shift timing from the site's siteShifts.
      // Duty start is BLOCKED if the site has no active shifts configured.
      let siteShiftOverride = null;
      let siteShiftExcess = null;
      const targetLeadIdForShift = leadId;
      if (targetLeadIdForShift && !dutyEnd) {
        const siteDoc = await Leads.findById(targetLeadIdForShift)
          .select('siteShifts sender_name')
          .lean();
        const activeShifts = (siteDoc?.siteShifts || []).filter((s) => s.active);

        if (siteDoc && activeShifts.length === 0) {
          return res.status(422).json({
            success: false,
            noSiteShifts: true,
            message: `Site "${siteDoc.sender_name || 'this site'}" has no shift configuration. Please set up site shifts before starting duty.`,
            leadId: targetLeadIdForShift,
          });
        }

        if (siteDoc && activeShifts.length > 0 && shiftCode) {
          const matchedShift =
            activeShifts.find((s) => s.shiftCode === shiftCode) || activeShifts[0];
          siteShiftOverride = {
            shiftCode: matchedShift.shiftCode,
            shiftPeriod: SHIFT_PERIOD_MAP[matchedShift.shiftName] || 'General',
            shiftType: matchedShift.durationHrs === 12 ? '12hr' : '8hr',
            shiftLockHours: matchedShift.durationHrs || 8,
            startTime: matchedShift.startTime,
            groupName: matchedShift.groupName || 'MANG',
            billRate: matchedShift.billRate || 0,
            salaryRate: matchedShift.salaryRate || 0,
          };

          // Per-slot capacity check
          const { Attendance } = req.tenantModels;
          const mongoose = require('mongoose');
          const activeInSlot = await Attendance.countDocuments({
            leadId: mongoose.isValidObjectId(targetLeadIdForShift)
              ? new mongoose.Types.ObjectId(targetLeadIdForShift)
              : targetLeadIdForShift,
            shiftCode: matchedShift.shiftCode,
            $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
          });

          if (activeInSlot >= (matchedShift.workerSlots || 1)) {
            siteShiftExcess = {
              shiftCode: matchedShift.shiftCode,
              shiftName: matchedShift.shiftName,
              workerSlots: matchedShift.workerSlots || 1,
              activeNow: activeInSlot,
              message: `Shift ${matchedShift.shiftName} (${matchedShift.shiftCode}) at "${siteDoc.sender_name}" already has ${activeInSlot}/${matchedShift.workerSlots || 1} worker(s). This is an excess duty.`,
            };
            // We don't block — supervisor can override. Returned in response for frontend to display warning.
          }
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      const userMaster = require('../models/userMaster');
      let userDoc = await userMaster.findById(employeeId).lean();
      let employeeDoc = await Employees.findById(employeeId);

      if (userDoc && !employeeDoc) {
        employeeDoc = await Employees.findOne({
          $or: [
            { user_id: userDoc._id },
            { mobile: userDoc.mobile || userDoc.userMobile || userDoc.username },
            { email: userDoc.email },
          ].filter((q) => q.user_id || q.mobile || q.email),
        });
      } else if (employeeDoc && !userDoc) {
        userDoc = await userMaster
          .findOne({
            $or: [
              { _id: employeeDoc.user_id },
              { mobile: employeeDoc.mobile },
              { email: employeeDoc.email },
            ].filter((q) => q._id || q.mobile || q.email),
          })
          .lean();
      }

      let emp = null;
      if (employeeDoc) {
        emp = employeeDoc.toObject();
      }
      if (userDoc) {
        emp = { ...emp, ...userDoc };
      }

      let role = 'project';
      if (userDoc) {
        role = userDoc.userRole || userDoc.role || 'project';
      } else if (emp) {
        role = emp.role || 'project';
      }
      if (employeeDoc && emp && !emp.shiftGroupName) {
        const targetGroupName =
          shiftType === '12hr' || ['Day', 'Night12'].includes(shiftPeriod) ? 'DaNi' : 'MANG';
        const targetSelectedShift = shiftCode || (targetGroupName === 'DaNi' ? 'D' : 'G');

        let targetShiftName = shiftPeriod || 'General';
        if (targetShiftName === 'Night12') {
          targetShiftName = 'Night';
        }
        let targetShiftStartTime = '08:00';
        if (targetGroupName === 'DaNi') {
          if (targetSelectedShift === 'N2' || targetShiftName === 'Night') {
            targetShiftStartTime = '18:00';
          } else {
            targetShiftStartTime = '06:00';
          }
        } else {
          if (targetSelectedShift === 'M' || targetShiftName === 'Morning') {
            targetShiftStartTime = '06:00';
          } else if (targetSelectedShift === 'A' || targetShiftName === 'Afternoon') {
            targetShiftStartTime = '14:00';
          } else if (targetSelectedShift === 'N' || targetShiftName === 'Night') {
            targetShiftStartTime = '22:00';
          } else {
            targetShiftStartTime = '08:00';
          }
        }
        const targetShiftHours = shiftLockHours || (targetGroupName === 'DaNi' ? 12 : 8);

        employeeDoc.shiftGroupName = targetGroupName;
        employeeDoc.selectedShift = targetSelectedShift;

        let activeHistoryEntry = employeeDoc.employmentHistory.find((h) => h.active);
        if (activeHistoryEntry) {
          activeHistoryEntry.groupName = targetGroupName;
          activeHistoryEntry.shiftName = targetShiftName;
          activeHistoryEntry.shiftStartTime = targetShiftStartTime;
          activeHistoryEntry.shiftHours = targetShiftHours;
          if (rate && !activeHistoryEntry.daily_rate) {
            activeHistoryEntry.daily_rate = rate;
          }
        } else {
          employeeDoc.employmentHistory.push({
            joinDate: new Date(),
            daily_rate:
              rate ||
              (employeeDoc.monthlyRate ? parseFloat((employeeDoc.monthlyRate / 30).toFixed(2)) : 0),
            monthly_rate: employeeDoc.monthlyRate || 0,
            shiftStartTime: targetShiftStartTime,
            shiftHours: targetShiftHours,
            groupName: targetGroupName,
            shiftName: targetShiftName,
            active: true,
            notes: 'Auto-assigned on first attendance marking',
          });
        }

        await employeeDoc.save();
        emp = { ...emp, ...employeeDoc.toObject() };
      }

      // Default shift values from userMaster dutyShift if employee doesn't exist
      let defaultShiftLockHours = 8;
      let defaultShiftType = '8hr';
      let defaultShiftPeriod = 'General';
      let defaultShiftCode = 'G';

      if (emp) {
        const activeHistEntry =
          emp.employmentHistory?.find((e) => e.active) ||
          (emp.employmentHistory?.length
            ? emp.employmentHistory[emp.employmentHistory.length - 1]
            : null);
        if (activeHistEntry) {
          const groupName =
            activeHistEntry.groupName ||
            (activeHistEntry.shiftName === 'Day' ||
            activeHistEntry.shiftName === 'Night' ||
            activeHistEntry.shiftName === 'Night12'
              ? 'DaNi'
              : 'MANG');
          defaultShiftLockHours = activeHistEntry.shiftHours || (groupName === 'DaNi' ? 12 : 8);
          defaultShiftType = groupName === 'DaNi' ? '12hr' : '8hr';
          defaultShiftPeriod = activeHistEntry.shiftName || 'General';
          if (defaultShiftPeriod === 'Night') {
            defaultShiftPeriod = groupName === 'DaNi' ? 'Night12' : 'Night';
          }
          defaultShiftCode = emp.selectedShift || (groupName === 'DaNi' ? 'D' : 'G');
        } else if (emp.dutyShift) {
          const ds = emp.dutyShift;
          const groupName =
            ds.groupName ||
            (ds.shiftName === 'Day' || ds.shiftName === 'Night2' || ds.shiftName === 'Night12'
              ? 'DaNi'
              : 'MANG');
          defaultShiftLockHours =
            ds.durationHrs || ds.shiftHours || (groupName === 'DaNi' ? 12 : 8);
          defaultShiftType = defaultShiftLockHours === 12 ? '12hr' : '8hr';
          defaultShiftPeriod = ds.shiftName || 'General';
          if (ds.shiftName === 'Night2') defaultShiftCode = 'N2';
          else if (ds.shiftName === 'Night1' || ds.shiftName === 'Night') defaultShiftCode = 'N';
          else if (ds.shiftName) defaultShiftCode = ds.shiftName.substring(0, 1);
        } else if (emp.shiftGroupName) {
          const groupName = emp.shiftGroupName;
          defaultShiftLockHours = groupName === 'DaNi' ? 12 : 8;
          defaultShiftType = groupName === 'DaNi' ? '12hr' : '8hr';
          defaultShiftCode = emp.selectedShift || (groupName === 'DaNi' ? 'D' : 'G');
        }
      } else if (userDoc && userDoc.dutyShift) {
        const ds = userDoc.dutyShift;
        const groupName =
          ds.groupName ||
          (ds.shiftName === 'Day' || ds.shiftName === 'Night2' || ds.shiftName === 'Night12'
            ? 'DaNi'
            : 'MANG');
        defaultShiftLockHours = ds.durationHrs || ds.shiftHours || (groupName === 'DaNi' ? 12 : 8);
        defaultShiftType = defaultShiftLockHours === 12 ? '12hr' : '8hr';
        defaultShiftPeriod = ds.shiftName || 'General';

        if (ds.shiftName === 'Night2') defaultShiftCode = 'N2';
        else if (ds.shiftName === 'Night1' || ds.shiftName === 'Night') defaultShiftCode = 'N';
        else if (ds.shiftName) defaultShiftCode = ds.shiftName.substring(0, 1);
      }

      // Exemption check for geoHistory: ONLY admins are exempt. Registered users / workers MUST be tracked!
      const isAdminRole = ['corpadmin', 'useradmin', 'admin'].includes(role.toLowerCase());
      const isExemptUser = isAdminRole;
      let finalGeoHistory = isExemptUser ? [] : (geoHistory || []);

      // Merge site-shift override on top of defaults (site always wins when available)
      const finalShiftCode =
        SHIFT_CODE_MAP[siteShiftOverride?.shiftCode || shiftCode || defaultShiftCode] || 'G';
      const finalShiftType = siteShiftOverride?.shiftType || shiftType || defaultShiftType;
      const finalShiftPeriod =
        SHIFT_PERIOD_MAP[siteShiftOverride?.shiftPeriod || shiftPeriod || defaultShiftPeriod] ||
        'General';
      const finalShiftLockHours =
        siteShiftOverride?.shiftLockHours || shiftLockHours || defaultShiftLockHours;

      // Compute duty end scheduled using final lock hours
      const dutyStartMs = dutyStart ? new Date(dutyStart).getTime() : Date.now();
      const finalDutyEndScheduled =
        req.body.dutyEndScheduled || new Date(dutyStartMs + finalShiftLockHours * 3600000);

      // Fetch site coordinates if leadId or siteId exists
      let siteLat = undefined;
      let siteLong = undefined;
      const targetLeadId = leadId || req.body.siteId;
      let siteDoc = null;
      if (targetLeadId) {
        siteDoc = await Leads.findById(targetLeadId).lean();
        if (siteDoc && siteDoc.location && siteDoc.location.lat !== undefined && siteDoc.location.long !== undefined) {
          siteLat = Number(siteDoc.location.lat);
          siteLong = Number(siteDoc.location.long);
        } else if (siteDoc && siteDoc.lat !== undefined && siteDoc.long !== undefined) {
          siteLat = Number(siteDoc.lat);
          siteLong = Number(siteDoc.long);
        }
      }

      const startLat = req.body.startLat || req.body.lat || (finalGeoHistory && finalGeoHistory.length > 0 ? finalGeoHistory[0].lat : undefined) || siteLat;
      const startLong = req.body.startLong || req.body.long || (finalGeoHistory && finalGeoHistory.length > 0 ? finalGeoHistory[0].long : undefined) || siteLong;

      if ((!finalGeoHistory || finalGeoHistory.length === 0) && (startLat !== undefined || siteLat !== undefined)) {
        const initialLat = startLat ?? siteLat;
        const initialLong = startLong ?? siteLong;
        if (initialLat !== undefined && initialLong !== undefined) {
          finalGeoHistory = [
            {
              lat: initialLat,
              long: initialLong,
              address: siteDoc?.location?.address || site_name || 'Site Location',
              type: 'start',
              timestamp: dutyStart ? new Date(dutyStart) : new Date(),
            },
          ];
        }
      }

      const record = new Attendance({
        employeeId,
        employeeType: employeeDoc ? 'Employees' : 'userMaster',
        role,
        leadId,
        clientId: clientId || null,
        status: status || 'Present',
        customCreated: true, // Tag it so we know it was manually marked/handled
        dutyLevel: dutyLevel ?? 1,
        rate: siteShiftOverride?.salaryRate || rate || 0,
        dailyRate: siteShiftOverride?.salaryRate || rate || 0,
        dailyEarn: siteShiftOverride?.salaryRate || rate || 0,
        monthlyRate: (siteShiftOverride?.salaryRate || rate || 0) * 30,
        date: date || new Date(),
        site_name,
        remarks,
        dutyStartScheduled:
          req.body.dutyStartScheduled || (dutyStart ? new Date(dutyStart) : new Date()),
        dutyStart: dutyStart ? new Date(dutyStart) : new Date(),
        dutyEnd: dutyEnd ? new Date(dutyEnd) : undefined,
        dutyEndScheduled: finalDutyEndScheduled,
        forcedOff: !!forcedOff,
        forcedOffReason: forcedOffReason || '',
        geoHistory: finalGeoHistory,
        // Shift (site overrides worker profile)
        shiftCode: finalShiftCode,
        shiftType: finalShiftType,
        shiftPeriod: finalShiftPeriod,
        shiftLockHours: finalShiftLockHours,
        markedByDevice: false,
        markedByUserName:
          req.user?.userDisplayName || req.user?.name || req.user?.mobile || 'Supervisor',
        startLat,
        startLong,
        siteLat,
        siteLong,
      });
      await record.save();
      const emit = require('../utils/socketEmitter');
      emit(req, 'attendance:created', { data: record });
      if (req.io && req.tenantDbName) {
        req.io.to(req.tenantDbName).emit('attendance:active_updated');
      }
      res.status(201).json({
        success: true,
        message: 'Attendance recorded',
        data: record,
        ...(siteShiftExcess ? { excessWarning: siteShiftExcess } : {}),
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  cleanReconcileAttendance: async (req, res) => {
    try {
      const { Attendance } = req.tenantModels;
      const { month, year } = req.body;
      const targetYear = parseInt(year, 10);
      const targetMonth = parseInt(month, 10);

      if (isNaN(targetYear) || isNaN(targetMonth)) {
        return res.status(400).json({ success: false, message: 'Invalid month or year' });
      }

      const dStart = new Date(Date.UTC(targetYear, targetMonth, 1, 0, 0, 0, 0));
      const dEnd = new Date(Date.UTC(targetYear, targetMonth + 1, 0, 23, 59, 59, 999));

      const logs = await Attendance.find({
        date: { $gte: dStart, $lte: dEnd }
      }).lean();

      let mergedCount = 0;
      let deletedFragmentsCount = 0;
      let halfDutyAdjustedCount = 0;
      let normalizedStatusCount = 0;

      // 1. Merge fragmented crash logs for same employee, date, site, and shift
      const groupMap = new Map();
      logs.forEach(log => {
        const rawDate = log.date || log.dutyStart;
        const dt = new Date(rawDate);
        const dayStr = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
        const empId = String(log.employeeId || log.markedByUserId || '');
        const leadId = String(log.leadId || log.clientId || log.siteId || 'none');
        const shift = String(log.shiftCode || 'G').trim().toUpperCase();

        const key = `${dayStr}_${empId}_${leadId}_${shift}`;
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key).push(log);
      });

      for (const [key, groupLogs] of groupMap.entries()) {
        if (groupLogs.length > 1) {
          mergedCount++;
          groupLogs.sort((a, b) => {
            const tA = a.dutyStart ? new Date(a.dutyStart).getTime() : 0;
            const tB = b.dutyStart ? new Date(b.dutyStart).getTime() : 0;
            return tA - tB;
          });
          const primary = groupLogs[0];
          const duplicates = groupLogs.slice(1);

          let maxEnd = primary.dutyEnd;
          for (const d of duplicates) {
            if (d.dutyEnd && (!maxEnd || new Date(d.dutyEnd).getTime() > new Date(maxEnd).getTime())) {
              maxEnd = d.dutyEnd;
            }
          }

          if (maxEnd && maxEnd !== primary.dutyEnd) {
            await Attendance.findByIdAndUpdate(primary._id, { dutyEnd: maxEnd });
          }

          const dupIds = duplicates.map(d => d._id);
          await Attendance.deleteMany({ _id: { $in: dupIds } });
          deletedFragmentsCount += dupIds.length;
        }
      }

      // 2. Normalize statuses
      const remainingLogs = await Attendance.find({
        date: { $gte: dStart, $lte: dEnd }
      }).lean();

      for (const log of remainingLogs) {
        const raw = String(log.status || '').trim().toLowerCase();
        let normalized = 'Present';
        if (raw === 'p' || raw === 'present') normalized = 'Present';
        else if (raw === 'w' || raw === 'weekly off' || raw === 'wo') normalized = 'Weekly Off';
        else if (raw === 'l' || raw === 'leave' || raw === 'paid leave') normalized = 'Paid Leave';
        else if (raw === 'a' || raw === 'absent') normalized = 'Absent';
        else if (raw === 'nr' || raw === 'no reliever') normalized = 'NR';
        else if (raw === 'half day' || raw === 'p1/2' || raw === 'p½') normalized = 'Half Day';

        if (normalized !== log.status) {
          await Attendance.findByIdAndUpdate(log._id, { status: normalized });
          normalizedStatusCount++;
        }
      }

      return res.json({
        success: true,
        message: 'Reconciliation completed',
        data: {
          mergedCount,
          deletedFragmentsCount,
          halfDutyAdjustedCount,
          normalizedStatusCount
        }
      });
    } catch (err) {
      console.error('cleanReconcileAttendance error:', err);
      return res.status(500).json({ success: false, message: err.message });
    }
  },
  healGeoAttendance: async (req, res) => {
    try {
      const autoEndScheduler = require('../utils/autoEndScheduler');
      const conn = req.tenantModels?.Attendance?.db;
      if (!conn) {
        return res.status(500).json({ success: false, message: 'Database connection not available' });
      }
      const updatedCount = await autoEndScheduler.healMissingAttendanceGeo(conn, req.tenantDbName, req.io);
      res.json({
        success: true,
        message: `Healed coordinates for ${updatedCount} attendance record(s)`,
        updatedCount,
      });
    } catch (err) {
      console.error('healGeoAttendance error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },
  deleteAttendance: async (req, res) => {
    try {
      const { Attendance } = req.tenantModels;
      if (req.params.id === 'cleanup') {
        const result = await Attendance.deleteMany({
          dutyEnd: { $ne: null },
          hoursWorked: { $lt: 2 }
        });
        return res.json({
          success: true,
          message: `Cleaned database: deleted ${result.deletedCount} completed attendance records with less than 2 hours worked.`
        });
      }
      const record = await Attendance.findByIdAndDelete(req.params.id);
      if (!record) {
        return res.status(404).json({ success: false, message: 'Attendance record not found' });
      }
      const emit = require('../utils/socketEmitter');
      emit(req, 'attendance:deleted', { id: req.params.id });
      if (req.io && req.tenantDbName) {
        req.io.to(req.tenantDbName).emit('attendance:active_updated');
      }
      res.json({ success: true, message: 'Attendance record deleted' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  updateAttendance: async (req, res) => {
    try {
      const { Attendance } = req.tenantModels;
      const record = await Attendance.findById(req.params.id);
      if (!record) {
        console.log('🔴 [updateAttendance] Record not found:', req.params.id);
        return res.status(404).json({ success: false, message: 'Attendance record not found' });
      }

      // Exemption check: ONLY Admins are exempt from GPS tracking. Registered users / workers MUST be tracked!
      const recordRole = (record.role || '').toLowerCase();
      const isAdminRole = ['corpadmin', 'useradmin', 'admin'].includes(recordRole);
      const isExemptUser = isAdminRole;

      const allowed = [
        'forcedOff',
        'forcedOffReason',
        'status',
        'rate',
        'geoHistory',
        'emergencyOff',
        'emergencyReason',
        'emergencyByUser',
        'shiftCode',
        'shiftType',
        'shiftPeriod',
        'dutyEnd',
        'dailyRate',
        'dailyEarn',
        'siteLat',
        'siteLong',
        'startLat',
        'startLong',
        'penaltyImposed',
        'penaltyDeducted',
        'penaltyWaivedOff',
        'violationType',
        'penaltyReason',
        'penaltyApprovedBy',
        'penaltyMediaUrl',
        'penaltyMedia',
      ];
      const update = {};
      allowed.forEach((k) => {
        if (req.body[k] !== undefined) update[k] = req.body[k];
      });

      // Filter geoHistory out of update and push if exempt
      if (isExemptUser) {
        if (update.geoHistory) delete update.geoHistory;
        if (req.body.$push && req.body.$push.geoHistory) {
          delete req.body.$push.geoHistory;
        }
      }

      // Proximity resolver for ticks in push — runs ASYNC after save (Phase 1)
      // Ticks are saved immediately with raw address; address is enriched in background.

      // Auto-calculate hours worked and daily earn on duty end
      let newlyEnded = false;
      if (update.dutyEnd) {
        if (!record.dutyEnd) newlyEnded = true;

        if (record.dutyStart) {
          const hrs = (new Date(update.dutyEnd) - new Date(record.dutyStart)) / 3600000;
          update.hoursWorked = parseFloat(Math.max(0, hrs).toFixed(2));

          const standardHours = record.shiftHours || record.shiftLockHours || 8;
          const usedRate = update.dailyRate || record.dailyRate || record.rate || 0;
          update.dailyEarn = parseFloat(
            ((update.hoursWorked / standardHours) * usedRate).toFixed(2)
          );
        }
      }

      // 🔐 Permission Check: If salary is posted, only Admin/CorpAdmin can change rate
      if (record.isPosted && req.body.rate !== undefined && record.rate !== req.body.rate) {
        const role = req.user?.userRole;
        if (!['CorpAdmin', 'userAdmin'].includes(role)) {
          console.log('🔴 [updateAttendance] Forbidden. Role:', role);
          return res.status(403).json({
            success: false,
            message: 'Only CorpAdmin or userAdmin can modify the rate after salary is posted.',
          });
        }
      }

      // Apply manual updates
      Object.assign(record, update);

      // Apply $push if present
      let emittedGeoUpdate = null;
      if (req.body.$push) {
        for (const key in req.body.$push) {
          if (Array.isArray(record[key])) {
            const pushData = req.body.$push[key];
            if (pushData && pushData.$each && Array.isArray(pushData.$each)) {
              record[key].push(...pushData.$each);
              if (key === 'geoHistory') emittedGeoUpdate = pushData.$each;
            } else {
              record[key].push(pushData);
              if (key === 'geoHistory') emittedGeoUpdate = pushData;
            }
          }
        }
      }

      // Keep latest coordinates on the record for fast lookup & real-time map marker
      if (emittedGeoUpdate) {
        const lastTick = Array.isArray(emittedGeoUpdate) ? emittedGeoUpdate[emittedGeoUpdate.length - 1] : emittedGeoUpdate;
        if (lastTick && (lastTick.lat !== undefined || lastTick.latitude !== undefined)) {
          record.lat = Number(lastTick.lat ?? lastTick.latitude);
          record.long = Number(lastTick.long ?? lastTick.longitude);
        }
      }

      await record.save();

      if (emittedGeoUpdate) {
        req.io.to(req.tenantDbName).emit('attendance:geo_update', {
          attendanceId: record._id,
          employeeId: record.employeeId,
          workerId: record.employeeId,
          tick: emittedGeoUpdate,
        });
      }

      if (update.dutyEnd && newlyEnded) {
        req.io.to(req.tenantDbName).emit('attendance:duty_off', {
          employeeId: record.employeeId,
          attendanceId: record._id,
          hoursWorked: record.hoursWorked,
        });
      }

      const emit = require('../utils/socketEmitter');
      emit(req, 'attendance:updated', { data: record });
      if (req.io && req.tenantDbName) {
        req.io.to(req.tenantDbName).emit('attendance:active_updated');
      }

      console.log('🟢 [updateAttendance] Saved successfully:', record._id);
      const resData = record.toObject ? record.toObject() : { ...record };
      if (Array.isArray(resData.geoHistory) && resData.geoHistory.length > 1) {
        resData.geoHistory = [resData.geoHistory[resData.geoHistory.length - 1]];
      }
      res.json({ success: true, data: resData });
    } catch (err) {
      console.error('🔴 [updateAttendance] Error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },
  getRateLookup: async (req, res) => {
    try {
      const { Attendance } = req.tenantModels;
      const { employeeId, leadId } = req.query;
      if (!employeeId || !leadId) {
        return res.status(400).json({ success: false, message: 'employeeId and leadId required' });
      }
      const last = await Attendance.findOne({ employeeId, leadId, rate: { $gt: 0 } })
        .sort({ createdAt: -1 })
        .select('rate')
        .lean();
      res.json({ success: true, rate: last?.rate || null });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  getActiveAttendance: async (req, res) => {
    try {
      const { Attendance, Employees } = req.tenantModels;
      const { employeeId } = req.query;
      if (!employeeId)
        return res.status(400).json({ success: false, message: 'employeeId required' });

      const queryId = mongoose.isValidObjectId(employeeId)
        ? new mongoose.Types.ObjectId(employeeId)
        : employeeId;

      const userMaster = require('../models/userMaster');
      let userDoc = await userMaster.findById(queryId).lean();
      let employeeDoc = await Employees.findById(queryId).lean();

      if (userDoc && !employeeDoc) {
        employeeDoc = await Employees.findOne({
          $or: [
            { user_id: userDoc._id },
            { mobile: userDoc.mobile || userDoc.userMobile || userDoc.username },
            { email: userDoc.email },
          ].filter((q) => q.user_id || q.mobile || q.email),
        }).lean();
      } else if (employeeDoc && !userDoc) {
        userDoc = await userMaster
          .findOne({
            $or: [
              { _id: employeeDoc.user_id },
              { mobile: employeeDoc.mobile },
              { email: employeeDoc.email },
            ].filter((q) => q._id || q.mobile || q.email),
          })
          .lean();
      }

      let emp = null;
      if (employeeDoc) emp = { ...employeeDoc };
      if (userDoc) emp = { ...emp, ...userDoc };

      const linkedIds = [queryId];
      if (emp?.user_id) linkedIds.push(new mongoose.Types.ObjectId(emp.user_id));
      if (emp?._id && String(emp._id) !== String(queryId)) linkedIds.push(emp._id);

      // Find an open session (dutyEnd not exists or null) using any linked IDs
      const active = await Attendance.findOne({
        employeeId: { $in: linkedIds },
        $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
      })
        .sort({ dutyStart: -1 })
        .lean();

      res.json({ success: true, data: active || null });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  toggleAttendance: async (req, res) => {
    try {
      const { Attendance, Employees } = req.tenantModels;
      // Phase 2a: ensure unique index exists for this tenant
      ensureAttendanceIndex(Attendance).catch(() => {});
      const {
        employeeId,
        type,
        lat,
        long,
        address,
        shiftCode,
        shiftType,
        shiftPeriod,
        shiftLockHours,
        startTime,
        site_name,
        siteId,
        leadId,
        forcedOff,
        forcedOffReason,
        emergencyOff,
        emergencyReason,
      } = req.body;

      if (!employeeId || !type)
        return res.status(400).json({ success: false, message: 'Missing params' });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const queryId = mongoose.isValidObjectId(employeeId)
        ? new mongoose.Types.ObjectId(employeeId)
        : employeeId;

      // Find open session (not necessarily today — shift C and E can span midnight)
      // 1. Identify all possible IDs for this employee (Self-sync check)
      const userMaster = require('../models/userMaster');
      let userDoc = await userMaster.findById(queryId).lean();
      let employeeDoc = await Employees.findById(queryId).lean();

      if (userDoc && !employeeDoc) {
        employeeDoc = await Employees.findOne({
          $or: [
            { user_id: userDoc._id },
            { mobile: userDoc.mobile || userDoc.userMobile || userDoc.username },
            { email: userDoc.email },
          ].filter((q) => q.user_id || q.mobile || q.email),
        }).lean();
      } else if (employeeDoc && !userDoc) {
        userDoc = await userMaster
          .findOne({
            $or: [
              { _id: employeeDoc.user_id },
              { mobile: employeeDoc.mobile },
              { email: employeeDoc.email },
            ].filter((q) => q._id || q.mobile || q.email),
          })
          .lean();
      }

      let emp = null;
      let isWorker = false;
      if (employeeDoc) {
        emp = { ...employeeDoc };
        isWorker = true;
      }
      if (userDoc) {
        emp = { ...emp, ...userDoc };
        if (String(queryId) === String(userDoc._id)) {
          isWorker = false;
        }
      }

      let linkedUser = userDoc || null;

      const checkRole = (
        emp?.role ||
        emp?.userRole ||
        (linkedUser && (linkedUser.role || linkedUser.userRole)) ||
        ''
      ).toLowerCase();
      const isAdminRole = ['corpadmin', 'useradmin', 'admin'].includes(checkRole);
      const isExemptUser = isAdminRole;

      if (type === 'ON') {
        const todayStr = new Date().toISOString().slice(0, 10);
        const { SiteRoster, SiteRosterHolidays } = req.tenantModels || {};
        const RosterModel = SiteRoster || SiteRosterHolidays;
        const effectiveEmpId = isWorker ? String(emp?._id || queryId) : String(queryId);
        const targetSiteId = leadId || siteId;
        const todayStartUtc = new Date();
        todayStartUtc.setHours(0, 0, 0, 0);
        const todayEndUtc = new Date();
        todayEndUtc.setHours(23, 59, 59, 999);

        // 1. Check if another worker was assigned as single-day replacement for this worker today
        const isCoveredToday = await Attendance.findOne({
          'leaveCoverage.originalWorkerId': effectiveEmpId,
          date: { $gte: todayStartUtc, $lte: todayEndUtc },
          'leaveCoverage.isCoveringForLeave': true,
        }).lean();

        if (isCoveredToday) {
          return res.status(403).json({
            success: false,
            onLeave: true,
            message: 'Duty cannot be started: You are on leave today and replacement worker has been assigned for today. Roster will resume tomorrow.',
          });
        }

        if (RosterModel && targetSiteId) {
          const rosterDoc = await RosterModel.findOne({
            $or: [
              { siteId: targetSiteId },
              { 'shifts.workers.workerId': effectiveEmpId },
            ],
          }).lean();

          if (rosterDoc && Array.isArray(rosterDoc.holidays)) {
            // 2. Site-wide closed or national/festival holiday
            const siteOff = rosterDoc.holidays.find(
              (h) => h.date === todayStr && (!h.scope || h.scope === 'site') && ['NationalHoliday', 'FestivalHoliday', 'SiteClosed'].includes(h.type)
            );
            if (siteOff) {
              return res.status(403).json({
                success: false,
                isHoliday: true,
                message: `Site is closed today for ${siteOff.remark || siteOff.type}. Duty cannot be started.`,
              });
            }

            // 3. Worker-specific leave or admin-assigned off
            const workerLeave = rosterDoc.holidays.find(
              (h) =>
                h.date === todayStr &&
                (String(h.workerId) === effectiveEmpId || String(h.workerName || '').toLowerCase() === String(emp?.name || emp?.userDisplayName || '').toLowerCase()) &&
                ['SickLeave', 'CasualLeave', 'UnpaidLeave', 'WeeklyRest'].includes(h.type)
            );
            if (workerLeave) {
              return res.status(403).json({
                success: false,
                onLeave: true,
                message: `You are marked on ${workerLeave.type === 'WeeklyRest' ? 'Rest Day' : workerLeave.type} for today (${todayStr}). Duty start is blocked. Roster will resume tomorrow.`,
              });
            }
          }

          // 4. Check worker weeklyRestDay in roster shift (ONLY if explicitly set by admin - NO default rest day!)
          if (rosterDoc && Array.isArray(rosterDoc.shifts)) {
            const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const todayDayName = daysOfWeek[new Date().getDay()];
            for (const sh of rosterDoc.shifts) {
              const matchedWorker = (sh.workers || []).find((w) => String(w.workerId) === effectiveEmpId);
              if (matchedWorker) {
                const assignedRestStr = (matchedWorker.weeklyRestDay || '').trim();
                const assignedExempt = Array.isArray(matchedWorker.exemptDays) ? matchedWorker.exemptDays : [];
                if (assignedRestStr || assignedExempt.length > 0) {
                  const restDays = [
                    ...assignedExempt,
                    ...(assignedRestStr ? assignedRestStr.split(',').map((d) => d.trim()) : []),
                  ].filter(Boolean);
                  if (restDays.includes(todayDayName)) {
                    return res.status(403).json({
                      success: false,
                      isRestDay: true,
                      message: `Today (${todayDayName}) is your assigned Weekly Rest Day. Duty start is not scheduled.`,
                    });
                  }
                }
              }
            }
          }
        }
      }

      if (type === 'ON' && emp && isWorker && !emp.shiftGroupName) {
        // Find employee document to update
        const employeeDoc = await Employees.findOne({
          $or: [
            { _id: emp._id },
            { user_id: emp.user_id || emp._id },
            { mobile: emp.mobile || emp.userMobile },
          ].filter((q) => q._id || q.user_id || q.mobile),
        });
        if (employeeDoc) {
          const targetGroupName =
            shiftType === '12hr' || ['Day', 'Night12'].includes(shiftPeriod) ? 'DaNi' : 'MANG';
          const targetSelectedShift = shiftCode || (targetGroupName === 'DaNi' ? 'D' : 'G');

          let targetShiftName = shiftPeriod || 'General';
          if (targetShiftName === 'Night12') {
            targetShiftName = 'Night';
          }
          let targetShiftStartTime = '08:00';
          if (targetGroupName === 'DaNi') {
            if (targetSelectedShift === 'N2' || targetShiftName === 'Night') {
              targetShiftStartTime = '18:00';
            } else {
              targetShiftStartTime = '06:00';
            }
          } else {
            if (targetSelectedShift === 'M' || targetShiftName === 'Morning') {
              targetShiftStartTime = '06:00';
            } else if (targetSelectedShift === 'A' || targetShiftName === 'Afternoon') {
              targetShiftStartTime = '14:00';
            } else if (targetSelectedShift === 'N' || targetShiftName === 'Night') {
              targetShiftStartTime = '22:00';
            } else {
              targetShiftStartTime = '08:00';
            }
          }
          const targetShiftHours = shiftLockHours || (targetGroupName === 'DaNi' ? 12 : 8);

          employeeDoc.shiftGroupName = targetGroupName;
          employeeDoc.selectedShift = targetSelectedShift;

          let activeHistoryEntry = employeeDoc.employmentHistory.find((h) => h.active);
          if (activeHistoryEntry) {
            activeHistoryEntry.groupName = targetGroupName;
            activeHistoryEntry.shiftName = targetShiftName;
            activeHistoryEntry.shiftStartTime = targetShiftStartTime;
            activeHistoryEntry.shiftHours = targetShiftHours;
          } else {
            employeeDoc.employmentHistory.push({
              joinDate: new Date(),
              daily_rate: employeeDoc.monthlyRate
                ? parseFloat((employeeDoc.monthlyRate / 30).toFixed(2))
                : 0,
              monthly_rate: employeeDoc.monthlyRate || 0,
              shiftStartTime: targetShiftStartTime,
              shiftHours: targetShiftHours,
              groupName: targetGroupName,
              shiftName: targetShiftName,
              active: true,
              notes: 'Auto-assigned on first attendance marking',
            });
          }

          await employeeDoc.save();
          emp = employeeDoc.toObject();
        }
      }

      const linkedIds = [queryId];
      if (emp?.user_id) linkedIds.push(new mongoose.Types.ObjectId(emp.user_id));
      if (emp?._id && String(emp._id) !== String(queryId)) linkedIds.push(emp._id);

      // 2. Find open session using any linked IDs
      let record = await Attendance.findOne({
        employeeId: { $in: linkedIds },
        $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
      }).sort({ dutyStart: -1 });

      if (type === 'ON') {
        if (record) {
          // Already ON duty — just return current session
          return res.json({ success: true, data: record, message: 'Already on duty' });
        }
        // Start new session
        const now = new Date();

        // (emp was already fetched above)
        if (!emp)
          return res.status(404).json({ success: false, message: 'Employee details not found' });

        // ── SITE-SHIFT RESOLUTION & SHIFT VALIDATION (toggleAttendance ON) ─────────────────────
        let toggleSiteShiftOverride = null;
        let toggleSiteShiftExcess = null;
        const toggleLeadId = leadId || siteId;

        let shiftStartTime = null;
        let lockHrs = 8;
        let finalShiftCode = shiftCode || 'G';

        const { Leads } = req.tenantModels;
        if (toggleLeadId && Leads) {
          const siteDoc = await Leads.findById(toggleLeadId)
            .select('siteShifts sender_name')
            .lean();
          const activeSiteShifts = (siteDoc?.siteShifts || []).filter((s) => s.active);

          if (siteDoc && activeSiteShifts.length === 0) {
            return res.status(422).json({
              success: false,
              noSiteShifts: true,
              message: `Site "${siteDoc.sender_name || 'this site'}" has no shift configuration. Please set up site shifts before starting duty.`,
              leadId: toggleLeadId,
            });
          }

          if (siteDoc && activeSiteShifts.length > 0) {
            // Find matched shift by shiftCode, or fall back to the one matching current time, or first active shift
            let matchedShift = activeSiteShifts.find((s) => s.shiftCode === finalShiftCode);
            if (!matchedShift) {
              const nowCheck = new Date();
              const kolkataOffset = 5.5 * 3600000;
              const nowKolkata = new Date(nowCheck.getTime() + kolkataOffset);
              const nowMinutes = nowKolkata.getUTCHours() * 60 + nowKolkata.getUTCMinutes();

              matchedShift = activeSiteShifts.find((s) => {
                if (!s.startTime) return false;
                const [sh, sm] = s.startTime.split(':').map(Number);
                const startMins = sh * 60 + sm;
                const endMins = (startMins + (s.durationHrs || 8) * 60) % 1440;
                if (startMins < endMins) {
                  return nowMinutes >= startMins && nowMinutes <= endMins;
                } else {
                  return nowMinutes >= startMins || nowMinutes <= endMins;
                }
              });
            }
            if (!matchedShift) {
              matchedShift = activeSiteShifts[0];
            }

            if (matchedShift) {
              finalShiftCode = matchedShift.shiftCode;
              shiftStartTime = matchedShift.startTime;
              lockHrs = matchedShift.durationHrs || 8;
              toggleSiteShiftOverride = {
                shiftCode: matchedShift.shiftCode,
                shiftPeriod: SHIFT_PERIOD_MAP[matchedShift.shiftName] || 'General',
                shiftType: matchedShift.durationHrs === 12 ? '12hr' : '8hr',
                shiftLockHours: matchedShift.durationHrs || 8,
                startTime: matchedShift.startTime,
                groupName: matchedShift.groupName || 'MANG',
                billRate: matchedShift.billRate || 0,
                salaryRate: matchedShift.salaryRate || 0,
              };

              // Per-slot capacity check
              const activeInSlot = await Attendance.countDocuments({
                leadId: mongoose.isValidObjectId(toggleLeadId)
                  ? new mongoose.Types.ObjectId(toggleLeadId)
                  : toggleLeadId,
                shiftCode: matchedShift.shiftCode,
                $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
              });
              if (activeInSlot >= (matchedShift.workerSlots || 1)) {
                toggleSiteShiftExcess = {
                  shiftCode: matchedShift.shiftCode,
                  shiftName: matchedShift.shiftName,
                  workerSlots: matchedShift.workerSlots || 1,
                  activeNow: activeInSlot,
                  message: `Shift ${matchedShift.shiftName} (${matchedShift.shiftCode}) at "${siteDoc.sender_name}" already has ${activeInSlot}/${matchedShift.workerSlots || 1} worker(s). This is an excess duty.`,
                };
              }
              // Phase 2b: store workerSlots for auto-end trigger after record save
              req._matchedSiteShiftSlots = matchedShift.workerSlots || 1;
            }
          }
        }
        // ─────────────────────────────────────────────────────────────────────

        // Fetch linked userMaster profile if this is an employee record linked to a user
        let linkedUser = null;
        if (emp.user_id) {
          const userMaster = require('../models/userMaster');
          linkedUser = await userMaster.findById(emp.user_id).lean();
        }

        let isSpecialAction = false;
        const linkedRole =
          emp.role ||
          emp.userRole ||
          (linkedUser && (linkedUser.role || linkedUser.userRole)) ||
          '';
        if (['CorpAdmin', 'userAdmin'].includes(linkedRole)) {
          isSpecialAction = true;
        }

        let diffMins = 0;
        let standardStart = now;

        // Fallback to employee's assigned startTime from frontend if site doesn't have shift config
        if (!shiftStartTime && startTime) {
          shiftStartTime = startTime;
        }

        if (shiftStartTime && !isSpecialAction) {
          const [h, m] = shiftStartTime.split(':').map(Number);

          // Asia/Kolkata is always UTC+05:30 (offset of 5.5 hours = 19,800,000 ms)
          const kolkataOffset = 5.5 * 3600000;
          const nowKolkata = new Date(now.getTime() + kolkataOffset);

          // Construct target shift times shifted by the same Kolkata offset
          const todayShift = new Date(nowKolkata);
          todayShift.setUTCHours(h, m, 0, 0);

          const yesterdayShift = new Date(todayShift.getTime() - 24 * 3600000);
          const tomorrowShift = new Date(todayShift.getTime() + 24 * 3600000);

          const diffs = [
            { diff: (nowKolkata.getTime() - todayShift.getTime()) / 60000, target: todayShift },
            {
              diff: (nowKolkata.getTime() - yesterdayShift.getTime()) / 60000,
              target: yesterdayShift,
            },
            {
              diff: (nowKolkata.getTime() - tomorrowShift.getTime()) / 60000,
              target: tomorrowShift,
            },
          ];

          // Filter out future shifts that are more than 120 minutes in the future to prevent wrong assignment on late check-in
          const validDiffs = diffs.filter((d) => d.diff >= -120);
          validDiffs.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
          const nearestShift = validDiffs[0] || diffs[0];
          diffMins = nearestShift.diff;

          // The time difference between the nearest shift start and current time
          const diffMs = nearestShift.target.getTime() - nowKolkata.getTime();
          standardStart = new Date(now.getTime() + diffMs);

          const displayName = emp.name || emp.userDisplayName || 'User';

          if (diffMins < -15) {
            return res.status(403).json({
              success: false,
              tooEarly: true,
              message: `Too early to start duty. Shift starts at ${shiftStartTime}. Attendance can only be marked starting 15 minutes before shift start.`,
            });
          }

          if (diffMins > 60) {
            if (req.body.requestPermission) {
              const { Messages } = req.tenantModels;
              if (Messages) {
                const msg = new Messages({
                  senderName: displayName,
                  senderId: queryId,
                  text: `⚠️ Request to start late duty from ${displayName}. Shift started at ${shiftStartTime}.`,
                  type: 'text',
                  isOneToOne: false,
                  status: 'unseen',
                });
                await msg.save();
                req.io.to(req.tenantDbName).emit('newMessage', msg);
              }

              req.io.to(req.tenantDbName).emit('admin:broadcast', {
                id: new mongoose.Types.ObjectId().toString(),
                title: '⚠️ Late Start Request',
                message: `Employee ${displayName} requested to start duty late. Shift started at ${shiftStartTime}.`,
                priority: 'normal',
                targetRoles: ['CorpAdmin'],
                sentBy: displayName,
                sentByRole: 'Employee',
                at: now.toISOString(),
              });

              return res.json({
                success: true,
                isPermissionRequest: true,
                message: `Request to start duty late has been sent to Admin via chatroom.`,
              });
            }
            return res.status(403).json({
              success: false,
              tooLate: true,
              message: `Too late to start duty. Shift started at ${shiftStartTime}. Please request permission from Admin.`,
            });
          }
        }

        const activeShift =
          (emp.employmentHistory || []).find((h) => h.active) ||
          (emp.employmentHistory || []).slice(-1)[0];
        const currentRate = activeShift?.daily_rate || 0;

        if (record)
          return res.status(400).json({ success: false, message: 'Duty already started' });

        const scheduledEnd = new Date(standardStart.getTime() + lockHrs * 3600000);
        const fetchedMonthlyRate = emp.monthlyRate || 0;
        const fetchedDailyRate = parseFloat((fetchedMonthlyRate / 30).toFixed(2));

        let userShiftName = emp.dutyShift && emp.dutyShift.shiftName;
        if (!userShiftName && linkedUser?.dutyShift?.shiftName) {
          userShiftName = linkedUser.dutyShift.shiftName;
        }

        let defaultShiftCode = 'G';
        if (userShiftName) {
          if (userShiftName === 'Night2') defaultShiftCode = 'N2';
          else if (userShiftName === 'Night1' || userShiftName === 'Night') defaultShiftCode = 'N';
          else defaultShiftCode = userShiftName.substring(0, 1);
        } else if (activeShift?.shiftName) {
          defaultShiftCode =
            activeShift.shiftName === 'Night12' ? 'N2' : activeShift.shiftName.substring(0, 1);
        }

        const normalizedShiftCode = SHIFT_CODE_MAP[finalShiftCode] || finalShiftCode || 'G';

        let finalShiftGroupName = emp.shiftGroupName || (emp.dutyShift && emp.dutyShift.groupName);
        if (!finalShiftGroupName && linkedUser?.dutyShift?.groupName) {
          finalShiftGroupName = linkedUser.dutyShift.groupName;
        }
        if (!finalShiftGroupName) finalShiftGroupName = 'MANG';

        let finalLat = lat;
        let finalLong = long;
        let finalSiteName = site_name || 'HQ/Remote';
        let siteLat = null;
        let siteLong = null;
        let startLat = lat || null;
        let startLong = long || null;

        const targetLeadId = leadId || siteId;
        if (targetLeadId && Leads) {
          const site = await Leads.findById(targetLeadId).lean();
          if (site) {
            const rawSiteLat = site.location?.lat ?? site.lat ?? site.latitude;
            const rawSiteLong = site.location?.long ?? site.long ?? site.longitude;
            if (rawSiteLat !== undefined && rawSiteLat !== null && rawSiteLong !== undefined && rawSiteLong !== null) {
              siteLat = Number(rawSiteLat);
              siteLong = Number(rawSiteLong);
            }

            const isSelf = Boolean(
              String(req.user._id || req.user.userId) === String(queryId) ||
              String(req.user._id || req.user.userId) === String(emp?.user_id || emp?._id)
            );

            if (siteLat !== null && siteLong !== null && !isNaN(siteLat) && !isNaN(siteLong)) {
              if (!isSelf) {
                // 🚀 Started by supervisor on behalf of worker -> use site coordinates as default if supervisor doesn't provide them
                if (!startLat) startLat = siteLat;
                if (!startLong) startLong = siteLong;
                finalLat = siteLat;
                finalLong = siteLong;
                finalSiteName = site.sender_name || finalSiteName;
              } else {
                // 📱 Self-marking on own device (markedByDevice: true) -> STRICT GEOFENCING ENFORCED
                if (!lat || !long) {
                  return res.status(400).json({
                    success: false,
                    message: "Location services must be enabled to mark your attendance."
                  });
                } else {
                  const dist = getDistanceMetres(Number(lat), Number(long), siteLat, siteLong);
                  const geofenceRadius = Number(site.geofenceRadiusMeters || site.geofenceRadius || site.location?.geofenceRadius) || 100;
                  
                  if (dist > geofenceRadius) {
                    return res.status(400).json({
                      success: false,
                      message: `You are not at selected site (${Math.round(dist)}m away, allowed: ${geofenceRadius}m). Reach your selected site or select site where you are available.`,
                      notAtSite: true,
                      distanceMeters: Math.round(dist),
                      geofenceRadiusMeters: geofenceRadius,
                    });
                  }
                  
                  finalLat = Number(lat);
                  finalLong = Number(long);
                  finalSiteName = site.sender_name || finalSiteName;
                }
              }
            }
          }
        }

        const finalGeoHistory = isExemptUser
          ? []
          : [
              {
                lat: finalLat,
                long: finalLong,
                address: address || '',  // filled async below
                type: 'start',
                timestamp: now,
              },
            ];

        // Apply site-shift override (site always wins)
        const toggleFinalShiftCode =
          SHIFT_CODE_MAP[toggleSiteShiftOverride?.shiftCode || normalizedShiftCode] ||
          normalizedShiftCode ||
          'G';
        const toggleFinalLockHrs = toggleSiteShiftOverride?.shiftLockHours || lockHrs;
        const toggleFinalShiftType =
          toggleSiteShiftOverride?.shiftType || shiftType || (lockHrs === 12 ? '12hr' : '8hr');
        const toggleFinalShiftPeriod =
          SHIFT_PERIOD_MAP[
            toggleSiteShiftOverride?.shiftPeriod ||
              shiftPeriod ||
              userShiftName ||
              activeShift?.shiftName ||
              'General'
          ] || 'General';
        const toggleFinalGroupName = toggleSiteShiftOverride?.groupName || finalShiftGroupName;
        const toggleFinalScheduledEnd = new Date(
          standardStart.getTime() + toggleFinalLockHrs * 3600000
        );

        record = new Attendance({
          employeeId: isWorker ? emp._id : queryId,
          employeeType: isWorker ? 'Employees' : 'userMaster',
          startLat,
          startLong,
          siteLat,
          siteLong,
          role: emp.role || emp.userRole || 'project',
          date: now,
          dutyStartScheduled: standardStart,
          dutyStart: now,
          dutyEndScheduled: toggleFinalScheduledEnd,
          shiftCode: toggleFinalShiftCode,
          shiftType: toggleFinalShiftType,
          shiftPeriod: toggleFinalShiftPeriod,
          shiftGroupName: toggleFinalGroupName,
          shiftHours: toggleFinalLockHrs,
          shiftLockHours: toggleFinalLockHrs,
          monthlyRate: (toggleSiteShiftOverride?.salaryRate || fetchedDailyRate || currentRate || 0) * 30,
          dailyRate: toggleSiteShiftOverride?.salaryRate || fetchedDailyRate || currentRate || 0,
          dailyEarn: toggleSiteShiftOverride?.salaryRate || fetchedDailyRate || currentRate || 0,
          rate: toggleSiteShiftOverride?.salaryRate || fetchedDailyRate || currentRate || 0,
          geoHistory: finalGeoHistory,
          status: 'Present',
          site_name: finalSiteName,
          siteId: siteId || null,
          leadId: leadId || null,
          markedByDevice: String(req.user._id || req.user.userId) === String(queryId) || String(req.user._id || req.user.userId) === String(emp?.user_id || emp?._id),
          markedByUserName:
            (String(req.user._id || req.user.userId) === String(queryId) || String(req.user._id || req.user.userId) === String(emp?.user_id || emp?._id))
              ? req.body.userName || req.user?.userDisplayName || req.user?.name || 'Self'
              : req.user?.userDisplayName || req.user?.name || req.user?.mobile || 'Supervisor',
          isLate: shiftStartTime ? diffMins > 15 : false,
          remarks: shiftStartTime && diffMins > 15 ? 'On Duty-Late Coming' : undefined,
        });
        await record.save();

        // ── Async geocoding: patch geoHistory[0].address after response ─────
        if (!isExemptUser && finalLat && finalLong) {
          const _recId = record._id;
          const _Attendance = Attendance;
          const _Leads = Leads;
          const _rawAddr = address || '';
          setImmediate(async () => {
            try {
              const siteName = await resolveSiteNameForCoordinates(finalLat, finalLong, _Leads);
              if (siteName) {
                const enrichedAddr = formatAddressWithSite(_rawAddr, siteName);
                await _Attendance.updateOne(
                  { _id: _recId, 'geoHistory.0.address': _rawAddr },
                  { $set: { 'geoHistory.0.address': enrichedAddr } }
                );
              }
            } catch (e) { /* non-critical, fail silently */ }
          });
        }
        // ────────────────────────────────────────────────────────────────────

        req.io.to(req.tenantDbName).emit('attendance:duty_on', {
          employeeId,
          attendanceId: record._id,
          shiftCode: toggleFinalShiftCode,
          shiftPeriod: toggleFinalShiftPeriod,
        });

        // ── Phase 2b: Auto-end for single-worker shifts ─────────────────────
        const matchedShiftSlots = toggleSiteShiftOverride ? (
          // Re-read workerSlots from the site doc that was already resolved above
          (() => {
            try {
              const _msd = req._matchedSiteShift;
              return _msd?.workerSlots ?? null;
            } catch { return null; }
          })()
        ) : null;

        // Store matched shift on req for slot check — only auto-end if NOT self-marked by worker on own device
        const isSelfMarkedOnDevice = Boolean(
          record.markedByDevice ||
          String(req.user._id || req.user.userId) === String(queryId) ||
          String(req.user._id || req.user.userId) === String(emp?.user_id || emp?._id) ||
          emp?.employeeType === 'userMaster' ||
          isExemptUser
        );

        if (req._matchedSiteShiftSlots === 1 && record.dutyEndScheduled && !isSelfMarkedOnDevice) {
          autoEndScheduler.scheduleAutoEnd(
            record._id,
            record.dutyEndScheduled,
            Attendance,
            req.tenantDbName,
            req.io
          );
        }
        // ────────────────────────────────────────────────────────────────────

        // ── Phase 2c: Async reliever rotation suggestion ─────────────────────
        if (toggleSiteShiftOverride && (leadId || siteId)) {
          const _recId = record._id;
          const _Attendance = Attendance;
          const _siteId = leadId || siteId;
          const _group = toggleSiteShiftOverride.groupName || 'MANG';
          const _nextCode = relieverRotation.nextShiftCode(_group, toggleFinalShiftCode);
          if (_nextCode) {
            setImmediate(async () => {
              try {
                const suggestedId = await relieverRotation.resolveReliever(
                  { siteId: _siteId, shiftGroup: _group, targetShiftCode: _nextCode, date: new Date() },
                  { Attendance: _Attendance }
                );
                if (suggestedId) {
                  await _Attendance.updateOne({ _id: _recId }, { $set: { suggestedRelieverId: suggestedId } });
                }
              } catch (e) { /* non-critical */ }
            });
          }
        }
        // ────────────────────────────────────────────────────────────────────

        return res.json({
          success: true,
          data: record,
          message: 'Duty started',
          ...(toggleSiteShiftExcess ? { excessWarning: toggleSiteShiftExcess } : {}),
        });
      } else {
        // OFF
        if (!record)
          return res.status(404).json({ success: false, message: 'No active duty session found' });

        const now = new Date();
        const lockHrs = record.shiftLockHours || 8;
        const elapsedHrs = (now - record.dutyStart) / 3600000;

        let minRequiredHrs = lockHrs;
        if (lockHrs === 8) minRequiredHrs = 7;
        if (lockHrs === 12) minRequiredHrs = 11;

        const isLocked = elapsedHrs < minRequiredHrs;

        // Shift lock enforcement
        // Normalize role strings for case‑insensitive checks
        const requesterRole = (req.user?.userRole || '').toLowerCase();
        const employeeRole = (emp?.userRole || emp?.role || '').toLowerCase();
        const canOverride =
          ['corpadmin', 'project', 'useradmin'].includes(requesterRole) ||
          ['corpadmin', 'project', 'sales', 'finance', 'useradmin'].includes(employeeRole);

        if (isLocked && !forcedOff && !emergencyOff && !canOverride) {
          return res.status(403).json({
            success: false,
            locked: true,
            message: `Shift lock active. ${lockHrs}h shift not complete (${elapsedHrs.toFixed(1)}h elapsed). Contact supervisor to override.`,
            remainingHrs: parseFloat((minRequiredHrs - elapsedHrs).toFixed(2)),
          });
        }

        record.dutyEnd = now;
        if (!isExemptUser) {
          // Push end tick with raw address — enriched asynchronously below
          record.geoHistory.push({ lat, long, address: address || '', type: 'end', timestamp: now });
        }
        record.hoursWorked = parseFloat(Math.max(0, elapsedHrs).toFixed(2));
        const standardHours = record.shiftHours || record.shiftLockHours || 8;
        record.dailyEarn = parseFloat(
          ((record.hoursWorked / standardHours) * (record.dailyRate || 0)).toFixed(2)
        );

        if (forcedOff) {
          record.forcedOff = true;
          record.forcedOffReason = forcedOffReason || 'Manual override';
          // Phase 2b — Audit trail for bypasses
          if (isLocked || canOverride) {
            record.bypassedBy = req.user?.userDisplayName || req.user?.name || 'Supervisor';
            record.bypassRole = req.user?.userRole || 'unknown';
            record.originalLockExpiryAt = record.dutyEndScheduled || null;
          }
        }
        if (emergencyOff) {
          record.emergencyOff = true;
          record.emergencyReason = emergencyReason || 'Emergency shutdown';
          record.emergencyByUser = req.user?.userDisplayName || 'System';
          // Phase 2b — Audit trail for emergency bypass
          record.bypassedBy = req.user?.userDisplayName || req.user?.name || 'Supervisor';
          record.bypassRole = req.user?.userRole || 'unknown';
          record.originalLockExpiryAt = record.dutyEndScheduled || null;
        }

        // Phase 2b: Cancel any pending auto-end timer (worker clocked out manually)
        autoEndScheduler.cancelAutoEnd(record._id);

        await record.save();

        // ── Async geocoding: patch end tick address after response ──────────
        if (!isExemptUser && lat && long) {
          const _recId = record._id;
          const _Attendance = Attendance;
          const _Leads = req.tenantModels.Leads;
          const _endIdx = record.geoHistory.length - 1;
          const _rawAddr = address || '';
          setImmediate(async () => {
            try {
              const siteName = await resolveSiteNameForCoordinates(lat, long, _Leads);
              if (siteName) {
                const enrichedAddr = formatAddressWithSite(_rawAddr, siteName);
                await _Attendance.updateOne(
                  { _id: _recId },
                  { $set: { [`geoHistory.${_endIdx}.address`]: enrichedAddr } }
                );
              }
            } catch (e) { /* non-critical */ }
          });
        }
        // ────────────────────────────────────────────────────────────────────

        req.io.to(req.tenantDbName).emit('attendance:duty_off', {
          employeeId,
          attendanceId: record._id,
          hoursWorked: record.hoursWorked,
          emergencyOff: !!emergencyOff,
        });
        return res.json({ success: true, data: record, message: 'Duty ended' });
      }
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * 🆘 Emergency End for a SINGLE employee
   * Authorized roles: CorpAdmin / Project / Admin only
   * Body: { employeeId, reason }
   */
  emergencyEndEmployee: async (req, res) => {
    try {
      const requesterRole = req.user?.userRole;
      if (!['CorpAdmin', 'Project', 'userAdmin'].includes(requesterRole)) {
        return res.status(403).json({
          success: false,
          message:
            'Access denied. Only Project Users, Admin and CorpAdmin can trigger emergency off for an employee.',
        });
      }

      const { Attendance } = req.tenantModels;
      const { employeeId, reason } = req.body;
      if (!employeeId)
        return res.status(400).json({ success: false, message: 'employeeId is required' });

      const now = new Date();
      const byUser = req.user?.userDisplayName || 'System';
      const queryId = mongoose.isValidObjectId(employeeId)
        ? new mongoose.Types.ObjectId(employeeId)
        : employeeId;

      // Find the open session for this employee
      const record = await Attendance.findOne({
        employeeId: queryId,
        $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
      });

      if (!record) {
        return res
          .status(404)
          .json({ success: false, message: 'No active duty session found for this employee' });
      }

      const elapsedHrs = (now - record.dutyStart) / 3600000;
      record.dutyEnd = now;
      record.emergencyOff = true;
      record.emergencyReason = reason || 'Emergency end by supervisor';
      record.emergencyByUser = byUser;
      record.forcedOff = true;
      record.forcedOffReason = 'Emergency End by Supervisor';
      record.hoursWorked = parseFloat(Math.max(0, elapsedHrs).toFixed(2));
      // Phase 2b — Audit trail for emergency bypass
      record.bypassedBy = byUser;
      record.bypassRole = req.user?.userRole || 'unknown';
      record.originalLockExpiryAt = record.dutyEndScheduled || null;
      // Phase 2b: Cancel any pending auto-end timer
      autoEndScheduler.cancelAutoEnd(record._id);
      await record.save();

      // Notify the specific employee via Socket.IO
      req.io.to(req.tenantDbName).emit('attendance:emergency_end', {
        employeeId: String(employeeId),
        attendanceId: record._id,
        reason: record.emergencyReason,
        byUser,
        at: now.toISOString(),
      });

      res.json({ success: true, message: `Emergency duty end applied for employee`, data: record });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /**
   * 🔄 Continue Next Shift (Double Shift)
   * Closes current shift attendance, opens a NEW attendance record for the next shift.
   * Sends a double-shift notification to CorpAdmin / Admin / Project users.
   * Body: { employeeId, nextShiftCode, nextShiftType, nextShiftPeriod, lat, long, address, site_name, siteId, leadId }
   */
  continueShift: async (req, res) => {
    try {
      const { Attendance } = req.tenantModels;
      const {
        employeeId,
        nextShiftCode,
        nextShiftType,
        nextShiftPeriod,
        lat,
        long,
        address,
        site_name,
        siteId,
        leadId,
      } = req.body;

      if (!employeeId || !nextShiftCode) {
        return res
          .status(400)
          .json({ success: false, message: 'employeeId and nextShiftCode are required' });
      }

      const queryId = mongoose.isValidObjectId(employeeId)
        ? new mongoose.Types.ObjectId(employeeId)
        : employeeId;

      // 1. Find current open session
      const current = await Attendance.findOne({
        employeeId: queryId,
        $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
      }).sort({ dutyStart: -1 });

      if (!current) {
        return res
          .status(404)
          .json({ success: false, message: 'No active duty session to continue from' });
      }

      const now = new Date();
      const lockHrs = current.shiftLockHours || 8;
      const elapsedHrs = (now - current.dutyStart) / 3600000;

      // Enforce: current shift must be at least complete (lock period elapsed)
      if (elapsedHrs < lockHrs) {
        return res.status(403).json({
          success: false,
          locked: true,
          message: `Current shift ${current.shiftCode} not yet complete. ${(lockHrs - elapsedHrs).toFixed(1)}h remaining.`,
          remainingHrs: parseFloat((lockHrs - elapsedHrs).toFixed(2)),
        });
      }

      // 🛡️ Guard: General shift (G) is STRICTLY EXEMPT from rotational switching and continuous double duty
      const curCode = String(current.shiftCode || '').trim().toUpperCase();
      if (curCode === 'G' || curCode === 'GENERAL') {
        return res.status(403).json({
          success: false,
          exempt: true,
          message: 'General shift (G) is strictly exempt from shift switching and continuous double duty.',
        });
      }

      // Resolve exemption
      const { Employees, Leads } = req.tenantModels;
      const userMaster = require('../models/userMaster');
      let userDoc = await userMaster.findById(queryId).lean();
      let employeeDoc = await Employees.findById(queryId).lean();

      if (userDoc && !employeeDoc) {
        employeeDoc = await Employees.findOne({
          $or: [
            { user_id: userDoc._id },
            { mobile: userDoc.mobile || userDoc.userMobile || userDoc.username },
            { email: userDoc.email },
          ].filter((q) => q.user_id || q.mobile || q.email),
        }).lean();
      } else if (employeeDoc && !userDoc) {
        userDoc = await userMaster
          .findOne({
            $or: [
              { _id: employeeDoc.user_id },
              { mobile: employeeDoc.mobile },
              { email: employeeDoc.email },
            ].filter((q) => q._id || q.mobile || q.email),
          })
          .lean();
      }

      let emp = null;
      let isWorker = false;
      if (employeeDoc) {
        emp = { ...employeeDoc };
        isWorker = true;
      }
      if (userDoc) {
        emp = { ...emp, ...userDoc };
        if (String(queryId) === String(userDoc._id)) {
          isWorker = false;
        }
      }
      let linkedUser = isWorker ? null : emp;
      if (isWorker && emp?.user_id) {
        linkedUser = await userMaster.findById(emp.user_id).lean();
      }
      const checkRole = (
        emp?.role ||
        emp?.userRole ||
        (linkedUser && (linkedUser.role || linkedUser.userRole)) ||
        ''
      ).toLowerCase();
      const isAdminRole = ['corpadmin', 'useradmin', 'admin'].includes(checkRole);
      const isExemptUser = isAdminRole;

      // 2. Close current shift
      current.dutyEnd = now;
      current.hoursWorked = parseFloat(elapsedHrs.toFixed(2));
      if (!isExemptUser) {
        // Push raw address — enriched asynchronously below
        current.geoHistory.push({ lat, long, address: address || '', type: 'end', timestamp: now });
      }
      await current.save();

      // ── Async geocoding: patch shift-end tick address ─────────────────────
      if (!isExemptUser && lat && long) {
        const _curId = current._id;
        const _AttendanceRef = Attendance;
        const _LeadsRef = Leads;
        const _endIdx = current.geoHistory.length - 1;
        const _rawAddr = address || '';
        setImmediate(async () => {
          try {
            const siteName = await resolveSiteNameForCoordinates(lat, long, _LeadsRef);
            if (siteName) {
              const enrichedAddr = formatAddressWithSite(_rawAddr, siteName);
              await _AttendanceRef.updateOne(
                { _id: _curId },
                { $set: { [`geoHistory.${_endIdx}.address`]: enrichedAddr } }
              );
            }
          } catch (e) { /* non-critical */ }
        });
      }
      // ───────────────────────────────────────────────────────────────────────

      // 3. Determine next shift lock hours from leads database
      // Enforce strict sequential rotation:
      // DaNi: D <-> N2
      // MANG: M -> A -> N -> M (G is strictly exempt)
      let expectedNextShiftCode = '';
      if (curCode === 'D' || curCode === 'DAY') expectedNextShiftCode = 'N2';
      else if (curCode === 'N2' || curCode === 'NIGHT' || curCode === 'NIGHT12') expectedNextShiftCode = 'D';
      else if (curCode === 'M' || curCode === 'MORNING') expectedNextShiftCode = 'A';
      else if (curCode === 'A' || curCode === 'AFTERNOON') expectedNextShiftCode = 'N';
      else if (curCode === 'N' || curCode === 'NIGHT8') expectedNextShiftCode = 'M';

      let targetReqCode = String(nextShiftCode || '').trim().toUpperCase();
      if (!targetReqCode || targetReqCode === 'CONTINUED') {
        targetReqCode = expectedNextShiftCode;
      }

      let nextLockHrs = nextShiftType === '12hr' ? 12 : 8;
      let finalNextShiftType = nextShiftType || '8hr';
      let finalNextShiftPeriod = SHIFT_PERIOD_MAP[nextShiftPeriod] || nextShiftPeriod || 'Morning';
      let nextRate = current.rate || 0;
      let finalNextShiftCode = targetReqCode || expectedNextShiftCode || 'D';

      const targetLeadId = leadId || siteId || current.leadId;
      if (targetLeadId && Leads) {
        const siteDoc = await Leads.findById(targetLeadId).select('siteShifts sender_name').lean();
        const activeSiteShifts = (siteDoc?.siteShifts || []).filter((s) => s.active);

        if (siteDoc && activeSiteShifts.length === 0) {
          return res.status(422).json({
            success: false,
            noSiteShifts: true,
            message: `Site "${siteDoc.sender_name || 'this site'}" has no shift configuration. Please set up site shifts before continuing duty.`,
            leadId: targetLeadId,
          });
        }

        const nextShift =
          activeSiteShifts.find((s) => s.shiftCode === targetReqCode) ||
          activeSiteShifts.find((s) => s.shiftCode === expectedNextShiftCode) ||
          activeSiteShifts.find((s) => s.shiftCode !== curCode && s.shiftCode !== 'G') ||
          activeSiteShifts[0];

        if (nextShift) {
          if (nextShift.shiftCode === 'G') {
            return res.status(422).json({
              success: false,
              exempt: true,
              message: 'General shift (G) is strictly exempt from double duty continuation.',
            });
          }
          finalNextShiftCode = nextShift.shiftCode;
          nextLockHrs = nextShift.durationHrs || nextLockHrs;
          finalNextShiftType = nextShift.durationHrs === 12 ? '12hr' : '8hr';
          finalNextShiftPeriod = SHIFT_PERIOD_MAP[nextShift.shiftName] || 'Morning';
          nextRate = nextShift.salaryRate || nextRate;
        }
      }
      const nextScheduledEnd = new Date(now.getTime() + nextLockHrs * 3600000);

      // 4. Create new attendance record for next shift (marked as double shift)
      const nextRecord = new Attendance({
        employeeId,
        employeeType: isWorker ? 'Employees' : 'userMaster',
        startLat: lat || null,
        startLong: long || null,
        siteLat: current.siteLat || null,
        siteLong: current.siteLong || null,
        date: now,
        dutyStartScheduled: now,
        dutyStart: now,
        dutyEndScheduled: nextScheduledEnd,
        shiftCode: SHIFT_CODE_MAP[finalNextShiftCode] || finalNextShiftCode || 'G',
        shiftType: finalNextShiftType,
        shiftPeriod: finalNextShiftPeriod,
        shiftLockHours: nextLockHrs,
        isDoubleShift: true,
        previousShiftId: current._id,
        doubleShiftNotified: true,
        geoHistory: isExemptUser
          ? []
          : [{ lat, long, address: address || '', type: 'start', timestamp: now }],  // enriched async
        status: 'Present',
        site_name: site_name || current.site_name || 'HQ/Remote',
        siteId: siteId || current.siteId || null,
        leadId: targetLeadId || null,
        rate: nextRate,
      });
      await nextRecord.save();

      // ── Async geocoding: patch new-shift start tick address ──────────────────
      if (!isExemptUser && lat && long) {
        const _nextId = nextRecord._id;
        const _AttendanceRef2 = Attendance;
        const _LeadsRef2 = Leads;
        const _rawAddr2 = address || '';
        setImmediate(async () => {
          try {
            const siteName = await resolveSiteNameForCoordinates(lat, long, _LeadsRef2);
            if (siteName) {
              const enrichedAddr = formatAddressWithSite(_rawAddr2, siteName);
              await _AttendanceRef2.updateOne(
                { _id: _nextId, 'geoHistory.0.address': _rawAddr2 },
                { $set: { 'geoHistory.0.address': enrichedAddr } }
              );
            }
          } catch (e) { /* non-critical */ }
        });
      }
      // ───────────────────────────────────────────────────────────────────────

      // 5. Broadcast double-shift notification to supervisors
      const notification = {
        type: 'double_shift',
        employeeId: String(employeeId),
        previousShiftCode: current.shiftCode,
        nextShiftCode: SHIFT_CODE_MAP[finalNextShiftCode] || finalNextShiftCode || 'G',
        attendanceId: nextRecord._id,
        at: now.toISOString(),
        message: `⚠️ Double Shift Alert: Employee continued into Shift ${finalNextShiftCode} after completing Shift ${current.shiftCode}.`,
      };
      req.io.to(req.tenantDbName).emit('attendance:double_shift', notification);
      // Also send as broadcast alert targeted at supervisors
      req.io.to(req.tenantDbName).emit('admin:broadcast', {
        id: new mongoose.Types.ObjectId().toString(),
        title: '⚠️ Double Shift Alert',
        message: notification.message,
        priority: 'urgent',
        targetRoles: ['CorpAdmin', 'userAdmin', 'Project'],
        sentBy: 'System',
        sentByRole: 'System',
        at: now.toISOString(),
      });

      res.json({
        success: true,
        message: `Shift ${current.shiftCode} closed. Shift ${finalNextShiftCode} started (Double Shift).`,
        closedShift: current,
        newShift: nextRecord,
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /** 📢 Send Broadcast Alert — CorpAdmin / Admin only */
  sendBroadcast: async (req, res) => {
    try {
      const requesterRole = req.user?.userRole;
      if (!['CorpAdmin', 'userAdmin'].includes(requesterRole)) {
        return res
          .status(403)
          .json({ success: false, message: 'Only CorpAdmin and Admin can send broadcasts.' });
      }

      const { title, message, priority, targetRoles } = req.body;
      if (!message || !message.trim()) {
        return res.status(400).json({ success: false, message: 'Message is required' });
      }

      const payload = {
        id: new mongoose.Types.ObjectId().toString(),
        title: title || 'Message from Management',
        message: message.trim(),
        priority: priority || 'normal', // 'normal' | 'urgent'
        targetRoles: targetRoles || [], // empty = all users
        sentBy: req.user?.userDisplayName || 'Admin',
        sentByRole: requesterRole,
        corporateName: req.user?.corporateName || '',
        at: new Date().toISOString(),
      };

      // Emit to all users in this tenant's room
      req.io.to(req.tenantDbName).emit('admin:broadcast', payload);

      res.json({ success: true, message: 'Broadcast sent successfully', data: payload });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  listActiveStaff: async (req, res) => {
    try {
      if (!req.tenantModels) {
        console.error('❌ [FAIL] req.tenantModels is MISSING');
        return res.status(500).json({ success: false, message: 'Tenant models not initialized' });
      }

      const { Attendance, Employees } = req.tenantModels;
      if (!Attendance) {
        console.error('❌ [FAIL] Attendance model is MISSING');
        return res
          .status(500)
          .json({ success: false, message: 'Attendance model missing on tenant' });
      }
      if (!Employees) {
        console.error('❌ [FAIL] Employees model is MISSING');
        return res
          .status(500)
          .json({ success: false, message: 'Employees model missing on tenant' });
      }

      const connState = Attendance.db?.readyState;
      if (connState !== 1) {
        console.error('❌ [FAIL] Database is NOT connected! State:', connState);
        return res.status(500).json({ success: false, message: 'Database not connected' });
      }

      let active;
      try {
        active = await Attendance.find({
          $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }, { dutyEnd: '' }],
        })
          .slice('geoHistory', -20)
          .lean();
      } catch (dbErr) {
        console.error('❌ [STEP 1] FAILED — Attendance.find() threw:', dbErr.message);
        return res
          .status(500)
          .json({ success: false, message: 'Attendance DB query failed: ' + dbErr.message });
      }

      if (active.length === 0) {
        return res.json({ success: true, data: [] });
      }

      const employeeIds = active
        .map((a) => a.employeeId)
        .filter((id) => {
          if (!id) return false;
          const idStr = String(id._id || id);
          return mongoose.Types.ObjectId.isValid(idStr);
        })
        .map((id) => String(id._id || id));

      let emps = [];
      try {
        emps = await Employees.find({ _id: { $in: employeeIds } })
          .select('name photo_url role user_id mobile phone')
          .lean();
      } catch (empErr) {
        // Non-fatal
      }

      // Find missing IDs (potentially direct users)
      const foundEmpIds = emps.map((e) => String(e._id));
      const missingIds = employeeIds.filter((id) => !foundEmpIds.includes(String(id)));

      let users = [];
      try {
        const userIds = emps
          .map((e) => e.user_id)
          .filter((id) => id && mongoose.Types.ObjectId.isValid(String(id)));

        // Add missing IDs to the query if they are valid ObjectIds
        const queryIds = [
          ...userIds,
          ...missingIds.filter((id) => mongoose.Types.ObjectId.isValid(String(id))),
        ];

        if (queryIds.length > 0) {
          users = await userMaster
            .find({ _id: { $in: queryIds } })
            .select('userDisplayName userProfileImage userRole userMobile')
            .lean()
            .maxTimeMS(5000);
        }
      } catch (userErr) {
        // Non-fatal
      }

      // ─── Employee-only role whitelist ───────────────────────────────────────
      // Only users saved in Employees or userMaster with a real staff role
      // should appear in live tracking. Clients, Guests, and Vendors are excluded.
      const EMPLOYEE_ROLES = new Set([
        'corpadmin', 'useradmin', 'admin',
        'project', 'sales', 'finance',
        'staff', 'worker', 'driver', 'security', 'supervisor', 'employee'
      ]);
      const EXCLUDED_ROLES = new Set([
        'client', 'guest', 'vendor', 'supplier', 'contractor',
      ]);

      const data = active.map((a) => {
        let currentLat = null;
        let currentLong = null;

        if (a.geoHistory && a.geoHistory.length > 0) {
          const latest = a.geoHistory[a.geoHistory.length - 1];
          currentLat = latest?.lat;
          currentLong = latest?.long;
        }

        if (currentLat === null || currentLat === undefined || isNaN(currentLat)) {
          currentLat = a.lat ?? a.startLat ?? a.siteLat ?? a.location?.lat ?? null;
          currentLong = a.long ?? a.startLong ?? a.siteLong ?? a.location?.long ?? null;
        }

        let staffGeoHistory = Array.isArray(a.geoHistory) ? [...a.geoHistory] : [];
        if (staffGeoHistory.length === 0 && currentLat !== null && currentLong !== null) {
          staffGeoHistory = [{
            lat: currentLat,
            long: currentLong,
            type: 'start',
            timestamp: a.dutyStart ? new Date(a.dutyStart) : new Date(),
          }];
        }

        const targetId = String(a.employeeId?._id || a.employeeId);
        const emp = emps.find((e) => String(e._id) === targetId);
        const user = users.find(
          (u) => String(u._id) === String(emp?.user_id) || String(u._id) === targetId
        );
        const displayName = emp?.name || user?.userDisplayName || 'User';
        const resolvedRole = emp?.role || user?.userRole || 'Staff';

        // An attendance record is for a real employee if:
        //  (a) The employeeId was found in the Employees collection, OR
        //  (b) The user was found in userMaster AND has a staff/admin role
        const isFromEmployees = !!emp;
        const roleLower = resolvedRole.toLowerCase();
        const isFromUserMaster = !!user && !EXCLUDED_ROLES.has(roleLower) && EMPLOYEE_ROLES.has(roleLower);
        const isEmployee = isFromEmployees || isFromUserMaster;

        // Staff = registered user saved in userMaster; Worker = non-registered saved in Employees
        const isStaffUser = Boolean(
          a.employeeType === 'userMaster' ||
          !!user ||
          (emp && !!emp.user_id) ||
          isFromUserMaster
        );

        return {
          ...a,
          lat: currentLat,
          long: currentLong,
          geoHistory: staffGeoHistory,
          location: { lat: currentLat, long: currentLong },
          displayName,
          photo: emp?.photo_url || user?.userProfileImage || null,
          role: resolvedRole,
          mobile: emp?.mobile || emp?.phone || user?.userMobile || null,
          isEmployee,
          isStaff: isStaffUser,
          isStaffUser,
          employeeType: isStaffUser ? 'userMaster' : (a.employeeType || 'Employees'),
          user_id: user?._id || emp?.user_id || null,
        };
      });


      // ─── Filter: only show actual employees in live tracking ───────────────
      // Always exclude Clients, Guests, Vendors regardless of requester role.
      const employeeData = data.filter((item) => item.isEmployee);

      // Project managers only see non-admin staff (already handled in marquee),
      // but the base exclusion of non-employees applies to everyone.
      res.json({ success: true, data: employeeData });

    } catch (err) {
      console.error('🔴 [CRITICAL] listActiveStaff UNEXPECTED CRASH:');
      console.error('   Message:', err.message);
      console.error('   Stack:\n', err.stack);
      res.status(500).json({ success: false, message: err.message, stack: err.stack });
    }
  },

  /**
   * Phase 2c — Roster Suggestion
   * GET /hr/attendance/roster-suggestion?siteId=&shiftGroup=&shiftCode=&date=
   * Returns the rotation-based reliever suggestion for a given site + shift.
   */
  getRosterSuggestion: async (req, res) => {
    try {
      const { Attendance } = req.tenantModels;
      const { siteId, shiftGroup, shiftCode, date } = req.query;

      if (!siteId || !shiftGroup || !shiftCode) {
        return res.status(400).json({ success: false, message: 'siteId, shiftGroup, and shiftCode are required' });
      }

      // Check if a suggestion is already stored on an active attendance record
      const mongoose = require('mongoose');
      const storedRecord = await Attendance.findOne({
        leadId: mongoose.isValidObjectId(siteId) ? new mongoose.Types.ObjectId(siteId) : siteId,
        shiftGroupName: shiftGroup,
        shiftCode,
        suggestedRelieverId: { $exists: true, $ne: null },
        $or: [{ dutyEnd: { $exists: false } }, { dutyEnd: null }],
      }).select('suggestedRelieverId').lean();

      if (storedRecord?.suggestedRelieverId) {
        return res.json({ success: true, suggestedRelieverId: String(storedRecord.suggestedRelieverId), source: 'cached' });
      }

      // Live compute as fallback
      const nextCode = relieverRotation.nextShiftCode(shiftGroup, shiftCode);
      if (!nextCode) {
        return res.json({ success: true, suggestedRelieverId: null, message: 'Unknown shift group' });
      }
      const suggestedId = await relieverRotation.resolveReliever(
        { siteId, shiftGroup, targetShiftCode: nextCode, date: date ? new Date(date) : new Date() },
        { Attendance }
      );

      res.json({ success: true, suggestedRelieverId: suggestedId, nextShiftCode: nextCode, source: 'live' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  getWorkerCurrentMonthSite: async (req, res) => {
    try {
      const { workerId, mobile, enrollment_no, workerName, date } = req.query;
      if (!workerId && !mobile && !enrollment_no && !workerName) {
        return res.status(400).json({ success: false, message: 'workerId, mobile or enrollment_no is required' });
      }
      const siteInfo = await getWorkerLatestMonthSite(
        req.tenantModels,
        workerId,
        mobile,
        enrollment_no,
        date || new Date(),
        workerName
      );
      res.json({
        success: true,
        data: siteInfo,
      });
    } catch (err) {
      console.error('getWorkerCurrentMonthSite error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  applyLeave: async (req, res) => {
    try {
      const { RequestMaster, LeaveRequests } = req.tenantModels || {};
      const RequestMasterModel = RequestMaster || LeaveRequests;
      if (!RequestMasterModel) {
        return res.status(500).json({ success: false, message: 'Tenant RequestMaster model not available' });
      }
      const {
        workerId,
        workerName,
        workerRole,
        workerMobile,
        enrollment_no,
        efn,
        salaryLedgerBalance,
        duesSummary,
        projectId,
        projectName,
        shiftCode,
        requestTypes,
        fromDate,
        toDate,
        leaveType,
        reason,
        advanceAmount,
        advanceDetails,
        articleItems,
        articlesDetails,
        isWorkerOnBehalf,
      } = req.body;

      if (!workerId) {
        return res.status(400).json({ success: false, message: 'workerId is required' });
      }

      // ── Resolve Worker's Actual Site from Attendance in Current Month / Active Window ──
      let resolvedProjectName = (projectName || '').trim();
      let resolvedProjectId = (projectId || '').trim();

      const latestMonthSite = await getWorkerLatestMonthSite(
        req.tenantModels,
        workerId,
        workerMobile,
        enrollment_no || efn,
        new Date(),
        workerName
      );
      if (latestMonthSite?.siteName) {
        resolvedProjectName = latestMonthSite.siteName;
        resolvedProjectId = latestMonthSite.siteId || resolvedProjectId;
      } else if (!resolvedProjectName || /^(project site|site project|hq\/remote|general|site)$/i.test(resolvedProjectName)) {
        resolvedProjectName = 'Project Site';
      }

      const todayStr = new Date().toISOString().split('T')[0];
      const effFrom = fromDate || todayStr;
      const effTo = toDate || effFrom;

      const types = Array.isArray(requestTypes) && requestTypes.length > 0 ? requestTypes : ['leave'];

      // Generate dates array for leave
      const dates = [];
      if (types.includes('leave')) {
        const curr = new Date(effFrom);
        const end = new Date(effTo);
        if (!isNaN(curr.getTime()) && !isNaN(end.getTime())) {
          while (curr <= end) {
            dates.push(curr.toISOString().split('T')[0]);
            curr.setDate(curr.getDate() + 1);
          }
        } else {
          dates.push(effFrom);
        }
      }

      const appliedBy = {
        userId: String(req.user?._id || ''),
        userName: req.user?.userDisplayName || req.user?.name || workerName || 'User',
        userRole: req.user?.userRole || 'worker',
        isSelf: !isWorkerOnBehalf,
      };

      const doc = await RequestMasterModel.create({
        workerId: String(workerId),
        workerName: workerName || 'Worker',
        workerRole: workerRole || 'Security',
        workerMobile: workerMobile || '',
        enrollment_no: enrollment_no || efn || '',
        efn: enrollment_no || efn || '',
        salaryLedgerBalance: salaryLedgerBalance || null,
        duesSummary: duesSummary || null,
        userType: !isWorkerOnBehalf ? 'SELF' : 'WORKER',
        projectId: resolvedProjectId || '',
        projectName: resolvedProjectName || 'Project Site',
        shiftCode: shiftCode || '',
        requestTypes: types,
        fromDate: effFrom,
        toDate: effTo,
        noOfDays: dates.length,
        dates,
        leaveType: leaveType || 'Casual',
        reason: reason || 'Request submitted via mobile app',
        advanceAmount: Number(advanceAmount) || 0,
        advanceDetails: advanceDetails || null,
        articleItems: Array.isArray(articleItems) ? articleItems : [],
        articlesDetails: articlesDetails || null,
        status: 'Pending',
        appliedBy,
        appliedAt: new Date(),
      });

      const newRecord = doc.toObject();
      newRecord.id = String(newRecord._id);

      if (req.io && req.tenantDbName) {
        const typesStr = types.map((t) => t.toUpperCase()).join(' & ');
        req.io.to(req.tenantDbName).emit('leave:applied', { data: newRecord });
        req.io.to(req.tenantDbName).emit('admin:broadcast', {
          id: 'leave-req-' + newRecord.id,
          title: 'New ' + typesStr + ' Request',
          message: newRecord.workerName + ' submitted ' + typesStr + ' request (' + (newRecord.projectName || 'Site') + ')',
          priority: 'normal',
          targetRoles: ['CorpAdmin', 'userAdmin', 'HR'],
          sentBy: newRecord.workerName,
          at: new Date().toISOString(),
        });
      }

      res.status(201).json({ success: true, message: 'Request submitted successfully', data: newRecord });
    } catch (err) {
      console.error('applyLeave error:', err.message);
      res.status(400).json({ success: false, message: err.message });
    }
  },

  cancelLeave: async (req, res) => {
    try {
      const { RequestMaster, LeaveRequests } = req.tenantModels || {};
      const RequestMasterModel = RequestMaster || LeaveRequests;
      if (!RequestMasterModel) {
        return res.status(500).json({ success: false, message: 'Tenant RequestMaster model not available' });
      }
      const { id } = req.params;
      if (!id || id === 'undefined' || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Valid Request ID is required' });
      }
      const record = await RequestMasterModel.findById(id);
      if (!record) {
        return res.status(404).json({ success: false, message: 'Request record ' + id + ' not found' });
      }

      if (record.status !== 'Pending') {
        return res.status(400).json({
          success: false,
          message: 'Only pending requests can be deleted. This request is already ' + record.status + '.',
        });
      }

      await RequestMasterModel.findByIdAndDelete(id);

      if (req.io && req.tenantDbName) {
        req.io.to(req.tenantDbName).emit('leave:cancelled', { id, record });
      }
      res.json({ success: true, message: 'Request deleted successfully', data: record });
    } catch (err) {
      console.error('cancelLeave error:', err.message);
      res.status(400).json({ success: false, message: err.message });
    }
  },

  getWorkerDuesSummary: async (req, res) => {
    try {
      const { workerId, month, year } = req.query;
      if (!workerId) {
        return res.status(400).json({ success: false, message: 'workerId is required' });
      }

      const now = new Date();
      const targetMonth = month !== undefined ? parseInt(month, 10) : now.getMonth();
      const targetYear = year !== undefined ? parseInt(year, 10) : now.getFullYear();

      const startOfMonth = new Date(targetYear, targetMonth, 1);
      const endOfMonth = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59, 999);

      let earnedDues = 0;
      let advance = 0;
      let penalty = 0;

      const { Attendance, Vouchers, Employees } = req.tenantModels || {};

      if (Attendance) {
        const query = {
          $or: [{ workerId: String(workerId) }, { employeeId: String(workerId) }],
          date: { $gte: startOfMonth, $lte: endOfMonth },
        };
        const attRecords = await Attendance.find(query).lean().catch(() => []);
        for (const rec of attRecords) {
          const rate = Number(rec.dailyRate || rec.rate || 0);
          if (rec.status === 'Present' || rec.status === 'Double Duty' || rec.status === 'Paid Leave') {
            earnedDues += rate > 0 ? rate : 500;
          } else if (rec.status === 'Half Day') {
            earnedDues += (rate > 0 ? rate : 500) / 2;
          }

          const imp = Number(rec.penaltyImposed || 0);
          const ded = Number(rec.penaltyDeducted || 0);
          const wai = Number(rec.penaltyWaivedOff || 0);
          penalty += Math.max(0, imp - ded - wai);
        }
      }

      if (Vouchers) {
        const vQuery = {
          date: { $gte: startOfMonth, $lte: endOfMonth },
          $or: [
            { 'entries.accountId': String(workerId) },
            { narration: { $regex: new RegExp(String(workerId), 'i') } },
          ],
        };
        const vouchers = await Vouchers.find(vQuery).lean().catch(() => []);
        for (const v of vouchers) {
          if (v.voucherType === 'Payment' || /advance|salary/i.test(v.narration || '')) {
            const entry = (v.entries || []).find((e) => String(e.accountId) === String(workerId));
            if (entry) {
              advance += Number(entry.amount || 0);
            }
          }
        }
      }

      if (earnedDues === 0 && Employees) {
        const emp = await Employees.findById(workerId).lean().catch(() => null);
        if (emp) {
          const rate = Number(emp.rate || emp.dailyRate || 0);
          const monthly = Number(emp.monthlyRate || emp.salary || 0);
          if (rate > 0) {
            earnedDues = rate * 26;
          } else if (monthly > 0) {
            earnedDues = monthly;
          }
        }
      }

      const netDues = Math.max(0, earnedDues - advance - penalty);

      res.json({
        success: true,
        data: {
          earnedDues,
          advance,
          penalty,
          netDues,
          month: targetMonth + 1,
          year: targetYear,
        },
      });
    } catch (err) {
      console.error('getWorkerDuesSummary error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  listLeaves: async (req, res) => {
    try {
      const { RequestMaster, LeaveRequests } = req.tenantModels || {};
      const RequestMasterModel = RequestMaster || LeaveRequests;
      if (!RequestMasterModel) {
        return res.status(500).json({ success: false, message: 'Tenant RequestMaster model not available' });
      }
      const { status, workerId, projectId, date } = req.query;
      const query = {};
      if (status) {
        query.status = new RegExp('^' + status + '$', 'i');
      }
      if (workerId) {
        query.workerId = String(workerId);
      }
      if (projectId) {
        query.projectId = String(projectId);
      }
      if (date) {
        query.dates = String(date).split('T')[0];
      }

      const docs = await RequestMasterModel.find(query).sort({ appliedAt: -1 }).lean();
      const records = await Promise.all(
        docs.map(async (doc) => {
          let pName = (doc.projectName || '').trim();
          let pId = doc.projectId;

          // Replace generic 'Project Site' with worker's actual work site from Attendance in current month (or recent window)
          const isGeneric = !pName || /^(project site|site project|hq\/remote|general|site)$/i.test(pName);
          if (doc.workerId || doc.workerMobile || doc.enrollment_no || doc.workerName) {
            const siteInfo = await getWorkerLatestMonthSite(
              req.tenantModels,
              doc.workerId,
              doc.workerMobile,
              doc.enrollment_no || doc.efn,
              doc.appliedAt || doc.createdAt,
              doc.workerName
            );
            if (siteInfo?.siteName) {
              pName = siteInfo.siteName;
              pId = siteInfo.siteId || pId;
              if (isGeneric) {
                // Permanently persist the resolved actual site to database
                RequestMasterModel.updateOne({ _id: doc._id }, { $set: { projectName: pName, projectId: pId } }).catch(() => {});
              }
            }
          }

          return {
            ...doc,
            id: String(doc._id),
            _id: String(doc._id),
            projectName: pName || 'Project Site',
            projectId: pId,
          };
        })
      );

      res.json({ success: true, data: records });
    } catch (err) {
      console.error('listLeaves error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  reviewLeave: async (req, res) => {
    try {
      const { RequestMaster, LeaveRequests } = req.tenantModels || {};
      const RequestMasterModel = RequestMaster || LeaveRequests;
      if (!RequestMasterModel) {
        return res.status(500).json({ success: false, message: 'Tenant RequestMaster model not available' });
      }
      const { id } = req.params;
      const { status, reason } = req.body; // 'Approved' | 'Disapproved'

      if (!id || id === 'undefined' || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Valid Request ID is required' });
      }

      const record = await RequestMasterModel.findById(id);
      if (!record) {
        return res.status(404).json({ success: false, message: 'Request record ' + id + ' not found' });
      }

      const isApproval = String(status).toLowerCase() === 'approved';
      const adminIdStr = String(req.user?._id || '').trim();
      const workerIdStr = String(record.workerId || '').trim();
      const appliedByIdStr = String(record.appliedBy?.userId || '').trim();

      if (isApproval && adminIdStr && (adminIdStr === workerIdStr || adminIdStr === appliedByIdStr)) {
        return res.status(403).json({
          success: false,
          message: 'Self-approval restricted: Admin cannot approve their own leave request.',
        });
      }

      record.status = isApproval ? 'Approved' : 'Disapproved';
      record.approvedBy = req.user?.userDisplayName || req.user?.name || 'Admin';
      record.approvedById = adminIdStr || null;
      record.approvedAt = new Date();
      if (!isApproval && reason) {
        record.rejectionReason = reason;
      }

      await record.save();

      const updated = record.toObject();
      updated.id = String(updated._id);

      if (req.io && req.tenantDbName) {
        req.io.to(req.tenantDbName).emit('leave:reviewed', { data: updated });
        req.io.to(req.tenantDbName).emit('admin:broadcast', {
          id: 'leave-rev-' + updated.id,
          title: 'Leave Request ' + record.status,
          message: 'Request for ' + updated.workerName + ' was ' + record.status.toLowerCase() + ' by ' + record.approvedBy + '.',
          priority: 'normal',
          targetRoles: ['CorpAdmin', 'userAdmin', 'Project', 'HR'],
          sentBy: record.approvedBy,
          at: new Date().toISOString(),
        });
      }

      res.json({ success: true, message: 'Request ' + record.status + ' successfully', data: updated });
    } catch (err) {
      console.error('reviewLeave error:', err.message);
      res.status(400).json({ success: false, message: err.message });
    }
  },

  getAvailableMonths: async (req, res) => {
    try {
      const { Attendance } = req.tenantModels || {};
      if (!Attendance) {
        return res.status(500).json({ success: false, message: 'Tenant Attendance model not available' });
      }
      const dates = await Attendance.distinct('date');
      const monthSet = new Set();
      (dates || []).forEach((d) => {
        if (d) {
          const str = d instanceof Date ? d.toISOString().slice(0, 7) : String(d).slice(0, 7);
          if (/^\d{4}-\d{2}$/.test(str)) monthSet.add(str);
        }
      });
      if (monthSet.size === 0) {
        const now = new Date();
        for (let i = 0; i < 12; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          monthSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
      }
      const months = Array.from(monthSet).sort().reverse();
      res.json({ success: true, data: months });
    } catch (err) {
      console.error('getAvailableMonths error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  requestAttendancePermission: async (req, res) => {
    try {
      const { employeeId, attendanceId, reason, dbName, details } = req.body;
      const reqId = 'perm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
      const payload = {
        requestId: reqId,
        employeeId,
        attendanceId,
        reason,
        details: details || {},
        status: 'Pending',
        requestedAt: new Date().toISOString(),
        requestedBy: req.user?._id || employeeId,
        userName: req.user?.userDisplayName || req.user?.name || 'Worker',
      };
      if (req.io && req.tenantDbName) {
        req.io.to(req.tenantDbName).emit('attendance:permission-requested', payload);
        req.io.to(req.tenantDbName).emit('admin:broadcast', {
          id: 'perm-req-' + reqId,
          title: 'Attendance Permission Request',
          message: `${payload.userName} requested attendance permission (${reason || 'Standard'})`,
          priority: 'high',
          targetRoles: ['CorpAdmin', 'userAdmin', 'Project', 'HR'],
          sentBy: payload.userName,
          at: new Date().toISOString(),
        });
      }
      res.json({ success: true, message: 'Permission requested successfully', data: payload });
    } catch (err) {
      console.error('requestAttendancePermission error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  respondAttendancePermission: async (req, res) => {
    try {
      const { requestId, employeeId, attendanceId, approved, note, reason } = req.body;
      const isApproved = Boolean(approved);
      const isLateStart = reason === 'late_start' || (!attendanceId && !reason);
      const responderName = req.user?.userDisplayName || req.user?.name || 'Admin';
      const { Attendance, Employees, Leads, Messages } = req.tenantModels || {};

      let createdAttendance = null;
      let targetAttendanceId = attendanceId;

      if (isApproved && isLateStart) {
        if (!Attendance) {
          return res.status(500).json({ success: false, message: 'Tenant Attendance model not available' });
        }
        // 1. Check if user already has an active duty
        const existingActive = await Attendance.findOne({
          employeeId: employeeId,
          dutyStart: { $ne: null },
          dutyEnd: null,
        }).lean();

        if (existingActive) {
          targetAttendanceId = existingActive._id;
          createdAttendance = existingActive;
        } else {
          // 2. Resolve employee / userMaster
          const userMaster = require('../models/userMaster');
          let emp = Employees ? await Employees.findById(employeeId).lean() : null;
          let isWorker = Boolean(emp);
          if (!emp) {
            emp = await userMaster.findById(employeeId).lean();
            isWorker = false;
          }

          const now = new Date();
          const empName = emp
            ? (emp.name || emp.userDisplayName || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Staff')
            : 'Staff';
          const empRole = emp?.role || emp?.userRole || 'project';
          const shiftCode = req.body.shiftCode || emp?.dutyShift?.shiftName || emp?.selectedShift || 'G';
          const shiftPeriod = req.body.shiftPeriod || emp?.dutyShift?.shiftPeriod || 'General';
          const shiftHours = Number(emp?.dutyShift?.durationHrs) || 12;
          const scheduledEnd = new Date(now.getTime() + shiftHours * 3600000);

          let siteName = req.body.site_name || req.body.siteName;
          let siteLat = null;
          let siteLong = null;
          let siteAddress = '';
          const targetLeadId = req.body.leadId || req.body.siteId;
          if (targetLeadId && Leads) {
            const siteDoc = await Leads.findById(targetLeadId).lean();
            if (siteDoc) {
              siteName = siteDoc.sender_name || siteDoc.name || siteName;
              if (siteDoc.location) {
                if (siteDoc.location.lat !== undefined && !isNaN(Number(siteDoc.location.lat))) siteLat = Number(siteDoc.location.lat);
                if (siteDoc.location.long !== undefined && !isNaN(Number(siteDoc.location.long))) siteLong = Number(siteDoc.location.long);
                if (siteDoc.location.address) siteAddress = String(siteDoc.location.address);
              } else if (siteDoc.lat !== undefined && siteDoc.long !== undefined) {
                siteLat = Number(siteDoc.lat);
                siteLong = Number(siteDoc.long);
              }
            }
          }
          if (!siteName) siteName = emp?.assignedSite || 'HQ/Remote';

          const initialGeoHistory = [];
          if (siteLat !== null && siteLong !== null) {
            initialGeoHistory.push({
              lat: siteLat,
              long: siteLong,
              address: siteAddress || siteName || 'Site Location',
              type: 'start',
              timestamp: now,
            });
          }

          const newDuty = new Attendance({
            employeeId: emp?._id || employeeId,
            employeeType: isWorker ? 'Employees' : 'userMaster',
            workerName: empName,
            role: empRole,
            date: now,
            dutyStart: now,
            dutyStartScheduled: now,
            dutyEndScheduled: scheduledEnd,
            shiftCode: shiftCode,
            shiftType: shiftHours === 12 ? '12hr' : '8hr',
            shiftPeriod: shiftPeriod,
            shiftHours: shiftHours,
            shiftLockHours: shiftHours,
            status: 'Present',
            site_name: siteName,
            siteId: req.body.siteId || null,
            leadId: req.body.leadId || null,
            startLat: siteLat,
            startLong: siteLong,
            siteLat: siteLat,
            siteLong: siteLong,
            geoHistory: initialGeoHistory,
            markedByDevice: false,
            markedByUserName: responderName,
            isLate: true,
            remarks: `Late start approved by ${responderName}`,
          });
          await newDuty.save();
          createdAttendance = newDuty;
          targetAttendanceId = newDuty._id;

          try {
            const autoEndScheduler = require('../utils/autoEndScheduler');
            if (autoEndScheduler && newDuty.dutyEndScheduled) {
              autoEndScheduler.scheduleAutoEnd(
                newDuty._id,
                newDuty.dutyEndScheduled,
                Attendance,
                req.tenantDbName,
                req.io
              );
            }
          } catch (schedErr) {
            console.warn('[respondAttendancePermission] Auto-end schedule error:', schedErr.message);
          }
        }
      } else if (isApproved && !isLateStart && attendanceId && Attendance) {
        // Early duty end approved
        const duty = await Attendance.findById(attendanceId);
        if (duty && !duty.dutyEnd) {
          duty.dutyEnd = new Date();
          duty.status = 'Present';
          duty.remarks = (duty.remarks ? `${duty.remarks} | ` : '') + `Early end approved by ${responderName}`;
          await duty.save();
          targetAttendanceId = duty._id;
        }
      }

      // Update Message status in chatroom if requestId was passed
      if (requestId && Messages && mongoose.Types.ObjectId.isValid(requestId)) {
        try {
          await Messages.findByIdAndUpdate(requestId, {
            status: 'seen',
            isActioned: true,
            actionResult: isApproved ? 'approved' : 'rejected',
          });
        } catch {}
      }

      const responsePayload = {
        requestId,
        employeeId,
        attendanceId: targetAttendanceId,
        approved: isApproved,
        reason: reason || (isLateStart ? 'late_start' : 'early_end'),
        note: note || '',
        respondedAt: new Date().toISOString(),
        respondedBy: req.user?._id,
        responderName,
        attendance: createdAttendance,
      };

      if (req.io && req.tenantDbName) {
        if (isApproved) {
          req.io.to(req.tenantDbName).emit('attendance:permission_approved', {
            employeeId,
            reason: reason || (isLateStart ? 'late_start' : 'early_end'),
            attendanceId: targetAttendanceId,
            attendance: createdAttendance,
            message: isLateStart
              ? `Admin ${responderName} allowed your late start request! Attendance has been added and duty is now ON.`
              : `Admin ${responderName} approved your early duty end. Duty is OFF.`,
          });
          if (isLateStart && createdAttendance) {
            req.io.to(req.tenantDbName).emit('attendance:duty_on', {
              employeeId,
              attendanceId: targetAttendanceId,
              attendance: createdAttendance,
              shiftCode: createdAttendance.shiftCode,
              shiftPeriod: createdAttendance.shiftPeriod,
            });
          } else if (!isLateStart) {
            req.io.to(req.tenantDbName).emit('attendance:duty_off', {
              employeeId,
              attendanceId: targetAttendanceId,
            });
          }
        } else {
          req.io.to(req.tenantDbName).emit('attendance:permission_denied', {
            employeeId,
            reason: reason || (isLateStart ? 'late_start' : 'early_end'),
            message: note || `Permission request was rejected by ${responderName} (Request not allowed).`,
          });
        }
        // Emit legacy event for existing listeners
        req.io.to(req.tenantDbName).emit('attendance:permission-responded', responsePayload);
      }

      res.json({
        success: true,
        message: isApproved
          ? (isLateStart ? 'Late start allowed! Attendance added & duty started.' : 'Early duty end approved.')
          : 'Permission request rejected.',
        data: responsePayload,
      });
    } catch (err) {
      console.error('respondAttendancePermission error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  lockBatchAttendance: async (req, res) => {
    try {
      const { Attendance } = req.tenantModels || {};
      if (!Attendance) {
        return res.status(500).json({ success: false, message: 'Tenant Attendance model not available' });
      }
      const { month, leadId } = req.body;
      if (!month) {
        return res.status(400).json({ success: false, message: 'month (YYYY-MM) is required' });
      }
      const [yearStr, monthStr] = month.split('-');
      const startOfMonth = new Date(Number(yearStr), Number(monthStr) - 1, 1);
      const endOfMonth = new Date(Number(yearStr), Number(monthStr), 0, 23, 59, 59, 999);

      const query = {
        date: { $gte: startOfMonth, $lte: endOfMonth },
      };
      if (leadId && mongoose.Types.ObjectId.isValid(leadId)) {
        query.leadId = leadId;
      }

      const batchId = 'lock_' + month + '_' + Date.now();
      const result = await Attendance.updateMany(query, {
        $set: {
          'lockStatus.isLocked': true,
          'lockStatus.lockedAt': new Date(),
          'lockStatus.lockedBy': req.user?._id || null,
          'lockStatus.lockedByName': req.user?.userDisplayName || req.user?.name || 'Admin',
          'lockStatus.lockBatchId': batchId,
        },
      });

      res.json({
        success: true,
        message: `Finalized and locked ${result.modifiedCount || 0} attendance records for ${month}`,
        modifiedCount: result.modifiedCount || 0,
        batchId,
      });
    } catch (err) {
      console.error('lockBatchAttendance error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  unlockBatchAttendance: async (req, res) => {
    try {
      const { Attendance } = req.tenantModels || {};
      if (!Attendance) {
        return res.status(500).json({ success: false, message: 'Tenant Attendance model not available' });
      }
      const { month, leadId, reason } = req.body;
      if (!month) {
        return res.status(400).json({ success: false, message: 'month (YYYY-MM) is required' });
      }
      const [yearStr, monthStr] = month.split('-');
      const startOfMonth = new Date(Number(yearStr), Number(monthStr) - 1, 1);
      const endOfMonth = new Date(Number(yearStr), Number(monthStr), 0, 23, 59, 59, 999);

      const query = {
        date: { $gte: startOfMonth, $lte: endOfMonth },
      };
      if (leadId && mongoose.Types.ObjectId.isValid(leadId)) {
        query.leadId = leadId;
      }

      const unlockEntry = {
        unlockedBy: req.user?._id || null,
        unlockedByName: req.user?.userDisplayName || req.user?.name || 'Admin',
        unlockedAt: new Date(),
        reason: reason || 'Unlocked for administrative correction',
      };

      const result = await Attendance.updateMany(query, {
        $set: { 'lockStatus.isLocked': false },
        $push: { 'lockStatus.unlockHistory': unlockEntry },
      });

      res.json({
        success: true,
        message: `Unlocked ${result.modifiedCount || 0} attendance records for correction`,
        modifiedCount: result.modifiedCount || 0,
      });
    } catch (err) {
      console.error('unlockBatchAttendance error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  relockBatchAttendance: async (req, res) => {
    return exports.manageEmployees.lockBatchAttendance(req, res);
  },

  backupAndPurgeAttendance: async (req, res) => {
    try {
      const { Attendance, AttendanceBackupLogs } = req.tenantModels || {};
      if (!Attendance) {
        return res.status(500).json({ success: false, message: 'Tenant Attendance model not available' });
      }
      const { month, leadId, confirmPurge } = req.body;
      if (!month) {
        return res.status(400).json({ success: false, message: 'month (YYYY-MM) is required' });
      }
      const [yearStr, monthStr] = month.split('-');
      const startOfMonth = new Date(Number(yearStr), Number(monthStr) - 1, 1);
      const endOfMonth = new Date(Number(yearStr), Number(monthStr), 0, 23, 59, 59, 999);

      const query = {
        date: { $gte: startOfMonth, $lte: endOfMonth },
      };
      if (leadId && mongoose.Types.ObjectId.isValid(leadId)) {
        query.leadId = leadId;
      }

      const count = await Attendance.countDocuments(query);
      const batchId = 'backup_' + month + '_' + Date.now();

      if (AttendanceBackupLogs) {
        await AttendanceBackupLogs.create({
          tenantDb: req.tenantDbName || 'main',
          backupBatchId: batchId,
          period: { month: Number(monthStr), year: Number(yearStr) },
          recordCount: count,
          archiveFileName: `attendance_${month}_${batchId}.json`,
          archiveFilePath: `/backups/attendance_${month}_${batchId}.json`,
          fileSizeBytes: count * 512,
          backedUpBy: req.user?._id || null,
          backedUpByName: req.user?.userDisplayName || req.user?.name || 'Admin',
          purgedFromDatabase: Boolean(confirmPurge),
        });
      }

      let purgedCount = 0;
      if (confirmPurge) {
        const delRes = await Attendance.deleteMany(query);
        purgedCount = delRes.deletedCount || 0;
      }

      res.json({
        success: true,
        message: `Archived ${count} attendance records${confirmPurge ? ` and purged ${purgedCount} from database` : ''}`,
        recordCount: count,
        purgedCount,
        backupBatchId: batchId,
      });
    } catch (err) {
      console.error('backupAndPurgeAttendance error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  getBackupLogs: async (req, res) => {
    try {
      const { AttendanceBackupLogs } = req.tenantModels || {};
      if (!AttendanceBackupLogs) {
        return res.json({ success: true, data: [] });
      }
      const logs = await AttendanceBackupLogs.find().sort({ createdAt: -1 }).lean();
      res.json({ success: true, data: logs });
    } catch (err) {
      console.error('getBackupLogs error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  downloadBackupArchive: async (req, res) => {
    try {
      const { AttendanceBackupLogs } = req.tenantModels || {};
      const { backupId } = req.params;
      let log = null;
      if (AttendanceBackupLogs) {
        log = await AttendanceBackupLogs.findOne({
          $or: [{ backupBatchId: backupId }, { _id: mongoose.Types.ObjectId.isValid(backupId) ? backupId : null }],
        }).lean();
      }
      if (!log) {
        return res.status(404).json({ success: false, message: 'Backup archive record not found' });
      }
      res.json({ success: true, data: log });
    } catch (err) {
      console.error('downloadBackupArchive error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  coverShiftForLeave: async (req, res) => {
    try {
      const { Attendance, Employees } = req.tenantModels || {};
      if (!Attendance) {
        return res.status(500).json({ success: false, message: 'Tenant Attendance model not available' });
      }
      const {
        coveringWorkerId,
        scheduledWorkerId,
        shiftCode,
        date,
        leadId,
        leaveType,
        handoverType,
        overtimeRate,
      } = req.body;

      if (!coveringWorkerId || !scheduledWorkerId) {
        return res.status(400).json({ success: false, message: 'Both coveringWorkerId and scheduledWorkerId are required' });
      }

      const dStr = typeof date === 'string' && date ? date : new Date().toISOString().slice(0, 10);
      const targetDate = new Date(dStr);
      const startOfDay = new Date(dStr + 'T00:00:00.000Z');
      const endOfDay = new Date(dStr + 'T23:59:59.999Z');

      let doc = await Attendance.findOne({
        employeeId: coveringWorkerId,
        date: { $gte: startOfDay, $lte: endOfDay },
      });

      if (!doc) {
        doc = new Attendance({
          employeeId: coveringWorkerId,
          employeeType: 'Employees',
          leadId: leadId || null,
          date: targetDate,
          shiftCode: shiftCode || 'G',
          status: 'Present',
          remarks: `Single-day replacement covering for leave (${leaveType || 'Leave'})`,
          leaveCoverage: {
            isCoveringForLeave: true,
            originalWorkerId: scheduledWorkerId,
            leaveType: leaveType || 'CasualLeave',
            handoverType: handoverType || 'Reliever',
            overtimeRate: Number(overtimeRate) || 1.0,
          },
        });
      } else {
        doc.leaveCoverage = {
          isCoveringForLeave: true,
          originalWorkerId: scheduledWorkerId,
          leaveType: leaveType || 'CasualLeave',
          handoverType: handoverType || 'Reliever',
          overtimeRate: Number(overtimeRate) || 1.0,
        };
        doc.remarks = (doc.remarks ? `${doc.remarks} | ` : '') + 'Single-day replacement covering for leave';
      }

      await doc.save();
      res.json({
        success: true,
        message: 'Single-day replacement assigned successfully. Next day strictly follows normal roster.',
        data: doc,
      });
    } catch (err) {
      console.error('coverShiftForLeave error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  getAvailableWorkers: async (req, res) => {
    try {
      const { Employees, Attendance } = req.tenantModels || {};
      if (!Employees) {
        return res.status(500).json({ success: false, message: 'Tenant Employees model not available' });
      }
      const { date } = req.query;
      const dStr = typeof date === 'string' && date ? date : new Date().toISOString().slice(0, 10);
      const startOfDay = new Date(dStr + 'T00:00:00.000Z');
      const endOfDay = new Date(dStr + 'T23:59:59.999Z');

      const busyWorkerIds = new Set();
      if (Attendance) {
        const busyAttendances = await Attendance.find({
          date: { $gte: startOfDay, $lte: endOfDay },
          status: { $in: ['Present', 'Duty'] },
          dutyEnd: null,
        }).select('employeeId').lean();

        busyAttendances.forEach((a) => {
          if (a.employeeId) busyWorkerIds.add(String(a.employeeId));
        });
      }

      const allEmployees = await Employees.find({
        status: { $nin: ['Relieved', 'Inactive'] },
      }).select('_id name userDisplayName mobile role status').lean();

      const available = allEmployees.map((emp) => ({
        _id: emp._id,
        name: emp.name || emp.userDisplayName || 'Worker',
        mobile: emp.mobile || '',
        role: emp.role || 'Staff',
        isAvailable: !busyWorkerIds.has(String(emp._id)),
      })).sort((a, b) => (b.isAvailable ? 1 : 0) - (a.isAvailable ? 1 : 0));

      res.json({ success: true, data: available });
    } catch (err) {
      console.error('getAvailableWorkers error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  updateCompactGps: async (req, res) => {
    try {
      const { Attendance } = req.tenantModels || {};
      if (!Attendance) {
        return res.status(500).json({ success: false, message: 'Tenant Attendance model not available' });
      }
      const { id } = req.params;
      const { lat, long, address, accuracy, speed, type } = req.body;

      const updateDoc = await Attendance.findByIdAndUpdate(
        id,
        {
          $push: {
            geoHistory: {
              lat: Number(lat),
              long: Number(long),
              address: address || '',
              accuracy: Number(accuracy) || 0,
              speed: Number(speed) || 0,
              type: type || 'tick',
              timestamp: new Date(),
            },
          },
        },
        { new: true }
      );

      res.json({ success: true, message: 'Compact GPS logged', data: updateDoc });
    } catch (err) {
      console.error('updateCompactGps error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  // ── Helper: 1:1 Invariant Roster Reconciler (Total Roster Records == Total Accepted Leads) ──
  reconcileSiteRostersInternal: async (tenantModels, options = {}) => {
    const { Leads, SiteRoster, SiteRosterHolidays, Employees, Attendance, ProfileMaster } = tenantModels;
    const RosterModel = SiteRoster || SiteRosterHolidays;
    if (!Leads || !RosterModel) return { totalActive: 0, reconciled: 0 };

    // 1. Fetch all accepted leads
    const activeLeads = await Leads.find({
      status: { $regex: /^(accepted|tax invoice)$/i },
    }).lean();

    const activeLeadIds = activeLeads.map((l) => String(l._id));

    // 2. Remove non-accepted leads from roster (Total records of roster = total accepted leads)
    await RosterModel.deleteMany({
      siteId: { $nin: activeLeadIds, $ne: '__HO__' },
    });

    const now = new Date();
    const istOffsetMs = 5.5 * 3600000;
    const nowIst = new Date(now.getTime() + istOffsetMs);
    const startTodayUtc = new Date(new Date(nowIst.toISOString().slice(0, 10) + 'T00:00:00.000Z').getTime() - istOffsetMs);
    const endTodayUtc = new Date(startTodayUtc.getTime() + 24 * 3600000 - 1);
    const startYesterdayUtc = new Date(startTodayUtc.getTime() - 24 * 3600000);
    const endYesterdayUtc = new Date(startTodayUtc.getTime() - 1);

    // Fetch ProfileMaster corporate locations (HO, BR)
    let profileLocations = [];
    if (ProfileMaster) {
      try {
        const prof = await ProfileMaster.findOne({}).lean();
        if (prof && Array.isArray(prof.locations)) {
          profileLocations = prof.locations;
        }
      } catch (profErr) {
        console.warn('Could not read ProfileMaster locations:', profErr.message);
      }
    }
    const hoLocation = profileLocations.find((loc) => loc.locationType === 'HO') || profileLocations[0] || null;

    // Pre-cache employees
    const allEmps = Employees ? await Employees.find({}).lean() : [];
    const empMap = new Map();
    for (const emp of allEmps) empMap.set(String(emp._id), emp);

    // Find registered corporate staff in Employees
    const corpStaffEmps = allEmps.filter((e) =>
      e.userRole && ['CorpAdmin', 'Project', 'Sales', 'Finance', 'userAdmin'].includes(e.userRole)
    );

    let reconciledCount = 0;

    for (const lead of activeLeads) {
      const siteId = String(lead._id);
      const isTeamHO = /Team HO|Head Office|Corporate/i.test(lead.sender_name || lead.name || '');
      const isBO = /Branch Office|\bBO\b/i.test(lead.sender_name || lead.name || '');
      const locType = isBO ? 'BO' : 'HO';
      const rawCity = (hoLocation?.address?.city || hoLocation?.address?.district || lead.sender_city || 'Delhi').trim();
      const cleanCity = rawCity.replace(/Head Office|Branch Office|Corporate Staff|Corporate/gi, '').replace(/^[-( ]+|[-) ]+$/g, '').trim() || 'Delhi';
      const canonicalCorpName = `Corporate Staff (${locType}-${cleanCity})`;

      if (isTeamHO) {
        // 🏢 Corporate Roster for Registered Users (HO / BO) - Manage strictly under canonical '__HO__'
        const hoWorkers = corpStaffEmps.map((emp) => ({
          workerId: emp._id,
          workerName: emp.name,
          enrollmentNo: emp.userRole || 'HO-Staff',
          mobile: emp.mobile,
          weeklyRestDay: 'Sun',
          assignedDate: now,
          status: 'Active',
        }));

        const hoSiteShifts = [{
          shiftName: 'General (Office Staff)',
          groupName: 'MANG',
          shiftCode: 'G',
          startTime: '09:00',
          durationHrs: 8,
          shiftStartDate: now,
          workerSlots: Math.max(hoWorkers.length, 4),
          billRate: 0,
          salaryRate: 0,
          active: true,
          boundWorkerId: hoWorkers[0]?.workerId || null,
          boundWorkerName: hoWorkers[0]?.workerName || 'Corporate Staff',
          weeklyRestDay: 'Sun',
          workers: hoWorkers,
        }];

        await Leads.findByIdAndUpdate(siteId, { $set: { siteShifts: hoSiteShifts, sender_name: canonicalCorpName } });

        let hoDoc = await RosterModel.findOne({ siteId: '__HO__' });
        if (!hoDoc) {
          hoDoc = new RosterModel({
            siteId: '__HO__',
            siteName: canonicalCorpName,
            clientId: lead.clientId || null,
            shifts: [],
            holidays: [],
          });
        }
        hoDoc.siteName = canonicalCorpName;

        if (hoLocation) {
          const hoAddr = hoLocation.address || {};
          hoDoc.billingAddress = {
            line1: hoAddr.line1 || '141B Ground Floor, OPP. LSR College',
            city: hoAddr.city || hoAddr.district || 'South Delhi',
            state: hoAddr.state || 'Delhi',
            pincode: hoAddr.pincode || '110048',
            country: 'India',
          };
          hoDoc.deliveryAddress = {
            isSameAsBilling: true,
            line1: hoAddr.line1 || '141B Ground Floor, OPP. LSR College',
            city: hoAddr.city || hoAddr.district || 'South Delhi',
            state: hoAddr.state || 'Delhi',
            pincode: hoAddr.pincode || '110048',
            country: 'India',
          };
          hoDoc.gstNo = hoLocation.gstin || lead.gst_number || '';
          hoDoc.contactPerson = {
            name: 'Suresh Chauhan',
            mobile: '9212790790',
            email: 'admin@prathamservices.com',
            waNumber: '9212790790',
          };
        }

        hoDoc.shifts = [{
          shiftCode: 'G',
          shiftName: 'General (Office Staff)',
          groupName: 'MANG',
          startTime: '09:00',
          durationHrs: 8,
          shiftStartDate: now,
          workerSlots: Math.max(hoWorkers.length, 4),
          billRate: 0,
          salaryRate: 0,
          active: true,
          workers: hoWorkers,
        }];
        hoDoc.totalConfiguredShifts = 1;
        hoDoc.totalRequiredWorkers = Math.max(hoWorkers.length, 4);
        hoDoc.totalAssignedWorkers = hoWorkers.length;
        hoDoc.status = 'Active';
        await hoDoc.save();

        // 🗑️ Remove redundant separate siteRoster for this lead so it NEVER duplicates
        await RosterModel.deleteMany({ siteId: lead._id });
        reconciledCount++;
        continue;
      }

      const siteName = lead.sender_name || lead.client_name || lead.name || 'Site';

      let rosterDoc = await RosterModel.findOne({ siteId });
      if (!rosterDoc) {
        rosterDoc = new RosterModel({
          siteId,
          siteName,
          clientId: lead.clientId || null,
          gstNo: lead.gst_number || (isTeamHO && hoLocation?.gstin ? hoLocation.gstin : ''),
          billingAddress: {
            line1: '',
            city: '',
            state: '',
            pincode: '',
            country: 'India',
          },
          deliveryAddress: {
            isSameAsBilling: true,
            line1: '',
            city: '',
            state: '',
            pincode: '',
            country: 'India',
          },
          contactPerson: {
            name: '',
            mobile: '',
            email: '',
            waNumber: '',
          },
          shifts: [],
          holidays: [],
        });
      }

      rosterDoc.siteName = siteName;

      // ── Populate Address & Contact (Corporate HO or Client Site) ──
      if (isTeamHO && hoLocation) {
        // Corporate Head Office Address
        const hoAddr = hoLocation.address || {};
        rosterDoc.billingAddress = {
          line1: hoAddr.line1 || '141B Ground Floor, OPP. LSR College',
          city: hoAddr.city || hoAddr.district || 'South Delhi',
          state: hoAddr.state || 'Delhi',
          pincode: hoAddr.pincode || '110048',
          country: 'India',
        };
        rosterDoc.deliveryAddress = {
          isSameAsBilling: true,
          line1: hoAddr.line1 || '141B Ground Floor, OPP. LSR College',
          city: hoAddr.city || hoAddr.district || 'South Delhi',
          state: hoAddr.state || 'Delhi',
          pincode: hoAddr.pincode || '110048',
          country: 'India',
        };
        rosterDoc.gstNo = hoLocation.gstin || lead.gst_number || '';
        rosterDoc.contactPerson = {
          name: 'Suresh Chauhan',
          mobile: '9212790790',
          email: 'admin@prathamservices.com',
          waNumber: '9212790790',
        };
      } else {
        // Client Site Address
        rosterDoc.billingAddress = {
          line1: lead.sender_address || lead.location?.address || rosterDoc.billingAddress.line1 || '',
          city: lead.sender_city || rosterDoc.billingAddress.city || '',
          state: lead.sender_state || rosterDoc.billingAddress.state || '',
          pincode: lead.sender_pincode || rosterDoc.billingAddress.pincode || '',
          country: 'India',
        };
        rosterDoc.deliveryAddress = {
          isSameAsBilling: true,
          line1: lead.location?.address || lead.sender_address || rosterDoc.deliveryAddress.line1 || '',
          city: lead.sender_city || rosterDoc.deliveryAddress.city || '',
          state: lead.sender_state || rosterDoc.deliveryAddress.state || '',
          pincode: lead.sender_pincode || rosterDoc.deliveryAddress.pincode || '',
          country: 'India',
        };
        if (lead.gst_number) rosterDoc.gstNo = lead.gst_number;
        rosterDoc.contactPerson = {
          name: lead.contact_person || lead.sender_name || '',
          mobile: lead.sender_mobile || '',
          email: lead.sender_email || '',
          waNumber: lead.sender_mobile || '',
        };
      }

      // ── Populate Shifts & Assigned Workers ──
      let siteShifts = Array.isArray(lead.siteShifts) ? [...lead.siteShifts] : [];
      let leadModified = false;

      if (isTeamHO) {
        // 🏢 Corporate Roster for Registered Users (HO / BR)
        // Bind registered corporate staff (CorpAdmin, Project, Sales, Finance)
        const hoWorkers = corpStaffEmps.map((emp) => ({
          workerId: emp._id,
          workerName: emp.name,
          enrollmentNo: emp.userRole || 'HO-Staff',
          mobile: emp.mobile,
          weeklyRestDay: 'Sun',
          assignedDate: now,
          status: 'Active',
        }));

        siteShifts = [{
          shiftName: 'General',
          groupName: 'MANG',
          shiftCode: 'G',
          startTime: '09:00',
          durationHrs: 8,
          shiftStartDate: now,
          workerSlots: hoWorkers.length > 0 ? hoWorkers.length : 1,
          billRate: 0,
          salaryRate: 0,
          active: true,
          boundWorkerId: hoWorkers[0]?.workerId || null,
          boundWorkerName: hoWorkers[0]?.workerName || 'Corporate Staff',
          weeklyRestDay: 'Sun',
        }];
        leadModified = true;

        rosterDoc.shifts = [{
          shiftCode: 'G',
          shiftName: 'General',
          groupName: 'MANG',
          startTime: '09:00',
          durationHrs: 8,
          shiftStartDate: now,
          workerSlots: hoWorkers.length > 0 ? hoWorkers.length : 1,
          billRate: 0,
          salaryRate: 0,
          active: true,
          workers: hoWorkers,
        }];
      } else {
        // 🛡️ Standard Client Site Shifts
        if (siteShifts.length === 0) {
          siteShifts = [{
            shiftName: 'Day',
            groupName: 'DaNi',
            shiftCode: 'D',
            startTime: '08:00',
            durationHrs: 12,
            shiftStartDate: now,
            workerSlots: 1,
            billRate: 15000,
            salaryRate: 12000,
            active: true,
          }];
          leadModified = true;
        }

        // Check duties
        const siteDutiesToday = Attendance
          ? await Attendance.find({
              $and: [
                { $or: [{ leadId: siteId }, { siteId }] },
                {
                  $or: [
                    { date: { $gte: startTodayUtc, $lte: endTodayUtc } },
                    { dutyStart: { $gte: startTodayUtc, $lte: endTodayUtc } },
                  ],
                },
                { status: { $nin: ['Absent', 'Leave'] } },
              ],
            }).lean()
          : [];

        const siteDutiesYesterday = Attendance
          ? await Attendance.find({
              $and: [
                { $or: [{ leadId: siteId }, { siteId }] },
                {
                  $or: [
                    { date: { $gte: startYesterdayUtc, $lte: endYesterdayUtc } },
                    { dutyStart: { $gte: startYesterdayUtc, $lte: endYesterdayUtc } },
                  ],
                },
                { status: { $nin: ['Absent', 'Leave'] } },
              ],
            }).lean()
          : [];

        const todayShiftDutyMap = new Map();
        for (const d of siteDutiesToday) {
          const code = String(d.shiftCode || '').trim().toUpperCase();
          if (code && !todayShiftDutyMap.has(code)) todayShiftDutyMap.set(code, d);
        }

        const yestShiftDutyMap = new Map();
        for (const d of siteDutiesYesterday) {
          const code = String(d.shiftCode || '').trim().toUpperCase();
          if (code && !yestShiftDutyMap.has(code)) yestShiftDutyMap.set(code, d);
        }

        const rosterShifts = [];
        for (let i = 0; i < siteShifts.length; i++) {
          const s = siteShifts[i];
          const code = String(s.shiftCode || '').trim().toUpperCase();
          if (!code) continue;

          const groupName = s.groupName === 'DaNi' || Number(s.durationHrs) === 12 ? 'DaNi' : 'MANG';
          const durationHrs = Number(s.durationHrs) || (groupName === 'DaNi' ? 12 : 8);
          const shiftStartDate = s.shiftStartDate ? new Date(s.shiftStartDate) : now;
          const workerSlots = Number(s.workerSlots) || 1;
          let salaryRate = Number(s.salaryRate) || 0;
          let billRate = Number(s.billRate) || 0;

          let boundWorkerId = s.boundWorkerId ? String(s.boundWorkerId._id || s.boundWorkerId) : null;
          let boundWorkerName = s.boundWorkerName || '';
          let boundWorkerEnr = s.boundWorkerEnrollment || '';
          let boundWorkerMob = s.boundWorkerMobile || '';

          if (!boundWorkerId && todayShiftDutyMap.has(code)) {
            const duty = todayShiftDutyMap.get(code);
            boundWorkerId = String(duty.employeeId);
            if (!salaryRate && duty.rate) salaryRate = Number(duty.rate);
            leadModified = true;
          } else if (!boundWorkerId && yestShiftDutyMap.has(code)) {
            const duty = yestShiftDutyMap.get(code);
            boundWorkerId = String(duty.employeeId);
            if (!salaryRate && duty.rate) salaryRate = Number(duty.rate);
            leadModified = true;
          }

          if (boundWorkerId) {
            const emp = empMap.get(boundWorkerId);
            if (emp) {
              boundWorkerName = emp.name || boundWorkerName;
              boundWorkerEnr = emp.enrollment_no || emp.enrollmentNo || boundWorkerEnr;
              boundWorkerMob = emp.mobile || boundWorkerMob;
            }
            s.boundWorkerId = boundWorkerId;
            s.boundWorkerName = boundWorkerName;
            s.boundWorkerEnrollment = boundWorkerEnr;
            s.boundWorkerMobile = boundWorkerMob;
            if (salaryRate) s.salaryRate = salaryRate;
          }

          s.groupName = groupName;
          s.durationHrs = durationHrs;
          s.shiftStartDate = shiftStartDate;

          const rawExempt = Array.isArray(s.exemptDays) ? s.exemptDays : [];
          const rawWeekly = (typeof s.weeklyRestDay === 'string' && s.weeklyRestDay.trim())
            ? s.weeklyRestDay.split(',').map((d) => d.trim()).filter(Boolean)
            : [];
          const combinedRest = Array.from(new Set([...rawExempt, ...rawWeekly]));
          const restStr = combinedRest.length > 0 ? combinedRest.join(', ') : null;

          const assignedWorkers = [];
          if (boundWorkerId) {
            assignedWorkers.push({
              workerId: boundWorkerId,
              workerName: boundWorkerName || 'Worker',
              enrollmentNo: boundWorkerEnr,
              mobile: boundWorkerMob,
              weeklyRestDay: restStr,
              exemptDays: combinedRest,
              salaryRate: s.salaryRate || salaryRate || 0,
              assignedDate: shiftStartDate,
              status: 'Active',
            });
          }

          rosterShifts.push({
            shiftCode: code,
            shiftName: s.shiftName || (groupName === 'DaNi' ? 'Day' : 'General'),
            groupName,
            startTime: s.startTime || '08:00',
            durationHrs,
            shiftStartDate,
            workerSlots,
            billRate,
            salaryRate: s.salaryRate || salaryRate || 0,
            weeklyRestDay: restStr,
            exemptDays: combinedRest,
            active: s.active !== false,
            workers: assignedWorkers,
          });
        }

        rosterDoc.shifts = rosterShifts;
      }

      if (leadModified) {
        await Leads.findByIdAndUpdate(siteId, { $set: { siteShifts, sender_name: siteName } });
      }

      rosterDoc.totalConfiguredShifts = rosterDoc.shifts.length;
      rosterDoc.totalRequiredWorkers = rosterDoc.shifts.reduce((acc, sh) => acc + (sh.active ? sh.workerSlots : 0), 0);
      rosterDoc.totalAssignedWorkers = rosterDoc.shifts.reduce((acc, sh) => acc + (sh.workers?.length || 0), 0);
      rosterDoc.status = rosterDoc.totalAssignedWorkers >= rosterDoc.totalRequiredWorkers ? 'Active' : 'Pending_Staffing';

      await rosterDoc.save();
      reconciledCount++;
    }

    return {
      totalActiveLeads: activeLeads.length,
      reconciledCount,
    };
  },

  syncRosterFromYesterdayDuties: async (req, res) => {
    try {
      const result = await exports.manageEmployees.reconcileSiteRostersInternal(req.tenantModels);
      if (req.io && req.tenantDbName) {
        req.io.to(req.tenantDbName).emit('roster:synced', result);
      }
      res.json({
        success: true,
        message: `Successfully reconciled ${result.reconciledCount} site rosters matching all ${result.totalActiveLeads} active leads.`,
        ...result,
      });
    } catch (err) {
      console.error('syncRosterFromYesterdayDuties error:', err);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  listSiteRosterHolidays: async (req, res) => {
    try {
      const { SiteRoster, SiteRosterHolidays, Leads } = req.tenantModels || {};
      const RosterModel = SiteRoster || SiteRosterHolidays;
      if (!RosterModel) {
        return res.status(500).json({ success: false, message: 'Tenant SiteRoster model not available' });
      }
      const { year, month, siteId, workerId, type } = req.query;

      const filter = {};
      if (siteId && mongoose.Types.ObjectId.isValid(siteId)) {
        filter.siteId = siteId;
      } else if (siteId === '__HO__' || siteId === '__corp__') {
        filter.siteId = '__HO__';
      }

      const { Employees } = req.tenantModels || {};
      const userMaster = require('../models/userMaster');
      const targetDb = req.tenantDbName || req.user?.dbName;
      const staffQuery = { userActive: { $ne: false } };
      if (targetDb) {
        staffQuery['accessCorporate.dbName'] = targetDb;
      }
      let registeredUsers = [];
      try {
        registeredUsers = await userMaster.find(staffQuery).select('_id userMobile userDisplayName').lean();
      } catch {}
      const regUserIds = new Set(registeredUsers.map((u) => String(u._id)));
      const regMobiles = new Set(registeredUsers.map((u) => String(u.userMobile || '').replace(/\D/g, '').slice(-10)).filter(Boolean));

      let empWithUser = [];
      try {
        if (Employees) {
          empWithUser = await Employees.find({ user_id: { $exists: true, $ne: null } }).select('_id user_id mobile').lean();
        }
      } catch {}
      const empUserLinkedIds = new Set(empWithUser.map((e) => String(e._id)));
      const empUserLinkedMobiles = new Set(empWithUser.map((e) => String(e.mobile || '').replace(/\D/g, '').slice(-10)).filter(Boolean));

      const rawRosters = await RosterModel.find(filter)
        .populate('siteId', 'sender_name client_name status siteShifts location sender_city')
        .sort({ siteName: 1 })
        .lean();

      // Resolve authoritative corporate profile locations (HO / BO)
      const { ProfileMaster } = req.tenantModels || {};
      let profileLocations = [];
      if (ProfileMaster) {
        try {
          const prof = await ProfileMaster.findOne({}).lean();
          if (prof && Array.isArray(prof.locations)) {
            profileLocations = prof.locations;
          }
        } catch {}
      }
      const hoLocation = profileLocations.find((l) => l.locationType === 'HO') || profileLocations[0] || null;
      const hoCityRaw = (hoLocation?.address?.city || hoLocation?.address?.district || (hoLocation?.locationName !== 'Head Office' ? hoLocation?.locationName : '') || 'Delhi').trim();
      const hoCleanCity = hoCityRaw.replace(/Head Office|Branch Office|Corporate Staff|Corporate/gi, '').replace(/^[-( ]+|[-) ]+$/g, '').trim() || 'Delhi';
      const canonicalHoName = `Corporate Staff (HO-${hoCleanCity})`;

      // ── Consolidate & Merge Duplicate Corporate (HO / BO) Rosters ──
      const rosters = [];
      const corporateMap = new Map();

      for (const r of rawRosters) {
        const leadDoc = (r.siteId && typeof r.siteId === 'object') ? r.siteId : null;
        const rawSiteName = r.siteName || leadDoc?.sender_name || leadDoc?.name || '';
        const isCorporate = r.siteId === '__HO__' || String(r.siteId?._id || '') === '__HO__' ||
          /Corporate Staff|Head Office|Team HO|\bHO\b|\bBO\b/i.test(rawSiteName);

        if (isCorporate) {
          const isBO = /Branch Office|\bBO\b/i.test(rawSiteName);
          const locType = isBO ? 'BO' : 'HO';
          const matchedLoc = isBO
            ? (profileLocations.find((l) => l.locationType === 'BO' || l.locationType === 'RO') || null)
            : hoLocation;
          const rawCity = (matchedLoc?.address?.city || matchedLoc?.address?.district || leadDoc?.sender_city || (matchedLoc?.locationName !== 'Head Office' && matchedLoc?.locationName) || hoCleanCity).trim();
          const cleanCity = rawCity.replace(/Head Office|Branch Office|Corporate Staff|Corporate/gi, '').replace(/^[-( ]+|[-) ]+$/g, '').trim() || hoCleanCity;
          const canonicalName = `Corporate Staff (${locType}-${cleanCity})`;
          const groupKey = `${locType}-${cleanCity.toLowerCase()}`;

          r.siteName = canonicalName;

          if (!corporateMap.has(groupKey)) {
            corporateMap.set(groupKey, r);
            rosters.push(r);
          } else {
            // Merge shifts & workers into existing canonical corporate roster
            const existing = corporateMap.get(groupKey);
            existing.siteName = canonicalName;
            const existingWorkerIds = new Set(
              (existing.shifts || []).flatMap((s) => s.workers || []).map((w) => String(w.workerId || w._id))
            );
            for (const sh of r.shifts || []) {
              const matchedShift = (existing.shifts || []).find((s) => s.shiftCode === sh.shiftCode);
              if (matchedShift) {
                matchedShift.workers = matchedShift.workers || [];
                for (const w of sh.workers || []) {
                  if (!existingWorkerIds.has(String(w.workerId || w._id))) {
                    matchedShift.workers.push(w);
                    existingWorkerIds.add(String(w.workerId || w._id));
                  }
                }
                matchedShift.workerSlots = Math.max(matchedShift.workerSlots || 1, matchedShift.workers.length);
              } else {
                existing.shifts = existing.shifts || [];
                existing.shifts.push(sh);
              }
            }
            existing.totalConfiguredShifts = existing.shifts?.length || 1;
            existing.totalAssignedWorkers = (existing.shifts || []).reduce((acc, s) => acc + (s.workers?.length || 0), 0);
            existing.totalRequiredWorkers = (existing.shifts || []).reduce((acc, s) => acc + (s.workerSlots || 1), 0);
          }
        } else {
          rosters.push(r);
        }
      }

      // If callers query flat items (e.g. SalaryRegister looking for holidays/leaves or legacy shift cards)
      const flatItems = [];
      const seenCorporateStaffIds = new Set();

      for (const r of rosters) {
        const leadDoc = (r.siteId && typeof r.siteId === 'object') ? r.siteId : null;
        const leadShifts = Array.isArray(leadDoc?.siteShifts) ? leadDoc.siteShifts : [];
        const isCorpDoc = r.siteId === '__HO__' || /Corporate Staff|Head Office|Team HO|\bHO\b|\bBO\b/i.test(r.siteName || '');

        // Flatten contract shifts into duty items
        for (const sh of r.shifts || []) {
          // Find matching shift from lead.siteShifts
          const matchedLeadShift = leadShifts.find((ls) =>
            (ls.shiftCode && sh.shiftCode && String(ls.shiftCode).toLowerCase() === String(sh.shiftCode).toLowerCase()) ||
            (ls.shiftName && sh.shiftName && ls.shiftName.trim().toLowerCase() === sh.shiftName.trim().toLowerCase())
          );

          // Resolve effective exemptDays and weeklyRestDay from shift or leadShift
          const rawExempt = Array.isArray(sh.exemptDays) && sh.exemptDays.length > 0
            ? sh.exemptDays
            : (Array.isArray(matchedLeadShift?.exemptDays) && matchedLeadShift.exemptDays.length > 0
              ? matchedLeadShift.exemptDays
              : []);
          const rawWeekly = (sh.weeklyRestDay || matchedLeadShift?.weeklyRestDay || '');
          const weeklyDays = (typeof rawWeekly === 'string' && rawWeekly.trim())
            ? rawWeekly.split(',').map((d) => d.trim()).filter(Boolean)
            : [];
          const shiftRestDays = Array.from(new Set([...rawExempt, ...weeklyDays]));
          const shiftRestStr = shiftRestDays.length > 0 ? shiftRestDays.join(', ') : null;

          // If sh.workers is empty, but matchedLeadShift has boundWorkerName or boundWorkerId, create duty worker
          const effectiveWorkers = (Array.isArray(sh.workers) && sh.workers.length > 0)
            ? sh.workers
            : (matchedLeadShift?.boundWorkerName || matchedLeadShift?.boundWorkerId
              ? [{
                  workerId: matchedLeadShift.boundWorkerId,
                  workerName: matchedLeadShift.boundWorkerName || 'Duty Worker',
                  enrollmentNo: matchedLeadShift.boundWorkerEnrollment || '',
                  mobile: matchedLeadShift.boundWorkerMobile || '',
                  weeklyRestDay: shiftRestStr,
                  exemptDays: shiftRestDays,
                  salaryRate: matchedLeadShift.salaryRate || sh.salaryRate || 0,
                  status: 'Active',
                }]
              : []);

          for (const w of effectiveWorkers) {
            const wid = String(w.workerId || matchedLeadShift?.boundWorkerId || '');
            if (isCorpDoc && wid) {
              if (seenCorporateStaffIds.has(wid)) continue;
              seenCorporateStaffIds.add(wid);
            }

            if (!workerId || String(w.workerId) === String(workerId)) {
              const wRawExempt = Array.isArray(w.exemptDays) && w.exemptDays.length > 0
                ? w.exemptDays
                : shiftRestDays;
              const wRawWeekly = w.weeklyRestDay || shiftRestStr;
              const wWeeklyDays = (typeof wRawWeekly === 'string' && wRawWeekly.trim())
                ? wRawWeekly.split(',').map((d) => d.trim()).filter(Boolean)
                : [];
              const combinedWorkerRestDays = Array.from(new Set([...wRawExempt, ...wWeeklyDays]));
              const workerRestStr = combinedWorkerRestDays.length > 0 ? combinedWorkerRestDays.join(', ') : null;

              const salary = (w.salaryRate !== undefined && w.salaryRate !== null && w.salaryRate !== '')
                ? Number(w.salaryRate)
                : (sh.salaryRate || matchedLeadShift?.salaryRate || 0);

              const cleanMob = String(w.mobile || matchedLeadShift?.boundWorkerMobile || '').replace(/\D/g, '').slice(-10);
              const isOwnDevice = (
                r.siteId === '__HO__' ||
                isCorpDoc ||
                regUserIds.has(wid) ||
                empUserLinkedIds.has(wid) ||
                (cleanMob && (regMobiles.has(cleanMob) || empUserLinkedMobiles.has(cleanMob)))
              );

              flatItems.push({
                _id: w._id || sh._id,
                siteId: leadDoc?._id || r.siteId?._id || r.siteId,
                siteName: r.siteName || leadDoc?.sender_name || 'Site',
                clientId: r.clientId,
                type: 'ShiftDuty',
                shiftCode: sh.shiftCode,
                shiftName: sh.shiftName || matchedLeadShift?.shiftName || 'Shift',
                groupName: sh.groupName || matchedLeadShift?.groupName || 'MANG',
                startTime: sh.startTime || matchedLeadShift?.startTime || '08:00',
                durationHrs: sh.durationHrs || matchedLeadShift?.durationHrs || 8,
                shiftStartDate: sh.shiftStartDate || matchedLeadShift?.shiftStartDate || new Date(),
                salaryRate: salary,
                billRate: sh.billRate || matchedLeadShift?.billRate || 0,
                workerId: w.workerId || matchedLeadShift?.boundWorkerId,
                workerName: w.workerName || matchedLeadShift?.boundWorkerName || 'Worker',
                enrollmentNo: w.enrollmentNo || matchedLeadShift?.boundWorkerEnrollment || '',
                mobile: w.mobile || matchedLeadShift?.boundWorkerMobile || '',
                weeklyRestDay: workerRestStr,
                exemptDays: combinedWorkerRestDays,
                restDayOfWeek: workerRestStr,
                isOwnDevice: Boolean(isOwnDevice),
                status: w.status || 'Active',
                remark: `Roster Contract Assignment (${sh.shiftCode})`,
                isPaid: true,
                year: Number(year) || new Date().getFullYear(),
                month: Number(month) || (new Date().getMonth() + 1),
              });
            }
          }
        }

        // Add site holidays
        for (const h of r.holidays || []) {
          if (!type || h.type === type) {
            flatItems.push({
              _id: h._id,
              siteId: r.siteId?._id || r.siteId,
              siteName: r.siteName,
              type: h.type,
              date: h.date,
              dayName: h.dayName,
              remark: h.remark,
              isPaid: h.isPaid,
              scope: h.scope || (h.workerId ? 'worker' : 'site'),
              workerId: h.workerId || null,
              workerName: h.workerName || null,
              year: Number(year) || new Date().getFullYear(),
              month: Number(month) || (new Date().getMonth() + 1),
            });
          }
        }
      }

      // Dynamic Corporate Staff Roster from userMaster (Active Registered Users)
      if (!siteId || siteId === '__HO__' || siteId === '__corp__') {
        let hoRoster = rosters.find(r => r.siteId === '__HO__' || /Corporate Staff|Head Office/i.test(r.siteName || ''));
        try {
          const userMaster = require('../models/userMaster');
          const targetDb = req.tenantDbName || req.user?.dbName;
          const staffQuery = { userActive: { $ne: false } };
          if (targetDb) {
            staffQuery['accessCorporate.dbName'] = targetDb;
          }

          const corporateStaff = await userMaster
            .find(staffQuery)
            .select('-userPassword')
            .lean();

          if (corporateStaff.length > 0) {
            const hoWorkers = corporateStaff.map((u, idx) => {
              const uSalary = u.dutyShift?.salaryRate ?? u.salaryRate ?? 0;
              const uExempt = Array.isArray(u.dutyShift?.exemptDays) && u.dutyShift.exemptDays.length > 0
                ? u.dutyShift.exemptDays
                : (Array.isArray(u.exemptDays) && u.exemptDays.length > 0 ? u.exemptDays : []);
              const uRest = u.dutyShift?.weeklyRestDay || u.weeklyRestDay || (uExempt.length ? uExempt.join(', ') : null);

              return {
                workerId: u._id,
                workerName: u.userDisplayName || u.name || ('Staff ' + (idx + 1)),
                enrollmentNo: u.userAadhar ? ('UID-' + String(u.userAadhar).slice(-4)) : (u.userRole || ('HO-' + (idx + 1))),
                mobile: u.userMobile || '',
                weeklyRestDay: uRest,
                exemptDays: uExempt,
                salaryRate: uSalary,
                status: 'Active',
              };
            });

            const staffSalarySum = hoWorkers.reduce((acc, w) => acc + (Number(w.salaryRate) || 0), 0);

            if (hoRoster) {
              hoRoster.siteName = canonicalHoName;
              const currentWorkers = (hoRoster.shifts || []).flatMap(s => s.workers || []);
              if (currentWorkers.length < hoWorkers.length) {
                if (!hoRoster.shifts || hoRoster.shifts.length === 0) {
                  hoRoster.shifts = [
                    {
                      shiftCode: 'G',
                      shiftName: 'General (Office Staff)',
                      groupName: 'MANG',
                      startTime: corporateStaff[0]?.dutyShift?.startFrom || '09:00',
                      durationHrs: corporateStaff[0]?.dutyShift?.durationHrs || 8,
                      shiftStartDate: new Date(),
                      workerSlots: Math.max(hoWorkers.length, 4),
                      salaryRate: staffSalarySum,
                      billRate: 0,
                      active: true,
                      workers: hoWorkers,
                    },
                  ];
                } else {
                  hoRoster.shifts[0].workers = hoWorkers;
                  hoRoster.shifts[0].workerSlots = Math.max(hoRoster.shifts[0].workerSlots || 1, hoWorkers.length, 4);
                  hoRoster.shifts[0].salaryRate = staffSalarySum;
                }
                hoRoster.totalConfiguredShifts = hoRoster.shifts.length;
                hoRoster.totalRequiredWorkers = Math.max(hoWorkers.length, 4);
                hoRoster.totalAssignedWorkers = hoWorkers.length;
              } else {
                hoRoster.totalAssignedWorkers = Math.max(hoRoster.totalAssignedWorkers || 0, currentWorkers.length);
                if (hoRoster.shifts && hoRoster.shifts[0]) {
                  hoRoster.shifts[0].salaryRate = Math.max(Number(hoRoster.shifts[0].salaryRate) || 0, staffSalarySum);
                }
              }
            } else {
              // Include in rosters as corporate roster
              rosters.unshift({
                _id: '__HO__',
                siteId: '__HO__',
                siteName: canonicalHoName,
                shifts: [
                  {
                    shiftCode: 'G',
                    shiftName: 'General (Office Staff)',
                    groupName: 'MANG',
                    startTime: corporateStaff[0]?.dutyShift?.startFrom || '09:00',
                    durationHrs: corporateStaff[0]?.dutyShift?.durationHrs || 8,
                    shiftStartDate: new Date(),
                    workerSlots: Math.max(corporateStaff.length, 4),
                    salaryRate: staffSalarySum,
                    billRate: 0,
                    active: true,
                    workers: hoWorkers,
                  },
                ],
                holidays: [],
                totalConfiguredShifts: 1,
                totalRequiredWorkers: Math.max(corporateStaff.length, 4),
                totalAssignedWorkers: corporateStaff.length,
              });
            }

            // Include each corporate staff member in flatItems if not already present
            for (const u of corporateStaff) {
              if (seenCorporateStaffIds.has(String(u._id)) || seenCorporateStaffIds.has(String(u.userDisplayName || u.name).toLowerCase())) continue;
              seenCorporateStaffIds.add(String(u._id));
              const uSalary = u.dutyShift?.salaryRate ?? u.salaryRate ?? 0;
              const uExempt = Array.isArray(u.dutyShift?.exemptDays) && u.dutyShift.exemptDays.length > 0
                ? u.dutyShift.exemptDays
                : (Array.isArray(u.exemptDays) && u.exemptDays.length > 0 ? u.exemptDays : []);
              const uRest = u.dutyShift?.weeklyRestDay || u.weeklyRestDay || (uExempt.length ? uExempt.join(', ') : null);

              flatItems.unshift({
                _id: u._id,
                siteId: '__HO__',
                siteName: canonicalHoName,
                type: 'ShiftDuty',
                shiftCode: 'G',
                shiftName: u.dutyShift?.shiftName || 'General (Office Staff)',
                groupName: u.dutyShift?.groupName || 'MANG',
                startTime: u.dutyShift?.startFrom || '09:00',
                durationHrs: u.dutyShift?.durationHrs || 8,
                shiftStartDate: new Date(),
                salaryRate: uSalary,
                billRate: 0,
                workerId: u._id,
                workerName: u.userDisplayName || u.name || 'Staff Member',
                enrollmentNo: u.userAadhar ? ('UID-' + String(u.userAadhar).slice(-4)) : (u.userRole || 'STAFF'),
                mobile: u.userMobile || '',
                restDayOfWeek: uRest,
                exemptDays: uExempt,
                status: 'Active',
                remark: 'Corporate Staff Assignment (' + (u.userRole || 'Office') + ')',
                isPaid: true,
                year: Number(year) || new Date().getFullYear(),
                month: Number(month) || (new Date().getMonth() + 1),
              });
            }
          }
        } catch (uErr) {
          console.warn('listSiteRosterHolidays -> dynamic userMaster staff error:', uErr.message);
        }
      }

      res.json({
        success: true,
        data: flatItems,
        rosters,
        totalRosters: rosters.length,
      });
    } catch (err) {
      console.error('listSiteRosterHolidays error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  saveSiteRosterHoliday: async (req, res) => {
    try {
      const { SiteRoster, SiteRosterHolidays, Leads, Employees } = req.tenantModels || {};
      const RosterModel = SiteRoster || SiteRosterHolidays;
      if (!RosterModel) {
        return res.status(500).json({ success: false, message: 'Tenant SiteRoster model not available' });
      }

      const {
        siteId,
        shiftCode,
        workerId,
        workerName,
        salaryRate,
        billRate,
        groupName,
        shiftName,
        startTime,
        durationHrs,
        shiftStartDate,
        restDayOfWeek,
        type,
        date,
        dayName,
        remark,
        isPaid,
        billingAddress,
        deliveryAddress,
        gstNo,
        contactPerson,
      } = req.body;

      let effectiveSiteId = siteId;
      if (!effectiveSiteId && workerId && Employees) {
        try {
          const emp = await Employees.findById(workerId).lean();
          if (emp?.assignedSiteId || emp?.siteId || emp?.leadId) {
            effectiveSiteId = String(emp.assignedSiteId || emp.siteId || emp.leadId);
          }
        } catch {}
      }
      if (!effectiveSiteId && workerId) {
        effectiveSiteId = '__HO__';
      }
      if (!effectiveSiteId) {
        return res.status(400).json({ success: false, message: 'siteId is required' });
      }

      let rosterDoc = await RosterModel.findOne({ siteId: effectiveSiteId });
      if (!rosterDoc) {
        let siteName = effectiveSiteId === '__HO__' ? 'Head Office' : 'Site';
        if (Leads && effectiveSiteId !== '__HO__') {
          const l = await Leads.findById(effectiveSiteId).lean();
          if (l) siteName = l.sender_name || l.client_name || l.name || siteName;
        }
        rosterDoc = new RosterModel({
          siteId: effectiveSiteId,
          siteName,
          shifts: [],
          holidays: [],
        });
      }

      // Update Site Profile if passed
      if (gstNo !== undefined) rosterDoc.gstNo = gstNo;
      if (billingAddress) rosterDoc.billingAddress = { ...rosterDoc.billingAddress, ...billingAddress };
      if (deliveryAddress) rosterDoc.deliveryAddress = { ...rosterDoc.deliveryAddress, ...deliveryAddress };
      if (contactPerson) rosterDoc.contactPerson = { ...rosterDoc.contactPerson, ...contactPerson };

      const now = new Date();

      // Case 1: Holiday / Off addition
      if (type && type !== 'ShiftDuty') {
        const dObj = date ? new Date(date) : now;
        const holidayEntry = {
          date: typeof date === 'string' ? date : dObj.toISOString().slice(0, 10),
          dayName: dayName || dObj.toLocaleDateString('en-US', { weekday: 'short' }),
          type: type || 'WeeklyRest',
          remark: remark || (workerName ? `${type} - ${workerName}` : 'Site Off / Holiday'),
          isPaid: isPaid !== undefined ? Boolean(isPaid) : true,
          scope: workerId ? 'worker' : (req.body.scope || 'site'),
          workerId: workerId || null,
          workerName: workerName || null,
        };
        rosterDoc.holidays.push(holidayEntry);
        await rosterDoc.save();
        return res.status(201).json({ success: true, message: 'Holiday/Leave saved to site roster', data: rosterDoc });
      }

      // Case 2: Shift worker change / replacement (Strictly replaces assigned worker)
      if (shiftCode) {
        const code = String(shiftCode).trim().toUpperCase();
        let targetShift = (rosterDoc.shifts || []).find((s) => s.shiftCode === code);

        const effGroupName = groupName === 'DaNi' || Number(durationHrs) === 12 ? 'DaNi' : 'MANG';
        const effDurationHrs = Number(durationHrs) || (effGroupName === 'DaNi' ? 12 : 8);
        const effStartDate = shiftStartDate ? new Date(shiftStartDate) : now;

        const siteRosterRateChanges = [];
        if (targetShift) {
          const shiftLabel = targetShift.shiftName || code;
          if (salaryRate !== undefined && Number(targetShift.salaryRate || 0) !== Number(salaryRate)) {
            const oldSal = Number(targetShift.salaryRate || 0);
            const newSal = Number(salaryRate);
            const diff = newSal - oldSal;
            const sign = diff > 0 ? `+₹${diff.toLocaleString('en-IN')}` : `-₹${Math.abs(diff).toLocaleString('en-IN')}`;
            siteRosterRateChanges.push(`• Shift [${shiftLabel}]: Pay Rate revised from ₹${oldSal.toLocaleString('en-IN')} ➔ ₹${newSal.toLocaleString('en-IN')} (${sign})`);
          }
          if (billRate !== undefined && Number(targetShift.billRate || 0) !== Number(billRate)) {
            const oldBill = Number(targetShift.billRate || 0);
            const newBill = Number(billRate);
            const diff = newBill - oldBill;
            const sign = diff > 0 ? `+₹${diff.toLocaleString('en-IN')}` : `-₹${Math.abs(diff).toLocaleString('en-IN')}`;
            siteRosterRateChanges.push(`• Shift [${shiftLabel}]: Bill Rate revised from ₹${oldBill.toLocaleString('en-IN')} ➔ ₹${newBill.toLocaleString('en-IN')} (${sign})`);
          }
        }

        if (!targetShift) {
          // Add new shift
          targetShift = {
            shiftCode: code,
            shiftName: shiftName || (effGroupName === 'DaNi' ? 'Day' : 'General'),
            groupName: effGroupName,
            startTime: startTime || '08:00',
            durationHrs: effDurationHrs,
            shiftStartDate: effStartDate,
            workerSlots: 1,
            billRate: Number(billRate) || 0,
            salaryRate: Number(salaryRate) || 0,
            active: true,
            workers: [],
          };
          rosterDoc.shifts.push(targetShift);
        } else {
          // Update shift contract details
          if (groupName) targetShift.groupName = effGroupName;
          if (durationHrs) targetShift.durationHrs = effDurationHrs;
          if (shiftStartDate) targetShift.shiftStartDate = effStartDate;
          if (salaryRate !== undefined) targetShift.salaryRate = Number(salaryRate);
          if (billRate !== undefined) targetShift.billRate = Number(billRate);
          if (startTime) targetShift.startTime = startTime;
          if (shiftName) targetShift.shiftName = shiftName;
        }

        // Change assigned worker (atomic replace, no runaway addition)
        let wEnr = '';
        let wMob = '';
        let finalWorkerName = workerName || '';
        if (workerId && Employees) {
          const emp = await Employees.findById(workerId).lean();
          if (emp) {
            finalWorkerName = emp.name || finalWorkerName;
            wEnr = emp.enrollment_no || emp.enrollmentNo || '';
            wMob = emp.mobile || '';
          }
        }

        if (workerId) {
          targetShift.workers = [{
            workerId,
            workerName: finalWorkerName || 'Worker',
            enrollmentNo: wEnr,
            mobile: wMob,
            weeklyRestDay: restDayOfWeek || null,
            assignedDate: effStartDate,
            status: 'Active',
          }];
        }

        // Two-way sync to Leads.siteShifts
        if (Leads) {
          try {
            const leadDoc = await Leads.findById(siteId);
            if (leadDoc && Array.isArray(leadDoc.siteShifts)) {
              let shiftIdx = leadDoc.siteShifts.findIndex((s) => s.shiftCode === code);
              if (shiftIdx === -1) {
                leadDoc.siteShifts.push({
                  shiftCode: code,
                  shiftName: targetShift.shiftName,
                  groupName: targetShift.groupName,
                  startTime: targetShift.startTime,
                  durationHrs: targetShift.durationHrs,
                  shiftStartDate: targetShift.shiftStartDate,
                  workerSlots: targetShift.workerSlots,
                  billRate: targetShift.billRate,
                  salaryRate: targetShift.salaryRate,
                  active: true,
                  boundWorkerId: workerId || null,
                  boundWorkerName: finalWorkerName,
                  boundWorkerEnrollment: wEnr,
                  boundWorkerMobile: wMob,
                  weeklyRestDay: restDayOfWeek || null,
                });
              } else {
                if (workerId) {
                  leadDoc.siteShifts[shiftIdx].boundWorkerId = workerId;
                  leadDoc.siteShifts[shiftIdx].boundWorkerName = finalWorkerName;
                  leadDoc.siteShifts[shiftIdx].boundWorkerEnrollment = wEnr;
                  leadDoc.siteShifts[shiftIdx].boundWorkerMobile = wMob;
                }
                if (salaryRate !== undefined) leadDoc.siteShifts[shiftIdx].salaryRate = Number(salaryRate);
                if (billRate !== undefined) leadDoc.siteShifts[shiftIdx].billRate = Number(billRate);
                if (restDayOfWeek) leadDoc.siteShifts[shiftIdx].weeklyRestDay = restDayOfWeek;
                leadDoc.siteShifts[shiftIdx].shiftStartDate = effStartDate;
                leadDoc.siteShifts[shiftIdx].groupName = effGroupName;
              }
              await leadDoc.save();
              if (req.io && req.tenantDbName) {
                req.io.to(req.tenantDbName).emit('lead:updated', { data: leadDoc });
              }
            }
          } catch (leadSyncErr) {
            console.warn('saveSiteRosterHoliday -> Leads sync error:', leadSyncErr.message);
          }
        }
      }

      rosterDoc.totalConfiguredShifts = rosterDoc.shifts.length;
      rosterDoc.totalRequiredWorkers = rosterDoc.shifts.reduce((acc, sh) => acc + (sh.active ? sh.workerSlots : 0), 0);
      rosterDoc.totalAssignedWorkers = rosterDoc.shifts.reduce((acc, sh) => acc + (sh.workers?.length || 0), 0);
      await rosterDoc.save();

      // ── Dispatch Rate Revision Alert & Chat Notification to Admins ──
      if (typeof siteRosterRateChanges !== 'undefined' && siteRosterRateChanges.length > 0) {
        await _dispatchRateChangeAlerts({
          req,
          siteName: rosterDoc.siteName || 'Site',
          source: 'Daily Roster',
          changes: siteRosterRateChanges,
        });
      }

      res.status(200).json({
        success: true,
        message: 'Site roster updated successfully',
        data: rosterDoc,
        rateChangesCount: typeof siteRosterRateChanges !== 'undefined' ? siteRosterRateChanges.length : 0,
      });
    } catch (err) {
      console.error('saveSiteRosterHoliday error:', err.message);
      res.status(400).json({ success: false, message: err.message });
    }
  },

  setupSiteWeeklyRest: async (req, res) => {
    try {
      const { SiteRoster, SiteRosterHolidays, Leads } = req.tenantModels || {};
      const RosterModel = SiteRoster || SiteRosterHolidays;
      const { siteId, workerId, restDayOfWeek } = req.body;
      if (!siteId || !workerId || !restDayOfWeek) {
        return res.status(400).json({ success: false, message: 'siteId, workerId and restDayOfWeek are required' });
      }

      const rosterDoc = await RosterModel.findOne({ siteId });
      if (rosterDoc && Array.isArray(rosterDoc.shifts)) {
        for (const sh of rosterDoc.shifts) {
          for (const w of sh.workers || []) {
            if (String(w.workerId) === String(workerId)) {
              w.weeklyRestDay = restDayOfWeek;
            }
          }
        }
        await rosterDoc.save();
      }

      // Sync into Leads.siteShifts
      if (Leads) {
        const leadDoc = await Leads.findById(siteId);
        if (leadDoc && Array.isArray(leadDoc.siteShifts)) {
          for (const s of leadDoc.siteShifts) {
            if (String(s.boundWorkerId) === String(workerId)) {
              s.weeklyRestDay = restDayOfWeek;
            }
          }
          await leadDoc.save();
        }
      }

      res.json({ success: true, message: 'Weekly rest saved to roster', data: { siteId, workerId, restDayOfWeek } });
    } catch (err) {
      console.error('setupSiteWeeklyRest error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  
  saveCorporateRoster: async (req, res) => {
    try {
      const { staffConfigs } = req.body;
      if (!Array.isArray(staffConfigs)) {
        return res.status(400).json({ success: false, message: 'staffConfigs must be an array' });
      }

      const userMaster = require('../models/userMaster');
      const { SiteRoster, SiteRosterHolidays } = req.tenantModels || {};
      const RosterModel = SiteRoster || SiteRosterHolidays;

      // ── Detect Corporate Staff Pay Rate Revisions ──
      const userIds = staffConfigs.map((s) => s.userId || s._id).filter(Boolean);
      let existingStaffUsers = [];
      try {
        existingStaffUsers = await userMaster
          .find({ _id: { $in: userIds } })
          .select('_id userDisplayName name salaryRate dutyShift')
          .lean();
      } catch (fErr) {
        console.warn('saveCorporateRoster -> existing users lookup error:', fErr.message);
      }
      const corpRateChanges = [];

      const updatedUsers = [];
      const rosterWorkers = [];

      for (const item of staffConfigs) {
        const userId = item.userId || item._id;
        if (!userId) continue;

        const rawExempt = Array.isArray(item.exemptDays) ? item.exemptDays : [];
        const rawWeekly = (typeof item.weeklyRestDay === 'string' && item.weeklyRestDay.trim())
          ? item.weeklyRestDay.split(',').map((d) => d.trim()).filter(Boolean)
          : [];
        const combined = Array.from(new Set([...rawExempt, ...rawWeekly]));
        const weeklyRestDay = combined.length > 0 ? combined.join(', ') : null;
        const salaryRate = Number(item.salaryRate) || 0;

        const oldStaff = existingStaffUsers.find((u) => String(u._id) === String(userId));
        const oldSalary = Number(oldStaff?.dutyShift?.salaryRate ?? oldStaff?.salaryRate ?? 0);
        if (oldStaff && oldSalary !== salaryRate) {
          const diff = salaryRate - oldSalary;
          const sign = diff > 0 ? `+₹${diff.toLocaleString('en-IN')}` : `-₹${Math.abs(diff).toLocaleString('en-IN')}`;
          const staffName = oldStaff.userDisplayName || oldStaff.name || 'Staff';
          corpRateChanges.push(`• Corporate Staff [${staffName}]: Monthly Pay Rate revised from ₹${oldSalary.toLocaleString('en-IN')} ➔ ₹${salaryRate.toLocaleString('en-IN')} (${sign})`);
        }

        // 1. Update in userMaster
        const updated = await userMaster.findByIdAndUpdate(
          userId,
          {
            $set: {
              salaryRate: salaryRate,
              'dutyShift.salaryRate': salaryRate,
              'dutyShift.weeklyRestDay': weeklyRestDay,
              'dutyShift.exemptDays': combined,
              ...(item.startFrom ? { 'dutyShift.startFrom': item.startFrom } : {}),
              ...(item.durationHrs ? { 'dutyShift.durationHrs': Number(item.durationHrs) } : {}),
            },
          },
          { new: true }
        ).select('-userPassword').lean();

        if (updated) {
          updatedUsers.push(updated);
          rosterWorkers.push({
            workerId: updated._id,
            workerName: updated.userDisplayName || updated.name || 'Staff',
            enrollmentNo: updated.userAadhar ? ('UID-' + String(updated.userAadhar).slice(-4)) : (updated.userRole || 'HO-Staff'),
            mobile: updated.userMobile || '',
            weeklyRestDay: weeklyRestDay,
            exemptDays: combined,
            salaryRate: salaryRate,
            assignedDate: new Date(),
            status: 'Active',
          });
        }
      }

      // 2. Save all information in SiteRoster (Contract Master for Corporate HO)
      if (RosterModel) {
        const { ProfileMaster, Leads } = req.tenantModels || {};
        let profileLocations = [];
        if (ProfileMaster) {
          try {
            const prof = await ProfileMaster.findOne({}).lean();
            if (prof && Array.isArray(prof.locations)) profileLocations = prof.locations;
          } catch {}
        }
        const hoLocation = profileLocations.find((l) => l.locationType === 'HO') || profileLocations[0] || null;
        const hoCity = (hoLocation?.address?.city || hoLocation?.address?.district || (hoLocation?.locationName !== 'Head Office' ? hoLocation?.locationName : '') || 'Delhi').trim();
        const cleanCity = hoCity.replace(/Head Office|Branch Office|Corporate Staff|Corporate/gi, '').replace(/^[-( ]+|[-) ]+$/g, '').trim() || 'Delhi';
        const canonicalHoName = `Corporate Staff (HO-${cleanCity})`;

        let corpRoster = await RosterModel.findOne({ siteId: '__HO__' });
        if (!corpRoster) {
          corpRoster = new RosterModel({
            siteId: '__HO__',
            siteName: canonicalHoName,
            shifts: [],
            holidays: [],
          });
        }

        corpRoster.siteName = canonicalHoName;
        corpRoster.shifts = [
          {
            shiftCode: 'G',
            shiftName: 'General (Office Staff)',
            groupName: 'MANG',
            startTime: staffConfigs[0]?.startFrom || '09:00',
            durationHrs: Number(staffConfigs[0]?.durationHrs) || 8,
            shiftStartDate: new Date(),
            workerSlots: rosterWorkers.length,
            salaryRate: 0,
            billRate: 0,
            active: true,
            weeklyRestDay: null,
            exemptDays: [],
            workers: rosterWorkers,
          },
        ];
        corpRoster.totalConfiguredShifts = 1;
        corpRoster.totalRequiredWorkers = rosterWorkers.length;
        corpRoster.totalAssignedWorkers = rosterWorkers.length;
        await corpRoster.save();

        // 🗑️ Clean up duplicate legacy separate rosters for HO leads
        if (Leads) {
          try {
            const hoLeads = await Leads.find({ sender_name: { $regex: /Head Office|Team HO|Corporate/i } }).select('_id').lean();
            if (hoLeads.length > 0) {
              const hoLeadIds = hoLeads.map((l) => l._id);
              await RosterModel.deleteMany({ siteId: { $in: hoLeadIds } });
            }
          } catch {}
        }
      }

      // ── Dispatch Rate Revision Alert & Chat Notification to Admins ──
      if (corpRateChanges.length > 0) {
        await _dispatchRateChangeAlerts({
          req,
          siteName: 'Corporate Staff (HO)',
          source: 'Daily Roster (Corporate Staff Setup)',
          changes: corpRateChanges,
        });
      }

      res.json({
        success: true,
        message: 'Corporate roster, salary and rest days saved successfully',
        data: updatedUsers,
        rateChangesCount: corpRateChanges.length,
      });
    } catch (err) {
      console.error('saveCorporateRoster error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  generateYearHolidays: async (req, res) => {
    try {
      const { SiteRoster, SiteRosterHolidays } = req.tenantModels || {};
      const RosterModel = SiteRoster || SiteRosterHolidays;
      const { siteId, holidays } = req.body;
      if (!siteId || !Array.isArray(holidays)) {
        return res.status(400).json({ success: false, message: 'siteId and holidays array are required' });
      }

      const rosterDoc = await RosterModel.findOne({ siteId });
      if (!rosterDoc) {
        return res.status(404).json({ success: false, message: 'Site roster not found' });
      }

      for (const h of holidays) {
        const d = new Date(h.date);
        rosterDoc.holidays.push({
          date: h.date,
          dayName: h.dayName || (!isNaN(d.getDay()) ? d.toLocaleDateString('en-US', { weekday: 'short' }) : ''),
          type: h.type || 'NationalHoliday',
          remark: h.remark || h.name || 'Holiday',
          isPaid: h.isPaid !== undefined ? Boolean(h.isPaid) : true,
        });
      }

      await rosterDoc.save();
      res.json({ success: true, message: `Added ${holidays.length} holidays to site roster`, data: rosterDoc });
    } catch (err) {
      console.error('generateYearHolidays error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  deleteSiteRosterHoliday: async (req, res) => {
    try {
      const { SiteRoster, SiteRosterHolidays, Leads } = req.tenantModels || {};
      const RosterModel = SiteRoster || SiteRosterHolidays;
      const userMaster = require('../models/userMaster');
      const { id } = req.params;

      const deletedCount = await _executeRosterRemoval(RosterModel, Leads, userMaster, id);
      if (deletedCount === 0) {
        return res.status(404).json({ success: false, message: 'Roster record not found or already removed' });
      }

      res.json({ success: true, message: 'Roster record removed successfully', deletedCount });
    } catch (err) {
      console.error('deleteSiteRosterHoliday error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  batchDeleteSiteRosterHolidays: async (req, res) => {
    try {
      const { SiteRoster, SiteRosterHolidays, Leads } = req.tenantModels || {};
      const RosterModel = SiteRoster || SiteRosterHolidays;
      const userMaster = require('../models/userMaster');
      const { ids, items } = req.body;

      const targets = Array.isArray(items) && items.length > 0 ? items : (Array.isArray(ids) ? ids : []);
      if (targets.length === 0) {
        return res.status(400).json({ success: false, message: 'No records provided for deletion' });
      }

      let totalDeleted = 0;
      for (const target of targets) {
        try {
          const count = await _executeRosterRemoval(RosterModel, Leads, userMaster, target);
          totalDeleted += count;
        } catch (itemErr) {
          console.warn('batchDelete error for target:', target, itemErr.message);
        }
      }

      res.json({ success: true, message: `Removed ${totalDeleted} record(s) successfully`, deletedCount: totalDeleted });
    } catch (err) {
      console.error('batchDeleteSiteRosterHolidays error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  listWorkerPenalties: async (req, res) => {
    try {
      const { Attendance } = req.tenantModels || {};
      const { workerId, year, month } = req.query;
      const filter = {
        $or: [
          { penaltyImposed: { $gt: 0 } },
          { penaltyDeducted: { $gt: 0 } },
          { penaltyAmount: { $gt: 0 } },
        ],
      };

      if (workerId) {
        const wid = String(workerId);
        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [
            { employeeId: wid },
            ...(mongoose.Types.ObjectId.isValid(wid) ? [{ employeeId: new mongoose.Types.ObjectId(wid) }] : []),
          ],
        });
      }
      if (year && month) {
        const startOfMonth = new Date(Number(year), Number(month) - 1, 1, 0, 0, 0, 0);
        const endOfMonth = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [
            { date: { $gte: startOfMonth, $lte: endOfMonth } },
            { dutyStart: { $gte: startOfMonth, $lte: endOfMonth } },
          ],
        });
      }

      const records = await Attendance.find(filter)
        .populate('employeeId', 'name mobile enrollment_no')
        .sort({ date: -1 })
        .lean();

      const formatted = records.map((r) => {
        const rawWorkerId = r.employeeId?._id || r.employeeId || '';
        const rawWorkerName = r.employeeId?.name || r.workerName || 'Worker';
        const imp = Number(r.penaltyImposed) || Number(r.penaltyAmount) || 0;
        const ded = Number(r.penaltyDeducted) || 0;
        const wai = Number(r.penaltyWaivedOff) || 0;
        return {
          _id: r._id,
          id: String(rawWorkerId),
          workerId: String(rawWorkerId),
          workerName: rawWorkerName,
          penaltyImposed: imp,
          penaltyDeducted: ded,
          penaltyWaivedOff: wai,
          penaltyAmount: imp,
          penaltyReason: r.penaltyReason || '',
          violationType: r.violationType || '',
          date: r.date,
        };
      });

      res.json({ success: true, data: formatted });
    } catch (err) {
      console.error('listWorkerPenalties error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  listPenaltyRecords: async (req, res) => {
    return module.exports.manageEmployees.listWorkerPenalties(req, res);
  },

  saveWorkerPenalty: async (req, res) => {
    try {
      const { Attendance } = req.tenantModels || {};
      if (!Attendance) {
        return res.status(500).json({ success: false, message: 'Tenant Attendance model not available' });
      }
      const { id } = req.params;
      const { workerId, deductedAmount, penaltyImposed, penaltyReason, violationType, date, month, year, settleMonth } = req.body;

      const targetEmpId = workerId || req.body.employeeId || id;

      // ── BATCH SETTLE MONTHLY PENALTIES ON SALARY POSTING (100% Same-Month Recovery) ──
      if (settleMonth || (deductedAmount !== undefined && month && year && !date)) {
        const m = Number(month);
        const y = Number(year);
        if (m && y && targetEmpId) {
          const startOfMonth = new Date(y, m - 1, 1, 0, 0, 0, 0);
          const endOfMonth = new Date(y, m, 0, 23, 59, 59, 999);
          const empOr = [
            { employeeId: targetEmpId },
            ...(mongoose.Types.ObjectId.isValid(targetEmpId) ? [{ employeeId: new mongoose.Types.ObjectId(targetEmpId) }] : []),
          ];
          const attDocs = await Attendance.find({
            $and: [
              { $or: empOr },
              {
                $or: [
                  { date: { $gte: startOfMonth, $lte: endOfMonth } },
                  { dutyStart: { $gte: startOfMonth, $lte: endOfMonth } },
                ],
              },
              {
                $or: [
                  { penaltyImposed: { $gt: 0 } },
                  { penaltyAmount: { $gt: 0 } },
                ],
              },
            ],
          });
          for (const doc of attDocs) {
            const imp = Number(doc.penaltyImposed) || Number(doc.penaltyAmount) || 0;
            const wai = Number(doc.penaltyWaivedOff) || 0;
            doc.penaltyDeducted = Math.max(0, imp - wai);
            await doc.save();
          }
          return res.json({ success: true, message: 'Monthly penalties settled in attendance', count: attDocs.length });
        }
      }

      let query = {};
      let isAttendanceDoc = false;
      if (id && mongoose.Types.ObjectId.isValid(id)) {
        const exists = await Attendance.exists({ _id: id });
        if (exists) {
          query._id = id;
          isAttendanceDoc = true;
        }
      }

      if (!isAttendanceDoc && targetEmpId) {
        query.employeeId = targetEmpId;
        if (date) {
          const d = new Date(date);
          const startOfDay = new Date(d);
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date(d);
          endOfDay.setHours(23, 59, 59, 999);
          query.date = { $gte: startOfDay, $lte: endOfDay };
        }
      }

      const updateFields = {
        penaltyReason: penaltyReason || 'Administrative penalty deduction',
        penaltyApprovedBy: req.user?.userDisplayName || req.user?.name || 'Admin',
      };
      if (deductedAmount !== undefined) updateFields.penaltyDeducted = Number(deductedAmount);
      if (penaltyImposed !== undefined) updateFields.penaltyImposed = Number(penaltyImposed);
      if (violationType) updateFields.violationType = violationType;
      if (req.body.penaltyWaivedOff !== undefined) updateFields.penaltyWaivedOff = Number(req.body.penaltyWaivedOff);
      if (req.body.penaltyMediaUrl !== undefined) updateFields.penaltyMediaUrl = req.body.penaltyMediaUrl;
      if (req.body.penaltyMedia !== undefined) updateFields.penaltyMedia = req.body.penaltyMedia;

      const setOnInsert = {
        employeeId: targetEmpId,
        employeeType: 'Employees',
        date: date ? new Date(date) : new Date(),
        status: 'Absent',
        hoursWorked: 0,
      };

      const updated = await Attendance.findOneAndUpdate(
        query,
        { $set: updateFields, $setOnInsert: setOnInsert },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      res.json({ success: true, message: 'Worker penalty recorded', data: updated });
    } catch (err) {
      console.error('saveWorkerPenalty error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },

  deleteWorkerPenalty: async (req, res) => {
    try {
      const { Attendance } = req.tenantModels || {};
      if (!Attendance) {
        return res.status(500).json({ success: false, message: 'Tenant Attendance model not available' });
      }
      const { id } = req.params;
      await Attendance.findByIdAndUpdate(id, {
        $set: {
          penaltyImposed: 0,
          penaltyDeducted: 0,
          penaltyWaivedOff: 0,
          penaltyReason: '',
        },
      });
      res.json({ success: true, message: 'Worker penalty removed' });
    } catch (err) {
      console.error('deleteWorkerPenalty error:', err.message);
      res.status(500).json({ success: false, message: err.message });
    }
  },


};

exports.manageStaff = {
  list: async (req, res) => {
    try {
      const staff = await userMaster
        .find({
          'accessCorporate.dbName': req.tenantDbName || req.user.dbName,
        })
        .select('-userPassword')
        .lean();
      res.json({ success: true, data: staff });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  create: async (req, res) => {
    // Registration logic is already in authController.register
    res.status(400).json({ success: false, message: 'Use /api/auth/register for new staff' });
  },
  update: async (req, res) => {
    try {
      const requesterRole = req.user?.userRole;

      // Only CorpAdmin and userAdmin can update shift timing for registered users
      if (req.body.dutyShift && !['CorpAdmin', 'userAdmin'].includes(requesterRole)) {
        return res.status(403).json({
          success: false,
          message: 'Only CorpAdmin and userAdmin can update shift timing for registered users.',
        });
      }

      const staff = await userMaster
        .findByIdAndUpdate(req.params.id, req.body, { new: true })
        .select('-userPassword');

      // 💸 Create Petty Cash Book if allowed cash flow or is Project/Admin/Finance role
      if (
        staff.allowCashFlow ||
        ['CorpAdmin', 'userAdmin', 'Project', 'Finance'].includes(staff.userRole)
      ) {
        try {
          const dbConnector = require('../utils/dbConnector');
          const { getTenantModels } = require('../models/TenantModels');
          const financeCtrl = require('./FinanceController');
          const targetDbName = staff.accessCorporate?.[0]?.dbName;

          if (targetDbName) {
            const tenantConnection = await dbConnector.getTenantConnection(targetDbName);
            const models = getTenantModels(tenantConnection);

            await financeCtrl.ensureLedgerFolioInternal(models, {
              name: `Petty Cash - ${staff.userDisplayName}`,
              group: 'Cash-in-hand',
              nature: 'Dr',
              refId: staff._id,
              refType: 'User',
            });
            console.log(
              `Auto-created Petty Cash Book for ${staff.userDisplayName} in ${targetDbName}`
            );
          }
        } catch (pcErr) {
          console.error('Failed to auto-create Petty Cash Book:', pcErr.message);
        }
      }

      // 👷 Sync with Employee Collection for specific roles
      if (['Project', 'Sales', 'Finance'].includes(staff.userRole)) {
        try {
          const dbConnector = require('../utils/dbConnector');
          const { getTenantModels } = require('../models/TenantModels');
          const targetDbName = staff.accessCorporate?.[0]?.dbName;

          if (targetDbName) {
            const tenantConnection = await dbConnector.getTenantConnection(targetDbName);
            const models = getTenantModels(tenantConnection);

            // Check if employee already exists
            let emp = await models.Employees.findOne({ mobile: staff.userMobile });

            const newHistoryEntry = {
              joinDate: new Date(),
              daily_rate: req.body.daily_rate || 0,
              monthly_rate: req.body.monthly_rate || 0,
              shiftStartTime: req.body.shiftStartTime || '08:00',
              shiftHours: req.body.shiftHours || 8,
              groupName: req.body.groupName || 'MANG',
              shiftName: req.body.shiftName || 'Morning',
              active: true,
              notes: 'Profile update from userMaster',
            };

            if (!emp) {
              emp = new models.Employees({
                name: staff.userDisplayName,
                mobile: staff.userMobile,
                role: staff.userRole,
                active: true,
                addresses: staff.addresses,
                user_id: staff._id,
                employmentHistory: [newHistoryEntry],
              });
              await emp.save();
              console.log(`Auto-created employee record for ${staff.userDisplayName}`);
            } else {
              // Update core info
              emp.name = staff.userDisplayName;
              emp.role = staff.userRole;
              emp.addresses = staff.addresses;
              emp.user_id = staff._id;

              // Versioning logic for employmentHistory
              const activeEntry = emp.employmentHistory.find((h) => h.active);
              const hasChanges =
                !activeEntry ||
                activeEntry.daily_rate !== newHistoryEntry.daily_rate ||
                activeEntry.shiftStartTime !== newHistoryEntry.shiftStartTime ||
                activeEntry.shiftHours !== newHistoryEntry.shiftHours ||
                activeEntry.groupName !== newHistoryEntry.groupName ||
                activeEntry.shiftName !== newHistoryEntry.shiftName;

              if (hasChanges) {
                // Close current active entry
                if (activeEntry) {
                  activeEntry.active = false;
                  activeEntry.endDate = new Date();
                }
                // Add new entry
                emp.employmentHistory.push(newHistoryEntry);
              }
              await emp.save();
              console.log(`Synced employee record for ${staff.userDisplayName}`);
            }
          }
        } catch (empErr) {
          console.error('Failed to sync employee record:', empErr.message);
        }
      }

      res.json({ success: true, data: staff });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  delete: async (req, res) => {
    try {
      await userMaster.findByIdAndDelete(req.params.id);
      res.json({ success: true, message: 'Staff access removed' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

/**
 * 👥 PARTIES (Clients & Suppliers)
 */
exports.manageClients = {
  list: (req, res) => manageSpoke.list(req, res, 'Parties', { type: 'Client' }),
  create: async (req, res) => {
    try {
      const { Parties } = req.tenantModels;
      const item = new Parties({ ...req.body, type: 'Client' });
      await item.save();

      // Auto-create client ledger
      try {
        const FinanceController = require('./FinanceController');
        const ledger = await FinanceController.ensureLedgerFolioInternal(req.tenantModels, {
          ledgerName: item.name,
          groupName: 'Sundry Debtors',
          parentGroup: 'Current Assets',
          refId: item._id,
          refType: 'Client',
          nature: 'Dr',
        });
        if (ledger) {
          item.ledgerId = ledger._id;
          await item.save();
        }
      } catch (err) {
        console.error('Client-Ledger Auto Init Failed:', err.message);
      }

      res.status(201).json({ success: true, data: item });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  update: async (req, res) => {
    try {
      const { Parties } = req.tenantModels;
      const item = await Parties.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!item) return res.status(404).json({ success: false, message: 'Client not found' });

      // Auto-create/update client ledger
      try {
        const FinanceController = require('./FinanceController');
        const ledger = await FinanceController.ensureLedgerFolioInternal(req.tenantModels, {
          ledgerName: item.name,
          groupName: 'Sundry Debtors',
          parentGroup: 'Current Assets',
          refId: item._id,
          refType: 'Client',
          nature: 'Dr',
        });
        if (ledger && !item.ledgerId) {
          item.ledgerId = ledger._id;
          await item.save();
        }
      } catch (err) {
        console.error('Client-Ledger Auto Sync Failed:', err.message);
      }

      res.json({ success: true, data: item });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  delete: (req, res) => manageSpoke.delete(req, res, 'Parties'),
};

exports.manageSuppliers = {
  list: async (req, res) => {
    try {
      const Model = req.tenantModels['Parties'];
      if (!Model) {
        return res.status(500).json({ success: false, message: 'Parties model not found in tenant' });
      }
      const q = { type: 'Supplier' };
      const accessibleIds = req.user?.accessibleLocationIds;
      if (req.query.all !== 'true' && req.user?.userRole !== 'CorpAdmin' && accessibleIds?.length > 0) {
        q.locationId = { $in: accessibleIds };
      }
      const data = await Model.find(q).sort({ createdAt: -1 }).lean();
      res.json({ success: true, data, vendors: data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  create: async (req, res) => {
    try {
      const { Parties } = req.tenantModels;
      const item = new Parties({ ...req.body, type: 'Supplier' });
      await item.save();

      // Auto-create supplier ledger
      try {
        const FinanceController = require('./FinanceController');
        const ledger = await FinanceController.ensureLedgerFolioInternal(req.tenantModels, {
          ledgerName: item.name,
          groupName: 'Sundry Creditors',
          parentGroup: 'Current Liabilities',
          refId: item._id,
          refType: 'Vendor',
          nature: 'Cr',
        });
        if (ledger) {
          item.ledgerId = ledger._id;
          await item.save();
        }
      } catch (err) {
        console.error('Supplier-Ledger Auto Init Failed:', err.message);
      }

      res.status(201).json({ success: true, data: item });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  update: async (req, res) => {
    try {
      const { Parties } = req.tenantModels;
      const item = await Parties.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!item) return res.status(404).json({ success: false, message: 'Supplier not found' });

      // Auto-create/update supplier ledger
      try {
        const FinanceController = require('./FinanceController');
        const ledger = await FinanceController.ensureLedgerFolioInternal(req.tenantModels, {
          ledgerName: item.name,
          groupName: 'Sundry Creditors',
          parentGroup: 'Current Liabilities',
          refId: item._id,
          refType: 'Vendor',
          nature: 'Cr',
        });
        if (ledger && !item.ledgerId) {
          item.ledgerId = ledger._id;
          await item.save();
        }
      } catch (err) {
        console.error('Supplier-Ledger Auto Sync Failed:', err.message);
      }

      res.json({ success: true, data: item });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  delete: (req, res) => manageSpoke.delete(req, res, 'Parties'),
};
