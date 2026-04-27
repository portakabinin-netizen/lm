const dbConnector = require("../utils/dbConnector");
const { getTenantModels } = require("../models/TenantModels");
const userMaster = require("../models/userMaster");

/**
 * 🏢 Tenant Middleware
 * Resolves the corporate-specific database connection and attaches
 * the isolated model instances to the request object.
 */
const tenantMiddleware = async (req, res, next) => {
    try {
        // 1. Identification (Priority: Token > Body > Query)
        let dbName = req.user?.dbName || req.body?.dbName || req.query?.dbName;
        
        if (!dbName) {
            return res.status(400).json({ 
                success: false, 
                message: "Tenant resolution failed. dbName required in token or body." 
            });
        }

        // 2. Resolve Connection
        const tenantConnection = await dbConnector.getTenantConnection(dbName);

        // 3. Instantiate Models and Attach to Request
        req.tenantModels = getTenantModels(tenantConnection);
        req.tenantDbName = dbName;

        // 4. Resolve Hierarchical Locations (HO, RO, BO Logic)
        if (req.user && req.user.userRole !== "CorpAdmin") {
            const profile = await req.tenantModels.ProfileMaster.findOne({}).lean();
            const locations = profile?.locations || [];
            const myLocId = req.user.locationId;

            if (myLocId) {
                const myLoc = locations.find(l => String(l._id) === String(myLocId));
                const locType = myLoc?.locationType || "BO";

                if (locType === "HO") {
                    // HO: Can see everything in the tenant
                    req.user.accessibleLocationIds = []; 
                } else if (locType === "RO") {
                    // RO: Can see self + all child locations (recursive)
                    const getChildren = (parentId) => {
                        let children = [String(parentId)];
                        locations.filter(l => String(l.parentId) === String(parentId))
                            .forEach(child => {
                                children = [...children, ...getChildren(child._id)];
                            });
                        return children;
                    };
                    req.user.accessibleLocationIds = getChildren(myLocId);
                } else {
                    // BO: Can only see their specific location
                    req.user.accessibleLocationIds = [String(myLocId)];
                }
            } else {
                // 🚀 UPDATE: No location assigned? Grant full access to the database (Work like Admin)
                req.user.accessibleLocationIds = null; 
            }
        } else {
            // CorpAdmin: Sees everything
            req.user.accessibleLocationIds = []; // Empty means all
        }

        next();
    } catch (err) {
        console.error("🔴 Tenant Middleware Error:", err.message);
        res.status(500).json({ success: false, message: "Multi-tenant routing failed" });
    }
};

module.exports = tenantMiddleware;
