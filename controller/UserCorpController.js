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
      if (req.user?.userRole !== 'CorpAdmin' && accessibleIds?.length > 0) {
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
      res.json({ success: true, data: item });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
  delete: async (req, res, modelName) => {
    try {
      const Model = req.tenantModels[modelName];
      await Model.findByIdAndDelete(req.params.id);
      res.json({ success: true, message: 'Entity deleted' });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
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
      if (req.user?.userRole !== 'CorpAdmin' && accessibleIds?.length > 0) {
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
      if (req.user?.userRole !== 'CorpAdmin' && accessibleIds?.length > 0) {
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
      if (req.user?.userRole !== 'CorpAdmin' && accessibleIds?.length > 0) {
        q.locationId = { $in: accessibleIds };
      }

      const leads = await Leads.find(q).lean();
      const profile = await ProfileMaster.findOne({}).lean();

      try {
        // Isolated search using externalService
        const cloudConfig = profile?.apiUrls?.cloudinary || null;
        const searchRes = await externalService.searchLeadsMedia(req.tenantDbName, cloudConfig);
        const mediaMap = {};
        searchRes.resources.forEach((a) => {
          // Path: hipk/<dbName>/leads/<lead_no>/<filename>
          // Split gives: ["hipk", "<dbName>", "leads", "<lead_no>", "<filename>"]
          const parts = a.public_id.split('/');
          const leadsIdx = parts.indexOf('leads');
          if (leadsIdx !== -1 && parts[leadsIdx + 1]) {
            const leadNo = parts[leadsIdx + 1];
            if (!mediaMap[leadNo]) mediaMap[leadNo] = [];
            mediaMap[leadNo].push(a.secure_url);
          }
        });
        // Map by both lead_no and _id to capture all images regardless of how they were uploaded
        leads.forEach((l) => {
          l.folderGallery = [
            ...(mediaMap[String(l.lead_no)] || []),
            ...(mediaMap[String(l._id)] || []),
          ];
        });
      } catch (ce) {
        console.error('Cloudinary Fetch Error:', ce.message);
      }

      res.json({ success: true, data: leads, corporateProfile: profile });
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
      if (req.user?.userRole !== 'CorpAdmin' && accessibleIds?.length > 0) {
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
      const { Leads, Attendance } = req.tenantModels;
      const lead = await Leads.findById(req.params.id).lean();
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

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

      const shiftsWithStats = (lead.siteShifts || []).map((s) => {
        const permittedThisMonth = (s.workerSlots || 1) * daysInMonth;
        const actualThisMonth = monthlyCountByShift[s.shiftCode] || 0;
        const activeNow = activeCountByShift[s.shiftCode] || 0;
        return {
          ...s,
          permittedThisMonth,
          actualThisMonth,
          activeNow,
          isExcess: actualThisMonth > permittedThisMonth,
          slotExcess: activeNow > (s.workerSlots || 1),
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

  // ── PUT site shifts (full replace of siteShifts array) ───────────────────
  updateSiteShifts: async (req, res) => {
    try {
      const { Leads } = req.tenantModels;
      const { siteShifts } = req.body;
      if (!Array.isArray(siteShifts)) {
        return res.status(400).json({ success: false, message: 'siteShifts must be an array' });
      }
      const lead = await Leads.findByIdAndUpdate(
        req.params.id,
        { $set: { siteShifts } },
        { new: true }
      );
      if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });
      req.io.to(req.tenantDbName).emit('lead:updated', { data: lead });
      res.json({ success: true, data: lead });
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
      if (req.user?.userRole !== 'CorpAdmin' && accessibleIds?.length > 0) {
        q.locationId = { $in: accessibleIds };
      }
      const employeesList = await Employees.find(q).lean();

      const userMaster = require('../models/userMaster');
      const tenantDbName = req.tenantDbName || req.user?.dbName;
      const uQuery = { userActive: true };
      if (tenantDbName) {
        uQuery.accessCorporate = { $elemMatch: { dbName: tenantDbName, isActive: { $ne: false } } };
      }
      const userMasterList = await userMaster.find(uQuery).lean();

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
      const { from_date, to_date, employeeId } = req.query;
      let q = {};

      if (employeeId) {
        q.employeeId = employeeId;
      }

      if (from_date || to_date) {
        const dateFilter = {};
        if (from_date) {
          const d = resolveDatePreset(from_date);
          if (d) dateFilter.$gte = d;
        }
        if (to_date) {
          const d = resolveDatePreset(to_date);
          if (d) dateFilter.$lte = d;
        }

        if (Object.keys(dateFilter).length > 0) {
          // Include either the date range OR anything that is still "On Duty"
          if (q.employeeId) {
            q = {
              employeeId: q.employeeId,
              $or: [{ date: dateFilter }, { dutyEnd: { $exists: false } }, { dutyEnd: null }],
            };
          } else {
            q = {
              $or: [{ date: dateFilter }, { dutyEnd: { $exists: false } }, { dutyEnd: null }],
            };
          }
        }
      }
      const data = await Attendance.find(q).lean();

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
          ? userMaster.find({ _id: { $in: uniqueUserMasterIds } }).lean()
          : Promise.resolve([]),
        uniqueEmployeeIds.length > 0
          ? Employees.find({ _id: { $in: uniqueEmployeeIds } }).lean()
          : Promise.resolve([]),
        uniqueLeadIds.length > 0
          ? Leads.find({ _id: { $in: uniqueLeadIds } }).lean()
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

      // Exemption check for geoHistory: admins and workers are exempt.
      const isAdminRole = ['corpadmin', 'useradmin', 'admin'].includes(role.toLowerCase());
      const isEmployeeCollection = !!employeeDoc;
      const isExemptUser = isAdminRole || isEmployeeCollection;
      const finalGeoHistory = isExemptUser ? [] : geoHistory || [];

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

      // Fetch site coordinates if leadId exists
      let siteLat = undefined;
      let siteLong = undefined;
      if (leadId) {
        const site = await Leads.findById(leadId).lean();
        if (site && site.location && site.location.lat && site.location.long) {
          siteLat = Number(site.location.lat);
          siteLong = Number(site.location.long);
        }
      }

      const startLat = req.body.startLat || req.body.lat || (finalGeoHistory && finalGeoHistory.length > 0 ? finalGeoHistory[0].lat : undefined) || siteLat;
      const startLong = req.body.startLong || req.body.long || (finalGeoHistory && finalGeoHistory.length > 0 ? finalGeoHistory[0].long : undefined) || siteLong;

      const record = new Attendance({
        employeeId,
        employeeType: employeeDoc ? 'Employees' : 'userMaster',
        role,
        leadId,
        clientId: clientId || null,
        status: status || 'Present',
        customCreated: true, // Tag it so we know it was manually marked/handled
        dutyLevel: dutyLevel ?? 1,
        rate: rate || siteShiftOverride?.billRate || 0,
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

      // Exemption check: Admins and workers are exempt.
      const recordRole = (record.role || '').toLowerCase();
      const isAdminRole = ['corpadmin', 'useradmin', 'admin'].includes(recordRole);
      const isWorker = record.employeeType === 'Employees';
      const isExemptUser = isAdminRole || isWorker;

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

      await record.save();

      if (emittedGeoUpdate) {
        req.io.to(req.tenantDbName).emit('attendance:geo_update', {
          attendanceId: record._id,
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

      console.log('🟢 [updateAttendance] Saved successfully:', record._id);
      res.json({ success: true, data: record });
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
      const isExemptUser = isAdminRole || isWorker;

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
          if (site && site.location && site.location.lat && site.location.long) {
            siteLat = site.location.lat;
            siteLong = site.location.long;
            const isSelf = String(req.user._id || req.user.userId) === String(queryId);

            if (!isSelf) {
              // 🚀 Started by someone else -> use site coordinates as default if supervisor doesn't provide them
              if (!startLat) startLat = siteLat;
              if (!startLong) startLong = siteLong;
              finalLat = siteLat;
              finalLong = siteLong;
              finalSiteName = site.sender_name || finalSiteName;
            } else {
              if (!lat || !long) {
                return res.status(400).json({
                  success: false,
                  message: "Location services must be enabled to mark your attendance."
                });
              } else {
                const getDistance = (lat1, lon1, lat2, lon2) => {
                  const R = 6371e3;
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
                const dist = getDistance(lat, long, siteLat, siteLong);
                const geofenceRadius = Number(site.geofenceRadiusMeters) || 100;
                
                if (dist > geofenceRadius) {
                  return res.status(400).json({
                    success: false,
                    message: "You are not at selected site. Reach your selected site or select site where you are available.",
                    notAtSite: true
                  });
                }
                
                finalLat = lat;
                finalLong = long;
                finalSiteName = site.sender_name || finalSiteName;
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
          monthlyRate: fetchedMonthlyRate,
          dailyRate: fetchedDailyRate,
          rate: toggleSiteShiftOverride?.salaryRate || fetchedDailyRate || currentRate,
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

        // Store matched shift on req for slot check — resolved during site-shift lookup
        if (req._matchedSiteShiftSlots === 1 && record.dutyEndScheduled) {
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
      const isExemptUser = isAdminRole || isWorker;

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
      let nextLockHrs = nextShiftType === '12hr' ? 12 : 8;
      let finalNextShiftType = nextShiftType || '8hr';
      let finalNextShiftPeriod = SHIFT_PERIOD_MAP[nextShiftPeriod] || nextShiftPeriod || 'Morning';
      let nextRate = current.rate || 0;
      let finalNextShiftCode = nextShiftCode || 'G';

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
          activeSiteShifts.find((s) => s.shiftCode === nextShiftCode) || activeSiteShifts[0];
        if (nextShift) {
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
        }).lean();
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

        return {
          ...a,
          location: { lat: currentLat, long: currentLong },
          displayName,
          photo: emp?.photo_url || user?.userProfileImage || null,
          role: resolvedRole,
          mobile: emp?.mobile || emp?.phone || user?.userMobile || null,
          isEmployee,
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
};

/**
 * TEAM ACCESS MANAGEMENT (Standalone Users collection)
 */
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
  list: (req, res) => manageSpoke.list(req, res, 'Parties', { type: 'Supplier' }),
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
