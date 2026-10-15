import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TOKENS } from '../theme/tokens';
import { Language, t } from '../i18n';

interface AttendanceDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  attFilter: 'week' | 'month' | 'custom';
  setAttFilter: (filter: 'week' | 'month' | 'custom') => void;
  customMonth: Date;
  onOpenMonthPicker: () => void;
  siteWiseAttendance: [string, number][];
  language: Language;
}

const EmptyState = ({ text }: { text: string }) => (
  <View style={{ padding: 24, alignItems: 'center' }}>
    <Ionicons name="search-outline" size={36} color="#cbd5e1" />
    <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 8 }}>{text}</Text>
  </View>
);

export const AttendanceDetailSheet: React.FC<AttendanceDetailSheetProps> = ({
  visible,
  onClose,
  attFilter,
  setAttFilter,
  customMonth,
  onOpenMonthPicker,
  siteWiseAttendance,
  language,
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Attendance Breakdown</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close-circle" size={26} color="#64748b" />
            </TouchableOpacity>
          </View>

          {/* Filter pills */}
          <View style={styles.filterContainer}>
            {(['week', 'month', 'custom'] as const).map((f) => (
              <TouchableOpacity
                key={f}
                onPress={() => (f === 'custom' ? onOpenMonthPicker() : setAttFilter(f))}
                style={[styles.filterPill, attFilter === f && styles.filterPillActive]}
              >
                <Text style={[styles.filterPillText, attFilter === f && { color: TOKENS.colors.text.light }]}>
                  {f === 'week'
                    ? 'THIS WEEK'
                    : f === 'month'
                      ? 'THIS MONTH'
                      : attFilter === 'custom'
                        ? customMonth.toLocaleString('default', { month: 'short', year: '2-digit' }).toUpperCase()
                        : 'SELECT MONTH'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {siteWiseAttendance.length === 0 ? (
              <EmptyState text="No records for this period" />
            ) : (
              siteWiseAttendance.map(([site, count], i) => (
                <View key={i} style={styles.pickerItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerItemTitle}>{site}</Text>
                    <Text style={styles.pickerItemSub}>{count} Days Present</Text>
                  </View>
                  <View style={styles.distanceBadge}>
                    <Text style={styles.distanceText}>PRESENT</Text>
                  </View>
                </View>
              ))
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: TOKENS.colors.background.white,
    borderTopLeftRadius: TOKENS.radius.xl,
    borderTopRightRadius: TOKENS.radius.xl,
    maxHeight: '80%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: TOKENS.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border.dark,
  },
  modalTitle: {
    fontSize: TOKENS.typography.size.lg,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.text.dark,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: TOKENS.spacing.sm,
    paddingHorizontal: TOKENS.spacing.lg,
    paddingVertical: TOKENS.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border.dark,
  },
  filterPill: {
    paddingVertical: TOKENS.spacing.sm,
    paddingHorizontal: TOKENS.spacing.md,
    borderRadius: TOKENS.radius.full,
    backgroundColor: TOKENS.colors.border.dark,
  },
  filterPillActive: {
    backgroundColor: TOKENS.colors.secondary,
  },
  filterPillText: {
    fontSize: TOKENS.typography.size.xs,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.text.secondaryDark,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: TOKENS.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  pickerItemTitle: {
    fontSize: TOKENS.typography.size.md,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.text.dark,
  },
  pickerItemSub: {
    fontSize: TOKENS.typography.size.sm,
    color: TOKENS.colors.text.secondaryDark,
    marginTop: 2,
  },
  distanceBadge: {
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: TOKENS.radius.md,
  },
  distanceText: {
    fontSize: TOKENS.typography.size.xs,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.secondary,
  },
});
