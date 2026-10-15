import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator, 
  StyleSheet, 
  TextInput, 
  FlatList, 
  TextStyle, 
  ViewStyle,
  useColorScheme,
  Alert
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { AppHeader } from "@/components/AppHeader";
import { useUserContext } from "@/context/AuthContext";
import { usePayments } from "@/hooks/usePayments";
import { styles as G, COLORS } from "@/styles/stylesIndex";
import { generateLedgerHTML } from "@/utils/pdfTemplates";

/**
 * LeadLedgerScreen
 * Displays a list of leads. Once a lead is selected, shows a detailed transaction ledger.
 */
export default function LeadLedgerScreen() {
  const router = useRouter();
  const { user } = useUserContext();
  const token = user?.token ?? "";
  const { leads, leadsLoading, fetchLeadsForPicker, fetchLeadLedger } = usePayments(token);

  const [printing, setPrinting] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [ledgerData, setLedgerData] = useState<any>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    fetchLeadsForPicker();
  }, [fetchLeadsForPicker]);

  const filteredLeads = useMemo(() => {
    let list = leads.filter(l => (l.totalPaid || 0) > 0 || (l.totalReceived || 0) > 0);
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(l => 
      String(l.lead_no).includes(q) || 
      l.sender_name?.toLowerCase().includes(q) || 
      l.product_name?.toLowerCase().includes(q)
    );
  }, [leads, search]);

  const onLeadSelect = async (leadId: string) => {
    setSelectedLeadId(leadId);
    setLedgerLoading(true);
    try {
      const data = await fetchLeadLedger(leadId);
      setLedgerData(data);
    } catch (err) {
      console.warn("Error fetching lead ledger:", err);
    } finally {
      setLedgerLoading(false);
    }
  };

  const renderLeadItem = ({ item }: { item: any }) => {
    const isSelected = selectedLeadId === item._id;
    return (
      <TouchableOpacity 
        style={[G.card, { borderColor: isSelected ? COLORS.primary : "#f1f5f9", borderWidth: isSelected ? 2 : 1 }] as any}
        onPress={() => onLeadSelect(item._id)}
      >
        <View style={G.rowBetween as ViewStyle}>
          <View style={{ flex: 1 }}>
            <View style={G.rowCenter as ViewStyle}>
              <View style={{ backgroundColor: COLORS.primary + "15", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginRight: 8 }}>
                <Text style={{ color: COLORS.primary, fontWeight: '800', fontSize: 12 }}>#{item.lead_no}</Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#1e293b' }}>{item.sender_name}</Text>
            </View>
            <Text style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{item.product_name}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase' }}>Status</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.primary }}>{item.status}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const handleSharePDF = async () => {
    if (!ledgerData || !ledgerRows.length) {
      Alert.alert("No Data", "There are no transactions to share.");
      return;
    }
    setPrinting(true);
    try {
      const html = generateLedgerHTML(ledgerData, ledgerRows, user);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Ledger #${ledgerData.lead_no}` });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to generate PDF");
    } finally {
      setPrinting(false);
    }
  };

  const renderLedgerHeader = () => (
    <View style={G.ledgerHeaderRow as ViewStyle}>
      <View style={[G.ledgerColDate, { borderRightWidth: 1, borderRightColor: '#e2e8f0' }] as any}>
        <Text style={G.ledgerHeaderText}>Date</Text>
      </View>
      <View style={[G.ledgerColDesc, { borderRightWidth: 1, borderRightColor: '#e2e8f0' }] as any}>
        <Text style={G.ledgerHeaderText}>Description</Text>
      </View>
      <View style={[G.ledgerColAmt, { borderRightWidth: 1, borderRightColor: '#e2e8f0' }] as any}>
        <Text style={[G.ledgerHeaderText, { textAlign: 'left' }] as any}>Paid (-)</Text>
      </View>
      <View style={[G.ledgerColAmt, { borderRightWidth: 1, borderRightColor: '#e2e8f0' }] as any}>
        <Text style={[G.ledgerHeaderText, { textAlign: 'right' }] as any}>Recvd (+)</Text>
      </View>
      <View style={G.ledgerColBal as any}>
        <Text style={[G.ledgerHeaderText, { textAlign: 'right' }] as any}>Balance</Text>
      </View>
    </View>
  );

  const ledgerRows = useMemo(() => {
    if (!ledgerData?.ledger) return [];
    let runningBalance = 0;
    
    const getVal = (v: any) => {
      if (!v) return 0;
      if (typeof v === 'number') return v;
      if (typeof v === 'string') return parseFloat(v) || 0;
      if (v.$numberDecimal) return parseFloat(v.$numberDecimal) || 0;
      return 0;
    };

    const sorted = [...ledgerData.ledger].sort((a, b) => 
      new Date(a.voucherDate).getTime() - new Date(b.voucherDate).getTime()
    );

    return sorted.map((t: any) => {
      const isPayment = t.paymentType === "Dr";
      const amt = getVal(t.voucherAmount?.value);
      if (isPayment) runningBalance -= amt;
      else runningBalance += amt;
      return { ...t, runningBalance, amt };
    });
  }, [ledgerData]);

  if (selectedLeadId && ledgerData) {
    return (
      <SafeAreaView style={G.safeContainer as ViewStyle} edges={["top"]}>
        <AppHeader 
          title={`${ledgerData.sender_name} (#${ledgerData.lead_no})`} 
          onBackPress={() => {
            setSelectedLeadId(null);
            setLedgerData(null);
          }} 
        />
        
        <FlatList
          data={ledgerRows}
          keyExtractor={item => item._id}
          ListHeaderComponent={
            <View style={{ padding: 16 }}>
              <View style={G.leadInfoCard as ViewStyle}>
                <View style={G.rowBetween as ViewStyle}>
                  <View>
                    <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '700' }}>Project/Product</Text>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#1e293b' }}>{ledgerData.product_name}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase' }}>Margin</Text>
                    <Text style={[G.ledgerBodyText, { fontSize: 16, fontWeight: '900' }, ledgerData.grossMargin >= 0 ? G.balPositive : G.balNegative] as any}>
                      ₹{ledgerData.grossMargin?.toLocaleString()}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity 
                  onPress={handleSharePDF} 
                  disabled={printing}
                  style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    backgroundColor: COLORS.primary + '10',
                    borderRadius: 12,
                    paddingVertical: 10,
                    marginTop: 18,
                    borderWidth: 1,
                    borderColor: COLORS.primary + '30',
                    gap: 8
                  }}>
                  {printing ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <>
                      <Ionicons name="share-outline" size={18} color={COLORS.primary} />
                      <Text style={{ fontWeight: '700', color: COLORS.primary, fontSize: 13 }}>Share Ledger as PDF</Text>
                    </>
                  )}
                </TouchableOpacity>
                
                <View style={[G.divider, { marginVertical: 15 }] as any} />
                
                <View style={G.rowBetween as ViewStyle}>
                  <View>
                    <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase' }}>Total Revenue</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>₹{ledgerData.totalRevenue?.toLocaleString() || 0}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase' }}>Total Cost</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>₹{ledgerData.totalCost?.toLocaleString() || 0}</Text>
                  </View>
                </View>
              </View>

              <Text style={{ fontSize: 16, fontWeight: '800', color: '#1e293b', marginBottom: 12 }}>Transaction History</Text>
              {renderLedgerHeader()}
            </View>
          }
          renderItem={({ item }) => {
            const isPayment = item.paymentType === "Dr";
            const d = item.voucherDate ? new Date(item.voucherDate) : null;
            const dateStr = d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` : '';
            
            return (
              <View style={G.ledgerRow as ViewStyle}>
                <View style={[G.ledgerColDate, { borderRightWidth: 1, borderRightColor: '#f1f5f9' }] as any}>
                  <Text style={G.ledgerBodyText as TextStyle}>{dateStr}</Text>
                </View>
                <View style={[G.ledgerColDesc, { borderRightWidth: 1, borderRightColor: '#f1f5f9' }] as any}>
                  <Text style={[G.ledgerBodyText, { fontWeight: '700' }] as any}>
                    {item.paymentFromTo || 'General'}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#94a3b8' }} numberOfLines={2}>
                    {item.voucherNarration || 'No details'}
                  </Text>
                </View>
                <View style={[G.ledgerColAmt, { borderRightWidth: 1, borderRightColor: '#f1f5f9' }] as any}>
                  <Text style={[G.ledgerBodyText, { textAlign: 'left' }, isPayment && G.amtDebit] as any}>
                    {isPayment ? `₹${item.amt.toLocaleString()}` : ''}
                  </Text>
                </View>
                <View style={[G.ledgerColAmt, { borderRightWidth: 1, borderRightColor: '#f1f5f9' }] as any}>
                  <Text style={[G.ledgerBodyText, !isPayment && G.amtCredit] as any}>
                    {!isPayment ? `₹${item.amt.toLocaleString()}` : ''}
                  </Text>
                </View>
                <View style={G.ledgerColBal as ViewStyle}>
                  <Text style={[G.ledgerBodyText, { fontWeight: '900', textAlign: 'right' }, item.runningBalance >= 0 ? G.balPositive : G.balNegative] as any}>
                    ₹{item.runningBalance?.toLocaleString()}
                  </Text>
                </View>
              </View>
            );
          }}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Ionicons name="receipt-outline" size={48} color="#cbd5e1" />
              <Text style={{ marginTop: 12, color: '#64748b', fontSize: 14 }}>No transactions found for this lead.</Text>
            </View>
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={G.safeContainer as ViewStyle} edges={["top"]}>
      <AppHeader title="Leads Ledger" onBackPress={() => router.back()} />
      
      <View style={{ padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
        <View style={G.searchBox as ViewStyle}>
          <Ionicons name="search" size={20} color="#94a3b8" />
          <TextInput 
            style={G.searchInput as any}
            placeholder="Search Lead No, Name or Product..."
            placeholderTextColor="#94a3b8"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {leadsLoading ? (
        <View style={G.center as ViewStyle}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredLeads}
          keyExtractor={item => item._id}
          renderItem={renderLeadItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={{ padding: 60, alignItems: 'center' }}>
              <Ionicons name="search-outline" size={60} color="#cbd5e1" />
              <Text style={{ marginTop: 16, color: '#64748b', fontSize: 16 }}>No matching leads found.</Text>
            </View>
          }
        />
      )}

      {ledgerLoading && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }]}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ marginTop: 12, color: COLORS.primary, fontWeight: '700' }}>Loading Ledger...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}
