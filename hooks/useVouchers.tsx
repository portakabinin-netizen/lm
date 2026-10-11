import { useCallback, useState } from "react";
import { appService } from "@/UtilServices/appHelper";
import { TxnType, Direction, PaymentMode } from "./usePayments";

// ─── Types ────────────────────────────────────────────────────────────────────
export type EntryType = "Dr" | "Cr";

export interface VoucherEntry {
  id: string; // client-side unique id
  accountId: string;
  accountType: "Lead" | "Staff" | "Category";
  accountName: string;
  type: EntryType;
  amount: number;
  partyName?: string;
  isBank?: boolean;
  leadId?: string;
  leadName?: string;
}

export interface Voucher {
  date: Date;
  narration: string;
  entries: VoucherEntry[];
  totalDr: number;
  totalCr: number;
  leadId?: string;
  leadName?: string;
}

// ─── Fixed Account Categories ─────────────────────────────────────────────────
export const FIXED_LEDGERS = [
  { id: "cash_in_hand", name: "Cash-in-Hand", type: "Category", isBank: false },
  { id: "main_bank", name: "Main Bank Account", type: "Category", isBank: true },
  { id: "office_rent", name: "Office Rent", type: "Category", isBank: false },
  { id: "electricity_bill", name: "Electricity Bill", type: "Category", isBank: false },
  { id: "stationary_expense", name: "Stationary & Printing", type: "Category", isBank: false },
  { id: "interest_income", name: "Interest Income", type: "Category", isBank: false },
  { id: "uniform_equipment", name: "Uniform & Equipment", type: "Category", isBank: false },
];

// ─── Hook ─────────────────────────────────────────────────────────────────────
export const useVouchers = (token: string, dbName?: string) => {
  const [voucher, setVoucher] = useState<Voucher>({
    date: new Date(),
    narration: "",
    entries: [
      { id: "1", accountId: "", accountType: "Category", accountName: "", type: "Dr", amount: 0 },
      { id: "2", accountId: "", accountType: "Category", accountName: "", type: "Cr", amount: 0 },
    ],
    totalDr: 0,
    totalCr: 0,
    leadId: undefined,
    leadName: undefined,
  });

  const [loading, setLoading] = useState(false);

  // ── Entry Management ───────────────────────────────────────────────────────
  const addEntry = useCallback(() => {
    setVoucher((prev) => ({
      ...prev,
      entries: [
        ...prev.entries,
        {
          id: Math.random().toString(36).substr(2, 9),
          accountId: "",
          accountType: "Category",
          accountName: "",
          type: prev.entries[prev.entries.length - 1]?.type === "Dr" ? "Cr" : "Dr",
          amount: 0,
        },
      ],
    }));
  }, []);

  const removeEntry = useCallback((id: string) => {
    setVoucher((prev) => {
      if (prev.entries.length <= 2) return prev; // min 2 entries
      const next = prev.entries.filter((e) => e.id !== id);
      return { ...prev, entries: next };
    });
  }, []);

  const updateEntry = useCallback((id: string, updates: Partial<VoucherEntry>) => {
    setVoucher((prev) => {
      const next = prev.entries.map((e) => (e.id === id ? { ...e, ...updates } : e));
      const dr = next.filter((e) => e.type === "Dr").reduce((acc, current) => acc + current.amount, 0);
      const cr = next.filter((e) => e.type === "Cr").reduce((acc, current) => acc + current.amount, 0);
      return { ...prev, entries: next, totalDr: dr, totalCr: cr };
    });
  }, []);

  const updateVoucher = useCallback((updates: Partial<Voucher>) => {
    setVoucher((prev) => ({ ...prev, ...updates }));
  }, []);

  // ── Saving ──────────────────────────────────────────────────────────────────
  const saveVoucher = async (
    voucherType: "Payment" | "Receipt" | "Contra" | "Journal" | "Sales" | "Purchase" = "Journal",
    locationId?: string | null,
    mode?: string,
    overrideVoucher?: Voucher
  ) => {
    const v = overrideVoucher || voucher;
    if (v.totalDr !== v.totalCr) {
      throw new Error(`Unbalanced Voucher: Dr (${v.totalDr}) != Cr (${v.totalCr})`);
    }
    if (v.totalDr === 0) {
      throw new Error("Voucher amount cannot be zero.");
    }
    if (!v.entries.every((e) => e.accountId && e.amount > 0)) {
      throw new Error("Please complete all entry rows (Account & Amount).");
    }

    setLoading(true);
    try {
      const authH: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (dbName) {
        authH['x-tenant-id'] = dbName;
      }
      const voucherId = `V-${Date.now().toString(36).toUpperCase()}`;

      try {
        // ── Strategy A: Try atomic double-entry voucher endpoint ───────────
        const payload = {
          voucherType,
          locationId: locationId || null,
          date: v.date,
          narration: v.narration,
          leadId: v.leadId || null,
          entries: v.entries.map((entry) => ({
            ledgerId: entry.accountId,
            ledgerName: entry.accountName,
            debit: entry.type === "Dr" ? entry.amount : 0,
            credit: entry.type === "Cr" ? entry.amount : 0,
            accountType: entry.accountType,
            leadId: entry.leadId || null,
          })),
          legacyMetadata: mode ? { mode } : undefined,
        };

        const res = await appService.httpClient.post("finance/vouchers", payload, { headers: authH });
        if (res.data?.success) return res.data.data;
      } catch (innerErr: any) {
        // If it's a 404 (Not Found), we let it fallback to individual payments
        if (innerErr?.response?.status !== 404) throw innerErr;
      }

      // ── Strategy B: Fallback to individual linked transactions ───────────
      // We map DR to 'RECEIPT' (Inflow) and CR to 'PAYMENT' (Outflow) 
      // from the perspective of a single combined cash/asset pool.
      const promises = v.entries.map((entry) => {
        const payload: any = {
          amount: entry.amount,
          direction: entry.type === "Dr" ? "RECEIPT" : "PAYMENT",
          txn_type: entry.type === "Dr" ? "misc_income" : "misc_expense",
          txn_date: v.date,
          payment_mode: entry.isBank ? "NEFT" : "Cash",
          party_name: entry.accountName,
          description: `[Voucher #${voucherId}] ${v.narration}`,
          status: "Cleared",
        };

        if (entry.accountType === "Lead") payload.ref_lead_id = entry.accountId;
        else if (v.leadId) payload.ref_lead_id = v.leadId;
        if (entry.accountType === "Staff") payload.staff_ref_id = entry.accountId;

        return appService.httpClient.post("payment/create", payload, { headers: authH });
      });

      const results = await Promise.all(promises);
      if (results.every(r => r.data?.success)) return { status: "fallback_success", voucherId };
      
      throw new Error("One or more entries failed to save.");
    } catch (e: any) {
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const resetVoucher = useCallback((
    initialType?: "Payment" | "Receipt" | "Contra" | "Journal" | "Sales" | "Purchase",
    initialNarration?: string,
    initialDate?: Date
  ) => {
    let entries: VoucherEntry[] = [
        { id: "1", accountId: "", accountType: "Category", accountName: "", type: "Dr", amount: 0 },
        { id: "2", accountId: "", accountType: "Category", accountName: "", type: "Cr", amount: 0 },
    ];

    if (initialType === 'Receipt') {
        // Receipt: Debit Bank/Cash, Credit Income/Customer
        entries[0] = { id: "1", accountId: "cash_in_hand", accountType: "Category", accountName: "Cash-in-Hand", type: "Dr", amount: 0 };
    } else if (initialType === 'Payment') {
        // Payment: Debit Expense/Staff, Credit Bank/Cash
        entries[1] = { id: "2", accountId: "cash_in_hand", accountType: "Category", accountName: "Cash-in-Hand", type: "Cr", amount: 0 };
    } else if (initialType === 'Contra') {
        // Contra: Debit Bank/Receiver, Credit Cash-in-Hand (Own Petty Cash)
        entries[0] = { id: "1", accountId: "main_bank", accountType: "Category", accountName: "Main Bank Account", type: "Dr", amount: 0 };
        entries[1] = { id: "2", accountId: "cash_in_hand", accountType: "Category", accountName: "Cash-in-Hand", type: "Cr", amount: 0 };
    } else if (initialType === 'Journal' || initialType === 'Sales' || initialType === 'Purchase') {
        // Journal/Sales/Purchase: Manual adjustment / non-cash entries / blank entries
        entries[0] = { id: "1", accountId: "", accountType: "Category", accountName: "", type: "Dr", amount: 0 };
        entries[1] = { id: "2", accountId: "", accountType: "Category", accountName: "", type: "Cr", amount: 0 };
    }

    setVoucher({
      date: initialDate || new Date(),
      narration: initialNarration || "",
      entries,
      totalDr: 0,
      totalCr: 0,
      leadId: undefined,
      leadName: undefined,
    });
  }, []);

  return {
    voucher,
    loading,
    saveLoading: loading,
    addEntry,
    removeEntry,
    updateEntry,
    updateVoucher,
    saveVoucher,
    resetVoucher,
  };
};
