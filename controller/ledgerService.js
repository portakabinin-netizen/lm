const { Users, Corporates } = require("../models/UsersCorporates");

/**
 * Create Ledger Entry
 */
exports.create = async (data) => {
  const ledger = new Ledger(data);
  return await ledger.save();
};

/**
 * List Ledger Entries
 */
exports.list = async (filters = {}) => {
  return await Ledger.find(filters).sort({ createdAt: -1 });
};

/**
 * Get Ledger Entry by ID
 */
exports.getById = async (id) => {
  return await Ledger.findById(id);
};

/**
 * Update Ledger Entry
 */
exports.update = async (id, data) => {
  return await Ledger.findByIdAndUpdate(id, data, { new: true });
};

/**
 * Delete Ledger Entry
 */
exports.remove = async (id) => {
  return await Ledger.findByIdAndDelete(id);
};
