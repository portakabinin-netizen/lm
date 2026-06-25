const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const userMaster = require("../models/userMaster");

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
  const tDb = req.tenantDbName || req.user?.dbName;
  if (!tDb) {
    console.warn("⚠️ [resolveCorpAdmin] No tDb found in req.tenantDbName or req.user.dbName");
    return null;
  }

  // 1. If the current user IS a CorpAdmin, they ARE the admin for this context
  if (req.user?.userRole === "CorpAdmin") {
    const me = await userMaster.findOne({ _id: req.user.userId, userRole: "CorpAdmin" }).lean();
    if (me) return me;
  }

  // 2. Otherwise, find the CorpAdmin who owns this dbName
  const admin = await userMaster.findOne({ 
    "accessCorporate.dbName": tDb, 
    userRole: "CorpAdmin" 
  }).lean();

  if (!admin) {
    console.warn(`⚠️ [resolveCorpAdmin] No CorpAdmin found for dbName: ${tDb}. User: ${req.user?.userId} [${req.user?.userRole}]`);
  }

  return admin;
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
      const { ProfileMaster } = req.tenantModels || {};
      if (!ProfileMaster) return res.status(500).json({ message: "Tenant connection not resolved" });

      // Fetch authoritative profile from tenant DB
      const profile = await ProfileMaster.findOne({}).lean();

      return res.status(200).json({
        message: "Corporate data fetched from isolated database",
        data: {
          accessCorporate: profile ?? {},
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
      const { ProfileMaster } = req.tenantModels || {};
      if (!ProfileMaster) return res.status(500).json({ message: "Tenant connection not resolved" });

      const b = req.body;

      // 1. Update Authoritative Isolated Profile
      const profileUpdates = {
        corporateName:     clean(b.corporateName),
        corporateTagName:  clean(b.corporateTagName),
        corporateEmail:    clean(b.corporateEmail),
        ownershipType:     b.ownershipType || "Proprietorship",
        corporatePAN:      clean(b.corporatePAN)?.toUpperCase(),
        corporateActive:   typeof b.corporateActive === "boolean" ? b.corporateActive : true,
        CorpProfileImage:  clean(b.CorpProfileImage),

        centralRegistrations: {
          cin:                clean(b.centralRegistrations?.cin),
          tan:                clean(b.centralRegistrations?.tan),
          iec:                clean(b.centralRegistrations?.iec),
          msme_udyam:         clean(b.centralRegistrations?.msme_udyam),
          fssai:              clean(b.centralRegistrations?.fssai),
          drug_license:       clean(b.centralRegistrations?.drug_license),
          import_export_code: clean(b.centralRegistrations?.import_export_code),
          corporateMobile:    clean(b.centralRegistrations?.corporateMobile),
          corporateTelephone: clean(b.centralRegistrations?.corporateTelephone),
          Quotation_TC:       clean(b.centralRegistrations?.Quotation_TC),
          TaxInvoiceTC:       clean(b.centralRegistrations?.TaxInvoiceTC),
        },

        locations: Array.isArray(b.locations) ? b.locations.map(loc => ({
          locationName:       clean(loc.locationName) || "Head Office",
          locationType:       clean(loc.locationType) || "BO",
          parentId:           loc.parentId || null,
          isRegisteredOffice: !!loc.isRegisteredOffice,
          address: {
            line1:   clean(loc.address?.line1),
            city:    clean(loc.address?.city),
            state:   clean(loc.address?.state),
            pincode: clean(loc.address?.pincode),
            country: clean(loc.address?.country) || "India",
          },
          gstin:              clean(loc.gstin)?.toUpperCase(),
          bankDetails: {
            bank_name:      clean(loc.bankDetails?.bank_name),
            branch:         clean(loc.bankDetails?.branch),
            account_number: clean(loc.bankDetails?.account_number),
            ifsc_code:      clean(loc.bankDetails?.ifsc_code)?.toUpperCase(),
            account_type:   clean(loc.bankDetails?.account_type) || "Current",
            upi_id:         clean(loc.bankDetails?.upi_id),
          },
          contactPerson:      clean(loc.contactPerson),
          contactMobile:      clean(loc.contactMobile),
          contactEmail:       clean(loc.contactEmail),
          active:             typeof loc.active === "boolean" ? loc.active : true,
        })) : [],

        authorizedSignatory: {
          name:            clean(b.authorizedSignatory?.name),
          designation:     clean(b.authorizedSignatory?.designation),
          aadhar:          clean(b.authorizedSignatory?.aadhar),
          signature_label: clean(b.authorizedSignatory?.signature_label) || "Authorised Signatory",
        },

        apiUrls: b.apiUrls || {}
      };

      const updatedProfile = await ProfileMaster.findOneAndUpdate(
        {},
        { $set: profileUpdates },
        { upsert: true, new: true }
      ).lean();

      // 2. Synchronize Display Label in Identity Layer (userMaster)
      const admin = await resolveCorpAdmin(req);
      const tDb = req.tenantDbName || req.user?.dbName;

      if (tDb && (clean(b.corporateName) || clean(b.CorpProfileImage))) {
        const updateFields = {};
        if (clean(b.corporateName)) updateFields["accessCorporate.$.corporateName"] = clean(b.corporateName);
        if (clean(b.CorpProfileImage)) updateFields["accessCorporate.$.CorpProfileImage"] = clean(b.CorpProfileImage);

        await userMaster.updateMany(
          { "accessCorporate.dbName": tDb },
          { $set: updateFields }
        );
      }

      // 🚀 REAL-TIME: Notify all clients in the tenant room
      if (req.io && req.tenantDbName) {
        req.io.to(req.tenantDbName).emit("corp:updated", { data: updatedProfile });
      }

      return res.status(200).json({
        message: "Corporate profile updated in isolated database and identity layer",
        data: updatedProfile
      });
    } catch (err) {
      console.error("[postCorporate]", err);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  },

  // ── POST ADD NEW ───────────────────────────────────────────────────────────
  addCorporate: async (req, res) => {
    try {
      if (req.user.userRole !== "CorpAdmin") {
        return res.status(403).json({ message: "Only CorpAdmin can add new corporates" });
      }

      const b = req.body;
      const pan = clean(b.corporatePAN)?.toUpperCase();
      const cName = clean(b.corporateName);

      if (!cName) return res.status(400).json({ message: "Corporate Name is required" });
      
      const validation = require("../utils/validationHelper");
      if (!validation.isValidPAN(pan)) {
        return res.status(400).json({ message: "A valid 10-character Corporate PAN is required for database isolation." });
      }

      const tenantSecurity = require("../utils/tenantSecurity");
      const dbName = tenantSecurity.encodeDbName(pan);
      
      // 🚀 ISOLATION CHECK: One CorpAdmin per Database/PAN
      const existingOwner = await userMaster.findOne({ 
        "accessCorporate.dbName": dbName, 
        userRole: "CorpAdmin" 
      });

      if (existingOwner) {
        return res.status(400).json({ message: `Corporate with PAN ${pan} is already registered to ${existingOwner._id === req.user.userId ? 'your' : 'an'} account.` });
      }

      // 1. Check if user already has this corporate (redundant but safe)
      const user = await userMaster.findById(req.user.userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      if (user.accessCorporate.some(c => c.dbName === dbName)) {
        return res.status(400).json({ message: "This corporate is already linked to your account" });
      }

      // 2. Prepare seeding data for the new isolated DB
      const profileData = {
        corporateName: cName,
        corporateTagName: clean(b.corporateTagName),
        corporateEmail: clean(b.corporateEmail),
        corporatePAN: pan,
        ownershipType: b.ownershipType || "Proprietorship",
        corporateActive: true,
        centralRegistrations: {
          corporateMobile: clean(b.centralRegistrations?.corporateMobile),
          corporateTelephone: clean(b.centralRegistrations?.corporateTelephone),
        },
        authorizedSignatory: {
          name: clean(b.authorizedSignatory?.name),
          designation: clean(b.authorizedSignatory?.designation),
        }
      };

      // 3. Provision Infrastructure
      const provisioner = require("../utils/mongoProvisioner");
      await provisioner.provisionDatabase(dbName, profileData);

      // 4. Link to User Profile
      user.accessCorporate.push({
        dbName,
        corporateName: cName,
        corporatePAN: pan,
        CorpProfileImage: clean(b.CorpProfileImage) || "",
        isActive: true
      });
      await user.save();

      return res.status(201).json({
        message: "New corporate added and infrastructure provisioned successfully",
        data: { dbName, corporateName: cName }
      });
    } catch (err) {
      console.error("[addCorporate]", err);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  }
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
      const user = await userMaster.findById(req.user.userId).lean();
      if (!user) return res.status(404).json({ message: "User not found" });

      const { userPassword, ...safe } = user; // never return hashed password
      return res.status(200).json({ message: "User fetched", data: { user: safe } });
    } catch (err) {
      console.error("[getAdminUser]", err);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  },

  // ── PUT ───────────────────────────────────────────────────────────────────
  postAdminUser: async (req, res) => {
    try {
      const user = await userMaster.findById(req.user.userId);
      if (!user) {
        console.warn("⚠️ [postAdminUser] Failed to find user:", req.user?.userId);
        return res.status(404).json({ message: "User not found" });
      }

      const b = req.body;
      const $set = {};

      // Only allow safe profile fields – never role / accessCorporate
      if (clean(b.userDisplayName)) $set.userDisplayName = clean(b.userDisplayName);
      if (clean(b.userEmail)) $set.userEmail = clean(b.userEmail).toLowerCase();
      if (clean(b.userMobile)) $set.userMobile = clean(b.userMobile);
      if (clean(b.userAadhar)) $set.userAadhar = clean(b.userAadhar);
      if (b.userDoB) $set.userDoB = new Date(b.userDoB);
      if (req.user?.userRole === "CorpAdmin" && typeof b.userActive === "boolean") {
        $set.userActive = b.userActive;
      }
      if (clean(b.userProfileImage)) $set.userProfileImage = clean(b.userProfileImage);
      if (b.addresses) $set.addresses = b.addresses;
      if (b.dutyShift) {
        const ds = { ...b.dutyShift };
        const durationHrs = Number(ds.durationHrs);
        if (ds.startFrom && !isNaN(durationHrs)) {
          const parts = ds.startFrom.split(':').map(Number);
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const endHrs = (parts[0] + durationHrs) % 24;
            ds.endOn = `${String(endHrs).padStart(2, '0')}:${String(parts[1]).padStart(2, '0')}`;
          }
        }
        $set.dutyShift = ds;
      }

      // ── Password change (optional) ─────────────────────────────────────────
      if (clean(b.newPassword)) {
        if (!clean(b.currentPassword)) {
          return res.status(400).json({ message: "currentPassword is required to change password" });
        }
        const ok = await bcrypt.compare(b.currentPassword, user.userPassword);
        if (!ok) return res.status(401).json({ message: "Current password is incorrect" });

        const salt = await bcrypt.genSalt(10);
        $set.userPassword = await bcrypt.hash(b.newPassword, salt);
      }

      if (Object.keys($set).length === 0) {
        return res.status(400).json({ message: "No updatable fields provided" });
      }

      const updated = await userMaster.findByIdAndUpdate(
        req.user.userId,
        { $set },
        { new: true, runValidators: true }
      ).lean();

      if (!updated) {
          console.error(`❌ [postAdminUser] findByIdAndUpdate returned null for ${req.user.userId}`);
          return res.status(500).json({ message: "Failed to update user document" });
      }

      const { userPassword, ...safe } = updated;
      return res.status(200).json({ message: "User updated", data: { user: safe } });
    } catch (err) {
      console.error("🔴 [postAdminUser] Critical Error:", err);
      if (err.name === 'ValidationError') {
          return res.status(400).json({ message: "Validation failed", errors: err.errors });
      }
      if (err.code === 11000) {
          return res.status(409).json({ message: "Duplicate record: Aadhar or Mobile already exists" });
      }
      return res.status(500).json({ message: "Server error during profile update", error: err.message });
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
        "accessCorporate.dbName": req.tenantDbName || req.user.dbName
      };

      const users = await userMaster.find(
        query,
        // projection – never expose hashed password
        "userDisplayName userEmail userMobile userRole userActive userProfileImage accessCorporate createdAt"
      ).lean();

      return res.status(200).json({
        message: "Other users fetched",
        data: users,
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
        _id: id,
        userRole: { $in: ["Sales", "Project", "Finance"] },
        "accessCorporate.dbName": req.tenantDbName || req.user.dbName
      };

      const user = await userMaster.findOne(
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
        _id: id,
        userRole: { $in: ["Sales", "Project", "Finance"] },
        "accessCorporate.dbName": req.tenantDbName || req.user.dbName
      };

      const existing = await userMaster.findOne(query);
      if (!existing) return res.status(404).json({ message: "User not found or not authorized" });

      const b = req.body;
      const $set = {};

      if (clean(b.userDisplayName)) $set.userDisplayName = clean(b.userDisplayName);
      if (clean(b.userEmail)) $set.userEmail = clean(b.userEmail).toLowerCase();
      if (clean(b.userMobile)) $set.userMobile = clean(b.userMobile);
      if (clean(b.userAadhar)) $set.userAadhar = clean(b.userAadhar);
      if (b.userDoB) $set.userDoB = new Date(b.userDoB);
      if (typeof b.userActive === "boolean") $set.userActive = b.userActive;
      if (clean(b.userProfileImage)) $set.userProfileImage = clean(b.userProfileImage);
      if (b.addresses) $set.addresses = b.addresses;
      if (b.location) $set.location = b.location;
      if (b.dutyShift) {
        const ds = { ...b.dutyShift };
        const durationHrs = Number(ds.durationHrs);
        if (ds.startFrom && !isNaN(durationHrs)) {
          const parts = ds.startFrom.split(':').map(Number);
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const endHrs = (parts[0] + durationHrs) % 24;
            ds.endOn = `${String(endHrs).padStart(2, '0')}:${String(parts[1]).padStart(2, '0')}`;
          }
        }
        $set.dutyShift = ds;
      }

      // Access grant/revoke and corporate permissions
      const tDb = req.tenantDbName || req.user.dbName;
      if (tDb) {
        // Ensure the user has an entry for this corporate in their array
        const userWithLink = await userMaster.findOne({ _id: id, "accessCorporate.dbName": tDb });
        
        if (userWithLink) {
          $set["accessCorporate.$.locationId"] = b.locationId ? new mongoose.Types.ObjectId(b.locationId) : undefined;
        } else {
          // If for some reason they don't have it, push it
          await userMaster.updateOne(
            { _id: id },
            { 
              $push: { 
                accessCorporate: { 
                  dbName: tDb, 
                  locationId: b.locationId ? new mongoose.Types.ObjectId(b.locationId) : undefined,
                  isActive: true
                } 
              } 
            }
          );
        }
      }

      // Password reset (admin resets on behalf of user – no current-password check)
      if (clean(b.newPassword)) {
        const salt = await bcrypt.genSalt(10);
        $set.userPassword = await bcrypt.hash(b.newPassword, salt);
      }

      if (Object.keys($set).length === 0) {
        return res.status(400).json({ message: "No updatable fields provided" });
      }

      const updated = await userMaster.findByIdAndUpdate(
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

  // ── SEARCH USER ───────────────────────────────────────────────────────────
  searchUser: async (req, res) => {
    try {
      const { query } = req.query;
      if (!query || query.trim().length < 4) {
        return res.status(400).json({ message: "Please enter at least 4 characters" });
      }

      const users = await userMaster.find({
        $or: [
          { userMobile: query.trim() },
          { userAadhar: query.trim() }
        ]
      }, "userDisplayName userEmail userMobile userAadhar userRole userActive accessCorporate").lean();

      if (!users || users.length === 0) {
        return res.status(404).json({ message: "No user found with this mobile or aadhar" });
      }

      return res.status(200).json({ message: "User found", data: users[0] });
    } catch (err) {
      console.error("[searchUser]", err);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  },

  assignCorporate: async (req, res) => {
    try {
      const admin = await resolveCorpAdmin(req);
      if (!admin) return res.status(404).json({ message: "CorpAdmin not found" });

      const { id } = req.params;
      const { corporateIds, userActive, accessAllow } = req.body;

      const targetUser = await userMaster.findById(id);
      if (!targetUser) return res.status(404).json({ message: "User not found" });

      // 1. If accessAllow is false, we might want to keep current links but mark them inactive?
      // Or just clear them? Usually "Linking" means adding to the list.
      
      if (!accessAllow) {
          // If the admin unchecks "Master Access", we might want to clear links for THIS admin's corporates.
          // For now, we follow the UI's lead.
      }

      // 2. Map corporateIds (which are _ids of admin's accessCorporate) to actual dbName objects
      const newAccessList = [...(targetUser.accessCorporate || [])];

      if (Array.isArray(corporateIds)) {
          // Remove all links that belong to THIS admin's known corporates so we can re-add the selected ones
          const adminCorpDbs = admin.accessCorporate.map(c => c.dbName);
          const otherAdminLinks = newAccessList.filter(c => !adminCorpDbs.includes(c.dbName));
          
          const selectedLinks = corporateIds.map(corpId => {
              const adminLink = admin.accessCorporate.find(c => String(c._id) === String(corpId) || c.dbName === corpId);
              if (!adminLink) return null;
              return {
                  dbName: adminLink.dbName,
                  corporateName: adminLink.corporateName,
                  corporatePAN: adminLink.corporatePAN,
                  locationId: req.body.locationId ? new mongoose.Types.ObjectId(req.body.locationId) : undefined,
                  isActive: true
              };
          }).filter(Boolean);

          targetUser.accessCorporate = [...otherAdminLinks, ...selectedLinks];
      }

      if (typeof userActive === "boolean") targetUser.userActive = userActive;

      await targetUser.save();

      return res.status(200).json({ message: "Corporate assignment updated", data: targetUser });
    } catch (err) {
      console.error("[assignCorporate]", err);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  },

  // ── UNASSIGN CORPORATE ────────────────────────────────────────────────────
  unassignCorporate: async (req, res) => {
    try {
      const admin = await resolveCorpAdmin(req);
      if (!admin) return res.status(404).json({ message: "CorpAdmin not found" });

      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid user id" });
      }

      const targetUser = await userMaster.findById(id);
      if (!targetUser) return res.status(404).json({ message: "User not found" });

      const targetDb = req.tenantDbName || req.user.dbName;
      targetUser.accessCorporate = (targetUser.accessCorporate || []).filter(c => c.dbName !== targetDb);
      await targetUser.save();

      return res.status(200).json({ message: "User unlinked from corporate successfully" });
    } catch (err) {
      console.error("[unassignCorporate]", err);
      return res.status(500).json({ message: "Server error", error: err.message });
    }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
module.exports = { updateCorporate, updateAdminUser, otherUser };