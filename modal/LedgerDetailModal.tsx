import React, { useState, useEffect, useCallback } from 'react';
import { 
  Modal, View, Text, TouchableOpacity, ScrollView, 
  ActivityIndicator, Alert 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { appService } from '@/UtilServices/appHelper';
import { COLORS } from '@/styles/stylesIndex';
import { S } from '@/styles/styledashboard';
import { LedgerEditModal } from './LedgerEditModal';

interface LedgerDetailModalProps {
  visible: boolean;
  onClose: () => void;
  employee: any;
}

export const LedgerDetailModal: React.FC<LedgerDetailModalProps> = ({
  visible, onClose, employee
}) => {
  const [loading, setLoading] = useState(false);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [editVisible, setEditVisible] = useState(false);
  const [balanceRange, setBalanceRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    end: new Date()
  });
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  // Handler to refresh ledger after edit
  const handleEditSaved = () => {
    fetchLedger();
  };
  const fetchLedger = useCallback(async () => {
    if (!employee?._id) return;
    setLoading(true);
    try {
      const res = await appService.httpClient.get('service/finance/ledgers', {
        params: {
          accountId: employee._id,
          accountType: 'Staff',
          from_date: balanceRange.start.toISOString().split('T')[0],
          to_date: balanceRange.end.toISOString().split('T')[0]
        }
      });
      if (res.data?.success) {
        setVouchers(res.data.data || []);
      }
    } catch (err: any) {
      console.error("Fetch Ledger Error:", err.message);
    } finally {
      setLoading(false);
    }
  }, [employee?._id, balanceRange]);

  useEffect(() => {
    if (visible && employee?._id) {
      fetchLedger();
    }
  }, [visible, employee?._id, fetchLedger]);

  const ledgerSummary = vouchers.reduce((acc, v) => {
    if (v.paymentType === 'Cr') acc.salaryDues += v.amt;
    else acc.paymentMade += v.amt;
    if (v.voucherNarration?.toLowerCase().includes('advance')) acc.advances += v.amt;
    return acc;
  }, { salaryDues: 0, paymentMade: 0, advances: 0 });

  return (
    <Modal visible={visible} transparent animationType="slide">
        <View style={S.dashModalOverlay}>
            <View style={S.dashModalContent}>
                <View style={S.dashDetailHeader}>
                  <View style={[S.row, S.justifyBetween, S.alignCenter]}>
                    <View>
                      <Text style={S.dashModalTitle}>Ledger: {employee?.name || 'Staff'}</Text>
                      <Text style={S.dashStatLab}>{employee?.role || 'Employee'}</Text>
                    </View>
                    <View style={S.row}>
                      <TouchableOpacity onPress={() => setEditVisible(true)} style={{ marginRight: 12 }}>
                        <Ionicons name="create-outline" size={24} color="#64748b" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={onClose}>
                        <Ionicons name="close-circle" size={28} color="#64748b" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                <View style={S.dashDateRange}>
                    <TouchableOpacity onPress={() => setShowStartPicker(true)} style={S.dashDateBtn}>
                        <Text style={S.dashDateBtnLab}>FROM</Text>
                        <Text style={S.dashDateBtnVal}>{appService.formatDate(balanceRange.start)}</Text>
                    </TouchableOpacity>
                    <Ionicons name="arrow-forward" size={16} color="#94a3b8" />
                    <TouchableOpacity onPress={() => setShowEndPicker(true)} style={S.dashDateBtn}>
                        <Text style={S.dashDateBtnLab}>TO</Text>
                        <Text style={S.dashDateBtnVal}>{appService.formatDate(balanceRange.end)}</Text>
                    </TouchableOpacity>
                </View>
                {loading ? (
                    <View style={[S.flex1, S.center]}>
                        <ActivityIndicator color={COLORS.primary} size="large" />
                    </View>
                ) : (
                    <ScrollView style={S.dashList} showsVerticalScrollIndicator={false}>
                        <View style={S.dashSummaryGrid}>
                            <View style={S.dashSummaryTile}>
                                <Text style={S.dashSummaryLab}>Salary Dues</Text>
                                <Text style={S.dashSummaryVal}>₹{ledgerSummary.salaryDues.toLocaleString()}</Text>
                            </View>
                            <View style={S.dashSummaryTile}>
                                <Text style={S.dashSummaryLab}>Payments</Text>
                                <Text style={S.dashSummaryVal}>₹{ledgerSummary.paymentMade.toLocaleString()}</Text>
                            </View>
                            <View style={S.dashSummaryTile}>
                                <Text style={S.dashSummaryLab}>Advances</Text>
                                <Text style={[S.dashSummaryVal, { color: COLORS.warning }]} >₹{ledgerSummary.advances.toLocaleString()}</Text>
                            </View>
                            <View style={S.dashSummaryTile}>
                                <Text style={S.dashSummaryLab}>Net Balance</Text>
                                <Text style={[S.dashSummaryVal, { fontSize: 20, fontWeight: '900', color: (ledgerSummary.salaryDues - ledgerSummary.paymentMade) > 0 ? COLORS.success : COLORS.danger }]}>
                                    {(ledgerSummary.salaryDues - ledgerSummary.paymentMade) > 0 ? '+' : (ledgerSummary.salaryDues - ledgerSummary.paymentMade) < 0 ? '-' : ''} ₹{Math.abs(ledgerSummary.salaryDues - ledgerSummary.paymentMade).toLocaleString()}
                                </Text>
                            </View>
                        </View>

                        <Text style={S.dashSectionTitle}>Transactions</Text>
                        {vouchers.map((v: any, i) => (
                            <View key={i} style={S.dashDetailCard}>
                                <View style={S.dashDetailRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={S.dashDetailMain} numberOfLines={1}>{v.voucherNarration}</Text>
                                        <Text style={S.dashDetailSub}>{appService.formatDate(v.voucherDate)}</Text>
                                    </View>
                                    <View style={S.alignEnd}>
                                        <Text style={[S.dashDetailMain, { color: v.paymentType === 'Cr' ? COLORS.success : COLORS.danger }]}>
                                            {v.paymentType === 'Cr' ? '+' : '-'} ₹{v.amt.toLocaleString()}
                                        </Text>
                                        <Text style={S.dashDetailSub}>{v.paymentType === 'Cr' ? 'DUES' : 'PAYMENT'}</Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                        {vouchers.length === 0 && (
                            <View style={S.dashEmpty}>
                                <Text style={S.dashEmptyText}>No transactions in this range</Text>
                            </View>
                        )}
                        <View style={{ height: 40 }} />
                    </ScrollView>
                )}
            </View>
        </View>
{showStartPicker && (
  <DateTimePicker
    value={balanceRange.start}
    mode="date"
    onChange={(e, d) => {
      setShowStartPicker(false);
      if (d) setBalanceRange({ ...balanceRange, start: d });
    }}
  />
)}
        {showEndPicker && (
            <DateTimePicker
                value={balanceRange.end}
                mode="date"
                onChange={(e, d) => {
                    setShowEndPicker(false);
                    if (d) setBalanceRange({ ...balanceRange, end: d });
                }}
            />
        )}
    </Modal>
  );
};
