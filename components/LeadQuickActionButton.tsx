/**
 * 🎯 LeadQuickActionButton.tsx
 *
 * PURPOSE:
 * Reusable quick action button component for lead enquiry.
 * Displays configurable button based on site shift status.
 *
 * USAGE:
 * <LeadQuickActionButton
 *   lead={lead}
 *   onPress={(lead) => openEnquiry(lead)}
 *   loading={isLoading}
 * />
 */

import LeadsEnquiryService from '@/UtilServices/LeadsEnquiryService';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

export interface LeadQuickActionButtonProps {
  lead: any;
  onPress: (lead: any) => void | Promise<void>;
  loading?: boolean;
  size?: 'small' | 'medium' | 'large';
  variant?: 'compact' | 'expanded';
  disabled?: boolean;
  testID?: string;
  containerStyle?: ViewStyle;
  style?: ViewStyle;
}

/**
 * 🎨 LeadQuickActionButton Component
 */
export const LeadQuickActionButton: React.FC<LeadQuickActionButtonProps> = ({
  lead,
  onPress,
  loading = false,
  size = 'medium',
  variant = 'compact',
  disabled = false,
  testID,
  containerStyle,
  style,
}) => {
  const hasShifts = useMemo(() => LeadsEnquiryService.hasSiteShifts(lead), [lead]);
  const buttonStyle = useMemo(
    () => LeadsEnquiryService.getQuickActionButtonStyle(hasShifts),
    [hasShifts]
  );

  const styles = useMemo(() => getStyles(size, variant), [size, variant]);

  const lastTapRef = useRef<number>(0);

  const handlePress = async () => {
    const now = Date.now();
    const DOUBLE_PRESS_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_PRESS_DELAY) {
      if (!disabled && !loading) {
        try {
          await onPress(lead);
        } catch (err) {
          console.error('LeadQuickActionButton error:', err);
        }
      }
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  if (variant === 'compact') {
    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled || loading}
        style={[
          styles.compactContainer,
          {
            backgroundColor: buttonStyle.backgroundColor,
            borderColor: buttonStyle.borderColor,
          },
          containerStyle,
          style,
        ]}
        activeOpacity={0.6}
        testID={testID}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {loading ? (
          <ActivityIndicator
            size={size === 'small' ? 'small' : 'small'}
            color={buttonStyle.iconColor}
          />
        ) : (
          <Ionicons name="settings-outline" size={13} color={buttonStyle.iconColor} />
        )}
        <Text style={[styles.compactText, { color: buttonStyle.textColor }]} numberOfLines={1}>
          {hasShifts ? '📋 Enquiry' : '🚫 Setup'}
        </Text>
      </TouchableOpacity>
    );
  }

  // Expanded variant
  return (
    <View style={[styles.expandedContainer, containerStyle]}>
      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled || loading}
        style={[
          styles.expandedButton,
          {
            backgroundColor: buttonStyle.backgroundColor,
            borderColor: buttonStyle.borderColor,
          },
          style,
        ]}
        activeOpacity={0.6}
        testID={testID}
      >
        <View style={styles.expandedContent}>
          {loading ? (
            <ActivityIndicator
              size={size === 'small' ? 'small' : 'small'}
              color={buttonStyle.iconColor}
            />
          ) : (
            <Ionicons
              name={hasShifts ? 'settings-outline' : 'add-circle'}
              size={size === 'small' ? 14 : 16}
              color={buttonStyle.iconColor}
            />
          )}
          <View style={styles.expandedTextContainer}>
            <Text
              style={[styles.expandedLabel, { color: buttonStyle.textColor }]}
              numberOfLines={1}
            >
              {hasShifts ? 'Enquiry' : 'Setup Shifts'}
            </Text>
            <Text
              style={[styles.expandedDescription, { color: buttonStyle.textColor + 'CC' }]}
              numberOfLines={1}
            >
              {hasShifts ? 'View/edit shifts' : 'Configure shifts'}
            </Text>
          </View>
        </View>
        {!loading && <Ionicons name="chevron-forward" size={14} color={buttonStyle.iconColor} />}
      </TouchableOpacity>
    </View>
  );
};

/**
 * 🎨 StyleSheet Generator
 */
const getStyles = (size: string, variant: string) => {
  const compactSizes = {
    small: { height: 28, paddingHorizontal: 8, gap: 4 },
    medium: { height: 36, paddingHorizontal: 10, gap: 6 },
    large: { height: 44, paddingHorizontal: 12, gap: 8 },
  };

  const expandedSizes = {
    small: { paddingVertical: 8, paddingHorizontal: 10, gap: 8 },
    medium: { paddingVertical: 10, paddingHorizontal: 12, gap: 10 },
    large: { paddingVertical: 12, paddingHorizontal: 14, gap: 12 },
  };

  const compactSize = compactSizes[size as keyof typeof compactSizes] || compactSizes.medium;
  const expandedSize = expandedSizes[size as keyof typeof expandedSizes] || expandedSizes.medium;

  return StyleSheet.create({
    compactContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: compactSize.gap,
      borderRadius: 8,
      paddingHorizontal: compactSize.paddingHorizontal,
      height: compactSize.height,
      borderWidth: 1,
    } as ViewStyle,
    compactText: {
      fontSize: size === 'small' ? 10 : size === 'large' ? 12 : 11,
      fontWeight: '700',
    } as TextStyle,
    expandedContainer: {
      width: '100%',
    } as ViewStyle,
    expandedButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: expandedSize.paddingVertical,
      paddingHorizontal: expandedSize.paddingHorizontal,
      borderRadius: 10,
      borderWidth: 1,
    } as ViewStyle,
    expandedContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: expandedSize.gap,
      flex: 1,
    } as ViewStyle,
    expandedTextContainer: {
      flex: 1,
    } as ViewStyle,
    expandedLabel: {
      fontSize: size === 'small' ? 12 : size === 'large' ? 15 : 13,
      fontWeight: '800',
    } as TextStyle,
    expandedDescription: {
      fontSize: size === 'small' ? 10 : 11,
      fontWeight: '500',
      marginTop: 2,
    } as TextStyle,
  });
};

export default LeadQuickActionButton;
