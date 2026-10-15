import React from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { appService } from '../../UtilServices/appHelper';
import { TOKENS } from './theme/tokens';
import { dashboardStyles } from './theme/styles';
import { t } from './i18n';

interface StaffDashboardHeaderProps {
  insetsTop: number;
  name: string;
  imageUrl?: string;
  dbDutyStatus: 'ON' | 'OFF';
  dutyLabel: string;
  dutyColor: string;
  dbActiveDuty: any; // TODO: properly type
  formatDuration: (start: string) => string;
  broadcastUnseenCount: number;
  unseenCount: number;
  setChatVisible: (visible: boolean) => void;
  handleCallSupervisor: () => void;
  language: 'en' | 'hi';
  setLanguage: (lang: 'en' | 'hi') => void;
}

const BlinkingDot = () => {
  const opacity = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.15, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [opacity]);
  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: TOKENS.colors.secondaryLight,
        opacity,
      }}
    />
  );
};

export const StaffDashboardHeader: React.FC<StaffDashboardHeaderProps> = ({
  insetsTop,
  name,
  imageUrl,
  dbDutyStatus,
  dutyLabel,
  dutyColor,
  dbActiveDuty,
  formatDuration,
  broadcastUnseenCount,
  unseenCount,
  setChatVisible,
  handleCallSupervisor,
  language,
  setLanguage,
}) => {
  return (
    <LinearGradient
      colors={[TOKENS.colors.primary, TOKENS.colors.primaryLight]}
      style={[dashboardStyles.headerGradient, { paddingTop: insetsTop || 20 }]}
    >
      <View style={dashboardStyles.headerRow}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {/* Avatar */}
            {imageUrl ? (
              <Image 
                source={{ 
                  uri: imageUrl.startsWith('http') 
                    ? imageUrl 
                    : `${(appService.httpClient.defaults.baseURL || '').replace(/\/api\/?$/, '')}/${imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl}` 
                }} 
                style={styles.avatar} 
              />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{name ? name.charAt(0).toUpperCase() : 'E'}</Text>
              </View>
            )}
            <View>
              <Text style={dashboardStyles.employeeName} numberOfLines={1}>
                {name || t('Employee', language)}
              </Text>
              <View style={dashboardStyles.dutyStatusContainer}>
                {dbDutyStatus === 'ON' ? (
                  <BlinkingDot />
                ) : (
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: TOKENS.colors.danger,
                    }}
                  />
                )}
                <View style={[styles.statusChip, { borderColor: dutyColor }]}>
                  <Text style={[dashboardStyles.dutyStatusText, { color: dutyColor }]}>
                    {dutyLabel}
                  </Text>
                </View>
              </View>
            </View>
          </View>
          {dbDutyStatus === 'ON' && dbActiveDuty?.dutyStart && (
            <Text style={[dashboardStyles.dutyStatusSubText, { marginTop: 8 }]} numberOfLines={1}>
              · {formatDuration(dbActiveDuty.dutyStart)} · {dbActiveDuty.site_name ?? ''}
            </Text>
          )}
        </View>

        <View style={{ alignItems: 'flex-end', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={() => setChatVisible(true)} style={{ position: 'relative' }}>
              <Ionicons name="notifications-outline" size={24} color={TOKENS.colors.text.light} />
              {unseenCount + broadcastUnseenCount > 0 && (
                <View style={dashboardStyles.badge}>
                  <Text style={dashboardStyles.badgeText}>{unseenCount + broadcastUnseenCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleCallSupervisor} style={dashboardStyles.callBtn}>
              <Ionicons name="call" size={14} color={TOKENS.colors.text.light} />
              <Text
                style={{
                  color: TOKENS.colors.text.light,
                  fontSize: TOKENS.typography.size.xs,
                  fontWeight: TOKENS.typography.weight.bold,
                  marginLeft: 4,
                }}
              >
                {t('Call', language)}
              </Text>
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity 
            onPress={() => setLanguage(language === 'en' ? 'hi' : 'en')}
            style={styles.langToggleBtn}
          >
            <Text style={[styles.langText, language === 'en' && styles.langTextActive]}>EN</Text>
            <Text style={styles.langDivider}>/</Text>
            <Text style={[styles.langText, language === 'hi' && styles.langTextActive]}>HI</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: TOKENS.colors.background.card,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: TOKENS.colors.border.light,
  },
  avatarText: {
    color: TOKENS.colors.text.light,
    fontSize: TOKENS.typography.size.xl,
    fontWeight: TOKENS.typography.weight.bold,
  },
  statusChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: TOKENS.radius.sm,
    borderWidth: 1,
  },
  langToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
  },
  langText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: 'bold',
  },
  langTextActive: {
    color: '#ffffff',
  },
  langDivider: {
    color: 'rgba(255,255,255,0.3)',
    marginHorizontal: 4,
    fontSize: 12,
  }
});
