import { usePayments } from '@/hooks/usePayments';
import { FIXED_LEDGERS, useVouchers } from '@/hooks/useVouchers';
import { COLORS, styles } from '@/styles/stylesIndex';
import { printAccountingVoucher } from '@/UtilServices/printVoucherHelper';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState, useCallback, useEffect } from 'react';
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
      ) : item.type === 'Lead' ? (
        <View style={{ width: 44, height: 44, borderRadius: 12, marginRight: 12, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="briefcase" size={20} color="#0284c7" />
        </View>
      ) : item.isBank ? (
        <View style={{ width: 44, height: 44, borderRadius: 12, marginRight: 12, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="business" size={20} color="#16a34a" />
        </View>
      ) : item.isPettyCash ? (
        <View style={{ width: 44, height: 44, borderRadius: 12, marginRight: 12, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="wallet" size={20} color="#d97706" />
        </View>
      ) : (
        <View style={{ width: 44, height: 44, borderRadius: 12, marginRight: 12, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="book" size={20} color="#64748b" />
        </View>
      )}

      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark }} numberOfLines={1}>
          {item.name}
          {item.enrollmentNo ? ` (${item.enrollmentNo})` : ''}
        </Text>
        <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }} numberOfLines={1}>
          {item.sub || item.type}
          {item.mobile ? ` • ${item.mobile}` : ''}
          {item.lastSite ? ` • Site: ${item.lastSite}` : ''}
        </Text>
      </View>

      {item.balance !== undefined && (
        <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: Number(item.balance) >= 0 ? '#059669' : '#dc2626' }}>
            ₹{Number(item.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          <Text style={{ fontSize: 9.5, color: '#94a3b8', fontStyle: 'italic', marginTop: 1 }}>
            {Number(item.balance) >= 0 ? 'Dr Bal' : 'Cr Bal'}
          </Text>
        </View>
      )}
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
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: '#f1f5f9',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}
  >
    <View style={{ flex: 1, paddingRight: 10 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark }}>
        {item.sender_name || `Client-${item.lead_no}`}
      </Text>
      <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
        Lead #{item.lead_no} • {item.product_name || 'Enquiry'}
      </Text>
    </View>
    <View style={{ alignItems: 'flex-end' }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.primary, backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
        {item.status || 'Active'}
      </Text>
    </View>
  </TouchableOpacity>
));

const formatDateToDDMMYYYY = (date: Date): string => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
};

const parseDDMMYYYYToDate = (dateStr: string): Date | null => {
  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      const d = new Date(year, month, day);
      if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
        return d;
      }
    }
  }
  return null;
};

interface VoucherEntryModalProps {
  visible: boolean;
  onClose: () => void;
  token: string;
  dbName?: string;
  locationId?: string;
  mode?: 'payment' | 'receipt' | 'bill_collection' | 'vendor_payment' | 'advance' | 'salary' | 'contra' | 'journal' | 'sales' | 'purchase' | 'expense';
  initialType?: "Payment" | "Receipt" | "Contra" | "Journal" | "Sales" | "Purchase";
  restrictToOwnPettyCash?: boolean;
}

export const VoucherEntryModal: React.FC<VoucherEntryModalProps> = ({
  visible,
  onClose,
  token,
  dbName,
  locationId,
  mode: propMode,
  initialType,
  restrictToOwnPettyCash = false,
}) => {
  const { user } = useUserContext();
  const { switchCorporate } = useAuthActions();
  const [corpSelectorVisible, setCorpSelectorVisible] = useState(false);
  const multipleCorporates = (user?.accessCorporate?.length ?? 0) > 1;

  const handleCorpSwitch = async (targetDbName: string) => {
    setCorpSelectorVisible(false);
    await switchCorporate(targetDbName);
  };

  const [mode, setMode] = useState<typeof propMode>(propMode);
  const [voucherNo, setVoucherNo] = useState<string>(() => Date.now().toString().slice(-4));

  useEffect(() => {
    setMode(propMode);
  }, [propMode]);

  const {
    voucher,
    updateEntry,
    addEntry,
    removeEntry,
    updateVoucher,
    resetVoucher,
    saveVoucher,
    saveLoading,
  } = useVouchers(token, dbName);

  const { leads, staff, leadsLoading, staffLoading, fetchLeadsForPicker } = usePayments(token, dbName);
  const [pettyCashBooks, setPettyCashBooks] = useState<any[]>([]);
  const [allWorkers, setAllWorkers] = useState<any[]>([]);
  const [accountingMaster, setAccountingMaster] = useState<{ groups: any[], ledgers: any[] } | null>(null);
  const [sundryDebtorLedgers, setSundryDebtorLedgers] = useState<any[]>([]);
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
              (l: any) => String(l.ledgerGroupId) === String(debtorGroup._id)
            )
          : [];
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

  const revenueAndSalesLedgers = useMemo(() => {
    if (!accountingMaster) {
      return [
        { id: 'sales_account', name: 'Sales Account', type: 'Category' as const, sub: 'Sales Accounts', isLedgerAccount: false },
        { id: 'service_revenue', name: 'Service Revenue', type: 'Category' as const, sub: 'Sales Accounts', isLedgerAccount: false },
      ];
    }
    const groups = accountingMaster.groups || [];
    const ledgers = accountingMaster.ledgers || [];

    const allowedGroupIds = groups
      .filter((g: any) => {
        const name = (g.groupName || '').toLowerCase();
        const nature = (g.nature || '').toLowerCase();
        return (
          nature === 'revenue' ||
          nature === 'income' ||
          name.includes('sales') ||
          name.includes('revenue') ||
          name.includes('direct income') ||
          name.includes('indirect income') ||
          name.includes('service') ||
          name.includes('turnover')
        );
      })
      .map((g: any) => String(g._id));

    const matchingLedgers = ledgers
      .filter(
        (l: any) =>
          allowedGroupIds.includes(String(l.ledgerGroupId)) ||
          (l.groupName || '').toLowerCase().includes('sales') ||
          (l.groupName || '').toLowerCase().includes('revenue') ||
          (l.groupName || '').toLowerCase().includes('income')
      )
      .map((l: any) => {
        const bal = l.currentBalance ?? l.openingBalance ?? 0;
        return {
          id: l._id,
          name: l.ledgerName,
          type: 'Category' as const,
          sub: l.groupName || 'Sales Accounts',
          isLedgerAccount: true,
          ledgerId: l._id,
          balance: bal,
        };
      });

    if (matchingLedgers.length === 0) {
      return [
        { id: 'sales_account', name: 'Sales Account', type: 'Category' as const, sub: 'Sales Accounts', isLedgerAccount: false },
        { id: 'service_revenue', name: 'Service Revenue', type: 'Category' as const, sub: 'Sales Accounts', isLedgerAccount: false },
      ];
    }
    return matchingLedgers;
  }, [accountingMaster]);

  const [dateText, setDateText] = useState(formatDateToDDMMYYYY(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);

  const getOwnPettyCashAccount = useCallback((books: any[] = pettyCashBooks) => {
    const userBook = books.find(
      (b) =>
        (b.refId && (String(b.refId) === String(user?.userId) || String(b.refId) === String(user?._id))) ||
        (b.name && user?.userDisplayName && b.name.toLowerCase().includes(user.userDisplayName.toLowerCase())) ||
        (b.name && user?.name && b.name.toLowerCase().includes(user.name.toLowerCase()))
    );
    if (userBook) {
      return {
        id: userBook._id,
        name: userBook.name,
        type: 'Category' as const,
        isBank: false,
      };
    }

    const masterPetty = (accountingMaster?.ledgers || []).find(
      (l: any) =>
        (l.refId && (String(l.refId) === String(user?.userId) || String(l.refId) === String(user?._id))) ||
        (l.ledgerName && user?.userDisplayName && l.ledgerName.toLowerCase().includes(user.userDisplayName.toLowerCase())) ||
        (l.ledgerName && user?.name && l.ledgerName.toLowerCase().includes(user.name.toLowerCase()))
    );
    if (masterPetty) {
      return {
        id: masterPetty._id,
        name: masterPetty.ledgerName,
        type: 'Category' as const,
        isBank: false,
      };
    }

    const displayName = user?.userDisplayName || user?.name || (user as any)?.username || 'Suresh Chauhan';
    return {
      id: 'cash_in_hand',
      name: displayName,
      type: 'Category' as const,
      isBank: false,
    };
  }, [pettyCashBooks, user, accountingMaster]);

  const applyModeTemplate = useCallback((currentMode?: string, preservedDate?: string) => {
    const keepDate = preservedDate || dateText;
    const effectiveDate = parseDDMMYYYYToDate(keepDate) || new Date();
    const ownPetty = getOwnPettyCashAccount();

    if (currentMode === 'receipt') {
      resetVoucher('Receipt', 'Received amount', effectiveDate);
      updateEntry('1', { accountId: ownPetty.id, accountName: ownPetty.name, accountType: 'Category', type: 'Dr', isBank: false });
      updateEntry('2', { accountId: '', accountName: '', accountType: 'Category', type: 'Cr' });
      return;
    }
    if (currentMode === 'bill_collection') {
      resetVoucher('Receipt', 'Received from client', effectiveDate);
      updateEntry('1', { accountId: ownPetty.id, accountName: ownPetty.name, accountType: 'Category', type: 'Dr', isBank: false });
      updateEntry('2', { accountId: '', accountName: '', accountType: 'Lead', type: 'Cr' });
      return;
    }
    if (currentMode === 'payment') {
      resetVoucher('Payment', 'Payment made', effectiveDate);
      updateEntry('1', { accountId: '', accountName: '', accountType: 'Category', type: 'Dr' });
      updateEntry('2', { accountId: ownPetty.id, accountName: ownPetty.name, accountType: 'Category', type: 'Cr', isBank: false });
      return;
    }
    if (currentMode === 'vendor_payment') {
      resetVoucher('Payment', 'Payment to vendor', effectiveDate);
      updateEntry('1', { accountId: '', accountName: '', accountType: 'Category', type: 'Dr' });
      updateEntry('2', { accountId: ownPetty.id, accountName: ownPetty.name, accountType: 'Category', type: 'Cr', isBank: false });
      return;
    }
    if (currentMode === 'salary') {
      resetVoucher('Payment', 'Salary paid to employee', effectiveDate);
      updateEntry('1', { accountId: '', accountName: '', accountType: 'Staff', type: 'Dr' });
      updateEntry('2', { accountId: ownPetty.id, accountName: ownPetty.name, accountType: 'Category', type: 'Cr', isBank: false });
      return;
    }
    if (currentMode === 'advance') {
      resetVoucher('Payment', 'Advance paid to employee', effectiveDate);
      updateEntry('1', { accountId: '', accountName: '', accountType: 'Staff', type: 'Dr' });
      updateEntry('2', { accountId: ownPetty.id, accountName: ownPetty.name, accountType: 'Category', type: 'Cr', isBank: false });
      return;
    }
    if (currentMode === 'expense') {
      resetVoucher('Payment', 'Office expense payment', effectiveDate);
      updateEntry('1', { accountId: '', accountName: '', accountType: 'Category', type: 'Dr' });
      updateEntry('2', { accountId: ownPetty.id, accountName: ownPetty.name, accountType: 'Category', type: 'Cr', isBank: false });
      return;
    }
    if (currentMode === 'contra') {
      resetVoucher('Contra', 'Cash transferred between accounts', effectiveDate);
      updateEntry('1', { accountId: 'main_bank', accountName: 'Main Bank Account', accountType: 'Category', type: 'Dr', isBank: true });
      updateEntry('2', { accountId: ownPetty.id, accountName: ownPetty.name, accountType: 'Category', type: 'Cr', isBank: false });
      return;
    }
    if (currentMode === 'sales') {
      resetVoucher('Sales', 'Sales invoice billing', effectiveDate);
      updateEntry('1', { accountId: '', accountName: '', accountType: 'Lead', type: 'Dr' });
      updateEntry('2', { accountId: '', accountName: '', accountType: 'Category', type: 'Cr' });
      return;
    }
    resetVoucher(initialType || 'Journal', 'Accounting adjustment entry', effectiveDate);
  }, [resetVoucher, initialType, dateText, getOwnPettyCashAccount, updateEntry]);

  useEffect(() => {
    if (visible) {
      setVoucherNo(Date.now().toString().slice(-4));
      fetchAccountingMaster();
      fetchLeadsForPicker();
      const current = propMode || 'payment';
      setMode(current);
      applyModeTemplate(current, dateText);

      appService.httpClient.get('/finance/petty-cash/summary')
        .then((res) => {
          if (res.data?.success && res.data.data?.books) {
            setPettyCashBooks(res.data.data.books);
          }
        })
        .catch((e) => console.log('Failed to load petty cash balances in VoucherEntryModal:', e));

      appService.httpClient.get('/service/hr/employees', { params: { all: 'true' } })
        .then((res) => {
          if (res.data?.success) {
            setAllWorkers(res.data.data || []);
          }
        })
        .catch((e) => console.log('Failed to load all employees in VoucherEntryModal:', e));
    }
  }, [visible, fetchAccountingMaster, fetchLeadsForPicker]);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [accountSearchText, setAccountSearchText] = useState('');
  const [leadPickerVisible, setLeadPickerVisible] = useState(false);
  const [leadSearchText, setLeadSearchText] = useState('');
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);

  const isAdminOrFinance = useMemo(() => {
    const role = (user?.userRole || (user as any)?.role || '').toLowerCase();
    return (
      role.includes('admin') ||
      role.includes('finance') ||
      role.includes('super') ||
      (user?.userRole as any) === 'SuperAdmin' ||
      user?.userRole === 'CorpAdmin'
    );
  }, [user]);

  const allAccounts = useMemo(() => {
    const leadAccs = leads.map((l) => ({
      id: l._id,
      name: l.sender_name || `Client-${l.lead_no}`,
      type: 'Lead' as const,
      sub: `Lead #${l.lead_no} (${l.status})`,
    }));

    const mergedEmployeesMap = new Map();
    allWorkers.forEach((w: any) => {
      mergedEmployeesMap.set(String(w._id), {
        _id: String(w._id),
        name: w.name,
        role: w.role || 'Worker',
        photo: w.photo || w.photo_url,
        enrollment_no: w.enrollment_no,
        mobile: w.mobile,
        last_site_name: w.last_site_name,
        last_attendance_date: w.last_attendance_date,
      });
    });
    staff.employees.forEach((e: any) => {
      mergedEmployeesMap.set(String(e._id), {
        ...mergedEmployeesMap.get(String(e._id)),
        ...e,
      });
    });

    const employeeAccs = Array.from(mergedEmployeesMap.values()).map((e) => {
      const ledger = (accountingMaster?.ledgers || []).find(
        (l: any) => l.refType === 'Staff' && String(l.refId) === String(e._id)
      );
      const isLedgerAccount = !!ledger;
      const ledgerId = ledger ? ledger._id : undefined;
      const balance = ledger ? (ledger.currentBalance ?? ledger.openingBalance ?? 0) : undefined;

      return {
        id: isLedgerAccount ? ledgerId : e._id,
        name: e.name,
        type: 'Staff' as const,
        sub: `Staff - ${e.role || 'Worker'}`,
        photo: e.photo,
        enrollmentNo: e.enrollment_no,
        mobile: e.mobile,
        lastSite: e.last_site_name || e.lastSite,
        isLedgerAccount,
        ledgerId,
        balance,
      };
    });

    const dynamicLedgerAccs = (accountingMaster?.ledgers || []).map((l: any) => {
      const isPetty = l.ledgerName?.toLowerCase().includes('petty cash') || l.groupName?.toLowerCase().includes('petty cash');
      const isBank = l.ledgerName?.toLowerCase().includes('bank') || l.groupName?.toLowerCase().includes('bank');
      const bal = l.currentBalance ?? l.openingBalance ?? 0;
      return {
        id: l._id,
        name: l.ledgerName,
        type: 'Category' as const,
        isRul: l.refType === 'RUL' || (l.ledgerName && l.ledgerName.toLowerCase().includes('(salary)')),
        sub: l.groupName || 'General Ledger',
        refId: l.refId,
        isPettyCash: isPetty,
        isBank,
        isActive: l.isActive !== false,
        allowCashFlow: l.allowCashFlow !== false,
        balance: bal,
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
  }, [leads, staff, pettyCashBooks, allWorkers, accountingMaster]);

  const filteredLeads = useMemo(() => {
    const eligible = leads.filter((l) => {
      const s = (l.status || '').toLowerCase().trim();
      return s === 'accepted' || s === 'tax invoice' || s === 'tax_invoice' || s === 'taxinvoice';
    });
    if (!leadSearchText.trim()) return eligible;
    const q = leadSearchText.toLowerCase();
    return eligible.filter(
      (l) =>
        (l.sender_name && l.sender_name.toLowerCase().includes(q)) ||
        (l.lead_no && String(l.lead_no).includes(q)) ||
        (l.product_name && l.product_name.toLowerCase().includes(q))
    );
  }, [leads, leadSearchText]);

  const billCollectionClientAccounts = useMemo(() => {
    if (sundryDebtorLedgers.length > 0) {
      return sundryDebtorLedgers.map((l: any) => {
        const bal = l.currentBalance ?? l.openingBalance ?? 0;
        const balStr = bal > 0 ? ` • Bal: ₹${bal.toLocaleString('en-IN')}` : '';
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

  const filteredAccounts = useMemo(() => {
    if (!activeEntryId) return allAccounts;
    const activeEntry = voucher.entries.find((e) => e.id === activeEntryId);
    if (!activeEntry) return allAccounts;

    const rowType = activeEntry.type;

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

    const getSortedBankCash = () => {
      const allowedIds = bankAndCashLedgers.map((l: any) => String(l._id));
      return allAccounts.filter((acc: any) => isActiveUserPettyCash(acc) || (!restrictToOwnPettyCash && (allowedIds.includes(String(acc.id)) || isGeneralBankOrCash(acc))));
    };

    if (mode === 'contra') {
      return getSortedBankCash();
    }

    if (mode === 'payment') {
      if (rowType === 'Dr') {
        return allAccounts.filter((acc: any) => !isEmployee(acc) && !isGeneralBankOrCash(acc));
      } else {
        return getSortedBankCash();
      }
    }

    if (mode === 'receipt') {
      if (rowType === 'Dr') {
        return getSortedBankCash();
      } else {
        return allAccounts.filter((acc: any) => !isEmployee(acc) && !isGeneralBankOrCash(acc));
      }
    }

    if (mode === 'sales') {
      if (rowType === 'Dr') {
        return billCollectionClientAccounts;
      } else {
        return revenueAndSalesLedgers;
      }
    }

    if (mode === 'bill_collection') {
      if (rowType === 'Dr') {
        return getSortedBankCash();
      } else {
        return billCollectionClientAccounts;
      }
    }

    if (mode === 'vendor_payment') {
      if (rowType === 'Dr') {
        return allAccounts.filter((acc: any) => acc.type === 'Lead' || acc.type === 'Category');
      } else {
        return getSortedBankCash();
      }
    }

    if (mode === 'salary' || mode === 'advance') {
      if (rowType === 'Dr') {
        if (restrictToOwnPettyCash && !isAdminOrFinance) {
          return allAccounts.filter((acc: any) => acc.type === 'Category' && acc.name?.toLowerCase().includes('salary payable'));
        }
        return allAccounts.filter((acc: any) => acc.type === 'Staff' || (acc as any).isRul);
      } else {
        return getSortedBankCash();
      }
    }

    if (mode === 'expense') {
      if (rowType === 'Dr') {
        return allAccounts.filter((acc: any) => !isEmployee(acc) && !isGeneralBankOrCash(acc));
      } else {
        return getSortedBankCash();
      }
    }

    return allAccounts;
  }, [activeEntryId, voucher.entries, allAccounts, mode, user, bankAndCashLedgers, revenueAndSalesLedgers, billCollectionClientAccounts, restrictToOwnPettyCash, isAdminOrFinance]);

  const searchFilteredAccounts = useMemo(() => {
    if (!accountSearchText.trim()) return filteredAccounts;
    const q = accountSearchText.toLowerCase();
    return filteredAccounts.filter(
      (a: any) =>
        a.name?.toLowerCase().includes(q) ||
        (a.sub && a.sub.toLowerCase().includes(q)) ||
        (a.enrollmentNo && String(a.enrollmentNo).toLowerCase().includes(q)) ||
        (a.mobile && String(a.mobile).includes(q))
    );
  }, [filteredAccounts, accountSearchText]);

  const handleOpenPicker = (entryId: string) => {
    setActiveEntryId(entryId);
    setAccountSearchText('');
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
        entryUpdates.leadId = acc.id;
        entryUpdates.leadName = acc.name;
        updateVoucher({ leadId: acc.id, leadName: acc.name });
      } else if (acc.isLedgerAccount && acc.leadId) {
        entryUpdates.leadId = acc.leadId;
        entryUpdates.leadName = acc.leadName || acc.name;
        updateVoucher({ leadId: acc.leadId, leadName: acc.leadName || acc.name });
      }

      if (mode === 'sales') {
        updateVoucher({ narration: `Sales billing to ${acc.name}` });
      } else if (mode === 'bill_collection') {
        updateVoucher({ narration: `Received bill collection from ${acc.name}` });
      } else if (mode === 'salary') {
        updateVoucher({ narration: `Salary disbursement to ${acc.name}` });
      }

      updateEntry(activeEntryId, entryUpdates);
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
    setLeadSearchText('');
  }, [mode, updateVoucher]);

  const renderAccountItem = useCallback(({ item }: { item: any }) => (
    <AccountItem item={item} onSelect={handleSelectAccount} />
  ), [handleSelectAccount]);

  const renderLeadItem = useCallback(({ item }: { item: any }) => (
    <LeadItem item={item} onSelect={handleSelectLead} />
  ), [handleSelectLead]);

  const handleDateTextChange = (text: string) => {
    let cleaned = text.replace(/[^0-9]/g, '');
    if (cleaned.length > 8) cleaned = cleaned.slice(0, 8);
    let formatted = cleaned;
    if (cleaned.length >= 5) {
      formatted = `${cleaned.slice(0, 2)}-${cleaned.slice(2, 4)}-${cleaned.slice(4)}`;
    } else if (cleaned.length >= 3) {
      formatted = `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`;
    }
    setDateText(formatted);
    const parsed = parseDDMMYYYYToDate(formatted);
    if (parsed) {
      updateVoucher({ date: parsed });
    }
  };

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
      } else if (mode === 'advance' || mode === 'salary' || mode === 'payment' || mode === 'expense' || mode === 'vendor_payment') {
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
      const hasStaffOrExpenseEntry = voucher.entries.some((entry) => {
        const matchedAcc = allAccounts.find((a: any) => a.id === entry.accountId);
        if ((matchedAcc as any)?.isRul) return false;

        if (entry.accountType === 'Staff' || matchedAcc?.type === 'Staff') return true;
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
        const voucherToPrint = {
          voucherNo: savedData?.voucherId || `V-${Math.floor(Math.random() * 10000)}`,
          date: formatDateToDDMMYYYY(voucher.date || parsedDate),
          type: type,
          narration: voucher.narration,
          totalAmount: voucher.totalDr,
          entries: voucher.entries.map((e) => ({
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
      applyModeTemplate(mode, dateText);
    } catch (err: any) {
      const detailedMsg = err.response?.data?.message || err.response?.data?.error || err.message;
      Alert.alert('Voucher Error', detailedMsg);
    }
  };

  const headerInfo = useMemo(() => {
    switch (mode) {
      case 'payment':
        return { title: 'Payment Voucher', subtitle: 'Dr All Ledgers • Cr Bank/Cash-in-Hand' };
      case 'receipt':
        return { title: 'Receipt Voucher', subtitle: 'Dr Bank/Cash-in-Hand • Cr All Ledgers' };
      case 'sales':
        return { title: 'Sales Voucher', subtitle: 'Dr Client (Sundry Debtors) • Cr Sales / Revenue Account' };
      case 'bill_collection':
        return { title: 'Client Receipt (Bill Collection)', subtitle: 'Dr Own Petty Cash / Bank • Cr Client (Accepted/Tax Invoice/Fully Paid)' };
      case 'vendor_payment':
        return { title: 'Vendor Payment', subtitle: 'Dr Vendor Account • Cr Bank/Cash' };
      case 'salary':
        return { title: 'Staff Payment (Salary)', subtitle: 'Dr Employee Ledger • Cr Bank/Cash' };
      case 'expense':
        return { title: 'Expense Voucher', subtitle: 'Dr Direct/Indirect Expense • Cr Bank/Cash' };
      case 'contra':
        return { title: 'Cash Transfer (Contra)', subtitle: 'Dr Bank/Cash (Receiver) • Cr Cash/Bank (Giver)' };
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: '#FCF8E8' }}
      >
        <View style={{ flex: 1, paddingTop: insets.top }}>
          {/* TOP BANNER */}
          <View style={{ height: 28, backgroundColor: '#1E4472', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10 }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>Accounting Voucher Creation</Text>
            <TouchableOpacity onPress={() => multipleCorporates && setCorpSelectorVisible(true)} style={{ paddingHorizontal: 6 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>{user?.corporateName || 'Pratham Services'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* HORIZONTAL MENU (MODES / VOUCHER TABS) */}
          <View style={{ backgroundColor: '#D1E4F9', borderBottomWidth: 1, borderBottomColor: '#ccc' }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 6, gap: 8 }}>
              {VOUCHER_TABS.map((tab) => {
                const active = mode === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => {
                      setMode(tab.key as any);
                      applyModeTemplate(tab.key, dateText);
                    }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 6,
                      borderRadius: 16,
                      backgroundColor: active ? '#386390' : '#fff',
                      borderWidth: 1,
                      borderColor: '#386390',
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: active ? '#fff' : '#1E4472' }}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* SUB BANNER */}
          <View style={{ height: 42, backgroundColor: '#386390', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ backgroundColor: '#1E4472', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 2 }}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>{headerInfo.title}</Text>
              </View>
              <Text style={{ color: '#fff', fontSize: 13, marginLeft: 10 }}>No.  {voucherNo}</Text>
            </View>
            <TouchableOpacity
              style={{ alignItems: 'flex-end', paddingHorizontal: 6, paddingVertical: 2 }}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>{dateText}</Text>
              <Text style={{ color: '#dbeafe', fontSize: 11 }}>
                {(parseDDMMYYYYToDate(dateText) || voucher.date || new Date()).toLocaleDateString('en-US', { weekday: 'long' })}
              </Text>
            </TouchableOpacity>
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={parseDDMMYYYYToDate(dateText) || new Date()}
              mode="date"
              display="default"
              onChange={(evt, selectedDate) => {
                setShowDatePicker(false);
                if (selectedDate) {
                  const formatted = formatDateToDDMMYYYY(selectedDate);
                  setDateText(formatted);
                  updateVoucher({ date: selectedDate });
                }
              }}
            />
          )}

          {/* MAIN VOUCHER WORK AREA */}
          <View style={{ flex: 1, backgroundColor: '#FCF8E8', padding: 12, justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              {/* Lead / Proj selection line */}
              {mode !== 'contra' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ fontSize: 14, color: '#000', fontWeight: 'bold' }}>Lead / Proj: </Text>
                  <TouchableOpacity
                    onPress={() => setLeadPickerVisible(true)}
                    style={{
                      borderBottomWidth: 1,
                      borderBottomColor: '#000',
                      flex: 1,
                      backgroundColor: '#FFF9D2',
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      minHeight: 24,
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 14, color: '#000', fontWeight: 'bold' }}>
                      {voucher.leadName || ''}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Grid Headers */}
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#ccc', paddingBottom: 4, marginBottom: 8 }}>
                <Text style={{ width: 40, fontSize: 14, fontWeight: 'bold', color: '#000', textAlign: 'center' }} />
                <Text style={{ flex: 1, fontSize: 14, fontWeight: 'bold', color: '#000', paddingLeft: 8 }}>Particulars</Text>
                <Text style={{ width: 120, fontSize: 14, fontWeight: 'bold', color: '#000', textAlign: 'right' }}>Amount</Text>
                {!mode && <Text style={{ width: 30 }} />}
              </View>

              {/* Entries List */}
              <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                {voucher.entries.map((entry) => {
                  const matchedAcc = allAccounts.find((a: any) => a.id === entry.accountId);
                  const displayBal = (matchedAcc as any)?.balance !== undefined ? `₹${Number((matchedAcc as any).balance).toLocaleString('en-IN')}` : '---';

                  return (
                    <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 }}>
                      <TouchableOpacity
                        onPress={() => !mode && updateEntry(entry.id, { type: entry.type === 'Dr' ? 'Cr' : 'Dr' })}
                        disabled={!!mode}
                        style={{ width: 40, alignItems: 'center', paddingTop: 2 }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#000' }}>
                          {entry.type === 'Dr' ? 'Dr.' : 'Cr.'}
                        </Text>
                      </TouchableOpacity>

                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <TouchableOpacity
                          onPress={() => handleOpenPicker(entry.id)}
                          style={{ borderBottomWidth: 1, borderBottomColor: '#000', paddingBottom: 2 }}
                        >
                          <Text style={{ fontSize: 14, color: entry.accountName ? '#000' : '#94a3b8', fontWeight: 'bold' }}>
                            {entry.accountName || ''}
                          </Text>
                        </TouchableOpacity>
                        <Text style={{ fontSize: 11, color: '#666', fontStyle: 'italic', marginTop: 2 }}>
                          Cur Bal: {entry.accountId ? displayBal : '---'}
                        </Text>
                      </View>

                      <View style={{ width: 120, marginLeft: 8, borderBottomWidth: 1, borderBottomColor: '#000', alignItems: 'flex-end', paddingTop: 2 }}>
                        <TextInput
                          style={{ fontSize: 14, color: '#000', fontWeight: 'bold', padding: 0, textAlign: 'right', width: '100%' }}
                          keyboardType="numeric"
                          value={entry.amount ? String(entry.amount) : ''}
                          placeholder=""
                          onChangeText={(v) => updateEntry(entry.id, { amount: Number(v.replace(/[^0-9]/g, '')) })}
                        />
                      </View>

                      {!mode && (
                        <TouchableOpacity onPress={() => removeEntry(entry.id)} style={{ width: 30, alignItems: 'center', paddingTop: 2 }}>
                          <Ionicons name="close" size={20} color="red" />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}

                {!mode && (
                  <TouchableOpacity style={{ marginTop: 8, padding: 8, alignSelf: 'flex-start' }} onPress={addEntry}>
                    <Text style={{ color: '#1E4472', fontSize: 13, fontWeight: 'bold' }}>+ Add Row</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            </View>

            {/* Bottom Narration & Totals */}
            <View style={{ borderTopWidth: 1, borderTopColor: '#ccc', paddingTop: 10, marginTop: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: '#000', fontWeight: 'bold' }}>Narration : </Text>
                <TextInput
                  style={{
                    flex: 1,
                    borderBottomWidth: 1,
                    borderBottomColor: '#000',
                    fontSize: 13,
                    color: '#000',
                    padding: 0,
                    marginLeft: 4,
                    fontStyle: 'italic',
                  }}
                  value={voucher.narration}
                  placeholder=""
                  onChangeText={(t) => updateVoucher({ narration: t })}
                />
              </View>

              {/* Totals */}
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 24 }}>
                <Text style={{ fontSize: 14, color: '#000', fontWeight: 'bold' }}>
                  Total Dr:  {voucher.totalDr || 0}
                </Text>
                <Text style={{ fontSize: 14, color: isBalanced ? '#000' : 'red', fontWeight: 'bold' }}>
                  Total Cr:  {voucher.totalCr || 0}
                </Text>
              </View>
            </View>
          </View>

          {/* BOTTOM BAR */}
          <View
            style={{
              backgroundColor: '#E2E8F0',
              borderTopWidth: 1,
              borderTopColor: '#ccc',
              paddingBottom: Platform.OS === 'android' ? Math.max(insets.bottom, 48) + 16 : Math.max(insets.bottom, 16),
            }}
          >
            <View style={{ height: 48, flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                style={{ flex: 1, height: '100%', justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderRightColor: '#ccc' }}
                onPress={onClose}
              >
                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#1E4472' }}>Q: Quit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, height: '100%', justifyContent: 'center', alignItems: 'center', borderRightWidth: 1, borderRightColor: '#ccc' }}
                onPress={() => handleSave(false)}
                disabled={saveLoading || !isBalanced}
              >
                <Text style={{ fontSize: 13, fontWeight: 'bold', color: (!isBalanced || saveLoading) ? '#94A3B8' : '#1E4472' }}>
                  {saveLoading ? 'Saving...' : 'A: Accept'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, height: '100%', justifyContent: 'center', alignItems: 'center' }}
                onPress={onClose}
              >
                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#1E4472' }}>X: Cancel Vch</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* --- Account Picker Modal --- */}
        <Modal
          visible={pickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => { setPickerVisible(false); setAccountSearchText(''); }}
          statusBarTranslucent
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.65)',
              justifyContent: 'center',
              paddingHorizontal: 16,
              paddingTop: Math.max(insets.top, 36) + 20,
              paddingBottom: Platform.OS === 'android' ? Math.max(insets.bottom, 48) + 20 : Math.max(insets.bottom, 20) + 20,
            }}
            onPress={() => { setPickerVisible(false); setAccountSearchText(''); }}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={{
                backgroundColor: '#fff',
                borderRadius: 24,
                padding: 18,
                maxHeight: '82%',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                elevation: 12,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.22,
                shadowRadius: 12,
              }}
              onPress={(e) => e.stopPropagation?.()}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.textDark, letterSpacing: -0.3 }}>
                    Select Particulars Account
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Ledgers & Accounts ({searchFilteredAccounts.length})
                  </Text>
                </View>
                <TouchableOpacity
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={() => { setPickerVisible(false); setAccountSearchText(''); }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: '#f1f5f9',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="close" size={20} color="#475569" />
                </TouchableOpacity>
              </View>

              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#f1f5f9',
                borderRadius: 10,
                paddingHorizontal: 12,
                height: 42,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: '#e2e8f0',
              }}>
                <Ionicons name="search" size={18} color="#64748b" />
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: '#0f172a', marginLeft: 8 }}
                  placeholder="Search ledger name or description..."
                  placeholderTextColor="#94a3b8"
                  value={accountSearchText}
                  onChangeText={setAccountSearchText}
                  autoCorrect={false}
                />
                {accountSearchText.length > 0 && (
                  <TouchableOpacity onPress={() => setAccountSearchText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>

              {(leadsLoading || staffLoading || ledgersLoading) && allAccounts.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                  <ActivityIndicator color={COLORS.primary} size="large" />
                  <Text style={{ marginTop: 10, color: COLORS.textMuted, fontSize: 12, fontWeight: '600' }}>
                    Loading Account Ledgers...
                  </Text>
                </View>
              ) : searchFilteredAccounts.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="alert-circle-outline" size={40} color="#cbd5e1" />
                  <Text style={{ marginTop: 12, color: '#64748b', fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
                    No eligible accounts found.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={searchFilteredAccounts}
                  keyExtractor={(item) => String(item.id)}
                  initialNumToRender={20}
                  maxToRenderPerBatch={20}
                  windowSize={7}
                  showsVerticalScrollIndicator={false}
                  renderItem={renderAccountItem}
                />
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* --- Lead Picker Modal --- */}
        <Modal
          visible={leadPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => { setLeadPickerVisible(false); setLeadSearchText(''); }}
          statusBarTranslucent
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.65)',
              justifyContent: 'center',
              paddingHorizontal: 16,
              paddingTop: Math.max(insets.top, 36) + 20,
              paddingBottom: Platform.OS === 'android' ? Math.max(insets.bottom, 48) + 20 : Math.max(insets.bottom, 20) + 20,
            }}
            onPress={() => { setLeadPickerVisible(false); setLeadSearchText(''); }}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={{
                backgroundColor: '#fff',
                borderRadius: 24,
                padding: 18,
                maxHeight: '82%',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                elevation: 12,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.22,
                shadowRadius: 12,
              }}
              onPress={(e) => e.stopPropagation?.()}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.textDark, letterSpacing: -0.3 }}>
                    Select Lead (Project)
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Accepted & Invoiced Projects ({filteredLeads.length})
                  </Text>
                </View>
                <TouchableOpacity
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  onPress={() => { setLeadPickerVisible(false); setLeadSearchText(''); }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: '#f1f5f9',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="close" size={20} color="#475569" />
                </TouchableOpacity>
              </View>

              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#f1f5f9',
                borderRadius: 10,
                paddingHorizontal: 12,
                height: 42,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: '#e2e8f0',
              }}>
                <Ionicons name="search" size={18} color="#64748b" />
                <TextInput
                  style={{ flex: 1, fontSize: 14, color: '#0f172a', marginLeft: 8 }}
                  placeholder="Search lead name or number..."
                  placeholderTextColor="#94a3b8"
                  value={leadSearchText}
                  onChangeText={setLeadSearchText}
                  autoCorrect={false}
                />
                {leadSearchText.length > 0 && (
                  <TouchableOpacity onPress={() => setLeadSearchText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>

              {leadsLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                  <ActivityIndicator color={COLORS.primary} size="large" />
                  <Text style={{ marginTop: 10, color: COLORS.textMuted, fontSize: 12, fontWeight: '600' }}>
                    Loading Leads...
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
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* --- Corporate Selection Modal --- */}
        <Modal
          visible={corpSelectorVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setCorpSelectorVisible(false)}
          statusBarTranslucent
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.65)',
              justifyContent: 'center',
              paddingHorizontal: 16,
              paddingTop: Math.max(insets.top, 36) + 20,
              paddingBottom: Platform.OS === 'android' ? Math.max(insets.bottom, 48) + 20 : Math.max(insets.bottom, 20) + 20,
            }}
            onPress={() => setCorpSelectorVisible(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              style={{
                backgroundColor: '#fff',
                borderRadius: 24,
                padding: 22,
                maxHeight: '82%',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                elevation: 12,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.22,
                shadowRadius: 12,
              }}
              onPress={(e) => e.stopPropagation?.()}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
                <View>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5 }}>Switch Business</Text>
                  <Text style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Select a corporate profile to view</Text>
                </View>
                <TouchableOpacity onPress={() => setCorpSelectorVisible(false)} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={28} color="#cbd5e1" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
                {(user?.accessCorporate || []).map((corp: any) => {
                  const isActive = corp.dbName === user?.dbName;
                  return (
                    <TouchableOpacity
                      key={corp._id || corp.dbName}
                      onPress={() => handleCorpSwitch(corp.dbName)}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20,
                        marginBottom: 12, borderWidth: 1.5,
                        borderColor: isActive ? COLORS.primary : '#f1f5f9',
                        backgroundColor: isActive ? COLORS.primary + '12' : '#f8fafc'
                      }}
                    >
                      {corp.CorpProfileImage ? (
                        <Image
                          source={{ uri: corp.CorpProfileImage }}
                          style={{ width: 48, height: 48, borderRadius: 12, marginRight: 16, backgroundColor: '#fff' } as any}
                        />
                      ) : (
                        <View style={{ width: 48, height: 48, borderRadius: 12, marginRight: 16, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' }}>
                          <Text style={{ color: COLORS.primary, fontWeight: '900', fontSize: 18 }}>
                            {(corp.corporateName || 'C').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>{corp.corporateName}</Text>
                        <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>PAN: {corp.corporatePAN}</Text>
                      </View>
                      {isActive
                        ? <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                        : <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                      }
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

      </KeyboardAvoidingView>
    </Modal>
  );
};

export default VoucherEntryModal;
