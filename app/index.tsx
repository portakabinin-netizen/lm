import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  DeviceEventEmitter,
  Image,
  LayoutAnimation,
  Linking,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthActions, useUserContext } from '@/context/AuthContext';
import { COLORS, DRAWER_WIDTH, HEADER_HEIGHT, styles } from '@/styles/stylesIndex';
import { appService } from '@/UtilServices/appHelper';
import SectionsItems from '@/UtilServices/RoleBaseMenu.json';
import { useGPSCoordinates } from '@/hooks/useGPSCoordinates';

import AdminDashboard from '@/dashboards/AdminDashboard';
import ClientDashboard from '@/dashboards/ClientDashboard';
import FinanceDashboard from '@/dashboards/FinanceDashboard';
import ProjectDashboard from '@/dashboards/ProjectDashboard';
import SalesDashboard from '@/dashboards/SalesDashboard';
import StaffDashboard from '@/dashboards/StaffDashboard';
import VendorDashboard from '@/dashboards/VendorDashboard';
import { useAttendance } from '@/hooks/useAttendance';
import AppModal, { appModules, useAppModals } from '@/UtilServices/appModals';

const GEO_TRACKING_TASK = 'background-geo-tracking';

// ─── BACKGROUND GEO TASK ──────────────────────────────────────────────────
TaskManager.defineTask(GEO_TRACKING_TASK, async ({ data, error }: any) => {
  if (error) return console.error('[BG-GEO] Task Error:', error);
  if (data) {
    const { locations } = data;
    const loc = locations[0];
    if (!loc) return;

    try {
      const activeStr = await AsyncStorage.getItem('active_duty_info');
      if (!activeStr) return;
      const info = JSON.parse(activeStr);
      if (info.isExempt) return;

      const sitesStr = await AsyncStorage.getItem('registered_sites');
      const sites = sitesStr ? JSON.parse(sitesStr) : [];

      let matchedSite = null;
      let dist = 999999;

      const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371e3;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      // 🛰️ Garbage Data Prevention: Check if moved significantly
      const lastLocStr = await AsyncStorage.getItem('last_recorded_location');
      if (lastLocStr) {
        const lastLoc = JSON.parse(lastLocStr);
        const distMoved = getDistance(
          loc.coords.latitude,
          loc.coords.longitude,
          lastLoc.lat,
          lastLoc.long
        );
        if (distMoved < 100) {
          // 100 meters threshold
          console.log('[BG-GEO] Stationary (<100m). Skipping update to prevent garbage data.');
          return;
        }
      }

      // Update last recorded location
      await AsyncStorage.setItem(
        'last_recorded_location',
        JSON.stringify({
          lat: loc.coords.latitude,
          long: loc.coords.longitude,
          timestamp: new Date().toISOString(),
        })
      );

      for (const site of sites) {
        if (site.location?.lat && site.location?.long) {
          const d = getDistance(
            loc.coords.latitude,
            loc.coords.longitude,
            site.location.lat,
            site.location.long
          );
          if (d < 500) {
            matchedSite = site;
            dist = d;
            break;
          }
        }
      }

      // If no match with registered sites, check against assigned site in info
      if (!matchedSite && info.siteLat && info.siteLong) {
        dist = getDistance(loc.coords.latitude, loc.coords.longitude, info.siteLat, info.siteLong);
        if (dist < 500) {
          matchedSite = { sender_name: info.siteName || 'Assigned Site' };
        }
      }

      // Update local flag for UI feedback
      await AsyncStorage.setItem('geo_mismatch', matchedSite ? 'false' : 'true');

      // 🚀 Offline Sync Logic
      const newLoc = {
        lat: loc.coords.latitude,
        long: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
        distance: Math.round(dist),
        site_name: matchedSite ? matchedSite.sender_name : 'Unknown Place',
        timestamp: appService.getIST(),
        type: 'tick',
      };

      // Log to SQLite diagnostic cache
      try {
        const { logGeoTickToSQLite } = require('@/UtilServices/sqliteService');
        logGeoTickToSQLite(
          loc.coords.latitude,
          loc.coords.longitude,
          loc.coords.accuracy,
          matchedSite ? matchedSite.sender_name : 'Unknown Place',
          true
        );
      } catch (err) {
        console.error('SQLite Geo Tick Log Error:', err);
      }

      const offlineStr = await AsyncStorage.getItem('offline_geo_data');
      let offlineData = offlineStr ? JSON.parse(offlineStr) : [];

      offlineData.push({
        attendanceId: info.attendanceId,
        token: info.token,
        location: newLoc,
      });

      const first = offlineData[0];
      if (!first) return;

      try {
        // Process items for the first session in the queue
        const matching = offlineData.filter(
          (item: any) => item.attendanceId === first.attendanceId && item.token === first.token
        );
        const nonMatching = offlineData.filter(
          (item: any) => item.attendanceId !== first.attendanceId || item.token !== first.token
        );

        const locations = matching.map((item: any) => item.location);

        await appService.httpClient.put(
          `service/hr/attendance/${first.attendanceId}`,
          {
            $push: { geoHistory: { $each: locations } },
          },
          {
            headers: { Authorization: `Bearer ${first.token}` },
          }
        );

        // Success! Save remaining non-matching items back to storage
        if (nonMatching.length > 0) {
          await AsyncStorage.setItem('offline_geo_data', JSON.stringify(nonMatching));
        } else {
          await AsyncStorage.removeItem('offline_geo_data');
        }
      } catch (sendErr: any) {
        console.error('[BG-GEO] Failed to send online:', sendErr.message);
        if (sendErr.response?.status === 404) {
          // Drop matching items (stale session)
          const nonMatching = offlineData.filter(
            (item: any) => item.attendanceId !== first.attendanceId
          );
          await AsyncStorage.setItem('offline_geo_data', JSON.stringify(nonMatching));

          console.warn(
            `[BG-GEO] Record not found (404) for session ${first.attendanceId}. Dropped.`
          );

          // Only stop task if the failing session is the CURRENT active session
          if (first.attendanceId === info.attendanceId) {
            try {
              await Location.stopLocationUpdatesAsync(GEO_TRACKING_TASK);
              await AsyncStorage.removeItem('active_duty_info');
              await AsyncStorage.removeItem('geo_mismatch');
            } catch (stopErr) {
              console.error('[BG-GEO] Failed to stop task:', stopErr);
            }
          }
        } else {
          // Network error or server down - save all back to storage
          await AsyncStorage.setItem('offline_geo_data', JSON.stringify(offlineData));
        }
      }
    } catch (e: any) {
      console.error('[BG-GEO] Outer Logic Error:', e);
    }
  }
});

const FALLBACK_CORP_IMG = 'https://img.icons8.com/?size=100&id=E6RfmLvxU30R&format=png';
const FALLBACK_USER_IMG = 'https://api.dicebear.com/7.x/micah/png';

// 🚀 MEMORY CACHE: Prevent flicker on mount/navigation
const USER_IMG_CACHE: Record<string, string> = {};
const CORP_IMG_CACHE: Record<string, string> = {};
const ROLE_MAP: Record<string, keyof typeof SectionsItems> = {
  corpadmin: 'CorpAdmin',
  useradmin: 'CorpAdmin',
  admin: 'CorpAdmin',
  staffadmin: 'Staff',
  hr: 'Staff',
  sales: 'Sales',
  finance: 'Finance',
  project: 'Project',
  staff: 'Staff',
  vendor: 'Vendor',
  client: 'Client',
  guest: 'Client',
};
type ImageUpdateField = 'userProfileImage' | 'CorpProfileImage';

import { AppHeader } from '@/components/AppHeader';

// ─── DashboardRenderer — defined outside, never remounts ─────────────────────
interface DashboardProps {
  role: string;
  token: string;
  userId: string;
  name: string;
  dbName: string;
  referenceMobile?: string;
  userProfileImage?: string;
}
const DashboardRenderer = React.memo(({ role, ...props }: any) => {
  if (role === 'Sales') return <SalesDashboard {...props} />;
  if (role === 'Project') return <ProjectDashboard {...props} />;
  if (role === 'CorpAdmin') return <AdminDashboard {...props} />;
  if (role === 'Finance') return <FinanceDashboard {...props} />;
  if (role === 'userAdmin') return <AdminDashboard {...props} />;
  if (role === 'Staff') return <StaffDashboard {...props} />;
  if (role === 'Vendor') return <VendorDashboard {...props} />;
  if (role === 'Client') return <ClientDashboard {...props} />;

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <Ionicons name="alert-circle-outline" size={64} color={COLORS.textMuted} />
      <Text style={{ fontSize: 18, fontWeight: '700', marginTop: 16 }}>Unauthorized Role</Text>
      <Text style={{ color: COLORS.textMuted, textAlign: 'center', marginTop: 8 }}>
        Your account role ({role}) is not mapped to a dashboard. Please contact your administrator.
      </Text>
    </View>
  );
});

// ─── AppDrawer — memoized, isolated from dashboard ───────────────────────────
const AppDrawer = React.memo(function AppDrawer({
  drawerX,
  isDrawerOpen,
  closeDrawer,
  openUserImageModal,
  uploading,
  activeField,
  userImgSrc,
  user,
  sections,
  openSections,
  toggleSection,
  handleExternalLink,
  toggleDrawer,
  logout,
  router,
  dutyStatus,
  toggleDuty,
  dutyLoading,
  activeDuty,
  formatDuration,
  employeeProfile,
  assignedShiftDetails,
  location,
}: any) {
  const showDutyToggle = true;
  const { getCurrentLocation } = useGPSCoordinates();

  const [drawerLocationText, setDrawerLocationText] = useState<string>('Fetching location...');

  useEffect(() => {
    let active = true;
    const getAddr = async () => {
      let lat = 0;
      let lng = 0;
      let prefix = '📍 ';

      if (dutyStatus === 'ON' && activeDuty) {
        lat = Number(activeDuty.startLat || (activeDuty.geoHistory && activeDuty.geoHistory[0]?.lat) || 0);
        lng = Number(activeDuty.startLong || (activeDuty.geoHistory && activeDuty.geoHistory[0]?.long) || 0);
        prefix = '📍 Start Loc: ';
      }

      // Fallback to live location if start location is missing or if off duty
      if (!lat || !lng) {
        const loc = location || await getCurrentLocation().catch(() => null);
        if (loc) {
          lat = loc.latitude ?? loc.lat;
          lng = loc.longitude ?? loc.long;
          prefix = '📍 Current: ';
        }
      }

      if (!lat || !lng) {
        if (active) setDrawerLocationText('📍 Location unknown');
        return;
      }

      try {
        const res = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
        if (res && res.length > 0) {
          const first = res[0];
          const name = first.name || '';
          const street = first.street || '';
          const city = first.city || first.subregion || '';
          const region = first.region || '';
          const addressStr = [name, street, city, region].filter(Boolean).join(', ');
          if (active) setDrawerLocationText(`${prefix}${addressStr}`);
        } else {
          if (active) setDrawerLocationText(`${prefix}${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      } catch {
        if (active) setDrawerLocationText(`${prefix}${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
    };

    getAddr();
    return () => {
      active = false;
    };
  }, [dutyStatus, activeDuty, location]);

  const scheduledShiftTime = (() => {
    let startScheduled = activeDuty?.dutyStartScheduled;
    let endScheduled = activeDuty?.dutyEndScheduled;
    let lockHrs = activeDuty?.shiftLockHours || assignedShiftDetails?.durationHrs || 8;

    if (!startScheduled || !endScheduled) {
      const fallbackStart = activeDuty?.dutyStart || activeDuty?.createdAt || activeDuty?.date || activeDuty?.timestamp;
      if (assignedShiftDetails?.startTime) {
        const [h, m] = assignedShiftDetails.startTime.split(':').map(Number);
        const schedStart = new Date(fallbackStart || Date.now());
        schedStart.setHours(h, m, 0, 0);

        const diffMs = new Date(fallbackStart || Date.now()).getTime() - schedStart.getTime();
        if (diffMs > 12 * 3_600_000) {
          schedStart.setDate(schedStart.getDate() + 1);
        } else if (diffMs < -12 * 3_600_000) {
          schedStart.setDate(schedStart.getDate() - 1);
        }
        startScheduled = schedStart.toISOString();
        endScheduled = new Date(schedStart.getTime() + lockHrs * 3600_000).toISOString();
      }
    }

    if (startScheduled && endScheduled) {
      const sTime = new Date(startScheduled).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const eTime = new Date(endScheduled).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `${sTime} ↔ ${eTime}`;
    }
    return `General Shift`;
  })();

  const actualStartTimeText = (() => {
    const rawStart = activeDuty?.dutyStart || activeDuty?.dutyStartScheduled || activeDuty?.createdAt || activeDuty?.date || activeDuty?.timestamp;
    if (!rawStart) return '—';
    return new Date(rawStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  })();

  const isOwnWorker = useMemo(() => {
    const workerMobile = employeeProfile?.mobile || '';
    const loginMobile = user?.mobile || '';
    if (!workerMobile || !loginMobile) return false;
    return workerMobile.replace(/\D/g, '').slice(-10) === loginMobile.replace(/\D/g, '').slice(-10);
  }, [employeeProfile?.mobile, user?.mobile]);

  const dutyStart = activeDuty?.dutyStart ? new Date(activeDuty.dutyStart) : null;
  const hoursElapsed = dutyStart ? (Date.now() - dutyStart.getTime()) / 3600000 : 0;
  const canEndDuty = hoursElapsed >= (assignedShiftDetails.durationHrs || 8) - 1;

  const dutyEndScheduled = activeDuty?.dutyEndScheduled
    ? new Date(activeDuty.dutyEndScheduled)
    : null;
  const endStr = dutyEndScheduled
    ? dutyEndScheduled.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : dutyStart && assignedShiftDetails
      ? new Date(
          dutyStart.getTime() + (assignedShiftDetails.durationHrs || 8) * 3600000
        ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

  const dutyTimeDisplayText = (() => {
    if (!activeDuty || !activeDuty.dutyStart) return null;
    const actualStart = new Date(activeDuty.dutyStart).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    let startScheduled = activeDuty.dutyStartScheduled;
    let endScheduled = activeDuty.dutyEndScheduled;
    let lockHrs = activeDuty.shiftLockHours || assignedShiftDetails?.durationHrs || 8;

    if (!startScheduled || !endScheduled) {
      if (assignedShiftDetails?.startTime) {
        const [h, m] = assignedShiftDetails.startTime.split(':').map(Number);
        const schedStart = new Date(activeDuty.dutyStart);
        schedStart.setHours(h, m, 0, 0);

        const diffMs = new Date(activeDuty.dutyStart).getTime() - schedStart.getTime();
        if (diffMs > 12 * 3_600_000) {
          schedStart.setDate(schedStart.getDate() + 1);
        } else if (diffMs < -12 * 3_600_000) {
          schedStart.setDate(schedStart.getDate() - 1);
        }
        if (!startScheduled) startScheduled = schedStart.toISOString();
        if (!endScheduled)
          endScheduled = new Date(schedStart.getTime() + lockHrs * 3600_000).toISOString();
      }
    }

    const markedByText =
      activeDuty.markedByDevice === false && activeDuty.markedByUserName
        ? ` (${activeDuty.markedByUserName})`
        : '';

    if (startScheduled && endScheduled) {
      const schedStartStr = new Date(startScheduled).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      const schedEndStr = new Date(endScheduled).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${schedStartStr} - ${actualStart} | End Duty: ${schedEndStr}${markedByText}`;
    }
    return `Actual: ${actualStart}${markedByText}`;
  })();

  return (
    <>
      {isDrawerOpen && (
        <Pressable
          style={
            {
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: 'rgba(0,0,0,0.38)',
              zIndex: 1999,
            } as any
          }
          onPress={closeDrawer}
        />
      )}
      <Animated.View
        style={
          [styles.drawer, { top: HEADER_HEIGHT + 35, transform: [{ translateX: drawerX }] }] as any
        }
      >
        <View style={[styles.drawerHeader, { backgroundColor: '#0F172A' }] as any}>
          {/* Line 1: Profile & Name */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <TouchableOpacity onPress={openUserImageModal} activeOpacity={0.8}>
              {uploading && activeField === 'userProfileImage' ? (
                <ActivityIndicator color="#fff" style={{ width: 60, height: 60 }} />
              ) : userImgSrc ? (
                <Image
                  source={{ uri: userImgSrc }}
                  style={{ width: 60, height: 60, borderRadius: 30 }}
                />
              ) : (
                <View
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: 30,
                    backgroundColor: '#fff',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#0F172A', fontWeight: '900', fontSize: 24 }}>
                    {(user?.name || user?.userDisplayName || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }} numberOfLines={1}>
                {user?.name ?? user?.userDisplayName ?? '—'}
              </Text>
              <View style={{ alignItems: 'flex-start', marginTop: 4 }}>
                <View
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.1)',
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 6,
                    marginBottom: 6,
                  }}
                >
                  <Text
                    style={{
                      color: 'rgba(255,255,255,0.8)',
                      fontSize: 10,
                      fontWeight: '700',
                      textTransform: 'uppercase',
                    }}
                  >
                    {user?.userRole ?? 'Guest'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -8, marginTop: 2 }}>
                  <Switch
                    value={dutyStatus === 'ON'}
                    onValueChange={() => toggleDuty()}
                    disabled={dutyLoading || (dutyStatus === 'ON' ? !canEndDuty : false)}
                    trackColor={{ false: '#fca5a5', true: '#86efac' }}
                    thumbColor={dutyStatus === 'ON' ? '#166534' : '#991b1b'}
                    style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                  />
                  <Text style={{ marginLeft: 2, color: dutyLoading ? '#94a3b8' : (dutyStatus === 'ON' ? '#86efac' : '#fca5a5'), fontSize: 12, fontWeight: '800' }}>
                    {dutyLoading ? 'UPDATING...' : (dutyStatus === 'ON' ? 'ON DUTY' : 'OFF DUTY')}
                  </Text>
                  {dutyLoading && <ActivityIndicator size="small" color="#94a3b8" style={{ marginLeft: 8, transform: [{ scale: 0.7 }] }} />}
                </View>
              </View>
              <View style={{ marginTop: 6, gap: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="location-sharp" size={12} color="#94a3b8" />
                  <Text style={{ color: '#cbd5e1', fontSize: 10, fontWeight: '600' }} numberOfLines={2}>
                    {drawerLocationText}
                  </Text>
                </View>
                {dutyStatus === 'ON' && (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="calendar-sharp" size={12} color="#10b981" />
                      <Text style={{ color: '#86efac', fontSize: 10, fontWeight: '700' }}>
                        Shift: {scheduledShiftTime}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="time-sharp" size={12} color="#3b82f6" />
                      <Text style={{ color: '#93c5fd', fontSize: 10, fontWeight: '700' }}>
                        Actual Start: {actualStartTimeText}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            </View>
          </View>
        </View>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {sections.map((section: any) => (
            <View key={section.key}>
              <TouchableOpacity
                style={styles.sectionHeader as any}
                onPress={() => toggleSection(section.key)}
              >
                <Text style={styles.sectionTitle as any}>{section.title}</Text>
                <Ionicons
                  name={openSections[section.key] ? 'chevron-up' : 'chevron-down'}
                  size={16}
                  color={COLORS.primary}
                />
              </TouchableOpacity>
              {openSections[section.key] &&
                section.items.map((item: any, idx: number) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.drawerItem as any}
                    onPress={() => {
                      toggleDrawer(false);
                      if (item.label === 'Logout') return logout();
                      if (item.isOpenApp || item.isOpenWeb) return handleExternalLink(item);
                      if (item.route) router.push(item.route);
                    }}
                  >
                    <View
                      style={
                        {
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          backgroundColor: COLORS.primary + '15',
                          justifyContent: 'center',
                          alignItems: 'center',
                        } as any
                      }
                    >
                      <Ionicons name={item.icon || 'ellipse'} size={17} color={COLORS.primary} />
                    </View>
                    <Text style={styles.drawerText as any}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
            </View>
          ))}
          <TouchableOpacity
            onPress={() => {
              toggleDrawer(false);
              logout();
            }}
            style={
              [
                styles.drawerItem,
                { marginTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
              ] as any
            }
          >
            <View
              style={
                {
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  backgroundColor: COLORS.danger + '18',
                  justifyContent: 'center',
                  alignItems: 'center',
                } as any
              }
            >
              <Ionicons name="log-out-outline" size={17} color={COLORS.danger} />
            </View>
            <Text style={[styles.drawerText, { color: COLORS.danger }] as any}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DynamicHomeScreen() {
  const { user, loading } = useUserContext();
  const { logout, updateUserProfile, switchCorporate } = useAuthActions();
  const {
    dutyStatus,
    toggleDuty,
    isLoading: dutyLoading,
    activeDuty,
    formatDuration,
    employeeProfile,
    assignedShiftDetails,
    location,
  } = useAttendance();
  const router = useRouter();
  const m = useAppModals();
  const isDark = useColorScheme() === 'dark';

  const mkShadow = (s: number) => ({
    shadowColor: '#000',
    shadowOffset: { width: 0, height: s / 2 },
    shadowOpacity: 0.15,
    shadowRadius: s,
    elevation: s,
  });

  const [modalVisible, setModalVisible] = useState(false);
  const [corpSelectorVisible, setCorpSelectorVisible] = useState(false);
  const [activeField, setActiveField] = useState<ImageUpdateField | null>(null);
  const [latestUserImg, setLatestUserImg] = useState<string | null>(
    (user?.userId && USER_IMG_CACHE[user.userId]) || null
  );

  useEffect(() => {
    const fetchLatest = async () => {
      if (!user?.userId || !user?.dbName) return; // 🚀 Safety: Don't fetch without tenant
      try {
        const res = await appService.httpClient.get(`auth/get-profile-history`, {
          params: { userId: user.userId, type: 'user' },
        });
        if (res.data?.activeUrl) {
          setLatestUserImg(res.data.activeUrl);
          if (user?.userId) USER_IMG_CACHE[user.userId] = res.data.activeUrl;
        } else if (res.data?.resources?.length > 0) {
          const url = res.data.resources[0].url;
          setLatestUserImg(url);
          if (user?.userId) USER_IMG_CACHE[user.userId] = url;
        }
      } catch (err: any) {
        if (err.response?.status !== 401) {
          console.log('User Image Fetch Error:', err);
        }
      }
    };
    fetchLatest();
  }, [user?.userId]);
  const [uploading, setUploading] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const previewUriRef = useRef<string | null>(null);

  useEffect(() => {
    setPreviewUri(m.user.previewUri || null);
    previewUriRef.current = m.user.previewUri || null;
  }, [m.user.previewUri]);

  const drawerX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  // ── Image upload ──────────────────────────────────────────────────────────
  const processImagePick = useCallback(
    async (mode: 'camera' | 'gallery') => {
      if (!user?.userId) return;
      try {
        const opts: ImagePicker.ImagePickerOptions = {
          mediaTypes: ['images'] as any,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.3,
        };
        let result;
        if (mode === 'camera') {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted')
            return appService.showToast('Camera permission required', 'Error');
          result = await ImagePicker.launchCameraAsync(opts);
        } else {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted')
            return appService.showToast('Gallery permission required', 'Error');
          result = await ImagePicker.launchImageLibraryAsync(opts);
        }
        if (!result.canceled && result.assets?.[0]) {
          const uri = result.assets[0].uri;
          setPreviewUri(uri);
          previewUriRef.current = uri;
          appModules.updateUserPreview(uri);
        }
      } catch (e: any) {
        appService.showToast(e?.toString?.() || 'Picker failed', 'Error');
      }
    },
    [activeField, user?.userId]
  );

  const handleUpload = useCallback(
    async (field: ImageUpdateField, corpId?: string) => {
      const currentUri = previewUriRef.current;
      if (!currentUri || !field || !user?.userId) return;
      setUploading(true);
      appModules.updateUserUploading(true);
      try {
        const response = await appService.uploadProfileImage(currentUri, user.userId, field);
        if (response.data?.success) {
          const newUrl = response.data.url;
          if (field === 'userProfileImage') {
            setLatestUserImg(newUrl);
            if (user.userId) USER_IMG_CACHE[user.userId] = newUrl;
            updateUserProfile({ userProfileImage: newUrl });
          } else {
            if (user.dbName) CORP_IMG_CACHE[user.dbName] = newUrl;
            updateUserProfile({ CorpProfileImage: newUrl });
            DeviceEventEmitter.emit('refresh_corp_image', newUrl);
          }

          appService.showToast('Image uploaded successfully!', 'Success');
          setPreviewUri(null);
          appModules.updateUserPreview(null);
          appModules.close('user');
          setModalVisible(false);
        }
      } catch (e: any) {
        appService.showToast('Upload failed', 'Error');
      } finally {
        setUploading(false);
        appModules.updateUserUploading(false);
        setActiveField(null);
      }
    },
    [user?.userId, updateUserProfile]
  );

  // ── Drawer ────────────────────────────────────────────────────────────────
  const toggleDrawer = useCallback(
    (open: boolean) => {
      setIsDrawerOpen(open);
      Animated.timing(drawerX, {
        toValue: open ? 0 : -DRAWER_WIDTH,
        duration: 240,
        useNativeDriver: true,
      }).start();
    },
    [drawerX]
  );

  const openDrawer = useCallback(() => toggleDrawer(true), [toggleDrawer]);
  const closeDrawer = useCallback(() => toggleDrawer(false), [toggleDrawer]);

  const toggleSection = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleExternalLink = useCallback(async (item: any) => {
    try {
      if (item.isOpenApp && item.appScheme) {
        const canOpen = await Linking.canOpenURL(item.appScheme);
        if (canOpen) return Linking.openURL(item.appScheme);
      }
      WebBrowser.openBrowserAsync(item.url);
    } catch {
      WebBrowser.openBrowserAsync(item.url);
    }
  }, []);

  const openUserImageModal = useCallback(() => {
    setActiveField('userProfileImage');
    appModules.openUser({
      type: 'camera',
      profileType: 'user',
      previewUri,
      onSelect: processImagePick,
      onUpload: () => handleUpload('userProfileImage'),
      onClear: () => {
        setPreviewUri(null);
        previewUriRef.current = null;
        appModules.updateUserPreview(null);
      },
    });
  }, [previewUri, processImagePick, handleUpload]);
  const openCorpImageModal = useCallback(() => {
    if (user?.userRole !== 'CorpAdmin') {
      return appService.showToast('Only CorpAdmin can update corporate profile', 'Info');
    }
    setActiveField('CorpProfileImage');
    appModules.openUser({
      type: 'camera',
      profileType: 'corp',
      previewUri,
      onSelect: processImagePick,
      onUpload: () => handleUpload('CorpProfileImage', user?.corporateId || ''),
      onClear: () => {
        setPreviewUri(null);
        previewUriRef.current = null;
        appModules.updateUserPreview(null);
      },
    });
  }, [previewUri, processImagePick, handleUpload, user?.corporateId]);

  // ── Role + sections (stable — only changes if role changes) ───────────────
  const roleKey = user?.userRole?.toLowerCase() ?? '';
  const resolvedRole = ROLE_MAP[roleKey] || 'Guest';
  const drawerMenu = SectionsItems[resolvedRole as keyof typeof SectionsItems] || { sections: [] };

  const sections = useMemo(
    () =>
      (drawerMenu.sections || []).map((s: any, i: number) => ({
        key: s.key || `${resolvedRole}-${i}`,
        title: s.title,
        items: s.items || [],
      })),
    [drawerMenu, resolvedRole]
  );

  // ── Stable primitive props for DashboardRenderer ──────────────────────────
  const dashToken = user?.token ?? '';
  const dashUserId = user?.userId ?? '';
  const dashName = user?.userDisplayName ?? '';

  const userImgSrc =
    activeField === 'userProfileImage' && previewUri
      ? previewUri
      : latestUserImg || user?.userProfileImage || null;

  if (loading)
    return (
      <ActivityIndicator
        size="large"
        color="#0000ff"
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
      />
    );

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: isDark ? COLORS.bgDark : COLORS.bgLight }}
      edges={['top']}
    >
      <AppHeader
        onMenuPress={() => toggleDrawer(!isDrawerOpen)}
        isDrawerOpen={isDrawerOpen}
        onCorpImgPress={openCorpImageModal}
        uploading={uploading && activeField === 'CorpProfileImage'}
        previewUri={activeField === 'CorpProfileImage' ? previewUri : null}
      />

      {/* DashboardRenderer: React.memo + primitive props = never remounts
          unless token/userId/name/corporateId actually change */}
      <View style={{ flex: 1 }}>
        <DashboardRenderer
          role={resolvedRole}
          token={dashToken}
          userId={dashUserId}
          name={dashName}
          dbName={user?.dbName || ''}
          referenceMobile={user?.referenceMobile}
          userProfileImage={user?.userProfileImage}
        />
      </View>

      <AppModal />

      <AppDrawer
        drawerX={drawerX}
        isDrawerOpen={isDrawerOpen}
        closeDrawer={closeDrawer}
        openUserImageModal={openUserImageModal}
        uploading={uploading}
        activeField={activeField}
        userImgSrc={userImgSrc}
        user={user}
        sections={sections}
        openSections={openSections}
        toggleSection={toggleSection}
        handleExternalLink={handleExternalLink}
        toggleDrawer={toggleDrawer}
        logout={logout}
        router={router}
        dutyStatus={dutyStatus}
        toggleDuty={toggleDuty}
        dutyLoading={dutyLoading}
        activeDuty={activeDuty}
        formatDuration={formatDuration}
        employeeProfile={employeeProfile}
        assignedShiftDetails={assignedShiftDetails}
        location={location}
      />
    </SafeAreaView>
  );
}
