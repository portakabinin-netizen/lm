const { SalesBook } = require("../models/SalPurBook");
const Purchase = require("../models/purchase");
const mongoose = require("mongoose");

/* ── HELPER: Enrich Line Items ───────────────────────────── */
async function enrichLineItems(items, corporateId, req) {
    if (!items || !Array.isArray(items)) return [];
    if (!corporateId) throw new Error("Corporate identity required for product enrichment.");
    
    // Get purchase document for the specific corporate hub
    const corpAdminId = req?.user?.corpAdminId; 
    const purchaseHub = await Purchase.findOne({ _id: corpAdminId });
    const cid = corporateId?.toString();
    const purchase = purchaseHub?.corporateData instanceof Map 
        ? purchaseHub.corporateData.get(cid) 
        : purchaseHub?.corporateData?.[cid];
    if (!purchase) return items;

    return items.map(item => {
        if (!item.categoryId || !item.productId) return item;
        
        const cat = purchase.categories.find(c => c._id.toString() === item.categoryId.toString());
        if (!cat) return item;
        
        const prod = cat.products.find(p => p._id.toString() === item.productId.toString());
        if (!prod) return item;

        // Populate hsn_sac if missing
        if (!item.hsn_sac) item.hsn_sac = prod.hsn_sac || cat.hsn_sac;

        // Fetch buy_rate if vendorId provided
        if (item.vendorId) {
            const vendor = purchase.vendors.find(v => v._id.toString() === item.vendorId.toString());
            if (vendor) {
                const pc = vendor.productCost?.find(c => c.categoryId?.toString() === item.categoryId?.toString());
                const vp = pc?.products?.find(p => p.productId?.toString() === item.productId?.toString());
                if (vp && !item.buy_rate) item.buy_rate = vp.price;
            }
        }
        
        // Calculate sell_rate if missing and buy_rate available
        if (!item.sell_rate && item.buy_rate) {
            const margin = prod.margin || 15;
            item.sell_rate = item.buy_rate * (1 + (margin / 100));
        }

        return item;
    });
}

/* ── HELPER: Hub Resolver ───────────────────────────── */
async function getSalesBookHub(filters) {
    const { corpAdminId, corporateId } = filters;
    if (!corpAdminId || !corporateId) throw new Error("Identity missing.");

    let hub = await SalesBook.findOne({ corpAdminId });
    if (!hub) {
        hub = await SalesBook.create({ corpAdminId, corporateData: {} });
    }

    if (!hub.corporateData.has(corporateId)) {
        hub.corporateData.set(corporateId, { 
            quotations: [], purchaseOrders: [], taxInvoices: []
        });
        await hub.save();
    }

    return hub;
}

/* ── HELPER: Generate Quote Number ───────────────────────── */
async function generateQuoteNumber(corpAdminId, corporateId, quote_date) {
    const d  = quote_date ? new Date(quote_date) : new Date();
    const yr = d.getMonth() >= 3
        ? `${d.getFullYear()}-${String(d.getFullYear() + 1).slice(2)}`
        : `${d.getFullYear() - 1}-${String(d.getFullYear()).slice(2)}`;

    const hub = await SalesBook.findOne({ corpAdminId }).lean();
    const cid = corporateId?.toString();
    const record = hub?.corporateData instanceof Map 
        ? hub.corporateData.get(cid) 
        : hub.corporateData?.[cid];
    if (!record || !record.quotations) return `QT/${yr}/00001`;

    const allQuotes = record.quotations
        .filter(q => q.quote_number && q.quote_number.includes(yr))
        .map(q => q.quote_number);

    let seq = 1;
    if (allQuotes.length > 0) {
        allQuotes.sort();
        const lastNum = allQuotes[allQuotes.length - 1];
        const parts = lastNum.split("/");
        seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
    }

    return `QT/${yr}/${String(seq).padStart(5, "0")}`;
}

async function generatePONumber(corpAdminId, corporateId, po_date) {
    const d = po_date ? new Date(po_date) : new Date();
    const yr = d.getMonth() >= 3
        ? `${d.getFullYear()}-${String(d.getFullYear() + 1).slice(2)}`
        : `${d.getFullYear() - 1}-${String(d.getFullYear()).slice(2)}`;
    
    const hub = await SalesBook.findOne({ corpAdminId }).lean();
    const cid = corporateId?.toString();
    const record = hub?.corporateData instanceof Map 
        ? hub.corporateData.get(cid) 
        : hub.corporateData?.[cid];
    if (!record || !record.purchaseOrders) return `PO/${yr}/00001`;

    const allPOs = record.purchaseOrders
        .filter(p => p.po_number && p.po_number.includes(yr))
        .map(p => p.po_number);

    let seq = 1;
    if (allPOs.length > 0) {
        allPOs.sort();
        const lastNum = allPOs[allPOs.length - 1];
        const parts = lastNum.split("/");
        seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
    }

    return `PO/${yr}/${String(seq).padStart(5, "0")}`;
}

async function generateInvoiceNumber(corpAdminId, corporateId, invoice_date) {
    const d = invoice_date ? new Date(invoice_date) : new Date();
    const yr = d.getMonth() >= 3
        ? `${d.getFullYear()}-${String(d.getFullYear() + 1).slice(2)}`
        : `${d.getFullYear() - 1}-${String(d.getFullYear()).slice(2)}`;
    
    const hub = await SalesBook.findOne({ corpAdminId }).lean();
    const cid = corporateId?.toString();
    const record = hub?.corporateData instanceof Map 
        ? hub.corporateData.get(cid) 
        : hub.corporateData?.[cid];
    if (!record || !record.taxInvoices) return `INV/${yr}/00001`;

    const allInvoices = record.taxInvoices
        .filter(i => i.invoice_number && i.invoice_number.includes(yr))
        .map(i => i.invoice_number);

    let seq = 1;
    if (allInvoices.length > 0) {
        allInvoices.sort();
        const lastNum = allInvoices[allInvoices.length - 1];
        const parts = lastNum.split("/");
        seq = (parseInt(parts[parts.length - 1], 10) || 0) + 1;
    }

    return `INV/${yr}/${String(seq).padStart(5, "0")}`;
}

/* ── CREATE OFFER (QUOTATION) ────────────────────────────── */
exports.createQuote = async (req, res) => {
  try {
    const { leadId, ...offerData } = req.body;
    const corporateId = req.body.corporateId || req.user.corporateId;
    const corpAdminId = req.user.corpAdminId;
    
    if (!offerData.quote_number) {
        offerData.quote_number = await generateQuoteNumber(corpAdminId, corporateId, offerData.quote_date);
    }
    
    const hub = await getSalesBookHub({ corpAdminId, corporateId });
    const record = hub.corporateData.get(corporateId);
    
    // Populate/Enrich multiple items
    if (offerData.items) {
        offerData.items = await enrichLineItems(offerData.items, corporateId, req);
    }

    offerData.leadId = leadId; 
    record.quotations.push(offerData);
    await hub.save();
    
    const newOffer = record.quotations[record.quotations.length - 1];
    res.status(201).json({ success: true, data: newOffer.toObject() });
  } catch (err) {
    res.status(err.name === "ValidationError" ? 400 : 500).json({ success: false, message: err.message });
  }
};

/* ── CREATE PURCHASE ORDER ───────────────────────────────── */
exports.createPO = async (req, res) => {
    try {
        const { leadId, ...poData } = req.body;
        const corporateId = req.body.corporateId || req.user.corporateId;
        const corpAdminId = req.user.corpAdminId;

        if (!poData.po_number) poData.po_number = await generatePONumber(corpAdminId, corporateId, poData.po_date);

        const hub = await getSalesBookHub({ corpAdminId, corporateId });
        const record = hub.corporateData.get(corporateId);

        if (poData.items) poData.items = await enrichLineItems(poData.items, corporateId, req);

        poData.leadId      = leadId;

        record.purchaseOrders.push(poData);
        await hub.save();

        const newPO = record.purchaseOrders[record.purchaseOrders.length - 1];
        res.status(201).json({ success: true, data: newPO.toObject() });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/* ── CREATE TAX INVOICE ──────────────────────────────────── */
exports.createInvoice = async (req, res) => {
    try {
        const { leadId, ...invData } = req.body;
        const corporateId = req.body.corporateId || req.user.corporateId;
        const corpAdminId = req.user.corpAdminId;

        if (!invData.invoice_number) invData.invoice_number = await generateInvoiceNumber(corpAdminId, corporateId, invData.invoice_date);

        const hub = await getSalesBookHub({ corpAdminId, corporateId });
        const record = hub.corporateData.get(corporateId);

        if (invData.items) invData.items = await enrichLineItems(invData.items, corporateId, req);

        invData.leadId      = leadId;

        record.taxInvoices.push(invData);
        await hub.save();

        const newInv = record.taxInvoices[record.taxInvoices.length - 1];
        res.status(201).json({ success: true, data: newInv.toObject() });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/* ── LIST QUOTATIONS ──────────────────────────────────── */
exports.listQuotations = async (req, res) => {
  try {
    const corporateId = req.query.corporateId || req.user.corporateId;
    const corpAdminId = req.user.corpAdminId;
    const { leadId } = req.query;

    const hub = await SalesBook.findOne({ corpAdminId }).lean();
    const cid = corporateId?.toString();
    const data = hub?.corporateData instanceof Map 
        ? hub.corporateData.get(cid) 
        : hub.corporateData?.[cid];
    
    if (!data) return res.json({ success: true, data: [] });

    let qs = data.quotations || [];
    if (leadId) qs = qs.filter(q => q.leadId?.toString() === leadId.toString());
    
    res.json({ success: true, data: qs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ── LIST POs ───────────────────────────────────────── */
exports.listPOs = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user.corporateId;
        const corpAdminId = req.user.corpAdminId;
        const { leadId } = req.query;

        const hub = await SalesBook.findById(corpAdminId).lean();
        const cid = corporateId?.toString();
        const data = hub?.corporateData instanceof Map 
            ? hub.corporateData.get(cid) 
            : hub.corporateData?.[cid];

        if (!data) return res.json({ success: true, data: [] });

        let items = data.purchaseOrders || [];
        if (leadId) items = items.filter(p => p.leadId?.toString() === leadId.toString());
        
        res.json({ success: true, data: items });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/* ── LIST INVOICES ──────────────────────────────────── */
exports.listInvoices = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user.corporateId;
        const corpAdminId = req.user.corpAdminId;
        const { leadId } = req.query;

        const hub = await SalesBook.findById(corpAdminId).lean();
        const cid = corporateId?.toString();
        const data = hub?.corporateData instanceof Map 
            ? hub.corporateData.get(cid) 
            : hub.corporateData?.[cid];

        if (!data) return res.json({ success: true, data: [] });

        let items = data.taxInvoices || [];
        if (leadId) items = items.filter(i => i.leadId?.toString() === leadId.toString());
        
        res.json({ success: true, data: items });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

/* ── GET OFFER BY ID ─────────────────────────────────────── */
exports.getQuote = async (req, res) => {
  try {
    const corporateId = req.query.corporateId || req.user.corporateId;
    const corpAdminId = req.user.corpAdminId;
    const { id } = req.params;

    const hub = await SalesBook.findOne({ corpAdminId }).lean();
    const cid = corporateId?.toString();
    const data = hub?.corporateData instanceof Map 
        ? hub.corporateData.get(cid) 
        : hub.corporateData?.[cid];
    if (!data) return res.status(404).json({ success: false, message: "Corporate data not found" });
    
    const offer = data.quotations?.find(o => o._id.toString() === id);
    if (!offer) return res.status(404).json({ success: false, message: "Quote not found" });
    
    res.json({ success: true, data: offer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ── UPDATE OFFER ────────────────────────────────────────── */
exports.updateQuote = async (req, res) => {
    try {
        const corporateId = req.body.corporateId || req.user.corporateId;
        const corpAdminId = req.user.corpAdminId;
        const { id } = req.params;
        const updates = req.body;
        
        const hub = await getSalesBookHub({ corpAdminId, corporateId });
        const record = hub.corporateData.get(corporateId);
        
        const offerDoc = record.quotations.id(id);
        if (!offerDoc) return res.status(404).json({ success: false, message: "Quote not found" });

        Object.keys(updates).forEach(k => {
            offerDoc[k] = updates[k];
        });
        
        if (updates.status === "Revised") {
            offerDoc.revision_count = (offerDoc.revision_count || 0) + 1;
        }

        await hub.save();
        res.json({ success: true, data: offerDoc.toObject() });
    } catch (err) {
        const status = err.name === "ValidationError" ? 400 : 500;
        res.status(status).json({ success: false, message: err.message });
    }
};

/* ── DELETE OFFER ────────────────────────────────────────── */
exports.deleteQuote = async (req, res) => {
  try {
    const corporateId = req.query.corporateId || req.user.corporateId;
    const corpAdminId = req.user.corpAdminId;
    const hub = await getSalesBookHub({ corpAdminId, corporateId });
    const record = hub.corporateData.get(corporateId);
    
    record.quotations.pull({ _id: req.params.id });
    await hub.save();
    
    res.json({ success: true, message: "Record deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/* ── FINANCE ANALYTICS ───────────────────────────────────── */
exports.getFinanceAnalytics = async (req, res) => {
    try {
        const corporateId = req.query.corporateId || req.user.corporateId;
        const corpAdminId = req.user.corpAdminId;
        const hub = await SalesBook.findById(corpAdminId).lean();
        const cid = corporateId?.toString();
        const record = hub?.corporateData instanceof Map 
            ? hub.corporateData.get(cid) 
            : hub.corporateData?.[cid];
        
        if (!record) {
            return res.json({ 
                success: true, 
                data: {
                    quotationAmount: 0,
                    invoiceAmount: 0,
                    poAmount: 0,
                    invoiceReceivedAmount: 0,
                    pendingBills: 0,
                    pendingInvoices: 0,
                    quoteVsInvoice: [
                        { label: "Quotations", value: 0 },
                        { label: "Tax Invoices", value: 0 }
                    ],
                    poVsInvoiceReceived: [
                        { label: "Purchase Orders", value: 0 },
                        { label: "Invoices Received", value: 0 }
                    ],
                    pendingComparison: [
                        { label: "Pending Bills", value: 0 },
                        { label: "Pending Invoices", value: 0 }
                    ]
                } 
            });
        }

        const quoteTotal = (record.quotations || []).reduce((s, q) => s + (q.totals?.grand_total || 0), 0);
        
        const salesInvoices = (record.taxInvoices || []).filter(i => i.leadId);
        const invoiceTotal = salesInvoices.reduce((s, i) => s + (i.totals?.grand_total || 0), 0);

        const poTotal = (record.purchaseOrders || []).reduce((s, p) => s + (p.totals?.grand_total || 0), 0);
        const purchaseInvoices = (record.taxInvoices || []).filter(i => i.vendorId);
        const invoiceReceivedTotal = purchaseInvoices.reduce((s, i) => s + (i.totals?.grand_total || 0), 0);

        const pendingInvoices = salesInvoices
            .filter(i => ["Unpaid", "Partially Paid"].includes(i.status))
            .reduce((s, i) => s + (i.totals?.grand_total || 0), 0);

        const pendingBills = purchaseInvoices
            .filter(i => ["Unpaid", "Partially Paid"].includes(i.status))
            .reduce((s, i) => s + (i.totals?.grand_total || 0), 0);

        res.json({
            success: true,
            data: {
                quotationAmount: quoteTotal,
                invoiceAmount: invoiceTotal,
                poAmount: poTotal,
                invoiceReceivedAmount: invoiceReceivedTotal,
                pendingBills: pendingBills,
                pendingInvoices: pendingInvoices,
                
                quoteVsInvoice: [
                    { label: "Quotations", value: quoteTotal },
                    { label: "Tax Invoices", value: invoiceTotal }
                ],
                poVsInvoiceReceived: [
                    { label: "Purchase Orders", value: poTotal },
                    { label: "Invoices Received", value: invoiceReceivedTotal }
                ],
                pendingComparison: [
                    { label: "Pending Bills", value: pendingBills },
                    { label: "Pending Invoices", value: pendingInvoices }
                ]
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
