import { appService } from '@/UtilServices/appHelper';
import { useUserContext } from '@/context/AuthContext';
import { usePayments } from '@/hooks/usePayments';
import { useVouchers } from '@/hooks/useVouchers';
import { COLORS } from '@/styles/stylesIndex';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { jwtDecode } from 'jwt-decode';

interface StaffFinanceModalProps {
  visible: boolean;
  onClose: () => void;
  token: string;
  dbName?: string;
}

export const StaffFinanceModal: React.FC<StaffFinanceModalProps> = ({
  visible,
  onClose,
  token,
  dbName,
}) => {
  const { user } = useUserContext();
  const { staff, fetchStaffPicker } = usePayments(token, dbName);
  const { resetVoucher, updateEntry, saveVoucher, loading: savingVoucher } = useVouchers(token, dbName);

  const [accountingMaster, setAccountingMaster] = useState<{ groups: any[], ledgers: any[] } | null>(null);
  const [ledgersLoading, setLedgersLoading] = useState(false);
  const [pettyCashBooks, setPettyCashBooks] = useState<any[]>([]);

  const [searchText, setSearchText] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [narration, setNarration] = useState('');

  const fetchAccountingMaster = useCallback(async () => {
    setLedgersLoading(true);
    try {
      const res = await appService.httpClient.get('finance/master');
      if (res.data?.success) {
        setAccountingMaster(res.data.data);
      }
    } catch (e) {
      console.log('Failed to load Accounting Master:', e);
    } finally {
      setLedgersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setSelectedStaff(null);
      setAmount('');
      setSearchText('');
      setNarration('');
      fetchAccountingMaster();
      fetchStaffPicker();

      appService.httpClient.get("finance/petty-cash/balances")
        .then((res) => {
          if (res.data?.success) {
            setPettyCashBooks(res.data.data || []);
          }
        })
        .catch((e) => console.log("Failed to load petty cash balances:", e));
    }
  }, [visible, fetchAccountingMaster, fetchStaffPicker]);

  const staffAccounts = useMemo(() => {
    return (staff?.employees || []).map((e: any) => {
      const ledger = (accountingMaster?.ledgers || []).find(
        (l: any) => l.refType === 'Staff' && l.refId === e._id
      );
      const bal = ledger ? (ledger.currentBalance ?? ledger.openingBalance ?? 0) : 0;
      return {
        id: e._id,
        ledgerId: ledger ? ledger._id : undefined,
        name: e.name,
        role: e.role,
        photo: e.photo,
        enrollmentNo: e.enrollment_no,
        balance: bal,
        hasLedger: !!ledger
      };
    });
  }, [staff, accountingMaster]);

  const filteredStaff = useMemo(() => {
    if (!searchText.trim()) return staffAccounts;
    const q = searchText.toLowerCase();
    return staffAccounts.filter(
      (s) =>
        s.name?.toLowerCase().includes(q) ||
        s.role?.toLowerCase().includes(q) ||
        s.enrollmentNo?.toLowerCase().includes(q)
    );
  }, [staffAccounts, searchText]);

  const locationId = useMemo(() => {
    try {
      if (!token) return null;
      const decoded: any = jwtDecode(token);
      return decoded.locationId || null;
    } catch (e) {
      return null;
    }
  }, [token]);

  const getTargetLedger = (ledgerNameSubstring: string, fallbackName: string) => {
    const ledgers = accountingMaster?.ledgers || [];
    const found = ledgers.find((l: any) => l.ledgerName?.toLowerCase().includes(ledgerNameSubstring.toLowerCase()));
    if (found) return { id: found._id, name: found.ledgerName };
    return { id: `auto_${ledgerNameSubstring}`, name: fallbackName }; // Voucher backend can sometimes auto-resolve
  };

  const handleAction = async (actionType: 'advance' | 'penalty' | 'article') => {
    if (!selectedStaff) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Validation', 'Please enter a valid amount.');
      return;
    }

    try {
      if (actionType === 'advance') {
        // Payment Voucher: Dr Staff, Cr Petty Cash
        const activeBook = pettyCashBooks.find((b: any) => 
          b.refId && (String(b.refId) === String(user?.userId) || String(b.refId) === String(user?._id))
        );
        const creditAccountId = activeBook ? activeBook._id : "cash_in_hand";
        const creditAccountName = activeBook ? activeBook.name : `Petty Cash - ${user?.userDisplayName || "General"}`;
        
        const payloadVoucher = {
          date: new Date(),
          narration: narration || 'Staff Advance / Salary Payment',
          totalDr: amt,
          totalCr: amt,
          entries: [
            { id: "1", type: "Dr", accountId: selectedStaff.id, accountName: selectedStaff.name, accountType: "Staff", amount: amt },
            { id: "2", type: "Cr", accountId: creditAccountId, accountName: creditAccountName, accountType: "Category", amount: amt }
          ]
        };
        
        resetVoucher('Payment', payloadVoucher.narration);
        updateEntry("1", payloadVoucher.entries[0] as any);
        updateEntry("2", payloadVoucher.entries[1] as any);

        await saveVoucher('Payment', locationId, 'salary', payloadVoucher as any);
        Alert.alert('Success', `₹${amt.toLocaleString('en-IN')} paid to ${selectedStaff.name}`);
        
      } else if (actionType === 'penalty') {
        // Journal Voucher: Dr Staff, Cr Penalty
        const penaltyLedger = getTargetLedger('penalty', 'Penalty Account');
        
        const payloadVoucher = {
          date: new Date(),
          narration: narration || 'Imposed Penalty',
          totalDr: amt,
          totalCr: amt,
          entries: [
            { id: "1", type: "Dr", accountId: selectedStaff.id, accountName: selectedStaff.name, accountType: "Staff", amount: amt },
            { id: "2", type: "Cr", accountId: penaltyLedger.id, accountName: penaltyLedger.name, accountType: "Category", amount: amt }
          ]
        };
        
        resetVoucher('Journal', payloadVoucher.narration);
        updateEntry("1", payloadVoucher.entries[0] as any);
        updateEntry("2", payloadVoucher.entries[1] as any);

        await saveVoucher('Journal', locationId, 'journal', payloadVoucher as any);
        Alert.alert('Success', `₹${amt.toLocaleString('en-IN')} penalty imposed on ${selectedStaff.name}`);

      } else if (actionType === 'article') {
        // Journal Voucher: Dr Staff, Cr Articles Recovered
        const articleLedger = getTargetLedger('article', 'Articles Recovered');
        
        const payloadVoucher = {
          date: new Date(),
          narration: narration || 'Article Issued / Recovered',
          totalDr: amt,
          totalCr: amt,
          entries: [
            { id: "1", type: "Dr", accountId: selectedStaff.id, accountName: selectedStaff.name, accountType: "Staff", amount: amt },
            { id: "2", type: "Cr", accountId: articleLedger.id, accountName: articleLedger.name, accountType: "Category", amount: amt }
          ]
        };
        
        resetVoucher('Journal', payloadVoucher.narration);
        updateEntry("1", payloadVoucher.entries[0] as any);
        updateEntry("2", payloadVoucher.entries[1] as any);

        await saveVoucher('Journal', locationId, 'journal', payloadVoucher as any);
        Alert.alert('Success', `₹${amt.toLocaleString('en-IN')} article issued to ${selectedStaff.name}`);
      }

      // Optimistically update local balance in memory for this session
      const balanceChange = actionType === 'advance' ? amt : amt; // Dr increases staff debit balance
      if (accountingMaster) {
        setAccountingMaster(prev => {
          if (!prev) return prev;
          const newLedgers = prev.ledgers.map(l => {
            if (l.refType === 'Staff' && l.refId === selectedStaff.id) {
              return { ...l, currentBalance: (l.currentBalance ?? l.openingBalance ?? 0) + balanceChange };
            }
            return l;
          });
          return { ...prev, ledgers: newLedgers };
        });
      }

      setSelectedStaff(null);
    } catch (err: any) {
      const detailedMsg = err.response?.data?.message || err.response?.data?.error || err.message;
      Alert.alert('Error', detailedMsg);
    }
  };

  const insets = useSafeAreaInsets();
  const projectedBalance = selectedStaff ? (selectedStaff.balance + (parseFloat(amount) || 0)) : 0;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: '#f8fafc', paddingTop: insets.top }}>
          {/* Header */}
          <View style={{ height: 60, backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
            <TouchableOpacity onPress={onClose} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ fontSize: 17, fontWeight: '900', color: '#fff' }}>Staff Payment & Finance</Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>Advances, Salaries, Penalties, Articles</Text>
            </View>
          </View>

          {selectedStaff ? (
            <View style={{ flex: 1, padding: 20 }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {selectedStaff.photo ? (
                    <Image source={{ uri: selectedStaff.photo }} style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12 }} />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12, backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' }}>
                      <Ionicons name="person" size={24} color="#94a3b8" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textDark }}>{selectedStaff.name}</Text>
                    <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 2 }}>{selectedStaff.role} {selectedStaff.enrollmentNo ? `(EFN# ${selectedStaff.enrollmentNo})` : ''}</Text>
                  </View>
                </View>
                
                <View style={{ marginTop: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, color: COLORS.textMuted, fontWeight: '600' }}>Current Balance</Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: selectedStaff.balance > 0 ? '#dc2626' : selectedStaff.balance < 0 ? '#16a34a' : COLORS.textDark }}>
                    ₹{Math.abs(selectedStaff.balance).toLocaleString('en-IN')} {selectedStaff.balance > 0 ? 'Dr' : selectedStaff.balance < 0 ? 'Cr' : ''}
                  </Text>
                </View>

                <View style={{ marginTop: 24 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Amount (₹)</Text>
                  <TextInput
                    style={{ backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 18, fontWeight: '700', color: COLORS.textDark }}
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={amount}
                    onChangeText={setAmount}
                    autoFocus
                  />
                </View>

                {amount ? (
                  <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                    <Text style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: '600' }}>Projected Balance</Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: projectedBalance > 0 ? '#dc2626' : projectedBalance < 0 ? '#16a34a' : COLORS.textDark }}>
                      ₹{Math.abs(projectedBalance).toLocaleString('en-IN')} {projectedBalance > 0 ? 'Dr' : projectedBalance < 0 ? 'Cr' : ''}
                    </Text>
                  </View>
                ) : null}

                <View style={{ marginTop: 20 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Narration (Optional)</Text>
                  <TextInput
                    style={{ backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: COLORS.textDark }}
                    placeholder="Remarks..."
                    placeholderTextColor="#94a3b8"
                    value={narration}
                    onChangeText={setNarration}
                  />
                </View>

                {/* Actions */}
                <View style={{ marginTop: 30, gap: 12 }}>
                  <TouchableOpacity 
                    onPress={() => handleAction('advance')} 
                    disabled={savingVoucher}
                    style={{ backgroundColor: '#16a34a', paddingVertical: 14, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                  >
                    <Ionicons name="cash-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Advance / Salary (Cash)</Text>
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity 
                      onPress={() => handleAction('penalty')} 
                      disabled={savingVoucher}
                      style={{ flex: 1, backgroundColor: '#ea580c', paddingVertical: 14, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                    >
                      <Ionicons name="warning-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Impose Penalty</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      onPress={() => handleAction('article')} 
                      disabled={savingVoucher}
                      style={{ flex: 1, backgroundColor: '#0284c7', paddingVertical: 14, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                    >
                      <Ionicons name="shirt-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Article Issued</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity 
                    onPress={() => setSelectedStaff(null)} 
                    style={{ backgroundColor: '#f1f5f9', paddingVertical: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#64748b' }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <View style={{ padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 10, paddingHorizontal: 12, height: 44 }}>
                  <Ionicons name="search" size={18} color="#94a3b8" />
                  <TextInput
                    style={{ flex: 1, marginLeft: 8, fontSize: 15, color: COLORS.textDark }}
                    placeholder="Search Staff..."
                    placeholderTextColor="#94a3b8"
                    value={searchText}
                    onChangeText={setSearchText}
                  />
                  {searchText ? (
                    <TouchableOpacity onPress={() => setSearchText('')}>
                      <Ionicons name="close-circle" size={18} color="#94a3b8" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {ledgersLoading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                  <Text style={{ marginTop: 12, color: COLORS.textMuted }}>Loading Staff...</Text>
                </View>
              ) : (
                <FlatList
                  data={filteredStaff}
                  keyExtractor={item => item.id}
                  contentContainerStyle={{ padding: 16 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => setSelectedStaff(item)}
                      style={{
                        backgroundColor: '#fff',
                        borderRadius: 12,
                        padding: 16,
                        marginBottom: 12,
                        elevation: 1,
                        shadowColor: '#000',
                        shadowOpacity: 0.05,
                        shadowRadius: 2,
                        shadowOffset: { width: 0, height: 1 },
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                        {item.photo ? (
                          <Image source={{ uri: item.photo }} style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: '#f1f5f9' }} />
                        ) : (
                          <View style={{ width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' }}>
                            <Ionicons name="person" size={20} color="#94a3b8" />
                          </View>
                        )}
                        <View style={{ flex: 1, paddingRight: 12 }}>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: COLORS.textDark }}>{item.name}</Text>
                          <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>{item.role}</Text>
                        </View>
                      </View>
                      
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>Balance</Text>
                        <Text style={{ fontSize: 15, fontWeight: '900', color: item.balance > 0 ? '#dc2626' : item.balance < 0 ? '#16a34a' : '#64748b' }}>
                          ₹{Math.abs(item.balance).toLocaleString('en-IN')} {item.balance > 0 ? 'Dr' : item.balance < 0 ? 'Cr' : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={() => (
                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                      <Ionicons name="people-outline" size={48} color="#cbd5e1" />
                      <Text style={{ marginTop: 12, fontSize: 15, color: '#94a3b8', fontWeight: '500' }}>No staff found.</Text>
                    </View>
                  )}
                />
              )}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};
