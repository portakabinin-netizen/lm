import React, { useEffect, useRef, useMemo } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/styles/stylesIndex';

interface Props {
  visible: boolean;
  onClose: () => void;
  employees: any[];
  allAttendance: any[];
  onSelect?: (empId: string) => void;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}

export const EmployeewiseOnSiteModal: React.FC<Props> = ({
  visible,
  onClose,
  employees,
  allAttendance,
  onSelect,
  isRefreshing,
  onRefresh,
}) => {
  // ── Pulse animation for live indicator ──────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isRefreshing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isRefreshing]);

  // ── SOURCE OF TRUTH: Filter attendance collection for records without dutyEnd ─
  // This is the correct approach: drive the list directly from active attendance
  // records, not from the employees array. One record = one active session.
  const activeRecords = useMemo(
    () => allAttendance.filter(a => !a.dutyEnd),
    [allAttendance]
  );

  // ── Worker-wise: deduplicate by employeeId (take the most recent session per worker) ─
  const workerMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const att of activeRecords) {
      const empId = String(att.employeeId?._id || att.employeeId || '');
      if (!empId) continue;
      // Keep the most recent dutyStart per employee
      if (!map.has(empId) || new Date(att.dutyStart) > new Date(map.get(empId).dutyStart)) {
        map.set(empId, att);
      }
    }
    return map;
  }, [activeRecords]);

  // Build display list: resolve full employee data from employees[] lookup,
  // fall back to data embedded in the attendance record itself.
  const onDutyItems = useMemo(() => {
    return Array.from(workerMap.entries()).map(([empId, att]) => {
      const found = employees.find(e => String(e._id) === empId);
      const empObj = found || att.employeeId || {};
      return { empId, att, empObj };
    });
  }, [workerMap, employees]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* ── Header ───────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.title}>On-Duty Staff</Text>
                <Animated.View
                  style={[
                    styles.liveDot,
                    { opacity: pulseAnim, backgroundColor: isRefreshing ? '#f59e0b' : '#22c55e' },
                  ]}
                />
                {isRefreshing && <Text style={styles.liveText}>Syncing...</Text>}
              </View>
              <Text style={styles.subtitle}>
                {onDutyItems.length} worker{onDutyItems.length !== 1 ? 's' : ''} currently on duty · Live
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {onRefresh && (
                <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
                  <Ionicons name="refresh" size={18} color={COLORS.primary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── List ─────────────────────────────────────────────────────── */}
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {onDutyItems.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="people-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No staff currently on duty</Text>
              </View>
            ) : (
              onDutyItems.map(({ empId, att, empObj }) => {
                const name = empObj?.name || att.employee_name || 'Staff Member';
                const enr  = empObj?.enrollment_no;
                const displayName = name + (enr ? ` (${enr})` : '');
                const siteName = att.site_name || att.leadId?.sender_name || 'Project Site';
                const sinceTime = att.dutyStart
                  ? new Date(att.dutyStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : '';

                return (
                  <TouchableOpacity
                    key={att._id || empId}
                    style={styles.card}
                    onPress={() => onSelect && onSelect(empId)}
                    activeOpacity={0.8}
                  >
                    {/* Avatar */}
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{name[0]?.toUpperCase() || '?'}</Text>
                    </View>

                    {/* Info */}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.empName}>{displayName}</Text>
                      <View style={styles.dutyInfo}>
                        <Ionicons name="business" size={11} color="#16a34a" />
                        <Text style={styles.dutyText} numberOfLines={1}>{siteName}</Text>
                      </View>
                      {sinceTime ? (
                        <View style={styles.dutyInfo}>
                          <Ionicons name="time-outline" size={11} color="#64748b" />
                          <Text style={styles.timeText}>Since {sinceTime}</Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Badge */}
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>ON DUTY</Text>
                    </View>
                  </TouchableOpacity>
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
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  container:    { backgroundColor: '#fff', flex: 1 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  title:        { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  subtitle:     { fontSize: 11, color: '#64748b', marginTop: 2 },
  closeBtn:     { padding: 4 },
  refreshBtn:   { padding: 4, borderRadius: 8, backgroundColor: '#f1f5f9' },
  liveDot:      { width: 8, height: 8, borderRadius: 4 },
  liveText:     { fontSize: 10, fontWeight: '700', color: '#f59e0b' },
  scrollContent:{ padding: 16 },
  card:         { backgroundColor: '#fff', borderRadius: 16, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, elevation: 1 },
  avatar:       { width: 42, height: 42, borderRadius: 21, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText:   { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  empName:      { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  dutyInfo:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  dutyText:     { fontSize: 11, color: '#16a34a', fontWeight: '700', flex: 1 },
  timeText:     { fontSize: 10, color: '#64748b', fontWeight: '600' },
  statusBadge:  { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#dcfce7' },
  statusText:   { fontSize: 9, fontWeight: '900', color: '#16a34a' },
  empty:        { padding: 60, alignItems: 'center' },
  emptyText:    { color: '#94a3b8', marginTop: 8, fontWeight: '600', fontSize: 14 },
});
