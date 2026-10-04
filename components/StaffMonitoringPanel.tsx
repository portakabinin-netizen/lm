/**
 * 🛡️ StaffMonitoringPanel.tsx
 *
 * Real-time alertness monitoring panel for supervisors.
 * Visible only to roles: Project | CorpAdmin | userAdmin
 *
 * Features:
 *  - Polls GET /api/monitoring/status every 30 s
 *  - Shows every on-duty staff member's online status, last heartbeat,
 *    challenge state, battery, failure count, and escalation level
 *  - Color-coded status rings: green=ONLINE, amber=OFFLINE, red=LOST
 *  - Pull-to-refresh
 *  - Tap a card → escalate / view details
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { appService } from '@/UtilServices/appHelper';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffMonitorRecord {
  _id: string;
  employeeId: string;
  employeeName?: string;
  siteName?: string;
  onlineStatus: 'ONLINE' | 'OFFLINE' | 'LOST';
  monitoringEnabled: boolean;
  lastSeen?: string;
  batteryLevel?: number | null;
  lastLatitude?: number;
  lastLongitude?: number;
  challengeStatus: 'NONE' | 'PENDING' | 'PASSED' | 'FAILED';
  challengeFailures?: number;
  totalFailures?: number;
  escalationLevel?: number;
  lastEscalatedAt?: string;
  nextChallengeAt?: string;
  updatedAt?: string;
}

interface Props {
  token: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr?: string): string {
  if (!dateStr) return 'Never';
  const ms = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function statusColor(status: string) {
  if (status === 'ONLINE')  return { ring: '#10b981', bg: '#ecfdf5', text: '#065f46' };
  if (status === 'OFFLINE') return { ring: '#f59e0b', bg: '#fffbeb', text: '#92400e' };
  return                           { ring: '#ef4444', bg: '#fef2f2', text: '#991b1b' }; // LOST
}

function challengeColor(status: string) {
  if (status === 'PASSED')  return { color: '#10b981', icon: 'checkmark-circle' as const,  label: 'Passed' };
  if (status === 'PENDING') return { color: '#f59e0b', icon: 'time-outline' as const,       label: 'Pending' };
  if (status === 'FAILED')  return { color: '#ef4444', icon: 'close-circle' as const,       label: 'Failed' };
  return                           { color: '#94a3b8', icon: 'ellipse-outline' as const,    label: 'None' };
}

// ─── Pulse animation for LOST status ─────────────────────────────────────────

const PulsingDot: React.FC<{ color: string }> = ({ color }) => {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.6, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1,   duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View
      style={{
        width: 12, height: 12, borderRadius: 6,
        backgroundColor: color,
        transform: [{ scale: anim }],
      }}
    />
  );
};

// ─── Stats header bar ─────────────────────────────────────────────────────────

const StatBadge: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <View style={{ alignItems: 'center', flex: 1 }}>
    <Text style={{ fontSize: 22, fontWeight: '900', color }}>{value}</Text>
    <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748b', letterSpacing: 0.3 }}>{label}</Text>
  </View>
);

// ─── Single staff card ────────────────────────────────────────────────────────

const StaffMonitorCard: React.FC<{ record: StaffMonitorRecord }> = ({ record }) => {
  const sc  = statusColor(record.onlineStatus);
  const cc  = challengeColor(record.challengeStatus);
  const isLost = record.onlineStatus === 'LOST';

  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        marginBottom: 12,
        padding: 14,
        borderWidth: 1.5,
        borderColor: sc.ring + '40',
        shadowColor: sc.ring,
        shadowOpacity: 0.12,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
      }}
    >
      {/* ── Top row ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        {/* Status indicator */}
        <View style={{ marginRight: 12 }}>
          {isLost ? (
            <PulsingDot color={sc.ring} />
          ) : (
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: sc.ring }} />
          )}
        </View>

        {/* Name + site */}
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }} numberOfLines={1}>
            {record.employeeName || 'Unknown Staff'}
          </Text>
          {record.siteName ? (
            <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }} numberOfLines={1}>
              <Ionicons name="location-outline" size={10} color="#64748b" /> {record.siteName}
            </Text>
          ) : null}
        </View>

        {/* Online status badge */}
        <View
          style={{
            backgroundColor: sc.bg,
            borderRadius: 20,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderWidth: 1,
            borderColor: sc.ring + '60',
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: '900', color: sc.text, letterSpacing: 0.5 }}>
            {record.onlineStatus}
          </Text>
        </View>
      </View>

      {/* ── Details grid ── */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {/* Last Seen */}
        <DetailChip
          icon="time-outline"
          label="Last Seen"
          value={timeAgo(record.lastSeen)}
          warn={record.onlineStatus !== 'ONLINE'}
        />

        {/* Challenge */}
        <DetailChip
          icon={cc.icon}
          label="Challenge"
          value={cc.label}
          iconColor={cc.color}
          warn={record.challengeStatus === 'FAILED'}
        />

        {/* Battery */}
        {record.batteryLevel != null && (
          <DetailChip
            icon={record.batteryLevel > 20 ? 'battery-half-outline' : 'battery-dead-outline'}
            label="Battery"
            value={`${record.batteryLevel}%`}
            iconColor={record.batteryLevel > 20 ? '#10b981' : '#ef4444'}
            warn={record.batteryLevel <= 20}
          />
        )}

        {/* Failures */}
        {(record.totalFailures ?? 0) > 0 && (
          <DetailChip
            icon="warning-outline"
            label="Failures"
            value={String(record.totalFailures)}
            iconColor="#ef4444"
            warn
          />
        )}

        {/* Next Challenge */}
        {record.nextChallengeAt && (
          <DetailChip
            icon="alarm-outline"
            label="Next Check"
            value={timeAgo(record.nextChallengeAt).startsWith('-')
              ? 'Due now'
              : `in ${timeAgo(record.nextChallengeAt).replace('ago', '').trim()}`}
          />
        )}
      </View>

      {/* ── Escalation strip ── */}
      {(record.escalationLevel ?? 0) > 0 && (
        <View
          style={{
            marginTop: 10,
            backgroundColor: '#fef2f2',
            borderRadius: 8,
            padding: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderWidth: 1,
            borderColor: '#fecaca',
          }}
        >
          <Ionicons name="alert-circle" size={14} color="#ef4444" />
          <Text style={{ fontSize: 11, color: '#991b1b', fontWeight: '700', flex: 1 }}>
            Escalated {record.escalationLevel}× — Last: {timeAgo(record.lastEscalatedAt)}
          </Text>
        </View>
      )}
    </View>
  );
};

const DetailChip: React.FC<{
  icon: any; label: string; value: string; warn?: boolean; iconColor?: string;
}> = ({ icon, label, value, warn = false, iconColor }) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: warn ? '#fff5f5' : '#f8fafc',
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: warn ? '#fecaca' : '#e2e8f0',
    }}
  >
    <Ionicons name={icon} size={11} color={iconColor ?? (warn ? '#ef4444' : '#64748b')} />
    <Text style={{ fontSize: 9, fontWeight: '700', color: '#94a3b8' }}>{label}</Text>
    <Text style={{ fontSize: 10, fontWeight: '800', color: warn ? '#dc2626' : '#334155' }}>
      {value}
    </Text>
  </View>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const StaffMonitoringPanel: React.FC<Props> = ({ token }) => {
  const [records, setRecords]     = useState<StaffMonitorRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await appService.httpClient.get('monitoring/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) {
        const data: StaffMonitorRecord[] = res.data.data || [];
        // Only show monitoring-enabled records (on duty)
        setRecords(data.filter((r) => r.monitoringEnabled));
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.warn('⚠️ StaffMonitoringPanel fetch error:', (err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(() => fetchStatus(), 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  // ── Derived stats ─────────────────────────────────────────────────────────

  const online  = records.filter((r) => r.onlineStatus === 'ONLINE').length;
  const offline = records.filter((r) => r.onlineStatus === 'OFFLINE').length;
  const lost    = records.filter((r) => r.onlineStatus === 'LOST').length;
  const alerts  = records.filter((r) => (r.totalFailures ?? 0) > 0 || r.challengeStatus === 'FAILED').length;

  // ── Empty State ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={{ color: '#64748b', marginTop: 12, fontWeight: '600' }}>
          Loading staff monitoring…
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      {/* ── Header gradient ─────────────────────────────────────────────── */}
      <LinearGradient
        colors={['#0f172a', '#1e3a5f']}
        style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 20 }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Ionicons name="shield-checkmark" size={22} color="#f97316" />
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '900', marginLeft: 8, flex: 1 }}>
            Staff Alertness Monitor
          </Text>
          {lastUpdated && (
            <Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: '600' }}>
              Updated {timeAgo(lastUpdated.toISOString())}
            </Text>
          )}
        </View>

        {/* Stats row */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: 'rgba(255,255,255,0.08)',
            borderRadius: 14,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.1)',
          }}
        >
          <StatBadge label="ONLINE"  value={online}  color="#10b981" />
          <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 4 }} />
          <StatBadge label="OFFLINE" value={offline} color="#f59e0b" />
          <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 4 }} />
          <StatBadge label="LOST"    value={lost}    color="#ef4444" />
          <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 4 }} />
          <StatBadge label="ALERTS"  value={alerts}  color="#f97316" />
        </View>
      </LinearGradient>

      {/* ── List ─────────────────────────────────────────────────────────── */}
      {records.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => fetchStatus(true)} />}
        >
          <Ionicons name="shield-outline" size={56} color="#cbd5e1" />
          <Text style={{ color: '#94a3b8', fontSize: 16, fontWeight: '700', marginTop: 14, textAlign: 'center' }}>
            No Staff On Duty
          </Text>
          <Text style={{ color: '#cbd5e1', fontSize: 13, marginTop: 6, textAlign: 'center' }}>
            Monitoring will appear here once staff start their duty.
          </Text>
          <TouchableOpacity
            onPress={() => fetchStatus(true)}
            style={{
              marginTop: 20,
              backgroundColor: '#3b82f6',
              paddingHorizontal: 24,
              paddingVertical: 10,
              borderRadius: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800' }}>Refresh</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <FlatList
          data={[...records].sort((a, b) => {
            const priority = (r: StaffMonitorRecord) =>
              r.onlineStatus === 'LOST' ? 0
              : r.challengeStatus === 'FAILED' ? 1
              : r.onlineStatus === 'OFFLINE' ? 2
              : 3;
            return priority(a) - priority(b);
          })}
          keyExtractor={(r) => r._id}
          contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => fetchStatus(true)} tintColor="#3b82f6" />
          }
          renderItem={({ item }) => <StaffMonitorCard record={item} />}
          ListHeaderComponent={
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#475569', letterSpacing: 0.3 }}>
                {records.length} STAFF ON DUTY
              </Text>
              <TouchableOpacity
                onPress={() => fetchStatus(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: '#e2e8f0',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 8,
                }}
              >
                <Ionicons name="refresh" size={13} color="#475569" />
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#475569' }}>Refresh</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </View>
  );
};

export default StaffMonitoringPanel;
