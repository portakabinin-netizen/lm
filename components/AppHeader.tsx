import { useAuthActions, useUserContext } from "@/context/AuthContext";
import { COLORS, mkShadow, styles } from "@/styles/stylesIndex";
import { appService } from "@/UtilServices/appHelper";
import { appModules } from "@/UtilServices/appModals";
import { useAttendance } from "@/hooks/useAttendance";
import { getSocket } from "@/hooks/Socket";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator, DeviceEventEmitter, Image, Modal, Platform, Pressable, ScrollView, Switch, Text, TouchableOpacity,
  useColorScheme,
  View
} from "react-native";
import { useGPSCoordinates } from "@/hooks/useGPSCoordinates";

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

export const AppHeader = React.memo(function AppHeader({
  onMenuPress, onBackPress, onCorpImgPress: externalOnCorpImgPress,
  uploading: externalUploading, title, rightAction, previewUri,
  isDrawerOpen
}: AppHeaderProps) {
  const { user } = useUserContext();
  const { switchCorporate } = useAuthActions();
  const { refresh: refreshGPS } = useGPSCoordinates();
  const isDark = useColorScheme() === "dark";

  const [isOnline, setIsOnline] = useState(true);
  const [locLoading, setLocLoading] = useState(false);
  const [location, setLocation] = useState("Detecting…");
  const [corpSelectorVisible, setCorpSelectorVisible] = useState(false);

  // DutyToggle — only for operational roles
  const DUTY_ROLES = ['CorpAdmin', 'Project', 'Sales', 'userAdmin', 'Staff'];
  const showDutyToggle = DUTY_ROLES.includes(user?.userRole ?? '');
  const {
    dutyStatus, activeDuty, selectedShift, isLoading: dutyLoading, toggleDuty, formatDuration
  } = useAttendance();

  const dutyStart = activeDuty?.dutyStart ? new Date(activeDuty.dutyStart) : null;
  const hoursElapsed = dutyStart ? (Date.now() - dutyStart.getTime()) / 3600000 : 0;
  
  // Dynamic shift details provided by active duty
  const shiftHours = activeDuty?.shiftLockHours || 8;
  const enableHours = shiftHours === 12 ? 11 : (shiftHours === 8 ? 7 : shiftHours - 1);
  const canEndDuty = hoursElapsed >= enableHours;

  const dutyEndScheduled = activeDuty?.dutyEndScheduled ? new Date(activeDuty.dutyEndScheduled) : null;
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
    : dutyStart ? formatTime(new Date(dutyStart.getTime() + shiftHours * 3600000)) : '';

  const dutyStartScheduled = activeDuty?.dutyStartScheduled ? new Date(activeDuty.dutyStartScheduled) : null;
  const schedStartStr = dutyStartScheduled 
    ? formatTime(dutyStartScheduled) 
    : formatTime(dutyStart);
  const actualStartStr = formatTime(dutyStart);

  const [latestCorpImg, setLatestCorpImg] = useState<string | null>(
    (user?.dbName && CORP_IMG_CACHE[user.dbName]) || null
  );

  // ── Fetch Latest Corp Image ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchLatest = async () => {
      if (!user?.userId || !user?.dbName) return; // 🚀 Safety: Don't fetch without tenant
      try {
        const res = await appService.httpClient.get(`auth/get-profile-history`, {
          params: { userId: user.userId, type: "corp" }
        });
        if (res.data?.resources?.length > 0) {
          const url = res.data.resources[0].url;
          setLatestCorpImg(url);
          if (user?.dbName) CORP_IMG_CACHE[user.dbName] = url;
        }
      } catch (err: any) {
        if (err.response?.status !== 401) {
          console.warn("Header Image Fetch Error:", err?.message || err);
        }
      }
    };
    fetchLatest();

    const sub = DeviceEventEmitter.addListener("refresh_corp_image", (newUrl?: string) => {
      if (typeof newUrl === "string") {
        setLatestCorpImg(newUrl);
        if (user?.dbName) CORP_IMG_CACHE[user.dbName] = newUrl;
      }
      else fetchLatest();
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
      if (!available && error) appService.showToast(error, "Error");
    };
    check();
    const id = setInterval(check, 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  const fetchLocation = useCallback(async () => {
    setLocLoading(true);
    try {
      const data = await refreshGPS();
      if (!data) throw new Error();
      setLocation(`📍 ${data.resolvedName}`);
    } catch {
      setLocation("Location unavailable");
    } finally {
      setLocLoading(false);
    }
  }, [refreshGPS]);

  useEffect(() => { fetchLocation(); }, [fetchLocation]);

  // ── Active API Host Tracking ──────────────────────────────────────────────
  const [activeHost, setActiveHost] = useState<string>(() => appService.getCurrentBaseURL());

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('SERVER_HOST_CHANGED', (newUrl: string) => {
      if (newUrl) setActiveHost(newUrl);
    });
    const interval = setInterval(() => {
      const current = appService.getCurrentBaseURL();
      if (current && current !== activeHost) {
        setActiveHost(current);
      }
    }, 3000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [activeHost]);

  const activeHostInfo = useMemo(() => {
    const raw = activeHost || appService.getCurrentBaseURL() || '';
    const name = appService.getHostDisplayName(raw);
    return { name, full: raw };
  }, [activeHost]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSwitch = async (id: string) => {
    setCorpSelectorVisible(false);
    setLatestCorpImg(null);
    await switchCorporate(id);
  };

  const defaultOnCorpImgPress = () => {
    if (user?.userRole?.toLowerCase() !== "corpadmin") {
      return appService.showToast("Only Admin can change Corp Photo", "Info");
    }
    appModules.openUser({
      type: "camera",
      profileType: "corp",
      previewUri: null,
      onSelect: () => { },
      onUpload: () => { },
      onClear: () => { }
    });
  };

  const onCorpImgPress = externalOnCorpImgPress || defaultOnCorpImgPress;

  // Use the exact emerald green requested (default was #059669)
  const bg = isOnline ? COLORS.primary : "#DC2626";
  const multipleCorporates = (user?.accessCorporate?.length ?? 0) > 1;

  return (
    <View style={{ backgroundColor: bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.header, { backgroundColor: bg }] as any}>

        {onMenuPress && (
          <TouchableOpacity 
            onPress={onMenuPress} 
            style={{ 
              width: 36, height: 36, borderRadius: 18, 
              backgroundColor: isDrawerOpen ? '#ef4444' : '#fff', 
              justifyContent: 'center', alignItems: 'center', 
              marginRight: 10 
            }}
          >
            <Ionicons name={isDrawerOpen ? "close" : "menu"} size={20} color={isDrawerOpen ? "#fff" : "#0f172a"} />
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
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {multipleCorporates && (
                  <View style={{ backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 8, padding: 4 }}>
                    <Ionicons name="swap-horizontal" size={14} color="#fff" />
                  </View>
                )}
                <Text style={[styles.headerTitle as any, { flexShrink: 1 }]} numberOfLines={2}>
                  {title || user?.corporateName || user?.accessCorporate?.[0]?.corporateName || ""}
                </Text>
              </View>
              {!title && user?.corporateTagName ? (
                <Text style={styles.headerSubTitle as any} numberOfLines={1}>
                  {user?.corporateTagName}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>

          {!title && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons 
                  name={dutyStatus === 'ON' ? 'radio-button-on' : 'radio-button-off'} 
                  size={12} 
                  color={dutyStatus === 'ON' ? '#4ade80' : 'rgba(255,255,255,0.7)'} 
                />
                <Text style={styles.headerLocText as any}>
                  {dutyStatus === 'ON' 
                    ? `${schedStartStr} - ${actualStartStr} | End Duty: ${endStr}`
                    : 'Off Duty'}
                </Text>
              </View>

              {/* 🌐 Active API Hosting URL + Live/Down Status Badge */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={async () => {
                  const checkRes = await appService.isSystemLive();
                  setIsOnline(checkRes.available);
                  appService.showToast(
                    `API: ${activeHostInfo.full || activeHostInfo.name} (${checkRes.available ? 'Live' : 'Down'})`,
                    checkRes.available ? 'Success' : 'Error'
                  );
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: isOnline
                    ? 'rgba(16, 185, 129, 0.25)'
                    : 'rgba(239, 68, 68, 0.28)',
                  paddingHorizontal: 7,
                  paddingVertical: 1.5,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: isOnline
                    ? 'rgba(52, 211, 153, 0.5)'
                    : 'rgba(248, 113, 113, 0.5)',
                  gap: 4,
                }}
              >
                {/* Status Dot */}
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: isOnline ? '#34d399' : '#f87171',
                  }}
                />
                <Text
                  style={{
                    color: isOnline ? '#d1fae5' : '#fee2e2',
                    fontSize: 10.5,
                    fontWeight: '700',
                    letterSpacing: 0.2,
                  }}
                  numberOfLines={1}
                >
                  {activeHostInfo.name} {isOnline ? 'Live' : 'Down'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>



          {rightAction?.()}
          <TouchableOpacity
            onPress={onCorpImgPress}
            disabled={user?.userRole !== "CorpAdmin"}
            style={{ marginLeft: 4, opacity: user?.userRole !== "CorpAdmin" ? 0.7 : 1 }}
          >
            {externalUploading ? (
              <ActivityIndicator color="#fff" style={{ width: 38 }} />
            ) : (previewUri || latestCorpImg || user?.CorpProfileImage) ? (
              <Image
                source={{ uri: previewUri || latestCorpImg || user?.CorpProfileImage }}
                style={styles.menuImage as any}
              />
            ) : (
              <View style={[styles.menuImage, { backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }] as any}>
                <Text style={{ color: bg, fontWeight: '900', fontSize: 16 }}>
                  {((user?.corporateName || user?.accessCorporate?.[0]?.corporateName || 'C')).charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Corporate Selection Modal */}
      <Modal visible={corpSelectorVisible} transparent animationType="fade" onRequestClose={() => setCorpSelectorVisible(false)} statusBarTranslucent>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.72)", justifyContent: "center", padding: 22 }}
          onPress={() => setCorpSelectorVisible(false)}
        >
          <View style={{
            backgroundColor: isDark ? "#1e293b" : "#fff",
            borderRadius: 28, padding: 22, maxHeight: "78%",
            borderWidth: 1, borderColor: isDark ? "#334155" : "#f1f5f9",
            ...mkShadow(24)
          }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
              <View>
                <Text style={{ fontSize: 22, fontWeight: "900", color: isDark ? "#f1f5f9" : "#0f172a", letterSpacing: -0.5 }}>Switch Business</Text>
                <Text style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>Select a corporate profile to view</Text>
              </View>
              <TouchableOpacity onPress={() => setCorpSelectorVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={28} color={isDark ? "#475569" : "#cbd5e1"} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
              {(user?.accessCorporate || []).map((corp: any) => {
                const isActive = corp.dbName === user?.dbName;
                return (
                  <TouchableOpacity
                    key={corp._id || corp.dbName}
                    onPress={() => handleSwitch(corp.dbName)}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 20,
                      marginBottom: 12, borderWidth: 1.5,
                      borderColor: isActive ? COLORS.primary : (isDark ? "#334155" : "#f1f5f9"),
                      backgroundColor: isActive ? COLORS.primary + "12" : (isDark ? "rgba(30,41,59,0.5)" : "#f8fafc")
                    }}
                  >
                    {CORP_IMG_CACHE[corp.dbName] || corp.CorpProfileImage ? (
                      <Image
                        source={{ uri: CORP_IMG_CACHE[corp.dbName] || corp.CorpProfileImage }}
                        style={{ width: 48, height: 48, borderRadius: 12, marginRight: 16, backgroundColor: "#fff" } as any}
                      />
                    ) : (
                      <View style={{ width: 48, height: 48, borderRadius: 12, marginRight: 16, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' }}>
                        <Text style={{ color: COLORS.primary, fontWeight: '900', fontSize: 18 }}>
                          {(corp.corporateName || 'C').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: "800", color: isDark ? "#f1f5f9" : "#0f172a" }}>{corp.corporateName}</Text>
                      <Text style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>PAN: {corp.corporatePAN}</Text>
                    </View>
                    {isActive
                      ? <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                      : <Ionicons name="chevron-forward" size={18} color={isDark ? "#475569" : "#94a3b8"} />
                    }
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
});

