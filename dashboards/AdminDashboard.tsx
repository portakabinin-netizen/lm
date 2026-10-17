// @/dashboards/AdminDashboard.tsx

import { useUserContext } from '@/context/AuthContext';
import { useAttendance } from '@/hooks/useAttendance';
import { useLeadDashboard } from '@/hooks/useLeadDashboard';
import { useUnifiedLocation } from '@/hooks/useUnifiedLocation';
import BroadcastAlertModal from '@/modal/BroadcastAlertModal';
import CallLogModal from '@/modal/CallLogModal';
import ChatRoomModal from '@/modal/ChatRoomModal';
import { VoucherEntryModal } from '@/modal/VoucherEntryModal';
import { COLORS, FOOTER_HEIGHT, TAB_COLORS, mkShadow, styles } from '@/styles/stylesIndex';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { FlashList } from '@shopify/flash-list';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FinanceDashboard from './FinanceDashboard';
import LeadAnalytics from './leadsAnalytics';
import ProjectDashboard from './ProjectDashboard';
import { ActivityTicker } from '../components/ActivityTicker';
import StaffMonitoringPanel from '../components/StaffMonitoringPanel';

// ─── Config ───────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, string> = {
  Engaged: 'Engaged',
  Accepted: 'Accepted',
  Invoice: 'Tax Invoice',
  Recycle: 'Recycle',
};
const ALL_STATUS_TABS = ['Engaged', 'Accepted', 'Tax Invoice', 'Recycle'] as const;

const SALES_TABS = [
  { name: 'Engaged', icon: 'chatbubbles-outline', active: 'chatbubbles' },
  { name: 'Accepted', icon: 'checkmark-done-circle-outline', active: 'checkmark-done-circle' },
  { name: 'Tax Invoice', icon: 'receipt-outline', active: 'receipt' },
  { name: 'Recycle', icon: 'trash-outline', active: 'trash' },
] as const;

const MAIN_TABS = [
  { name: 'Admin',   icon: 'shield-outline',   active: 'shield' },
  { name: 'Project', icon: 'folder-outline',   active: 'folder' },
  { name: 'Monitor', icon: 'videocam-outline', active: 'videocam' },
  { name: 'Sales',   icon: 'trending-up-outline', active: 'trending-up' },
  { name: 'Finance', icon: 'cash-outline',     active: 'cash' },
] as const;

const LIST_NORMAL = { paddingTop: 10, paddingBottom: FOOTER_HEIGHT + 30, paddingHorizontal: 12 };
const LIST_SEARCH = { paddingTop: 80, paddingBottom: FOOTER_HEIGHT + 30, paddingHorizontal: 12 };
const SEARCH_BASE = {
  position: 'absolute' as const,
  top: 10,
  left: 12,
  right: 12,
  zIndex: 1000,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  paddingHorizontal: 14,
  borderRadius: 14,
  height: 50,
  borderWidth: 1.5,
  ...mkShadow(8),
};

type MainTabName = 'Admin' | 'Project' | 'Monitor' | 'Sales' | 'Finance';

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  token: string;
  userId: string;
  name: string;
  dbName: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AdminDashboard({ token, userId, name, dbName }: Props) {
  const { user } = useUserContext();
  const isDark = useColorScheme() === 'dark';
  const { activeStaff, fetchActiveStaff, refreshLiveTrackerLocation: refreshLocation } = useUnifiedLocation('LiveTracker');
  const bg = isDark ? COLORS.bgDark : COLORS.bgLight;
  const cardBg = isDark ? COLORS.cardDark : COLORS.cardLight;
  const txtCol = isDark ? COLORS.textLight : COLORS.textDark;
  const borderCol = isDark ? COLORS.borderDark : COLORS.border;

  const [mainTab, setMainTab] = useState<MainTabName>('Admin');
  const [voucherVisible, setVoucherVisible] = useState(false);
  const [voucherMode, setVoucherMode] = useState<
    | 'bill_collection'
    | 'advance'
    | 'salary'
    | 'payment'
    | 'receipt'
    | 'contra'
    | 'journal'
    | undefined
  >(undefined);
  const router = useRouter();
  const { dutyStatus, isLoading: dutyLoading, toggleDuty } = useAttendance();
  const [unseenCount, setUnseenCount] = useState(0);
  const [latestBroadcast, setLatestBroadcast] = useState('');
  const [chatVisible, setChatVisible] = useState(false);

  // Lead Activity Feed State for Admin Tab
  const [activityDate, setActivityDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activityLeadFilter, setActivityLeadFilter] = useState<string>('ALL');
  const d = useLeadDashboard({
    token,
    userId,
    name,
    dbName: dbName || user?.dbName,
    isDark,
    statusMap: STATUS_MAP,
    allStatusTabs: ALL_STATUS_TABS,
    initialTab: 'Engaged',
  });

  // Synchronise active staff and location refresh with lead dashboard refreshing
  useEffect(() => {
    if (d?.refreshing) {
      fetchActiveStaff();
      refreshLocation();
    }
  }, [d?.refreshing, fetchActiveStaff, refreshLocation]);

  // Aggregated Activities for the Activity Marquee
  const aggregatedActivities = useMemo(() => {
    const targetDate = activityDate.toISOString().split('T')[0];
    const all = d.allLeads || [];

    let flatActivities: any[] = [];
    all.forEach((l: any) => {
      if (activityLeadFilter !== 'ALL' && l._id !== activityLeadFilter) return;
      if (Array.isArray(l.activity)) {
        l.activity.forEach((act: any) => {
          if (!act.date) return;
          const actDateStr = new Date(act.date).toISOString().split('T')[0];
          if (actDateStr === targetDate) {
            flatActivities.push({
              ...act,
              leadId: l._id,
              leadNo: l.lead_no,
              leadName: l.sender_name || 'Unknown',
            });
          }
        });
      }
    });

    flatActivities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return flatActivities;
  }, [d.allLeads, activityDate, activityLeadFilter]);

  const accent = useMemo(() => TAB_COLORS[d.activeTab] ?? COLORS.primary, [d.activeTab]);

  // ── Fetch only when Sales tab is active ───────────────────────────────────
  useEffect(() => {
    if (mainTab === 'Sales') d.fetchLeads();
  }, [mainTab, d.activeTab]);

  useEffect(() => {
    if (mainTab === 'Admin') d.fetchAllLeads();
    if ((d.searchVisible || d.callLogVisible) && mainTab === 'Sales') d.fetchAllLeads();
  }, [d.searchVisible, d.callLogVisible, d.fetchAllLeads, mainTab]);

  const switchMainTab = useCallback(
    (t: MainTabName) => {
      setMainTab(t);
      d.setPanelVisible(false);
      d.setSearchVisible(false);
      d.setSearchInput('');
    },
    [d]
  );

  const searchBarStyle = useMemo(
    () => ({
      ...SEARCH_BASE,
      opacity: d.searchVisible ? 1 : 0,
      backgroundColor: cardBg,
      borderColor: accent + '66',
    }),
    [d.searchVisible, cardBg, accent]
  );

  return (
    <View style={[styles.container, { backgroundColor: bg }] as any}>
      {/* Fixed Header */}
      <View style={{ backgroundColor: '#0f172a' }}>
        <LinearGradient
          colors={['#0f172a', '#1e293b']}
          style={{ paddingVertical: 12, paddingHorizontal: 16 }}
        >
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <View>
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>
                  {name || 'Admin'}
                </Text>
                {dutyStatus === 'ON' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <View
                      style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }}
                    />
                    <Text style={{ color: '#e2e8f0', fontSize: 11, fontWeight: '700' }}>Live</Text>
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {/* Duty Switch Capsule */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                    borderRadius: 20,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}
                >
                  <Switch
                    value={dutyStatus === 'ON'}
                    onValueChange={toggleDuty}
                    disabled={dutyLoading}
                    trackColor={{ false: '#7f1d1d', true: '#14532d' }}
                    thumbColor={dutyStatus === 'ON' ? '#22c55e' : '#ef4444'}
                    style={{
                      transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
                      marginVertical: -4,
                      marginRight: 2,
                    }}
                  />
                  <Text
                    style={{
                      color: dutyLoading
                        ? '#94a3b8'
                        : dutyStatus === 'ON'
                          ? '#4ade80'
                          : '#f87171',
                      fontSize: 12,
                      fontWeight: '800',
                      letterSpacing: 0.4,
                    }}
                  >
                    {dutyLoading
                      ? 'UPDATING...'
                      : dutyStatus === 'ON'
                        ? 'ON DUTY'
                        : 'OFF DUTY'}
                  </Text>
                  {dutyLoading && (
                    <ActivityIndicator
                      size="small"
                      color="#94a3b8"
                      style={{ marginLeft: 4, transform: [{ scale: 0.7 }] }}
                    />
                  )}
                </View>

                <TouchableOpacity onPress={() => setChatVisible(true)} style={{ position: 'relative' }}>
                  <Ionicons name="chatbubbles-outline" size={24} color="#fff" />
                  {unseenCount > 0 && (
                    <View
                      style={{
                        position: 'absolute',
                        top: -5,
                        right: -5,
                        backgroundColor: '#ef4444',
                        borderRadius: 8,
                        minWidth: 16,
                        height: 16,
                        justifyContent: 'center',
                        alignItems: 'center',
                        paddingHorizontal: 4,
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                        {unseenCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </View>

      {/* 🚀 NEW: Centered Loading Overlays for better UX */}
      {(d.initialLoading || d.callSyncInProgress || d.isActionLoading) && (
        <View
          style={
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.4)',
              zIndex: 9999,
              justifyContent: 'center',
              alignItems: 'center',
            } as any
          }
        >
          <CenteredSyncOverlay percent={0} />
          <Text
            style={{
              color: '#fff',
              fontWeight: '700',
              marginTop: 15,
              fontSize: 12,
              opacity: 0.6,
              letterSpacing: 1,
            }}
          >
            {d.callSyncInProgress ? 'SYNCING CALLS' : d.isActionLoading ? 'PROCESSING' : 'LOADING'}
          </Text>
        </View>
      )}

      {/* 🚀 CENTERED SYNC PROGRESS OVERLAY */}
      {d.syncProgress.visible && (
        <View
          style={
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.4)',
              zIndex: 10000,
              justifyContent: 'center',
              alignItems: 'center',
              padding: 15,
            } as any
          }
        >
          <CenteredSyncOverlay
            isDark={isDark}
            percent={d.syncProgress.overallPercent || 0}
            text={d.syncProgress.text}
            stats={d.syncProgress.stats}
          />
        </View>
      )}

      {/* ── ADMIN TAB ──────────────────────────────────────────────────────────── */}
      {mainTab === 'Admin' && (
        <View style={{ flex: 1 }}>
          <View
            style={{
              backgroundColor: '#f1f5f9',
              paddingVertical: 4,
              paddingRight: 4,
              flexDirection: 'row',
              alignItems: 'center',
              borderRadius: 12,
              marginHorizontal: 8,
              marginTop: 8,
              overflow: 'hidden',
            }}
          >
            <TouchableOpacity
              onPress={() => setShowDatePicker(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: '#cbd5e1',
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 8,
                marginLeft: 4,
                marginRight: 6,
                zIndex: 10,
              }}
            >
              <Ionicons name="calendar" size={14} color="#1e293b" />
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#1e293b' }}>
                {`${String(activityDate.getDate()).padStart(2, '0')}-${String(activityDate.getMonth() + 1).padStart(2, '0')}-${activityDate.getFullYear()}`}
              </Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <ActivityTicker activities={aggregatedActivities} />
            </View>
          </View>
          <LeadAnalytics key={dbName || user?.dbName || 'lead-analytics'} isDark={isDark} token={token || user?.token || ''} dbName={dbName || user?.dbName} />
          {/* 📢 Broadcast Composer (CorpAdmin/Admin only — auto-hides for other roles) */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <BroadcastAlertModal showSender={true} />
          </View>
        </View>
      )}

      {/* ── PROJECT TAB ────────────────────────────────────────────────────── */}
      {mainTab === 'Project' && (
        <ProjectDashboard
          key={dbName}
          token={token}
          userId={userId}
          dbName={dbName}
          corporateId={user?.corporateId ?? ''}
          corpAdminId={user?.corpAdminId ?? ''}
          name={name || user?.name}
          hideHeader={true}
        />
      )}

      {/* ── MONITOR TAB ──────────────────────────────────────────────────── */}
      {mainTab === 'Monitor' && (
        <StaffMonitoringPanel key={dbName} token={token} />
      )}

      {/* ── FINANCE TAB ────────────────────────────────────────────────────── */}
      {mainTab === 'Finance' && (
        <FinanceDashboard
          key={dbName}
          token={token}
          userId={userId}
          name={name || user?.name || ''}
          dbName={dbName}
          hideHeader={true}
        />
      )}

      {/* ── SALES TAB ──────────────────────────────────────────────────────── */}
      {mainTab === 'Sales' && (
        <>
          {/* Top status tabs */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: cardBg,
              borderBottomWidth: 0.5,
              borderBottomColor: borderCol,
            }}
          >
            {SALES_TABS.map((tab) => {
              const isActive = d.activeTab === tab.name;
              const tabAccent = TAB_COLORS[tab.name] ?? COLORS.primary;
              return (
                <TouchableOpacity
                  key={tab.name}
                  onPress={() => d.switchTab(tab.name)}
                  activeOpacity={0.75}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderBottomWidth: isActive ? 2 : 0,
                    borderBottomColor: isActive ? tabAccent : 'transparent',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: isActive ? '600' : '400',
                      color: isActive ? tabAccent : COLORS.textMuted,
                    }}
                    numberOfLines={1}
                  >
                    {tab.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Search bar */}
          <View pointerEvents={d.searchVisible ? 'auto' : 'none'} style={searchBarStyle}>
            <Ionicons name="search" size={18} color={accent} />
            <TextInput
              ref={d.searchInputRef}
              placeholder="Search all leads…"
              placeholderTextColor={COLORS.textMuted}
              style={{
                flex: 1,
                marginLeft: 10,
                color: txtCol,
                fontSize: 14,
                opacity: d.initialLoading || d.isActionLoading ? 0.5 : 1,
              }}
              value={d.searchInput}
              onChangeText={d.setSearchInput}
              blurOnSubmit={false}
              editable={!d.initialLoading && !d.isActionLoading && !d.callSyncInProgress}
            />
            <TouchableOpacity
              onPress={d.closeSearch}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
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
                  <RefreshControl
                    refreshing={d.refreshing}
                    onRefresh={d.handleRefresh}
                    tintColor={accent}
                    colors={[accent]}
                  />
                ),
                showsVerticalScrollIndicator: false,
                contentContainerStyle: d.searchVisible ? LIST_SEARCH : LIST_NORMAL,
                keyboardShouldPersistTaps: 'always',
                keyboardDismissMode: 'none',
                ListEmptyComponent: (
                  <View style={{ alignItems: 'center', marginTop: 80, opacity: 0.35 }}>
                    <Ionicons name="document-outline" size={52} color={COLORS.textMuted} />
                    <Text style={{ color: COLORS.textMuted, marginTop: 12, fontSize: 14 }}>
                      No leads found
                    </Text>
                  </View>
                ),
              } as any)}
            />
          </View>

          {/* Floating action panel */}
          {d.panelVisible && (
            <View
              style={{
                position: 'absolute',
                bottom: FOOTER_HEIGHT + 65,
                alignSelf: 'center',
                width: '95%',
                maxWidth: 400,
              }}
            >
              {/* Broadcast Message */}
              <View
                style={{
                  backgroundColor: '#fff',
                  padding: 12,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  minHeight: 60,
                  marginBottom: 10,
                }}
              >
                <Text
                  style={{ fontSize: 10, fontWeight: '800', color: '#94a3b8', marginBottom: 4 }}
                >
                  BROADCAST MESSAGE
                </Text>
                <Text style={{ fontSize: 12, color: '#334155', lineHeight: 16 }}>
                  {latestBroadcast || 'No messages received.'}
                </Text>
              </View>

              {/* Quick Action Panel */}
              <View
                style={{
                  flexDirection: 'row',
                  backgroundColor: cardBg,
                  borderRadius: 20,
                  paddingHorizontal: 4,
                  paddingVertical: 10,
                  zIndex: 900,
                  borderWidth: 1,
                  borderColor: borderCol,
                  ...mkShadow(16),
                  width: '100%',
                  justifyContent: 'space-around',
                }}
              >
                <PanelBtn
                  icon={<MaterialIcons name="find-in-page" size={20} color={COLORS.textMuted} />}
                  label="Search"
                  onPress={d.openSearch}
                />
                <PanelDivider />
                <PanelBtn
                  icon={<MaterialIcons name="sync" size={20} color={COLORS.success} />}
                  label="Sync Leads"
                  onPress={d.doDownload}
                />
                <PanelDivider />
                <PanelBtn
                  icon={<Ionicons name="add-circle" size={20} color={accent} />}
                  label="Manual Lead"
                  onPress={d.openModal}
                />
                <PanelDivider />
                <PanelBtn
                  icon={<Ionicons name="cash-outline" size={20} color="#15803d" />}
                  label="Bill Coll."
                  onPress={() => {
                    setVoucherMode('bill_collection');
                    setVoucherVisible(true);
                  }}
                />
                <PanelDivider />
                <PanelBtn
                  icon={<Ionicons name="play" size={20} color={accent} />}
                  label="Audio Log"
                  onPress={d.doCallSync}
                />
              </View>
            </View>
          )}

          <CallLogModal
            visible={d.callLogVisible}
            onClose={() => d.setCallLogVisible(false)}
            leads={d.allLeads}
            isDark={isDark}
          />

          <VoucherEntryModal
            visible={voucherVisible}
            onClose={() => {
              setVoucherVisible(false);
              setVoucherMode(undefined);
            }}
            token={token}
            dbName={dbName}
            mode={voucherMode}
          />
        </>
      )}

      {/* ── BOTTOM NAV (Safe Area Protected + Dynamic Actions) ──────────────── */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1000 }}>
        <SafeAreaView
          edges={['bottom']}
          style={
            {
              backgroundColor: cardBg,
              borderTopWidth: 1,
              borderTopColor: borderCol,
              ...mkShadow(20),
            } as any
          }
        >
          <View style={{ position: 'relative', width: '100%', height: FOOTER_HEIGHT + 10 } as any}>
            {/* Premium Toggle - Positioned "Floating" across the top edge */}
            {mainTab === 'Sales' && (
              <TouchableOpacity
                onPress={d.togglePanel}
                activeOpacity={0.9}
                style={
                  {
                    position: 'absolute',
                    top: -24,
                    alignSelf: 'center',
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: accent,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 4,
                    borderColor: cardBg,
                    ...mkShadow(15),
                    zIndex: 3000,
                  } as any
                }
              >
                <Animated.View
                  style={{ transform: [{ rotate: d.panelVisible ? '180deg' : '0deg' }] }}
                >
                  <Ionicons name={d.panelVisible ? 'chevron-down' : 'add'} size={32} color="#fff" />
                </Animated.View>
              </TouchableOpacity>
            )}

            <View
              style={
                {
                  height: FOOTER_HEIGHT,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  paddingHorizontal: 10,
                } as any
              }
            >
              {/* Admin Tab */}
              <MainTabBtn
                tab={MAIN_TABS[0]}
                isActive={mainTab === 'Admin'}
                accent={COLORS.primary}
                onPress={() => switchMainTab('Admin')}
              />

              {/* Project Tab */}
              <MainTabBtn
                tab={MAIN_TABS[1]}
                isActive={mainTab === 'Project'}
                accent={COLORS.primary}
                onPress={() => switchMainTab('Project')}
              />

              {/* Monitor Tab */}
              <MainTabBtn
                tab={MAIN_TABS[2]}
                isActive={mainTab === 'Monitor'}
                accent="#f97316"
                onPress={() => switchMainTab('Monitor')}
              />

              {/* Space for the floating button */}
              <View style={{ width: 60 }} />

              {/* Sales Tab */}
              <MainTabBtn
                tab={MAIN_TABS[3]}
                isActive={mainTab === 'Sales'}
                accent={accent}
                onPress={() => switchMainTab('Sales')}
              />

              {/* Finance Tab */}
              <MainTabBtn
                tab={MAIN_TABS[4]}
                isActive={mainTab === 'Finance'}
                accent="#1D9E75"
                onPress={() => switchMainTab('Finance')}
              />
            </View>
          </View>

          <ChatRoomModal
            visible={chatVisible}
            onClose={() => setChatVisible(false)}
            token={token}
            userId={userId}
            name={name}
            onUnseenCountChange={setUnseenCount}
          />
        </SafeAreaView>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={activityDate}
          mode="date"
          display="default"
          onChange={(event: any, selectedDate?: Date) => {
            setShowDatePicker(false);
            if (selectedDate) setActivityDate(selectedDate);
          }}
        />
      )}
    </View>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────
const PanelBtn = React.memo(
  ({
    icon,
    label,
    onPress,
    loading = false,
  }: {
    icon: React.ReactNode;
    label: string;
    onPress: () => void;
    loading?: boolean;
  }) => {
    const lastTapRef = useRef<number>(0);

    const handlePress = () => {
      const now = Date.now();
      const DOUBLE_PRESS_DELAY = 300;
      if (now - lastTapRef.current < DOUBLE_PRESS_DELAY) {
        onPress();
        lastTapRef.current = 0; // reset
      } else {
        lastTapRef.current = now;
      }
    };

    return (
      <TouchableOpacity
        onPress={handlePress}
        disabled={loading}
        activeOpacity={0.7}
        style={{
          alignItems: 'center',
          paddingVertical: 6,
          paddingHorizontal: 8,
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? <ActivityIndicator size="small" color={COLORS.success} /> : icon}
        <Text style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 3, fontWeight: '600' }}>
        {loading ? 'Loading…' : label}
      </Text>
    </TouchableOpacity>
    );
  }
);

const QuickLink = React.memo(({ icon, label, color, onPress }: any) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    style={{ alignItems: 'center', width: 70 }}
  >
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: color + '15',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 6,
      }}
    >
      <Ionicons name={icon} size={22} color={color} />
    </View>
    <Text style={{ fontSize: 10, fontWeight: '600', color: COLORS.textMuted }} numberOfLines={1}>
      {label}
    </Text>
  </TouchableOpacity>
));

const PanelDivider = React.memo(() => (
  <View
    style={{
      width: 1,
      marginHorizontal: 2,
      alignSelf: 'center',
      height: '55%',
      backgroundColor: COLORS.border,
    }}
  />
));

const MainTabBtn = React.memo(
  ({
    tab,
    isActive,
    accent,
    onPress,
  }: {
    tab: { name: string; icon: string; active: string };
    isActive: boolean;
    accent: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      style={{ alignItems: 'center', flex: 1, paddingTop: 4, paddingBottom: 6 }}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {isActive && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            width: 26,
            height: 2.5,
            borderRadius: 2,
            backgroundColor: accent,
          }}
        />
      )}
      <Ionicons
        name={(isActive ? tab.active : tab.icon) as any}
        size={20}
        color={isActive ? accent : COLORS.textMuted}
      />
      <Text
        style={{
          fontSize: 9.5,
          marginTop: 1,
          color: isActive ? accent : COLORS.textMuted,
          fontWeight: isActive ? '700' : '400',
        }}
      >
        {tab.name}
      </Text>
    </TouchableOpacity>
  )
);

import Svg, { Circle } from 'react-native-svg';

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
        {/* Background Circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress Circle */}
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
      {/* Percentage Text */}
      <View style={{ position: 'absolute' }}>
        <Text style={{ fontSize: 24, fontWeight: '900', color: '#fff' }}>
          {Math.round(percent)}%
        </Text>
      </View>
    </View>
  );
});

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

