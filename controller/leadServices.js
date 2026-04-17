const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const cloudinary = require('cloudinary').v2;

// Models
const { LeadsLedgers: Leads } = require("../models/LeadsLedgers");
const { Users, Corporates } = require("../models/UsersCorporates");

// Constants
const SENDERS = require('../models/senders.json');
const CITY_STATE_MAP = require('../models/cityStateMap.json');

/* ============================================================
   HELPERS
   ============================================================ */
const toIST = (date) => {
    const d = date ? new Date(date) : new Date();
    return new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().replace('Z', '+05:30');
};

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

/**
 * ── Normalize TradeIndia record to match Hub-and-Spoke schema ──
 */
const normalizeTradeIndia = (item, corpAdminId, corporateId) => {
    const rawMobile = (item.sender_mobile || item.MOBILE || "").replace(/\D/g, '').slice(-10);
    if (!rawMobile || rawMobile.length < 10) return null; // Skip invalid mobile

    const clean = (val) => (val ? String(val).replace(/"/gi, '').trim() : null);

    return {
        source_id: `ti_${item.inquiry_id || item.ID || item.rfi_id || Math.random().toString(36).substr(2, 9)}`,
        generated_date: item.generated_date || item.date || (item.generated ? new Date(item.generated * 1000) : new Date()),
        sender_name: clean(item.sender_name || item.SENDER || "Unknown"),
        sender_mobile: rawMobile,
        sender_email: clean(item.sender_email || item.EMAIL),
        product_name: clean(item.product_name || item.PRODUCT || "Enquiry"),
        sender_city: clean(item.sender_city || item.CITY || "Unknown"),
        sender_state: clean(item.sender_state || item.STATE || "Unknown"),
        source: "TradeIndia",
        status: "Recent",
        corporateId: String(corporateId),
        corpAdminId: String(corpAdminId),
    };
};

/* ============================================================
   1. LEADS SERVICE 
   ============================================================ */
exports.leadService = {

    leadsAnalytics: async (req, res) => {
        try {
            const { corporateId, fromDate, toDate, source } = req.query;
            let corpAdminId = req.user.corpAdminId || (req.user.userRole === "CorpAdmin" ? req.user.userId : null);

            // 🚀 DEEP RESOLUTION: If corpAdminId is missing, resolve from DB for this user
            if (!corpAdminId) {
                const u = await Users.findById(req.user.userId).select("accessCorporate").lean();
                corpAdminId = u?.accessCorporate?.corpAdminId;
            }

            const cid = (corporateId || req.user.corporateId || req.user.corporateIds?.[0])?.toString();

            // 🚀 ROBUSTNESS: Explicitly cast to ObjectId for findOne
            const aid = new mongoose.Types.ObjectId(corpAdminId);

            // 🚀 OPTIMIZATION: Project only the relevant corporateData map key
            const hub = await Leads.findOne(
                { _id: aid },
                { [`corporateData.${cid}`]: 1 }
            ).lean();

            if (!hub) return res.json({ success: true, total: 0, data: { sources: [], statuses: [] } });

            // Since it's lean, it's just a POJO
            const corpEntry = hub?.corporateData?.[cid];

            let filtered = corpEntry?.leads || [];

            // ── Source filter ─────────────────────────────────────────────
            if (source?.trim()) {
                filtered = filtered.filter(l => l.source === source.trim());
            }

            // ── Date filter ───────────────────────────────────────────────
            if (fromDate?.trim()) {
                const now = new Date();
                let fromLimit;
                let toLimit = toDate ? new Date(toDate) : null;

                if (fromDate === "today") {
                    fromLimit = new Date(now.setHours(0, 0, 0, 0));
                    if (!toDate) {
                        toLimit = new Date();
                        toLimit.setHours(23, 59, 59, 999);
                    }
                } else if (fromDate === "7days") {
                    fromLimit = new Date(now.setDate(now.getDate() - 7));
                    fromLimit.setHours(0, 0, 0, 0);
                } else if (fromDate === "30days") {
                    fromLimit = new Date(now.setDate(now.getDate() - 30));
                    fromLimit.setHours(0, 0, 0, 0);
                } else {
                    fromLimit = new Date(fromDate);
                }

                filtered = filtered.filter(l => {
                    const d = new Date(l.generated_date);
                    if (toLimit) {
                        toLimit.setHours(23, 59, 59, 999);
                        return d >= fromLimit && d <= toLimit;
                    }
                    return d >= fromLimit;
                });
            }

            const sourcesMap = {};
            const statusesMap = {};
            filtered.forEach(l => {
                sourcesMap[l.source] = (sourcesMap[l.source] || 0) + 1;
                statusesMap[l.status] = (statusesMap[l.status] || 0) + 1;
            });

            res.json({
                success: true,
                total: filtered.length,
                data: {
                    sources: Object.entries(sourcesMap).map(([k, v]) => ({ label: k, value: v })),
                    statuses: Object.entries(statusesMap).map(([k, v]) => ({ label: k, value: v }))
                }
            });
        } catch (err) {
            console.error("❌ leadsAnalytics error:", err.message);
            res.status(500).json({ success: false, message: err.message });
        }
    },

    list: async (filters = {}) => {
        try {
            const { corporateId, corpAdminId } = filters;
            if (!corpAdminId || !corporateId) return [];

            const cid = corporateId.toString();

            // 🚀 OPTIMIZATION: Use ObjectId for aggregation matching (Mongoose doesn't auto-cast in aggregate)
            const adminId = new mongoose.Types.ObjectId(corpAdminId);

            const result = await Leads.aggregate([
                { $match: { _id: adminId } },
                { $project: { leads: { $ifNull: [`$corporateData.${cid}.leads`, []] } } }
            ]);
            
            return result[0]?.leads || [];
        } catch (err) {
            console.error("leadService.list error:", err);
            return [];
        }
    },

    getById: async (id) => {
        // Search across all Hubs for a lead with this sub-doc ID? 
        // Or do we need corpAdminId/corporateId context? 
        // The generic router only passes ID.
        const hub = await Leads.findOne({ "corporateData": { $exists: true } });
        // This is expensive. Better: require context. 
        // But for now, let's find it.
        const hubs = await Leads.find({});
        for (const h of hubs) {
            if (!h?.corporateData) continue;
            for (const [cid, corpEntry] of h?.corporateData?.entries?.() || []) {
                const found = corpEntry?.leads?.id?.(id);
                if (found) return found;
            }
        }
        return null;
    },

    remove: async (id) => {
        const hubs = await Leads.find({});
        for (const h of hubs) {
            if (!h?.corporateData) continue;
            for (const [cid, corpEntry] of h?.corporateData?.entries?.() || []) {
                const doc = corpEntry?.leads?.id?.(id);
                if (doc) {
                    doc.deleteOne();
                    await h.save();
                    return true;
                }
            }
        }
        return false;
    },

    readInbox: async (req, res) => {
        const { ImapFlow } = require('imapflow');
        const { simpleParser } = require('mailparser');
        const https = require('https');

        const fetchUrl = (url) => new Promise((resolve, reject) => {
            https.get(url, (res) => {
                if (res.statusCode < 200 || res.statusCode >= 300) {
                    return reject(new Error(`API responded with status: ${res.statusCode}`));
                }
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }).on('error', err => reject(err));
        });

        try {
            const corporateId = req.query.corporateId || req.user.corporateId || req.user.corporateIds?.[0];
            const corpAdminId = req.user.corpAdminId || req.user._id;

            const adminUser = await Users.findById(corpAdminId).lean();
            if (!adminUser) {
                console.error(`[readInbox] Error: Admin user ${corpAdminId} not found`);
                return res.status(404).json({ success: false, message: "Admin user session not found" });
            }

            const corporates = adminUser?.linkedCorporates || [];
            const corporate = corporates.find(c => String(c._id) === String(corporateId));

            if (!corporate) {
                console.error(`[readInbox] Error: Corporate ${corporateId} not found in Admin ${corpAdminId}`);
                return res.status(404).json({ success: false, message: `Corporate ${corporateId} not found in this Admin account` });
            }

            const records = [];

            // ── 1.  IMAP / Email Sync ─────────────────────────────────────────────
            if (corporate.apiUrls?.mailConfigure?.isActive) {
                const mailConfig = corporate.apiUrls.mailConfigure;
                
                // 🚀 CONFIG GUARD: Avoid crashing if credentials are missing
                if (!mailConfig.auth?.user || !mailConfig.auth?.pass) {
                    console.warn(`[readInbox] Skipping IMAP: mailConfigure is active but auth credentials (user/pass) are missing for ${corporate.corporateName}`);
                } else {
                    const client = new ImapFlow({
                        host: mailConfig.host || 'imap.gmail.com',
                        port: mailConfig.port || 993,
                        secure: true,
                        auth: { user: mailConfig.auth.user, pass: mailConfig.auth.pass },
                        logger: false,
                        verifyOnly: false,
                        socketTimeout: 60000,
                        greetingTimeout: 30000,
                        connectionTimeout: 30000
                    });

                    // ⚠ CRITICAL: Prevent server crash on socket timeout or other background errors
                    client.on('error', err => {
                        if (err.code === 'ETIMEOUT') return; // Handled by try-catch usually, but prevents crash
                        console.error("[readInbox] IMAP Background Error:", err.message);
                    });

                    try {
                        await client.connect();
                        const lock = await client.getMailboxLock('INBOX');
                        try {
                            const allUids = new Set();
                            const since = new Date();
                            since.setDate(since.getDate() - 7);

                            for (const sender of SENDERS) {
                                const uids = await client.search({ from: sender, since }, { uid: true });
                                uids.forEach(uid => allUids.add(uid));
                            }

                            if (allUids.size > 0) {
                                const range = [...allUids].sort((a, b) => a - b).join(",");
                                const processedUids = [];
                                for await (const msg of client.fetch(range, { source: true }, { uid: true })) {
                                    const parsed = await simpleParser(msg.source);
                                    const text = [parsed.text, parsed.html ? stripHtml(parsed.html) : "", parsed.subject].join(" ");
                                    const geo = findCityState(text);
                                    const mobile = extractMobile(text);
                                    if (!mobile) continue; // Skip leads without valid mobile

                                    const sender = parsed.from?.text || "";
                                    const source = sender.toLowerCase().includes('indiamart') ? "IndiaMart" : "TradeIndia";
                                    const clean = (val) => (val ? String(val).replace(/"/gi, '').trim() : null);

                                    records.push({
                                        source_id: `email_${msg.uid}`,
                                        generated_date: parsed.date || new Date(),
                                        sender_name: clean((parsed.replyTo?.text || parsed.from?.text || "Unknown").replace(/<.*?>/g, '')),
                                        sender_mobile: mobile,
                                        sender_email: clean(extractEmail(text)),
                                        product_name: clean(extractProductName(parsed.subject) || "Enquiry"),
                                        sender_city: clean(geo?.city || "Unknown"),
                                        sender_state: clean(geo?.state || "Unknown"),
                                        source: source,
                                        status: "Recent",
                                        corporateId: corporateId,
                                        corpAdminId: corpAdminId
                                    });
                                    processedUids.push(msg.uid);
                                }

                                // Batch update flags for all processed messages in one network call
                                if (processedUids.length > 0) {
                                    const processedRange = processedUids.sort((a, b) => a - b).join(",");
                                    await client.messageFlagsAdd(processedRange, ['\\Seen'], { uid: true });
                                }
                            }
                        } finally {
                            lock.release();
                        }
                        await client.logout();
                    } catch (e) {
                        console.error("IMAP Sync Failed:", e.message);
                    }
                } // 🚀 Added missing closing brace for 'else' block
            }

            // ── 2.  TradeIndia API Sync ──────────────────────────────────────────
            const ti = corporate.apiUrls?.tradeindia || corporate.tradeindia || {};

            if (ti.userid && ti.key) {
                try {
                    const now = new Date();
                    const yesterday = new Date(now);
                    yesterday.setDate(yesterday.getDate() - 1);

                    const params = new URLSearchParams({
                        userid: ti.userid,
                        profile_id: ti.profile_id,
                        key: ti.key,
                        from_date: yesterday.toISOString().split('T')[0],
                        to_date: now.toISOString().split('T')[0],
                        limit: 10
                    });

                    const url = `${ti.url || "https://www.tradeindia.com/utils/my_inquiry.html"}?${params.toString()}`;

                    const response = await fetchUrl(url);

                    const data = JSON.parse(response);
                    const tiArray = Array.isArray(data) ? data : (data.data || data.RESPONSE || data.records || data.inquiries || []);

                    tiArray.forEach(item => {
                        const normalized = normalizeTradeIndia(item, corpAdminId, corporateId);
                        if (normalized) records.push(normalized);
                    });
                } catch (e) {
                    console.error("TradeIndia API Failed:", e.message);
                }
            }

            let saved = 0;
            if (records.length > 0) {
                const result = await exports.leadService.addManyImpl(corpAdminId, corporateId, records);
                saved = result.length;
            }

            res.json({ success: true, fetched: records.length, saved, total: saved });
        } catch (err) {
            console.error("readInbox fatal error:", err);
            // 🚀 IMPROVED ERROR OUTPUT: Include more detail for the frontend
            res.status(500).json({ success: false, message: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });
        }
    },

    create: async (payload) => {
        try {
            const { corporateId, corpAdminId, ...leadData } = payload;
            const result = await exports.leadService.addManyImpl(corpAdminId, corporateId, [leadData]);
            return result[0];
        } catch (err) {
            throw err;
        }
    },

    addManyImpl: async (corpAdminId, corporateId, leadsArray) => {
        if (!corpAdminId || !corporateId) {
            throw new Error(`Missing identity parameters: corpAdminId=${corpAdminId}, corporateId=${corporateId}`);
        }
        const cid = corporateId.toString();
        let hub = await Leads.findById(corpAdminId);
        if (!hub) hub = await Leads.create({ _id: corpAdminId, corporateData: {} });

        if (!hub?.corporateData?.has?.(cid)) {
            hub?.corporateData?.set?.(cid, { leads: [], leadCounters: 0 });
        }
        const corpEntry = hub?.corporateData?.get?.(cid);
        if (!corpEntry) throw new Error(`Corporate data slot not found for ID: ${cid}`);
        let nextNo = corpEntry.leadCounters || 0;

        const inserted = [];
        const existingSourceIds = new Set(corpEntry.leads.filter(l => l.source_id).map(l => l.source_id));
        
        for (const l of leadsArray) {
            // Skip duplicate source_id within this corporate (using Set for O(1) lookup)
            if (l.source_id && existingSourceIds.has(l.source_id)) continue;

            l.lead_no = ++nextNo;
            l.generated_date = l.generated_date || new Date();
            l.corporateId = corporateId;
            l.corpAdminId = corpAdminId;
            corpEntry.leads.push(l);
            inserted.push(corpEntry.leads[corpEntry.leads.length - 1]);
        }

        corpEntry.leadCounters = nextNo;
        hub.markModified("corporateData");
        await hub.save();
        return inserted;
    },

    update: async (id, payload) => {
        try {
            const { corporateId, corpAdminId, ...updateData } = payload;
            const cid = corporateId.toString();

            // 🚀 OPTIMIZATION: Atomic update using arrayFilters to avoid loading the Hub
            const updateOps = {};
            Object.entries(updateData).forEach(([k, v]) => {
                updateOps[`corporateData.${cid}.leads.$[elem].${k}`] = v;
            });

            const result = await Leads.updateOne(
                { _id: corpAdminId },
                { $set: updateOps },
                { arrayFilters: [{ "elem._id": new mongoose.Types.ObjectId(id) }] }
            );

            if (result.matchedCount === 0) throw new Error("Lead or Hub not found");
            return { _id: id, ...updateData };
        } catch (err) {
            throw err;
        }
    },

    updateLead: async (req, res) => {
        try {
            const { id } = req.params;
            const corporateId = (req.body.corporateId || req.user.corporateId)?.toString();
            const corpAdminId = req.user.corpAdminId;

            if (!id || !corporateId || !corpAdminId) {
                return res.status(400).json({ success: false, message: "Missing required identity parameters" });
            }

            const lead = await exports.leadService.update(id, { ...req.body, corporateId, corpAdminId });
            res.json({ success: true, data: lead });
        } catch (err) {
            console.error("❌ leadService.updateLead error:", err);
            res.status(500).json({ success: false, message: err.message });
        }
    },

    addActivity: async (req, res) => {
        try {
            const { id } = req.params;
            const corporateId = (req.body.corporateId || req.user.corporateId)?.toString();
            const corpAdminId = req.user.corpAdminId;
            const { action, byUser } = req.body;

            if (!id || !corporateId || !corpAdminId) {
                return res.status(400).json({ success: false, message: "Missing required identity parameters" });
            }

            const newActivity = {
                action: action ? action.trim() : "No message provided",
                byUser: byUser || req.user.userDisplayName || "Agent",
                date: new Date()
            };

            // 🚀 OPTIMIZATION: Atomic $push using arrayFilters to avoid loading the whole Hub
            const result = await Leads.updateOne(
                { _id: corpAdminId },
                { $push: { [`corporateData.${corporateId}.leads.$[elem].activity`]: newActivity } },
                { arrayFilters: [{ "elem._id": new mongoose.Types.ObjectId(id) }] }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({ success: false, message: "Hub or Lead not found" });
            }

            res.json({ success: true, message: "Activity added successfully" });
        } catch (err) {
            console.error("❌ leadService.addActivity error:", err);
            res.status(500).json({ success: false, message: err.message });
        }
    },

    searchByMobile: async (req, res) => {
        try {
            const { mobile, corporateId } = req.query;
            const corpAdminId = req.user.corpAdminId;
            const cleanPhone = mobile.toString().replace(/\D/g, '').slice(-10);

            const hub = await Leads.findById(corpAdminId).lean();
            const cid = corporateId?.toString();
            const corpEntry = hub?.corporateData instanceof Map
                ? hub?.corporateData?.get?.(cid)
                : hub?.corporateData?.[cid];

            const lead = (corpEntry?.leads || []).find(l => l.sender_mobile?.endsWith(cleanPhone));

            if (!lead) {
                return res.json({
                    success: true, isNew: true,
                    data: { name: "New Client", status: "Fresh", mobile: cleanPhone }
                });
            }
            res.json({
                success: true, isNew: false,
                data: { name: lead.sender_name, status: lead.status, leadNo: lead.lead_no, product: lead.product_name, mobile: lead.sender_mobile }
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    },

    webInquiry: async (req, res) => {
        try {
            const corporateId = req.body.corporateId || req.user.corporateId || req.user.corporateIds?.[0];
            const corpAdminId = req.user.corpAdminId || (req.user.userRole === "CorpAdmin" ? req.user.userId : null);
            const lead = { ...req.body, source: 'WebForm', status: 'Recent' };
            const result = await exports.leadService.addManyImpl(corpAdminId, corporateId, [lead]);
            res.status(201).json({ success: true, data: result[0] });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    },

    getLeadsByStatus: async (req, res) => {
        try {
            const { status } = req.params;
            const corporateId = req.query.corporateId || req.user.corporateId || req.user.corporateIds?.[0];
            let corpAdminId = req.user.corpAdminId || (req.user.userRole === "CorpAdmin" ? req.user.userId : null);

            // 🚀 DEEP RESOLUTION: If corpAdminId is missing, resolve from DB for this user
            if (!corpAdminId) {
                const u = await Users.findById(req.user.userId).select("accessCorporate").lean();
                corpAdminId = u?.accessCorporate?.corpAdminId;
            }

            if (!corporateId || !corpAdminId) {
                return res.status(400).json({ success: false, message: "Missing corporate or admin ID" });
            }

            const cid = corporateId.toString();
            
            // 🚀 OPTIMIZATION: Use ObjectId for aggregation matching
            const adminId = new mongoose.Types.ObjectId(corpAdminId);
            if (!adminId) return res.status(400).json({ success: false, message: "Invalid admin ID" });

            const pipeline = [{ $match: { _id: adminId } }];
            
            // Build the filter condition
            const conditions = [];
            if (status) {
                // Exact status match (case-insensitive)
                conditions.push({ $regexMatch: { input: "$$lead.status", regex: `^${status.trim()}$`, options: "i" } });
                
                // For 'Recycle' status, also filter by date if needed (e.g. 30 days)
                if (status.toLowerCase() === "recycle") {
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    conditions.push({ $gte: ["$$lead.generated_date", thirtyDaysAgo] });
                }
            }

            pipeline.push({
                $project: {
                    leads: {
                        $filter: {
                            input: { $ifNull: [`$corporateData.${cid}.leads`, []] },
                            as: "lead",
                            cond: conditions.length > 0 ? (conditions.length > 1 ? { $and: conditions } : conditions[0]) : true
                        }
                    }
                }
            });

            const result = await Leads.aggregate(pipeline);
            const data = result[0]?.leads || [];

            res.json({ success: true, data });
        } catch (err) {
            console.error("❌ getLeadsByStatus error:", err.message);
            res.status(500).json({ success: false, message: err.message });
        }
    },

    getProjectActiveLeads: async (req, res) => {
        try {
            const corporateId = req.query.corporateId || req.user.corporateId || req.user.corporateIds?.[0];
            let corpAdminId = req.user.corpAdminId || (req.user.userRole === "CorpAdmin" ? req.user.userId : null);

            // 🚀 DEEP RESOLUTION: If corpAdminId is missing, resolve from DB for this user
            if (!corpAdminId) {
                const u = await Users.findById(req.user.userId).select("accessCorporate").lean();
                corpAdminId = u?.accessCorporate?.corpAdminId;
            }

            if (!corporateId) {
                return res.status(400).json({ success: false, message: "Missing corporateId in request" });
            }
            if (!corpAdminId) {
                return res.status(400).json({ success: false, message: "Missing or unresolved corpAdminId" });
            }

            const cid = corporateId.toString();
            const adminId = new mongoose.Types.ObjectId(corpAdminId);

            // 🚀 ROBUSTNESS: Case-insensitive status matching for projects
            const ACTIVE_STATUSES = ["Engaged", "Accepted", "Tax Invoice"];
            const statusRegex = `^(${ACTIVE_STATUSES.map(s => s.trim()).join("|")})$`;

            const result = await Leads.aggregate([
                { $match: { _id: adminId } },
                {
                    $project: {
                        leads: {
                            $filter: {
                                input: { $ifNull: [`$corporateData.${cid}.leads`, []] },
                                as: "lead",
                                cond: { 
                                    $regexMatch: { 
                                        input: "$$lead.status", 
                                        regex: statusRegex, 
                                        options: "i" 
                                    } 
                                }
                            }
                        }
                    }
                }
            ]);

            const leads = result[0]?.leads || [];

            // 🚀 FOLDER DISCOVERY: Bulk fetch all images in hipk/leads subfolders
            try {
                const searchRes = await cloudinary.search
                    .expression(`folder:hipk/leads/*`)
                    .sort_by('created_at', 'desc')
                    .max_results(100)
                    .execute();

                const mediaMap = {};
                searchRes.resources.forEach(asset => {
                    const parts = asset.public_id.split('/');
                    const leadsIdx = parts.indexOf('leads');
                    const folderKey = (leadsIdx !== -1 && parts[leadsIdx + 1]) ? parts[leadsIdx + 1] : null;
                    
                    if (folderKey) {
                        if (!mediaMap[folderKey]) mediaMap[folderKey] = [];
                        mediaMap[folderKey].push(asset.secure_url);
                    }
                });

                // Attach media to leads
                leads.forEach(l => {
                    l.folderGallery = mediaMap[l._id.toString()] || [];
                });
            } catch (searchErr) {
                if (searchErr.message.includes("ENOTFOUND")) {
                    console.error("⚠️ Cloudinary Connectivity Error: DNS resolution failed (ENOTFOUND). Please check server internet/DNS settings.");
                } else {
                    console.error("Cloudinary Search Error:", searchErr.message);
                }
                // Fallback: leads remain without folderGallery if search fails
            }

            res.json({ success: true, data: leads });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    },

    logSiteVisit: async (req, res) => {
        try {
            const { id } = req.params;
            const { selfie_url, location, remarks } = req.body;
            const corporateId = (req.body.corporateId || req.user.corporateId)?.toString();
            const corpAdminId = req.user.corpAdminId;

            const siteVisitActivity = {
                action: `Site Visit: ${remarks || "Completed"}`,
                byUser: req.user.userDisplayName || "Field Staff",
                date: new Date(),
                metadata: {
                    type: "site_visit",
                    selfie_url,
                    location,
                }
            };

            const result = await Leads.updateOne(
                { _id: corpAdminId },
                { $push: { [`corporateData.${corporateId}.leads.$[elem].activity`]: siteVisitActivity } },
                { arrayFilters: [{ "elem._id": new mongoose.Types.ObjectId(id) }] }
            );

            if (result.matchedCount === 0) return res.status(404).json({ success: false, message: "Lead not found" });

            res.json({ success: true, message: "Site visit logged successfully" });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    },

    addMany: async (leadsArray, ctx) => {
        // This is called from the router which might pass req context
        // or from readInbox directly. 
        // If called from router (serviceRouter.js:38), leadsArray is the body.
        // If called with (leadsArray, { corporateId, corpAdminId })
        const { corporateId, corpAdminId } = ctx || {};
        return await exports.leadService.addManyImpl(corpAdminId, corporateId, leadsArray);
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
   3. LEDGER SERVICE
   ============================================================ */
exports.ledgerService = {
    list: async (filters = {}) => {
        // Logic for ledger depends on how you want to aggregate from Hub
        // For now, let's just return from separate docs if they still exist, 
        // or aggregate from Hubs? 
        // Since migration is done, we should aggregate from Hubs.
        const hubs = await Leads.find({}).lean();
        let all = [];
        hubs.forEach(h => {
            Object.values(h?.corporateData || {}).forEach(corpEntry => {
                all = all.concat((corpEntry?.leads || []).filter(l => l.ledger?.length > 0));
            });
        });
        return all;
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
        if (data.userPassword) {
            const salt = await bcrypt.genSalt(10);
            data.userPassword = await bcrypt.hash(data.userPassword, salt);
        }
        return await Users.findByIdAndUpdate(id, data, { new: true });
    },
    remove: async (id) => await Users.findByIdAndDelete(id),
    findByMobile: async (mobile) => await Users.findOne({ userMobile: mobile, userActive: true }),
    apiUrlsConfigureSave: async (userId, data) => {
        const { corporateId, ...apiData } = data;
        if (corporateId) {
            return await Users.findOneAndUpdate(
                { _id: userId, "linkedCorporates._id": corporateId },
                { $set: { "linkedCorporates.$.apiUrls": apiData } },
                { new: true }
            );
        }
        return await Users.findOneAndUpdate(
            { _id: userId },
            { $set: { "linkedCorporates.0.apiUrls": apiData } },
            { new: true }
        );
    }
};