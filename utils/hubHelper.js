const mongoose = require("mongoose");
const { CorpDataMaster } = require("../models/CorpDataMaster");
const { LedgerVoucherMaster } = require("../models/LedgerVoucherMaster");

/**
 * 🏰 Hub Helper: Unified access to Hub-and-Spoke 2.0 Documents
 * RESTORED: Uses primary connection for all operations.
 */
const hubHelper = {
    /**
     * Resolves the CorpDataMaster Hub for a given admin and corporate slot.
     */
    resolveCorpHub: async (corpAdminId, corporateId) => {
        if (!corpAdminId || !corporateId) {
            console.warn("⚠️ HubHelper: Missing Corporate Identity (Legacy Call detected). Use req.tenantModels instead.");
            return null;
        }
        
        try {
            const aid = new mongoose.Types.ObjectId(corpAdminId);
            const cid = corporateId.toString();

            let hub = await CorpDataMaster.findById(aid);
            if (!hub) {
                hub = new CorpDataMaster({ _id: aid, corporateData: {} });
            }

            if (!hub.corporateData.has(cid)) {
                hub.corporateData.set(cid, {
                    clients: [], suppliers: [], employees: [], leads: [],
                    categories: [], products: [], rates: [], groups: [], ledgers: [],
                    vouchers: [], attendance: [], counters: { lead: 0, voucher: 0, invoice: 0 }
                });
            }

            return { hub, corpData: hub.corporateData.get(cid) };
        } catch (err) {
            console.error("Hub Resolution Error:", err);
            throw err;
        }
    },

    /**
     * Read-Optimized Resolution
     */
    resolveCorpHubReadOnly: async (corpAdminId, corporateId) => {
        if (!corpAdminId || !corporateId) throw new Error("Missing Identity");
        
        const aid = new mongoose.Types.ObjectId(corpAdminId);
        const cid = corporateId.toString();

        const hub = await CorpDataMaster.findById(aid).lean();
        if (!hub || !hub.corporateData || !hub.corporateData[cid]) {
            return { corpData: null };
        }

        return { corpData: hub.corporateData[cid] };
    },

    /**
     * 📖 Resolves the LedgerVoucherMaster Hub (Accounting Hub)
     */
    resolveAccHub: async (corpAdminId, corporateId) => {
        if (!corpAdminId || !corporateId) throw new Error("Missing Accounting Identity");

        try {
            const aid = new mongoose.Types.ObjectId(corpAdminId);
            const cid = corporateId.toString();

            let hub = await LedgerVoucherMaster.findById(aid);
            if (!hub) {
                hub = new LedgerVoucherMaster({ _id: aid, corporateData: {} });
            }

            if (!hub.corporateData.has(cid)) {
                hub.corporateData.set(cid, {
                    groups: [],
                    ledgers: [],
                    vouchers: { Payment: [], Receipt: [], Sale: [], Purchase: [], Contra: [], Journal: [] }
                });
            }

            return { hub, accData: hub.corporateData.get(cid) };
        } catch (err) {
            console.error("Accounting Hub Resolution Error:", err);
            throw err;
        }
    },

    /**
     * Read-Optimized Accounting Hub resolution
     */
    resolveAccHubReadOnly: async (corpAdminId, corporateId) => {
        if (!corpAdminId || !corporateId) throw new Error("Missing Identity");

        const aid = new mongoose.Types.ObjectId(corpAdminId);
        const cid = corporateId.toString();

        const hub = await LedgerVoucherMaster.findById(aid).lean();
        if (!hub || !hub.corporateData || !hub.corporateData[cid]) {
            return { accData: null };
        }

        return { accData: hub.corporateData[cid] };
    }
};

module.exports = hubHelper;
