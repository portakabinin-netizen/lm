// @/dashboards/SalesDashboard.tsx

import { useLeadDashboard } from "@/hooks/useLeadDashboard";
import { useAttendance } from '@/hooks/useAttendance';
import { LinearGradient } from 'expo-linear-gradient';
import { appService } from "@/UtilServices/appHelper";
import CallLogModal from "@/modal/CallLogModal";
import ChatRoomModal from "@/modal/ChatRoomModal";
import { COLORS, FOOTER_HEIGHT, TAB_COLORS, mkShadow, styles } from "@/styles/stylesIndex";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { jwtDecode } from "jwt-decode";
import {
  ActivityIndicator, Animated, RefreshControl, Text, TextInput,
  TouchableOpacity, View, useColorScheme, Modal, Alert
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from 'react-native-svg';

// ─── Config ───────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, string> = {
  Recent: "Recent", Engaged: "Engaged", Accepted: "Accepted", Recycle: "Recycle",
};
const ALL_STATUS_TABS = ["Recent", "Engaged", "Accepted", "Recycle"] as const;
const TABS = [
  { name: "Recent", icon: "flash-outline", active: "flash" },
  { name: "Engaged", icon: "chatbubbles-outline", active: "chatbubbles" },
  { name: "Accepted", icon: "checkmark-done-circle-outline", active: "checkmark-done-circle" },
  { name: "Recycle", icon: "trash-outline", active: "trash" },
] as const;

const LIST_NORMAL = { paddingTop: 10, paddingBottom: FOOTER_HEIGHT + 50, paddingHorizontal: 12 };
const LIST_SEARCH = { paddingTop: 68, paddingBottom: FOOTER_HEIGHT + 50, paddingHorizontal: 12 };
const SEARCH_BASE = {
  position: "absolute" as const, top: 10, left: 12, right: 12, zIndex: 1000,
  flexDirection: "row" as const, alignItems: "center" as const,
  paddingHorizontal: 14, borderRadius: 14, height: 50, borderWidth: 1.5, ...mkShadow(8),
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  token: string;
  userId: string;
  name: string;
  dbName: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SalesDashboard({ token, userId, name, dbName }: Props) {
  const router = useRouter();
  const isDark = useColorScheme() === "dark";
  const bg = isDark ? COLORS.bgDark : COLORS.bgLight;
  const cardBg = isDark ? COLORS.cardDark : COLORS.cardLight;
  const txtCol = isDark ? COLORS.textLight : COLORS.textDark;
  const borderCol = isDark ? COLORS.borderDark : COLORS.border;

  const d = useLeadDashboard({
    token, userId, name,
    dbName: dbName,
    isDark, statusMap: STATUS_MAP,
    allStatusTabs: ALL_STATUS_TABS, initialTab: "Recent",
  });

  const [chatVisible, setChatVisible] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const [broadcastUnseenCount, setBroadcastUnseenCount] = useState(0);
  const [emergencyModalVisible, setEmergencyModalVisible] = useState(false);
  const [emergencyReason, setEmergencyReason] = useState("");

  const accent = useMemo(() => TAB_COLORS[d.activeTab] ?? COLORS.primary, [d.activeTab]);

  const userRole = useMemo(() => {
    try {
      const decoded: any = jwtDecode(token);
      return decoded.userRole;
    } catch (e) {
      return "User";
    }
  }, [token]);

  const {
    dutyStatus, startDuty, endDuty, formatDuration, activeDuty, isShiftComplete
  } = useAttendance();

  const toggleDuty = async () => {
    if (dutyStatus === 'OFF') {
      await startDuty();
    } else {
      if (!isShiftComplete) {
        Alert.alert("Locked", "You cannot end duty before the required hours are completed.");
        return;
      }
      await endDuty();
    }
  };

  const handleEmergencyOff = () => {
    setEmergencyModalVisible(true);
  };

  const submitEmergencyOff = async () => {
    if (!emergencyReason.trim()) {
      Alert.alert("Error", "Please enter a reason.");
      return;
    }
    
    try {
      // 1. Request sent to admins (Duty is NOT ended here anymore)
      Alert.alert("Request Sent", "Your emergency off request has been sent to Admins.");
      
      // 2. Fetch staff to find userAdmin and corpAdmin
      const res = await appService.httpClient.get('service/staff', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.data?.success) {
        const staffList = res.data.data;
        const admins = staffList.filter((u: any) => u.userRole === 'userAdmin' || u.userRole === 'CorpAdmin');
        
        // 3. Send chat message to each admin
        for (const admin of admins) {
          await appService.httpClient.post('service/chat/send', {
            senderName: name,
            senderId: userId,
            text: `Emergency Duty Off Request: ${emergencyReason}`,
            type: 'text',
            isOneToOne: true,
            receiverId: admin._id
          }, {
            headers: { Authorization: `Bearer ${token}` }
          });
        }
      }
    } catch (err) {
      console.error("Failed to send emergency chat message", err);
    }

    setEmergencyModalVisible(false);
    setEmergencyReason("");
  };

  // Only fetch on initial mount or when status tab changes
  useEffect(() => {
    d.fetchLeads();
  }, [d.activeTab]);
  useEffect(() => { if (d.searchVisible || d.callLogVisible) d.fetchAllLeads(); }, [d.searchVisible, d.callLogVisible, d.fetchAllLeads]);

  const searchBarStyle = useMemo(() => ({
    ...SEARCH_BASE, opacity: d.searchVisible ? 1 : 0,
    backgroundColor: cardBg, borderColor: accent + "66",
  }), [d.searchVisible, cardBg, accent]);

  return (
    <View style={[styles.container, { backgroundColor: bg }] as any}>

      {/* Header with Name and Duty Toggle */}
      <View style={{ backgroundColor: '#0f172a' }}>
        <LinearGradient
          colors={['#0f172a', '#1e293b']}
          style={{ paddingTop: 20, paddingBottom: 12, paddingHorizontal: 16 }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{name || 'Sales Person'}</Text>
                {dutyStatus === 'OFF' && (
                  <TouchableOpacity
                    onPress={toggleDuty}
                    style={{ marginLeft: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: '#10b981', justifyContent: 'center', alignItems: 'center', shadowColor: '#10b981', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5 }}
                  >
                    <Ionicons name="finger-print" size={18} color="#fff" />
                  </TouchableOpacity>
                )}
                {dutyStatus === 'ON' && !isShiftComplete && (
                  <TouchableOpacity
                    onPress={handleEmergencyOff}
                    style={{ marginLeft: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: '#f97316', justifyContent: 'center', alignItems: 'center', shadowColor: '#f97316', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5 }}
                  >
                    <Ionicons name="warning-outline" size={18} color="#fff" />
                  </TouchableOpacity>
                )}
                {dutyStatus === 'ON' && isShiftComplete && (
                  <TouchableOpacity
                    onPress={toggleDuty}
                    style={{ marginLeft: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center', shadowColor: '#ef4444', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5 }}
                  >
                    <Ionicons name="power" size={18} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dutyStatus === 'ON' ? "#10b981" : "#ef4444", marginRight: 6 }} />
                <Text style={{ color: dutyStatus === 'ON' ? '#10b981' : '#ef4444', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>
                  {dutyStatus === 'ON' ? 'ON DUTY' : 'OFF DUTY'}
                </Text>
                {dutyStatus === 'ON' && activeDuty?.dutyStart && (
                  <Text style={{ color: '#94a3b8', fontSize: 11, marginLeft: 6, fontWeight: '600' }}>
                    · {formatDuration(activeDuty.dutyStart)} Hrs
                  </Text>
                )}
                {dutyStatus === 'ON' && activeDuty?.site_name && (
                  <Text style={{ color: '#94a3b8', fontSize: 11, marginLeft: 6, fontWeight: '600' }}>
                    · At {activeDuty.site_name}
                  </Text>
                )}
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity onPress={() => setChatVisible(true)} style={{ position: 'relative' }}>
                <Ionicons name="megaphone-outline" size={24} color="#fff" />
                {broadcastUnseenCount > 0 && !(userRole === 'CorpAdmin' || userRole === 'userAdmin') && (
                  <View style={{ position: 'absolute', top: -5, right: -5, backgroundColor: '#ef4444', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{broadcastUnseenCount}</Text>
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => setChatVisible(true)} style={{ position: 'relative' }}>
                <Ionicons name="chatbubbles-outline" size={24} color="#fff" />
                {unseenCount > 0 && !(userRole === 'CorpAdmin' || userRole === 'userAdmin') && (
                  <View style={{ position: 'absolute', top: -5, right: -5, backgroundColor: '#ef4444', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{unseenCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </View>

      {/* 🚀 NEW: Centered Loading Overlays for better UX */}
      {(d.initialLoading || d.callSyncInProgress || d.isActionLoading) && (
        <View style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.4)", zIndex: 9999,
          justifyContent: "center", alignItems: "center"
        } as any}>
          <CenteredSyncOverlay percent={0} />
          <Text style={{ color: "#fff", fontWeight: "700", marginTop: 15, fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>
            {d.callSyncInProgress ? "SYNCING CALLS" : d.isActionLoading ? "PROCESSING" : "LOADING"}
          </Text>
        </View>
      )}

      {/* 🚀 CENTERED SYNC PROGRESS OVERLAY */}
      {d.syncProgress.visible && (
        <View style={{
          position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0,0,0,0.4)", zIndex: 10000,
          justifyContent: "center", alignItems: "center", padding: 15
        } as any}>
          <CenteredSyncOverlay percent={d.syncProgress.overallPercent || 0} />
        </View>
      )}

      {/* Search bar */}
      <View pointerEvents={d.searchVisible ? "auto" : "none"} style={searchBarStyle}>
        <Ionicons name="search" size={18} color={accent} />
        <TextInput
          ref={d.searchInputRef}
          placeholder="Search all leads…"
          placeholderTextColor={COLORS.textMuted}
          style={{ flex: 1, marginLeft: 10, color: txtCol, fontSize: 14, opacity: (d.initialLoading || d.isActionLoading) ? 0.5 : 1 }}
          value={d.searchInput}
          onChangeText={d.setSearchInput}
          blurOnSubmit={false}
          editable={!d.initialLoading && !d.isActionLoading && !d.callSyncInProgress}
        />
        <TouchableOpacity onPress={d.closeSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={22} color={COLORS.danger} />
        </TouchableOpacity>
      </View>

      {/* Lead list */}
      <View style={{ flex: 1 }}>
        <FlashList
          {...({
            data: d.filteredLeads,
            renderItem: d.renderItem,
            keyExtractor: d.keyExtractor,
            estimatedItemSize: 150,
            drawDistance: 600,
            refreshControl: (
              <RefreshControl refreshing={d.refreshing} onRefresh={d.handleRefresh} tintColor={accent} colors={[accent]} />
            ),
            showsVerticalScrollIndicator: false,
            contentContainerStyle: d.searchVisible ? LIST_SEARCH : LIST_NORMAL,
            keyboardShouldPersistTaps: "always",
            keyboardDismissMode: "none",
            ListEmptyComponent: (
              <View style={{ alignItems: "center", marginTop: 80, opacity: 0.35 }}>
                <Ionicons name="document-outline" size={52} color={COLORS.textMuted} />
                <Text style={{ color: COLORS.textMuted, marginTop: 12, fontSize: 14 }}>No leads found</Text>
              </View>
            ),
          } as any)}
        />
      </View>

      {/* Floating action panel */}
      {d.panelVisible && (
        <View style={{
          position: "absolute", bottom: FOOTER_HEIGHT + 18, alignSelf: "center",
          flexDirection: "row", backgroundColor: cardBg, borderRadius: 20,
          paddingHorizontal: 6, paddingVertical: 10, zIndex: 900,
          borderWidth: 1, borderColor: borderCol, ...mkShadow(16),
        }}>
          <PanelBtn icon={<MaterialIcons name="find-in-page" size={20} color={COLORS.textMuted} />} label="Search" onPress={d.openSearch} />
          <PanelDivider />
          <PanelBtn icon={<MaterialIcons name="sync" size={20} color={COLORS.success} />} label="Sync Leads" onPress={d.doDownload} />
          <PanelDivider />
          <PanelBtn icon={<MaterialIcons name="file-download" size={20} color={COLORS.primary} />} label="Export" onPress={d.doExportExcel} />
          <PanelDivider />
          <PanelBtn icon={<Ionicons name="add-circle" size={20} color={accent} />} label="Add Lead" onPress={d.openModal} />
          <PanelDivider />
          <PanelBtn icon={<Ionicons name="play" size={20} color={COLORS.textMuted} />} label="Call Log" onPress={d.doCallSync} />
        </View>
      )}

      <CallLogModal
        visible={d.callLogVisible}
        onClose={() => d.setCallLogVisible(false)}
        leads={d.allLeads}
        isDark={isDark}
      />

      <ChatRoomModal
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
        token={token}
        userId={userId}
        name={name}
        onUnseenCountChange={setUnseenCount}
        onBroadcastUnseenChange={setBroadcastUnseenCount}
      />

      <Modal visible={emergencyModalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: cardBg, borderRadius: 16, padding: 20 }}>
            <Text style={{ color: txtCol, fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>Emergency Duty Off</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 14, marginBottom: 15 }}>Please enter a reason for ending your duty early. This will be recorded.</Text>
            <TextInput
              placeholder="Enter reason here..."
              placeholderTextColor="#94a3b8"
              value={emergencyReason}
              onChangeText={setEmergencyReason}
              style={{ borderWidth: 1, borderColor: borderCol, borderRadius: 8, padding: 10, color: txtCol, backgroundColor: isDark ? "#0f172a" : "#f8fafc", marginBottom: 20, minHeight: 80, textAlignVertical: 'top' }}
              multiline
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <TouchableOpacity onPress={() => { setEmergencyModalVisible(false); setEmergencyReason(""); }} style={{ paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, backgroundColor: isDark ? "#334155" : "#e2e8f0" }}>
                <Text style={{ color: txtCol, fontWeight: '700' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitEmergencyOff} style={{ paddingVertical: 10, paddingHorizontal: 15, borderRadius: 8, backgroundColor: '#ef4444' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bottom nav (Safe Area Protected) */}
      <SafeAreaView edges={["bottom"]} style={{ backgroundColor: cardBg, borderTopWidth: 1, borderTopColor: borderCol, ...mkShadow(12) } as any}>
        <View style={{
          height: FOOTER_HEIGHT,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
        } as any}>
          {TABS.slice(0, 2).map(tab => (
            <TabBtn key={tab.name} tab={tab} isActive={d.activeTab === tab.name}
              accent={TAB_COLORS[tab.name] ?? COLORS.primary} onPress={() => d.switchTab(tab.name)} />
          ))}

          <TouchableOpacity onPress={d.togglePanel} activeOpacity={0.82} style={{
            width: 70, height: 70, borderRadius: 35, backgroundColor: accent,
            justifyContent: "center", alignItems: "center", marginTop: -30,
            borderWidth: 3, borderColor: cardBg, ...mkShadow(14),
          }}>
            {d.panelVisible
              ? <Ionicons name="chevron-down" size={26} color="#fff" />
              : (
                <View style={{ alignItems: "center", gap: 1 }}>
                  <Ionicons name="chevron-up" size={16} color="#fff" />
                  <Ionicons name={(TABS.find(t => t.name === d.activeTab)?.active ?? "flash") as any} size={16} color="#ffffffCC" />
                  <Text style={{ color: "#fff", fontSize: 13, fontWeight: "800", lineHeight: 14 }}>{d.filteredLeads.length}</Text>
                </View>
              )}
          </TouchableOpacity>

          {TABS.slice(2).map(tab => (
            <TabBtn key={tab.name} tab={tab} isActive={d.activeTab === tab.name}
              accent={TAB_COLORS[tab.name] ?? COLORS.primary} onPress={() => d.switchTab(tab.name)} />
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────
const PanelBtn = React.memo(({ icon, label, onPress, loading = false }: {
  icon: React.ReactNode; label: string; onPress: () => void; loading?: boolean;
}) => (
  <TouchableOpacity onPress={onPress} disabled={loading} activeOpacity={0.7}
    style={{ alignItems: "center", paddingVertical: 6, paddingHorizontal: 12, opacity: loading ? 0.7 : 1 }}>
    {loading ? <ActivityIndicator size="small" color={COLORS.success} /> : icon}
    <Text style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 3, fontWeight: "600" }}>
      {loading ? "Loading…" : label}
    </Text>
  </TouchableOpacity>
));

const QuickLink = React.memo(({ icon, label, color, onPress }: any) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={{ alignItems: "center", width: 70 }}>
    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: color + "15", justifyContent: "center", alignItems: "center", marginBottom: 6 }}>
      <Ionicons name={icon} size={22} color={color} />
    </View>
    <Text style={{ fontSize: 10, fontWeight: "600", color: COLORS.textMuted }} numberOfLines={1}>{label}</Text>
  </TouchableOpacity>
));

const PanelDivider = React.memo(() => (
  <View style={{ width: 1, marginHorizontal: 2, alignSelf: "center", height: "55%", backgroundColor: COLORS.border }} />
));

const TabBtn = React.memo(({ tab, isActive, accent, onPress }: {
  tab: { name: string; icon: string; active: string };
  isActive: boolean; accent: string; onPress: () => void;
}) => (
  <TouchableOpacity style={{ alignItems: "center", flex: 1, paddingTop: 4, paddingBottom: 6 }} onPress={onPress} activeOpacity={0.7}>
    {isActive && <View style={{ position: "absolute", top: 0, width: 26, height: 2.5, borderRadius: 2, backgroundColor: accent }} />}
    <Ionicons name={(isActive ? tab.active : tab.icon) as any} size={20} color={isActive ? accent : COLORS.textMuted} />
    <Text style={{ fontSize: 9.5, marginTop: 1, color: isActive ? accent : COLORS.textMuted, fontWeight: isActive ? "700" : "400" }}>
      {tab.name}
    </Text>
  </TouchableOpacity>
));

const CenteredSyncOverlay = React.memo(({ percent }: any) => {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: percent,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [percent]);

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  });

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={COLORS.success}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      <View style={{ position: 'absolute' }}>
        <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff' }}>
          {Math.round(percent)}%
        </Text>
      </View>
    </View>
  );
});

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
