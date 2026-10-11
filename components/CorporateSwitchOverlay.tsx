import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUserContext } from '@/context/AuthContext';
import { COLORS } from '@/styles/stylesIndex';

export const CorporateSwitchOverlay: React.FC = () => {
  const { switchingCorp } = useUserContext() as any;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (switchingCorp?.isSwitching) {
      // Pulsing glow animation
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );

      // Subtle rotation for background ring
      const rotate = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 3500,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );

      pulse.start();
      rotate.start();

      return () => {
        pulse.stop();
        rotate.stop();
      };
    } else {
      pulseAnim.setValue(1);
      rotateAnim.setValue(0);
    }
  }, [switchingCorp?.isSwitching, pulseAnim, rotateAnim]);

  if (!switchingCorp?.isSwitching) {
    return null;
  }

  const seconds = switchingCorp.elapsedSeconds ?? 0;
  const targetName = switchingCorp.targetCorpName || 'Corporate Workspace';

  // Dynamic progressive status text
  let statusText = 'Connecting to workspace…';
  if (seconds >= 6) {
    statusText = 'Syncing data & permissions… Almost done!';
  } else if (seconds >= 3) {
    statusText = 'Loading corporate profile & settings…';
  }

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Modal
      visible={switchingCorp.isSwitching}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.cardContainer}>
          {/* Animated Glowing Icon Container */}
          <View style={styles.iconWrapper}>
            <Animated.View
              style={[
                styles.outerGlowRing,
                {
                  transform: [{ scale: pulseAnim }, { rotate: spin }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.iconCircle,
                {
                  transform: [{ scale: pulseAnim }],
                },
              ]}
            >
              <Ionicons name="business" size={36} color="#6366f1" />
            </Animated.View>
          </View>

          {/* Spinner */}
          <ActivityIndicator size="large" color="#6366f1" style={styles.spinner} />

          {/* Title */}
          <Text style={styles.title}>Switching Corporate</Text>

          {/* Target Corporate Badge */}
          <View style={styles.corpBadge}>
            <Ionicons name="briefcase-outline" size={15} color="#818cf8" style={{ marginRight: 6 }} />
            <Text style={styles.corpBadgeText} numberOfLines={1}>
              {targetName}
            </Text>
          </View>

          {/* Live Timer Pill Badge */}
          <View style={styles.timerPill}>
            <View style={styles.activeDot} />
            <Text style={styles.timerText}>
              Working… {seconds < 10 ? `0${seconds}` : seconds}s
            </Text>
          </View>

          {/* Dynamic Status Progress */}
          <Text style={styles.statusSubtext}>{statusText}</Text>

          {/* Reassurance Footer */}
          <View style={styles.footerNote}>
            <Ionicons name="shield-checkmark-outline" size={14} color="#10b981" style={{ marginRight: 5 }} />
            <Text style={styles.footerText}>App is active. Please do not close.</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 999999,
  },
  cardContainer: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1e293b',
    borderRadius: 28,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(99, 102, 241, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 24,
  },
  iconWrapper: {
    width: 90,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  outerGlowRing: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 2,
    borderColor: 'rgba(99, 102, 241, 0.4)',
    borderStyle: 'dashed',
  },
  iconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(99, 102, 241, 0.45)',
  },
  spinner: {
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#f8fafc',
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 10,
  },
  corpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    marginBottom: 14,
    maxWidth: '92%',
  },
  corpBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#c7d2fe',
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    marginBottom: 12,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 8,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6ee7b7',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
  },
  statusSubtext: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 18,
    minHeight: 20,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.15)',
    width: '100%',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
});

export default CorporateSwitchOverlay;
