// controllers/orderflowsController.js
const OrderFlows = require("../routes/orderflows");
const {
  generatePONumber,
  generatePINumber,
  generateTINumber,
  generateDNNumber,
  generateCNNumber,
} = require("../controller/generateNumber"); // path as per your project
const { formatDate } = require("../middleware/validateAuth")

/**
 * Helper: build base document object for response with formatted dates
 */
function respondDoc(doc) {
  if (!doc) return null;
  const out = doc.toObject ? doc.toObject() : doc;
  // format any date fields present inside nested docs
  ["purchaseOrder","performaInvoice","taxInvoice","debitNote","creditNote"].forEach(key => {
    if (out[key] && out[key].date) out[key].date = formatDate(out[key].date);
    if (out[key] && out[key].dueDate) out[key].dueDate = formatDate(out[key].dueDate);
  });
  return out;
}

/* ============ CREATE HANDLERS ============ */

/* Create Purchase Order (must be vendor) */
async function createPO(req, res) {
  try {
    const payload = req.body || {};
    // Validate party type if provided
    if (payload.party && payload.party.partyType && payload.party.partyType !== "vendor") {
      return res.status(400).json({ success: false, message: "purchaseOrder.party.partyType must be 'vendor'" });
    }

    const number = await generatePONumber();

    const doc = {
      purchaseOrder: {
        ...payload,
        number,
        date: payload.date || new Date(),
      }
    };

    const newDoc = await OrderFlows.create(doc);
    return res.json({ success: true, number, orderflows: respondDoc(newDoc) });
  } catch (err) {
    console.error("createPO error:", err);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
}

/* Create Proforma Invoice (must be customer) */
async function createPI(req, res) {
  try {
    const payload = req.body || {};
    if (payload.party && payload.party.partyType && payload.party.partyType !== "customer") {
      return res.status(400).json({ success: false, message: "performaInvoice.party.partyType must be 'customer'" });
    }

    const number = await generatePINumber();

    const doc = {
      performaInvoice: {
        ...payload,
        number,
        date: payload.date || new Date(),
      }
    };

    const newDoc = await OrderFlows.create(doc);
    return res.json({ success: true, number, orderflows: respondDoc(newDoc) });
  } catch (err) {
    console.error("createPI error:", err);
    return res.status(500).json({ success: false });
  }
}

/* Create Tax Invoice (must be customer) */
async function createTI(req, res) {
  try {
    const payload = req.body || {};
    if (payload.party && payload.party.partyType && payload.party.partyType !== "customer") {
      return res.status(400).json({ success: false, message: "taxInvoice.party.partyType must be 'customer'" });
    }

    const number = await generateTINumber();

    const doc = {
      taxInvoice: {
        ...payload,
        number,
        date: payload.date || new Date(),
      }
    };

    const newDoc = await OrderFlows.create(doc);
    return res.json({ success: true, number, orderflows: respondDoc(newDoc) });
  } catch (err) {
    console.error("createTI error:", err);
    return res.status(500).json({ success: false });
  }
}

/* Create Debit Note (partyType can be 'vendor' or 'customer') */
async function createDN(req, res) {
  try {
    const payload = req.body || {};
    // optional validation: ensure partyType present and is vendor/customer if provided
    if (payload.party && payload.party.partyType && !["vendor","customer"].includes(payload.party.partyType)) {
      return res.status(400).json({ success: false, message: "debitNote.party.partyType must be 'vendor' or 'customer'" });
    }

    const number = await generateDNNumber();

    const doc = {
      debitNote: {
        ...payload,
        number,
        date: payload.date || new Date(),
      }
    };

    const newDoc = await OrderFlows.create(doc);
    return res.json({ success: true, number, orderflows: respondDoc(newDoc) });
  } catch (err) {
    console.error("createDN error:", err);
    return res.status(500).json({ success: false });
  }
}

/* Create Credit Note (partyType can be 'vendor' or 'customer') */
async function createCN(req, res) {
  try {
    const payload = req.body || {};
    if (payload.party && payload.party.partyType && !["vendor","customer"].includes(payload.party.partyType)) {
      return res.status(400).json({ success: false, message: "creditNote.party.partyType must be 'vendor' or 'customer'" });
    }

    const number = await generateCNNumber();

    const doc = {
      creditNote: {
        ...payload,
        number,
        date: payload.date || new Date(),
      }
    };

    const newDoc = await OrderFlows.create(doc);
    return res.json({ success: true, number, orderflows: respondDoc(newDoc) });
  } catch (err) {
    console.error("createCN error:", err);
    return res.status(500).json({ success: false });
  }
}

/* ============ READ HANDLERS ============ */

/* Get orderflows document by mongo id */
async function getById(req, res) {
  try {
    const id = req.params.id;
    const doc = await OrderFlows.findById(id).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    return res.json(respondDoc(doc));
  } catch (err) {
    console.error("getById error:", err);
    return res.status(500).json({ success: false });
  }
}

/* Get by document number (e.g. PO-2025-00001) */
async function getByNumber(req, res) {
  try {
    const number = req.params.number;
    // find the doc which contains this number in any nested doc
    const doc = await OrderFlows.findOne({
      $or: [
        { "purchaseOrder.number": number },
        { "performaInvoice.number": number },
        { "taxInvoice.number": number },
        { "debitNote.number": number },
        { "creditNote.number": number },
      ],
    }).lean();

    if (!doc) return res.status(404).json({ success: false, message: "Not found" });
    return res.json(respondDoc(doc));
  } catch (err) {
    console.error("getByNumber error:", err);
    return res.status(500).json({ success: false });
  }
}

/* List all orderflows (paginated basic) */
async function list(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const skip = parseInt(req.query.skip || "0", 10);
    const docs = await OrderFlows.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
    return res.json(docs.map(d => respondDoc(d)));
  } catch (err) {
    console.error("list error:", err);
    return res.status(500).json({ success: false });
  }
}

module.exports = {
  createPO,
  createPI,
  createTI,
  createDN,
  createCN,
  getById,
  getByNumber,
  list,
};
