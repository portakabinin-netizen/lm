import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMissedShiftAlarm } from '@/services/MissedShiftCheckerService';
import { useUserContext } from '@/context/AuthContext';

interface MissedShiftAlarmBannerProps {
  /** If true, positions as a floating emergency banner at the top of the screen */
  floating?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const MissedShiftAlarmBanner: React.FC<MissedShiftAlarmBannerProps> = ({
  floating = false,
  style,
}) => {
  const { user } = useUserContext();
  const role = String(user?.userRole || (user as any)?.role || '').trim().toLowerCase();
  const { activeAlert, isRinging, silenceAlarm } = useMissedShiftAlarm();

  // Pulse animation for the warning icon and glow
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRinging) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRinging]);

  // Isolate missed-shift alarm banner strictly to role="Project"
  if (role !== 'project' || !isRinging) return null;

  const siteName = activeAlert?.siteName || 'Site Shift';
  const shiftName = activeAlert?.shiftName || 'Shift';
  const time = activeAlert?.shiftStartTime ? ` (${activeAlert.shiftStartTime})` : '';

  return (
    <Animated.View
      style={[
        styles.container,
        floating ? styles.floatingContainer : styles.dockedContainer,
        style,
      ]}
    >
      {/* Alert Content Header */}
      <View style={styles.topRow}>
        <View style={styles.leftCol}>
          <View style={styles.titleRow}>
            <Animated.View style={{ opacity: pulseAnim }}>
              <Ionicons name="alert-circle" size={20} color="#dc2626" />
            </Animated.View>
            <Text style={styles.titleText}>⚠️ Shift Attendance Alert</Text>
            <View style={styles.tagBadge}>
              <Text style={styles.tagBadgeText}>Alert Only</Text>
            </View>
          </View>
          <Text style={styles.descText} numberOfLines={2}>
            No attendance marked at <Text style={styles.boldText}>"{siteName}"</Text> for{' '}
            <Text style={styles.boldText}>{shiftName}{time}</Text>.
          </Text>
        </View>

        {/* Prominent Silence Button */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={silenceAlarm}
          style={styles.silenceButton}
          accessibilityLabel="Silence Alarm"
          accessibilityRole="button"
        >
          <Ionicons name="volume-mute" size={18} color="#ffffff" />
          <Text style={styles.silenceButtonText}>Silence</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff1f2',
    borderColor: '#fca5a5',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  floatingContainer: {
    position: 'absolute',
    top: 52,
    left: 14,
    right: 14,
    zIndex: 99999,
  },
  dockedContainer: {
    marginHorizontal: 12,
    marginVertical: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  leftCol: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  titleText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#991b1b',
    letterSpacing: 0.2,
  },
  tagBadge: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#b91c1c',
  },
  descText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },
  boldText: {
    fontWeight: '800',
    color: '#0f172a',
  },
  silenceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dc2626',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    shadowColor: '#991b1b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  silenceButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});

export default MissedShiftAlarmBanner;
