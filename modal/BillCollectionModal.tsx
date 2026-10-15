import { appService } from '@/UtilServices/appHelper';
import { useUserContext } from '@/context/AuthContext';
import { usePayments } from '@/hooks/usePayments';
import { useVouchers } from '@/hooks/useVouchers';
import { COLORS, styles } from '@/styles/stylesIndex';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

interface BillCollectionModalProps {
  visible: boolean;
  onClose: () => void;
  token: string;
  dbName?: string;
}

export const BillCollectionModal: React.FC<BillCollectionModalProps> = ({
  visible,
  onClose,
  token,
  dbName,
}) => {
  const { user } = useUserContext();
  const { leads, fetchLeadsForPicker } = usePayments(token, dbName);
  const { resetVoucher, updateEntry, saveVoucher, loading: savingVoucher } = useVouchers(token, dbName);

  const [sundryDebtorLedgers, setSundryDebtorLedgers] = useState<any[]>([]);
  const [ledgersLoading, setLedgersLoading] = useState(false);
  const [pettyCashBooks, setPettyCashBooks] = useState<any[]>([]);

  const [searchText, setSearchText] = useState('');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [amountCollected, setAmountCollected] = useState('');
  const [narration, setNarration] = useState('');

  const fetchAccountingMaster = useCallback(async () => {
    setLedgersLoading(true);
    try {
      const res = await appService.httpClient.get('finance/master');
      if (res.data?.success) {
        const groups: any[] = res.data.data.groups || [];
        const ledgers: any[] = res.data.data.ledgers || [];

        const debtorGroup = groups.find(
          (g: any) => g.groupName?.toLowerCase().includes('sundry debtor')
        );
        const debtorLedgers = debtorGroup
          ? ledgers.filter((l: any) => String(l.ledgerGroupId) === String(debtorGroup._id))
          : [];
        
        const filtered = debtorLedgers.filter((l: any) => l.ledgerName !== 'Default Client');
        setSundryDebtorLedgers(filtered);
      }
    } catch (e) {
      console.log('Failed to load Accounting Master:', e);
    } finally {
      setLedgersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setSelectedClient(null);
      setAmountCollected('');
      setSearchText('');
      setNarration('');
      fetchLeadsForPicker();
      fetchAccountingMaster();

      // Fetch dynamic petty cash registers to use as Debit account
      appService.httpClient.get("finance/petty-cash/balances")
        .then((res) => {
          if (res.data?.success) {
            setPettyCashBooks(res.data.data || []);
          }
        })
        .catch((e) => console.log("Failed to load petty cash balances:", e));
    }
  }, [visible, fetchLeadsForPicker, fetchAccountingMaster]);

  const clientAccounts = useMemo(() => {
    return sundryDebtorLedgers.map((l: any) => {
      const bal = l.currentBalance ?? l.openingBalance ?? 0;
      const associatedLeadId = l.leadIds?.length
        ? l.leadIds[0]
        : (l.refType === 'Lead' && l.refId ? l.refId : undefined);
      const foundLead = leads.find((ld) => ld._id === associatedLeadId);
      const associatedLeadName = foundLead ? (foundLead.sender_name || `Client-${foundLead.lead_no}`) : undefined;

      return {
        id: l._id,
        name: l.ledgerName,
        balance: bal,
        leadId: associatedLeadId,
        leadName: associatedLeadName,
      };
    });
  }, [sundryDebtorLedgers, leads]);

  const filteredClients = useMemo(() => {
    if (!searchText.trim()) return clientAccounts;
    const q = searchText.toLowerCase();
    return clientAccounts.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.leadName?.toLowerCase().includes(q)
    );
  }, [clientAccounts, searchText]);

  const handleSelectClient = (client: any) => {
    setSelectedClient(client);
    setAmountCollected('');
    setNarration('');
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

  const handleSubmit = async () => {
    if (!selectedClient) {
      Alert.alert('Validation', 'Please select a client.');
      return;
    }
    const amt = parseFloat(amountCollected);
    if (isNaN(amt) || amt <= 0) {
      Alert.alert('Validation', 'Please enter a valid amount.');
      return;
    }

    try {
      // Create Receipt Voucher
      resetVoucher('Receipt', narration);

      // Debit: Find active user's Petty Cash Book
      const activeBook = pettyCashBooks.find((b: any) => 
        b.refId && (String(b.refId) === String(user?.userId) || String(b.refId) === String(user?._id))
      );
      
      const debitAccountId = activeBook ? activeBook._id : "cash_in_hand";
      const debitAccountName = activeBook ? activeBook.name : `Petty Cash - ${user?.userDisplayName || "General"}`;

      // Update Dr entry (index "1" by default in resetVoucher)
      updateEntry("1", {
        accountId: debitAccountId,
        accountName: debitAccountName,
        accountType: "Category",
        amount: amt
      });

      // Update Cr entry (index "2" by default)
      updateEntry("2", {
        accountId: selectedClient.id,
        accountName: selectedClient.name,
        accountType: "Lead",
        amount: amt
      });

      await saveVoucher('Receipt', locationId, 'bill_collection');
      Alert.alert('Success', `Collected ₹${amt.toLocaleString('en-IN')} from ${selectedClient.name}`);
      
      // Update local balance to reflect immediately
      setSundryDebtorLedgers(prev => prev.map(l => {
        if (l._id === selectedClient.id) {
          return { ...l, currentBalance: (l.currentBalance ?? l.openingBalance ?? 0) - amt };
        }
        return l;
      }));
      
      setSelectedClient(null);
    } catch (err: any) {
      const detailedMsg = err.response?.data?.message || err.response?.data?.error || err.message;
      Alert.alert('Error', detailedMsg);
    }
  };

  const insets = useSafeAreaInsets();
  const projectedBalance = selectedClient ? (selectedClient.balance - (parseFloat(amountCollected) || 0)) : 0;

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
              <Text style={{ fontSize: 17, fontWeight: '900', color: '#fff' }}>Bill Collection</Text>
              <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>Select client and collect payment</Text>
            </View>
          </View>

          {selectedClient ? (
            <View style={{ flex: 1, padding: 20 }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.textDark }}>{selectedClient.name}</Text>
                {selectedClient.leadName && <Text style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 4 }}>{selectedClient.leadName}</Text>}
                
                <View style={{ marginTop: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 15, color: COLORS.textMuted, fontWeight: '600' }}>Current Outstanding</Text>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: selectedClient.balance > 0 ? '#dc2626' : '#16a34a' }}>
                    ₹{Math.abs(selectedClient.balance).toLocaleString('en-IN')} {selectedClient.balance > 0 ? 'Dr' : 'Cr'}
                  </Text>
                </View>

                <View style={{ marginTop: 24 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Amount Collected (₹)</Text>
                  <TextInput
                    style={{ backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 18, fontWeight: '700', color: COLORS.textDark }}
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={amountCollected}
                    onChangeText={setAmountCollected}
                    autoFocus
                  />
                </View>

                {amountCollected ? (
                  <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                    <Text style={{ fontSize: 13, color: COLORS.textMuted, fontWeight: '600' }}>New Balance</Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: projectedBalance > 0 ? '#dc2626' : '#16a34a' }}>
                      ₹{Math.abs(projectedBalance).toLocaleString('en-IN')} {projectedBalance > 0 ? 'Dr' : 'Cr'}
                    </Text>
                  </View>
                ) : null}

                <View style={{ marginTop: 20 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.textDark, marginBottom: 8 }}>Narration (Optional)</Text>
                  <TextInput
                    style={{ backgroundColor: '#f1f5f9', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: COLORS.textDark }}
                    placeholder="E.g. Cash collected by field staff..."
                    placeholderTextColor="#94a3b8"
                    value={narration}
                    onChangeText={setNarration}
                  />
                </View>

                <View style={{ flexDirection: 'row', marginTop: 30, gap: 12 }}>
                  <TouchableOpacity 
                    onPress={() => setSelectedClient(null)} 
                    style={{ flex: 1, backgroundColor: '#f1f5f9', paddingVertical: 14, borderRadius: 8, alignItems: 'center' }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#64748b' }}>Cancel</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    onPress={handleSubmit} 
                    disabled={savingVoucher}
                    style={{ flex: 2, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}
                  >
                    {savingVoucher ? (
                      <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
                    ) : (
                      <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginRight: 8 }} />
                    )}
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Submit Receipt</Text>
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
                    placeholder="Search Client..."
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
                  <Text style={{ marginTop: 12, color: COLORS.textMuted }}>Loading Clients...</Text>
                </View>
              ) : (
                <FlatList
                  data={filteredClients}
                  keyExtractor={item => item.id}
                  contentContainerStyle={{ padding: 16 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => handleSelectClient(item)}
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
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.textDark }}>{item.name}</Text>
                        {item.leadName && <Text style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 4 }}>{item.leadName}</Text>}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 2 }}>Outstanding</Text>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: item.balance > 0 ? '#dc2626' : item.balance < 0 ? '#16a34a' : COLORS.textDark }}>
                          ₹{Math.abs(item.balance).toLocaleString('en-IN')} {item.balance > 0 ? 'Dr' : item.balance < 0 ? 'Cr' : ''}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={() => (
                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                      <Ionicons name="document-text-outline" size={48} color="#cbd5e1" />
                      <Text style={{ marginTop: 12, fontSize: 15, color: '#94a3b8', fontWeight: '500' }}>No clients found.</Text>
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
