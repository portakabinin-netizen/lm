import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TOKENS } from '../theme/tokens';
import { Language, t } from '../i18n';

interface EmergencyOffSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  language: Language;
}

export const EmergencyOffSheet: React.FC<EmergencyOffSheetProps> = ({
  visible,
  onClose,
  onSubmit,
  language,
}) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(reason);
      setReason('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.modalCentered}>
        <View style={styles.emergencySheet}>
          <View style={styles.header}>
            <Ionicons name="warning" size={22} color={TOKENS.colors.warning} />
            <Text style={styles.title}>{t('Emergency Duty Off', language)}</Text>
          </View>
          <Text style={styles.subtitle}>
            {t('Enter the reason for leaving early. This will be sent to all admins and recorded.', language)}
          </Text>
          <TextInput
            placeholder={t('Enter reason…', language)}
            placeholderTextColor={TOKENS.colors.text.secondaryDark}
            value={reason}
            onChangeText={setReason}
            multiline
            style={styles.input}
            textAlignVertical="top"
          />
          <View style={styles.actions}>
            <TouchableOpacity onPress={handleClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>{t('Cancel', language)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting || !reason.trim()}
              style={[
                styles.submitBtn,
                { opacity: submitting || !reason.trim() ? 0.6 : 1 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={TOKENS.colors.text.light} />
              ) : (
                <Text style={styles.submitText}>{t('Submit', language)}</Text>
              )}
            </TouchableOpacity>
          </View>
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
  emergencySheet: {
    backgroundColor: TOKENS.colors.background.main,
    borderRadius: TOKENS.radius.lg,
    padding: TOKENS.spacing.xl,
    borderWidth: 1,
    borderColor: TOKENS.colors.border.light,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: TOKENS.spacing.md,
  },
  title: {
    color: TOKENS.colors.text.light,
    fontSize: TOKENS.typography.size.lg,
    fontWeight: TOKENS.typography.weight.extrabold,
  },
  subtitle: {
    color: TOKENS.colors.text.muted,
    fontSize: TOKENS.typography.size.sm,
    marginBottom: TOKENS.spacing.md,
    lineHeight: 19,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    color: TOKENS.colors.text.light,
    borderRadius: TOKENS.radius.sm,
    padding: TOKENS.spacing.md,
    height: 100,
    fontSize: TOKENS.typography.size.md,
    borderWidth: 1,
    borderColor: TOKENS.colors.border.light,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: TOKENS.spacing.md,
    marginTop: TOKENS.spacing.lg,
  },
  cancelBtn: {
    paddingVertical: TOKENS.spacing.md,
    paddingHorizontal: TOKENS.spacing.lg,
    borderRadius: TOKENS.radius.sm,
    backgroundColor: 'transparent',
  },
  cancelText: {
    color: TOKENS.colors.text.light,
    fontWeight: TOKENS.typography.weight.bold,
  },
  submitBtn: {
    paddingVertical: TOKENS.spacing.md,
    paddingHorizontal: TOKENS.spacing.lg,
    borderRadius: TOKENS.radius.sm,
    backgroundColor: TOKENS.colors.danger,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: TOKENS.colors.text.light,
    fontWeight: TOKENS.typography.weight.bold,
  },
});
