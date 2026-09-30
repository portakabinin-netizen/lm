const dbConnector = require("../utils/dbConnector");
const { getTenantModels } = require("../models/TenantModels");

// ── Location-hierarchy cache ─────────────────────────────────────────────────
// Key  : `${dbName}:${userId}`
// Value: { accessibleLocationIds, expiresAt }
// Avoids a ProfileMaster.findOne() on every single request for non-CorpAdmin users.
const locationCache = new Map();
const LOCATION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Prune stale entries periodically so the Map doesn't grow unbounded
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of locationCache) {
        if (val.expiresAt < now) locationCache.delete(key);
    }
}, LOCATION_CACHE_TTL_MS);

/**
 * Recursively collect a location and all its children from the flat list.
 */
function getChildIds(locations, parentId) {
    const result = [String(parentId)];
    for (const loc of locations) {
        if (String(loc.parentId) === String(parentId)) {
            result.push(...getChildIds(locations, loc._id));
        }
    }
    return result;
}

/**
 * 🏢 Tenant Middleware
 * Resolves the corporate-specific database connection and attaches
 * the isolated model instances to the request object.
 *
 * Performance notes
 * -----------------
 * • getTenantModels() is O(1) — Mongoose caches models on the connection
 *   object, so repeated calls within the same connection are just Map lookups.
 * • ProfileMaster.findOne() (location hierarchy) is cached per user for 5 min,
 *   so it fires at most once every 300 s, not on every request.
 */
const tenantMiddleware = async (req, res, next) => {
    try {
        // 1. Identification (Priority: Header > Body > Query > Token)
        const dbName =
            req.headers['x-tenant-id'] ||
            req.headers['x-db-name']   ||
            req.body?.dbName           ||
            req.query?.dbName          ||
            req.user?.dbName;

        if (!dbName) {
            return res.status(400).json({
                success: false,
                message: "Tenant resolution failed. dbName required in token or body.",
            });
        }

        // 2. Resolve Connection (cached by dbConnector)
        const tenantConnection = await dbConnector.getTenantConnection(dbName);

        // 3. Attach Models (Mongoose model() calls are idempotent — pure Map lookups
        //    after the first call, so this line costs virtually nothing per request)
        req.tenantModels = getTenantModels(tenantConnection);
        req.tenantDbName = dbName;

        // 4. Resolve Hierarchical Locations (HO / RO / BO)
        if (req.user) {
            if (req.user.userRole === "CorpAdmin") {
                // CorpAdmin sees everything — empty array signals "no filter"
                req.user.accessibleLocationIds = [];
            } else {
                const userId  = String(req.user._id || req.user.id || "");
                const cacheKey = `${dbName}:${userId}`;
                const cached   = locationCache.get(cacheKey);

                if (cached && cached.expiresAt > Date.now()) {
                    // ✅ Cache hit — no DB query needed
                    req.user.accessibleLocationIds = cached.accessibleLocationIds;
                } else {
                    // 🔍 Cache miss — fetch once and store
                    const profile   = await req.tenantModels.ProfileMaster.findOne({}, { locations: 1 }).lean();
                    const locations = profile?.locations || [];
                    const myLocId   = req.user.locationId;

                    let accessibleLocationIds;

                    if (!myLocId) {
                        // No location assigned → treat as admin (full access)
                        accessibleLocationIds = null;
                    } else {
                        const myLoc  = locations.find(l => String(l._id) === String(myLocId));
                        const locType = myLoc?.locationType || "BO";

                        if (locType === "HO") {
                            accessibleLocationIds = [];                           // all
                        } else if (locType === "RO") {
                            accessibleLocationIds = getChildIds(locations, myLocId); // self + children
                        } else {
                            accessibleLocationIds = [String(myLocId)];           // BO: self only
                        }
                    }

                    locationCache.set(cacheKey, {
                        accessibleLocationIds,
                        expiresAt: Date.now() + LOCATION_CACHE_TTL_MS,
                    });

                    req.user.accessibleLocationIds = accessibleLocationIds;
                }
            }
        }

        next();
    } catch (err) {
        console.error("🔴 Tenant Middleware Error:", err.message);
        res.status(500).json({ success: false, message: "Multi-tenant routing failed" });
    }
};

module.exports = tenantMiddleware;
