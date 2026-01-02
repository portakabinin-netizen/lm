const Corporate = require("../models/UsersCorporates");

/**
 * Create Corporate
 */
exports.create = async (data) => {
  const corporate = new Corporate(data);
  return await corporate.save();
};

/**
 * List Corporates
 */
exports.list = async (filters = {}) => {
  return await Corporate.find(filters).sort({ createdAt: -1 });
};

/**
 * Get Corporate by ID
 */
exports.getById = async (id) => {
  return await Corporate.findById(id);
};

/**
 * Update Corporate
 */
exports.update = async (id, data) => {
  return await Corporate.findByIdAndUpdate(id, data, { new: true });
};

/**
 * Delete Corporate
 */
exports.remove = async (id) => {
  return await Corporate.findByIdAndDelete(id);
};
