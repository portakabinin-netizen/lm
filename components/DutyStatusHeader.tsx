/**
 * DutyStatusHeader.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays on-duty/off-duty status with visual indicators.
 * Used in drawer header, dashboard, and other places where duty status is shown.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Text, View, ViewStyle } from 'react-native';

interface DutyStatusHeaderProps {
  status: 'ON' | 'OFF';
  dutyLabel?: string;
  siteName?: string;
  duration?: string;
  isOutOfBounds?: boolean;
  containerStyle?: ViewStyle;
  showDetails?: boolean;
}

/**
 * BlinkingDot - animated indicator for ON duty status
 */
const BlinkingDot = ({ size = 8 }: { size?: number }) => {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.15, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#10b981',
        opacity,
      }}
    />
  );
};

/**
 * DutyStatusHeader - main component
 */
export const DutyStatusHeader: React.FC<DutyStatusHeaderProps> = ({
  status,
  dutyLabel,
  siteName,
  duration,
  isOutOfBounds,
  containerStyle,
  showDetails = true,
}) => {
  const statusColor = status === 'ON' ? (isOutOfBounds ? '#ef4444' : '#10b981') : '#ef4444';

  const displayLabel = dutyLabel || (status === 'ON' ? 'ON DUTY' : 'OFF DUTY');

  return (
    <View style={containerStyle}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {status === 'ON' ? (
          <BlinkingDot size={8} />
        ) : (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' }} />
        )}
        <Text
          style={{
            color: statusColor,
            fontSize: 12,
            fontWeight: '800',
            letterSpacing: 0.6,
          }}
        >
          {displayLabel}
        </Text>

        {showDetails && status === 'ON' && (duration || siteName) && (
          <Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: '600' }}>
            {duration && `· ${duration}`}
            {siteName && ` · ${siteName}`}
          </Text>
        )}

        {isOutOfBounds && <Ionicons name="warning" size={14} color="#ef4444" />}
      </View>
    </View>
  );
};

export default DutyStatusHeader;
