// ═══════════════════════════════════════════════════════════════════════════════
// appModal.interface.ts
// Single source of truth for all AppModal types, constants & field configs.
// AppModal.tsx imports ONLY from here; @/hooks/interface is NOT touched directly.
// ═══════════════════════════════════════════════════════════════════════════════

import { appService } from "@/UtilServices/appHelper";
import React from "react";
import { z } from "zod";

const { regex } = appService;

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — ZOD SCHEMAS (copied from @/hooks/interface so AppModal is self-contained)
// ═══════════════════════════════════════════════════════════════════════════════

export const CorporateSchema = z.object({
  corporateName: z.string().min(2, { message: "Company Name required" }).regex(regex.name),
  corporateEmail: z.string().regex(regex.email).toLowerCase(),
  corporateAddress: z.string().min(5),
  corporateCity: z.string().regex(regex.name),
  corporateDistrict: z.string().regex(regex.name),
  corporateState: z.string().regex(regex.name),
  corporatePin: z.string().regex(regex.pin),
  corporatePAN: z.string().regex(regex.pan).toUpperCase(),
  corporateGST: z.string().regex(regex.gst).optional().or(z.literal("")),
});

export const ManualLeadSchema = z.object({
  product_name: z.string().default(""),
  sender_name: z.string().min(1, "Name is required"),
  sender_city: z.string().default(""),
  sender_state: z.string().default(""),
  sender_mobile: z.string().min(1, "Mobile is required").regex(regex.mobile, "Invalid 10-digit mobile number"),
  sender_email: z.string().regex(regex.email, "Invalid email format").or(z.literal("")),
  source: z.string().default("Other"),
  source_id: z.string().optional(),
  status: z.enum(["Recent", "Engaged", "Accepted", "Tax Invoice", "Recycle"]).default("Engaged"),
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — INFERRED ZOD TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type CorporateData = z.infer<typeof CorporateSchema>;
export type ManualLeadData = z.infer<typeof ManualLeadSchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — BASE MODAL TYPES  (previously in @/hooks/interface)
// ═══════════════════════════════════════════════════════════════════════════════

/** Which modal is being referenced */
export type ModalType = "lead" | "activity" | "user";

/** Sub-type for UserModal */
export type UserModalType = "corporate" | "search" | "camera";

/** State shape for LeadModal */
export interface LeadModalState {
  visible: boolean;
  loading: boolean;
  data: ManualLeadData;
  onComplete?: () => void;
}

/** State shape for ActivityModal */
export interface ActivityModalState {
  visible: boolean;
  loading: boolean;
  note: string;
  phoneNumber: string;
  name: string;
  itemId: string;
  token: string;
  onComplete?: () => void;
}

/** State shape for UserModal */
export interface UserModalState {
  visible: boolean;
  type: UserModalType;
  loading: boolean;
  corp: Partial<CorporateData>;
  search: string;
  results: any[];
  // ── Profile Image logic ──
  previewUri?: string | null;
  uploading?: boolean;
  history?: any[];
  activeTab?: "options" | "history" | "preview";
  profileType?: "user" | "corp";
}

/** Callback type for ModalModule subscribers */
export type ModalChangeCallback = (
  type: ModalType,
  state: LeadModalState | ActivityModalState | UserModalState,
) => void;

/** Options for opening the Lead modal */
export interface OpenLeadOptions {
  mobile?: string;
  name?: string;
  onComplete?: () => void;
}

/** Options for opening the Activity modal */
export interface OpenActivityOptions {
  phoneNumber?: string;
  name?: string;
  itemId?: string;
  token?: string;
  note?: string;
  onComplete?: () => void;
}

/** Options for opening the User modal */
export interface OpenUserOptions {
  type?: UserModalType;
  previewUri?: string | null;
  onSelect?: (mode: "camera" | "gallery") => void;
  onUpload?: () => void;
  onClear?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — STATUS MODAL
// ═══════════════════════════════════════════════════════════════════════════════

export interface StatusModalState {
  visible: boolean;
  itemId: string;
  currentStatus: string;
  transitions: string[];
  token: string;
  onDone: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — VENDOR MODAL
// ═══════════════════════════════════════════════════════════════════════════════

export interface VendorForm {
  vendorName: string;
  contactPerson: string;
  mobileNo: string;
  vendorGST: string;
  vendorPAN: string;
  vendorAddress: string;
  vendorCity: string;
  vendorDistrict: string;
  vendorState: string;
}

export interface VendorModalState {
  visible: boolean;
  loading: boolean;
  form: VendorForm;
  editId: string | null; // null = add new, non-null = edit
  onDone: () => void;
}

export interface OpenVendorOptions {
  editVendor?: VendorForm & { _id: string };
  onDone?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — EXTENDED UNION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type ExtendedModalType = ModalType | "status" | "vendor";

export type ExtendedModalChangeCallback = (
  type: ExtendedModalType,
  state: LeadModalState | ActivityModalState | UserModalState | StatusModalState | VendorModalState,
) => void;

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — UI COMPONENT PROP INTERFACES  (previously in @/hooks/interface)
// ═══════════════════════════════════════════════════════════════════════════════

export interface FloatingInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  isDark: boolean;
  accent?: string;
  keyboardType?: "default" | "number-pad" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
  maxLength?: number;
}

export interface ShellProps {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  title: string;
  subtitle?: string;
  saveIcon?: string;
  saveColor?: string;
  loading?: boolean;
  isDark: boolean;
  centered?: boolean;
  children: React.ReactNode;
}

export interface AppModalProps {
  onCorpSelect?: (item: any) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — INITIAL STATES
// ═══════════════════════════════════════════════════════════════════════════════

export const INITIAL_LEAD: ManualLeadData = {
  product_name: "",
  sender_name: "",
  sender_city: "",
  sender_state: "",
  sender_mobile: "",
  sender_email: "",
  source: "Other",
  status: "Engaged",
};

export const INITIAL_ACTIVITY: ActivityModalState = {
  visible: false,
  loading: false,
  note: "",
  phoneNumber: "",
  name: "",
  itemId: "",
  token: "",
};

export const INITIAL_USER: UserModalState = {
  visible: false,
  type: "corporate",
  loading: false,
  corp: {},
  search: "",
  results: [],
  previewUri: null,
  uploading: false,
  history: [],
  activeTab: "options",
  profileType: "user",
};

export const INITIAL_STATUS: StatusModalState = {
  visible: false,
  itemId: "",
  currentStatus: "",
  transitions: [],
  token: "",
  onDone: () => { },
};

export const INITIAL_VENDOR_FORM: VendorForm = {
  vendorName: "",
  contactPerson: "",
  mobileNo: "",
  vendorGST: "",
  vendorPAN: "",
  vendorAddress: "",
  vendorCity: "",
  vendorDistrict: "",
  vendorState: "",
};

export const INITIAL_VENDOR: VendorModalState = {
  visible: false,
  loading: false,
  form: { ...INITIAL_VENDOR_FORM },
  editId: null,
  onDone: () => { },
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — STATUS MAPS
// ═══════════════════════════════════════════════════════════════════════════════

export const STATUS_TRANSITIONS: Record<string, string[]> = {
  Recent: ["Engaged", "Recycle"],
  Engaged: ["Accepted", "Recycle"],
  Accepted: ["Tax Invoice"],
  "Tax Invoice": ["Fully Paid"],
  Recycle: ["Engaged"],
};

export const STATUS_COLOR: Record<string, string> = {
  Recent: "#3b82f6",
  Engaged: "#023d51ff",
  Accepted: "#22c55e",
  "Tax Invoice": "#4310acff",
  Recycle: "#ef4444",
  "Fully Paid": "#04494cff",
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — FIELD CONFIGS
// ═══════════════════════════════════════════════════════════════════════════════

export const LEAD_FIELDS: Array<{
  key: keyof ManualLeadData;
  label: string;
  kb: "default" | "number-pad" | "email-address";
  cap?: "none" | "sentences" | "words" | "characters";
}> = [
    { key: "sender_mobile", label: "Mobile *", kb: "number-pad", cap: "none" },
    { key: "sender_name", label: "Name *", kb: "default", cap: "words" },
    { key: "product_name", label: "Product", kb: "default" },
    { key: "sender_city", label: "City", kb: "default", cap: "words" },
    { key: "sender_state", label: "State", kb: "default", cap: "words" },
    { key: "sender_email", label: "Email", kb: "email-address", cap: "none" },
  ];

export const CORP_FIELDS: Array<{
  key: keyof CorporateData;
  label: string;
  kb?: "default" | "number-pad" | "email-address";
  cap?: "none" | "sentences" | "words" | "characters";
  max?: number;
  multi?: boolean;
}> = [
    { key: "corporateName", label: "Company Name *", cap: "words" },
    { key: "corporateEmail", label: "Email *", kb: "email-address", cap: "none" },
    { key: "corporatePAN", label: "PAN *", cap: "characters", max: 10 },
    { key: "corporateAddress", label: "Address *", multi: true },
    { key: "corporateCity", label: "City *", cap: "words" },
    { key: "corporateDistrict", label: "District *", cap: "words" },
    { key: "corporateState", label: "State *", cap: "words" },
    { key: "corporatePin", label: "PIN Code *", kb: "number-pad", max: 6 },
    { key: "corporateGST", label: "GST (Optional)", max: 15 },
  ];

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11 — UTILITY
// ═══════════════════════════════════════════════════════════════════════════════

/** Strip all non-digit characters from a string */
export const cleanNum = (n: string): string => n.replace(/[^\d]/g, "");