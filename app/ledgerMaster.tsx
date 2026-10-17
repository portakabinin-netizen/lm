import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useUserContext } from '@/context/AuthContext';
import { C, useTheme } from '@/hooks/Theme';
import { VoucherEntryModal } from '@/modal/VoucherEntryModal';
import { COLORS, styles as G } from '@/styles/stylesIndex';
import { appService } from '@/UtilServices/appHelper';
import { AppHeader, ErrorBanner, Field, SaveButton } from './Settingscomponents';

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

const account_Groups = [
  'Capital Account',
  'Loans (Liability)',
  'Current Liabilities',
  'Suspense Account',
  'Fixed Assets',
  'Investments',
  'Current Assets',
  'Branch / Divisions',
  'Misc. Expenses (Asset)',
  'Sales Accounts',
  'Purchase Accounts',
  'Direct Incomes',
  'Indirect Incomes',
  'Direct Expenses',
  'Indirect Expenses',
  'Provisions',
  'Bank Accounts',
  'Cash-in-hand',
  'Deposits (Asset)',
  'Loans & Advances (Asset)',
  'Stock-in-hand',
  'Sundry Debtors',
  'Sundry Creditors',
  'Duties & Taxes',
];

export default function LedgerMasterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { user } = useUserContext();
  const isDark = useColorScheme() === 'dark';
  const th = useTheme(isDark);

  // Identity
  const corporateId = user?.corporateId || '';

  // State: Data
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groups, setGroups] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);

  // State: Search & Tabs
  const [activeTab, setActiveTab] = useState<'ledger' | 'voucher'>('ledger');
  const [searchQuery, setSearchQuery] = useState('');

  // State: Create Group Form (Kept internal for support, though tab hidden)
  const [groupName, setGroupName] = useState<string | undefined>('');
  const [groupNature, setGroupNature] = useState('Asset');
  const [groupDescription, setGroupDescription] = useState<string | undefined>('');
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupSaved, setGroupSaved] = useState(false);

  // State: Create Ledger Form
  const [ledgerName, setLedgerName] = useState<string | undefined>('');
  const [selectedGroup, setSelectedGroup] = useState(account_Groups[0]);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [openingBalance, setOpeningBalance] = useState<string | undefined>('0');
  const [savingLedger, setSavingLedger] = useState(false);
  const filteredAccountGroups = useMemo(() => {
    const query = groupSearchQuery.trim().toLowerCase();
    if (!query) return account_Groups;
    return account_Groups.filter((g) => g.toLowerCase().includes(query));
  }, [groupSearchQuery]);
  const [ledgerSaved, setLedgerSaved] = useState(false);

  // Advanced Linking States for Ledger Create
  const [lookupResults, setLookupResults] = useState<any[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<any>(null);
  const [availablePOs, setAvailablePOs] = useState<any[]>([]);
  const [selectedPOs, setSelectedPOs] = useState<string[]>([]);
  const [searchingLookup, setSearchingLookup] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Record<string, boolean>>({});
  const [fetchingSuggestions, setFetchingSuggestions] = useState(false);

  // Visibility States
  const [createGroupModal, setCreateGroupModal] = useState(false);
  const [createLedgerModal, setCreateLedgerModal] = useState(false);
  const [createVoucherModal, setCreateVoucherModal] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [downloadingVoucherTemplate, setDownloadingVoucherTemplate] = useState(false);
  const [uploadingVoucherFile, setUploadingVoucherFile] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<{ type: 'ledger' | 'voucher'; data: any } | null>(
    null
  );

  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await appService.httpClient.get('finance/master', {
        params: { corporateId },
      });
      if (res.data?.success) {
        setGroups(res.data.data.groups || []);
        setLedgers(res.data.data.ledgers || []);
        if (res.data.data.groups?.length > 0 && !selectedGroup) {
          setSelectedGroup(res.data.data.groups[0].groupName);
        }
      }

      const vRes = await appService.httpClient.get('finance/vouchers');
      if (vRes.data?.success) {
        setVouchers(vRes.data.data || []);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load accounting data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [corporateId, selectedGroup]);

  useEffect(() => {
    fetchData();
  }, [corporateId, fetchData]);

  useEffect(() => {
    if (!loading || params.mode) {
      const mode = params.mode;
      if (mode === 'downloadTemplate') {
        handleDownloadVoucherTemplate();
      } else if (mode === 'uploadTemplate') {
        handleUploadVoucherFile();
      }
    }
  }, [loading, params.mode]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleDownloadVoucherTemplate = async () => {
    setDownloadingVoucherTemplate(true);
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const response = await appService.httpClient.get('finance/vouchers/bulk-template', {
          responseType: 'blob',
          headers: { Authorization: `Bearer ${user?.token ?? ''}` },
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'Voucher_Upload_Template.xlsx');
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const fileName = 'Voucher_Upload_Template.xlsx';
        const fileUri = FileSystem.documentDirectory + fileName;
        const downloadRes = await FileSystem.downloadAsync(
          `${appService.httpClient.defaults.baseURL}finance/vouchers/bulk-template`,
          fileUri,
          { headers: { Authorization: `Bearer ${user?.token ?? ''}` } }
        );
        if (downloadRes.status !== 200) {
          throw new Error(`Server returned status code: ${downloadRes.status}`);
        }
        await Sharing.shareAsync(downloadRes.uri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Share voucher template',
        });
      }
      appService.showToast('Voucher template downloaded successfully', 'Success');
    } catch (err: any) {
      appService.showToast(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          'Could not download voucher template',
        'Error'
      );
    } finally {
      setDownloadingVoucherTemplate(false);
    }
  };

  const handleUploadVoucherFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          '.xlsx',
          '.xls',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      setUploadingVoucherFile(true);

      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'android' ? file.uri : file.uri.replace('file://', ''),
        name: file.name,
        type: file.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      } as any);

      const res = await appService.httpClient.post('finance/vouchers/bulk-upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${user?.token ?? ''}`,
        },
      });

      appService.showToast(res?.data?.message || 'Vouchers uploaded successfully', 'Success');
      setUploadModalVisible(false);
      fetchData();
    } catch (err: any) {
      appService.showToast(
        err?.response?.data?.message ||
          err?.response?.data?.error ||
          'Failed to upload voucher file',
        'Error'
      );
    } finally {
      setUploadingVoucherFile(false);
    }
  };

  // --- Search Hook for Create Modal ---
  const handleEntitySearch = async (val: string) => {
    setLedgerName(val);
    if (val.length < 2) {
      setLookupResults([]);
      return;
    }

    const isDebtor = selectedGroup === 'Sundry Debtors';
    const isCreditor = selectedGroup === 'Sundry Creditors';
    if (!isDebtor && !isCreditor) return;

    setSearchingLookup(true);
    try {
      const endpoint = isDebtor
        ? 'finance/ledgers/lookup?type=Leads'
        : 'finance/ledgers/lookup?type=Vendors';
      const res = await appService.httpClient.get(endpoint, {
        params: { query: val, corporateId },
      });
      setLookupResults(res.data.data || []);
    } catch (err) {
      console.error('Lookup failed', err);
    } finally {
      setSearchingLookup(false);
    }
  };

  const handleSelectEntity = async (entity: any) => {
    setSelectedEntity(entity);
    setLedgerName(entity.sender_name || entity.name || entity.vendorName || '');
    setLookupResults([]);
    setSuggestions([]);
    setAcceptedSuggestions({});

    if (selectedGroup === 'Sundry Debtors') {
      setFetchingSuggestions(true);
      try {
        const res = await appService.httpClient.get(
          `finance/ledgers/lookup?type=Leads&leadId=${entity._id}`
        );
        const data = res.data.data || [];
        setSuggestions(data);
        // Pre-check all suggestions by default (Accept), they can uncheck to Ignore
        const initialChecks: Record<string, boolean> = {};
        data.forEach((s: any) => {
          initialChecks[s._id] = true;
        });
        setAcceptedSuggestions(initialChecks);
      } catch (err) {
        console.error('Suggestions lookup failed', err);
      } finally {
        setFetchingSuggestions(false);
      }
    } else if (selectedGroup === 'Sundry Creditors') {
      try {
        const res = await appService.httpClient.get(
          `finance/pos?vendorId=${entity._id}&corporateId=${corporateId}`
        );
        setAvailablePOs(res.data.data || []);
      } catch (err) {
        console.error('PO lookup failed', err);
      }
    }
  };

  const togglePOSelection = (poId: string) => {
    setSelectedPOs((prev) =>
      prev.includes(poId) ? prev.filter((id) => id !== poId) : [...prev, poId]
    );
  };

  const toggleSuggestionSelection = (id: string) => {
    setAcceptedSuggestions((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // --- Filtered Results for Main Search ---
  const filteredLedgers = useMemo(() => {
    if (!searchQuery) return ledgers;
    const q = searchQuery.toLowerCase();
    return ledgers.filter(
      (l) =>
        (l.ledgerName || '').toLowerCase().includes(q) ||
        (l.groupName || '').toLowerCase().includes(q)
    );
  }, [ledgers, searchQuery]);

  const filteredVouchers = useMemo(() => {
    const list = searchQuery
      ? vouchers.filter((v) => {
          const q = searchQuery.toLowerCase();
          return (
            (v.voucherNo || '').toLowerCase().includes(q) ||
            (v.voucherType || '').toLowerCase().includes(q) ||
            (v.narration || '').toLowerCase().includes(q)
          );
        })
      : [...vouchers];

    const getDay = (d: any) => {
      if (!d) return 0;
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return 0;
      return dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate();
    };

    const getVoucherNum = (vNo: any) => {
      if (!vNo) return 0;
      const m = String(vNo).match(/\d+/g);
      return m ? parseInt(m[m.length - 1], 10) : 0;
    };

    return list.sort((a, b) => {
      const dayA = getDay(a.date);
      const dayB = getDay(b.date);
      if (dayA !== dayB) return dayB - dayA;
      const numA = getVoucherNum(a.voucherNo);
      const numB = getVoucherNum(b.voucherNo);
      if (numA !== numB) return numB - numA;
      return String(b.voucherNo || '').localeCompare(String(a.voucherNo || ''));
    });
  }, [vouchers, searchQuery]);

  const handleSaveLedger = async () => {
    if (!ledgerName || !selectedGroup) {
      appService.showToast('Ledger name and group are required', 'Error');
      return;
    }
    setSavingLedger(true);
    setError(null);

    let payload: any = {
      corporateId,
      ledgerName,
      groupName: selectedGroup,
      openingBalance: parseFloat(openingBalance || '0'),
    };

    if (selectedGroup === 'Sundry Debtors' && selectedEntity) {
      payload.refId = selectedEntity._id;
      payload.refType = 'Lead';

      const confirmedIds = [selectedEntity._id];
      suggestions.forEach((s) => {
        if (acceptedSuggestions[s._id]) {
          confirmedIds.push(s._id);
        }
      });
      payload.leadIds = confirmedIds;
    } else if (selectedGroup === 'Sundry Creditors') {
      payload.refId = selectedEntity?._id;
      payload.refType = 'Vendor';
      payload.purchaseOrders = selectedPOs;
    }

    try {
      const res = await appService.httpClient.post('finance/ledgers', payload);
      if (res.data?.success) {
        setLedgerSaved(true);
        setLedgerName('');
        setOpeningBalance('0');
        setSelectedEntity(null);
        setSelectedPOs([]);
        setSuggestions([]);
        setAcceptedSuggestions({});
        setTimeout(() => {
          setLedgerSaved(false);
          setCreateLedgerModal(false);
        }, 1000);
        fetchData();
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save ledger');
    } finally {
      setSavingLedger(false);
    }
  };

  const bankLedgerIdSet = useMemo(() => {
    const bankGroupIds = new Set(
      groups
        .filter((g: any) => (g?.groupName || '').toLowerCase().includes('bank'))
        .map((g: any) => String(g._id))
    );
    const set = new Set<string>();
    set.add('main_bank');
    ledgers.forEach((l: any) => {
      const isBank =
        bankGroupIds.has(String(l.ledgerGroupId)) ||
        (l.ledgerName || '').toLowerCase().includes('bank') ||
        l.refType === 'Bank';
      if (isBank) {
        set.add(String(l._id));
      }
    });
    return set;
  }, [ledgers, groups]);

  const isBankEntry = useCallback(
    (ledgerId: string, ledgerName?: string) => {
      if (ledgerId && bankLedgerIdSet.has(String(ledgerId))) return true;
      const nameLower = (ledgerName || '').toLowerCase();
      return nameLower.includes('bank');
    },
    [bankLedgerIdSet]
  );

  const getContraType = useCallback(
    (v: any) => {
      if (v?.voucherType !== 'Contra') return null;
      const entries = v.entries || [];
      let drBank = false;
      let crBank = false;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if ((e.debit || 0) > 0 && isBankEntry(e.ledgerId, e.ledgerName)) drBank = true;
        if ((e.credit || 0) > 0 && isBankEntry(e.ledgerId, e.ledgerName)) crBank = true;
      }

      if (drBank && !crBank) return 'bank_deposit';
      if (!drBank && crBank) return 'bank_withdrawal';
      if (drBank && crBank) return 'bank_transfer';
      return 'cash_transfer';
    },
    [isBankEntry]
  );

  const handleDeleteItem = (type: 'ledger' | 'voucher', id: string, itemData?: any) => {
    if (type === 'voucher' && itemData) {
      // "only contra voucher needs to validated by counter party only for cash inloved, bank deposit and withdrwal can approved by any admin only."
      if (itemData.voucherType === 'Contra') {
        const contraType = getContraType(itemData);
        if (contraType === 'cash_transfer') {
          const isUnval =
            (itemData as any).validationStatus === 'Validated' || (itemData as any).isValidated === true
              ? false
              : (itemData as any).validationStatus === 'Unvalidated' ||
                (itemData as any).validationStatus === 'Pending' ||
                (itemData as any).isValidated === false ||
                (itemData as any).isCounterValidated === false ||
                (itemData as any).approvalPending === true;

          const isCounterApproved = !isUnval;
          if (isCounterApproved) {
            Alert.alert(
              'Cannot Delete Contra Voucher',
              'This Contra cash transfer has been validated by the counter party. Validated financial records are protected and cannot be deleted.'
            );
            return;
          }
        }
      }
    }

    Alert.alert(
      `Delete ${type === 'ledger' ? 'Ledger' : 'Voucher'}`,
      `Are you sure you want to delete this ${type}? This action is permanent.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const endpoint =
                type === 'ledger' ? `finance/ledgers/${id}` : `finance/vouchers/${id}`;
              const res = await appService.httpClient.delete(endpoint, {
                params: { corporateId },
              });
              if (res.data?.success) {
                appService.showToast('Deleted successfully', 'Success');
                fetchData();
              }
            } catch (err: any) {
              Alert.alert(
                'Delete Failed',
                err?.response?.data?.message ||
                  err?.response?.data?.error ||
                  'Could not delete item.'
              );
            }
          },
        },
      ]
    );
  };

  const handleValidateVoucher = (id: string, voucherNo: string, voucherData?: any) => {
    const isContra = voucherData?.voucherType === 'Contra';
    const contraType = isContra ? getContraType(voucherData) : null;
    const isBankContra = isContra && contraType !== 'cash_transfer';

    const title = isBankContra ? 'Admin Approve & Validate' : 'Counter-Validate Voucher';
    const msg = isBankContra
      ? `Are you sure you want to approve and validate bank transaction "${voucherNo}" as Admin?\n\nOnce approved, its amounts will be merged into ledger balances.`
      : `Are you sure you want to counter-validate voucher "${voucherNo}"?\n\nOnce validated, its amounts will be merged into the ledger balance calculation and deletion will be permanently locked.`;

    Alert.alert(
      title,
      msg,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isBankContra ? 'Approve & Validate' : 'Validate & Lock',
          onPress: async () => {
            try {
              const res = await appService.httpClient.post(`finance/vouchers/${id}/validate`, {
                corporateId,
              });
              if (res.data?.success) {
                appService.showToast(res.data?.message || 'Voucher validated & balances updated', 'Success');
                fetchData();
              }
            } catch (err: any) {
              Alert.alert(
                'Validation Failed',
                err?.response?.data?.message || err?.message || 'Could not validate voucher'
              );
            }
          },
        },
      ]
    );
  };

  const openEditModal = (type: 'ledger' | 'voucher', data: any) => {
    setEditingItem({ type, data });
    setEditModalVisible(true);
  };

  const handleUpdateItem = async (updatedData: any) => {
    if (!editingItem) return;
    try {
      const endpoint =
        editingItem.type === 'ledger'
          ? `finance/ledgers/${editingItem.data._id}`
          : `finance/vouchers/${editingItem.data._id}`;

      const res = await appService.httpClient.put(endpoint, {
        ...updatedData,
        corporateId,
      });

      if (res.data?.success) {
        appService.showToast('Updated successfully', 'Success');
        setEditModalVisible(false);
        fetchData();
      }
    } catch (err: any) {
      appService.showToast(
        err?.response?.data?.message || err?.response?.data?.error || 'Update failed',
        'Error'
      );
    }
  };

  if (loading) {
    return (
      <View style={[G.flex1, G.center, { backgroundColor: th.bg }]}>
        <ActivityIndicator size="large" color={C.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[G.flex1, { backgroundColor: th.bg }]} edges={['top']}>
      <AppHeader title="Ledger-Voucher Master" onBack={() => router.back()} />

      <View style={localStyles.tabContainer}>
        <TouchableOpacity
          onPress={() => {
            setActiveTab('ledger');
            setSearchQuery('');
          }}
          style={[
            localStyles.tabButton,
            { backgroundColor: activeTab === 'ledger' ? COLORS.primary : 'transparent' },
          ]}
        >
          <Text
            style={[localStyles.tabText, { color: activeTab === 'ledger' ? '#FFF' : '#475569' }]}
          >
            Ledgers
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setActiveTab('voucher');
            setSearchQuery('');
          }}
          style={[
            localStyles.tabButton,
            { backgroundColor: activeTab === 'voucher' ? COLORS.primary : 'transparent' },
          ]}
        >
          <Text
            style={[localStyles.tabText, { color: activeTab === 'voucher' ? '#FFF' : '#475569' }]}
          >
            Vouchers
          </Text>
        </TouchableOpacity>
      </View>

      {/* --- SEARCH BAR --- */}
      <View style={localStyles.searchContainer}>
        <TextInput
          placeholder={`Search ${activeTab === 'ledger' ? 'Ledgers' : 'Vouchers'}...`}
          placeholderTextColor={th.txtSec}
          style={localStyles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <Ionicons name="search" size={20} color={th.txtSec} />
      </View>

      {/* --- ACTION BUTTONS --- */}
      {activeTab === 'voucher' ? (
        <TouchableOpacity onPress={() => setCreateVoucherModal(true)} style={localStyles.addButton}>
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={localStyles.addButtonText}>Create Voucher</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => {
            setLedgerName('');
            setOpeningBalance('0');
            setCreateLedgerModal(true);
          }}
          style={localStyles.addButton}
        >
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={localStyles.addButtonText}>Create Ledger</Text>
        </TouchableOpacity>
      )}

      {activeTab === 'ledger' ? (
        <FlatList
          data={filteredLedgers}
          keyExtractor={(l, idx) => l._id || String(idx)}
          contentContainerStyle={{ paddingBottom: 60 }}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
          }
          ListHeaderComponent={<ErrorBanner message={error} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Ionicons name="book-outline" size={64} color="#CBD5E1" />
              <Text style={{ color: th.txtSec, marginTop: 12, fontSize: 15 }}>
                No Ledgers Found
              </Text>
            </View>
          }
          renderItem={({ item: l, index: idx }) => {
            const hasBalance = Math.abs(l.currentBalance ?? 0) > 0;
            return (
              <Swipeable
                renderRightActions={() => (
                  <View style={localStyles.actionsContainer}>
                    <TouchableOpacity
                      onPress={() => openEditModal('ledger', l)}
                      style={[localStyles.actionButton, { backgroundColor: COLORS.primary }]}
                    >
                      <Ionicons name="create" size={22} color="#fff" />
                    </TouchableOpacity>
                    {!l.isDefault && (
                      <TouchableOpacity
                        onPress={() => handleDeleteItem('ledger', l._id)}
                        disabled={hasBalance}
                        style={[
                          localStyles.actionButton,
                          {
                            backgroundColor: hasBalance ? '#F87171' : 'red',
                            opacity: hasBalance ? 0.5 : 1,
                          },
                        ]}
                      >
                        <Ionicons name="trash" size={22} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              >
                <View
                  style={[
                    localStyles.card,
                    { backgroundColor: th.card, borderColor: th.border, borderWidth: 1 },
                  ]}
                >
                  <View style={localStyles.cardContent}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={[localStyles.cardTitle, { color: th.txt }]}>
                        {l.ledgerName}
                      </Text>
                      {l.leadIds?.length > 0 && (
                        <Ionicons
                          name="link"
                          size={14}
                          color={C.primary}
                          style={{ marginLeft: 8 }}
                        />
                      )}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <Text style={[localStyles.cardSubtitle, { color: th.txtSec }]}>
                        {l.groupName}
                      </Text>
                      <Text
                        style={[
                          localStyles.cardSubtitle,
                          {
                            fontWeight: '700',
                            color: (l.currentBalance ?? 0) >= 0 ? '#10B981' : '#EF4444',
                            marginLeft: 12,
                          },
                        ]}
                      >
                        Bal: ₹
                        {Math.abs(l.currentBalance ?? l.openingBalance ?? 0).toLocaleString(
                          'en-IN'
                        )}{' '}
                        {(l.currentBalance ?? 0) >= 0 ? 'Dr' : 'Cr'}
                      </Text>
                    </View>
                  </View>
                </View>
              </Swipeable>
            );
          }}
        />
      ) : (
        <FlatList
          data={filteredVouchers}
          keyExtractor={(v, idx) => v._id || String(idx)}
          contentContainerStyle={{ paddingBottom: 60 }}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />
          }
          ListHeaderComponent={<ErrorBanner message={error} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Ionicons name="receipt-outline" size={64} color="#CBD5E1" />
              <Text style={{ color: th.txtSec, marginTop: 12, fontSize: 15 }}>
                No Vouchers Found
              </Text>
            </View>
          }
          renderItem={({ item: v, index: idx }) => {
            let drAmount = 0;
            let crAmount = 0;
            const drList: string[] = [];
            const crList: string[] = [];
            const entries = v.entries || [];
            for (let i = 0; i < entries.length; i++) {
              const e = entries[i];
              if (e.debit > 0) {
                drAmount += e.debit || 0;
                if (e.ledgerName) drList.push(e.ledgerName);
              }
              if (e.credit > 0) {
                crAmount += e.credit || 0;
                if (e.ledgerName) crList.push(e.ledgerName);
              }
            }
            const totalAmount = drAmount || crAmount || 0;
            const drNames = drList.join(', ');
            const crNames = crList.join(', ');

            const isUnvalidated =
              (v as any).validationStatus === 'Validated' || (v as any).isValidated === true
                ? false
                : (v as any).validationStatus === 'Unvalidated' ||
                  (v as any).validationStatus === 'Pending' ||
                  (v as any).isValidated === false ||
                  (v as any).isCounterValidated === false ||
                  (v as any).approvalPending === true;

            const isContra = v.voucherType === 'Contra';
            const contraType = isContra ? getContraType(v) : null;
            const isCashContra = isContra && contraType === 'cash_transfer';

            // Only Contra cash transfers with counter-approval are locked from deletion
            const isCounterApproved = !isUnvalidated;
            const isDeleteLocked = isCashContra && isCounterApproved;
            const showValidateBtn = isUnvalidated;

            const vDateStr = v.date ? new Date(v.date).toDateString() : '';
            const eDateStr = (v as any).entryDate
              ? new Date((v as any).entryDate).toDateString()
              : (v as any).createdAt
              ? new Date((v as any).createdAt).toDateString()
              : '';
            const isBackdated =
              (v as any).isBackdated || (Boolean(vDateStr && eDateStr) && vDateStr !== eDateStr);

            return (
              <Swipeable
                renderRightActions={() => (
                  <View style={[localStyles.actionsContainer, { width: showValidateBtn ? 210 : 140, marginBottom: 6 }]}>
                    {showValidateBtn && (
                      <TouchableOpacity
                        onPress={() => handleValidateVoucher(v._id, v.voucherNo, v)}
                        style={[localStyles.actionButton, { backgroundColor: '#10B981' }]}
                      >
                        <Ionicons name="checkmark-done" size={22} color="#fff" />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => openEditModal('voucher', v)}
                      style={[localStyles.actionButton, { backgroundColor: COLORS.primary }]}
                    >
                      <Ionicons name="create" size={22} color="#fff" />
                    </TouchableOpacity>
                    {!isDeleteLocked ? (
                      <TouchableOpacity
                        onPress={() => handleDeleteItem('voucher', v._id, v)}
                        style={[localStyles.actionButton, { backgroundColor: 'red' }]}
                      >
                        <Ionicons name="trash" size={22} color="#fff" />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() =>
                          Alert.alert(
                            'Cannot Delete Contra Voucher',
                            'This Contra cash transfer has been validated by the counter party. Validated financial records are protected and cannot be deleted.'
                          )
                        }
                        style={[localStyles.actionButton, { backgroundColor: '#64748B' }]}
                      >
                        <Ionicons name="lock-closed" size={20} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              >
                <View
                  style={[
                    localStyles.card,
                    {
                      paddingVertical: 9,
                      paddingHorizontal: 12,
                      marginBottom: 6,
                      backgroundColor: isUnvalidated ? (isDark ? '#261C02' : '#FFFBEB') : th.card,
                      borderColor: isUnvalidated ? '#F59E0B' : th.border,
                      borderWidth: 1,
                      borderLeftWidth: isUnvalidated ? 4 : 1,
                      borderLeftColor: isUnvalidated ? '#F59E0B' : th.border,
                    },
                  ]}
                >
                  <View style={localStyles.cardContent}>
                    {/* Line 1: Voucher No, Voucher Type, Date and Backend Badge in single line */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 6 }}>
                        <Text style={[localStyles.cardTitle, { color: th.txt, fontSize: 13.5, fontWeight: '700' }]} numberOfLines={1}>
                          {v.voucherNo}
                        </Text>
                        <View
                          style={{
                            backgroundColor: C.primary + '18',
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            borderRadius: 4,
                          }}
                        >
                          <Text style={{ color: C.primary, fontSize: 10, fontWeight: '700' }}>
                            {v.voucherType}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, color: th.txtSec }}>
                          {appService.formatDate(v.date)}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 6 }}>
                        {isBackdated && (
                          <View
                            style={{
                              backgroundColor: '#EDE9FE',
                              paddingHorizontal: 5,
                              paddingVertical: 1,
                              borderRadius: 4,
                              borderWidth: 0.5,
                              borderColor: '#DDD6FE',
                            }}
                          >
                            <Text style={{ color: '#6D28D9', fontSize: 9.5, fontWeight: '800' }}>
                              ⏳ BACKDATED
                            </Text>
                          </View>
                        )}
                        {isUnvalidated && (
                          <View
                            style={{
                              backgroundColor: '#FEF3C7',
                              paddingHorizontal: 5,
                              paddingVertical: 1,
                              borderRadius: 4,
                              borderWidth: 0.5,
                              borderColor: '#FDE68A',
                            }}
                          >
                            <Text style={{ color: '#D97706', fontSize: 9.5, fontWeight: '800' }}>
                              ⚠️ UNVALIDATED
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Line 2: Dr. Ledger Name Amount, Cr Ledger Name, Amount (Wrapped to show full ledger names) */}
                    <View style={{ marginTop: 3 }}>
                      <Text style={{ fontSize: 11.5, color: th.txt, lineHeight: 16 }}>
                        <Text style={{ fontWeight: '700', color: '#10B981' }}>Dr. </Text>
                        <Text>{drNames || 'None'} </Text>
                        <Text style={{ fontWeight: '700', color: isDark ? '#34D399' : '#059669' }}>₹{drAmount.toLocaleString('en-IN')}</Text>
                        <Text style={{ color: th.txtSec, fontWeight: '600' }}>, </Text>
                        <Text style={{ fontWeight: '700', color: '#EF4444' }}>Cr. </Text>
                        <Text>{crNames || 'None'} </Text>
                        <Text style={{ fontWeight: '700', color: isDark ? '#F87171' : '#DC2626' }}>₹{crAmount.toLocaleString('en-IN')}</Text>
                      </Text>
                    </View>

                    {/* Line 3: Narration */}
                    {v.narration ? (
                      <Text
                        style={{ fontSize: 11, color: th.txtSec, marginTop: 2, fontStyle: 'italic', lineHeight: 15 }}
                      >
                        {v.narration.startsWith('"') ? v.narration : `"${v.narration}"`}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Swipeable>
            );
          }}
        />
      )}

      <Modal visible={uploadModalVisible} transparent animationType="slide">
        <View style={localStyles.modalContainer}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ width: '100%' }}
          >
            <View style={[localStyles.modalContent, { backgroundColor: th.card }]}>
              <View style={localStyles.modalHeader}>
                <Text style={[localStyles.modalTitle, { color: th.txt }]}>
                  Upload Sales & Salary Vouchers
                </Text>
                <TouchableOpacity onPress={() => setUploadModalVisible(false)}>
                  <Ionicons name="close-circle" size={30} color={th.txtSec} />
                </TouchableOpacity>
              </View>

              <Text style={[G.fs13, G.bold700, G.mb10, { color: th.txtSec }]}>
                Use the template below to upload:
              </Text>
              <View
                style={[
                  localStyles.infoBox,
                  { backgroundColor: th.inputBg, borderColor: th.border },
                ]}
              >
                <Text style={{ color: th.txt, fontSize: 13, lineHeight: 20 }}>
                  {'• Sales vouchers: debit client ledger and credit sales ledger\n'}
                  {
                    '• Salary vouchers: debit salary expense ledger and credit worker/employee ledger\n'
                  }
                  {'• Keep voucher numbers consistent so rows are grouped into one voucher.'}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleDownloadVoucherTemplate}
                style={[localStyles.secondaryButton, { borderColor: C.primary }]}
                disabled={downloadingVoucherTemplate}
              >
                {downloadingVoucherTemplate ? (
                  <ActivityIndicator size="small" color={C.primary} />
                ) : (
                  <Text style={[localStyles.secondaryButtonText, { color: C.primary }]}>
                    Download Sales & Salary Template
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleUploadVoucherFile}
                style={[localStyles.primaryButton, { backgroundColor: C.primary }]}
                disabled={uploadingVoucherFile}
              >
                {uploadingVoucherFile ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={localStyles.primaryButtonText}>Upload Excel File</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* --- CREATE LEDGER MODAL --- */}
      <Modal visible={createLedgerModal} transparent animationType="slide">
        <View style={localStyles.modalContainer}>
          <KeyboardAvoidingView
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
            style={{ flex: 1, width: '100%' }}
          >
            <View style={[localStyles.modalContent, { backgroundColor: th.card }]}>
              <View style={localStyles.modalHeader}>
                <View>
                  <Text style={[localStyles.modalTitle, { color: th.txt }]}>Create Ledger</Text>
                  <Text style={[localStyles.modalSubtitle, { color: th.txtSec }]}>
                    Fast setup with lookup and group selection
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setCreateLedgerModal(false)}>
                  <Ionicons name="close-circle" size={30} color={th.txtSec} />
                </TouchableOpacity>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
                contentContainerStyle={{ paddingBottom: 24 }}
              >
                <View
                  style={[
                    localStyles.sectionCard,
                    { backgroundColor: th.inputBg, borderColor: th.border },
                  ]}
                >
                  <Text style={[localStyles.sectionLabel, { color: th.txtSec }]}>Group</Text>
                  <TextInput
                    placeholder="Search group..."
                    placeholderTextColor={th.txtSec}
                    value={groupSearchQuery}
                    onChangeText={setGroupSearchQuery}
                    style={[localStyles.inputField, { color: th.txt, backgroundColor: th.card }]}
                  />
                  <View style={localStyles.selectedRow}>
                    <Text style={[localStyles.smallText, { color: th.txtSec }]}>Selected:</Text>
                    <View style={[localStyles.groupPill, { backgroundColor: th.card }]}>
                      <Text style={[localStyles.listItemTitle, { color: th.txt }]}>
                        {selectedGroup}
                      </Text>
                    </View>
                  </View>
                  <View style={localStyles.groupOptions}>
                    {filteredAccountGroups.slice(0, 6).map((groupName) => (
                      <TouchableOpacity
                        key={groupName}
                        onPress={() => {
                          setSelectedGroup(groupName);
                          setGroupSearchQuery('');
                          setSelectedEntity(null);
                          setLookupResults([]);
                        }}
                        style={[
                          localStyles.groupSelectItem,
                          selectedGroup === groupName && { borderColor: C.primary, borderWidth: 1 },
                        ]}
                      >
                        <Text style={[localStyles.listItemTitle, { color: th.txt }]}>
                          {groupName}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View
                  style={[
                    localStyles.sectionCard,
                    { backgroundColor: th.card, borderColor: th.border },
                  ]}
                >
                  <Text style={[localStyles.sectionLabel, { color: th.txtSec }]}>
                    Name & Lookup
                  </Text>
                  <TextInput
                    placeholder={
                      selectedGroup === 'Sundry Debtors'
                        ? 'Search Leads...'
                        : selectedGroup === 'Sundry Creditors'
                          ? 'Search Vendors...'
                          : 'Enter Name...'
                    }
                    placeholderTextColor={th.txtSec}
                    style={[localStyles.inputField, { color: th.txt, backgroundColor: th.inputBg }]}
                    value={ledgerName ?? ''}
                    onChangeText={(val) => handleEntitySearch(val)}
                  />
                  {searchingLookup && (
                    <View style={localStyles.indicatorRow}>
                      <ActivityIndicator size="small" color={C.primary} />
                      <Text style={[localStyles.indicatorText, { color: th.txtSec }]}>
                        Searching...
                      </Text>
                    </View>
                  )}
                </View>

                {lookupResults.length > 0 && (
                  <View
                    style={[
                      localStyles.sectionCard,
                      { backgroundColor: th.card, borderColor: th.border },
                    ]}
                  >
                    <Text style={[localStyles.sectionLabel, { color: th.txtSec }]}>
                      Choose Match
                    </Text>
                    <FlatList
                      data={lookupResults}
                      keyExtractor={(item) => item._id}
                      style={{ maxHeight: 170 }}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          onPress={() => handleSelectEntity(item)}
                          style={[localStyles.listItem, { borderBottomColor: th.border }]}
                        >
                          <Text style={[localStyles.listItemTitle, { color: th.txt }]}>
                            {item.sender_name || item.name || item.vendorName}
                          </Text>
                          <Text style={[localStyles.listItemSubtitle, { color: th.txtSec }]}>
                            {item.sender_city || item.contactPerson || 'Lookup Match'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    />
                  </View>
                )}

                {selectedGroup === 'Sundry Creditors' &&
                  selectedEntity &&
                  availablePOs.length > 0 && (
                    <View
                      style={[
                        localStyles.sectionCard,
                        { backgroundColor: th.inputBg, borderColor: th.border },
                      ]}
                    >
                      <Text style={[localStyles.sectionLabel, { color: th.txtSec }]}>
                        Link Purchase Orders
                      </Text>
                      {availablePOs.map((po) => (
                        <TouchableOpacity
                          key={po._id}
                          onPress={() => togglePOSelection(po._id)}
                          style={[localStyles.optionRow, { backgroundColor: th.card }]}
                        >
                          <Ionicons
                            name={selectedPOs.includes(po._id) ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={C.primary}
                          />
                          <View style={G.ml10}>
                            <Text style={[localStyles.listItemTitle, { color: th.txt }]}>
                              {po.po_number || 'PO-UNSET'}
                            </Text>
                            <Text style={[localStyles.listItemSubtitle, { color: th.txtSec }]}>
                              Lead: {po.lead_no} | Total: ₹{po.totals?.grand_total || 0}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                {selectedGroup === 'Sundry Debtors' && selectedEntity && suggestions.length > 0 && (
                  <View
                    style={[
                      localStyles.sectionCard,
                      { backgroundColor: th.inputBg, borderColor: th.border },
                    ]}
                  >
                    <Text style={[localStyles.sectionLabel, { color: th.txtSec }]}>
                      Link Suggestions
                    </Text>
                    <Text style={[localStyles.smallText, { color: th.txtSec }]}>
                      We found leads matching this client's mobile or location.
                    </Text>
                    {suggestions.map((sug) => {
                      const isChecked = !!acceptedSuggestions[sug._id];
                      return (
                        <TouchableOpacity
                          key={sug._id}
                          onPress={() => toggleSuggestionSelection(sug._id)}
                          style={[localStyles.optionRow, { backgroundColor: th.card }]}
                        >
                          <Ionicons
                            name={isChecked ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={C.primary}
                          />
                          <View style={[G.ml10, G.flex1]}>
                            <Text style={[localStyles.listItemTitle, { color: th.txt }]}>
                              {sug.sender_name || `Client-${sug.lead_no}`}
                            </Text>
                            <Text style={[localStyles.listItemSubtitle, { color: th.txtSec }]}>
                              Lead #{sug.lead_no} | {sug.matchReason}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <View
                  style={[
                    localStyles.sectionCard,
                    { backgroundColor: th.inputBg, borderColor: th.border },
                  ]}
                >
                  <Text style={[localStyles.sectionLabel, { color: th.txtSec }]}>
                    Opening Balance
                  </Text>
                  <Field
                    label=""
                    value={openingBalance}
                    onChange={setOpeningBalance}
                    th={th}
                    keyboardType="numeric"
                  />
                </View>
              </ScrollView>
              <View
                style={[
                  localStyles.modalFooter,
                  { borderTopColor: th.border, backgroundColor: th.card },
                ]}
              >
                <SaveButton
                  onPress={handleSaveLedger}
                  saving={savingLedger}
                  saved={ledgerSaved}
                  label={selectedEntity ? 'Create Linked Ledger' : 'Create ledger folio'}
                />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <VoucherEntryModal
        visible={createVoucherModal}
        onClose={() => {
          setCreateVoucherModal(false);
          fetchData();
        }}
        token={user?.token || ''}
        dbName={user?.dbName || ''}
      />

      {/* --- EDIT MODAL --- */}
      <Modal visible={editModalVisible} transparent animationType="slide">
        <View style={localStyles.modalContainer}>
          <KeyboardAvoidingView
            behavior="padding"
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}
            style={{ flex: 1, width: '100%' }}
          >
            <View style={[localStyles.modalContent, { backgroundColor: th.card }]}>
              <View style={localStyles.modalHeader}>
                <Text style={[localStyles.modalTitle, { color: th.txt }]}>
                  Edit {editingItem?.type === 'ledger' ? 'Ledger' : 'Voucher'}
                </Text>
                <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                  <Ionicons name="close-circle" size={30} color={th.txtSec} />
                </TouchableOpacity>
              </View>

              {editingItem?.type === 'ledger' ? (
                <LedgerEditForm data={editingItem.data} onSave={handleUpdateItem} th={th} />
              ) : (
                <VoucherEditForm
                  data={editingItem?.data}
                  ledgers={ledgers}
                  onSave={handleUpdateItem}
                  th={th}
                />
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Internal Edit Components
const LedgerEditForm = ({ data, onSave, th }: any) => {
  const [name, setName] = useState<string | undefined>(data.ledgerName);
  const [group, setGroup] = useState(data.groupName);
  const [bal, setBal] = useState<string | undefined>(String(data.openingBalance));
  const [groupSearchQuery, setGroupSearchQuery] = useState('');

  const filteredGroups = useMemo(() => {
    const query = groupSearchQuery.trim().toLowerCase();
    if (!query) return account_Groups;
    return account_Groups.filter((g) => g.toLowerCase().includes(query));
  }, [groupSearchQuery]);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={true}
      contentContainerStyle={{ paddingBottom: 20 }}
    >
      <View
        style={[localStyles.sectionCard, { backgroundColor: th.inputBg, borderColor: th.border }]}
      >
        <Text style={[localStyles.sectionLabel, { color: th.txtSec }]}>Ledger Name</Text>
        <Field label="" value={name} onChange={setName} th={th} />
      </View>

      <View style={[localStyles.sectionCard, { backgroundColor: th.card, borderColor: th.border }]}>
        <Text style={[localStyles.sectionLabel, { color: th.txtSec }]}>Associated Group</Text>
        <TextInput
          placeholder="Search group..."
          placeholderTextColor={th.txtSec}
          value={groupSearchQuery}
          onChangeText={setGroupSearchQuery}
          style={[localStyles.inputField, { color: th.txt, backgroundColor: th.inputBg }]}
        />
        <View
          style={[localStyles.selectField, { borderColor: th.border, backgroundColor: th.inputBg }]}
        >
          <Picker selectedValue={group} onValueChange={setGroup} style={{ color: th.txt }}>
            {filteredGroups.map((g: string, i: number) => (
              <Picker.Item key={i} label={g} value={g} color={th.isDark ? '#FFF' : '#000'} />
            ))}
          </Picker>
        </View>
      </View>

      <View
        style={[localStyles.sectionCard, { backgroundColor: th.inputBg, borderColor: th.border }]}
      >
        <Text style={[localStyles.sectionLabel, { color: th.txtSec }]}>Opening Balance</Text>
        <Field label="" value={bal} onChange={setBal} th={th} keyboardType="numeric" />
      </View>

      <View style={{ marginTop: 12 }}>
        <SaveButton
          onPress={() =>
            onSave({ ledgerName: name, groupName: group, openingBalance: parseFloat(bal || '0') })
          }
          saving={false}
          saved={false}
          label="Update Ledger"
        />
      </View>
    </ScrollView>
  );
};

const VoucherEditForm = ({ data, ledgers, onSave, th }: any) => {
  const [dateText, setDateText] = useState(formatDateToDDMMYYYY(new Date(data.date)));
  const [narration, setNarration] = useState(data.narration || '');
  const [entries, setEntries] = useState<any[]>(
    (data.entries || []).map((e: any) => ({
      id: e._id || Math.random().toString(36).substr(2, 9),
      ledgerId: e.ledgerId,
      ledgerName: e.ledgerName,
      debit: e.debit || 0,
      credit: e.credit || 0,
      accountType: e.accountType || 'Category',
    }))
  );

  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState('');

  const totalDebit = entries.reduce((sum, e) => sum + (Number(e.debit) || 0), 0);
  const totalCredit = entries.reduce((sum, e) => sum + (Number(e.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const filteredLedgers = useMemo(() => {
    if (!ledgerSearchQuery.trim()) return ledgers;
    const q = ledgerSearchQuery.toLowerCase();
    return ledgers.filter((l: any) => l.ledgerName && l.ledgerName.toLowerCase().includes(q));
  }, [ledgers, ledgerSearchQuery]);

  const handleSelectLedger = (ledger: any) => {
    if (activeRowId) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === activeRowId
            ? {
                ...e,
                ledgerId: ledger._id,
                ledgerName: ledger.ledgerName,
                accountType: ledger.refType || 'Category',
              }
            : e
        )
      );
    }
    setPickerVisible(false);
    setActiveRowId(null);
  };

  const handleAddRow = () => {
    setEntries((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        ledgerId: '',
        ledgerName: '',
        debit: 0,
        credit: 0,
        accountType: 'Category',
      },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    if (entries.length <= 2) {
      Alert.alert('Error', 'A voucher must have at least 2 entries.');
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleUpdateEntry = (id: string, field: 'debit' | 'credit', val: string) => {
    const num = Number(val.replace(/[^0-9.]/g, '')) || 0;
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, [field]: num } : e)));
  };

  const handleSaveClick = () => {
    const parsedDate = parseDDMMYYYYToDate(dateText);
    if (!parsedDate) {
      Alert.alert('Invalid Date', 'Please enter date as DD-MM-YYYY.');
      return;
    }
    if (!isBalanced) {
      Alert.alert('Unbalanced Voucher', 'Total debits must equal total credits.');
      return;
    }
    if (entries.some((e) => !e.ledgerId)) {
      Alert.alert('Incomplete Entries', 'All entries must have a selected ledger.');
      return;
    }

    onSave({
      date: parsedDate,
      narration,
      entries: entries.map((e) => ({
        ledgerId: e.ledgerId,
        ledgerName: e.ledgerName,
        debit: e.debit,
        credit: e.credit,
        accountType: e.accountType,
      })),
      voucherType: data.voucherType,
    });
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true}>
      <Field
        label="Voucher Date (DD-MM-YYYY)"
        value={dateText}
        onChange={(v) => setDateText(v || '')}
        th={th}
      />
      <Field label="Narration" value={narration} onChange={(v) => setNarration(v || '')} th={th} />

      <Text style={[localStyles.label, { color: th.txtSec }]}>Ledger Entries</Text>
      {entries.map((entry) => (
        <View key={entry.id} style={localStyles.entryRow}>
          <TouchableOpacity
            style={[
              localStyles.entryLedgerSelect,
              { borderColor: th.border, backgroundColor: th.inputBg },
            ]}
            onPress={() => {
              setActiveRowId(entry.id);
              setLedgerSearchQuery('');
              setPickerVisible(true);
            }}
          >
            <Text style={[localStyles.entryLedgerText, { color: th.txt }]} numberOfLines={1}>
              {entry.ledgerName || 'Select Ledger...'}
            </Text>
          </TouchableOpacity>
          <TextInput
            style={[
              localStyles.entryInput,
              { borderColor: th.border, backgroundColor: th.inputBg, color: th.txt },
            ]}
            placeholder="Dr"
            placeholderTextColor={th.txtSec}
            keyboardType="numeric"
            value={entry.debit ? String(entry.debit) : ''}
            onChangeText={(v) => handleUpdateEntry(entry.id, 'debit', v)}
          />
          <TextInput
            style={[
              localStyles.entryInput,
              { borderColor: th.border, backgroundColor: th.inputBg, color: th.txt },
            ]}
            placeholder="Cr"
            placeholderTextColor={th.txtSec}
            keyboardType="numeric"
            value={entry.credit ? String(entry.credit) : ''}
            onChangeText={(v) => handleUpdateEntry(entry.id, 'credit', v)}
          />
          <TouchableOpacity
            onPress={() => handleRemoveRow(entry.id)}
            style={localStyles.removeEntryBtn}
          >
            <Ionicons name="trash-outline" size={20} color="red" />
          </TouchableOpacity>
        </View>
      ))}

      <TouchableOpacity onPress={handleAddRow} style={localStyles.addEntryBtn}>
        <Ionicons name="add-circle" size={20} color={COLORS.primary} />
        <Text style={localStyles.addEntryText}>Add Entry Row</Text>
      </TouchableOpacity>

      <View style={[localStyles.footerBalances, { borderColor: th.border }]}>
        <Text style={[localStyles.footerBalanceText, { color: th.txt }]}>
          Dr Total: ₹{totalDebit.toLocaleString()}
        </Text>
        <Text
          style={[
            localStyles.footerBalanceText,
            isBalanced ? localStyles.balanceMatch : localStyles.balanceMismatch,
          ]}
        >
          Cr Total: ₹{totalCredit.toLocaleString()}
        </Text>
      </View>

      <TouchableOpacity
        onPress={handleSaveClick}
        disabled={!isBalanced}
        style={[
          localStyles.addButton,
          { marginHorizontal: 0, marginTop: 10, opacity: isBalanced ? 1 : 0.5 },
        ]}
      >
        <Text style={localStyles.addButtonText}>Update Voucher</Text>
      </TouchableOpacity>

      {/* Sub-Modal Ledger Picker */}
      <Modal visible={pickerVisible} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.4)',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <View
            style={{
              height: '60%',
              backgroundColor: th.card,
              borderRadius: 16,
              padding: 20,
              borderColor: th.border,
              borderWidth: 1,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: th.txt }}>Select Ledger</Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}>
                <Ionicons name="close" size={24} color={th.txtSec} />
              </TouchableOpacity>
            </View>
            <TextInput
              placeholder="Search ledger..."
              placeholderTextColor={th.txtSec}
              style={{
                borderWidth: 1,
                borderColor: th.border,
                borderRadius: 8,
                padding: 8,
                marginBottom: 12,
                color: th.txt,
                backgroundColor: th.inputBg,
              }}
              value={ledgerSearchQuery}
              onChangeText={setLedgerSearchQuery}
            />
            <FlatList
              data={filteredLedgers}
              keyExtractor={(item) => item._id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleSelectLedger(item)}
                  style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderColor: th.border }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: th.txt }}>
                    {item.ledgerName}
                  </Text>
                  <Text style={{ fontSize: 11, color: th.txtSec }}>{item.groupName}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const localStyles = StyleSheet.create({
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    marginBottom: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 14,
    minHeight: 52,
    gap: 10,
    alignSelf: 'stretch',
  },
  addButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
  primaryButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  infoBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 4,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardActionButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  cardMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  actionsContainer: {
    flexDirection: 'row',
    width: 140,
    height: '100%',
    marginBottom: 10,
    marginRight: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingTop: 72,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
    marginTop: 10,
  },
  pickerContainer: {
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
    marginBottom: 10,
  },
  groupSearchInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    fontSize: 15,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  inputField: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    marginBottom: 10,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  groupPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  groupOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  groupSelectItem: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    margin: 6,
    minWidth: '42%',
    backgroundColor: '#F8FAFC',
  },
  modalFooter: {
    paddingTop: 14,
    paddingBottom: 16,
  },
  selectField: {
    borderWidth: 1.5,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  indicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  indicatorText: {
    marginLeft: 8,
    fontSize: 13,
  },
  listItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  listItemTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  listItemSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginBottom: 10,
  },
  smallText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  groupListContainer: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 8,
    paddingHorizontal: 4,
    maxHeight: 240,
    marginBottom: 16,
  },
  groupFlatListContent: {
    paddingHorizontal: 4,
  },
  groupListItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: '#9CA3AF',
  },
  groupListItemSelected: {
    backgroundColor: '#4B5563',
  },
  groupListText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  groupListTextSelected: {
    color: '#FFFFFF',
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  entryLedgerSelect: {
    flex: 2,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 8,
    justifyContent: 'center',
    backgroundColor: '#FFF',
  },
  entryLedgerText: {
    fontSize: 13,
    color: '#334155',
  },
  entryInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
    textAlign: 'center',
    backgroundColor: '#FFF',
  },
  removeEntryBtn: {
    padding: 6,
  },
  addEntryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  addEntryText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '700',
    marginLeft: 6,
  },
  footerBalances: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingTop: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  footerBalanceText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  balanceMatch: {
    color: 'green',
  },
  balanceMismatch: {
    color: 'red',
  },
});
