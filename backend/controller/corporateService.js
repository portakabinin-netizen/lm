const mongoose = require("mongoose");

function getProfileModel(dbName) {
  if (dbName && typeof dbName === "string" && dbName.trim()) {
    const tConn = mongoose.connection.useDb(dbName.trim(), { useCache: true });
    return tConn.models.ProfileMaster || tConn.model("ProfileMaster", new mongoose.Schema({}, { strict: false }), "profileMaster");
  }
  return mongoose.models.ProfileMaster || mongoose.model("ProfileMaster", new mongoose.Schema({}, { strict: false }), "profileMaster");
}

/**
 * Create Corporate Profile
 */
exports.create = async (data, dbName = "") => {
  const Model = getProfileModel(dbName);
  const corporate = new Model(data);
  return await corporate.save();
};

/**
 * List Corporate Profiles
 */
exports.list = async (filters = {}, dbName = "") => {
  const Model = getProfileModel(dbName);
  return await Model.find(filters).sort({ createdAt: -1 });
};

/**
 * Get Corporate Profile by ID
 */
exports.getById = async (id, dbName = "") => {
  const Model = getProfileModel(dbName);
  return await Model.findById(id);
};

/**
 * Update Corporate Profile
 */
exports.update = async (id, data, dbName = "") => {
  const Model = getProfileModel(dbName);
  return await Model.findByIdAndUpdate(id, data, { new: true });
};

/**
 * Delete Corporate Profile
 */
exports.remove = async (id, dbName = "") => {
  const Model = getProfileModel(dbName);
  return await Model.findByIdAndDelete(id);
};
