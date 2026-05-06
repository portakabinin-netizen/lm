const axios = require("axios");
const cloudinary = require("cloudinary").v2;
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const SENDERS = require("../models/senders.json");
const CITY_STATE_MAP = require("../models/cityStateMap.json");

// ─── Helpers (Migrated from Live App) ──────────────────────────────────────────
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

const extractMobile = (text) => {
    if (!text) return null;
    // Simpler, more robust match for 10-digit numbers possibly prefixed with 91 or +91
    // We remove common separators first
    const cleanText = text.replace(/[\s\-\(\)]/g, '');
    const matches = cleanText.match(/(?:\+91|91|0)?([6-9]\d{9})/g);
    if (matches && matches.length > 0) {
        // Take the first match and extract exactly 10 digits from the end
        return matches[0].replace(/\D/g, '').slice(-10);
    }
    return null;
};

// ─── Configuration ──────────────────────────────────────────────────────────
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * 🌐 External Service Helper (Backend)
 * Centralized utility for communicating with third-party APIs
 */
const syncLocks = new Set(); // 🚀 Track active syncs by "tenantDbName:service"

const externalService = {

    /**
     * 🧠 Internal Helper: Standardize Lead Data
     */
    normalizeLead: (raw, source) => {
        const clean = (val) => (val ? String(val).replace(/"/gi, '').trim() : null);

        // Robust Mobile Extraction
        const rawMobile = (raw.sender_mobile || raw.SENDER_MOBILE || raw.mobile || raw.MOBILE || "").replace(/\D/g, '').slice(-10);

        // Source ID
        const sid = raw.source_id || raw.inquiry_id || raw.ID || raw.rfi_id || raw.QUERY_ID || raw.messageId || raw.QUERY_ID || "";

        let name = clean(raw.sender_name || raw.SENDER_NAME || raw.SENDER || "");
        let subject = clean(raw.subject || raw.SUBJECT || "");

        // 🚀 NEW: Extract name from subject if Unknown or missing
        if (!name || name.toLowerCase().includes("unknown")) {
            if (subject && subject.toLowerCase().includes(" from ")) {
                const parts = subject.split(/\sfrom\s/i);
                if (parts.length > 1) {
                    name = parts[parts.length - 1].trim();
                }
            }
        }

        // 🚀 NEW: Clean prefixes from name (Mr. Mrs. Ms. Dr. Prof etc)
        if (name) {
            name = name.replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.|Dr|Prof\.|Prof|Shri|Smt\.|Smt)\s+/i, "").trim();
        }

        return {
            sender_name: name || "Unknown",
            sender_mobile: rawMobile || "",
            sender_email: clean(raw.sender_email || raw.SENDER_EMAIL || raw.EMAIL || raw.email || ""),
            sender_city: clean(raw.sender_city || raw.SENDER_CITY || raw.CITY || raw.city || "Unknown"),
            sender_state: clean(raw.sender_state || raw.SENDER_STATE || raw.STATE || raw.state || "Unknown"),
            product_name: clean(raw.product_name || raw.QUERY_PRODUCT_NAME || raw.PRODUCT || raw.product || "Enquiry"),
            source: source,
            source_id: clean(sid),
            generated_date: raw.generated_date || raw.GENERATED_DATE || raw.date || Date.now(),
        };
    },

    /**
     * 📡 Emit Progress via Socket.IO
     */
    emitProgress: (io, room, percent, text, type = "general", stats = null) => {
        if (io && room) {
            const p = Number(percent);
            io.to(room).emit("sync:progress", {
                percent: isNaN(p) ? 0 : Math.round(p),
                text,
                type,
                stats // 🚀 NEW: Detailed counts for UI
            });
        }
    },

    /**
     * 📡 Fetch Raw Leads from TradeIndia (Unified Flow)
     */
    fetchTradeIndia: async (config, tenantDbName, io, baseProgress = 50, scale = 20) => {
        try {
            const today = new Date();
            const lastWindow = new Date();
            lastWindow.setDate(today.getDate() - 1); // 🚀 STRICT: Only 24 hours

            const formatDate = (d) => d.toISOString().split('T')[0];
            const sDate = formatDate(lastWindow);
            const eDate = formatDate(today);

            const baseUrl = config.url;
            let url = `${baseUrl}?userid=${config.userid}&key=${config.key}&from_date=${sDate}&to_date=${eDate}&limit=100&page_no=1`;
            if (config.profile_id) url += `&profile_id=${config.profile_id}`;

            const initialStats = { totalFetched: 0, uniqueCount: 0, duplicateCount: 0 };
            externalService.emitProgress(io, tenantDbName, baseProgress + (scale * 0.1), "Fetching inquiries from TradeIndia...", "tradeindia", initialStats);

            const response = await axios.get(url, {
                timeout: 20000,
                headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
            });

            if (response.data && response.data.STATUS === 0) {
                throw new Error(response.data.ERROR || "API Error");
            }

            const rawLeads = Array.isArray(response.data)
                ? response.data
                : (response.data.data || response.data.RESPONSE || []);

            const normalized = rawLeads.map(item => externalService.normalizeLead(item, "TradeIndia"));

            // Emit progress update with fetched count
            externalService.emitProgress(io, tenantDbName, baseProgress + scale, `TradeIndia sync complete: ${normalized.length} leads found.`, "tradeindia", {
                totalFetched: normalized.length,
                uniqueCount: 0,
                duplicateCount: 0
            });

            return normalized;
        } catch (err) {
            console.error(`❌ [${tenantDbName}] TradeIndia Fetch Error:`, err.message);
            return []; // Fail gracefully for unified flow
        }
    },

    /**
     * Legacy Wrapper (for compatibility if needed)
     */
    syncTradeIndia: async (config, tenantModels, tenantDbName, user, io) => {
        const leads = await externalService.fetchTradeIndia(config, tenantDbName, io);
        if (leads.length === 0) return { success: true, count: 0 };

        const { Leads, Counters } = tenantModels;
        let savedCount = 0;
        for (const normalized of leads) {
            const exists = await Leads.findOne({ source_id: normalized.source_id });
            if (!exists) {
                const counter = await Counters.findByIdAndUpdate("lead", { $inc: { seq: 1 } }, { upsert: true, new: true });
                const newLead = new Leads({
                    ...normalized,
                    lead_no: counter.seq,
                    locationId: user.accessCorporate?.locationId,
                    activity: []
                });
                await newLead.save();
                savedCount++;
            }
        }
        return { success: true, count: savedCount };
    },

    /**
     * 📧 IMAP: Fetch Leads from Email (Multi-Phase with Progress)
     */
    fetchEmailLeads: async (config, tenantDbName, io, baseProgress = 5, scale = 45) => {
        const client = new ImapFlow({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: { user: config.auth.user, pass: config.auth.pass },
            logger: false,
            connectionTimeout: 15000, // 🚀 NEW: 15s timeout
            greetingTimeout: 10000
        });

        // 🚀 CRITICAL: Handle unhandled 'error' events (like ECONNRESET) to prevent crash
        client.on('error', (err) => {
            console.error(`📧 [${tenantDbName}] ImapFlow Client Background Error:`, err.message);
        });

        const normalizedLeads = [];
        let connected = false;

        const initialStats = { totalFetched: 0, uniqueCount: 0, duplicateCount: 0 };

        try {
            externalService.emitProgress(io, tenantDbName, baseProgress + (scale * 0.05), "Connecting to Email Server...", "email", initialStats);
            await client.connect();
            connected = true;

            externalService.emitProgress(io, tenantDbName, baseProgress + (scale * 0.1), "Loading sender configurations...", "email", initialStats);
            let lock = null;
            try {
                lock = await client.getMailboxLock("INBOX");

                const allUids = [];
                for (let i = 0; i < SENDERS.length; i++) {
                    const sender = SENDERS[i];
                    const subPercent = (i / SENDERS.length) * 0.2; // Uses 20% of scale
                    externalService.emitProgress(io, tenantDbName, baseProgress + (scale * (0.1 + subPercent)), `Searching emails from ${sender}...`, "email", initialStats);

                    const uids = await client.search({ seen: false, from: sender }, { uid: true });
                    if (uids.length > 0) {
                        allUids.push(...uids.map(uid => ({ uid, sender })));
                    }
                }

                if (allUids.length === 0) {
                    if (lock) lock.release();
                    await client.logout();
                    return [];
                }

                // PHASE 2 & 3: Fetch Bodies and Extract Values (30-60%)
                for (let i = 0; i < allUids.length; i++) {
                    const { uid, sender } = allUids[i];
                    const subPercent = 0.3 + ((i / allUids.length) * 0.7); // Remaining 70% of scale

                    try {
                        // 🚀 NEW: Added timeout to fetchOne to prevent hangs
                        const fullMsg = await Promise.race([
                            client.fetchOne(uid, { source: true, envelope: true }, { uid: true }),
                            new Promise((_, reject) => setTimeout(() => reject(new Error("Fetch Timeout")), 15000))
                        ]);

                        if (fullMsg && fullMsg.source) {
                            const parsed = await simpleParser(fullMsg.source);
                            const cleanBody = [parsed.text, parsed.html ? stripHtml(parsed.html) : "", parsed.subject].join(" ");

                            const geo = findCityState(cleanBody);
                            const mobile = extractMobile(cleanBody);

                            const leadData = {
                                name: (parsed.replyTo?.text || parsed.from?.text || "Unknown").replace(/<.*?>/g, '').trim(),
                                mobile: mobile || "",
                                email: extractEmail(cleanBody),
                                product: extractProductName(parsed.subject) || "Enquiry",
                                city: geo?.city || "Unknown",
                                state: geo?.state || "Unknown",
                                message: parsed.text?.substring(0, 500) || ""
                            };

                            const normalized = externalService.normalizeLead({
                                ...leadData,
                                source_id: uid,
                                subject: fullMsg.envelope.subject,
                                generated_date: fullMsg.envelope.date
                            }, sender.toLowerCase().includes("indiamart") ? "IndiaMart" : "TradeIndia");

                            normalizedLeads.push(normalized);

                            // 🚀 NEW: Mark as seen ONLY after successful parsing
                            await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
                        }
                    } catch (fetchErr) {
                        console.error(`⚠️ [${tenantDbName}] IMAP Fetch Timeout/Error for UID ${uid}:`, fetchErr.message);
                    }

                    // 🚀 REAL-TIME UPDATE: Increment totalFetched
                    externalService.emitProgress(io, tenantDbName, baseProgress + (scale * subPercent), `Parsing email body [${i + 1}/${allUids.length}]...`, "email", {
                        totalFetched: normalizedLeads.length,
                        uniqueCount: 0,
                        duplicateCount: 0
                    });
                }
            } finally {
                if (lock) lock.release();
            }

            try { await client.logout(); } catch (e) { }
            connected = false;
            return normalizedLeads;
        } catch (err) {
            console.error(`🔴 [${tenantDbName}] IMAP Fetch Error:`, err.message);
            if (connected) {
                try { await client.logout(); } catch (e) { }
            }
            return [];
        }
    },

    /**
     * 🚀 UNIFIED ORCHESTRATOR: Sync All Leads
     */
    syncAllExternalLeads: async (profile, tenantModels, tenantDbName, user, io) => {
        const lockKey = `${tenantDbName}:sync_all`;
        if (syncLocks.has(lockKey)) return { success: false, message: "Sync already in progress" };
        syncLocks.add(lockKey);

        const { Leads, Counters } = tenantModels;
        const { leadApis, mailConfigure } = profile?.apiUrls || {};

        try {
            // Step 1: Gateway - URLs/Config (0-10%)
            externalService.emitProgress(io, tenantDbName, 5, "Initializing Gateway & Fetching Configs...", "general");

            let allLeads = [];

            // Step 2: Email Leads (10-40%)
            if (mailConfigure?.isActive && mailConfigure?.auth?.user) {
                const emailLeads = await externalService.fetchEmailLeads(mailConfigure, tenantDbName, io, 10, 30);
                allLeads.push(...emailLeads);
            }
            externalService.emitProgress(io, tenantDbName, 40, "Email processing complete.", "general");

            // Step 3: Dynamic B2B Lead Sources (40-80%)
            const apis = Array.isArray(leadApis) ? leadApis : [];
            for (let i = 0; i < apis.length; i++) {
                const api = apis[i];
                if (!api.isActive) continue;

                const startProgress = 40 + ((i / apis.length) * 40);
                const stepScale = 40 / apis.length;

                externalService.emitProgress(io, tenantDbName, startProgress, `Fetching leads from ${api.b2bName || 'B2B Source'}...`, "general");

                if (api.b2bName?.toLowerCase().includes("tradeindia")) {
                    const tiLeads = await externalService.fetchTradeIndia(api, tenantDbName, io, startProgress, stepScale);
                    allLeads.push(...tiLeads);
                } else if (api.b2bName?.toLowerCase().includes("indiamart")) {
                    // Logic for IndiaMart API if different from fetchTradeIndia
                    // For now, if it's a URL-based fetch, we can use a generic fetcher
                }
            }
            externalService.emitProgress(io, tenantDbName, 80, "B2B API processing complete.", "general");

            if (allLeads.length === 0) {
                externalService.emitProgress(io, tenantDbName, 100, "Sync complete: No new leads found.", "sync_stats", { isComplete: true, totalFetched: 0, savedCount: 0 });
                return { success: true, count: 0 };
            }

            // Step 3: Merge & Deduplicate (70-80%)
            externalService.emitProgress(io, tenantDbName, 75, `Merging and deduplicating ${allLeads.length} leads...`, "general");
            const uniqueLeads = [];
            const seenIds = new Set();
            for (const l of allLeads) {
                if (!seenIds.has(l.source_id)) {
                    uniqueLeads.push(l);
                    seenIds.add(l.source_id);
                }
            }

            const stats = {
                totalFetched: allLeads.length,
                uniqueCount: uniqueLeads.length,
                duplicateCount: allLeads.length - uniqueLeads.length
            };

            // Step 4: Batch Save (80-100%)
            let actuallySaved = 0;
            let finalDuplicates = stats.duplicateCount;

            for (let i = 0; i < uniqueLeads.length; i++) {
                const normalized = uniqueLeads[i];
                const saveProgress = 80 + Math.round((i / uniqueLeads.length) * 20);

                try {
                    const exists = await Leads.findOne({ source_id: String(normalized.source_id) }).lean();
                    if (exists) {
                        finalDuplicates++;
                        continue;
                    }

                    const counter = await Counters.findByIdAndUpdate("lead", { $inc: { seq: 1 } }, { upsert: true, new: true });
                    const newLead = new Leads({
                        ...normalized,
                        lead_no: counter.seq,
                        locationId: user.accessCorporate?.locationId,
                        activity: []
                    });
                    await newLead.save();
                    actuallySaved++;
                } catch (saveErr) {
                    console.error(`⚠️ [${tenantDbName}] Save Error for lead ${i}:`, saveErr.message);
                }

                // 🚀 NEW: More frequent updates for a "live" feel
                if (uniqueLeads.length <= 20 || i % 2 === 0 || i === uniqueLeads.length - 1) {
                    externalService.emitProgress(io, tenantDbName, saveProgress, `Saving Lead [${i + 1}/${uniqueLeads.length}] to database...`, "sync_stats", {
                        ...stats,
                        savedCount: actuallySaved,
                        duplicateCount: finalDuplicates
                    });
                }
            }

            externalService.emitProgress(io, tenantDbName, 100, `Successfully synced ${actuallySaved} new leads.`, "sync_stats", {
                ...stats,
                savedCount: actuallySaved,
                duplicateCount: finalDuplicates,
                isComplete: true
            });
            return { success: true, count: actuallySaved };

        } catch (err) {
            console.error(`❌ [${tenantDbName}] Unified Sync Error:`, err.message);
            externalService.emitProgress(io, tenantDbName, 0, `Sync Error: ${err.message}`);
            throw err;
        } finally {
            syncLocks.delete(lockKey);
        }
    },

    /**
     * ☁️ Cloudinary: Resolve Options (Tenant-Specific or Fallback)
     */
    getCloudinaryOptions: (customConfig = null) => {
        // 1. Check if tenant has active custom Cloudinary config
        if (customConfig && (customConfig.cloud_name || customConfig.api_url) && customConfig.isActive) {
            if (customConfig.api_url) {
                return { cloudinary_url: customConfig.api_url };
            } else {
                return {
                    cloud_name: customConfig.cloud_name,
                    api_key:    customConfig.api_key,
                    api_secret: customConfig.api_secret,
                    secure:     true
                };
            }
        }
        // 2. Fallback to default (uses .env)
        return {};
    },

    uploadMedia: async (fileSource, options = {}, customConfig = null) => {
        try {
            const configOverrides = externalService.getCloudinaryOptions(customConfig);
            const result = await cloudinary.uploader.upload(fileSource, { ...options, ...configOverrides });
            return { success: true, url: result.secure_url, public_id: result.public_id, raw: result };
        } catch (err) {
            console.error("🔴 Cloudinary Upload Error:", err.message);
            throw err;
        }
    },

    deleteMedia: async (publicId, customConfig = null) => {
        try {
            const configOverrides = externalService.getCloudinaryOptions(customConfig);
            const result = await cloudinary.uploader.destroy(publicId, configOverrides);
            return result;
        } catch (err) {
            console.error("🔴 Cloudinary Delete Error:", err.message);
            throw err;
        }
    },

    /**
     * 🔍 Cloudinary: Search Media for Leads
     */
    searchLeadsMedia: async (tenantDbName, customConfig = null) => {
        try {
            const configOverrides = externalService.getCloudinaryOptions(customConfig);
            
            // Search API execute() accepts config overrides directly in the Node SDK
            const result = await cloudinary.search
                .expression(`folder:hipk/${tenantDbName}/leads/*`)
                .sort_by('created_at', 'desc')
                .execute(configOverrides);
            
            return result;
        } catch (err) {
            console.error("🔴 Cloudinary Search Leads Error:", err.message);
            throw err;
        }
    },
    /**
     * 📂 Cloudinary: Fetch Files from Folder (Gallery/History)
     */
    fetchFolderMedia: async (folderPath, customConfig = null) => {
        try {
            const configOverrides = externalService.getCloudinaryOptions(customConfig);
            
            // Search API execute() accepts config overrides directly in the Node SDK
            const result = await cloudinary.search
                .expression(`folder:"${folderPath}"`)
                .sort_by('created_at', 'desc')
                .max_results(30)
                .execute(configOverrides);
            
            return (result.resources || []).map(r => ({
                url: r.secure_url,
                public_id: r.public_id,
                created_at: r.created_at
            }));
        } catch (err) {
            throw err;
        }
    },

    /** Alias for uploadMedia to support authController usage */
    uploadImage: async (fileSource, folder, customConfig = null) => {
        return await externalService.uploadMedia(fileSource, { folder }, customConfig);
    }
};

module.exports = externalService;
