import React from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet, Platform, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TOKENS } from '../theme/tokens';
import { AttendanceLog } from './AttendanceCalendar';

interface AttendanceDayModalProps {
  visible: boolean;
  onClose: () => void;
  dayNum: number;
  monthDate: Date;
  records: AttendanceLog[];
  token: string;
  onRefresh: () => void;
  language?: string;
}

export const AttendanceDayModal: React.FC<AttendanceDayModalProps> = ({
  visible,
  onClose,
  dayNum,
  monthDate,
  records,
}) => {
  const displayDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayNum);
  const dateString = displayDate.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const formatHMS = (hrs: number) => {
    if (!hrs || hrs < 0) return '00:00';
    const h = Math.floor(hrs);
    const m = Math.floor((hrs - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const resolveShiftLabel = (r: AttendanceLog): string => {
    const raw = r as any;
    if (raw.shiftPeriod) {
      return raw.shiftPeriod === 'Night12' ? 'Night' : raw.shiftPeriod;
    }
    const code = raw.shiftCode || raw.shift_code;
    switch (code) {
      case 'M': return 'Morning';
      case 'A': return 'Afternoon';
      case 'N': return 'Night';
      case 'G': return 'General';
      case 'D': return 'Day';
      case 'N2': return 'Night';
      default: return 'General';
    }
  };

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>Daily Present</Text>
              <Text style={styles.headerSubtitle}>{dateString}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>
          
          {/* Content */}
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {records.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="calendar-outline" size={48} color="#cbd5e1" />
                <Text style={styles.noDataText}>No attendance records for this day.</Text>
              </View>
            ) : (
              records.map((record, index) => {
                const recAny = record as any;
                const isOnDuty = recAny.status !== 'Absent' && recAny.status !== 'Leave' && !record.dutyEnd;
                const isAbsent = recAny.status === 'Absent' || recAny.status === 'Leave';
                
                let trackBg = isOnDuty ? '#dcfce7' : '#f8fafc';
                let trackBorder = isOnDuty ? '#16a34a' : '#e2e8f0';
                
                if (isAbsent) {
                  trackBg = '#fee2e2';
                  trackBorder = '#fca5a5';
                }

                const startTime = record.dutyStart 
                  ? new Date(record.dutyStart).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) 
                  : '--:--';
                let endTime = isOnDuty ? 'Still Working' : '--:--';
                if (record.dutyEnd) {
                  const endDate = new Date(record.dutyEnd);
                  endTime = endDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                  if (record.dutyStart) {
                    const startDate = new Date(record.dutyStart);
                    if (startDate.getDate() !== endDate.getDate() || startDate.getMonth() !== endDate.getMonth()) {
                      const nextDayStr = endDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                      endTime = `${endTime} (${nextDayStr})`;
                    }
                  }
                }

                const displayHours = record.hoursWorked 
                  ? record.hoursWorked 
                  : (isOnDuty && record.dutyStart ? (Date.now() - new Date(record.dutyStart).getTime()) / 3600000 : 0);

                const shiftLabel = resolveShiftLabel(record);

                return (
                  <View key={record._id} style={[styles.wfCard, { borderColor: trackBorder }]}>
                    
                    {/* Status Top Bar */}
                    <View style={[styles.statusBanner, { backgroundColor: trackBg, borderBottomColor: trackBorder }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons 
                          name={isAbsent ? 'close-circle' : (isOnDuty ? 'time' : 'checkmark-done-circle')} 
                          size={16} 
                          color={isAbsent ? '#dc2626' : (isOnDuty ? '#16a34a' : '#475569')} 
                        />
                        <Text style={{ 
                          fontSize: 13, 
                          fontWeight: '700',
                          color: isAbsent ? '#dc2626' : (isOnDuty ? '#16a34a' : '#475569')
                        }}>
                          {isAbsent ? 'Absent' : (isOnDuty ? `On Duty since ${startTime}` : `Shift Completed`)}
                        </Text>
                      </View>
                      <View style={[styles.shiftBadge, isAbsent && { backgroundColor: '#fef2f2', borderColor: '#fca5a5' }]}>
                        <Text style={[styles.shiftBadgeText, isAbsent && { color: '#ef4444' }]}>{shiftLabel}</Text>
                      </View>
                    </View>

                    {/* Card Body */}
                    <View style={styles.cardBody}>
                      
                      {/* Location */}
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
                        <Ionicons name="location" size={18} color="#3b82f6" style={{ marginTop: 2, marginRight: 8 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Site / Client</Text>
                          <Text style={{ fontSize: 15, color: '#0f172a', fontWeight: '700', marginTop: 2 }}>{record.site_name || 'N/A'}</Text>
                        </View>
                      </View>

                      {/* Timings Grid */}
                      {!isAbsent && (
                        <View style={styles.timingGrid}>
                          <View style={styles.timingBox}>
                            <Text style={styles.timingLabel}>Time In</Text>
                            <Text style={styles.timingValue}>{startTime}</Text>
                          </View>
                          <View style={styles.timingDivider} />
                          <View style={styles.timingBox}>
                            <Text style={styles.timingLabel}>Time Out</Text>
                            <Text style={styles.timingValue}>{endTime}</Text>
                          </View>
                          <View style={styles.timingDivider} />
                          <View style={styles.timingBox}>
                            <Text style={styles.timingLabel}>Duration</Text>
                            <Text style={[styles.timingValue, { color: '#0ea5e9' }]}>{formatHMS(displayHours)} hrs</Text>
                          </View>
                        </View>
                      )}

                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)', // Darker overlay like AttendanceModal
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    width: '100%',
    maxHeight: '85%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDataText: {
    textAlign: 'center',
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 15,
    fontWeight: '600',
  },
  
  /* EmployeeCard style (wfCard) */
  wfCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  statusBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  shiftBadge: {
    backgroundColor: '#e0f2fe',
    borderColor: '#38bdf8',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  shiftBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284c7',
    textTransform: 'uppercase',
  },
  cardBody: {
    padding: 16,
  },
  timingGrid: {
    flexDirection: 'row',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 12,
    marginTop: 8,
  },
  timingBox: {
    flex: 1,
    alignItems: 'center',
  },
  timingDivider: {
    width: 1,
    backgroundColor: '#e2e8f0',
  },
  timingLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  timingValue: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '800',
  },
});
