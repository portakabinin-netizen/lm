import { useAuthActions, useUserContext } from '@/context/AuthContext';
import { useAttendance } from '@/hooks/useAttendance';
import { useGPSCoordinates } from '@/hooks/useGPSCoordinates';
import { COLORS, mkShadow, styles } from '@/styles/stylesIndex';
import { appService } from '@/UtilServices/appHelper';
import { appModules } from '@/UtilServices/appModals';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import FastImage from '@/components/FastImageCompat';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';

interface AppHeaderProps {
  onMenuPress?: () => void;
  onBackPress?: () => void;
  onCorpImgPress?: () => void;
  uploading?: boolean;
  title?: string;
  rightAction?: () => React.ReactNode;
  previewUri?: string | null;
  isDrawerOpen?: boolean;
}

// 🚀 MEMORY CACHE: Prevent flicker on mount/navigation
export const CORP_IMG_CACHE: Record<string, string> = {};

export function resolveCorpUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (
    !trimmed ||
    trimmed === 'undefined' ||
    trimmed === 'null' ||
    trimmed === 'false' ||
    trimmed === 'N/A' ||
    trimmed === '[object Object]'
  ) {
    return null;
  }
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file://')
  ) {
    return trimmed;
  }
  const baseURL = (appService.httpClient.defaults.baseURL || '')
    .replace(/\/api\/?$/, '')
    .replace(/\/service\/?$/, '');
  const cleanBase =
    baseURL.replace(/\/+$/, '') || 'https://leadmanager-backend-production.up.railway.app';
  const cleanUrl = trimmed.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${cleanBase}/${cleanUrl}`;
}

const FALLBACK_CORP_IMG = null;

function CorpItemAvatar({
  corp,
  isActive,
  latestCorpImg,
  user,
}: {
  corp: any;
  isActive: boolean;
  latestCorpImg: string | null;
  user: any;
}) {
  const [hasError, setHasError] = useState(false);
  const userFace = user?.userProfileImage;

  // For the active corporate: can use latestCorpImg if available and valid
  // For other corporates: MUST only use its own specific corporate logo from accessCorporate
  const rawCandidate = isActive
    ? latestCorpImg ||
      corp?.CorpProfileImage ||
      corp?.corpProfileImage ||
      corp?.corporateLogo ||
      corp?.logo ||
      (corp?.dbName && CORP_IMG_CACHE[corp.dbName]) ||
      null
    : corp?.CorpProfileImage ||
      corp?.corpProfileImage ||
      corp?.corporateLogo ||
      corp?.logo ||
      null;

  // Validate: must not be empty, must not be the user's face photo, and must not be a user-profile path
  const isValid =
    rawCandidate &&
    typeof rawCandidate === 'string' &&
    rawCandidate.trim() !== '' &&
    rawCandidate !== userFace &&
    !rawCandidate.includes('/user-profile/') &&
    !rawCandidate.includes('/userProfile/');

  const resolved = isValid ? resolveCorpUrl(rawCandidate) : null;

  useEffect(() => {
    setHasError(false);
  }, [resolved]);

  const initial = (corp?.corporateName || 'C').trim().charAt(0).toUpperCase();

  // If no corporate image exists or loading failed, display the corporate initial avatar
  if (hasError || !resolved) {
    return (
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          marginRight: 16,
          backgroundColor: isActive ? COLORS.primary : '#e2e8f0',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            color: isActive ? '#fff' : '#0f172a',
            fontWeight: '900',
            fontSize: 20,
          }}
        >
          {initial}
        </Text>
      </View>
    );
  }

  return (
    <FastImage
      key={resolved}
      source={resolved}
      style={{
        width: 48,
        height: 48,
        borderRadius: 12,
        marginRight: 16,
        backgroundColor: '#f1f5f9',
      }}
      fallbackLabel={initial}
      fallbackColor="#3b82f6"
    />
  );
}

export const AppHeader = React.memo(function AppHeader({
  onMenuPress,
  onBackPress,
  onCorpImgPress: externalOnCorpImgPress,
  uploading: externalUploading,
  title,
  rightAction,
  previewUri,
  isDrawerOpen,
}: AppHeaderProps) {
  const { user } = useUserContext();
  const { switchCorporate } = useAuthActions();
  const { refresh: refreshGPS } = useGPSCoordinates();
  const isDark = useColorScheme() === 'dark';

  const [isOnline, setIsOnline] = useState(true);
  const [corpSelectorVisible, setCorpSelectorVisible] = useState(false);

  // ── API Host URL Picker State ──────────────────────────────────────────────

  // ── API Host URL Picker State ──────────────────────────────────────────────
  const [showHostPicker, setShowHostPicker] = useState(false);
  const [customHost, setCustomHost] = useState(appService.getCurrentBaseURL() || '');
  const [hostList, setHostList] = useState<string[]>(appService.getHostList());
  const [manualHost, setManualHost] = useState('');
  const [hostStatus, setHostStatus] = useState<null | boolean | 'checking'>(null);

  const {
    dutyStatus,
    activeDuty,
    selectedShift,
    isLoading: dutyLoading,
    toggleDuty,
    formatDuration,
    canUseAttendance,
  } = useAttendance();

  // DutyToggle — only for roles that actually use attendance tracking
  const showDutyToggle = canUseAttendance;

  const dutyStart = activeDuty?.dutyStart ? new Date(activeDuty.dutyStart) : null;
  const hoursElapsed = dutyStart ? (Date.now() - dutyStart.getTime()) / 3600000 : 0;

  // Dynamic shift details provided by active duty
  const shiftHours = activeDuty?.shiftLockHours || 8;
  const enableHours = shiftHours === 12 ? 11 : shiftHours === 8 ? 7 : shiftHours - 1;
  const canEndDuty = hoursElapsed >= enableHours;

  const dutyEndScheduled = activeDuty?.dutyEndScheduled
    ? new Date(activeDuty.dutyEndScheduled)
    : null;
  const formatTime = (d: Date | null) => {
    if (!d || isNaN(d.getTime())) return '';
    const h = d.getHours();
    const m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const endStr = dutyEndScheduled
    ? formatTime(dutyEndScheduled)
    : dutyStart
      ? formatTime(new Date(dutyStart.getTime() + shiftHours * 3600000))
      : '';

  const dutyStartScheduled = activeDuty?.dutyStartScheduled
    ? new Date(activeDuty.dutyStartScheduled)
    : null;
  const schedStartStr = dutyStartScheduled ? formatTime(dutyStartScheduled) : formatTime(dutyStart);
  const actualStartStr = formatTime(dutyStart);

  const [latestCorpImg, setLatestCorpImg] = useState<string | null>(
    (user?.dbName && CORP_IMG_CACHE[user.dbName]) || null
  );

  // ── Pre-populate cache from accessCorporate ─────────────────────────────────
  useEffect(() => {
    if (!user?.accessCorporate || !Array.isArray(user.accessCorporate)) return;
    const userFace = user?.userProfileImage;
    user.accessCorporate.forEach((c: any) => {
      const img =
        c.CorpProfileImage ||
        c.corpProfileImage ||
        c.corporateProfileImage ||
        c.logo ||
        c.image;
      if (
        img &&
        img !== userFace &&
        !img.includes('/user-profile/') &&
        !img.includes('/userProfile/') &&
        c.dbName &&
        !CORP_IMG_CACHE[c.dbName]
      ) {
        const resolved = resolveCorpUrl(img);
        if (resolved) CORP_IMG_CACHE[c.dbName] = resolved;
      }
    });
    // Also cache current active corp from top-level user fields
    if (user.dbName) {
      const activeImg = user.CorpProfileImage || (user as any).corpProfileImage;
      if (
        activeImg &&
        activeImg !== userFace &&
        !activeImg.includes('/user-profile/') &&
        !activeImg.includes('/userProfile/') &&
        !CORP_IMG_CACHE[user.dbName]
      ) {
        const resolved = resolveCorpUrl(activeImg);
        if (resolved) CORP_IMG_CACHE[user.dbName] = resolved;
      }
    }
  }, [user?.accessCorporate, user?.dbName, user?.CorpProfileImage, user?.userProfileImage]);

  // ── Fetch Latest Corp Image ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchLatest = async () => {
      if (!user?.userId || !user?.dbName) return; // 🚀 Safety: Don't fetch without tenant
      try {
        const res = await appService.httpClient.get(`auth/get-profile-history`, {
          params: { userId: user.userId, type: 'corp' },
        });
        const url = res.data?.activeUrl || res.data?.resources?.[0]?.url;
        if (url) {
          setLatestCorpImg(url);
          if (user?.dbName) CORP_IMG_CACHE[user.dbName] = url;
        }
      } catch (err: any) {
        if (err.response?.status !== 401) {
          console.error('Header Image Fetch Error:', err);
        }
      }
    };
    fetchLatest();

    const sub = DeviceEventEmitter.addListener('refresh_corp_image', (newUrl?: string) => {
      if (typeof newUrl === 'string') {
        setLatestCorpImg(newUrl);
        if (user?.dbName) CORP_IMG_CACHE[user.dbName] = newUrl;
      } else fetchLatest();
    });
    return () => sub.remove();
  }, [user?.dbName, user?.userId]);

  // ── Health/Location ─────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      const { available, error } = await appService.isSystemLive();
      if (!mounted) return;
      setIsOnline(available);
      if (!available && error) appService.showToast(error, 'Error');
    };
    check();
    const id = setInterval(check, 30_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const fetchLocation = useCallback(async () => {
    setLocLoading(true);
    try {
      const data = await refreshGPS();
      if (!data) throw new Error();
      setLocation(`📍 ${data.resolvedName}`);
    } catch {
      setLocation('Location unavailable');
    } finally {
      setLocLoading(false);
    }
  }, [refreshGPS]);

  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  // ── Sync Active API Host URL across all UI screens ─────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      const active =
        typeof appService?.loadPersistedHost === 'function'
          ? await appService.loadPersistedHost()
          : appService.getCurrentBaseURL();
      if (!mounted) return;
      setCustomHost(active);
      setHostList(appService.getHostList());
      setHostStatus('checking');
      const result = await appService.isSystemLive();
      if (!mounted) return;
      setHostStatus(result.available);
    })();

    const sub = DeviceEventEmitter.addListener('api_host_changed', (newHost: string) => {
      if (mounted && newHost) {
        setCustomHost(newHost);
        setHostList(appService.getHostList());
        setHostStatus('checking');
        appService.isSystemLive().then((res) => {
          if (mounted) setHostStatus(res.available);
        });
      }
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const applyHost = async (url: string) => {
    if (!url) return;
    const clean = url.trim().replace(/\/+$/, '');
    const cleanUrl = clean.endsWith('/api') ? clean + '/' : clean + '/api/';
    setShowHostPicker(false);
    setManualHost('');
    setCustomHost(cleanUrl);
    setHostStatus('checking');

    await appService.updateHost(cleanUrl);
    setHostList(appService.getHostList());

    // 🚀 Broadcast to all screens & components so entire app uses new host immediately
    DeviceEventEmitter.emit('api_host_changed', cleanUrl);

    const result = await appService.isSystemLive();
    setHostStatus(result.available);
    if (!result.available) {
      appService.showToast(result.error || 'Host unreachable', 'Warning');
    }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSwitch = async (id: string) => {
    setCorpSelectorVisible(false);
    setLatestCorpImg(null);
    await switchCorporate(id);
  };

  const handleDutyToggle = async () => {
    try {
      await toggleDuty();
    } catch (err: any) {
      appService.showToast(err.message || 'Failed to update duty status', 'Error');
    }
  };

  const defaultOnCorpImgPress = () => {
    if (user?.userRole?.toLowerCase() !== 'corpadmin') {
      return appService.showToast('Only Admin can change Corp Photo', 'Info');
    }
    appModules.openUser({
      type: 'camera',
      profileType: 'corp',
      previewUri: null,
      onSelect: () => {},
              params: { userId: user?.userId, type: 'corp', dbName: user?.dbName },
              headers: { 'x-tenant-id': user?.dbName },
            })
            .catch(() => null),
          appService.httpClient
            .get('setting/update/corporate', {
              headers: { 'x-tenant-id': user?.dbName },
            })
            .catch(() => null),
        ]);

        const profile = corpRes?.data?.data?.accessCorporate;
        const profileImg =
          profile?.CorpProfileImage ||
          profile?.corpProfileImage ||
          profile?.logo ||
          profile?.corporateLogo;
        const historyImg = historyRes?.data?.activeUrl || historyRes?.data?.resources?.[0]?.url;
        const url = profileImg || historyImg;

        if (url && active) {
          const resolved = resolveCorpUrl(url);
          if (resolved && user?.dbName) {
            CORP_IMG_CACHE[user.dbName] = resolved;
            setLatestCorpImg(resolved);
          }
        }
      } catch (err) {
        console.warn('[AppHeader] Error fetching corporate profile logo:', err);
      }
    };
    fetchActiveCorp();
    return () => {
      active = false;
    };
  }, [user?.dbName, user?.userId]);

  useEffect(() => {
    setHeaderImgError(false);
  }, [activeCorpHeaderImg, user?.dbName]);

  return (
    <View style={{ backgroundColor: bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.header, { backgroundColor: bg }] as any}>
        {onMenuPress && (
          <TouchableOpacity
            onPress={onMenuPress}
            style={{
    return () => sub.remove();
  }, [user?.dbName]);

  useEffect(() => {
    if (!user?.dbName) return;
    if (CORP_IMG_CACHE[user.dbName]) {
      setLatestCorpImg(CORP_IMG_CACHE[user.dbName]);
      return;
    }
    let active = true;
    const fetchActiveCorp = async () => {
      try {
        const [historyRes, corpRes] = await Promise.all([
          appService.httpClient
            .get('auth/get-profile-history', {
              params: { userId: user?.userId, type: 'corp', dbName: user?.dbName },
              headers: { 'x-tenant-id': user?.dbName },
            })
            .catch(() => null),
          appService.httpClient
            .get('setting/update/corporate', {
              headers: { 'x-tenant-id': user?.dbName },
            })
            .catch(() => null),
        ]);

        const profile = corpRes?.data?.data?.accessCorporate;
        const profileImg =
          profile?.CorpProfileImage ||
          profile?.corpProfileImage ||
          profile?.logo ||
          profile?.corporateLogo;
        const historyImg = historyRes?.data?.activeUrl || historyRes?.data?.resources?.[0]?.url;
        const url = profileImg || historyImg;

        if (url && active) {
          const resolved = resolveCorpUrl(url);
          if (resolved && user?.dbName) {
            CORP_IMG_CACHE[user.dbName] = resolved;
            setLatestCorpImg(resolved);
          }
        }
      } catch (err) {
        console.warn('[AppHeader] Error fetching corporate profile logo:', err);
      }
    };
    fetchActiveCorp();
    return () => {
      active = false;
    };
  }, [user?.dbName, user?.userId]);

  useEffect(() => {
    setHeaderImgError(false);
  }, [activeCorpHeaderImg, user?.dbName]);

  return (
    <View style={{ backgroundColor: bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.header, { backgroundColor: bg, height: undefined, minHeight: 90, paddingVertical: 8 }] as any}>
        {onMenuPress && (
          <TouchableOpacity
            onPress={onMenuPress}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: isDrawerOpen ? '#ef4444' : '#fff',
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 10,
            }}
          >
            <Ionicons
              name={isDrawerOpen ? 'close' : 'menu'}
              size={20}
              color={isDrawerOpen ? '#fff' : '#0f172a'}
            />
          </TouchableOpacity>
        )}

        {onBackPress && (
          <TouchableOpacity onPress={onBackPress} style={{ padding: 4 }}>
            <Ionicons name="arrow-back" size={26} color="#fff" />
          </TouchableOpacity>
        )}

        <View style={{ flex: 1, marginLeft: 10 }}>
          <TouchableOpacity
            onPress={() => setCorpSelectorVisible(true)}
            disabled={!multipleCorporates}
            activeOpacity={0.7}
            style={{ flexDirection: 'row', alignItems: 'center' }}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {multipleCorporates && (
                  <View
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.25)',
                      borderRadius: 8,
                      padding: 4,
                    }}
                  >
                    <Ionicons name="swap-horizontal" size={14} color="#fff" />
                  </View>
                )}
                <Text style={[styles.headerTitle as any, { flexShrink: 1 }]} numberOfLines={2}>
                  {title || user?.corporateName || ''}
                </Text>
                {multipleCorporates && !title && (
                  <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.7)" />
                )}
              </View>
              {!title && user?.corporateTagName ? (
                <Text style={styles.headerSubTitle as any} numberOfLines={1}>
                  {user?.corporateTagName}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>

          {!title && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Ionicons
                  name={dutyStatus === 'ON' ? 'radio-button-on' : 'radio-button-off'}
                  size={12}
                  color={dutyStatus === 'ON' ? '#fff' : 'rgba(255,255,255,0.7)'}
                />
                <Text style={styles.headerLocText as any}>
                  {dutyStatus === 'ON'
                    ? `${schedStartStr} - ${actualStartStr} | End Duty: ${endStr}`
                    : 'Off Duty'}
                </Text>
              </View>

              {/* 🌐 API HOST URL Chip (Just below duty status) */}
              <TouchableOpacity
                onPress={() => {
                  setHostList(appService.getHostList());
                  setShowHostPicker(true);
                }}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.18)',
                  borderRadius: 12,
                  paddingHorizontal: 7,
                  paddingVertical: 3,
                  marginTop: 4,
                  alignSelf: 'flex-start',
                  maxWidth: '98%',
                  borderWidth: 1,
                  borderColor:
                    hostStatus === true
                      ? '#86efac'
                      : hostStatus === false
                      ? '#fca5a5'
                      : 'rgba(255,255,255,0.3)',
                }}
              >
                {hostStatus === 'checking' ? (
                  <ActivityIndicator
                    size="small"
                    color="#fff"
                    style={{ transform: [{ scale: 0.6 }], marginRight: 2 }}
                  />
                ) : (
                  <Ionicons
                    name={
                      hostStatus === true
                        ? 'server'
                        : hostStatus === false
                        ? 'alert-circle'
                        : 'server-outline'
                    }
                    size={11}
                    color={
                      hostStatus === true ? '#86efac' : hostStatus === false ? '#fca5a5' : '#fff'
                    }
                    style={{ marginRight: 4 }}
                  />
                )}
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: '700',
                    flexShrink: 1,
                  }}
                  numberOfLines={1}
                >
                  {customHost || 'Select Host'}
                </Text>
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: '800',
                    marginLeft: 4,
                    color:
                      hostStatus === true
                        ? '#86efac'
                        : hostStatus === false
                        ? '#fca5a5'
                        : 'rgba(255,255,255,0.7)',
                  }}
                >
                  {hostStatus === 'checking'
                    ? '…'
                    : hostStatus === true
                    ? '● Live'
                    : hostStatus === false
                    ? '● Down'
                    : ''}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={11}
                  color="rgba(255,255,255,0.85)"
                  style={{ marginLeft: 4 }}
                />
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {rightAction?.()}
          <TouchableOpacity
            onPress={onCorpImgPress}
            disabled={user?.userRole !== 'CorpAdmin'}
            style={{ marginLeft: 4, opacity: user?.userRole !== 'CorpAdmin' ? 0.7 : 1 }}
          >
            {externalUploading ? (
              <ActivityIndicator color="#fff" style={{ width: 38 }} />
            ) : (
              <FastImage
                key={activeCorpHeaderImg}
                source={activeCorpHeaderImg}
                style={styles.menuImage as any}
                fallbackLabel={(user?.corporateName || 'C').charAt(0).toUpperCase()}
                fallbackColor="#ffffff"
                fallbackTextStyle={{ color: bg, fontWeight: '900', fontSize: 16 }}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Corporate Selection Modal */}
      <Modal
        visible={corpSelectorVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCorpSelectorVisible(false)}
        statusBarTranslucent
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.72)',
            justifyContent: 'center',
            padding: 22,
          }}
          onPress={() => setCorpSelectorVisible(false)}
        >
          <View
            style={{
              backgroundColor: isDark ? '#1e293b' : '#fff',
              borderRadius: 28,
              padding: 22,
              maxHeight: '78%',
              borderWidth: 1,
              borderColor: isDark ? '#334155' : '#f1f5f9',
              ...mkShadow(24),
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 22,
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: '900',
                    color: isDark ? '#f1f5f9' : '#0f172a',
                    letterSpacing: -0.5,
                  }}
                >
                  Switch Business
                </Text>
                <Text style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>
                  Select a corporate profile to view
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setCorpSelectorVisible(false)}
                style={{ padding: 4 }}
              >
                <Ionicons name="close-circle" size={28} color={isDark ? '#475569' : '#cbd5e1'} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 10 }}
            >
              {(user?.accessCorporate || []).map((corp: any) => {
                const isActive = corp.dbName === user?.dbName;
                return (
                  <TouchableOpacity
                    key={corp._id || corp.dbName}
                    onPress={() => handleSwitch(corp.dbName)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 16,
                      borderRadius: 20,
                      marginBottom: 12,
                      borderWidth: 1.5,
                      borderColor: isActive ? COLORS.primary : isDark ? '#334155' : '#f1f5f9',
                      backgroundColor: isActive
                        ? COLORS.primary + '12'
                        : isDark
                          ? 'rgba(30,41,59,0.5)'
                          : '#f8fafc',
                    }}
                  >
                    <CorpItemAvatar
                      corp={corp}
                      isActive={isActive}
                      latestCorpImg={latestCorpImg}
                      user={user}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: '800',
                          color: isDark ? '#f1f5f9' : '#0f172a',
                        }}
                      >
                        {corp.corporateName}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        PAN: {corp.corporatePAN}
                      </Text>
                    </View>
                    {isActive ? (
                      <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                    ) : (
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={isDark ? '#475569' : '#94a3b8'}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* 🌐 API Host Selection Modal */}
      <Modal
        visible={showHostPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHostPicker(false)}
        statusBarTranslucent
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.72)',
            justifyContent: 'center',
            padding: 22,
          }}
          onPress={() => setShowHostPicker(false)}
        >
          <Pressable
            style={{
              backgroundColor: isDark ? '#1e293b' : '#fff',
              borderRadius: 28,
              padding: 22,
              maxHeight: '80%',
              borderWidth: 1,
              borderColor: isDark ? '#334155' : '#f1f5f9',
              ...mkShadow(24),
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View
                    style={{
                      backgroundColor: 'rgba(59,130,246,0.15)',
                      borderRadius: 10,
                      padding: 6,
                    }}
                  >
                    <Ionicons name="server" size={18} color="#3b82f6" />
                  </View>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: '900',
                      color: isDark ? '#f1f5f9' : '#0f172a',
                      letterSpacing: -0.5,
                    }}
                  >
                    API Host URL
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  Select or enter the backend server used across all UI screens
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowHostPicker(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: isDark ? '#334155' : '#f1f5f9',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginLeft: 8,
                }}
              >
                <Ionicons name="close" size={18} color={isDark ? '#cbd5e1' : '#64748b'} />
              </TouchableOpacity>
            </View>

            {/* Host Options */}
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 260 }}>
              {hostList.map((url, idx) => {
                const isActive = url === customHost;
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => applyHost(url)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 14,
                      borderRadius: 16,
                      marginBottom: 10,
                      borderWidth: 1.5,
                      borderColor: isActive ? COLORS.success : isDark ? '#334155' : '#f1f5f9',
                      backgroundColor: isActive
                        ? isDark
                          ? 'rgba(16,185,129,0.15)'
                          : '#ecfdf5'
                        : isDark
                        ? '#0f172a'
                        : '#f8fafc',
                    }}
                  >
                    <Ionicons
                      name={isActive ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={isActive ? COLORS.success : isDark ? '#475569' : '#94a3b8'}
                    />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: isActive ? '800' : '500',
                          color: isActive
                            ? COLORS.success
                            : isDark
                            ? '#f1f5f9'
                            : '#0f172a',
                        }}
                        numberOfLines={1}
                      >
                        {url}
                      </Text>
                    </View>
                    {isActive && (
                      <View
                        style={{
                          backgroundColor: COLORS.success,
                          paddingHorizontal: 8,
                          paddingVertical: 2,
                          borderRadius: 8,
                          marginLeft: 6,
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                          ACTIVE
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Custom URL Input */}
