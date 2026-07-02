const mongoose = require('mongoose');
const {
  fullAddressSchema,
  bankAccountSchema,
  employeeAddressSchema,
  corporateProfileSchema,
} = require('./masterShared');
const { staffMonitoringSchema } = require('./StaffMonitoring');

/**
 * 🏢 Tenant Models Factory
 * This file defines the operational schemas that will be instantiated
 * per corporate database.
 */

// 1. Profile Master (Local Source of Truth in Tenant DB)
const profileMasterSchema = corporateProfileSchema.clone();
profileMasterSchema.set('timestamps', true);
profileMasterSchema.set('collection', 'profileMaster');

// 2. Product & Category
const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
});

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Categories' },
    categoryName: { type: String, trim: true },
    hsn_sac: { type: String, trim: true },
    unit: { type: String, trim: true, default: 'PCS' },
    description: { type: String, trim: true },
    standardRate: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// 3. Parties (Clients/Suppliers)
const partySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    pan: { type: String, trim: true, uppercase: true },
    gst: { type: String, trim: true, uppercase: true },
    bank: bankAccountSchema,
    billingAddress: fullAddressSchema,
    shippingAddress: fullAddressSchema,
    contact_person: { type: String, trim: true },
    mobile: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    type: { type: String, enum: ['Client', 'Supplier'], required: true },
    active: { type: Boolean, default: true },
    ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ledgers' },
  },
  { timestamps: true }
);

// 4. Employees

// ── Employment History Entry ──────────────────────────────────────────────────
// Each entry represents one "employment period" for the worker.
// Only one entry should have active: true at any time — the current arrangement.
const employmentEntrySchema = new mongoose.Schema(
  {
    joinDate: { type: Date, required: true }, // Start of this employment period
    daily_rate: { type: Number, default: 0 }, // Daily wage (₹)
    monthly_rate: { type: Number, default: 0 }, // Monthly salary (₹)
    shiftStartTime: { type: String, trim: true }, // Shift start in HH:MM (24h), e.g. "08:00"
    shiftHours: { type: Number, default: 8 }, // Duration in hours (8 for MANG, 12 for DaNi)
    // ── Shift Group & Name ──────────────────────────────────────────────────
    // groupName: MANG (8hr shifts) or DaNi (12hr shifts)
    groupName: { type: String, enum: ['MANG', 'DaNi', null], default: null },
    // shiftName: specific slot within the group
    //   MANG slots: Morning | Afternoon | Night | General
    //   DaNi slots: Day | Night
    shiftName: {
      type: String,
      enum: ['Morning', 'Afternoon', 'Night', 'General', 'Day', null],
      default: null,
    },
    active: { type: Boolean, default: true }, // true = currently active employment period
    endDate: { type: Date }, // Populated when this period ends
    notes: { type: String, trim: true }, // Optional reason / remark for change
    locationId: { type: mongoose.Schema.Types.ObjectId },
  },
  { _id: true, timestamps: true }
);

const employeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    father_name: { type: String, trim: true },
    role: { type: String, trim: true },
    mobile: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    pan: { type: String, trim: true, uppercase: true },
    aadhar: { type: String, trim: true },
    aadhar_no: { type: String, trim: true },
    enrollment_no: { type: String, trim: true },
    dob: { type: Date },
    gender: { type: String, enum: ['Male', 'Female', 'Transgender'], default: 'Male' },
    photo_url: { type: String, trim: true },

    employmentHistory: { type: [employmentEntrySchema], default: [] },
    bank: bankAccountSchema,
    addresses: employeeAddressSchema,
    active: { type: Boolean, default: true },
    ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ledgers' },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'userMaster' },
    userRole: { type: String, trim: true },
    shiftGroupName: { type: String, enum: ['MANG', 'DaNi', null], default: null },
    selectedShift: { type: String, trim: true },
    monthlyRate: { type: Number, default: 0 },
    locationId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

// 5. Leads (CRM)
const leadSchema = new mongoose.Schema(
  {
    lead_no: { type: Number, unique: true },
    sender_name: { type: String, trim: true },
    sender_mobile: { type: String, trim: true },
    sender_email: { type: String, trim: true, lowercase: true },
    sender_city: { type: String, trim: true },
    sender_state: { type: String, trim: true },
    product_name: { type: String, trim: true },
    source: { type: String, trim: true },
    source_id: { type: String, trim: true, unique: true },
    status: { type: String, default: 'Recent' },
    generated_date: { type: Date, default: Date.now },
    clientId: { type: mongoose.Schema.Types.ObjectId },
    ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ledgers' }, // Link to isolated client ledger
    ledgerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ledgers' }],
    activity: [
      new mongoose.Schema(
        {
          action: { type: String },
          byUser: { type: String },
          date: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
    ],
    locationId: { type: mongoose.Schema.Types.ObjectId }, // Link to ProfileMaster.locations._id
    // ── Site Geo Location ──
    location: {
      lat: { type: Number },
      long: { type: Number },
      address: { type: String },
    },
    // ── Site Shift Configuration ──────────────────────────────────────────────
    // Each entry defines one shift slot at this site.
    // Duty start is BLOCKED until at least one active shift is configured here.
    siteShifts: [
      new mongoose.Schema(
        {
          shiftName: { type: String, trim: true }, // 'Morning' | 'Afternoon' | 'Night' | 'General' | 'Day' | 'Night12'
          groupName: { type: String, trim: true }, // 'MANG' (8hr) | 'DaNi' (12hr)
          shiftCode: { type: String, trim: true }, // 'M' | 'A' | 'N' | 'G' | 'D' | 'N2'
          startTime: { type: String, trim: true }, // e.g. "06:00"
          durationHrs: { type: Number, default: 8 }, // 8 or 12
          workerSlots: { type: Number, default: 1 }, // Required workers for this shift per day
          // Billing rate options (per-day or per-shift)
          billRate: { type: Number, default: 0 }, // Amount charged to client per worker per shift
          salaryRate: { type: Number, default: 0 }, // Amount paid to worker per shift
          active: { type: Boolean, default: true },
        },
        { _id: true }
      ),
    ],
  },
  { timestamps: true }
);

leadSchema.index({ locationId: 1 });
leadSchema.index({ status: 1 });
leadSchema.index({ ledgerId: 1 });
leadSchema.index({ ledgerIds: 1 });

// 6. Attendance
// Shift Reference — Group MANG (8hr):
//   M = Morning   8h  (06:00–14:00)
//   A = Afternoon 8h  (14:00–22:00)
//   N = Night     8h  (22:00–06:00)
//   G = General   8h  (any fixed 8h window)
// Shift Reference — Group DaNi (12hr):
//   D  = Day   12h  (06:00–18:00)
//   N2 = Night 12h  (18:00–06:00)
const attendanceSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'employeeType' },
    employeeType: {
      type: String,
      required: true,
      enum: ['Employees', 'userMaster'],
      default: 'Employees',
    },
    startLat: { type: Number },
    startLong: { type: Number },
    siteLat: { type: Number },
    siteLong: { type: Number },
    role: { type: String, trim: true },
    date: { type: Date, required: true },
    status: { type: String, enum: ['Present', 'Absent', 'Leave'], default: 'Present' },
    dutyLevel: { type: Number, default: 1 },
    rate: { type: Number, default: 0 },
    site_name: { type: String, trim: true },
    remarks: { type: String, trim: true },
    siteId: { type: String },
    leadId: { type: mongoose.Schema.Types.ObjectId },
    clientId: { type: mongoose.Schema.Types.ObjectId },
    locationId: { type: mongoose.Schema.Types.ObjectId },
    // ── Shift Control ──
    // MANG = 8hr group: M(Morning), A(Afternoon), N(Night), G(General)
    // DaNi = 12hr group: D(Day), N2(Night)
    shiftGroupName: { type: String, enum: ['MANG', 'DaNi', null], default: null },
    shiftCode: { type: String, enum: ['M', 'A', 'N', 'G', 'D', 'N2', null], default: null },
    shiftType: { type: String, enum: ['8hr', '12hr'], default: '8hr' },
    shiftPeriod: {
      type: String,
      enum: ['Morning', 'Afternoon', 'Night', 'General', 'Day', 'Night12'],
      default: 'Morning',
    },
    shiftHours: { type: Number, default: 8 },
    shiftLockHours: { type: Number, default: 8 }, // 8 or 12 depending on shift
    defaultShiftStart: { type: String, trim: true }, // e.g. "06:00"
    // ── Rates & Earnings ──
    monthlyRate: { type: Number, default: 0 },
    dailyRate: { type: Number, default: 0 },
    dailyEarn: { type: Number, default: 0 },
    dutyCount: { type: Number, default: 1 },
    // ── Double / Consecutive Shift ──
    isDoubleShift: { type: Boolean, default: false }, // true if worker continued into next shift
    previousShiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'Attendance', default: null }, // links to prior shift record
    doubleShiftNotified: { type: Boolean, default: false }, // notification sent to supervisors?

    // ── Device & Marked By ──
    markedByDevice: { type: Boolean, default: true }, // true if user marked themselves
    markedByUserName: { type: String, trim: true }, // name of supervisor if markedByDevice is false

    // ── Duty Toggle Fields ──
    dutyStartScheduled: { type: Date },
    dutyStart: { type: Date },
    dutyEnd: { type: Date },
    dutyEndScheduled: { type: Date },
    hoursWorked: { type: Number, default: 0 },
    forcedOff: { type: Boolean, default: false },
    forcedOffReason: { type: String, trim: true },
    // ── Emergency Control ──
    emergencyOff: { type: Boolean, default: false }, // true = ended via emergency override
    emergencyReason: { type: String, trim: true }, // Reason for emergency end
    emergencyByUser: { type: String, trim: true }, // Who triggered the emergency off
    // ── Geo & Tracking ──
    geoHistory: [
      {
        lat: { type: Number },
        long: { type: Number },
        address: { type: String },
        accuracy: { type: Number },
        speed: { type: Number },
        type: { type: String, enum: ['start', 'end', 'tick', 'siteVisit'] },
        timestamp: { type: Date, default: Date.now }, // Renamed from 'time' for clarity
      },
    ],
    isPosted: { type: Boolean, default: false },
    voucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vouchers' },
  },
  { timestamps: true }
);

// 7. Accounting
const groupSchema = new mongoose.Schema(
  {
    groupName: { type: String, required: true, trim: true },
    parentGroup: { type: mongoose.Schema.Types.ObjectId, ref: 'Groups', default: null },
    nature: {
      type: String,
      required: true,
      enum: ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'],
    },
  },
  { timestamps: true }
);

const ledgerSchema = new mongoose.Schema(
  {
    ledgerName: { type: String, required: true, trim: true },
    ledgerGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Groups', required: true },

    // Balances
    openingBalance: { type: Number, required: true, default: 0.0 },
    openingBalanceType: { type: String, required: true, enum: ['Dr', 'Cr'], default: 'Dr' },
    currentBalance: { type: Number, required: true, default: 0.0 },

    // App Integrations
    refId: { type: mongoose.Schema.Types.ObjectId },
    refType: { type: String },
    leadIds: [{ type: mongoose.Schema.Types.ObjectId }],
    purchaseOrders: [{ type: mongoose.Schema.Types.ObjectId }],

    // Compliance & Contact Info
    contactDetails: {
      address: { type: String, trim: true },
      state: { type: String, trim: true },
      pin: { type: String, trim: true },
      pan: { type: String, uppercase: true, trim: true },
      gstn: { type: String, uppercase: true, trim: true },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

ledgerSchema.index({ ledgerName: 1 });
ledgerSchema.index({ ledgerGroupId: 1 });
ledgerSchema.index({ refId: 1 });
ledgerSchema.index({ refType: 1 });

const voucherEntrySchema = new mongoose.Schema(
  {
    ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ledgers', required: true },
    ledgerName: { type: String },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Leads' },
  },
  { _id: false }
);

const voucherSchema = new mongoose.Schema(
  {
    locationId: { type: mongoose.Schema.Types.ObjectId }, // Link to ProfileMaster.locations._id
    voucherType: {
      type: String,
      enum: ['Payment', 'Receipt', 'Journal', 'Contra', 'Sales', 'Purchase'],
      required: true,
    },
    voucherNo: { type: String, required: true, unique: true, trim: true },
    date: { type: Date, required: true, default: Date.now },
    narration: { type: String, required: true, trim: true },

    entries: {
      type: [voucherEntrySchema],
      required: true,
      validate: [
        (val) => val.length >= 2,
        'A transaction must have at least 2 entries (one Dr and one Cr)',
      ],
    },

    // Legacy support & Approval metadata
    legacyMetadata: { type: mongoose.Schema.Types.Mixed }, // Stores flat transaction data for legacy FinanceDashboard
    leadId: { type: mongoose.Schema.Types.ObjectId },
    approvalPending: { type: Boolean, default: false },
    contraMetadata: {
      payerUserId: { type: String },
      receiverUserId: { type: String },
      payerApproved: { type: Boolean, default: false },
      receiverApproved: { type: Boolean, default: false },
      payerDeclarationDate: { type: Date },
      receiverDeclarationDate: { type: Date },
    },

    metadata: {
      createdBy: { type: String },
      systemTimestamp: { type: Date, default: Date.now },
    },
  },
  { timestamps: true }
);

// Pre-save validation: Ensure balancing matching principles (Total Dr = Total Cr)
voucherSchema.pre('save', function (next) {
  let totalDebit = 0;
  let totalCredit = 0;

  this.entries.forEach((entry) => {
    totalDebit += entry.debit || 0;
    totalCredit += entry.credit || 0;
  });

  if (Math.abs(totalDebit - totalCredit) > 0.001) {
    return next(
      new Error(
        `Accounting Integrity Error: Total Debits (${totalDebit}) must equal Total Credits (${totalCredit}).`
      )
    );
  }
  next();
});

voucherSchema.index({ date: -1 });
voucherSchema.index({ 'entries.ledgerId': 1 });

// 8. Commercial Documents
const {
  sellerSnapshotSchema,
  buyerSnapshotSchema,
  lineItemSchema,
  totalsSchema,
  conversionMetadataSchema,
} = require('./masterShared');

const documentCommon = {
  locationId: { type: mongoose.Schema.Types.ObjectId },
  docNo: { type: String, unique: true },
  date: { type: Date, default: Date.now },
  seller: sellerSnapshotSchema,
  buyer: buyerSnapshotSchema,
  items: [lineItemSchema],
  totals: totalsSchema,
  terms: { type: String },
  notes: { type: String },
  status: { type: String, default: 'Draft' },
  conversion: conversionMetadataSchema,
};

const quotationSchema = new mongoose.Schema(documentCommon, { timestamps: true });
const purchaseOrderSchema = new mongoose.Schema(documentCommon, { timestamps: true });
const taxInvoiceSchema = new mongoose.Schema(
  {
    ...documentCommon,
    voucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vouchers' }, // Link to accounting voucher
  },
  { timestamps: true }
);

// 9. Messages (Chat)
const messageSchema = new mongoose.Schema(
  {
    senderName: { type: String, required: true },
    senderId: { type: String }, // ID of sender
    text: { type: String },
    type: { type: String, enum: ['text', 'advance', 'leave', 'uniform', 'media'], default: 'text' },
    status: { type: String, enum: ['unseen', 'seen'], default: 'unseen' },
    mediaUrl: { type: String }, // URL (Cloudinary or Local)
    mediaType: { type: String }, // 'image', 'audio', 'video'
    localPath: { type: String }, // Path on server after download
    mediaPath: { type: String }, // Path on device or server
    isCloudDeleted: { type: Boolean, default: false }, // Flag for cloud removal
    isOneToOne: { type: Boolean, default: false },
    receiverId: { type: String }, // If one-to-one
  },
  { timestamps: true }
);

// Counter Schema
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g. 'lead', 'quotation_locId', 'sales_locId'
  seq: { type: Number, default: 0 },
});

// 10. Site Client Check (Progress Reports)
const siteClientCheckSchema = new mongoose.Schema(
  {
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employees', required: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Leads', required: true },
    images: [{ type: String }], // Cloudinary full image paths
    progressDescription: { type: String, trim: true },
  },
  { timestamps: true }
);

/**
 * Factory function to bind models to a tenant connection
 */
const getTenantModels = (connection) => {
  return {
    ProfileMaster:
      connection.models.ProfileMaster || connection.model('ProfileMaster', profileMasterSchema),
    Categories: connection.models.Categories || connection.model('Categories', categorySchema),
    Products: connection.models.Products || connection.model('Products', productSchema),
    Parties: connection.models.Parties || connection.model('Parties', partySchema),
    Employees: connection.models.Employees || connection.model('Employees', employeeSchema),
    Leads: connection.models.Leads || connection.model('Leads', leadSchema),
    Attendance: connection.models.Attendance || connection.model('Attendance', attendanceSchema),
    Groups: connection.models.Groups || connection.model('Groups', groupSchema),
    Ledgers: connection.models.Ledgers || connection.model('Ledgers', ledgerSchema),
    Vouchers: connection.models.Vouchers || connection.model('Vouchers', voucherSchema),
    Quotations: connection.models.Quotations || connection.model('Quotations', quotationSchema),
    PurchaseOrders:
      connection.models.PurchaseOrders || connection.model('PurchaseOrders', purchaseOrderSchema),
    TaxInvoices: connection.models.TaxInvoices || connection.model('TaxInvoices', taxInvoiceSchema),
    Counters: connection.models.Counters || connection.model('Counters', counterSchema),
    Messages: connection.models.Messages || connection.model('Messages', messageSchema),
    StaffMonitoring:
      connection.models.StaffMonitoring ||
      connection.model('StaffMonitoring', staffMonitoringSchema),
    SiteClientCheck:
      connection.models.SiteClientCheck ||
      connection.model('SiteClientCheck', siteClientCheckSchema),
  };
};

module.exports = { getTenantModels };
