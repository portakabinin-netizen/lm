import { appService } from "@/UtilServices/appHelper";
import { Ionicons } from "@expo/vector-icons";
import { z } from "zod";
const { regex } = appService;

export type Leads = any;

/**
 * ============================================
 * 🔐 AUTH CONTEXT TYPE
 * ============================================
 */
export interface AuthContextType {
  user:              UserSession | null;
  loading:           boolean;
  visitingCardUri:   string | null;
  login:             (userData: UserSession) => Promise<void>;
  logout:            (showToast?: boolean) => Promise<void>;
  switchCorporate:   (corporateId: string) => Promise<void>;
  updateUserProfile: (updates: Partial<{ userProfileImage: string; CorpProfileImage: string }>) => Promise<void>;
  setVisitingCardUri:(uri: string) => void;
}

/**
 * 🧱 Corporate Data (Modal Schema)
 */
export const CorporateSchema = z.object({
  corporateName:     z.string().min(2, { message: "Company Name required" }).regex(regex.name),
  corporateEmail:    z.string().regex(regex.email).toLowerCase(),
  corporateAddress:  z.string().min(5),
  corporateCity:     z.string().regex(regex.name),
  corporateDistrict: z.string().regex(regex.name),
  corporateState:    z.string().regex(regex.name),
  corporatePin:      z.string().regex(regex.pin),
  corporatePAN:      z.string().regex(regex.pan).toUpperCase(),
  corporateGST:      z.string().regex(regex.gst).optional().or(z.literal("")),
});

/**
 * 🧱 User Registration Schema
 */
export const RegisterSchema = z.object({
  userDisplayName:   z.string().min(3).regex(regex.name),
  userMobile:        z.string().regex(regex.mobile),
  userEmail:         z.string().regex(regex.email).or(z.literal("")),
  userPassword:      z.string().min(8).regex(regex.password).regex(/[0-9]/),
  confirmPassword:   z.string(),
  userRole:          z.enum(["CorpAdmin", "Sales", "Project"]),
  userAadhar:        z.string().regex(regex.aadhar),
  userDoB:           z.union([z.date(), z.string()]),

  corpAdminId:       z.string().optional().nullable(),
  corporateId:       z.string().optional().nullable(),

  corporateName:     z.string().optional(),
  corporateEmail:    z.string().optional(),
  corporateAddress:  z.string().optional(),
  corporateCity:     z.string().optional(),
  corporateDistrict: z.string().optional(),
  corporateState:    z.string().optional(),
  corporatePin:      z.string().optional(),
  corporatePAN:      z.string().optional(),
  corporateGST:      z.string().optional(),
  dbName:            z.string().optional().nullable(),
})
.refine((data) => data.userPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path:    ["confirmPassword"],
})
.transform((data) => {
  const { confirmPassword, corpAdminId, corporateId, dbName, ...rest } = data;
  
  const payload: any = { ...rest };
  if (payload.userAadhar === "") delete payload.userAadhar;

  if (data.userRole === "CorpAdmin") {
    return { ...payload, accessCorporate: undefined };
  }

  return {
    ...payload,
    accessCorporate: [{
      corporateName: data.corporateName || null,
      corporatePAN: data.corporatePAN || null,
      dbName: dbName || null,
      locationId: null,
      isActive: true
    }],
  };
});

export type FormData        = z.input<typeof RegisterSchema>;
export type CorporateData   = z.infer<typeof CorporateSchema>;
export type RegisterPayload = z.output<typeof RegisterSchema>;

export interface userModalProps {
  visible: boolean;
  onClose: () => void;
  type:    "corporate" | "search" | "camera";
  onSave?: (data: any) => void;
}

export interface leadModalProps {
  visible:   boolean;
  onClose:   () => void;
  type:      "corporate" | "search" | "add" | "edit" | "view" | "addLead";
  onSave?:   (data: any) => void;
  mobile?:   string;
  leadInfo?: {
    name?:    string;
    product?: string;
    leadNo?:  string;
    status?:  string;
  } | null;
}

// 🔐 Saved session in AsyncStorage
export interface UserSession {
  token:            string;
  userId:           string;
  dbName?:          string;         // Hex PAN for multi-tenant database routing
  _id?:             string;         // alias for userId (some JWT payloads use _id)
  userDisplayName:  string;
  name?:            string;
  userEmail?:       string;
  mobile?:          string;
  userRole:         "CorpAdmin" | "userAdmin" | "Sales" | "Project" | "Finance";
  corpAdminId:      string | null;
  corporateId:      string | null;
  corporateName:    string | null;
  corporatePAN:     string | null;
  corporateGST:     string | "Unregistered";
  corporateEmail?:  string | null;
  corporateAddress?: string | null;
  corporateCity?:    string | null;
  corporateState?:   string | null;
  corporatePin?:     string | null;
  accessAllow:      boolean;
  userProfileImage?: string;
  CorpProfileImage?: string;
  locationId?:      string | null;
  corporateTagName?: string;
  referenceMobile?:  string;
  accessCorporate?: Array<{
    corporateName: string;
    corporatePAN:  string;
    dbName:        string;
    locationId:    string | null;
    isActive:      boolean;
  }>;
}

// 🧱 JWT TOKEN STRUCTURE
export interface DecodedToken {
  userId:          string;
  dbName?:         string;
  userRole:        string;
  userDisplayName: string;
  exp:             number;
  iat:             number;
}

// 🧱 CURRENT USER
export interface CurrentUser {
  token:             string;
  userId:            string;
  dbName?:           string;
  name:              string;
  userRole:          string;
  userEmail?:        string;
  userMobile?:       string;
  corpId?:           string;
  corporateId?:      string;
  corporateName:     string;
  corpAdminId?:      string;
  corpProfileImage?: string;
  userProfileImage?: string;
  corporatePAN?:     string;
  corporateGST?:     string;
}

export interface DrawerMenuItem {
  icon:   keyof typeof Ionicons.glyphMap;
  label:  string;
  route:  string;
}
export interface DrawerSection {
  title: string;
  items: DrawerMenuItem[];
}
export interface DrawerItemProps {
  label:    string;
  icon:     keyof typeof Ionicons.glyphMap;
  route?:   string;
  onPress?: () => void;
}
export interface StatCardProps {
  label: string;
  value: string;
  color: string;
}

export interface Activity {
  date:   string;
  byUser: string;
  action: string;
}

export interface FinanceEntry {
  voucherDate:       string;
  paymentType:       "Dr" | "Cr";
  voucherAmount:     { value: number; currency: "INR" | "USD" | "EUR" };
  voucherNarration?: string;
  paymentFromTo:     "Admin" | "Client" | "Materials" | "Labour";
}

export const ManualLeadSchema = z.object({
  product_name:  z.string().default(""),
  sender_name:   z.string().min(1, "Name is required"),
  sender_city:   z.string().default(""),
  sender_state:  z.string().default(""),
  sender_mobile: z.string().min(1, "Mobile is required").regex(regex.mobile, "Invalid 10-digit mobile number"),
  sender_email:  z.string().regex(regex.email, "Invalid email format").or(z.literal("")),
  source:        z.string().default("Other"),
  source_id:     z.string().optional(),
  status:        z.enum(["Recent", "Engaged", "Accepted", "Recycle"]).default("Engaged"),
  displayName:   z.string().optional(),
  products:      z.array(z.object({
    productName: z.string(),
    qty:         z.number(),
    rate:        z.number(),
    gstPercent:  z.number(),
    gstType:     z.enum(["Interstate", "Intrastate"]),
  })).default([]),
});

export type ManualLeadData = z.infer<typeof ManualLeadSchema>;

export const ApiLeadSchema = ManualLeadSchema.extend({
  _id:            z.string(),
  lead_no:        z.number(),
  adminLink:      z.string().url().optional(),
  corpLink:       z.string().url().optional(),
  generated_date: z.string().optional(),
  activity:       z.array(z.any()).default([]),
  finance:        z.array(z.any()).default([]),
  createdAt:      z.string(),
  updatedAt:      z.string(),
});

export type ApiLeadResponse = z.infer<typeof ApiLeadSchema>;

export interface ProductItem {
  productName: string;
  description: string;
  price:       number;
  UoM:         string;
}
export interface CategoryCost {
  categoryId:   string;
  categoryName: string;
  products:     ProductItem[];
}
export interface Vendor {
  _id:           string;
  vendorName:    string;
  contactPerson: string;
  mobileNo:      string;
  vendorGST?:    string;
  vendorAddress?: string;
  vendorState?:   string;
  productCost:   CategoryCost[];
}
export interface LeadTileProps {
  item:            ApiLeadResponse;
  token:           string;
  onStatusChange?: () => void;
  currentUser?:    string;
  isFirst?:        boolean;
}
export interface CallRecord {
  phoneNumber:  string;
  timestamp:    string | number;
  sender_name?: string | null;
  duration:     string | number;
  direction:    "INCOMING" | "OUTGOING" | "MISSED" | string;
  recPath?:     string | null;
  category?:    "Client" | "Personal" | "New";
  displayName?: string;
}

// ─────────────────────────────────────────────────────────────
// ✅ MODAL MODULE TYPES
// ─────────────────────────────────────────────────────────────

/** Which modal is being referenced */
export type ModalType     = "lead" | "activity" | "user";

/** Sub-type for UserModal */
export type UserModalType = "corporate" | "search";

/** State shape for LeadModal */
export interface LeadModalState {
  visible: boolean;
  loading: boolean;
  data:    ManualLeadData;
  onComplete?: () => void;
}

/** State shape for ActivityModal */
export interface ActivityModalState {
  visible:     boolean;
  loading:     boolean;
  note:        string;
  phoneNumber: string;
  name:        string;
  itemId:      string;
  token:       string;
  onComplete?: () => void;
}

/** State shape for UserModal */
export interface UserModalState {
  visible:  boolean;
  type:     UserModalType;
  loading:  boolean;
  corp:     Partial<CorporateData>;
  search:   string;
  results:  any[];
}

/** Callback type for ModalModule subscribers */
export type ModalChangeCallback = (
  type:  ModalType,
  state: LeadModalState | ActivityModalState | UserModalState
) => void;

/** Options for opening the Lead modal */
export interface OpenLeadOptions {
  mobile?: string;
  name?:   string;
  corpAdminId?: string;
  onComplete?: () => void;
}

/** Options for opening the Activity modal */
export interface OpenActivityOptions {
  phoneNumber?: string;
  name?:        string;
  itemId?: string;
  token?:       string;
  note?:        string;
  onComplete?:  () => void;
}

/** Options for opening the User modal */
export interface OpenUserOptions {
  type?: UserModalType;
}


export interface FloatingInputProps {
  label:           string;
  value:           string;
  onChange:        (v: string) => void;
  isDark:          boolean;
  accent?:         string;
  keyboardType?:   "default" | "number-pad" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?:      boolean;
  maxLength?:      number;
}

export interface ShellProps {
  visible:    boolean;
  onClose:    () => void;
  onSave:     () => void;
  title:      string;
  subtitle?:  string;
  saveIcon?:  string;
  saveColor?: string;
  loading?:   boolean;
  isDark:     boolean;
  centered?:  boolean;
  children:   React.ReactNode;
}

export interface AppModalProps {
  onCorpSelect?: (item: any) => void;
}

export interface Props {
  item:           any;
  token:          string;
  onStatusChange: () => void;
  isDark:         boolean;
  isFirst?:       boolean;
  currentUser?:   string;
}

/**
 * ============================================
 * 📊 ACCOUNTING MASTER TYPES
 * ============================================
 */

export type AccountType = "Real" | "Personal" | "Nominal";
export type PrimaryGroup = "Assets" | "Liabilities" | "Income" | "Expenses" | "Direct Income" | "Indirect Income" | "Direct Expenses" | "Indirect Expenses";
export type VoucherType = "Journal" | "Payment" | "Receipt" | "Contra" | "Sales" | "Purchase";

export interface LedgerMaster {
  _id?: string;
  ledgerName: string;
  accountType: AccountType;
  primaryGroup: PrimaryGroup;
  nature: "Dr" | "Cr";
  openingBalance: number;
  description?: string;
  isDefault?: boolean;
  isActive: boolean;
}

export interface VoucherEntry {
  ledgerId: string;
  ledgerName?: string;
  debit: number;
  credit: number;
}

export interface VoucherMaster {
  _id?: string;
  voucherType: VoucherType;
  voucherNumber?: string;
  date: string | Date;
  narration?: string;
  entries: VoucherEntry[];
  isReconciled?: boolean;
  financial_year?: string;
  createdBy?: string;
}

/**
 * 🧱 Voucher Zod Schema
 */
export const VoucherEntrySchema = z.object({
  ledgerId: z.string().min(1, "Ledger is required"),
  ledgerName: z.string().optional(),
  debit: z.number().min(0).default(0),
  credit: z.number().min(0).default(0),
});

export const VoucherSchema = z.object({
  voucherType: z.enum(["Journal", "Payment", "Receipt", "Contra", "Sales", "Purchase"]),
  date: z.union([z.date(), z.string()]),
  narration: z.string().optional(),
  entries: z.array(VoucherEntrySchema).min(2, "Voucher must have at least two entries"),
}).refine((data) => {
  const totalDr = data.entries.reduce((sum, e) => sum + e.debit, 0);
  const totalCr = data.entries.reduce((sum, e) => sum + e.credit, 0);
  return Math.abs(totalDr - totalCr) < 0.001;
}, {
  message: "Total Debit must equal Total Credit",
  path: ["entries"],
});