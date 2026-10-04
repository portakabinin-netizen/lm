const mongoose = require("mongoose");

// ─────────────────────────────────────────────────────────────────────────────
// 📂  Ledger Group Schema
//     Defines the categorization for ledgers (e.g., Debtors, Creditors).
// ─────────────────────────────────────────────────────────────────────────────
const ledgerGroupSchema = new mongoose.Schema(
    {
        groupName: { type: String, required: true, trim: true },
        nature: { 
            type: String, 
            enum: ["Asset", "Liability", "Income", "Expense"],
            required: true 
        },
        description: { type: String, trim: true },
        isDefault: { type: Boolean, default: false },
    },
    { _id: true }
);

// ─────────────────────────────────────────────────────────────────────────────
// 📖  Ledger Folio Schema
//     Represents a single account in the ledger.
// ─────────────────────────────────────────────────────────────────────────────
const ledgerSchema = new mongoose.Schema(
    {
        ledgerName: { type: String, required: true, trim: true },
        groupName: { 
            type: String, 
            required: true,
            enum: [
                "Sundry Debtors", 
                "Sundry Creditors", 
                "Sales Accounts", 
                "Purchase Accounts", 
                "Direct Incomes", 
                "Indirect Incomes", 
                "Direct Expenses", 
                "Indirect Expenses",
                "Capital Account",
                "Loans (Liability)",
                "Current Liabilities",
                "Fixed Assets",
                "Investments",
                "Current Assets",
                "Cash-in-hand",
                "Bank Accounts",
                "Stock-in-hand",
                "Loans & Advances (Asset)",
                "Duties & Taxes",
                "Provisions"
            ] 
        },
        openingBalance: { type: Number, default: 0 },
        currentBalance: { type: Number, default: 0 },
        refId: { type: mongoose.Schema.Types.ObjectId }, // Link to Lead, Vendor, etc.
        refType: { type: String, enum: ["Lead", "Vendor", "Staff", "Client", "Other"] },
        leadIds: [{ type: mongoose.Schema.Types.ObjectId }], // Multiple inquiries for Debtors
        purchaseOrders: [{ type: mongoose.Schema.Types.ObjectId }], // Linked POs for Creditors
        isActive: { type: Boolean, default: true },
    },
    { _id: true, timestamps: true }
);

// ─────────────────────────────────────────────────────────────────────────────
// 🎫  Voucher Entry Schema (Double Entry row)
// ─────────────────────────────────────────────────────────────────────────────
const voucherEntrySchema = new mongoose.Schema(
    {
        ledgerId: { 
            type: mongoose.Schema.Types.ObjectId, 
            required: true 
        },
        ledgerName: { type: String, trim: true },
        debit: { type: Number, default: 0, min: 0 },
        credit: { type: Number, default: 0, min: 0 },
        leadId: { type: mongoose.Schema.Types.ObjectId },
    },
    { _id: false }
);

// ─────────────────────────────────────────────────────────────────────────────
// 📄  Voucher Schema (Base)
// ─────────────────────────────────────────────────────────────────────────────
const voucherSchema = new mongoose.Schema(
    {
        voucherNumber: { type: String, trim: true, index: true },
        date: { type: Date, default: Date.now },
        narration: { type: String, trim: true },
        entries: {
            type: [voucherEntrySchema],
            required: true,
            validate: {
                validator: (v) => v.length >= 2,
                message: "A voucher must have at least two entries."
            }
        },
        refDocNo: { type: String, trim: true }, // e.g., Invoice No or PO No
        financial_year: { type: String, trim: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
    },
    { _id: true, timestamps: true }
);

// ── Validation: Double Entry Check ──
voucherSchema.pre("save", function (next) {
    let totalDebit = 0;
    let totalCredit = 0;
    this.entries.forEach(entry => {
        totalDebit += (entry.debit || 0);
        totalCredit += (entry.credit || 0);
    });
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
        return next(new Error(`Voucher not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`));
    }
    next();
});

// ─────────────────────────────────────────────────────────────────────────────
// 🏰  Corporate Hub Partition
// ─────────────────────────────────────────────────────────────────────────────
const corporateAccountingSchema = new mongoose.Schema(
    {
        groups: { 
            type: [ledgerGroupSchema], 
            default: [],
            validate: {
                validator: function(v) {
                    const names = v.map(g => g.groupName.toLowerCase().trim());
                    return names.length === new Set(names).size;
                },
                message: "Group names must be unique."
            }
        },
        ledgers: { 
            type: [ledgerSchema], 
            default: [],
            validate: {
                validator: function(v) {
                    const names = v.map(l => l.ledgerName.toLowerCase().trim());
                    return names.length === new Set(names).size;
                },
                message: "Ledger names must be unique."
            }
        },
        vouchers: {
            Payment:  { type: [voucherSchema], default: [] },
            Receipt:  { type: [voucherSchema], default: [] },
            Sale:     { type: [voucherSchema], default: [] },
            Purchase: { type: [voucherSchema], default: [] },
            Contra:   { type: [voucherSchema], default: [] },
            Journal:  { type: [voucherSchema], default: [] },
        }
    },
    { _id: false }
);

// ─────────────────────────────────────────────────────────────────────────────
// 🏷️  Main Hub Schema (Root)
// ─────────────────────────────────────────────────────────────────────────────
const LedgerVoucherMasterSchema = new mongoose.Schema(
    {
        _id: { type: mongoose.Schema.Types.ObjectId, required: true }, // corpAdminId
        corporateData: {
            type: Map,
            of: corporateAccountingSchema,
            default: {},
        },
    },
    { timestamps: true }
);

const LedgerVoucherMaster = mongoose.models.LedgerVoucherMaster 
    || mongoose.model("LedgerVoucherMaster", LedgerVoucherMasterSchema);

module.exports = { LedgerVoucherMaster };
