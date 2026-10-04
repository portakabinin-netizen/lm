import { Ionicons } from "@expo/vector-icons";

/**
 * ============================================
 * 🧱 SESSION INTERFACES
 * ============================================
 */

// 🔐 Saved session in AsyncStorage
export interface UserSession {
  token: string;
  userId: string;
  userDisplayName: string;
  userRole: "CorpAdmin" | "Sales" | string;
  corpAdminId: string | null;
  corporateId: string | null;
  corporateName: string | null;
  corporatePAN: string | null;
  corporateGST: string | "Unregistered";
  accessAllow: boolean;
}


/**
 * ============================================
 * 🧱 JWT TOKEN STRUCTURE (Decoded Payload)
 * ============================================
 */
export interface DecodedToken {
  userId: string;
  userRole: string;
  userDisplayName: string;
  exp: number;
  iat: number;
}


/**
 * ============================================
 * 🧱 CURRENT USER (Mapped from Decoded Token)
 * ============================================
 */
export interface CurrentUser {
  token: string;
  userId: string;
  name: string;
  userRole: string; 
  userEmail?: string;
  userMobile?: string;
  corpId?: string;
  corporateId?: string;
  corporateName: string;
  corpAdminId?: string;
  corpProfileImage?: string;
  userProfileImage?: string;
  corporatePAN?:string;
  corporateGST?:string;
}


/**
 * ============================================
 * 🧱 MENU ITEMS -RoleBaseMneu
 * ============================================
 */
export interface DrawerMenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  route: string;
}
export interface DrawerSection {
  title: string;
  items: DrawerMenuItem[];
}


/**
 * ============================================
 * 🧱 ACTIVITY STRUCTURE
 * ============================================
 */
export interface Activity {
  date: string; // ISO string from MongoDB
  byUser: string;
  action: string;
}

/**
 * ============================================
 * 💰 TRANSACTION / FINANCE STRUCTURE
 * ============================================
 */
export interface FinanceEntry {
  voucherDate: string; // ISO string
  paymentType: "Dr" | "Cr";
  voucherAmount: {
    value: number; // Decimal128 converted to number in frontend
    currency: "INR" | "USD" | "EUR";
  };
  voucherNarration?: string;
  paymentFromTo: "Admin" | "Client" | "Materials" | "Labour";
}

/**
 * ============================================
 * 🧱 LEADS STRUCTURE (Aligned with LeadsLedger Schema)
 * ============================================
 */
export interface Leads {
  _id?: string;
  lead_no?: number;
  product_name?: string;
  sender_name?: string;
  sender_city?: string;
  sender_state?: string;
  sender_mobile?: string;
  sender_email?: string;
  source?: string;
  source_id?: string;
  adminLink?: string;
  corpLink?: string;
  status?: "Unread" | "Contacted" | "Closed" | "Lost";
  generated_date?: string;
  activity?: Activity[];
  finance?: FinanceEntry[];
  createdAt?: string;
  updatedAt?: string;
}

/* Dynamic HomeScreen interface used in index-ca.tsx */
export interface DrawerItemProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string;
  onPress?: () => void;
}


export interface StatCardProps {
  label: string;
  value: string;
  color: string;
}



// Performa Invoice, Purchase order , Tax Invoice 
export interface ProductItem {
  productName: string;
  description: string;
  price: number;
  UoM: string;
}

export interface CategoryCost {
  categoryId:string;
  categoryName: string;
  products: ProductItem[];
}

export interface Vendor {
  vendorName: string;
  contactPerson: string;
  mobileNo: string;
  productCost: CategoryCost[];
}

export interface FormData {
  userDisplayName: string;
  userEmail: string;
  userMobile: string;
  userPassword: string;
  userRole: "" | "CorpAdmin" | "Sales" | "Project";
  userAadhar: string;
  userDoB: string; // YYYY-MM-DD
  corporateName: string;
  corporateEmail: string;
  corporateAddress: string;
  corporateCity: string;
  corporateDistrict: string;
  corporateState: string;
  corporatePin: string;
  corporatePAN: string;
  corporateGST: string;
  corporateId: string;
}
export interface LeadTileProps {
  item: Leads;
  token: string;
  onStatusChange?: () => void;
  currentUser?: string;
  isFirst?: boolean;
}
export interface LeadByStatusScreenProps {
  token: string;
  status: string;
  cropId: string;
}