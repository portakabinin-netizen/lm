import { appService } from "@/UtilServices/appHelper";
import { useCallback, useEffect, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export type PaymentType =
    | "vendor_payment"
    | "labour_charge"
    | "freight_cartage"
    | "advance_employee"
    | "loan_repayment"
    | "misc_expense"
    | "capital_expense";

export type ReceiptType =
    | "client_invoice_payment"
    | "client_advance"
    | "scrap_sale"
    | "loan_received"
    | "misc_income"
    | "direct_income";

export type TxnType     = PaymentType | ReceiptType;
export type Direction   = "PAYMENT" | "RECEIPT";
export type PaymentMode = "Cash" | "Cheque" | "NEFT" | "RTGS" | "IMPS" | "UPI" | "Credit Card" | "Debit Card" | "Other";
export type TxnStatus   = "Pending" | "Cleared" | "Bounced" | "Cancelled";
export type StaffType   = "employee" | "transporter";

// ─── Transaction ──────────────────────────────────────────────────────────────
export interface Transaction {
    _id:             string;
    txn_number:      string;
    txn_type:        TxnType;
    direction:       Direction;
    amount:          number;
    txn_date:        string;
    party_name?:     string;
    party_type?:     string;
    ref_invoice_no?: string;
    ref_po_no?:      string;
    // Lead link
    ref_lead_id?:    string;
    lead_no?:        number;
    lead_name?:      string;
    project_name?:   string;
    // Staff link
    staff_ref_id?:   string;
    staff_type?:     StaffType;
    staff_name?:     string;
    staff_role?:     string;
    // Payment
    payment_mode:    PaymentMode;
    bank_name?:      string;
    cheque_no?:      string;
    utr_ref?:        string;
    status:          TxnStatus;
    description?:    string;
    taxable_amount?: number;
    gst_amount?:     number;
    tds_amount?:     number;
    createdAt:       string;
}

// ─── Staff picker types ───────────────────────────────────────────────────────
export interface EmployeePickerItem {
    _id:            string;
    name:           string;
    mobile?:        string;
    role:           string;
    pay_type:       string;
    daily_rate?:    number;
    monthly_salary?: number;
    photo?:         string;
    enrollment_no?: string;
    last_site_name?: string;
    last_attendance_date?: string;
}

export interface TransporterPickerItem {
    _id:            string;
    name:           string;
    mobile?:        string;
    vehicle_type:   string;
    vehicle_no?:    string;
    rate_per_trip?: number;
    rate_per_km?:   number;
}

export interface ContactPickerItem {
    _id:     string;
    name:    string;
    mobile:  string;
    type:    "Friend" | "Family" | "Freelancer" | "Money Lender" | "Misc Vendor" | "Other";
    email?:  string;
    address?: string;
    notes?:  string;
}

export interface StaffPickerData {
    employees:    EmployeePickerItem[];
    transporters: TransporterPickerItem[];
    contacts:     ContactPickerItem[];
}

// ─── Lead picker ──────────────────────────────────────────────────────────────
export interface LeadPickerItem {
    _id:           string;
    lead_no:       number;
    sender_name:   string;
    sender_mobile: string;
    product_name:  string;
    status:        string;
    totalPaid:     number;
    totalReceived: number;
}

export interface LeadLedger {
    lead_no:      number;
    sender_name:  string;
    product_name: string;
    status:       string;
    ledger:       any[];
    totalCost:    number;
    totalRevenue: number;
    grossMargin:  number;
}

export interface PaymentSummary {
    totalPayments:      number;
    totalReceipts:      number;
    netBalance:         number;
    leadLinkedPayments: number;
    leadLinkedReceipts: number;
    purchases:          number;
    sales:              number;
    directExpenses:     number;
    directIncome:       number;
    indirectExpenses:   number;
    indirectIncome:     number;
    grossMargin:        number;
    netProfit:          number;
    paymentBreakdown:   { label: string; value: number }[];
    receiptBreakdown:   { label: string; value: number }[];
    recentTransactions: Transaction[];
    byType:             Record<string, number>;
    pendingSalary?:     number;
    pendingBillsCollections?: number;
}

// ─── TXN_META — one entry per txn_type ───────────────────────────────────────
export type AccountingClass = 
    | "Purchase" 
    | "Sale" 
    | "Direct Expenses" 
    | "Indirect Expenses" 
    | "Direct Income" 
    | "Indirect Income" 
    | "Capital Expenses" 
    | "Assets" 
    | "Liabilities";

export interface TxnMeta {
    label:          string;
    direction:      Direction;
    accountingClass: AccountingClass;
    color:          string;
    icon:           string;
    requiresLead:   boolean;      // must pick a lead
    requiresStaff:  StaffType | null; // must pick employee/transporter
    requiresContact: boolean;     // must pick a contact (friend/family/money lender)
    leadLabel:      string;
    partyHint:      string;       // placeholder for party name field
}

export const TXN_META: Record<TxnType, TxnMeta> = {
    // ── PAYMENTS (CASH OUT) ──
    vendor_payment:         { label: "Purchase",              direction: "PAYMENT",  accountingClass: "Purchase",          color: "#E24B4A", icon: "business-outline",            requiresLead: true,  requiresStaff: null,           requiresContact: false, leadLabel: "Project / Lead",   partyHint: "Vendor / supplier name…"             },
    labour_charge:          { label: "Labour / Installation", direction: "PAYMENT",  accountingClass: "Direct Expenses",   color: "#BA7517", icon: "hammer-outline",              requiresLead: true,  requiresStaff: null,           requiresContact: false, leadLabel: "Project / Lead",   partyHint: "Contractor / sub-contractor name…"   },
    freight_cartage:        { label: "Freight & Cartage",     direction: "PAYMENT",  accountingClass: "Direct Expenses",   color: "#7F77DD", icon: "car-outline",                 requiresLead: false, requiresStaff: "transporter",  requiresContact: false, leadLabel: "Project / Lead",   partyHint: "Will auto-fill from transporter…"    },
    misc_expense:           { label: "Indirect Misc Expense", direction: "PAYMENT",  accountingClass: "Indirect Expenses", color: "#94A3B8", icon: "ellipsis-horizontal-outline", requiresLead: false, requiresStaff: null,           requiresContact: false, leadLabel: "",                  partyHint: "Party / payee name…"                 },
    capital_expense:        { label: "Capital Expense (CAPEX)",direction: "PAYMENT", accountingClass: "Capital Expenses",  color: "#D946EF", icon: "construct-outline",           requiresLead: false, requiresStaff: null,           requiresContact: false, leadLabel: "",                  partyHint: "Vendor Name / Machine…"              },
    advance_employee:       { label: "Employee Advance",      direction: "PAYMENT",  accountingClass: "Assets",            color: "#D4537E", icon: "person-outline",              requiresLead: false, requiresStaff: "employee",     requiresContact: false, leadLabel: "",                  partyHint: "Will auto-fill from employee…"       },
    loan_repayment:         { label: "Loan Repayment",        direction: "PAYMENT",  accountingClass: "Liabilities",       color: "#639922", icon: "return-up-back-outline",      requiresLead: false, requiresStaff: null,           requiresContact: true,  leadLabel: "",                  partyHint: "Will auto-fill from contact…"        },
    
    // ── RECEIPTS (CASH IN) ──
    client_invoice_payment: { label: "Sale (Invoice)",        direction: "RECEIPT",  accountingClass: "Sale",              color: "#1D9E75", icon: "receipt-outline",            requiresLead: true,  requiresStaff: null,           requiresContact: false, leadLabel: "Client / Lead",    partyHint: "Will auto-fill from lead…"           },
    direct_income:          { label: "Direct Income",         direction: "RECEIPT",  accountingClass: "Direct Income",     color: "#3B82F6", icon: "wallet-outline",              requiresLead: true,  requiresStaff: null,           requiresContact: false, leadLabel: "Client / Lead",    partyHint: "Source…"                             },
    scrap_sale:             { label: "Scrap Sale",            direction: "RECEIPT",  accountingClass: "Indirect Income",   color: "#BA7517", icon: "cube-outline",               requiresLead: false, requiresStaff: null,           requiresContact: false, leadLabel: "",                  partyHint: "Buyer name…"                         },
    misc_income:            { label: "Other Indirect Income", direction: "RECEIPT",  accountingClass: "Indirect Income",   color: "#10B981", icon: "add-circle-outline",         requiresLead: false, requiresStaff: null,           requiresContact: false, leadLabel: "",                  partyHint: "Source / payer name…"                },
    client_advance:         { label: "Client Advance",        direction: "RECEIPT",  accountingClass: "Liabilities",       color: "#378ADD", icon: "cash-outline",               requiresLead: true,  requiresStaff: null,           requiresContact: false, leadLabel: "Client / Lead",    partyHint: "Will auto-fill from lead…"           },
    loan_received:          { label: "Loan Received",         direction: "RECEIPT",  accountingClass: "Liabilities",       color: "#7F77DD", icon: "trending-up-outline",        requiresLead: false, requiresStaff: null,           requiresContact: true,  leadLabel: "",                  partyHint: "Will auto-fill from contact…"        },
};

// Lead-required set (backend enforces same rule)
export const LEAD_REQUIRED_TYPES: Set<TxnType> = new Set([
    "vendor_payment", "labour_charge",
    "client_invoice_payment", "client_advance", "direct_income"
]);

export const PAYMENT_TYPES: PaymentType[] = [
    "vendor_payment",
    "labour_charge",
    "freight_cartage",
    "misc_expense",
    "capital_expense",
    "advance_employee",
    "loan_repayment"
];

export const RECEIPT_TYPES: ReceiptType[] = [
    "client_invoice_payment",
    "direct_income",
    "scrap_sale",
    "misc_income",
    "client_advance",
    "loan_received",
];

// ─── Hook ─────────────────────────────────────────────────────────────────────
export const usePayments = (token: string, dbName?: string) => {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [summary,      setSummary]      = useState<PaymentSummary | null>(null);
    const [leads,        setLeads]        = useState<LeadPickerItem[]>([]);
    const [staff,        setStaff]        = useState<StaffPickerData>({ employees: [], transporters: [], contacts: [] });
    const [loading,      setLoading]      = useState(false);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [leadsLoading, setLeadsLoading] = useState(false);
    const [staffLoading, setStaffLoading] = useState(false);
    const [error,        setError]        = useState<string | null>(null);
    const [total,        setTotal]        = useState(0);

    const authH: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (dbName) {
        authH['x-tenant-id'] = dbName;
    }

    const fetchTransactions = useCallback(async (params?: Record<string, string>) => {
        try {
            setLoading(true); setError(null);
            const res = await appService.httpClient.get("payment/list", {
                headers: authH, params: { limit: "50", ...params },
            });
            if (res.data?.success) {
                setTransactions(res.data.data || []);
                setTotal(res.data.total || 0);
            }
        } catch (e: any) { setError(e.message || "Failed to fetch transactions"); }
        finally { setLoading(false); }
    }, [token, dbName]);

    const fetchSummary = useCallback(async () => {
        try {
            setSummaryLoading(true);
            const res = await appService.httpClient.get("payment/summary", {
                headers: authH,
            });
            if (res.data?.success) setSummary(res.data.data);
        } catch (_) {}
        finally { setSummaryLoading(false); }
    }, [token, dbName]);

    const fetchLeadsForPicker = useCallback(async () => {
        try {
            setLeadsLoading(true);
            const res = await appService.httpClient.get("payment/leads-picker", {
                headers: authH,
            });
            if (res.data?.success) setLeads(res.data.data || []);
        } catch (_) {}
        finally { setLeadsLoading(false); }
    }, [token, dbName]);

    const fetchStaffPicker = useCallback(async () => {
        try {
            setStaffLoading(true);
            const res = await appService.httpClient.get("staff/picker", {
                headers: authH,
            });
            if (res.data?.success) setStaff(res.data.data || { employees: [], transporters: [], contacts: [] });
        } catch (_) {}
        finally { setStaffLoading(false); }
    }, [token, dbName]);

    const fetchPartyLedger = useCallback(async (mobile: string) => {
        try {
            const clean = mobile.replace(/\D/g, '').slice(-10);
            const res = await appService.httpClient.get(`staff/contact/ledger/${clean}`, {
                headers: authH,
            });
            return res.data?.success ? res.data.data : null;
        } catch { return null; }
    }, [token]);

    const addContact = useCallback(async (data: Partial<ContactPickerItem>) => {
        const res = await appService.httpClient.post("staff/contact/add", {
            ...data,
        }, { headers: authH });
        if (res.data?.success || res.status === 409) {
            await fetchStaffPicker(); // refresh
            return res.data.data as ContactPickerItem;
        }
        throw new Error(res.data?.message || "Failed to add contact");
    }, [token, fetchStaffPicker]);

    const fetchLeadLedger = useCallback(async (leadId: string): Promise<LeadLedger | null> => {
        try {
            const res = await appService.httpClient.get(`payment/lead-ledger/${leadId}`, {
                headers: authH,
            });
            return res.data?.success ? res.data.data : null;
        } catch { return null; }
    }, [token]);

    const createTransaction = useCallback(async (
        payload: Partial<Transaction> & { txn_type: TxnType; amount: number }
    ) => {
        const res = await appService.httpClient.post("payment/create", {
            ...payload,
        }, { headers: authH });
        if (!res.data?.success) throw new Error(res.data?.message || "Create failed");
        await Promise.all([fetchTransactions(), fetchSummary()]);
        return res.data.data as Transaction;
    }, [token, fetchTransactions, fetchSummary]);

    const deleteTransaction = useCallback(async (id: string) => {
        const res = await appService.httpClient.delete(`payment/${id}`, {
            headers: authH,
        });
        if (!res.data?.success) throw new Error(res.data?.message || "Delete failed");
        await Promise.all([fetchTransactions(), fetchSummary()]);
    }, [token, fetchTransactions, fetchSummary]);

    useEffect(() => {
        if (!dbName) return;
        fetchTransactions();
        fetchSummary();
        fetchLeadsForPicker();
        fetchStaffPicker();
    }, [fetchTransactions, fetchSummary, fetchLeadsForPicker, fetchStaffPicker, dbName]);

    return {
        transactions, summary, leads, staff,
        loading, summaryLoading, leadsLoading, staffLoading, error, total,
        fetchTransactions, fetchSummary, fetchLeadsForPicker, fetchStaffPicker,
        fetchLeadLedger, fetchPartyLedger, addContact,
        createTransaction, deleteTransaction,
    };
};
