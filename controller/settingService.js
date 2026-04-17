const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const { Users } = require("../models/UsersCorporates");

// ─────────────────────────────────────────────────────────────────────────────
//  Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Return undefined when the caller passes an empty / whitespace-only string. */
const clean = (v) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined);

/**
 * Walk an object and remove keys whose value is undefined, null, or "".
 * Recurses one level into nested plain objects (not arrays).
 */
const compact = (obj) => {
  if (!obj || typeof obj !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      const nested = compact(v);
      if (Object.keys(nested).length > 0) out[k] = nested;
    } else {
      out[k] = v;
    }
  }
  return out;
};

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER: resolve the CorpAdmin that "owns" the current user
//  • CorpAdmin  → themselves
//  • Sales/Project → their corpAdminId from accessCorporate
// ─────────────────────────────────────────────────────────────────────────────
const resolveCorpAdmin = async (req) => {
  // 1. Explicitly passed from frontend mapping (query params)
  const { corpAdminId } = req.query || {};
  if (corpAdminId) {
    return Users.findById(corpAdminId).lean();
  }

  // 2. Fallback: Infer from current authenticated token
  // Middleware (authMiddleware.js) populates req.user as { _id, userId, userRole, ... }
  const uid = req.user?._id || req.user?.userId;
  if (!uid) return null;

  const me = await Users.findById(uid).lean();
  if (!me) return null;

  if (me.userRole === "CorpAdmin") return me;

  if (me.accessCorporate && me.accessCorporate.corpAdminId) {
    return Users.findById(me.accessCorporate.corpAdminId).lean();
  }
  return null;
};

// ═════════════════════════════════════════════════════════════════════════════
//  1.  UPDATE CORPORATE
//      GET  /api/setting/update/corporate   → return linkedCorporate
//      PUT  /api/setting/update/corporate   → patch linkedCorporate fields
// ═════════════════════════════════════════════════════════════════════════════
const updateCorporate = {

  // ── GET ────────────────────────────────────────────────────────────────────
  getCorporate: async (req, res) => {
    try {
      const admin = await resolveCorpAdmin(req);
      if (!admin) return res.status(404).json({ message: "CorpAdmin not found" });

      const corporateId = req.query.corporateId;
      const corp = (admin.linkedCorporates || []).find(c => c._id.toString() === corporateId);

      return res.status(200).json({
        message: "Corporate data fetched",
        data: {
          _id:              admin._id,
          linkedCorporate:  corp ?? {},
        },
      });
    } catch (err) {
      console.error("[getCorporate]", err);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  },

  // ── PUT ───────────────────────────────────────────────────────────────────
  postCorporate: async (req, res) => {
    try {
      const admin = await resolveCorpAdmin(req);
      if (!admin) return res.status(404).json({ message: "CorpAdmin not found" });

      const b = req.body; // already validated / shaped by the frontend

      // Build $set paths for every provided field using dot-notation so we
      // only touch what was sent (Mongoose partial update pattern).
      const $set = {};

      const maybeSet = (path, val, transform) => {
        if (val !== undefined && val !== "") {
          $set[`linkedCorporates.$.${path}`] = transform ? transform(val) : val;
        }
      };

      // ── Basic ──────────────────────────────────────────────────────────────
      maybeSet("corporateName",     clean(b.corporateName));
      maybeSet("corporateTagName",  clean(b.corporateTagName));
      maybeSet("corporateEmail",    clean(b.corporateEmail));
      maybeSet("corporateAddress",  clean(b.corporateAddress));
      maybeSet("corporateCity",     clean(b.corporateCity));
      maybeSet("corporateDistrict", clean(b.corporateDistrict));
      maybeSet("corporateState",    clean(b.corporateState));
      maybeSet("corporatePin",      clean(b.corporatePin));
      maybeSet("corporatePAN",      clean(b.corporatePAN), v => v.toUpperCase());
      maybeSet("bankDetails.corporateGST",      clean(b.corporateGST), v => v.toUpperCase());
      maybeSet("taxRegistrations.corporateMobile",    clean(b.corporateMobile));
      maybeSet("taxRegistrations.corporateTelephone", clean(b.corporateTelephone));
      maybeSet("taxRegistrations.Quotation_TC",      clean(b.Quotation_TC));
      maybeSet("taxRegistrations.TaxInvoiceTC",      clean(b.TaxInvoiceTC));

      // corporateActive is boolean – always set when provided
      if (typeof b.corporateActive === "boolean") {
        $set["linkedCorporates.$.corporateActive"] = b.corporateActive;
      }

      // ── Tax registrations ──────────────────────────────────────────────────
      const tr = b.taxRegistrations ?? {};
      maybeSet("taxRegistrations.tan",                clean(tr.tan),                v => v.toUpperCase());
      maybeSet("taxRegistrations.cin",                clean(tr.cin),                v => v.toUpperCase());
      maybeSet("taxRegistrations.iec",                clean(tr.iec),                v => v.toUpperCase());
      maybeSet("taxRegistrations.msme_udyam",         clean(tr.msme_udyam),         v => v.toUpperCase());
      maybeSet("taxRegistrations.fssai",              clean(tr.fssai));
      maybeSet("taxRegistrations.drug_license",       clean(tr.drug_license));
      maybeSet("taxRegistrations.import_export_code", clean(tr.import_export_code));

      // ── Bank details ───────────────────────────────────────────────────────
      const bk = b.bankDetails ?? {};
      maybeSet("bankDetails.bank_name",      clean(bk.bank_name));
      maybeSet("bankDetails.branch",         clean(bk.branch));
      maybeSet("bankDetails.account_number", clean(bk.account_number));
      maybeSet("bankDetails.ifsc_code",      clean(bk.ifsc_code), v => v.toUpperCase());
      maybeSet("bankDetails.account_type",   clean(bk.account_type) ?? "Current");
      maybeSet("bankDetails.swift_code",     clean(bk.swift_code), v => v.toUpperCase());

      // ── Authorized signatory ───────────────────────────────────────────────
      const sg = b.authorizedSignatory ?? {};
      maybeSet("authorizedSignatory.name",            clean(sg.name));
      maybeSet("authorizedSignatory.designation",     clean(sg.designation));
      maybeSet("authorizedSignatory.signature_label", clean(sg.signature_label) ?? "Authorised Signatory");

      // ── API URLs ───────────────────────────────────────────────────────────
      const ap = b.apiUrls ?? {};
      maybeSet("apiUrls.SMS",       clean(ap.SMS));
      maybeSet("apiUrls.Whatsapp",  clean(ap.Whatsapp));
      maybeSet("apiUrls.IndiaMart", clean(ap.IndiaMart));
      maybeSet("apiUrls.JustDial",  clean(ap.JustDial));

      // ── Mail configure ─────────────────────────────────────────────────────
      const mc = ap.mailConfigure ?? {};
      maybeSet("apiUrls.mailConfigure.host",      clean(mc.host) ?? "imap.gmail.com");
      maybeSet("apiUrls.mailConfigure.port",      mc.port ? parseInt(mc.port, 10) || 993 : undefined);
      if (typeof mc.secure   === "boolean") $set["linkedCorporates.$.apiUrls.mailConfigure.secure"]   = mc.secure;
      if (typeof mc.isActive === "boolean") $set["linkedCorporates.$.apiUrls.mailConfigure.isActive"] = mc.isActive;
      maybeSet("apiUrls.mailConfigure.auth.user", clean(mc.auth?.user));
      maybeSet("apiUrls.mailConfigure.auth.pass", clean(mc.auth?.pass));

      // ── TradeIndia ─────────────────────────────────────────────────────────
      const ti = b.tradeindia ?? {};
      maybeSet("apiUrls.tradeindia.url",        clean(ti.url));
      maybeSet("apiUrls.tradeindia.userid",     clean(ti.userid));
      maybeSet("apiUrls.tradeindia.profile_id", clean(ti.profile_id));
      maybeSet("apiUrls.tradeindia.key",        clean(ti.key));

      if (Object.keys($set).length === 0) {
        return res.status(400).json({ message: "No updatable fields provided" });
      }

      const corporateId = req.body.corporateId || req.query.corporateId;
      if (!corporateId) return res.status(400).json({ message: "corporateId is required" });

      const updated = await Users.findOneAndUpdate(
        { _id: admin._id, "linkedCorporates._id": corporateId },
        { $set },
        { new: true, runValidators: true }
      ).lean();

      return res.status(200).json({
        message: "Corporate updated successfully",
        data: { linkedCorporate: updated.linkedCorporates.find(c => c._id.toString() === corporateId) },
      });
    } catch (err) {
      console.error("[postCorporate]", err);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  },
};

// ═════════════════════════════════════════════════════════════════════════════
//  2.  UPDATE ADMIN USER
//      GET  /api/setting/update/user   → return CorpAdmin profile fields
//      PUT  /api/setting/update/user   → patch CorpAdmin profile
// ═════════════════════════════════════════════════════════════════════════════
const updateAdminUser = {

  // ── GET ────────────────────────────────────────────────────────────────────
  getAdminUser: async (req, res) => {
    try {
      const admin = await resolveCorpAdmin(req);
      if (!admin) return res.status(404).json({ message: "CorpAdmin not found" });

      const { userPassword, ...safe } = admin; // never return hashed password
      return res.status(200).json({ message: "Admin user fetched", data: safe });
    } catch (err) {
      console.error("[getAdminUser]", err);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  },

  // ── PUT ───────────────────────────────────────────────────────────────────
  postAdminUser: async (req, res) => {
    try {
      const admin = await resolveCorpAdmin(req);
      if (!admin) return res.status(404).json({ message: "CorpAdmin not found" });

      const b    = req.body;
      const $set = {};

      // Only allow safe profile fields – never role / accessCorporate
      if (clean(b.userDisplayName))  $set.userDisplayName  = clean(b.userDisplayName);
      if (clean(b.userEmail))        $set.userEmail        = clean(b.userEmail).toLowerCase();
      if (clean(b.userMobile))       $set.userMobile       = clean(b.userMobile);
      if (clean(b.userAadhar))       $set.userAadhar       = clean(b.userAadhar);
      if (b.userDoB)                 $set.userDoB          = new Date(b.userDoB);
      if (typeof b.userActive === "boolean") $set.userActive = b.userActive;
      if (clean(b.userProfileImage)) $set.userProfileImage = clean(b.userProfileImage);

      // ── Password change (optional) ─────────────────────────────────────────
      if (clean(b.newPassword)) {
        if (!clean(b.currentPassword)) {
          return res.status(400).json({ message: "currentPassword is required to change password" });
        }
        const doc  = await Users.findById(admin._id); // need the document for bcrypt
        const ok   = await bcrypt.compare(b.currentPassword, doc.userPassword);
        if (!ok) return res.status(401).json({ message: "Current password is incorrect" });

        const salt      = await bcrypt.genSalt(10);
        $set.userPassword = await bcrypt.hash(b.newPassword, salt);
      }

      if (Object.keys($set).length === 0) {
        return res.status(400).json({ message: "No updatable fields provided" });
      }

      const updated = await Users.findByIdAndUpdate(
        admin._id,
        { $set },
        { new: true, runValidators: true }
      ).lean();

      const { userPassword, ...safe } = updated;
      return res.status(200).json({ message: "Admin user updated", data: safe });
    } catch (err) {
      console.error("[postAdminUser]", err);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  },
};

// ═════════════════════════════════════════════════════════════════════════════
//  3.  OTHER USER  (Sales / Project)
//      GET  /api/setting/update/other-user        → list all Sales+Project users
//      GET  /api/setting/update/other-user/:id    → single user detail
//      PUT  /api/setting/update/other-user/:id    → update a Sales/Project user
// ═════════════════════════════════════════════════════════════════════════════
const otherUser = {

  // ── GET list ───────────────────────────────────────────────────────────────
  // Returns: [{ _id, userDisplayName, userRole, userMobile, userEmail, userActive }]
  // This is the data the frontend dropdown uses.
  getOtherUser: async (req, res) => {
    try {
      const admin = await resolveCorpAdmin(req);
      if (!admin) return res.status(404).json({ message: "CorpAdmin not found" });

      const query = {
        userRole: { $in: ["Sales", "Project", "Finance"] },
        "accessCorporate.corpAdminId": new mongoose.Types.ObjectId(admin._id)
      };

      if (req.query.corporateId && mongoose.Types.ObjectId.isValid(req.query.corporateId)) {
        query["accessCorporate.linkedCorporates.corporateId"] = new mongoose.Types.ObjectId(req.query.corporateId);
      }

      const users = await Users.find(
        query,
        // projection – never expose hashed password
        "userDisplayName userEmail userMobile userRole userActive userProfileImage accessCorporate createdAt"
      ).lean();

      return res.status(200).json({
        message: "Other users fetched",
        data:    users,
      });
    } catch (err) {
      console.error("[getOtherUser]", err);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  },

  // ── GET single ────────────────────────────────────────────────────────────
  getOtherUserById: async (req, res) => {
    try {
      const admin = await resolveCorpAdmin(req);
      if (!admin) return res.status(404).json({ message: "CorpAdmin not found" });

      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid user id" });
      }
      const query = {
        _id:      id,
        userRole: { $in: ["Sales", "Project", "Finance"] },
        "accessCorporate.corpAdminId": admin._id
      };

      if (req.query.corporateId) {
        query["accessCorporate.linkedCorporates.corporateId"] = req.query.corporateId;
      }

      const user = await Users.findOne(
        query,
        "-userPassword"
      ).lean();

      if (!user) return res.status(404).json({ message: "User not found" });

      return res.status(200).json({ message: "User fetched", data: user });
    } catch (err) {
      console.error("[getOtherUserById]", err);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  },

  // ── PUT ───────────────────────────────────────────────────────────────────
  postOtherUser: async (req, res) => {
    try {
      const admin = await resolveCorpAdmin(req);
      if (!admin) return res.status(404).json({ message: "CorpAdmin not found" });

      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid user id" });
      }

      const query = {
        _id:      id,
        userRole: { $in: ["Sales", "Project", "Finance"] },
        "accessCorporate.corpAdminId": admin._id
      };

      if (req.query.corporateId) {
        query["accessCorporate.linkedCorporates.corporateId"] = req.query.corporateId;
      }

      const existing = await Users.findOne(query);
      if (!existing) return res.status(404).json({ message: "User not found or not authorized" });

      const b    = req.body;
      const $set = {};

      if (clean(b.userDisplayName))  $set.userDisplayName  = clean(b.userDisplayName);
      if (clean(b.userEmail))        $set.userEmail        = clean(b.userEmail).toLowerCase();
      if (clean(b.userMobile))       $set.userMobile       = clean(b.userMobile);
      if (clean(b.userAadhar))       $set.userAadhar       = clean(b.userAadhar);
      if (b.userDoB)                 $set.userDoB          = new Date(b.userDoB);
      if (typeof b.userActive === "boolean") $set.userActive = b.userActive;
      if (clean(b.userProfileImage)) $set.userProfileImage = clean(b.userProfileImage);

      // Access grant/revoke and corporate permissions
      if (typeof b.accessAllow === "boolean" || Array.isArray(b.corporateIds)) {
        const link = existing.accessCorporate || { corpAdminId: admin._id, linkedCorporates: [] };
        
        // If we have corporateIds, we rebuild the linkedCorporates array
        if (Array.isArray(b.corporateIds)) {
          link.linkedCorporates = b.corporateIds.map(cid => ({
            corporateId: cid,
            accessAllow: typeof b.accessAllow === "boolean" ? b.accessAllow : true // default to true if setting IDs
          }));
        } else if (typeof b.accessAllow === "boolean") {
          // If only toggling accessAllow globally for this admin's corporates
          link.linkedCorporates = (link.linkedCorporates || []).map(lc => ({
            ...lc,
            accessAllow: b.accessAllow
          }));
        }
        $set.accessCorporate = link;
      }

      // Password reset (admin resets on behalf of user – no current-password check)
      if (clean(b.newPassword)) {
        const salt        = await bcrypt.genSalt(10);
        $set.userPassword = await bcrypt.hash(b.newPassword, salt);
      }

      if (Object.keys($set).length === 0) {
        return res.status(400).json({ message: "No updatable fields provided" });
      }

      const updated = await Users.findByIdAndUpdate(
        id,
        { $set },
        { 
          new: true, 
          runValidators: true
        }
      ).lean();

      const { userPassword, ...safe } = updated;
      return res.status(200).json({ message: "User updated", data: safe });
    } catch (err) {
      console.error("[postOtherUser]", err);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
module.exports = { updateCorporate, updateAdminUser, otherUser };