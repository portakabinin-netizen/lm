import { AwakeChallengeModal } from '@/components/AwakeChallengeModal';
import { useUserContext } from '@/context/AuthContext';
import { useAttendance } from '@/hooks/useAttendance';
import { AddEmployeeModal } from '@/modal/AddEmployeeModal';
import { ChatRoomModal } from '@/modal/ChatRoomModal';
import { LeaveAdvanceRequestModal } from '@/modal/LeaveAdvanceRequestModal';
import { LedgerDetailModal } from '@/modal/LedgerDetailModal';
import { awakeMonitoringService, MonitoringChallenge } from '@/services/AwakeMonitoringService';
import { appService } from '@/UtilServices/appHelper';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Linking,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// --- NEW COMPONENTS ---
import { dashboardStyles } from '@/components/staff-dashboard/theme/styles';
import { DutyCard } from '../components/staff-dashboard/DutyCard';
import { EarningsSummary } from '../components/staff-dashboard/LedgerTab/EarningsSummary';
import { EarningsLedgerList } from '../components/staff-dashboard/LedgerTab/EarningsLedgerList';
import { AttendanceDetailSheet } from '../components/staff-dashboard/modals/AttendanceDetailSheet';
import { EmergencyOffSheet } from '../components/staff-dashboard/modals/EmergencyOffSheet';
import { MonthPickerSheet } from '../components/staff-dashboard/modals/MonthPickerSheet';
import { SitePickerSheet } from '../components/staff-dashboard/modals/SitePickerSheet';
import { QuickActionTiles } from '../components/staff-dashboard/QuickActionTiles';
import { StaffDashboardHeader } from '../components/staff-dashboard/StaffDashboardHeader';
import { TOKENS } from '../components/staff-dashboard/theme/tokens';
import { AttendanceCalendar } from '../components/staff-dashboard/WorkTab/AttendanceCalendar';
import { IssuedArticlesGrid } from '../components/staff-dashboard/WorkTab/IssuedArticlesGrid';
import { Language, t } from '../components/staff-dashboard/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectSite {
  _id: string;
  sender_name: string;
  location?: { lat?: number; long?: number; address?: string };
  clientId?: string;
  city?: string;
  distance?: number;
}

interface AttendanceLog {
  _id: string;
  date: string;
  dutyStart: string;
  dutyEnd?: string;
  hoursWorked?: number;
  site_name?: string;
  employeeId?: any;
  leadId?: string;
  location?: any;
  site_location?: any;
  markedByDevice?: boolean;
  markedByUserName?: string;
  markedByUserId?: string; // who started this record
}

interface IssuedArticle {
  _id: string;
  employeeId: string;
  articleType: 'uniform' | 'equipment' | 'other';
  articleName: string;
  issuedDate: string;
  returnedDate?: string;
  status: 'issued' | 'returned' | 'lost';
}

interface StaffDashboardProps {
  token: string;
  userId: string;
  name: string;
  dbName: string;
  referenceMobile?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isTokenValid = (token: string, userId: string, dbName: string): boolean => {
  try {
    const decoded: any = jwtDecode(token);
    if (decoded.exp && decoded.exp * 1000 < Date.now()) return false;
    const decUserId = decoded.userId || decoded.id || decoded._id;
    if (decUserId !== userId || decoded.dbName !== dbName) return false;
    return true;
  } catch {
    return false;
  }
};

const resolveEmployeeId = (employeeId: any): string =>
  typeof employeeId === 'object' ? (employeeId?._id ?? '') : (employeeId ?? '');

const formatHoursWorked = (hours: number): string => hours.toFixed(1);

// ─── Main Component ───────────────────────────────────────────────────────────

const StaffDashboard = ({
  token,
  userId,
  name,
  dbName,
  referenceMobile: propRefMobile,
}: StaffDashboardProps) => {
  const { user } = useUserContext();
  const insets = useSafeAreaInsets();

  // ── Core data state ──────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<any>(null);
  const [attendance, setAttendance] = useState<AttendanceLog[]>([]);
  const [ledger, setLedger] = useState<any>(null);
  const [projects, setProjects] = useState<ProjectSite[]>([]);
  const [issuedArticles, setIssuedArticles] = useState<IssuedArticle[]>([]);

  // 0 = Current month, -1 = Previous month
  const [selectedMonthOffset, setSelectedMonthOffset] = useState<0 | -1>(0);
  const [latestBroadcast, setLatestBroadcast] = useState('');
  const [referenceMobile, setReferenceMobile] = useState<string | null>(propRefMobile ?? null);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'actions' | 'work' | 'ledger'>('actions');
  const [selectedSite, setSelectedSite] = useState<ProjectSite | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [ledgerDetailVisible, setLedgerDetailVisible] = useState(false);
  const [attDetailVisible, setAttDetailVisible] = useState(false);
  const [attFilter, setAttFilter] = useState<'week' | 'month' | 'custom'>('month');
  const [customMonth, setCustomMonth] = useState(new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const [broadcastUnseenCount, setBroadcastUnseenCount] = useState(0);
  const [leaveAdvanceRequestVisible, setLeaveAdvanceRequestVisible] = useState(false);
  const [language, setLanguage] = useState<Language>('en');

  // ── Emergency state ──────────────────────────────────────────────────────
  const [emergencyModalVisible, setEmergencyModalVisible] = useState(false);
  const [emergencySubmitting, setEmergencySubmitting] = useState(false);

  // ── Alertness monitoring state ───────────────────────────────────────────
  const [challengeVisible, setChallengeVisible] = useState(false);
  const [activeChallenge, setActiveChallenge] = useState<MonitoringChallenge | null>(null);

  // ── Duty hook ────────────────────────────────────────────────────────────
  const {
    activeDuty,
    dutyStatus,
    selectedShift,
    isLoading: dutyLoading,
    isOutOfBounds,
    location,
    startDuty,
    endDuty,
    formatDuration,
    continueShift,
    isShiftComplete,
    assignedShiftDetails,
  } = useAttendance();

  // ── Sync propRefMobile ───────────────────────────────────────────────────
  useEffect(() => {
    if (propRefMobile) setReferenceMobile(propRefMobile);
  }, [propRefMobile]);

  // ── Wipe state if userId or dbName changes ──────────────────────────────
  useEffect(() => {
    setEmployee(null);
    setAttendance([]);
    setLedger(null);
    setProjects([]);
    setIssuedArticles([]);
    setSelectedSite(null);
  }, [userId, dbName]);

  const isOwnWorker = useMemo(() => {
    const w = (employee?.mobile ?? '').replace(/\D/g, '').slice(-10);
    const u = (user?.mobile ?? '').replace(/\D/g, '').slice(-10);
    return w.length === 10 && u.length === 10 && w === u;
  }, [employee?.mobile, user?.mobile]);

  const combinedAttendance = useMemo(() => {
    const list = [...attendance];
    if (activeDuty && !list.find((a) => a._id === activeDuty._id)) {
      list.push(activeDuty as unknown as AttendanceLog);
    }
    return list;
  }, [attendance, activeDuty]);

  const canWorkerEndDuty = useMemo(() => {
    if (!isOwnWorker) return true;
    const openRecord = combinedAttendance.find((a) => !a.dutyEnd);
    if (!openRecord) return false;
    return true;
  }, [isOwnWorker, combinedAttendance]);

  const fetchData = useCallback(
    async (isSilent = false) => {
      if (!dbName || !isTokenValid(token, userId, dbName)) {
        setLoading(false);
        return;
      }
      const authHeaders = { Authorization: `Bearer ${token}` };
      try {
        if (!isSilent) setLoading(true);

        const targetDate = new Date();
        if (selectedMonthOffset === -1) {
          targetDate.setMonth(targetDate.getMonth() - 1);
        }
        const startOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1, 0, 0, 0).toISOString();
        const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59).toISOString();

        const [empRes, attRes, projRes, session, chatRes, articlesRes] = await Promise.all([
          appService
            .getEmployee(userId, token)
            .catch(() => ({ success: true, data: { name, active: true } })),
          appService
            .getAttendanceHistory(token, userId, startOfMonth, endOfMonth)
            .catch(() => ({ success: false, data: [] })),
          appService.getProjectLeads(token).catch(() => ({ success: false, data: [] })),
          appService.getSession().catch(() => ({})),
          appService.httpClient.get('chat', { headers: authHeaders }).catch(() => ({ data: [] })),
          appService.httpClient
            .get(`service/hr/articles/${userId}`, { headers: authHeaders })
            .catch(() => ({ data: { success: false, data: [] } })),
        ]);

        if (empRes.success) {
          setEmployee(empRes.data);
          if (empRes.data.mobile) {
            appService
              .getContactLedger(empRes.data.mobile)
              .then((ledRes) => {
                if (ledRes.success) setLedger(ledRes.data);
              })
              .catch(() => null);
          }
        }
        if (session?.referenceMobile) setReferenceMobile(session.referenceMobile);
        const broadcasts: any[] = (chatRes.data ?? []).filter((m: any) => !m.isOneToOne);
        if (broadcasts.length > 0) {
          broadcasts.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          setLatestBroadcast(broadcasts[0].text ?? '');
        }
        if (attRes.success) {
          const mine = (attRes.data as AttendanceLog[]).filter(
            (a) => resolveEmployeeId(a.employeeId) === userId
          );
          setAttendance(mine);
        }
        if (projRes.success) {
          setProjects((projRes.data ?? []).filter((p: any) => p.status === 'Accepted'));
        }
        const rawArticles: IssuedArticle[] = articlesRes.data?.data ?? [];
        setIssuedArticles(rawArticles.filter((a) => a.employeeId === userId));
      } catch (err: any) {
        console.error('StaffDashboard fetch error:', err?.message);
      } finally {
        setLoading(false);
      }
    },
    [token, userId, dbName, name, selectedMonthOffset]
  );

  useEffect(() => {
    fetchData();
    const timer = setInterval(() => fetchData(true), 300_000);
    return () => clearInterval(timer);
  }, [fetchData]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('ATTENDANCE_RECORD_CHANGED', () => fetchData(true));
    return () => sub.remove();
  }, [fetchData]);

  useEffect(() => {
    if (projects.length > 0 && !selectedSite) {
      setSelectedSite(projects[0]);
    }
  }, [projects]);

  const handlePunchIn = async () => {
    if (!selectedSite) {
      Alert.alert('Select Site', 'Please choose a work site before punching in.');
      return;
    }
    await startDuty(selectedSite.sender_name, selectedSite._id);
    fetchData(true);
  };

  const handlePunchOut = async () => {
    if (!canWorkerEndDuty) {
      Alert.alert(
        'Cannot Punch Out',
        'Your duty was started by a supervisor. Please contact your supervisor or use Emergency Off to notify them.',
        [{ text: 'OK' }]
      );
      return;
    }
    Alert.alert('Punch Out', 'Are you sure you want to end your duty?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Punch Out',
        style: 'destructive',
        onPress: async () => {
          await endDuty();
          fetchData(true);
        },
      },
    ]);
  };

  const submitEmergencyOff = async (reason: string) => {
    try {
      const res = await appService.httpClient.get('service/staff', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data?.success) {
        const admins = (res.data.data as any[]).filter(
          (u) => u.userRole === 'userAdmin' || u.userRole === 'CorpAdmin'
        );
        await Promise.all(
          admins.map((admin) =>
            appService.httpClient.post(
              'service/chat/send',
              {
                senderName: name,
                senderId: userId,
                text: `🚨 Emergency Duty Off Request:\n${reason}`,
                type: 'text',
                isOneToOne: true,
                receiverId: admin._id,
              },
              { headers: { Authorization: `Bearer ${token}` } }
            )
          )
        );
      }
      Alert.alert('Sent', 'Your emergency request has been sent to all admins.');
    } catch {
      Alert.alert('Error', 'Failed to send request. Please try again.');
    } finally {
      setEmergencyModalVisible(false);
    }
  };

  const handleCallSupervisor = () => {
    const num = (referenceMobile ?? propRefMobile ?? '').replace(/\D/g, '');
    if (num) {
      Linking.openURL(`tel:${num}`);
    } else {
      Alert.alert('Not Available', 'Supervisor contact number is not set.');
    }
  };

  const filteredAttendance = useMemo(() => {
    const targetDate = new Date();
    if (selectedMonthOffset === -1) {
      targetDate.setMonth(targetDate.getMonth() - 1);
    }
    const targetMonth = targetDate.getMonth();
    const targetYear = targetDate.getFullYear();

    return combinedAttendance.filter((a) => {
      if (!a.date) return false;
      const d = new Date(a.date);
      return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
    });
  }, [combinedAttendance, selectedMonthOffset]);

  const stats = useMemo(() => {
    let hoursWorked = 0;
    const dateMap: Record<string, number> = {};
    
    filteredAttendance.forEach((a) => {
      hoursWorked += a.hoursWorked ?? 0;
      if (a.date) {
        const d = new Date(a.date).toISOString().split('T')[0];
        dateMap[d] = (dateMap[d] ?? 0) + 1;
      }
    });

    const uniqueDays = Object.keys(dateMap).length;
    let doubleDuties = 0;
    Object.values(dateMap).forEach((count) => {
      if (count > 1) {
        doubleDuties += (count - 1);
      }
    });

    return {
      daysPresent: filteredAttendance.length, // total mandays
      uniqueDays,
      doubleDuties,
      hoursWorked: hoursWorked.toFixed(1),
      balance: ledger?.balance ?? 0,
    };
  }, [filteredAttendance, ledger]);

  const getMonthLabel = useCallback((offset: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    const monthNamesEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthNamesHi = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'];
    const month = language === 'hi' ? monthNamesHi[d.getMonth()] : monthNamesEn[d.getMonth()];
    return `${month} ${d.getFullYear()}`;
  }, [language]);

  const siteWiseAttendance = useMemo(() => {
    const map: Record<string, number> = {};
    filteredAttendance.forEach((a) => {
      const site = a.site_name ?? 'Unknown Site';
      map[site] = (map[site] ?? 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filteredAttendance]);

  const ledgerEntries = useMemo(() => {
    if (!ledger?.ledger) return [];
    return [...ledger.ledger].sort(
      (a: any, b: any) => new Date(b.voucherDate).getTime() - new Date(a.voucherDate).getTime()
    );
  }, [ledger]);

  const ledgerSummary = useMemo(() => {
    let salaryDues = 0;
    let paymentMade = 0;
    let advances = 0;
    ledgerEntries.forEach((v: any) => {
      const narr = (v.voucherNarration ?? '').toLowerCase();
      const isAdvance =
        narr.includes('uniform') || narr.includes('equipment') || narr.includes('advance');
      if (isAdvance) advances += v.amt;
      else if (v.paymentType === 'Cr') salaryDues += v.amt;
      else if (v.paymentType === 'Dr') paymentMade += v.amt;
    });
    return { salaryDues, paymentMade, advances };
  }, [ledgerEntries]);

  const dbActiveDuty = useMemo(() => combinedAttendance.find((a) => !a.dutyEnd) ?? null, [combinedAttendance]);
  const dbDutyStatus: 'ON' | 'OFF' = dbActiveDuty ? 'ON' : 'OFF';

  useEffect(() => {
    if (dbDutyStatus === 'ON' && dbActiveDuty) {
      AsyncStorage.getItem('active_duty_info').then((stored) => {
        if (!stored) {
          const dutyInfo = {
            attendanceId: dbActiveDuty._id,
            token,
            siteLat: dbActiveDuty.site_location?.lat || dbActiveDuty.site_location?.latitude || 0,
            siteLong:
              dbActiveDuty.site_location?.long || dbActiveDuty.site_location?.longitude || 0,
            isExempt: false,
          };
          AsyncStorage.setItem('active_duty_info', JSON.stringify(dutyInfo)).then(() => {
            DeviceEventEmitter.emit('ATTENDANCE_RECORD_CHANGED', { status: 'ON' });
          });
        }
      });
    }
  }, [dbDutyStatus, dbActiveDuty, token]);

  useEffect(() => {
    if (dbDutyStatus === 'ON' && dbActiveDuty) {
      awakeMonitoringService.startMonitoring({
        token,
        userId,
        employeeName: name,
        siteName: dbActiveDuty.site_name ?? '',
        attendanceId: dbActiveDuty._id,
      });
    } else {
      awakeMonitoringService.stopMonitoring();
    }
  }, [dbDutyStatus, dbActiveDuty?._id]);

  useEffect(() => {
    const unsub = awakeMonitoringService.addEventListener((type, data) => {
      if (type === 'CHALLENGE_RECEIVED') {
        setActiveChallenge(data as MonitoringChallenge);
        setChallengeVisible(true);
      } else if (type === 'CHALLENGE_PASSED' || type === 'CHALLENGE_FAILED') {
        setActiveChallenge(null);
        setChallengeVisible(false);
      }
    });
    return unsub;
  }, []);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: TOKENS.colors.background.light,
        }}
      >
        <ActivityIndicator size="large" color={TOKENS.colors.primary} />
        <Text style={{ marginTop: 12, color: TOKENS.colors.text.secondaryDark, fontWeight: '600' }}>
          Loading dashboard…
        </Text>
      </View>
    );
  }

  if (employee?.active === false) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 40,
          backgroundColor: TOKENS.colors.background.white,
        }}
      >
        <Ionicons name="lock-closed" size={72} color={TOKENS.colors.danger} />
        <Text
          style={{
            fontSize: 20,
            fontWeight: '800',
            color: TOKENS.colors.primary,
            marginTop: 20,
            textAlign: 'center',
          }}
        >
          Account Inactive
        </Text>
        <Text
          style={{
            color: TOKENS.colors.text.secondaryDark,
            textAlign: 'center',
            marginTop: 10,
            lineHeight: 20,
          }}
        >
          Your account has been deactivated. Please contact HR or your administrator.
        </Text>
        <TouchableOpacity
          onPress={() => fetchData()}
          style={{
            marginTop: 30,
            backgroundColor: TOKENS.colors.primary,
            paddingVertical: 12,
            paddingHorizontal: 30,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: TOKENS.colors.background.white, fontWeight: '700' }}>
            {t('Refresh Status', language)}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const dutyColor =
    dbDutyStatus === 'ON'
      ? isOutOfBounds
        ? TOKENS.colors.danger
        : TOKENS.colors.secondary
      : TOKENS.colors.danger;
  const translatedShift = selectedShift ? t(selectedShift, language) : '';
  const dutyLabel =
    dbDutyStatus === 'ON'
      ? isOutOfBounds
        ? t('OUT OF BOUNDS', language)
        : `${t('ON DUTY', language)}${translatedShift ? ' · ' + translatedShift : ''}`
      : t('OFF DUTY', language);

  return (
    <SafeAreaView style={dashboardStyles.container} edges={['bottom']}>
      <StaffDashboardHeader
        insetsTop={insets.top}
        name={name}
        imageUrl={(employee as any)?.photo_url || (employee as any)?.userProfileImage || (employee as any)?.photo || (employee as any)?.employeeImage || (employee as any)?.profileImage || (user as any)?.photo || (user as any)?.userProfileImage || (user as any)?.profileimage || (user as any)?.profileImage || (user as any)?.photo_url}
        dbDutyStatus={dbDutyStatus}
        dutyLabel={dutyLabel}
        dutyColor={dutyColor}
        dbActiveDuty={dbActiveDuty}
        formatDuration={formatDuration}
        broadcastUnseenCount={broadcastUnseenCount}
        unseenCount={unseenCount}
        setChatVisible={setChatVisible}
        handleCallSupervisor={handleCallSupervisor}
        language={language}
        setLanguage={setLanguage}
      />

      <QuickActionTiles onLeaveAdvancePress={() => setLeaveAdvanceRequestVisible(true)} language={language} />

      <View style={dashboardStyles.tabBarContainer}>
        <View style={dashboardStyles.tabBarInner}>
          {(['actions', 'work', 'ledger'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={[dashboardStyles.tabBtn, activeTab === tab && dashboardStyles.tabBtnActive]}
            >
              <Text
                style={[
                  dashboardStyles.tabText,
                  activeTab === tab
                    ? dashboardStyles.tabTextActive
                    : dashboardStyles.tabTextInactive,
                ]}
              >
                {t(tab === 'actions' ? 'Action' : tab === 'ledger' ? 'Earning' : 'Work', language)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        style={dashboardStyles.contentScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={dashboardStyles.contentPadding}
      >
        {activeTab === 'actions' && (
          <DutyCard
            dbDutyStatus={dbDutyStatus}
            isOutOfBounds={isOutOfBounds}
            dutyLabel={dutyLabel}
            dutyColor={dutyColor}
            dbActiveDuty={dbActiveDuty}
            formatDuration={formatDuration}
            selectedSite={selectedSite}
            assignedShiftDetails={assignedShiftDetails}
            setShowPicker={setShowPicker}
            isOwnWorker={isOwnWorker}
            canWorkerEndDuty={canWorkerEndDuty}
            setEmergencyModalVisible={setEmergencyModalVisible}
            handlePunchIn={handlePunchIn}
            handlePunchOut={handlePunchOut}
            dutyLoading={dutyLoading}
            dutyStatus={dutyStatus}
            isShiftComplete={isShiftComplete}
            continueShift={continueShift}
            latestBroadcast={latestBroadcast}
            unseenCount={unseenCount}
            setChatVisible={setChatVisible}
            handleCallSupervisor={handleCallSupervisor}
            workerLocation={location ?? undefined}
            language={language}
          />
        )}

        {activeTab === 'work' && (
          <View>
            <View style={[dashboardStyles.card, { padding: TOKENS.spacing.md }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: TOKENS.spacing.sm }}>
                <Text style={{ fontSize: TOKENS.typography.size.sm, fontWeight: 'bold', color: TOKENS.colors.text.secondaryDark, letterSpacing: 0.5 }}>
                  {t('TOTAL PRESENT', language)}
                </Text>
                
                <View style={{ flexDirection: 'row', backgroundColor: TOKENS.colors.background.main, borderRadius: 20, padding: 2 }}>
                  <TouchableOpacity
                    onPress={() => setSelectedMonthOffset(0)}
                    style={{
                      paddingVertical: 4,
                      paddingHorizontal: 12,
                      backgroundColor: selectedMonthOffset === 0 ? TOKENS.colors.background.light : 'transparent',
                      borderRadius: 18,
                    }}
                  >
                    <Text style={{ color: selectedMonthOffset === 0 ? TOKENS.colors.text.dark : TOKENS.colors.text.muted, fontSize: 12, fontWeight: 'bold' }}>
                      {getMonthLabel(0)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setSelectedMonthOffset(-1)}
                    style={{
                      paddingVertical: 4,
                      paddingHorizontal: 12,
                      backgroundColor: selectedMonthOffset === -1 ? TOKENS.colors.background.light : 'transparent',
                      borderRadius: 18,
                    }}
                  >
                    <Text style={{ color: selectedMonthOffset === -1 ? TOKENS.colors.text.dark : TOKENS.colors.text.muted, fontSize: 12, fontWeight: 'bold' }}>
                      {getMonthLabel(-1)}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 }}>
                <Text style={{ color: TOKENS.colors.info, fontSize: 32, fontWeight: '900' }}>
                  {stats.uniqueDays}
                </Text>
                <Text style={{ color: TOKENS.colors.info, fontSize: 16, fontWeight: '700', marginLeft: 4 }}>
                  {t('Days', language)}
                </Text>
                {stats.doubleDuties > 0 && (
                  <View style={{ backgroundColor: TOKENS.colors.secondaryLight + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, marginLeft: 4 }}>
                    <Text style={{ fontSize: TOKENS.typography.size.xs, color: TOKENS.colors.secondary, fontWeight: 'bold' }}>
                      +{stats.doubleDuties} {t('Double Duty', language)}
                    </Text>
                  </View>
                )}
                <Text style={{ fontSize: TOKENS.typography.size.xs, color: TOKENS.colors.text.muted, marginLeft: TOKENS.spacing.sm }}>
                  |   {stats.hoursWorked} {t('hrs', language)}
                </Text>
              </View>
            </View>
            <AttendanceCalendar
              attendance={filteredAttendance}
              dbActiveDutyId={dbActiveDuty?._id}
              language={language}
              monthDate={
                selectedMonthOffset === 0 
                  ? new Date() 
                  : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)
              }
            />
            <IssuedArticlesGrid articles={issuedArticles} language={language} />
          </View>
        )}

        {activeTab === 'ledger' && (
          <View>
            <EarningsSummary
              ledgerSummary={ledgerSummary}
              stats={stats}
              onViewFullLedger={() => setLedgerDetailVisible(true)}
              language={language}
            />
            <EarningsLedgerList 
              ledgerEntries={ledgerEntries} 
              language={language} 
            />
          </View>
        )}
      </ScrollView>

      <SitePickerSheet
        visible={showPicker}
        onClose={() => setShowPicker(false)}
        projects={projects}
        selectedSite={selectedSite}
        onSelectSite={setSelectedSite}
      />
      <EmergencyOffSheet
        visible={emergencyModalVisible}
        onClose={() => setEmergencyModalVisible(false)}
        onSubmit={submitEmergencyOff}
        language={language}
      />
      <MonthPickerSheet
        visible={showMonthPicker}
        onClose={() => setShowMonthPicker(false)}
        customMonth={customMonth}
        onSelectMonth={(d) => {
          setCustomMonth(d);
          setShowMonthPicker(false);
        }}
      />
      <AttendanceDetailSheet
        visible={attDetailVisible}
        onClose={() => setAttDetailVisible(false)}
        attFilter={attFilter}
        setAttFilter={setAttFilter}
        customMonth={customMonth}
        onOpenMonthPicker={() => setShowMonthPicker(true)}
        language={language}
        siteWiseAttendance={siteWiseAttendance}
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
      <AddEmployeeModal
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        onComplete={() => fetchData(true)}
        employee={employee}
        isStaffMode
      />
      <LedgerDetailModal
        visible={ledgerDetailVisible}
        onClose={() => setLedgerDetailVisible(false)}
        employee={employee}
      />
      <AwakeChallengeModal
        visible={challengeVisible}
        challenge={activeChallenge}
        onDismiss={() => {
          setChallengeVisible(false);
          setActiveChallenge(null);
        }}
      />
      <LeaveAdvanceRequestModal
        visible={leaveAdvanceRequestVisible}
        onClose={() => setLeaveAdvanceRequestVisible(false)}
        token={token}
        userId={userId}
        userName={name}
        dbName={dbName}
        onSubmit={() => fetchData(true)}
      />
    </SafeAreaView>
  );
};

export default StaffDashboard;
