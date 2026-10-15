import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TOKENS } from '../theme/tokens';

interface MonthPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  customMonth: Date;
  onSelectMonth: (date: Date) => void;
}

export const MonthPickerSheet: React.FC<MonthPickerSheetProps> = ({
  visible,
  onClose,
  customMonth,
  onSelectMonth,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalCentered}>
        <View style={styles.modalSheet}>
          <Text style={styles.title}>Select Month</Text>
          <ScrollView style={styles.scrollView}>
            {Array.from({ length: 12 }).map((_, i) => {
              const d = new Date();
              d.setMonth(d.getMonth() - i);
              const isSelected =
                customMonth.getMonth() === d.getMonth() &&
                customMonth.getFullYear() === d.getFullYear();

              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.pickerItem, isSelected && { backgroundColor: '#f0fdf4' }]}
                  onPress={() => {
                    onSelectMonth(new Date(d));
                    onClose();
                  }}
                >
                  <Text style={[styles.pickerItemTitle, isSelected && { color: TOKENS.colors.secondary }]}>
                    {d.toLocaleString('default', { month: 'long', year: 'numeric' })}
                  </Text>
                  {isSelected && <Ionicons name="checkmark-circle" size={20} color={TOKENS.colors.secondary} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalCentered: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: TOKENS.spacing.lg,
  },
  modalSheet: {
    backgroundColor: TOKENS.colors.background.white,
    borderRadius: TOKENS.radius.xl,
    maxHeight: 420,
    overflow: 'hidden',
  },
  title: {
    fontSize: TOKENS.typography.size.lg,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.text.dark,
    padding: TOKENS.spacing.lg,
    paddingBottom: TOKENS.spacing.md,
  },
  scrollView: {
    maxHeight: 300,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: TOKENS.spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border.dark,
  },
  pickerItemTitle: {
    fontSize: TOKENS.typography.size.md,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.text.dark,
  },
  closeBtn: {
    backgroundColor: TOKENS.colors.primary,
    margin: TOKENS.spacing.lg,
    paddingVertical: TOKENS.spacing.md,
    borderRadius: TOKENS.radius.sm,
    alignItems: 'center',
  },
  closeBtnText: {
    color: TOKENS.colors.text.light,
    fontWeight: TOKENS.typography.weight.bold,
  },
});
