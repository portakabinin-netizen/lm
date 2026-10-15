const mongoose = require("mongoose");

/**
 * 🏢 Dynamic Corporate Registry
 * Replaces hardcoded corporate lists by dynamically loading tenant
 * profiles from MongoDB (userMaster & tenant profileMaster) and
 * maintaining an in-memory resolution cache.
 */

// In-memory cache for fast, synchronous lookups
const corporateCache = new Map(); // dbName (hex) -> { dbName, name, pan }
const aliasToDbMap = new Map();   // name / alias / pan (lowercase) -> dbName (hex)

let activeCorporate = {
  dbName: "41414546483437393441",
  name: "portakabin.in",
  pan: "AAEFH4794A"
};

/**
 * Converts a 10-character PAN to 20-character hex string.
 */
function panToDbName(pan) {
  if (!pan || typeof pan !== "string") return "";
  const clean = pan.trim().toUpperCase();
  if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(clean)) {
    return Buffer.from(clean).toString("hex").toLowerCase();
  }
  return "";
}

/**
 * Converts a 20-character hex string back to a 10-character PAN.
 */
function dbNameToPan(hex) {
  if (!hex || typeof hex !== "string") return "";
  const clean = hex.trim().toLowerCase();
  if (/^[0-9a-f]{20}$/.test(clean)) {
    try {
      const decoded = Buffer.from(clean, "hex").toString("utf8").toUpperCase();
      if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(decoded)) {
        return decoded;
      }
    } catch (e) {}
  }
  return "";
}

/**
 * Registers or updates a corporate in the cache with helpful aliases.
 */
function registerCorporate(dbName, name = "", pan = "") {
  if (!dbName || typeof dbName !== "string") return;
  const cleanDb = dbName.trim().toLowerCase();
  if (!cleanDb || cleanDb === "undefined" || cleanDb === "null") return;

  const derivedPan = pan ? pan.trim().toUpperCase() : dbNameToPan(cleanDb);
  const existing = corporateCache.get(cleanDb) || {};

  const finalName = (name && name.trim()) || existing.name || (derivedPan ? `Corporate (${derivedPan})` : cleanDb);
  const finalPan = derivedPan || existing.pan || "";

  const corpObj = {
    dbName: cleanDb,
    name: finalName,
    pan: finalPan
  };

  corporateCache.set(cleanDb, corpObj);

  // Register aliases
  aliasToDbMap.set(cleanDb, cleanDb);
  if (finalPan) {
    aliasToDbMap.set(finalPan.toLowerCase(), cleanDb);
  }
  if (finalName) {
    const lowerName = finalName.toLowerCase();
    aliasToDbMap.set(lowerName, cleanDb);
    // Also add simplified name without dots/punctuation for fuzzy lookups
    const simplified = lowerName.replace(/[^a-z0-9]/g, "");
    if (simplified) aliasToDbMap.set(simplified, cleanDb);
  }

  return corpObj;
}

/**
 * Normalizes any tenant identifier (name, alias, PAN, or hex) into a valid hex DB name.
 */
function normalizeTenantDb(raw) {
  if (!raw || typeof raw !== "string") {
    return activeCorporate.dbName || "41414546483437393441";
  }

  const clean = raw.trim().toLowerCase();
  if (aliasToDbMap.has(clean)) {
    return aliasToDbMap.get(clean);
  }

  const simplified = clean.replace(/[^a-z0-9]/g, "");
  if (aliasToDbMap.has(simplified)) {
    return aliasToDbMap.get(simplified);
  }

  // 10-char PAN
  if (/^[a-z]{5}[0-9]{4}[a-z]$/i.test(clean)) {
    const hex = panToDbName(clean);
    if (hex) {
      registerCorporate(hex, "", clean.toUpperCase());
      return hex;
    }
  }

  // 20-char Hex string
  if (/^[0-9a-f]{20}$/i.test(clean)) {
    const pan = dbNameToPan(clean);
    if (!corporateCache.has(clean)) {
      registerCorporate(clean, "", pan);
    }
    return clean;
  }

  // Fallback to active corporate
  return activeCorporate.dbName || "41414546483437393441";
}

/**
 * Dynamically queries MongoDB for corporate details if not already cached.
 */
async function resolveCorporateFromDb(dbName) {
  if (!dbName) return null;
  const cleanDb = normalizeTenantDb(dbName);

  if (corporateCache.has(cleanDb)) {
    const cached = corporateCache.get(cleanDb);
    if (cached.name && !cached.name.startsWith("Corporate (") && cached.name !== cleanDb) {
      return cached;
    }
  }

  const pan = dbNameToPan(cleanDb);

  try {
    const userMaster = require("../models/userMaster");
    // 1. Look in userMaster for accessCorporate or linkedCorporate
    const query = {
      $or: [
        { "accessCorporate.dbName": cleanDb },
        ...(pan ? [
          { "accessCorporate.corporatePAN": pan },
          { "linkedCorporate.corporatePAN": pan }
        ] : [])
      ]
    };

    const userDoc = await userMaster.findOne(query).lean().catch(() => null);
    if (userDoc) {
      const accessMatch = (userDoc.accessCorporate || []).find(
        (a) => a.dbName === cleanDb || (pan && a.corporatePAN?.toUpperCase() === pan)
      );
      if (accessMatch && accessMatch.corporateName) {
        return registerCorporate(cleanDb, accessMatch.corporateName, accessMatch.corporatePAN || pan);
      }
      if (userDoc.linkedCorporate && userDoc.linkedCorporate.corporateName) {
        return registerCorporate(cleanDb, userDoc.linkedCorporate.corporateName, userDoc.linkedCorporate.corporatePAN || pan);
      }
    }

    // 2. Look in the tenant DB's profileMaster collection
    const dbConnector = require("./dbConnector");
    const tenantConn = await dbConnector.getTenantConnection(cleanDb).catch(() => null);
    if (tenantConn) {
      const profile = await tenantConn.collection("profileMaster").findOne({}).catch(() => null);
      if (profile && (profile.corporateName || profile.corporatePAN)) {
        return registerCorporate(
          cleanDb,
          profile.corporateName || profile.corporateTagName || "",
          profile.corporatePAN || pan
        );
      }
    }
  } catch (err) {
    // Non-fatal, return best-effort object
  }

  return registerCorporate(cleanDb, "", pan);
}

/**
 * Loads all known corporate tenants from MongoDB into memory.
 */
async function loadCorporatesFromDatabase() {
  try {
    const userMaster = require("../models/userMaster");
    const users = await userMaster.find(
      {
        $or: [
          { "accessCorporate.0": { $exists: true } },
          { linkedCorporate: { $exists: true } }
        ]
      },
      { accessCorporate: 1, linkedCorporate: 1 }
    ).lean();

    let count = 0;
    for (const u of users) {
      if (Array.isArray(u.accessCorporate)) {
        for (const item of u.accessCorporate) {
          const itemDb = item.dbName || panToDbName(item.corporatePAN);
          if (itemDb) {
            registerCorporate(itemDb, item.corporateName, item.corporatePAN);
            count++;
          }
        }
      }
      if (u.linkedCorporate && (u.linkedCorporate.corporatePAN || u.linkedCorporate.corporateName)) {
        const itemDb = panToDbName(u.linkedCorporate.corporatePAN);
        if (itemDb) {
          registerCorporate(itemDb, u.linkedCorporate.corporateName, u.linkedCorporate.corporatePAN);
          count++;
        }
      }
    }

    // Set active corporate from first loaded entry if default isn't customized
    if (corporateCache.size > 0 && (!activeCorporate.name || activeCorporate.name === "portakabin.in")) {
      const first = corporateCache.values().next().value;
      if (first) {
        activeCorporate = { ...first };
      }
    }

    console.log(`🏢 Loaded ${corporateCache.size} unique corporate tenant(s) dynamically from database`);
  } catch (err) {
    console.warn("⚠️ [CorporateRegistry] Failed to load corporates from database on startup:", err.message);
  }
}

/**
 * Updates the globally active corporate tenant and notifies Socket.IO clients.
 */
function setActiveCorporate(dbName, name = "", pan = "") {
  if (!dbName || typeof dbName !== "string") return;
  const cleanDb = dbName.trim();
  if (cleanDb === "undefined" || cleanDb === "null" || cleanDb === "" || cleanDb === "[object Object]") return;

  const finalDb = normalizeTenantDb(cleanDb);
  const cached = corporateCache.get(finalDb);

  const derivedPan = pan || (cached?.pan) || dbNameToPan(finalDb);
  const newName = name || cached?.name || (derivedPan ? `Corporate (${derivedPan})` : activeCorporate.name);
  const newPan = derivedPan || activeCorporate.pan;

  const changed = activeCorporate.dbName !== finalDb || activeCorporate.name !== newName;

  activeCorporate = {
    dbName: finalDb,
    name: newName,
    pan: newPan
  };

  registerCorporate(finalDb, newName, newPan);

  if (changed && global.ioInstance) {
    global.ioInstance.emit("corporate-update", activeCorporate);
    console.log(`🏢 Active corporate database: ${activeCorporate.name} (${activeCorporate.pan || "N/A"}) [DB: ${activeCorporate.dbName}]`);
  }

  // If the name was generic or missing, resolve asynchronously from DB in background
  if (!name && (!cached || !cached.name || cached.name.startsWith("Corporate ("))) {
    resolveCorporateFromDb(finalDb).then((resolved) => {
      if (resolved && resolved.name && resolved.name !== activeCorporate.name && activeCorporate.dbName === finalDb) {
        activeCorporate.name = resolved.name;
        if (resolved.pan) activeCorporate.pan = resolved.pan;
        if (global.ioInstance) {
          global.ioInstance.emit("corporate-update", activeCorporate);
          console.log(`🏢 Corporate name updated from DB: ${activeCorporate.name} [DB: ${activeCorporate.dbName}]`);
        }
      }
    }).catch(() => {});
  }
}

function getActiveCorporate() {
  return { ...activeCorporate };
}

module.exports = {
  panToDbName,
  dbNameToPan,
  normalizeTenantDb,
  registerCorporate,
  resolveCorporateFromDb,
  loadCorporatesFromDatabase,
  setActiveCorporate,
  getActiveCorporate,
  corporateCache,
  aliasToDbMap
};
