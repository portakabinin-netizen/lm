import { usePayments } from '@/hooks/usePayments';
import { FIXED_LEDGERS, useVouchers } from '@/hooks/useVouchers';
import { COLORS, styles } from '@/styles/stylesIndex';
import { printAccountingVoucher } from '@/UtilServices/printVoucherHelper';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState, useCallback } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { jwtDecode } from 'jwt-decode';
import { useUserContext, useAuthActions } from '@/context/AuthContext';
import { appService } from '@/UtilServices/appHelper';

interface AccountItemProps {
  item: any;
  onSelect: (item: any) => void;
}

const AccountItem = React.memo(({ item, onSelect }: AccountItemProps) => {
  const isStaff = item.type === 'Staff';
  return (
    <TouchableOpacity
      onPress={() => onSelect(item)}
      style={{
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {isStaff && item.photo ? (
        <Image
          source={{ uri: item.photo }}
          style={{ width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: '#f1f5f9' }}
        />
      ) : isStaff ? (
        <View style={{ width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="person" size={22} color="#94a3b8" />
        </View>
      ) : null}

      <View style={{ flex: 1, paddingRight: 4 }}>
        {/* ROW 1: Name (EFN) */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textDark, flex: 1 }} numberOfLines={1}>
            {item.name}{isStaff && item.enrollmentNo ? ` (${item.enrollmentNo})` : ''}
          </Text>
          {!isStaff && (
            <Ionicons
              name={item.isLedgerAccount ? 'receipt-outline' : item.type === 'Lead' ? 'business' : 'layers'}
              size={16}
              color={item.isLedgerAccount ? COLORS.primary : COLORS.textMuted}
            />
          )}
        </View>

        {/* ROW 2: Mobile No & Balance */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          {isStaff ? (
            item.mobile ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(`tel:${item.mobile}`)}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 12 }}
              >
                <Ionicons name="call" size={12} color="#0284c7" />
                <Text style={{ fontSize: 12, color: '#0284c7', marginLeft: 4, fontWeight: '700' }}>{item.mobile}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ fontSize: 12, color: COLORS.textMuted }}>Staff Member</Text>
            )
          ) : (
            <Text style={{ fontSize: 12, color: COLORS.textMuted }} numberOfLines={1}>
              {item.sub || 'General Ledger'}
            </Text>
          )}

          {item.balance != null && (
            <View style={{
              backgroundColor: item.balance > 0 ? '#dcfce7' : item.balance < 0 ? '#fee2e2' : '#f1f5f9',
              borderRadius: 6,
              paddingHorizontal: 8,
              paddingVertical: 2.5,
            }}>
              <Text style={{
                fontSize: 12.5,
                fontWeight: '800',
                color: item.balance > 0 ? '#16a34a' : item.balance < 0 ? '#dc2626' : '#64748b'
              }}>
                {item.balance > 0 ? '+' : item.balance < 0 ? '-' : ''} ₹{Math.abs(item.balance).toLocaleString('en-IN')}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

interface LeadItemProps {
  item: any;
  onSelect: (item: any) => void;
}

const LeadItem = React.memo(({ item, onSelect }: LeadItemProps) => (
  <TouchableOpacity
    onPress={() => onSelect(item)}
    style={{
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: '#f1f5f9',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}
  >
    <View style={{ flex: 1, paddingRight: 10 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark }}>
        {item.sender_name || `Client-${item.lead_no}`}
      </Text>
      <Text style={{ fontSize: 11, color: COLORS.textMuted }}>
        Lead #{item.lead_no} · {item.product_name || 'No Product'}
      </Text>
    </View>
    <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
  </TouchableOpacity>
));

interface VoucherEntryModalProps {
  visible: boolean;
  onClose: () => void;
  token: string;
  dbName?: string;
  initialType?: "Payment" | "Receipt" | "Contra" | "Journal" | "Sales" | "Purchase";
  preselectedLedgerId?: string;
  mode?: 'payment' | 'receipt' | 'bill_collection' | 'vendor_payment' | 'advance' | 'salary' | 'contra' | 'journal' | 'sales' | 'purchase' | 'expense';
  restrictToOwnPettyCash?: boolean;
}

export const VoucherEntryModal: React.FC<VoucherEntryModalProps> = ({
  visible,
  onClose,
  token,
  dbName,
  initialType,
  preselectedLedgerId,
  mode: propMode,
  restrictToOwnPettyCash = false,
}) => {
  const [mode, setMode] = useState<string>(propMode || 'payment');
  
  React.useEffect(() => {
    if (visible) {
      setMode(propMode || 'payment');
    }
  }, [visible, propMode]);

  const { user } = useUserContext();
  const { switchCorporate } = useAuthActions();
  const [corpSelectorVisible, setCorpSelectorVisible] = useState(false);
  const multipleCorporates = (user?.accessCorporate?.length ?? 0) > 1;

  const handleCorpSwitch = async (dbName: string) => {
    setCorpSelectorVisible(false);
    await switchCorporate(dbName);
  };

  const {
    voucher,
    loading: saveLoading,
    addEntry,
    removeEntry,
    updateEntry,
    updateVoucher,
    saveVoucher,
    resetVoucher,
  } = useVouchers(token, dbName);

  const { leads, staff, leadsLoading, staffLoading, fetchLeadsForPicker } = usePayments(token, dbName);
  const [pettyCashBooks, setPettyCashBooks] = useState<any[]>([]);
  const [allWorkers, setAllWorkers] = useState<any[]>([]);

  // ─── Sundry Debtor & Accounting Master Ledgers ─────────────────
  const [sundryDebtorLedgers, setSundryDebtorLedgers] = useState<any[]>([]);
  const [accountingMaster, setAccountingMaster] = useState<{ groups: any[], ledgers: any[] } | null>(null);
  const [ledgersLoading, setLedgersLoading] = useState(false);

  const fetchAccountingMaster = useCallback(async () => {
    setLedgersLoading(true);
    try {
      const res = await appService.httpClient.get('finance/master');
      if (res.data?.success) {
        const groups: any[] = res.data.data.groups || [];
        const ledgers: any[] = res.data.data.ledgers || [];
        setAccountingMaster(res.data.data);

        const debtorGroup = groups.find(
          (g: any) => g.groupName?.toLowerCase().includes('sundry debtor')
        );
        const debtorLedgers = debtorGroup
          ? ledgers.filter(
              (l: any) =>
                String(l.ledgerGroupId) === String(debtorGroup._id)
            )
          : [];
        // Exclude default/system placeholders
        const filtered = debtorLedgers.filter(
          (l: any) => l.ledgerName !== 'Default Client'
        );
        setSundryDebtorLedgers(filtered);
      }
    } catch (e) {
      console.log('Failed to load Accounting Master:', e);
    } finally {
      setLedgersLoading(false);
    }
  }, []);

  const bankAndCashLedgers = useMemo(() => {
    if (!accountingMaster) return [];
    const groups = accountingMaster.groups || [];
    const ledgers = accountingMaster.ledgers || [];

    const allowedGroupIds = groups
      .filter((g: any) => {
        const name = (g.groupName || '').toLowerCase();
        return name.includes('bank') || name.includes('cash-in-hand') || name.includes('cash in hand');
      })
      .map((g: any) => String(g._id));

    return ledgers.filter((l: any) => allowedGroupIds.includes(String(l.ledgerGroupId)));
  }, [accountingMaster]);

  const [dateText, setDateText] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);

  const formatDateToDDMMYYYY = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const parseDDMMYYYYToDate = (str: string): Date | null => {
    const parts = str.split('-');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    if (day < 1 || day > 31 || month < 0 || month > 11 || year < 1000) return null;
    const d = new Date(year, month, day);
    if (d.getDate() !== day || d.getMonth() !== month || d.getFullYear() !== year) return null;
    return d;
  };

  const handleDateTextChange = (text: string) => {
    let cleaned = text.replace(/[^0-9-]/g, '');
    if (cleaned.length === 2 && !cleaned.includes('-') && text.length > dateText.length) {
      cleaned = cleaned + '-';
    } else if (cleaned.length === 5 && cleaned.split('-').length === 2 && text.length > dateText.length) {
      cleaned = cleaned + '-';
    }
    if (cleaned.length > 10) {
      cleaned = cleaned.substring(0, 10);
    }
    setDateText(cleaned);
    if (cleaned.length === 10) {
      const parsed = parseDDMMYYYYToDate(cleaned);
      if (parsed) {
        updateVoucher({ date: parsed });
      }
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      updateVoucher({ date: selectedDate });
      setDateText(formatDateToDDMMYYYY(selectedDate));
    }
  };

  const locationId = useMemo(() => {
    try {
      if (!token) return null;
      const decoded: any = jwtDecode(token);
      return decoded.locationId || null;
    } catch (e) {
      return null;
    }
  }, [token]);

  // ── Helper: Resolve Logged-in User's Own Petty Cash Account ──
  const getOwnPettyCashAccount = useCallback((books: any[] = pettyCashBooks) => {
    if (books && books.length > 0) {
      const activeBook = books.find((b: any) => 
        b.refId && (String(b.refId) === String(user?.userId) || String(b.refId) === String(user?._id))
      );
      if (activeBook) {
        return {
          id: activeBook._id,
          name: activeBook.name,
          type: "Category" as const,
          isBank: false
    const year = parseInt(parts[2], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    if (day < 1 || day > 31 || month < 0 || month > 11 || year < 1000) return null;
    const d = new Date(year, month, day);
    if (d.getDate() !== day || d.getMonth() !== month || d.getFullYear() !== year) return null;
    return d;
  };

  const handleDateTextChange = (text: string) => {
    let cleaned = text.replace(/[^0-9-]/g, '');
    if (cleaned.length === 2 && !cleaned.includes('-') && text.length > dateText.length) {
      cleaned = cleaned + '-';
    } else if (cleaned.length === 5 && cleaned.split('-').length === 2 && text.length > dateText.length) {
      cleaned = cleaned + '-';
    }
    if (cleaned.length > 10) {
      cleaned = cleaned.substring(0, 10);
    }
    setDateText(cleaned);
    if (cleaned.length === 10) {
        updateVoucher({ date: parsed });
      }
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      updateVoucher({ date: selectedDate });
      setDateText(formatDateToDDMMYYYY(selectedDate));
    }
  };

  const locationId = useMemo(() => {
    try {
      if (!token) return null;
      const decoded: any = jwtDecode(token);
      return decoded.locationId || null;
    } catch (e) {
      return null;
    }
  }, [token]);

  // ── Helper: Resolve Logged-in User's Own Petty Cash Account ──
  const getOwnPettyCashAccount = useCallback((books: any[] = pettyCashBooks) => {
    if (books && books.length > 0) {
      const activeBook = books.find((b: any) => 
        b.refId && (String(b.refId) === String(user?.userId) || String(b.refId) === String(user?._id))
      );
      if (activeBook) {
        return {
    } else if (currentMode === 'journal') {
      // ⚪ JOURNAL VOUCHER:
      resetVoucher('Journal', '');
      updateEntry("1", { accountId: "", accountName: "", accountType: "Category", type: "Dr" });
      updateEntry("2", { accountId: "", accountName: "", accountType: "Category", type: "Cr" });
    } else {
      // 🔴 PAYMENT VOUCHER (Generic Payment, Vendor Payment, Staff Payment, Expenses):
      // Dr. Vendor/Staff/Expense/Receiver [Debit the Receiver / Debit all Expenses]
      // Cr. Bank/Cash (Own Petty Cash) [Credit what goes out]
    return {
      id: "cash_in_hand",
      name: `Petty Cash - ${user?.userDisplayName || "General User"}`,
      type: "Category" as const,
      isBank: false
    };
  }, [pettyCashBooks, user]);

  // ── Indian Accounting Equation Engine for Payment & Receipt ──
  const applyModeTemplate = useCallback((currentMode: string, books: any[] = pettyCashBooks) => {
    const ownPetty = getOwnPettyCashAccount(books);

    if (currentMode === 'receipt' || currentMode === 'bill_collection') {
      // 🟢 RECEIPT VOUCHER (Inflow):
      // Dr. Bank/Cash (Own Petty Cash) [Debit what comes in]
      // Cr. Client/Sundry Debtor/Income [Credit the Giver]
      resetVoucher('Receipt', currentMode === 'bill_collection' ? 'Received from client' : 'Received amount');
      updateEntry("1", {
        accountId: ownPetty.id,
        accountName: ownPetty.name,
        accountType: "Category",
        type: "Dr",
        isBank: false,
      });
      updateEntry("2", {
        accountId: "",
        accountName: "",
        accountType: "Category",
        type: "Cr",
      });
    } else if (currentMode === 'contra') {
      // 🔵 CONTRA VOUCHER:
      // Dr. Main Bank (Receiver) · Cr. Own Petty Cash (Giver)
      resetVoucher('Contra', 'Intra corporate fund transferred');
      updateEntry("1", {
        accountId: "main_bank",
        accountName: "Main Bank Account",
        accountType: "Category",
        type: "Dr",
        isBank: true,
      });
      updateEntry("2", {
        accountId: ownPetty.id,
        accountName: ownPetty.name,
        accountType: "Category",
        type: "Cr",
        isBank: false,
      });
    } else if (currentMode === 'journal') {
      // ⚪ JOURNAL VOUCHER:
      resetVoucher('Journal', '');
      updateEntry("1", { accountId: "", accountName: "", accountType: "Category", type: "Dr" });
      updateEntry("2", { accountId: "", accountName: "", accountType: "Category", type: "Cr" });
    } else {
      // 🔴 PAYMENT VOUCHER (Generic Payment, Vendor Payment, Staff Payment, Expenses):
      // Dr. Vendor/Staff/Expense/Receiver [Debit the Receiver / Debit all Expenses]
      // Cr. Bank/Cash (Own Petty Cash) [Credit what goes out]
      let defaultNarr = "Payment made";
      if (currentMode === 'vendor_payment') defaultNarr = "Paid to vendor";
      else if (currentMode === 'salary') defaultNarr = "Salary paid to staff";
      else if (currentMode === 'expense') defaultNarr = "Expense payment";
  const [leadPickerVisible, setLeadPickerVisible] = useState(false);
  const [leadSearchText, setLeadSearchText] = useState("");
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);

  const isAdminOrFinance = useMemo(() => {
    const role = (user?.userRole || (user as any)?.role || '').toLowerCase();
    return (
      role.includes('admin') ||
      role.includes('corp') ||
      role.includes('finance') ||
      role === 'corpadmin' ||
      role === 'useradmin'
    );
  }, [user]);

  // ─── Computed Ledger List ──────────────────────────────────────────────────
  const allAccounts = useMemo(() => {
    const leadAccs = leads.map((l) => ({
      id: l._id,
      name: l.sender_name || `Client-${l.lead_no}`,
      type: 'Lead' as const,
      sub: `Lead #${l.lead_no} (${l.status})`,
    }));
    const mergedEmployeesMap = new Map();
    // Add all workers fetched from /service/hr/employees
    allWorkers.forEach((w: any) => {
      mergedEmployeesMap.set(String(w._id), {
        _id: String(w._id),
        name: w.name,
        isBank: false,
      });
    }
  }, [getOwnPettyCashAccount, resetVoucher, updateEntry]);

  React.useEffect(() => {
    if (!visible) return;

    const defaultDate = new Date();
    setDateText(formatDateToDDMMYYYY(defaultDate));

    // Reset picker state on open
    setLeadPickerVisible(false);
    setLeadSearchText("");
    setAccountSearchText("");

    fetchLeadsForPicker();
    fetchAccountingMaster();

    // Fetch dynamic petty cash registers and apply template
    appService.httpClient.get("finance/petty-cash/balances")
      .then((res) => {
        const books = (res.data?.success && res.data.data) ? res.data.data : [];
        setPettyCashBooks(books);
        applyModeTemplate(propMode || 'payment', books);
      })
      .catch((e) => {
        console.log("Failed to load petty cash balances:", e);
        applyModeTemplate(propMode || 'payment', []);
      });

    // Fetch all employees including admins for the staff picker
    appService.httpClient.get('/service/hr/employees', { params: { all: 'true' } })
      .then((res) => {
        if (res.data?.success) {
          setAllWorkers(res.data.data || []);
        }
      })
      .catch((e) => console.log("Failed to load all employees in VoucherEntryModal:", e));
  }, [visible]);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [accountSearchText, setAccountSearchText] = useState("");
  const [leadPickerVisible, setLeadPickerVisible] = useState(false);
  const [leadSearchText, setLeadSearchText] = useState("");
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);

  const isAdminOrFinance = useMemo(() => {
    const role = (user?.userRole || (user as any)?.role || '').toLowerCase();
    return (
      role.includes('admin') ||
        refId: l.refId,
        isPettyCash: isPetty,
        isBank: isBank,
        isActive: l.isActive !== false,
        allowCashFlow: l.allowCashFlow !== false,
      };
    });

    const pettyAccs = pettyCashBooks.map((b) => ({
      id: b._id,
      name: b.name,
      type: 'Category' as const,
      sub: `Petty Cash Register`,
      refId: b.refId,
      isPettyCash: true,
      isBank: false,
      isActive: b.userActive !== false,
      allowCashFlow: b.allowCashFlow !== false,
    }));

    // Fallback static accounts if not present
    const staticFallbacks: any[] = [];
    const hasBank = dynamicLedgerAccs.some((a: any) => a.isBank);
    if (!hasBank) {
      staticFallbacks.push({
        id: 'main_bank',
        name: 'Main Bank Account',
        type: 'Category' as const,
        sub: 'Bank Accounts',
        isBank: true,
        isActive: true,
        allowCashFlow: true,
      });
    }

    const hasUserCash = dynamicLedgerAccs.some((a: any) => a.isPettyCash) || pettyAccs.length > 0;
    if (!hasUserCash) {
      staticFallbacks.push({
        id: 'cash_in_hand',
        name: `Petty Cash - ${user?.userDisplayName || 'General User'}`,
        type: 'Category' as const,
        sub: 'Cash-in-Hand',
        isPettyCash: true,
        isBank: false,
        isActive: true,
        allowCashFlow: true,
      });
    }

    return [...dynamicLedgerAccs, ...pettyAccs, ...staticFallbacks, ...leadAccs, ...employeeAccs];
  }, [leads, staff, pettyCashBooks, accountingMaster, user, allWorkers]);

  // ─── Filtered Leads for project link search ──────────────────────────────────
  const filteredLeads = useMemo(() => {
    if (!leadSearchText.trim()) return leads;
    const q = leadSearchText.toLowerCase();
    return leads.filter(
      (l) =>
        (l.sender_name && l.sender_name.toLowerCase().includes(q)) ||
        (l.lead_no && String(l.lead_no).includes(q)) ||
        (l.product_name && l.product_name.toLowerCase().includes(q))
    );
  }, [leads, leadSearchText]);

  // ─── Bill Collection: Client accounts from Sundry Debtor Ledgers ─────────
  // These are the Cr (Credit) candidates when collecting a bill from a client.
  // Prioritises the Account Ledger accounts; falls back to lead-based list.
  const billCollectionClientAccounts = useMemo(() => {
    if (sundryDebtorLedgers.length > 0) {
      // Build accounts from Account Ledger (Sundry Debtors group)
      return sundryDebtorLedgers.map((l: any) => {
        const bal = l.currentBalance ?? l.openingBalance ?? 0;
        const balStr = bal > 0 ? ` · Bal: ₹${bal.toLocaleString('en-IN')}` : '';
        const associatedLeadId = l.leadIds?.length
          ? l.leadIds[0]
          : (l.refType === 'Lead' && l.refId ? l.refId : undefined);
        const foundLead = leads.find((ld) => ld._id === associatedLeadId);
        const associatedLeadName = foundLead ? (foundLead.sender_name || `Client-${foundLead.lead_no}`) : undefined;

        return {
          id: l._id,
          name: l.ledgerName,
          type: 'Lead' as const,
          sub: `Sundry Debtor${balStr}`,
          isLedgerAccount: true,
          ledgerId: l._id,
          balance: bal,
          leadId: associatedLeadId,
          leadName: associatedLeadName,
        };
      });
    }
    // Fallback: filter accepted/invoiced leads if no ledger accounts
    return allAccounts.filter(
      (acc) =>
        acc.type === 'Lead' &&
        leads.some(
          (l) =>
            l._id === acc.id &&
            (l.status?.toLowerCase() === 'accepted' ||
              l.status?.toLowerCase() === 'tax invoice' ||
              l.status?.toLowerCase() === 'fully paid')
        )
    );
  }, [sundryDebtorLedgers, allAccounts, leads]);

  // ─── Restricted Picker List Filter ─────────────────────────────────────────
  const filteredAccounts = useMemo(() => {
    if (!activeEntryId) return allAccounts;
    const activeEntry = voucher.entries.find((e) => e.id === activeEntryId);
    if (!activeEntry) return allAccounts;

    const rowType = activeEntry.type; // 'Dr' or 'Cr'

    const isGeneralBankOrCash = (acc: any) => {
      const groupLower = (acc.sub || '').toLowerCase();
      const nameLower = (acc.name || '').toLowerCase();
      return (
        acc.isBank ||
        groupLower.includes('bank') ||
        nameLower.includes('bank') ||
        groupLower.includes('cash-in-hand') ||
        groupLower.includes('cash in hand') ||
        nameLower.includes('cash book') ||
        nameLower.includes('petty cash') ||
        nameLower.includes('main bank')
      );
    };

    const isActiveUserPettyCash = (acc: any) =>
      (acc.type === 'Category' &&
       acc.isPettyCash &&
       acc.isActive &&
       acc.allowCashFlow &&
       acc.refId &&
       (String(acc.refId) === String(user?.userId) || String(acc.refId) === String(user?._id))) ||
      acc.id === 'cash_in_hand';

    const isEmployee = (acc: any) => acc.type === 'Staff';

    const isUserPetty = (acc: any) =>
      acc.type === 'Category' &&
      acc.isPettyCash &&
      acc.refId &&
      (String(acc.refId) === String(user?.userId) || String(acc.refId) === String(user?._id));

    // Sort bank/cash accounts: user's own petty cash first, then Bank accounts, then other cash
    const getSortedBankCash = () => {
      const allowedIds = bankAndCashLedgers.map((l: any) => String(l._id));
      const shouldRestrict = restrictToOwnPettyCash && !isAdminOrFinance;

      const list = allAccounts.filter((acc: any) => {
        if (!shouldRestrict) {
          return allowedIds.includes(String(acc.id)) || isGeneralBankOrCash(acc) || isActiveUserPettyCash(acc);
        }
        return isActiveUserPettyCash(acc);
      });

      return list.sort((a: any, b: any) => {
        if (isUserPetty(a)) return -1;
        if (isUserPetty(b)) return 1;
        const aIsBank = (a.sub || '').toLowerCase().includes('bank') || (a.name || '').toLowerCase().includes('bank') || a.isBank;
        const bIsBank = (b.sub || '').toLowerCase().includes('bank') || (b.name || '').toLowerCase().includes('bank') || b.isBank;
        if (aIsBank && !bIsBank) return -1;
        if (!aIsBank && bIsBank) return 1;
        return 0;
      });
    };

    if (mode === 'bill_collection') {
      if (rowType === 'Dr') {
        return getSortedBankCash(); // Dr - Own Petty Cash / Bank / Cash
      } else {
        return billCollectionClientAccounts; // Cr - clients from Sundry Debtors
      }
    }

    if (mode === 'receipt') {
      // 🟢 Receipt: Dr Bank / Cash (Admin can pick Bank or Petty Cash) · Cr Any Ledger/Income/Debtor
      if (rowType === 'Dr') {
        return getSortedBankCash();
      } else {
        return allAccounts.filter(acc => !isEmployee(acc) && !isGeneralBankOrCash(acc));
      }
    }

    if (mode === 'advance' || mode === 'salary') {
      if (rowType === 'Dr') {
        if (restrictToOwnPettyCash && !isAdminOrFinance) {
          return allAccounts.filter(acc => acc.type === 'Category' && acc.name?.toLowerCase().includes('salary payable'));
        }
        return allAccounts.filter(acc => acc.type === 'Staff' || (acc as any).isRul);
      } else {
        return getSortedBankCash(); // Cr - Own Petty Cash / Bank / Cash
      }
    }

    if (mode === 'vendor_payment') {
      // 🔴 Vendor Payment: Dr Vendor/Supplier/Creditor · Cr Bank / Cash (Admin can pick Bank or Petty Cash)
      if (rowType === 'Dr') {
        return allAccounts.filter(acc => !isEmployee(acc) && !isGeneralBankOrCash(acc));
      } else {
        return getSortedBankCash();
      }
    }

    if (mode === 'payment') {
      // 🔴 Generic Payment: Dr All Ledgers · Cr Bank / Cash (Admin can pick Bank or Petty Cash)
      if (rowType === 'Dr') {
        return allAccounts.filter(acc => !isGeneralBankOrCash(acc));
      } else {
        return getSortedBankCash();
      }
    }

    if (mode === 'expense') {
      // 🔴 Expense: Dr Expense Ledger · Cr Bank / Cash (Admin can pick Bank or Petty Cash)
      if (rowType === 'Dr') {
        return allAccounts.filter(acc => !isEmployee(acc) && !isGeneralBankOrCash(acc));

    // Sort bank/cash accounts: user's own petty cash first, then Bank accounts, then other cash
    const getSortedBankCash = () => {
      const allowedIds = bankAndCashLedgers.map((l: any) => String(l._id));
      const shouldRestrict = restrictToOwnPettyCash && !isAdminOrFinance;

      const list = allAccounts.filter((acc: any) => {
        if (!shouldRestrict) {
          return allowedIds.includes(String(acc.id)) || isGeneralBankOrCash(acc) || isActiveUserPettyCash(acc);
        }
        return isActiveUserPettyCash(acc);
      });

      return list.sort((a: any, b: any) => {
        if (isUserPetty(a)) return -1;
        if (isUserPetty(b)) return 1;
        const aIsBank = (a.sub || '').toLowerCase().includes('bank') || (a.name || '').toLowerCase().includes('bank') || a.isBank;
        const bIsBank = (b.sub || '').toLowerCase().includes('bank') || (b.name || '').toLowerCase().includes('bank') || b.isBank;
        if (aIsBank && !bIsBank) return -1;
        if (!aIsBank && bIsBank) return 1;
        return 0;
      });
    };

    if (mode === 'bill_collection') {
      if (rowType === 'Dr') {
        return getSortedBankCash(); // Dr - Own Petty Cash / Bank / Cash
      } else {
        return billCollectionClientAccounts; // Cr - clients from Sundry Debtors
      }
    }

    if (mode === 'receipt') {
      // 🟢 Receipt: Dr Bank / Cash (Admin can pick Bank or Petty Cash) · Cr Any Ledger/Income/Debtor
      if (rowType === 'Dr') {
        return getSortedBankCash();
      } else {
        return allAccounts.filter(acc => !isEmployee(acc) && !isGeneralBankOrCash(acc));
      }
    }

    if (mode === 'advance' || mode === 'salary') {
      if (rowType === 'Dr') {
        if (restrictToOwnPettyCash && !isAdminOrFinance) {
          return allAccounts.filter(acc => acc.type === 'Category' && acc.name?.toLowerCase().includes('salary payable'));
        }
        return allAccounts.filter(acc => acc.type === 'Staff' || (acc as any).isRul);
      } else {
        return getSortedBankCash(); // Cr - Own Petty Cash / Bank / Cash
      }
    }

    if (mode === 'vendor_payment') {
      // 🔴 Vendor Payment: Dr Vendor/Supplier/Creditor · Cr Bank / Cash (Admin can pick Bank or Petty Cash)
      if (rowType === 'Dr') {
        return allAccounts.filter(acc => !isEmployee(acc) && !isGeneralBankOrCash(acc));
      } else {
        return getSortedBankCash();
      }
    }

    if (mode === 'payment') {
      // 🔴 Generic Payment: Dr All Ledgers · Cr Bank / Cash (Admin can pick Bank or Petty Cash)
      if (rowType === 'Dr') {
        return allAccounts.filter(acc => !isGeneralBankOrCash(acc));
      } else {
        return getSortedBankCash();
      }
    }

    if (mode === 'expense') {
      // 🔴 Expense: Dr Expense Ledger · Cr Bank / Cash (Admin can pick Bank or Petty Cash)
      if (rowType === 'Dr') {
        return allAccounts.filter(acc => !isEmployee(acc) && !isGeneralBankOrCash(acc));
      } else {
        return getSortedBankCash();
      }
    }

    if (mode === 'contra') {
      // Contra: Bank/Cash transfer (Admin can transfer between any Bank and Cash)
      const allowedIds = bankAndCashLedgers.map((l: any) => String(l._id));
      return allAccounts.filter((acc: any) => allowedIds.includes(String(acc.id)) || isGeneralBankOrCash(acc));
    }

    if (mode === 'journal') {
      // Journal: Non-cash adjustments
      return allAccounts.filter((acc) => !isGeneralBankOrCash(acc));
    }

    if (mode === 'contra') {
      // Contra: Bank/Cash transfer (Admin can transfer between any Bank and Cash)
      const allowedIds = bankAndCashLedgers.map((l: any) => String(l._id));
      return allAccounts.filter((acc: any) => allowedIds.includes(String(acc.id)) || isGeneralBankOrCash(acc));
    }

    if (mode === 'journal') {
      // Journal: Non-cash adjustments
      return allAccounts.filter((acc) => !isGeneralBankOrCash(acc));
    }

    return allAccounts;
  }, [allAccounts, activeEntryId, voucher.entries, mode, leads, user, billCollectionClientAccounts, bankAndCashLedgers, revenueAndSalesLedgers, restrictToOwnPettyCash, isAdminOrFinance]);

  const searchFilteredAccounts = useMemo(() => {
    if (!accountSearchText.trim()) return filteredAccounts;
    const q = accountSearchText.toLowerCase();
    return filteredAccounts.filter(
      (acc: any) =>
        (acc.name && acc.name.toLowerCase().includes(q)) ||
        (acc.sub && acc.sub.toLowerCase().includes(q)) ||
        (acc.enrollmentNo && acc.enrollmentNo.toLowerCase().includes(q))
    );
  }, [filteredAccounts, accountSearchText]);

  React.useEffect(() => {
    if (visible && preselectedLedgerId && allAccounts.length > 0 && voucher.entries.length > 1) {
      const match = allAccounts.find(acc => acc.id === preselectedLedgerId);
      if (match) {
        const matchAny = match as any;
        const targetEntryId = (mode === 'bill_collection' || mode === 'receipt') ? voucher.entries[1].id : voucher.entries[0].id;
        const effectiveType = matchAny.isLedgerAccount ? 'Category' : matchAny.type;
        const entryUpdates: any = {
          accountId: matchAny.id,
          accountName: matchAny.type === 'Staff' && matchAny.enrollmentNo ? `${matchAny.name} (${matchAny.enrollmentNo})` : matchAny.name,
          accountType: effectiveType,
      } else if (mode === 'advance' || mode === 'salary' || mode === 'payment' || mode === 'vendor_payment' || mode === 'expense') {
        type = 'Payment';
      } else if (mode === 'contra') {
        type = 'Contra';
          const linkedLeadId = matchAny.isLedgerAccount ? matchAny.leadId : matchAny.id;
          const linkedLeadName = matchAny.isLedgerAccount ? matchAny.leadName : matchAny.name;
          entryUpdates.leadId = linkedLeadId;
          entryUpdates.leadName = linkedLeadName;
        }
        updateEntry(targetEntryId, entryUpdates);
      }
    }
  }, [visible, preselectedLedgerId, allAccounts, voucher.entries.length, mode]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleOpenPicker = (entryId: string) => {
    setActiveEntryId(entryId);
    setAccountSearchText("");
    setPickerVisible(true);
  };

  const handleSelectAccount = useCallback((acc: any) => {
    if (activeEntryId) {
      const effectiveType = acc.isLedgerAccount ? 'Category' : acc.type;
      const entryUpdates: any = {
        accountId: acc.id,
        accountName: acc.type === 'Staff' && acc.enrollmentNo ? `${acc.name} (${acc.enrollmentNo})` : acc.name,
        accountType: effectiveType,
      };

      if (acc.type === 'Lead') {
        const linkedLeadId = acc.isLedgerAccount ? acc.leadId : acc.id;
        const linkedLeadName = acc.isLedgerAccount ? acc.leadName : acc.name;
        entryUpdates.leadId = linkedLeadId;
        entryUpdates.leadName = linkedLeadName;
        if (linkedLeadId && linkedLeadName) {
          updateVoucher({ leadId: linkedLeadId, leadName: linkedLeadName });
        }
        if (mode === 'bill_collection' || mode === 'receipt') {
          updateVoucher({ narration: `Received amount for ${acc.name}` });
        }
      }

      updateEntry(activeEntryId, entryUpdates);

      if (acc.type === 'Staff' || acc.isRul) {
        if (mode === 'advance') {
          updateVoucher({ narration: `Advance paid to ${acc.name}` });
        } else if (mode === 'salary') {
          updateVoucher({ narration: `Salary paid to ${acc.name}` });
        }
      }
    }
    setPickerVisible(false);
    setActiveEntryId(null);
  }, [activeEntryId, updateEntry, updateVoucher, mode]);

  const handleSelectLead = useCallback((l: any) => {
    const leadName = l.sender_name || `Client-${l.lead_no}`;
    updateVoucher({ leadId: l._id, leadName });
    if (mode === 'bill_collection' || mode === 'receipt') {
      updateVoucher({ narration: `Received bill amount for ${leadName}` });
    }
    setLeadPickerVisible(false);
    const leadName = l.sender_name || `Client-${l.lead_no}`;
    updateVoucher({ leadId: l._id, leadName });
    if (mode === 'bill_collection' || mode === 'receipt') {
      updateVoucher({ narration: `Received bill amount for ${leadName}` });
    }
    setLeadPickerVisible(false);
    setLeadSearchText("");
  }, [mode, updateVoucher]);

  const renderAccountItem = useCallback(({ item }: { item: any }) => (
    <AccountItem item={item} onSelect={handleSelectAccount} />
  ), [handleSelectAccount]);

  const renderLeadItem = useCallback(({ item }: { item: any }) => (
    <LeadItem item={item} onSelect={handleSelectLead} />
  ), [handleSelectLead]);

  const handleSave = async (printAfterSave: boolean = false) => {
    try {
      const parsedDate = parseDDMMYYYYToDate(dateText);
      if (!parsedDate) {
        Alert.alert('Invalid Date', 'Please enter a valid date in DD-MM-YYYY format.');
        return;
      }
      updateVoucher({ date: parsedDate });

      let type: "Payment" | "Receipt" | "Contra" | "Journal" | "Sales" | "Purchase" = initialType || "Journal";
      if (mode === 'bill_collection' || mode === 'receipt') {
        type = 'Receipt';
      } else if (mode === 'advance' || mode === 'salary' || mode === 'payment' || mode === 'vendor_payment' || mode === 'expense') {
        type = 'Payment';
      } else if (mode === 'contra') {
        type = 'Contra';
      } else if (mode === 'journal') {
        type = 'Journal';
      } else if (mode === 'sales') {
        type = 'Sales';
      } else if (mode === 'purchase') {
        type = 'Purchase';
      }

      const isSalesOrPurchase = type === 'Sales' || type === 'Purchase';
      const hasStaffOrExpenseEntry = voucher.entries.some(entry => {
        const matchedAcc = allAccounts.find(a => a.id === entry.accountId);
        if ((matchedAcc as any)?.isRul) return false;

        if (entry.accountType === 'Staff' || matchedAcc?.type === 'Staff') return true;
        const nameLower = (entry.accountName || '').toLowerCase();
        const idLower = (entry.accountId || '').toLowerCase();
        if (['office_rent', 'electricity_bill', 'stationary_expense', 'uniform_equipment', 'salary_wages'].includes(idLower)) return true;
            nameLower.includes('purchase') || nameLower.includes('sales') || nameLower.includes('sale')) {
          return true;
        }
        return false;
      });

      const requireLead = (type === 'Purchase' || hasStaffOrExpenseEntry) && type !== 'Sales';

      if (requireLead && !voucher.leadId) {
        Alert.alert('Linkage Required', 'Project/Enquiry linkage (Lead) is required for Purchase, Salary, and Expense entries.');
        return;
      }
      
      const savedData = await saveVoucher(type, locationId, mode);
      
      if (printAfterSave) {
        const voucherToPrint = {
          voucherNo: savedData?.voucherId || `V-${Math.floor(Math.random() * 10000)}`,
          date: formatDateToDDMMYYYY(voucher.date),
          type: type,
          narration: voucher.narration,
          totalAmount: voucher.totalDr,
          entries: voucher.entries.map(e => ({
            accountName: e.accountName || 'Unknown',
            type: e.type,
            amount: e.amount
          }))
        };

        const companyInfo = {
          name: user?.corporateName || 'Company Name',
          address: [
            user?.corporateAddress,
            user?.corporateCity,
            user?.corporateState,
            user?.corporatePin ? `PIN-${user.corporatePin}` : ''
          ].filter(Boolean).join(', '),
          gstNo: user?.corporateGST || ''
        };

        try {
          await printAccountingVoucher(voucherToPrint, companyInfo);
        } catch (printErr) {
          Alert.alert('Print Error', 'Voucher saved but printing failed.');
        }
      }

      Alert.alert('Success', 'Voucher posted successfully.');
      applyModeTemplate(mode);
      const defaultDate = new Date();
      setDateText(formatDateToDDMMYYYY(defaultDate));
      Alert.alert('Voucher Error', detailedMsg);
    }
  };

  const headerInfo = useMemo(() => {
    switch (mode) {
      case 'payment':
        return { title: 'Payment Voucher', subtitle: 'Dr Any Ledger/Expense · Cr Own Petty Cash/Bank (Payment Made)' };
      case 'receipt':
        return { title: 'Receipt Voucher', subtitle: 'Dr Own Petty Cash/Bank · Cr Any Ledger/Income (Cash Received)' };
      case 'bill_collection':
        return { title: 'Client Receipt', subtitle: 'Dr Own Petty Cash/Bank · Cr Client/Debtor (Bill Collection)' };
      case 'vendor_payment':
        return { title: 'Vendor Payment', subtitle: 'Dr Vendor/Creditor · Cr Own Petty Cash/Bank' };
      case 'advance':
        return { title: 'Employee Advance', subtitle: 'Dr Employee Ledger · Cr Own Petty Cash/Bank' };
      case 'salary':
        return { title: 'Staff Payment', subtitle: 'Dr Staff/Employee Ledger · Cr Own Petty Cash/Bank' };
      case 'expense':
        return { title: 'Employee Advance', subtitle: 'Dr Employee Ledger · Cr Own Petty Cash/Bank' };
      case 'salary':
        return { title: 'Staff Payment', subtitle: 'Dr Staff/Employee Ledger · Cr Own Petty Cash/Bank' };
      case 'expense':
        return { title: 'Expenses Payment', subtitle: 'Dr Expense Ledger · Cr Own Petty Cash/Bank' };
      case 'sales':
        return { title: 'Sales Voucher', subtitle: 'Dr Client (Sundry Debtors) · Cr Sales / Revenue Account' };
      case 'contra':
        return { title: 'Cash Transfer (Contra)', subtitle: 'Dr Bank/Cash (Receiver) · Cr Cash/Bank (Giver)' };
      case 'journal':
        return { title: 'Journal Voucher', subtitle: 'Dr & Cr Ledgers (Non-Cash Adjustments)' };
      default:
        return { title: 'Voucher Entry', subtitle: 'Maintain proper double-entry ledger book' };
    }
  }, [mode]);

  const VOUCHER_TABS = useMemo(() => [
    { key: 'payment', label: 'Payment' },
    { key: 'receipt', label: 'Receipt' },
    { key: 'sales', label: 'Sales' },
    { key: 'bill_collection', label: 'Client Receipt' },
    { key: 'vendor_payment', label: 'Vendor Payment' },
    { key: 'salary', label: 'Staff Payment' },
    { key: 'expense', label: 'Expenses' },
    { key: 'contra', label: 'Cash Transfer' },
    { key: 'journal', label: 'Journal' },
  ], []);

  const isBalanced = voucher.totalDr === voucher.totalCr && voucher.totalDr > 0;
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={{ flex: 1, backgroundColor: '#FCF8E8' }}
      >
        <View style={{ flex: 1, paddingTop: insets.top }}>
          {/* TOP BANNER */}
          <View style={{ height: 24, backgroundColor: '#1E4472', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8 }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>Accounting Voucher Creation</Text>
                      </View>

                      <View style={{ width: 120, marginLeft: 8, borderBottomWidth: 1, borderBottomColor: '#000', alignItems: 'flex-end', paddingTop: 2 }}>
                        <TextInput
                          style={{ fontSize: 14, color: '#000', fontWeight: 'bold', padding: 0, textAlign: 'right', width: '100%' }}
                          keyboardType="numeric"
                          value={entry.amount ? String(entry.amount) : ''}
                          onChangeText={(v) => updateEntry(entry.id, { amount: Number(v.replace(/[^0-9]/g, '')) })}
                        />
                      </View>