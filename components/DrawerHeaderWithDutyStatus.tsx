/**
 * DrawerHeaderWithDutyStatus.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Custom drawer header that shows duty status at the top.
 * Integrated into the drawer navigation.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DutyStatusHeader from './DutyStatusHeader';

interface DrawerHeaderWithDutyStatusProps {
  dutyStatus: 'ON' | 'OFF';
  userName: string;
  userRole?: string;
  siteName?: string;
  duration?: string;
  isOutOfBounds?: boolean;
  onClose?: () => void;
}

export const DrawerHeaderWithDutyStatus: React.FC<DrawerHeaderWithDutyStatusProps> = ({
  dutyStatus,
  userName,
  userRole,
  siteName,
  duration,
  isOutOfBounds,
  onClose,
}) => {
  const statusColor = dutyStatus === 'ON' ? (isOutOfBounds ? '#ef4444' : '#10b981') : '#ef4444';

  return (
    <LinearGradient
      colors={['#0f172a', '#1e3a5f']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      {/* Close button in top-right */}
      <TouchableOpacity style={styles.closeButton} onPress={onClose}>
        <Ionicons name="close" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Duty Status Indicator - Prominent */}
      <View style={styles.statusSection}>
        <DutyStatusHeader
          status={dutyStatus}
          dutyLabel={
            dutyStatus === 'ON' ? (isOutOfBounds ? 'OUT OF BOUNDS' : 'ON DUTY') : 'OFF DUTY'
          }
          siteName={siteName}
          duration={duration}
          isOutOfBounds={isOutOfBounds}
          showDetails={true}
          containerStyle={styles.dutyStatusContainer}
        />

        <View style={styles.statusBadge}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>
            {dutyStatus === 'ON' ? '🟢 ACTIVE' : '🔴 INACTIVE'}
          </Text>
        </View>
      </View>

      {/* User Info */}
      <View style={styles.userInfoSection}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>
            {userName
              .split(' ')
              .map((word) => word[0])
              .join('')
              .toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName} numberOfLines={1}>
            {userName}
          </Text>
          {userRole && (
            <Text style={styles.userRole} numberOfLines={1}>
              {userRole}
            </Text>
          )}
        </View>
      </View>

      {/* Quick Stats */}
      {dutyStatus === 'ON' && siteName && (
        <View style={styles.quickStats}>
          <View style={styles.statItem}>
            <Ionicons name="location" size={14} color="#94a3b8" />
            <Text style={styles.statText} numberOfLines={1}>
              {siteName}
            </Text>
          </View>
          {duration && (
            <View style={styles.statItem}>
              <Ionicons name="time" size={14} color="#94a3b8" />
              <Text style={styles.statText}>{duration}</Text>
            </View>
          )}
        </View>
      )}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    paddingTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    right: 16,
    padding: 4,
  },
  statusSection: {
    marginBottom: 12,
  },
  dutyStatusContainer: {
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  userInfoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 12,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  userRole: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  quickStats: {
    gap: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 6,
  },
  statText: {
    fontSize: 11,
    color: '#cbd5e1',
    fontWeight: '500',
    flex: 1,
  },
});

export default DrawerHeaderWithDutyStatus;
