const OrderFlows = require("../models/orderflowsnew");

/**
 * Generic generator
 * docKey = "purchaseOrder", "performaInvoice", "taxInvoice", "debitNote", "creditNote"
 * prefix = "PO", "PI", "TI", "DN", "CN"
 */
async function generateAutoNumber(docKey, prefix) {
  const year = new Date().getFullYear();

  const lastDoc = await OrderFlows.findOne(
    { [`${docKey}.number`]: { $exists: true } }
  )
    .sort({ createdAt: -1 })
    .lean();

  let nextNumber = 1;

  if (lastDoc && lastDoc[docKey] && lastDoc[docKey].number) {
    const lastNum = parseInt(lastDoc[docKey].number.split("-")[2], 10);
    nextNumber = lastNum + 1;
  }

  const padded = String(nextNumber).padStart(5, "0");
  return `${prefix}-${year}-${padded}`;
}

/* ===========================
   EXPORT INDIVIDUAL GENERATORS
=========================== */

async function generatePONumber() {
  return generateAutoNumber("purchaseOrder", "PO");
}

async function generatePINumber() {
  return generateAutoNumber("performaInvoice", "PI");
}

async function generateTINumber() {
  return generateAutoNumber("taxInvoice", "TI");
}

async function generateDNNumber() {
  return generateAutoNumber("debitNote", "DN");
}

async function generateCNNumber() {
  return generateAutoNumber("creditNote", "CN");
}

module.exports = {
  generatePONumber,
  generatePINumber,
  generateTINumber,
  generateDNNumber,
  generateCNNumber,
};
