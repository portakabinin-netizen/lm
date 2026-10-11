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
import { useUserContext } from '@/context/AuthContext';
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
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: '#f1f5f9',
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}
  >
    {isStaff && item.photo ? (
      <Image
        source={{ uri: item.photo }}
        style={{ width: 46, height: 46, borderRadius: 23, marginRight: 12, backgroundColor: '#f1f5f9' }}
      />
    ) : isStaff ? (
      <View style={{ width: 46, height: 46, borderRadius: 23, marginRight: 12, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="person" size={24} color="#94a3b8" />
      </View>
    ) : null}
    <View style={{ flex: 1, paddingRight: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textDark, flex: 1, lineHeight: 22 }}>
          {item.name}{isStaff && item.enrollmentNo ? ` (${item.enrollmentNo})` : ''}
        </Text>
        {isStaff && item.mobile && (
          <TouchableOpacity 
            onPress={() => Linking.openURL(`tel:${item.mobile}`)} 
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#e0f2fe', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, marginLeft: 8, flexShrink: 0 }}
          >
            <Ionicons name="call" size={14} color="#0284c7" />
            <Text style={{ fontSize: 13, color: '#0284c7', marginLeft: 4, fontWeight: '700' }}>{item.mobile}</Text>
          </TouchableOpacity>
        )}
      </View>
      
      {isStaff ? (
        <View style={{ marginTop: 6, gap: 4 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#475569' }}>
            EFN# {item.enrollmentNo || 'N/A'}, {item.sub?.replace('Role: ', '') || 'Staff'}
          </Text>
          <Text style={{ fontSize: 12, fontWeight: '500', color: '#64748b' }}>
            <Ionicons name="location-outline" size={12} color="#64748b" /> Last at: {item.lastSite || 'Unknown Site'}
          </Text>
        </View>
      ) : (
        <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 4 }}>
          {item.sub}
        </Text>
      )}
    </View>
    <View style={{ alignItems: 'flex-end', gap: 4, justifyContent: 'center' }}>
      {item.isLedgerAccount && item.balance != null && (
        <View style={{
          backgroundColor: item.balance > 0 ? '#dcfce7' : item.balance < 0 ? '#fee2e2' : '#f1f5f9',
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
          marginBottom: 2,
        }}>
          <Text style={{ 
            fontSize: 15, 
            fontWeight: '900', 
            color: item.balance > 0 ? '#16a34a' : item.balance < 0 ? '#dc2626' : '#64748b' 
          }}>
            {item.balance > 0 ? '+' : item.balance < 0 ? '-' : ''} â‚¹{Math.abs(item.balance).toLocaleString('en-IN')}
          </Text>
        </View>
      )}
      {!isStaff && (
        <Ionicons
          name={item.isLedgerAccount ? 'receipt-outline' : item.type === 'Lead' ? 'business' : 'layers'}
          size={16}
          color={item.isLedgerAccount ? COLORS.primary : COLORS.textMuted}
        />
      )}
    </View>
  </TouchableOpacity>
)});

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
        Lead #{item.lead_no} Â· {item.product_name || 'No Product'}
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
  mode?: 'bill_collection' | 'advance' | 'salary' | 'payment' | 'receipt' | 'contra' | 'journal' | 'sales' | 'purchase';
}

export const VoucherEntryModal: React.FC<VoucherEntryModalProps> = ({
  visible,
  onClose,
  token,
  dbName,
  initialType,
  preselectedLedgerId,
  mode,
}) => {
  const { user } = useUserContext();
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

  // â”€â”€â”€ Sundry Debtor & Accounting Master Ledgers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  React.useEffect(() => {
    if (visible) {
      let type: "Payment" | "Receipt" | "Contra" | "Journal" | "Sales" | "Purchase" = initialType || "Journal";
      if (mode === 'bill_collection' || mode === 'receipt') {
        type = 'Receipt';
      } else if (mode === 'advance' || mode === 'salary' || mode === 'payment') {
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
      
      let initialNarration = "";
      if (mode === 'contra') {
        initialNarration = "Intra corporate fund transferred";
      }
      resetVoucher(type, initialNarration);

      const defaultDate = new Date();
      setDateText(formatDateToDDMMYYYY(defaultDate));

      // Reset lead picker state on open
      setLeadPickerVisible(false);
      setLeadSearchText("");
      setAccountSearchText("");

      // ðŸ”„ Re-fetch leads on every open â†’ backend heals any missing Sundry Debtor ledgers on-the-fly
      fetchLeadsForPicker();

      // ðŸ“– Fetch Accounting Master (always, so dynamic categories and bank/cash ledgers are populated)
      fetchAccountingMaster();

      // Fetch dynamic petty cash registers
      appService.httpClient.get("finance/petty-cash/balances")
        .then((res) => {
          if (res.data?.success) {
            const books = res.data.data || [];
            setPettyCashBooks(books);

            if (mode === 'bill_collection') {
              const activeBook = books.find((b: any) => 
                b.refId && (String(b.refId) === String(user?.userId) || String(b.refId) === String(user?._id))
              );
              if (activeBook) {
                updateEntry("1", {
                  accountId: activeBook._id,
                  accountName: activeBook.name,
                  accountType: "Category",
                  isBank: false
                });
              } else {
                updateEntry("1", {
                  accountId: "cash_in_hand",
                  accountName: `Petty Cash - ${user?.userDisplayName || "General User"}`,
                  accountType: "Category",
                  isBank: false
                });
              }
            }
          }
        })
        .catch((e) => console.log("Failed to load petty cash balances in VoucherEntryModal:", e));
    }
  }, [visible, mode, initialType, resetVoucher, user, fetchLeadsForPicker]);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [accountSearchText, setAccountSearchText] = useState("");
  const [leadPickerVisible, setLeadPickerVisible] = useState(false);
  const [leadSearchText, setLeadSearchText] = useState("");
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);

  // â”€â”€â”€ Computed Ledger List â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const allAccounts = useMemo(() => {
    const leadAccs = leads.map((l) => ({
      id: l._id,
      name: l.sender_name || `Client-${l.lead_no}`,
      type: 'Lead' as const,
      sub: `Lead #${l.lead_no} (${l.status})`,
    }));
    const employeeAccs = staff.employees.map((e) => {
      const ledger = (accountingMaster?.ledgers || []).find(
        (l: any) => l.refType === 'Staff' && l.refId === e._id
      );
      const isLedgerAccount = !!ledger;
      const ledgerId = ledger ? ledger._id : undefined;
      const balance = ledger ? (ledger.currentBalance ?? ledger.openingBalance ?? 0) : undefined;

      return {
        id: isLedgerAccount ? ledgerId : e._id,
        name: e.name,
        type: 'Staff' as const,
        sub: `Staff - ${e.role}`,
        photo: e.photo,
        enrollmentNo: e.enrollment_no,
        mobile: e.mobile,
        lastSite: e.last_site_name,
        lastAttendanceDate: e.last_attendance_date,
        isLedgerAccount,
        ledgerId,
        balance,
      };
    });

    const dynamicLedgerAccs = (accountingMaster?.ledgers || []).map((l: any) => {
      const isPetty = l.ledgerName?.toLowerCase().includes('petty cash') || l.groupName?.toLowerCase().includes('petty cash');
      return {
        id: l._id,
        name: l.ledgerName,
        type: 'Category' as const,
        isRul: l.refType === 'RUL' || (l.ledgerName && l.ledgerName.toLowerCase().includes('(salary)')),
        sub: l.groupName || 'General Ledger',
        refId: l.refId,
        isPettyCash: isPetty,
        isActive: l.isActive !== false,
        allowCashFlow: l.allowCashFlow !== false,
      };
    });

    if (dynamicLedgerAccs.length === 0) {
      const staticAccs = FIXED_LEDGERS.map((f) => ({
        id: f.id,
        name: f.name,
        type: 'Category' as const,
        sub: 'General Ledger',
      }));
      const pettyAccs = pettyCashBooks.map((b) => ({
        id: b._id,
        name: b.name,
        type: 'Category' as const,
        sub: `Petty Cash Register`,
        refId: b.refId,
        isPettyCash: true,
        isActive: b.userActive !== false,
        allowCashFlow: b.allowCashFlow !== false,
      }));
      return [...staticAccs, ...pettyAccs, ...leadAccs, ...employeeAccs];
    }

    return [...dynamicLedgerAccs, ...leadAccs, ...employeeAccs];
  }, [leads, staff, pettyCashBooks, accountingMaster]);

  // â”€â”€â”€ Bill Collection: Client accounts from Sundry Debtor Ledgers â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // These are the Cr (Credit) candidates when collecting a bill from a client.
  // Prioritises the Account Ledger accounts; falls back to lead-based list.
  // â”€â”€â”€ Filtered Leads for project link search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ Bill Collection: Client accounts from Sundry Debtor Ledgers â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // These are the Cr (Credit) candidates when collecting a bill from a client.
  // Prioritises the Account Ledger accounts; falls back to lead-based list.
  const billCollectionClientAccounts = useMemo(() => {
    if (sundryDebtorLedgers.length > 0) {
      // Build accounts from Account Ledger (Sundry Debtors group)
      return sundryDebtorLedgers.map((l: any) => {
        const bal = l.currentBalance ?? l.openingBalance ?? 0;
        const balStr = bal > 0 ? ` Â· Bal: â‚¹${bal.toLocaleString('en-IN')}` : '';
        const associatedLeadId = l.leadIds?.length
          ? l.leadIds[0]
          : (l.refType === 'Lead' && l.refId ? l.refId : undefined);
        const foundLead = leads.find((ld) => ld._id === associatedLeadId);
        const associatedLeadName = foundLead ? (foundLead.sender_name || `Client-${foundLead.lead_no}`) : undefined;

        return {
          id: l._id,
          name: l.ledgerName,
          type: 'Lead' as const, // treat as Lead so the voucher backend resolves correctly
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

  // â”€â”€â”€ Restricted Picker List Filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const filteredAccounts = useMemo(() => {
    if (!activeEntryId) return allAccounts;
    const activeEntry = voucher.entries.find((e) => e.id === activeEntryId);
    if (!activeEntry) return allAccounts;

    const rowType = activeEntry.type; // 'Dr' or 'Cr'

    const isGeneralBankOrCash = (acc: any) => {
      const groupLower = (acc.sub || '').toLowerCase();
      const nameLower = (acc.name || '').toLowerCase();
      return (
        groupLower.includes('bank') ||
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
       (acc.refId === user?.userId || acc.refId === user?._id)) ||
      acc.id === 'cash_in_hand';

    const isEmployee = (acc: any) => acc.type === 'Staff';

    if (mode === 'bill_collection') {
      if (rowType === 'Dr') {
        return allAccounts.filter(isActiveUserPettyCash); // Dr - Always active user petty cash
      } else {
        // Cr - clients from Sundry Debtors
        return billCollectionClientAccounts;
      }
    }

    if (mode === 'advance' || mode === 'salary') {
      if (rowType === 'Dr') {
        return allAccounts.filter(acc => acc.type === 'Staff' || (acc as any).isRul); // Dr - Employee/Team ledger
      } else {
        return allAccounts.filter(isActiveUserPettyCash); // Cr - Always credit petty cash
      }
    }

    if (mode === 'payment') {
      if (rowType === 'Dr') {
        return allAccounts.filter(acc => !isEmployee(acc)); // Dr - All ledgers except staff/employee
      } else {
        return allAccounts.filter(isActiveUserPettyCash); // Cr - Always credit petty cash
      }
    }

    if (mode === 'receipt') {
      if (rowType === 'Dr') {
        return allAccounts.filter(isActiveUserPettyCash); // Dr - Active user petty cash only
      } else {
        return allAccounts.filter(acc => !isEmployee(acc)); // Cr - All ledgers except staff/employee
      }
    }

    if (mode === 'contra') {
      // Contra: show all ledgers having group name bank and cash-in-hand
      const allowedIds = bankAndCashLedgers.map((l: any) => String(l._id));
      return allAccounts.filter((acc: any) => allowedIds.includes(String(acc.id)));
    }

    if (mode === 'journal') {
      // Journal: Dr/Cr - All ledgers EXCEPT Bank/Cash/Petty Cash (group name matched to bank,cash-in-hand)
      return allAccounts.filter((acc) => !isGeneralBankOrCash(acc));
    }

    return allAccounts;
  }, [allAccounts, activeEntryId, voucher.entries, mode, leads, user, billCollectionClientAccounts, bankAndCashLedgers]);

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
        const targetEntryId = mode === 'bill_collection' ? voucher.entries[1].id : voucher.entries[0].id;
        const effectiveType = matchAny.isLedgerAccount ? 'Category' : matchAny.type;
        const entryUpdates: any = {
          accountId: matchAny.id,
          accountName: matchAny.type === 'Staff' && matchAny.enrollmentNo ? `${matchAny.name} (${matchAny.enrollmentNo})` : matchAny.name,
          accountType: effectiveType,
        };
        if (matchAny.type === 'Lead') {
          const linkedLeadId = matchAny.isLedgerAccount ? matchAny.leadId : matchAny.id;
          const linkedLeadName = matchAny.isLedgerAccount ? matchAny.leadName : matchAny.name;
          entryUpdates.leadId = linkedLeadId;
          entryUpdates.leadName = linkedLeadName;
        }
        updateEntry(targetEntryId, entryUpdates);
      }
    }
  }, [visible, preselectedLedgerId, allAccounts, voucher.entries.length, mode]);

  // â”€â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleOpenPicker = (entryId: string) => {
    setActiveEntryId(entryId);
    setAccountSearchText("");
    setPickerVisible(true);
  };

  const handleSelectAccount = useCallback((acc: any) => {
    setAccountSearchText("");
    if (activeEntryId) {
      // For Account Ledger entries (Sundry Debtor ledger accounts),
      // use 'Category' type so the backend resolves them directly via the ledger _id.
      // This bypasses the Lead/Staff resolution path and lets the voucher controller
      // use the pre-existing ledger record directly.
      const effectiveType = acc.isLedgerAccount ? 'Category' : acc.type;
      const entryUpdates: any = {
        accountId: acc.id,
        accountName: acc.type === 'Staff' && acc.enrollmentNo ? `${acc.name} (${acc.enrollmentNo})` : acc.name,
        accountType: effectiveType,
      };

      // Automatically preset the lead if a ledger account of type 'Lead' is selected
      if (acc.type === 'Lead') {
        const linkedLeadId = acc.isLedgerAccount ? acc.leadId : acc.id;
        const linkedLeadName = acc.isLedgerAccount ? acc.leadName : acc.name;
        entryUpdates.leadId = linkedLeadId;
        entryUpdates.leadName = linkedLeadName;
        if (linkedLeadId && linkedLeadName) {
          updateVoucher({ leadId: linkedLeadId, leadName: linkedLeadName });
        }
        if (mode === 'bill_collection') {
          updateVoucher({ narration: `Received bill amount for ${acc.name}` });
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
    if (mode === 'bill_collection') {
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
      } else if (mode === 'advance' || mode === 'salary' || mode === 'payment') {
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

        if (entry.accountType === 'Staff') return false; // Staff/Worker payments don't require leadId linkage
        const nameLower = (entry.accountName || '').toLowerCase();
        const idLower = (entry.accountId || '').toLowerCase();
        if (['office_rent', 'electricity_bill', 'stationary_expense', 'uniform_equipment', 'salary_wages'].includes(idLower)) return true;
        if (nameLower.includes('expense') || nameLower.includes('rent') || nameLower.includes('bill') ||
            nameLower.includes('salary') || nameLower.includes('wages') || nameLower.includes('printing') ||
            nameLower.includes('purchase') || nameLower.includes('sales') || nameLower.includes('sale')) {
          return true;
        }
        return false;
      });

      const requireLead = isSalesOrPurchase || hasStaffOrExpenseEntry;

      if (requireLead && !voucher.leadId) {
        Alert.alert('Linkage Required', 'Project/Enquiry linkage (Lead) is required for Sales, Purchase, Salary, and Expense entries.');
        return;
      }
      
      const savedData = await saveVoucher(type, locationId, mode);
      
      if (printAfterSave) {
        // Transform the current voucher state into the format expected by the printer
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
      resetVoucher();
      onClose();
    } catch (err: any) {
      const detailedMsg = err.response?.data?.message || err.response?.data?.error || err.message;
      Alert.alert('Voucher Error', detailedMsg);
    }
  };

  const headerInfo = useMemo(() => {
    switch (mode) {
      case 'bill_collection':
        return { title: 'Bill Collection', subtitle: 'Dr Own Petty Cash / Bank Â· Cr Client (Accepted/Tax Invoice/Fully Paid)' };
      case 'advance':
        return { title: 'Employee Advance', subtitle: 'Dr Employee Ledger Â· Cr Bank/Cash' };
      case 'salary':
        return { title: 'Salary Payment', subtitle: 'Dr Employee Ledger Â· Cr Bank/Cash' };
      case 'payment':
        return { title: 'Payment Voucher', subtitle: 'Dr All Ledgers Â· Cr Bank/Cash/Petty Cash' };
      case 'receipt':
        return { title: 'Receipt Voucher', subtitle: 'Dr Active User Petty Cash Â· Cr All Ledgers' };
      case 'contra':
        return { title: 'Contra (Fund Transfer)', subtitle: 'Dr Bank/Cash Â· Cr Cash/Bank' };
      case 'journal':
        return { title: 'Journal Voucher', subtitle: 'Dr & Cr Ledgers (Excludes Bank/Cash)' };
      default:
        return { title: 'Voucher Entry', subtitle: 'Maintain proper double-entry ledger book' };
    }
  }, [mode]);

  const isBalanced = voucher.totalDr === voucher.totalCr && voucher.totalDr > 0;
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, backgroundColor: '#fff', marginTop: 0, paddingTop: insets.top }}>
          <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>

            {/* Header */}
            <View style={{ height: 60, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
              <TouchableOpacity onPress={onClose} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 17, fontWeight: '900', color: '#fff' }}>{headerInfo.title}</Text>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)', fontWeight: '800' }}>{headerInfo.subtitle}</Text>
              </View>
            </View>

            <ScrollView style={styles.vBody} keyboardShouldPersistTaps="handled">

              {/* Date Input */}
              <Text style={styles.label}>Voucher Date (DD-MM-YYYY)</Text>
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#fff',
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                paddingHorizontal: 12,
                height: 48,
                marginBottom: 16
              }}>
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: '#0f172a', fontWeight: '600', paddingVertical: 0 }}
                  placeholder="DD-MM-YYYY"
                  placeholderTextColor="#94a3b8"
                  value={dateText}
                  onChangeText={handleDateTextChange}
                  maxLength={10}
                  keyboardType="numeric"
                />
                <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{ padding: 4 }}>
                  <Ionicons name="calendar-outline" size={22} color={COLORS.primary} />
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={voucher.date || new Date()}
                  mode="date"
                  display="default"
                  onChange={onDateChange}
                />
              )}

              {/* Narration */}
              <Text style={styles.label}>General Narration</Text>
              <TextInput
                style={styles.vNarrationInput}
                placeholder="Enter transaction remarks..."
                multiline
                value={voucher.narration}
                onChangeText={(t) => updateVoucher({ narration: t })}
              />

              {/* Link to Lead / Project */}
              {mode !== 'contra' && (
                <>
                  <Text style={styles.label}>Link to Lead (Project)</Text>
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#fff',
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    paddingHorizontal: 12,
                    height: 48,
                    marginBottom: 16
                  }}>
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', height: '100%' }}
                      onPress={() => setLeadPickerVisible(true)}
                    >
                      <Text style={{ flex: 1, fontSize: 14, color: voucher.leadId ? '#0f172a' : '#94a3b8', fontWeight: '600' }} numberOfLines={1}>
                        {voucher.leadName || 'Link to Lead / Project...'}
                      </Text>
                    </TouchableOpacity>
                    {voucher.leadId ? (
                      <TouchableOpacity
                        onPress={() => updateVoucher({ leadId: undefined, leadName: undefined })}
                        style={{ padding: 4, marginRight: 8 }}
                      >
                        <Ionicons name="close-circle" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity onPress={() => setLeadPickerVisible(true)} style={{ padding: 4 }}>
                      <Ionicons name="business-outline" size={22} color={COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Grid Header */}
              <View style={styles.vGridHeader}>
                <Text style={[styles.vGridLabel, styles.vColLedger]}>Ledger Account</Text>
                <Text style={[styles.vGridLabel, styles.vColType]}>Type</Text>
                <Text style={[styles.vGridLabel, styles.vColAmount]}>Amount</Text>
              </View>

              {/* Entries */}
              {voucher.entries.map((entry) => (
                <View key={entry.id} style={styles.vEntryRow}>
                  {/* Ledger Select */}
                  <TouchableOpacity
                    style={styles.vLedgerBtn}
                    onPress={() => handleOpenPicker(entry.id)}
                  >
                    <Text style={[styles.vLedgerText, !entry.accountName && { color: COLORS.textMuted }]}>
                      {entry.accountName || 'Select Ledger...'}
                    </Text>
                  </TouchableOpacity>

                  {/* Dr/Cr Toggle (Locked if mode is specified to prevent user entry error) */}
                  <TouchableOpacity
                    style={[styles.vTypeBtn, entry.type === 'Dr' ? styles.vTypeDr : styles.vTypeCr]}
                    onPress={() => !mode && updateEntry(entry.id, { type: entry.type === 'Dr' ? 'Cr' : 'Dr' })}
                    disabled={!!mode}
                  >
                    <Text style={entry.type === 'Dr' ? styles.vTypeTextDr : styles.vTypeTextCr}>
                      {entry.type}
                    </Text>
                  </TouchableOpacity>

                  {/* Amount Input */}
                  <TextInput
                    style={styles.vAmountInput}
                    keyboardType="numeric"
                    placeholder="0"
                    value={entry.amount ? String(entry.amount) : ''}
                    onChangeText={(v) => updateEntry(entry.id, { amount: Number(v.replace(/[^0-9]/g, '')) })}
                  />

                  {/* Remove (Only allowed if not in quick action modes) */}
                  <TouchableOpacity
                    onPress={() => !mode && removeEntry(entry.id)}
                    style={[styles.vRemoveBtn, !!mode && { opacity: 0.3 }]}
                    disabled={!!mode}
                  >
                    <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Add Entry Row (Only allowed for free-form Journal/Payment/Receipt when not locked in quick action modes) */}
              {!mode && (
                <TouchableOpacity style={styles.vAddBtn} onPress={addEntry}>
                  <Ionicons name="add-circle" size={18} color={COLORS.primary} />
                  <Text style={styles.vAddText}>Add Ledger Row</Text>
                </TouchableOpacity>
              )}

              <View style={{ height: 100 }} />
            </ScrollView>

            {/* Sticky Footer */}
            <View style={styles.vFooter}>
              <View>
                <Text style={styles.vTotalLabel}>Total Debit</Text>
                <Text style={styles.vTotalVal}>â‚¹{voucher.totalDr}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.vTotalLabel}>Total Credit</Text>
                <Text style={[styles.vTotalVal, isBalanced ? styles.vBalanced : styles.vUnbalanced]}>
                  â‚¹{voucher.totalCr}
                </Text>
              </View>
            </View>

            <View style={{ padding: 16, backgroundColor: '#fff', paddingBottom: Math.max(insets.bottom, 16) }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity
                  style={[styles.vSaveBtn, { flex: 1, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' }, !isBalanced && { opacity: 0.5 }]}
                  onPress={() => handleSave(true)}
                  disabled={saveLoading || !isBalanced}
                >
                  {saveLoading ? (
                    <ActivityIndicator color={COLORS.primary} />
                  ) : (
                    <>
                      <Ionicons name="print-outline" size={22} color={COLORS.textDark} />
                      <Text style={[styles.vSaveText, { color: COLORS.textDark }]}>Accept & Print</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.vSaveBtn, { flex: 1 }, !isBalanced && { opacity: 0.5 }]}
                  onPress={() => handleSave(false)}
                  disabled={saveLoading || !isBalanced}
                >
                  {saveLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="shield-checkmark" size={22} color="#fff" />
                      <Text style={styles.vSaveText}>Accept</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

          </View>
        </View>

        {/* --- Account Picker Modal --- */}
        <Modal visible={pickerVisible} animationType="fade" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20, paddingVertical: 40 }}>
            <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textDark }}>Select Account Ledger</Text>
                <TouchableOpacity onPress={() => setPickerVisible(false)}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {/* Search input for accounts */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#f1f5f9',
                borderRadius: 8,
                paddingHorizontal: 12,
                height: 40,
                marginBottom: 12
              }}>
                <Ionicons name="search" size={18} color="#94a3b8" />
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: '#0f172a', marginLeft: 8 }}
                  placeholder="Search ledger name or description..."
                  placeholderTextColor="#94a3b8"
                  value={accountSearchText}
                  onChangeText={setAccountSearchText}
                />
                {accountSearchText.length > 0 && (
                  <TouchableOpacity onPress={() => setAccountSearchText("")}>
                    <Ionicons name="close-circle" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>

              {(leadsLoading || staffLoading || ledgersLoading) ? (
                <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                  <ActivityIndicator color={COLORS.primary} size="large" />
                  <Text style={{ marginTop: 10, color: COLORS.textMuted, fontSize: 12, fontWeight: '600' }}>
                    {ledgersLoading ? 'Loading Account Ledgersâ€¦' : 'Syncing client ledgers...'}
                  </Text>
                </View>
              ) : searchFilteredAccounts.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="alert-circle-outline" size={40} color="#cbd5e1" />
                  <Text style={{ marginTop: 12, color: '#64748b', fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
                    No eligible accounts found.
                  </Text>
                  <Text style={{ marginTop: 4, color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
                    {mode === 'bill_collection'
                      ? 'Create Sundry Debtor ledger accounts in Ledger Master first, or ensure leads have Accepted / Tax Invoice / Fully Paid status.'
                      : 'Only leads with Accepted, Tax Invoice, or Fully Paid status appear here.'}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={searchFilteredAccounts}
                  keyExtractor={(item, index) => `${item.type}-${item.id}-${index}`}
                  initialNumToRender={20}
                  maxToRenderPerBatch={20}
                  windowSize={7}
                  showsVerticalScrollIndicator={false}
                  renderItem={renderAccountItem}
                />
              )}
            </View>
          </View>
        </Modal>

        {/* --- Lead Picker Modal --- */}
        <Modal visible={leadPickerVisible} animationType="fade" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 20, paddingVertical: 40 }}>
            <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textDark }}>Select Lead (Project)</Text>
                <TouchableOpacity onPress={() => { setLeadPickerVisible(false); setLeadSearchText(""); }}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {/* Search input for leads */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#f1f5f9',
                borderRadius: 8,
                paddingHorizontal: 12,
                height: 40,
                marginBottom: 12
              }}>
                <Ionicons name="search" size={18} color="#94a3b8" />
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: '#0f172a', marginLeft: 8 }}
                  placeholder="Search lead name or number..."
                  placeholderTextColor="#94a3b8"
                  value={leadSearchText}
                  onChangeText={setLeadSearchText}
                />
                {leadSearchText.length > 0 && (
                  <TouchableOpacity onPress={() => setLeadSearchText("")}>
                    <Ionicons name="close-circle" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>

              {leadsLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                  <ActivityIndicator color={COLORS.primary} size="large" />
                  <Text style={{ marginTop: 10, color: COLORS.textMuted, fontSize: 12, fontWeight: '600' }}>
                    Loading Leadsâ€¦
                  </Text>
                </View>
              ) : filteredLeads.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="alert-circle-outline" size={40} color="#cbd5e1" />
                  <Text style={{ marginTop: 12, color: '#64748b', fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
                    No leads found.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredLeads}
                  keyExtractor={(item) => item._id}
                  initialNumToRender={20}
                  maxToRenderPerBatch={20}
                  windowSize={7}
                  showsVerticalScrollIndicator={false}
                  renderItem={renderLeadItem}
                />
              )}
            </View>
          </View>
        </Modal>

      </KeyboardAvoidingView>
    </Modal>
  );
};
