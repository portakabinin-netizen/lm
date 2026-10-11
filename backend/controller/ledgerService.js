const mongoose = require("mongoose");

function getLedgerModel(dbName) {
  if (dbName && typeof dbName === "string" && dbName.trim()) {
    const tConn = mongoose.connection.useDb(dbName.trim(), { useCache: true });
    return tConn.models.Ledgers || tConn.model("Ledgers", new mongoose.Schema({}, { strict: false }), "ledgers");
  }
  return mongoose.models.Ledgers || mongoose.model("Ledgers", new mongoose.Schema({}, { strict: false }), "ledgers");
}

/**
 * Create Ledger Entry
 */
exports.create = async (data, dbName = "") => {
  const Model = getLedgerModel(dbName);
  const ledger = new Model(data);
  return await ledger.save();
};

/**
 * List Ledger Entries
 */
exports.list = async (filters = {}, dbName = "") => {
  const Model = getLedgerModel(dbName);
  return await Model.find(filters).sort({ createdAt: -1 });
};

/**
 * Get Ledger Entry by ID
 */
exports.getById = async (id, dbName = "") => {
  const Model = getLedgerModel(dbName);
  return await Model.findById(id);
};

/**
 * Update Ledger Entry
 */
exports.update = async (id, data, dbName = "") => {
  const Model = getLedgerModel(dbName);
  return await Model.findByIdAndUpdate(id, data, { new: true });
};

/**
 * Delete Ledger Entry
 */
exports.remove = async (id, dbName = "") => {
  const Model = getLedgerModel(dbName);
  return await Model.findByIdAndDelete(id);
};
