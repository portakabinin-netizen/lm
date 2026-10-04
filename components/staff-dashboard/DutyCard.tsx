import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TOKENS } from './theme/tokens';
import { dashboardStyles } from './theme/styles';
import { Language, t } from './i18n';

interface DutyCardProps {
  dbDutyStatus: 'ON' | 'OFF';
  isOutOfBounds: boolean;
  dutyLabel: string;
  dutyColor: string;
  dbActiveDuty: any;
  formatDuration: (start: string) => string;
  selectedSite: any;
  assignedShiftDetails: any;
  setShowPicker: (show: boolean) => void;
  isOwnWorker: boolean;
  canWorkerEndDuty: boolean;
  setEmergencyModalVisible: (visible: boolean) => void;
  handlePunchIn: () => void;
  handlePunchOut: () => void;
  dutyLoading: boolean;
  dutyStatus: 'ON' | 'OFF';
  isShiftComplete: boolean;
  continueShift: () => void;
  latestBroadcast: string;
  unseenCount: number;
  setChatVisible: (visible: boolean) => void;
  handleCallSupervisor: () => void;
  workerLocation?: { latitude: number; longitude: number };
  language: Language;
}

export const DutyCard: React.FC<DutyCardProps> = ({
  dbDutyStatus,
  isOutOfBounds,
  dutyLabel,
  dutyColor,
  dbActiveDuty,
  formatDuration,
  selectedSite,
  assignedShiftDetails,
  setShowPicker,
  isOwnWorker,
  canWorkerEndDuty,
  setEmergencyModalVisible,
  handlePunchIn,
  handlePunchOut,
  dutyLoading,
  dutyStatus,
  isShiftComplete,
  continueShift,
  latestBroadcast,
  unseenCount,
  setChatVisible,
  handleCallSupervisor,
  workerLocation,
  language,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (dbDutyStatus === 'ON') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [dbDutyStatus, pulseAnim]);

  const renderMapThumbnail = () => {
    if (!workerLocation || !selectedSite?.location?.lat || !selectedSite?.location?.long) {
      return null;
    }
    return (
      <View style={styles.mapContainer}>
        <View style={[styles.map, { backgroundColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center' }]}>
           <Text style={{ color: TOKENS.colors.text.muted, fontSize: TOKENS.typography.size.xs }}>Map View Placeholder</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={dashboardStyles.card}>
      {/* ── Site Selector (only when OFF duty) ─────────── */}
      {dbDutyStatus === 'OFF' && (
        <View style={{ marginBottom: TOKENS.spacing.lg }}>
          <Text style={styles.sectionLabel}>{t('SELECT SITE & SHIFT', language)}</Text>
          <TouchableOpacity onPress={() => setShowPicker(true)} style={styles.selectorRow}>
            <Ionicons name="location" size={16} color={TOKENS.colors.secondary} style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.siteName}>
                {selectedSite ? selectedSite.sender_name : t('Select Work Site...', language)}
              </Text>
              {selectedSite?.distance !== undefined && (
                <Text style={styles.distanceText}>
                  {(selectedSite.distance / 1000).toFixed(2)} km away
                </Text>
              )}
            </View>
            <Ionicons name="chevron-down" size={16} color={TOKENS.colors.text.secondaryDark} />
          </TouchableOpacity>

          <Text style={[styles.sectionLabel, { marginTop: TOKENS.spacing.md }]}>{t('ASSIGNED SHIFT', language)}</Text>
          <View style={[styles.selectorRow, { backgroundColor: TOKENS.colors.background.light }]}>
            <View style={styles.shiftDot} />
            <View>
              <Text style={styles.shiftName}>
                {t(assignedShiftDetails?.shiftName ?? 'General', language)}
              </Text>
              <Text style={styles.shiftTime}>
                {assignedShiftDetails?.startTime} – {assignedShiftDetails?.endTime} (
                {assignedShiftDetails?.durationHrs} Hrs)
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* ── Duty Status Hero ────────────────────────────── */}
      <View style={styles.heroContainer}>
        <View style={styles.statusRingContainer}>
          {dbDutyStatus === 'ON' && (
            <Animated.View
              style={[
                styles.pulseRing,
                { transform: [{ scale: pulseAnim }], borderColor: dutyColor },
              ]}
            />
          )}
          <View style={[styles.statusInnerRing, { backgroundColor: dutyColor + '20' }]}>
            <Ionicons
              name={dbDutyStatus === 'ON' ? 'briefcase' : 'moon'}
              size={32}
              color={dutyColor}
            />
          </View>
        </View>
        
        <Text style={[styles.heroStatusText, { color: dutyColor }]}>{dutyLabel}</Text>
        
        {dbDutyStatus === 'ON' && dbActiveDuty?.dutyStart && (
          <Text style={styles.heroDurationText}>
            ⏱ {formatDuration(dbActiveDuty.dutyStart)}
          </Text>
        )}
      </View>

      {dbDutyStatus === 'ON' && (
        <View style={styles.onDutyDetails}>
          <Text style={styles.onDutySite}>
            📍 {dbActiveDuty?.site_name ? t(dbActiveDuty.site_name, language) : t('Project Site', language)}
          </Text>
          {dbActiveDuty?.markedByDevice === false && (
            <Text style={styles.supervisorMarked}>
              👤 {t('Started by:', language)} {dbActiveDuty?.markedByUserName ?? t('Supervisor', language)}
            </Text>
          )}
          {isOutOfBounds && (
            <Text style={styles.outOfBoundsWarning}>
              ⚠️ {t('You are not at the work site', language)}
            </Text>
          )}
          {renderMapThumbnail()}
        </View>
      )}

      {/* ── Punch Buttons ──────────────────────────────── */}
      <View style={styles.punchBtnContainer}>
        {dbDutyStatus === 'ON' && isOwnWorker && !canWorkerEndDuty && (
          <TouchableOpacity
            onPress={() => setEmergencyModalVisible(true)}
            style={styles.emergencyBtn}
            activeOpacity={0.8}
          >
            <Ionicons name="warning-outline" size={24} color={TOKENS.colors.text.light} />
          </TouchableOpacity>
        )}

        {dbDutyStatus === 'OFF' ? (
          <TouchableOpacity
            onPress={handlePunchIn}
            disabled={dutyLoading || !selectedSite}
            style={[
              styles.punchBtn,
              { backgroundColor: selectedSite ? TOKENS.colors.secondary : TOKENS.colors.text.muted },
            ]}
            activeOpacity={0.85}
          >
            {dutyLoading ? (
              <ActivityIndicator color={TOKENS.colors.text.light} />
            ) : (
              <>
                <Ionicons name="finger-print" size={24} color={TOKENS.colors.text.light} />
                <Text style={styles.punchBtnText}>{t('Punch In', language).toUpperCase()}</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handlePunchOut}
            disabled={dutyLoading}
            style={[
              styles.punchBtn,
              {
                backgroundColor: canWorkerEndDuty ? TOKENS.colors.danger : TOKENS.colors.text.muted,
                opacity: canWorkerEndDuty ? 1 : 0.6,
              },
            ]}
            activeOpacity={0.85}
          >
            {dutyLoading ? (
              <ActivityIndicator color={TOKENS.colors.text.light} />
            ) : (
              <>
                <Ionicons name="exit" size={24} color={TOKENS.colors.text.light} />
                <Text style={styles.punchBtnText}>
                  {canWorkerEndDuty ? t('Punch Out', language).toUpperCase() : 'LOCKED'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Continue Next Shift (Double Shift) */}
      {dutyStatus === 'ON' && isShiftComplete && (
        <View style={styles.shiftCompleteCard}>
          <View style={styles.shiftCompleteHeader}>
            <Ionicons name="alert-circle" size={16} color={TOKENS.colors.warning} />
            <Text style={styles.shiftCompleteTitle}>{t('Shift Complete — Continue?', language)}</Text>
          </View>
          <Text style={styles.shiftCompleteText}>
            {t('Your shift has ended. End duty now or start a continued (double) shift.\n⚠️ Supervisors will be notified.', language)}
          </Text>
          <TouchableOpacity
            onPress={() => continueShift()}
            disabled={dutyLoading}
            style={styles.continueBtn}
            activeOpacity={0.8}
          >
            <Text style={styles.continueBtnText}>
              {t('Continue Shift', language)}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: TOKENS.typography.size.xs,
    fontWeight: TOKENS.typography.weight.extrabold,
    color: TOKENS.colors.text.muted,
    letterSpacing: 0.6,
    marginBottom: TOKENS.spacing.sm,
  },
  selectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: TOKENS.spacing.md,
    backgroundColor: TOKENS.colors.background.white,
    borderRadius: TOKENS.radius.md,
    borderWidth: 1,
    borderColor: TOKENS.colors.border.dark,
  },
  siteName: {
    color: TOKENS.colors.text.dark,
    fontSize: TOKENS.typography.size.sm,
    fontWeight: TOKENS.typography.weight.bold,
  },
  distanceText: {
    color: TOKENS.colors.text.secondaryDark,
    fontSize: TOKENS.typography.size.xs,
    marginTop: 2,
  },
  shiftDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: TOKENS.colors.info,
    marginRight: TOKENS.spacing.md,
  },
  shiftName: {
    fontSize: TOKENS.typography.size.md,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.text.dark,
  },
  shiftTime: {
    fontSize: TOKENS.typography.size.xs,
    color: TOKENS.colors.text.secondaryDark,
    marginTop: 2,
  },
  heroContainer: {
    alignItems: 'center',
    marginVertical: TOKENS.spacing.lg,
  },
  statusRingContainer: {
    width: 100,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: TOKENS.spacing.md,
  },
  pulseRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
  },
  statusInnerRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroStatusText: {
    fontSize: TOKENS.typography.size.xl,
    fontWeight: TOKENS.typography.weight.extrabold,
  },
  heroDurationText: {
    fontSize: TOKENS.typography.size.lg,
    fontWeight: TOKENS.typography.weight.bold,
    color: TOKENS.colors.secondary,
    marginTop: TOKENS.spacing.sm,
  },
  onDutyDetails: {
    alignItems: 'center',
    marginBottom: TOKENS.spacing.lg,
  },
  onDutySite: {
    fontSize: TOKENS.typography.size.sm,
    color: TOKENS.colors.text.dark,
    fontWeight: TOKENS.typography.weight.semibold,
  },
  supervisorMarked: {
    fontSize: TOKENS.typography.size.xs,
    color: TOKENS.colors.warning,
    fontWeight: TOKENS.typography.weight.bold,
    marginTop: 4,
  },
  outOfBoundsWarning: {
    fontSize: TOKENS.typography.size.xs,
    color: TOKENS.colors.danger,
    marginTop: 4,
  },
  mapContainer: {
    width: '100%',
    height: 120,
    borderRadius: TOKENS.radius.md,
    overflow: 'hidden',
    marginTop: TOKENS.spacing.md,
    borderWidth: 1,
    borderColor: TOKENS.colors.border.dark,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  workerPin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(2, 132, 199, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  workerPinInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TOKENS.colors.info,
  },
  punchBtnContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: TOKENS.spacing.sm,
  },
  emergencyBtn: {
    backgroundColor: TOKENS.colors.warning,
    width: 56,
    height: 56,
    borderRadius: TOKENS.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  punchBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 56,
    borderRadius: TOKENS.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    gap: TOKENS.spacing.sm,
  },
  punchBtnText: {
    color: TOKENS.colors.text.light,
    fontSize: TOKENS.typography.size.md,
    fontWeight: TOKENS.typography.weight.extrabold,
    letterSpacing: 1,
  },
  infoStrip: {
    flexDirection: 'row',
    backgroundColor: '#fef3c7',
    padding: TOKENS.spacing.md,
    borderRadius: TOKENS.radius.sm,
    marginTop: TOKENS.spacing.md,
  },
  infoStripText: {
    fontSize: TOKENS.typography.size.xs,
    color: '#92400E',
    flex: 1,
    lineHeight: 16,
  },
  shiftCompleteCard: {
    backgroundColor: '#fffbeb',
    borderRadius: TOKENS.radius.md,
    padding: TOKENS.spacing.md,
    marginTop: TOKENS.spacing.md,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  shiftCompleteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  shiftCompleteTitle: {
    fontSize: TOKENS.typography.size.sm,
    fontWeight: TOKENS.typography.weight.extrabold,
    color: TOKENS.colors.warning,
  },
  shiftCompleteText: {
    fontSize: TOKENS.typography.size.xs,
    color: '#92400E',
    lineHeight: 16,
    marginBottom: TOKENS.spacing.md,
  },
  continueBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7',
    paddingHorizontal: TOKENS.spacing.md,
    paddingVertical: TOKENS.spacing.sm,
    borderRadius: TOKENS.radius.sm,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  continueBtnText: {
    fontSize: TOKENS.typography.size.xs,
    fontWeight: TOKENS.typography.weight.extrabold,
    color: '#d97706',
  },
});
