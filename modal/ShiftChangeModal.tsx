import { COLORS } from '@/styles/stylesIndex';
import { appService } from '@/UtilServices/appHelper';
import { getSocket } from '@/hooks/Socket';
import { useGPSCoordinates } from '@/hooks/useGPSCoordinates';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SiteShiftEditorModal } from './SiteShiftEditorModal';

const BlinkingSiteName = ({ clientLeadName }: { clientLeadName: string }) => {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons name="business" size={14} color="#94a3b8" />
      <Text style={{ fontSize: 12, fontWeight: '800', color: '#1b58db' }}>{clientLeadName}</Text>
    </View>
  );
};

const BlinkingEndingBadge = () => {
  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(blinkAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [blinkAnim]);

  return (
    <Animated.View
      style={{
        backgroundColor: '#fef3c7',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
        marginLeft: 6,
        opacity: blinkAnim,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '800', color: '#b45309' }}>Ending</Text>
    </Animated.View>
  );
};

const BlinkingWarningWrapper = ({
  children,
  isActiveButEmpty,
  hasWorkers,
  style,
  onLayout,
}: any) => {
  const blinkAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActiveButEmpty) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(blinkAnim, { toValue: 0.3, duration: 800, useNativeDriver: false }),
          Animated.timing(blinkAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
        ])
      ).start();
    } else {
      blinkAnim.setValue(1);
    }
  }, [isActiveButEmpty]);

  const animatedBg = blinkAnim.interpolate({
    inputRange: [0.3, 1],
    outputRange: ['#fef2f2', '#ffffff'], // Light red to white
  });

  const animatedBorder = blinkAnim.interpolate({
    inputRange: [0.3, 1],
    outputRange: ['#b91c1c', '#fecaca'], // Dark red to light red
  });

  const animatedTextColor = blinkAnim.interpolate({
    inputRange: [0.3, 1],
    outputRange: ['#ffffff', '#1e293b'], // White to dark text
  });

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        style,
        hasWorkers && { borderColor: '#86efac', borderWidth: 1.2, backgroundColor: '#fff' },
        !hasWorkers && !isActiveButEmpty && { backgroundColor: '#fff' },
        isActiveButEmpty && {
          borderColor: animatedBorder,
          borderWidth: 1.5,
          backgroundColor: animatedBg,
        },
      ]}
    >
      {typeof children === 'function' ? children({ animatedTextColor }) : children}
    </Animated.View>
  );
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Props {
  visible: boolean;
  onClose: () => void;
  activeStaff: any[];
  token: string;
  onRefresh: () => void;
  onSelectNewWorker?: (siteId: string, workerId: string, workerName: string) => void;
  employees?: any[];
  leads?: any[];
  allAttendance?: any[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const RELIEVER_MAP_KEY = 'reliever_map';

// ---------------------------------------------------------------------------
// Dynamic Helpers
// ---------------------------------------------------------------------------
const getEmployeeShiftDetails = (employee: any) => {
  // If registered user from userMaster (or user role is present / no employmentHistory)
  const isRegisteredUser =
    employee?.userRole || employee?.role || (!employee?.employmentHistory && employee?.dutyShift);
  if (isRegisteredUser && employee?.dutyShift) {
    const ds = employee.dutyShift;
    const shiftName = ds.shiftName || 'General';
    const startTime = ds.startFrom || ds.startTime || '09:00';
    const groupName =
      ds.groupName ||
      (shiftName === 'Day' || shiftName === 'Night2' || shiftName === 'Night12' ? 'DaNi' : 'MANG');
    const durationHrs = ds.durationHrs || ds.shiftHours || (groupName === 'DaNi' ? 12 : 8);
    const shiftType = durationHrs === 12 ? '12hr' : '8hr';

    // Calculate endTime
    const [h, m] = startTime.split(':').map(Number);
    const endHrs = (h + durationHrs) % 24;
    const endTime = `${String(endHrs).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    let shiftPeriod = 'General';
    let shiftCode = 'G';
    if (shiftName === 'Night2') {
      shiftCode = 'N2';
      shiftPeriod = 'Night12';
    } else if (shiftName === 'Night1' || shiftName === 'Night') {
      shiftCode = 'N';
      shiftPeriod = 'Night';
    } else if (shiftName === 'Morning') {
      shiftCode = 'M';
      shiftPeriod = 'Morning';
    } else if (shiftName === 'Afternoon') {
      shiftCode = 'A';
      shiftPeriod = 'Afternoon';
    } else if (shiftName === 'Day') {
      shiftCode = 'D';
      shiftPeriod = 'Day';
    } else if (['Morning', 'Afternoon', 'Night', 'General', 'Day', 'Night12'].includes(shiftName)) {
      shiftPeriod = shiftName === 'Night' && durationHrs === 12 ? 'Night12' : shiftName;
      shiftCode = shiftName.substring(0, 1);
    }

    return {
      shiftName,
      shiftCode,
      shiftPeriod,
      shiftType,
      durationHrs,
      startTime,
      endTime,
      groupName,
    };
  }

  // Priority 1: active employmentHistory entry (canonical source of truth)
  const activeHistEntry =
    employee?.employmentHistory?.find((e: any) => e.active) ||
    (employee?.employmentHistory?.length
      ? employee.employmentHistory[employee.employmentHistory.length - 1]
      : null);

  if (activeHistEntry) {
    const { shiftName: sName, groupName: gName, shiftStartTime, shiftHours } = activeHistEntry;
    const shiftName = sName || 'General';
    const groupName =
      gName ||
      (shiftName === 'Day' || shiftName === 'Night' || shiftName === 'Night12' ? 'DaNi' : 'MANG');
    const startTime = shiftStartTime || '08:00';
    const durationHrs = shiftHours || (groupName === 'DaNi' ? 12 : 8);
    const shiftType = groupName === 'DaNi' ? '12hr' : '8hr';
    const [h, m] = startTime.split(':').map(Number);
    const endHrs = (h + durationHrs) % 24;
    const endTime = `${String(endHrs).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    // Derive short shift CODE (for UI display and backend shiftCode field)
    // Derive shiftPeriod (must match backend enum: Morning|Afternoon|Night|General|Day|Night12)
    let shiftCode = 'G';
    let shiftPeriod = 'General'; // default
    if (groupName === 'DaNi') {
      if (shiftName === 'Day') {
        shiftCode = 'D';
        shiftPeriod = 'Day';
      } else if (shiftName === 'Night') {
        shiftCode = 'N2';
        shiftPeriod = 'Night12'; // ← enum value for DaNi Night (12hr)
      }
    } else {
      // MANG group
      if (shiftName === 'Morning') {
        shiftCode = 'M';
        shiftPeriod = 'Morning';
      } else if (shiftName === 'Afternoon') {
        shiftCode = 'A';
        shiftPeriod = 'Afternoon';
      } else if (shiftName === 'Night') {
        shiftCode = 'N';
        shiftPeriod = 'Night';
      } else if (shiftName === 'General') {
        shiftCode = 'G';
        shiftPeriod = 'General';
      }
    }

    return {
      shiftName,
      shiftCode,
      shiftPeriod,
      shiftType,
      durationHrs,
      startTime,
      endTime,
      groupName,
    };
  }

  // Priority 2: root-level selectedShift / dutyShift (legacy fallback)
  const rootShiftCode = employee?.selectedShift || '';
  let shiftName = employee?.dutyShift?.shiftName || 'General';
  let startTime = '09:00';
  let endTime = '17:00';
  let durationHrs = 8;
  let shiftType = '8hr';

  const activeEntry = employee?.employmentHistory?.find((e: any) => e.active);
  const shiftSource =
    employee?.dutyShift?.shiftName === shiftName
      ? employee?.dutyShift
      : activeEntry?.shiftName === shiftName
        ? activeEntry
        : employee?.dutyShift?.startTime
          ? employee?.dutyShift
          : activeEntry;

  let groupName = employee?.dutyShift?.groupName || activeEntry?.groupName || '';

  if (shiftSource && shiftSource.startTime) {
    startTime = shiftSource.startTime;
    endTime = shiftSource.endTime || '17:00';
    durationHrs = shiftSource.shiftHours || 0;
  } else {
    const nameLower = shiftName.toLowerCase();
    if (nameLower.includes('night')) {
      startTime = '21:00';
      endTime = '09:00';
      durationHrs = 12;
    } else if (nameLower.includes('day') || nameLower.includes('12')) {
      startTime = '09:00';
      endTime = '21:00';
      durationHrs = 12;
    }
  }

  if (!groupName) {
    groupName =
      rootShiftCode === 'D' ||
      rootShiftCode === 'N2' ||
      shiftName === 'Day' ||
      shiftName === 'Night2' ||
      shiftName === 'Night12'
        ? 'DaNi'
        : 'MANG';
  }
  if (!durationHrs) {
    durationHrs = groupName === 'DaNi' ? 12 : 8;
  }

  // Map root shiftCode / shiftName → enum-safe shiftPeriod
  let shiftPeriod = 'General';
  if (rootShiftCode === 'N2') {
    shiftPeriod = 'Night12';
    shiftType = '12hr';
    durationHrs = 12;
  } else if (rootShiftCode === 'D') {
    shiftPeriod = 'Day';
    shiftType = '12hr';
    durationHrs = 12;
  } else if (rootShiftCode === 'M') {
    shiftPeriod = 'Morning';
  } else if (rootShiftCode === 'A') {
    shiftPeriod = 'Afternoon';
  } else if (rootShiftCode === 'N') {
    shiftPeriod = 'Night';
  } else if (['Morning', 'Afternoon', 'Night', 'General', 'Day', 'Night12'].includes(shiftName)) {
    shiftPeriod = shiftName === 'Night' && durationHrs === 12 ? 'Night12' : shiftName;
  }

  const shiftCode = rootShiftCode || 'G';
  return {
    shiftName,
    shiftCode,
    shiftPeriod,
    shiftType,
    durationHrs,
    startTime,
    endTime,
    groupName,
  };
};

const getSnappedDutyStart = (startTimeStr: string) => {
  const now = new Date();
  if (!startTimeStr) return now.toISOString();
  const [h, m] = startTimeStr.split(':').map(Number);

  // Construct shift start time on today, yesterday, and tomorrow
  const todayShift = new Date(now);
  todayShift.setHours(h, m, 0, 0);

  const yesterdayShift = new Date(todayShift.getTime() - 24 * 3600000);
  const tomorrowShift = new Date(todayShift.getTime() + 24 * 3600000);

  const diffs = [
    { diff: now.getTime() - todayShift.getTime(), target: todayShift },
    { diff: now.getTime() - yesterdayShift.getTime(), target: yesterdayShift },
    { diff: now.getTime() - tomorrowShift.getTime(), target: tomorrowShift },
  ];

  // Filter out future shifts that are more than 120 minutes in the future to match backend
  const validDiffs = diffs.filter((d) => d.diff >= -120 * 60 * 1000);
  validDiffs.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));
  const nearest = validDiffs[0] || diffs[0];

  // If nearest is within 12 hours, snap to it. Otherwise use now.
  if (Math.abs(now.getTime() - nearest.target.getTime()) < 12 * 3600000) {
    return nearest.target.toISOString();
  }
  return now.toISOString();
};

const checkIsLateDynamic = (startTime: string) => {
  if (!startTime) return { isLate: false, diffMins: 0 };
  const now = new Date();
  const [startH, startM] = startTime.split(':').map(Number);
  const shiftStart = new Date();
  shiftStart.setHours(startH, startM, 0, 0);

  let diffMins = (now.getTime() - shiftStart.getTime()) / 60000;
  if (diffMins < -12 * 60) diffMins += 24 * 60;
  return { isLate: diffMins > 30, diffMins };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const ShiftChangeModal: React.FC<Props> = ({
  visible,
  onClose,
  activeStaff,
  token,
  onRefresh,
  onSelectNewWorker,
  employees = [],
  leads = [],
  allAttendance = [],
}) => {
  const flatListRef = useRef<FlatList>(null);
  const itemLayouts = useRef<{ [key: string]: number }>({});

  const { refresh: refreshGPS } = useGPSCoordinates();

  const insets = useSafeAreaInsets();

  // Auto-end staff duty if scheduled end time is reached
  useEffect(() => {
    if (!visible) return;

    const intervalId = setInterval(async () => {
      const now = Date.now();
      const nowISO = new Date().toISOString();
      let hasEndedAny = false;

      const promises = activeStaff.map(async (staff) => {
        let dutyEndScheduled = staff.dutyEndScheduled;
        if (!dutyEndScheduled) {
          const empId = staff.employeeId?._id || staff.employeeId || staff.id || staff.employee_id;
          const emp = employees.find((e: any) => String(e._id) === String(empId));
          if (emp) {
            const shiftDetails = getEmployeeShiftDetails(emp);
            if (shiftDetails) {
              const lockHrs = shiftDetails.durationHrs || 8;
              dutyEndScheduled = getScheduledEndTime(shiftDetails.startTime, lockHrs);
            }
          }
        }
        
        if (dutyEndScheduled && now >= new Date(dutyEndScheduled).getTime()) {
          try {
            console.log(`[ShiftChangeModal] Auto-ending duty for staff: ${staff.employee_name || staff.displayName}`);
            const attendanceId = staff.attendanceId || staff._id;
            const endRes = await appService.httpClient.put(
              `service/hr/attendance/${attendanceId}`,
              {
                dutyEnd: nowISO,
                forcedOff: true,
                forcedOffReason: 'Auto-End Duty (Time Reached)',
              },
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (endRes.data?.success) hasEndedAny = true;
          } catch (err) {
            console.error('[ShiftChangeModal] Auto-end failed for staff', err);
          }
        }
      });

      await Promise.all(promises);
      if (hasEndedAny && onRefresh) {
        onRefresh();
      }
    }, 60000); // Check every 60 seconds

    return () => clearInterval(intervalId);
  }, [visible, activeStaff, employees, token, onRefresh]);

  const formatDutySchedule = (staff: any) => {
    if (!staff?.dutyStart) return '';
    const actualStart = new Date(staff.dutyStart).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    let schedStartStr = '';
    let schedEndStr = '';

    // Try to load scheduled times from lead's siteShifts first
    const lead = leads.find(
      (l: any) => String(l._id) === String(staff.leadId?._id || staff.leadId)
    );
    const matchedShift = lead?.siteShifts?.find(
      (s: any) => s.shiftCode === staff.shiftCode && s.active !== false
    );

    if (matchedShift) {
      const startTime = matchedShift.startTime || '08:00';
      const durationHrs = matchedShift.durationHrs || 8;
      const [h, m] = startTime.split(':').map(Number);
      const endHrs = (h + durationHrs) % 24;
      const endTime = `${String(endHrs).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

      const getFormattedTimeStr = (timeStr: string) => {
        const [hh, mm] = timeStr.split(':').map(Number);
        const d = new Date();
        d.setHours(hh, mm, 0, 0);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      };

      schedStartStr = getFormattedTimeStr(startTime);
      schedEndStr = getFormattedTimeStr(endTime);
    } else {
      // Fallback to employee/attendance schedule times
      let dutyEndScheduled = staff.dutyEndScheduled;
      let lockHrs = staff.shiftLockHours || 8;

      if (!dutyEndScheduled) {
        const empId = staff.employeeId?._id || staff.employeeId || staff.id || staff.employee_id;
        const emp = employees.find((e: any) => String(e._id) === String(empId));
        if (emp) {
          const shiftDetails = getEmployeeShiftDetails(emp);
          if (shiftDetails) {
            lockHrs = shiftDetails.durationHrs || 8;
            dutyEndScheduled = getScheduledEndTime(shiftDetails.startTime, lockHrs);
          }
        }
      }

      if (dutyEndScheduled) {
        const schedEnd = new Date(dutyEndScheduled);
        const schedStart = new Date(schedEnd.getTime() - lockHrs * 3600000);
        schedStartStr = schedStart.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        schedEndStr = schedEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }

    const markedByText =
      staff.markedByDevice === false && staff.markedByUserName
        ? ` (${staff.markedByUserName})`
        : '';

    if (schedStartStr && schedEndStr) {
      return `Schd: ${schedStartStr} <-> ${schedEndStr} | Actual: ${actualStart}${markedByText}`;
    }
    return `Actual: ${actualStart}${markedByText}`;
  };
  // ── state ─────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'handover' | 'start'>('handover');
  const [showUnconfiguredSites, setShowUnconfiguredSites] = useState(false);
  const [selectedWorkers, setSelectedWorkers] = useState<Record<string, boolean>>({});
  const [relieverMap, setRelieverMap] = useState<Record<string, { id: string; name: string }>>({});
  const [selectingRelieverFor, setSelectingRelieverFor] = useState<any | null>(null);
  const [relieverSearchQuery, setRelieverSearchQuery] = useState('');

  // lead-card states
  const [searchQuery, setSearchQuery] = useState('');
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [expandedLeads, setExpandedLeads] = useState<Record<string, boolean>>({});

  // ── Enquiry / Site Shift Editor ───────────────────────────────────────────
  const [enquiryLead, setEnquiryLead] = useState<any | null>(null);

  // Multiple employees per site: Record<leadId, string[]>
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Record<string, string[]>>({});
  const [showEmployeeSelectorForSite, setShowEmployeeSelectorForSite] = useState<
    Record<string, boolean>
  >({});

  // Filter out users from userMaster / admin roles
  const isEligibleWorker = (emp: any) => {
    if (!emp) return false;
    return !(
      emp.user_id ||
      emp.employeeType === 'userMaster' ||
      ['Sales', 'Project', 'Finance', 'CorpAdmin', 'userAdmin'].includes(emp.role)
    );
  };

  const isNearEnd = (dutyStart: string, lockHrs?: number, dutyEndScheduled?: string) => {
    if (dutyEndScheduled) {
      const end = new Date(dutyEndScheduled).getTime();
      const remainHrs = (end - Date.now()) / 3_600_000;
      return remainHrs <= 0.25;
    }
    if (!dutyStart) return false;
    const start = new Date(dutyStart).getTime();
    const elapsedHrs = (Date.now() - start) / 3_600_000;
    const shiftHrs = lockHrs || 8;
    return shiftHrs - elapsedHrs <= 0.25;
  };

  const getScheduledEndTime = (startTimeStr: string, durationHrs: number) => {
    const now = new Date();
    const [h, m] = startTimeStr.split(':').map(Number);
    const schedStart = new Date();
    schedStart.setHours(h, m, 0, 0);

    const diffMs = now.getTime() - schedStart.getTime();
    if (diffMs > 12 * 3_600_000) {
      schedStart.setDate(schedStart.getDate() + 1);
    } else if (diffMs < -12 * 3_600_000) {
      schedStart.setDate(schedStart.getDate() - 1);
    }

    return new Date(schedStart.getTime() + durationHrs * 3_600_000).toISOString();
  };

  const visibleStaff = activeStaff
    .filter((s) => {
      const empId = s.employeeId?._id || s.employeeId;
      const emp = employees.find((e: any) => String(e._id) === String(empId));
      if (emp && !isEligibleWorker(emp)) return false;

      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase();
        const empName = (emp?.name || s.displayName || s.employee_name || '').toLowerCase();
        const enr = (emp?.enrollment_no || '').toLowerCase();
        const siteName = (s.site_name || s.siteName || s.leadName || '').toLowerCase();
        if (
          !empName.includes(searchLower) &&
          !enr.includes(searchLower) &&
          !siteName.includes(searchLower)
        ) {
          return false;
        }
      }
      return isNearEnd(s.dutyStart, s.shiftLockHours, s.dutyEndScheduled);
    })
    .map((s) => ({ ...s, nearEnd: true }));

  const isAllSelected =
    visibleStaff.length > 0 && visibleStaff.every((s) => selectedWorkers[s._id]);

  const eligibleRelievers = useMemo(() => {
    if (!selectingRelieverFor) return [];
    // Get all active employee IDs
    const activeEmpIds = new Set(
      activeStaff.map((s: any) => String(s.employeeId?._id || s.employeeId || ''))
    );
    // Return employees who are not active and match search query and are eligible
    return employees.filter((emp: any) => {
      if (!isEligibleWorker(emp)) return false;
      const isAlreadyActive = activeEmpIds.has(String(emp._id));
      const nameMatch = (emp.name || '').toLowerCase().includes(relieverSearchQuery.toLowerCase());
      return !isAlreadyActive && nameMatch;
    });
  }, [employees, activeStaff, selectingRelieverFor, relieverSearchQuery]);

  // ── Site-aware shift resolver ────────────────────────────────────────────
  // Priority: siteShifts on lead (matching shiftCode) > worker profile
  const getSiteAwareShiftDetails = (employee: any, lead?: any) => {
    const workerShiftCode = employee?.selectedShift || '';
    const siteShifts: any[] = lead?.siteShifts || [];
    const activeShifts = siteShifts.filter((s: any) => s.active !== false);

    if (activeShifts.length > 0) {
      const matched =
        activeShifts.find((s: any) => s.shiftCode === workerShiftCode) || activeShifts[0];
      const [h, m] = (matched.startTime || '08:00').split(':').map(Number);
      const endHrs = (h + (matched.durationHrs || 8)) % 24;
      const endTime = `${String(endHrs).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      let shiftPeriod = 'General';
      const sn = matched.shiftName || 'General';
      if (sn === 'Morning') shiftPeriod = 'Morning';
      else if (sn === 'Afternoon') shiftPeriod = 'Afternoon';
      else if (sn === 'Night' && (matched.durationHrs || 8) === 12) shiftPeriod = 'Night12';
      else if (sn === 'Night') shiftPeriod = 'Night';
      else if (sn === 'Day') shiftPeriod = 'Day';
      else if (sn === 'Night12') shiftPeriod = 'Night12';
      return {
        shiftName: matched.shiftName || 'General',
        shiftCode: matched.shiftCode || 'G',
        shiftPeriod,
        shiftType: (matched.durationHrs || 8) === 12 ? '12hr' : '8hr',
        durationHrs: matched.durationHrs || 8,
        startTime: matched.startTime || '08:00',
        endTime,
        groupName: matched.groupName || 'MANG',
        billRate: matched.billRate || 0,
        salaryRate: matched.salaryRate || 0,
        fromSite: true,
      };
    }
    // Fallback: worker profile (but caller should show a warning)
    return getEmployeeShiftDetails(employee);
  };

  /** Returns workers grouped by their state for a given site */
  const getSiteWorkerState = (leadId: string) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const yst = new Date();
    yst.setDate(yst.getDate() - 1);
    const yesterdayStr = yst.toISOString().split('T')[0];

    // Build a set of employee IDs that are currently active at ANY site
    const activeAnywhereIds = new Set(
      activeStaff.map((s: any) => String(s.employeeId?._id || s.employeeId || ''))
    );

    // Workers currently active specifically at this site
    const activeHere: any[] = activeStaff
      .filter((s: any) => {
        const sLeadId = String(s.leadId?._id || s.leadId || '');
        if (sLeadId !== String(leadId)) return false;
        const empId = String(s.employeeId?._id || s.employeeId || '');
        const emp = employees.find((e: any) => String(e._id) === empId);
        if (emp && !isEligibleWorker(emp)) return false;
        return true;
      })
      .map((s: any) => {
        const empId = String(s.employeeId?._id || s.employeeId || '');
        const emp = employees.find((e: any) => String(e._id) === empId);
        return {
          ...s,
          id: empId,
          name: s.displayName || s.employee_name || emp?.name || 'Unknown',
          shiftCode: s.shiftCode || emp?.selectedShift || 'G',
          shiftPeriod: s.shiftPeriod || '',
          dutyStart: s.dutyStart,
          dutyEndScheduled: s.dutyEndScheduled,
          shiftLockHours: s.shiftLockHours || 8,
          attendanceId: s.attendanceId || s._id,
          sourceStaff: s,
          emp,
        };
      });

    const activeShiftCodes = new Set(
      activeHere.map((worker: any) => String(worker.shiftCode || '').trim()).filter(Boolean)
    );

    const prevShiftRaw = allAttendance.filter((att: any) => {
      const siteId = String(att.leadId?._id || att.leadId || '');
      if (siteId !== String(leadId)) return false;
      // Must have ended (not still active)
      if (!att.dutyEnd) return false;

      const endMs = new Date(att.dutyEnd).getTime();
      if (isNaN(endMs)) return false;
      const diffHrs = (Date.now() - endMs) / 3600000;
      return diffHrs >= 0 && diffHrs <= 30;
    });

    // Sort newest first, deduplicate by emp ID, exclude anyone active anywhere
    const sorted = [...prevShiftRaw].sort(
      (a: any, b: any) =>
        new Date(b.dutyStart || b.createdAt).getTime() -
        new Date(a.dutyStart || a.createdAt).getTime()
    );

    const seenIds = new Set<string>();
    const prevShift: any[] = [];
    for (const att of sorted) {
      let empId = '';
      if (att.employeeId && typeof att.employeeId === 'object') {
        empId = String(att.employeeId._id || att.employeeId.id || '');
      } else {
        empId = String(att.employeeId || '');
      }
      if (!empId || empId === '[object Object]') continue;
      // Skip if this worker is already active anywhere
      if (activeAnywhereIds.has(empId)) continue;
      if (seenIds.has(empId)) continue;
      seenIds.add(empId);

      const emp = employees.find((e: any) => String(e._id) === empId);
      if (emp && !isEligibleWorker(emp)) continue;
      const shiftDetails = emp ? getEmployeeShiftDetails(emp) : null;
      prevShift.push({
        id: empId,
        name: att.employeeId?.name || att.employee_name || emp?.name || 'Unknown',
        shiftCode: att.shiftCode || shiftDetails?.shiftCode || 'G',
        dutyEnd: att.dutyEnd,
        dutyStart: att.dutyStart,
        emp,
      });
      if (prevShift.length >= 4) break;
    }

    return { activeHere, prevShift };
  };

  const isShiftActiveAtTime = (
    startTimeStr: string,
    durationHrs: number,
    checkDate: Date = new Date()
  ) => {
    if (!startTimeStr) return false;
    const [hh, mm] = startTimeStr.split(':').map(Number);
    const startMins = hh * 60 + (mm || 0);
    const durMins = (durationHrs || 8) * 60;

    const nowMins = checkDate.getHours() * 60 + checkDate.getMinutes();

    if (startMins + durMins <= 24 * 60) {
      return nowMins >= startMins && nowMins <= startMins + durMins;
    } else {
      const endMins = startMins + durMins - 24 * 60;
      return nowMins >= startMins || nowMins <= endMins;
    }
  };

  const isSiteActiveNow = (lead: any) => {
    if (!lead.siteShifts || !Array.isArray(lead.siteShifts)) return false;
    return lead.siteShifts.some(
      (s: any) => s.active && isShiftActiveAtTime(s.startTime, s.durationHrs || 8)
    );
  };

  const unconfiguredSitesCount = useMemo(() => {
    return leads.filter((lead: any) => {
      if (lead.status !== 'Accepted' && lead.status !== 'Tax Invoice') return false;
      return !lead.siteShifts || lead.siteShifts.length === 0;
    }).length;
  }, [leads]);

  // ── sorted leads A-Z ─────────────────────────────────────────────────────
  const sortedFilteredLeads = useMemo(() => {
    const filtered = leads.filter((lead: any) => {
      if (lead.status !== 'Accepted' && lead.status !== 'Tax Invoice') return false;

      if (showUnconfiguredSites) {
        if (lead.siteShifts && lead.siteShifts.length > 0) return false;
      } else {
        const hasActiveShift = isSiteActiveNow(lead);
        const hasActiveWorker = activeStaff.some(
          (s: any) => String(s.leadId?._id || s.leadId) === String(lead._id)
        );

        // Show if clock falls under shift duration OR has active worker
        if (!hasActiveShift && !hasActiveWorker) return false;
      }

      return (lead.sender_name || lead.name || '')
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
    });
    return [...filtered].sort((a: any, b: any) => {
      const aHasActive = activeStaff.some(
        (s: any) => String(s.leadId?._id || s.leadId) === String(a._id)
      );
      const bHasActive = activeStaff.some(
        (s: any) => String(s.leadId?._id || s.leadId) === String(b._id)
      );

      // Sites without active workers should be listed above sites with active workers
      if (!aHasActive && bHasActive) return -1;
      if (aHasActive && !bHasActive) return 1;

      const nameA = (a.sender_name || a.name || '').toLowerCase();
      const nameB = (b.sender_name || b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [leads, searchQuery, activeStaff]);

  // ── actions ───────────────────────────────────────────────────────────────
  const handleStartDuty = async (employeeId: string, lead: any, requestPermission = false) => {
    const employee = employees.find((e: any) => String(e._id) === String(employeeId));
    if (!employee) {
      appService.showToast('Employee details not found', 'Error');
      return;
    }

    // ── ONE WORKER · ONE SHIFT · ONE ATTENDANCE (frontend guard) ──────────
    const alreadyActive = activeStaff.find(
      (s: any) => String(s.employeeId?._id || s.employeeId) === String(employeeId)
    );
    if (alreadyActive) {
      const where = alreadyActive.site_name || alreadyActive.siteName || 'another site';
      const code = alreadyActive.shiftCode || '';
      Alert.alert(
        '⚠️ Already On Duty',
        `${employee.name}${employee.enrollment_no ? ` (${employee.enrollment_no})` : ''} is currently on ${code ? code + ' duty' : 'duty'} at "${where}".\n\nEnd that shift first before starting a new one.`,
        [{ text: 'OK' }]
      );
      return;
    }
    // ──────────────────────────────────────────────────────────────────────

    const rate = employee.rate || 0;

    // ── BLOCK if site has no shifts configured ──────────────────────────
    const leadSiteShifts = (lead?.siteShifts || []).filter((s: any) => s.active !== false);
    if (leadSiteShifts.length === 0) {
      Alert.alert(
        '🚫 Shifts Not Configured',
        `"${lead?.sender_name || 'This site'}" has no shift configuration.\n\nDuty cannot start until site shifts are set up.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Setup Shifts', onPress: () => setEnquiryLead(lead) },
        ]
      );
      return;
    }
    // ────────────────────────────────────────────────────────────────

    const shiftInfo = getSiteAwareShiftDetails(employee, lead);
    const { isLate, diffMins } = checkIsLateDynamic(shiftInfo.startTime);

    // Timing check bypassed

    const lateText = isLate
      ? `\n\n⚠️ You are ${Math.floor(diffMins)} minutes late. This will be marked.`
      : '';

    Alert.alert(
      requestPermission ? 'Request Late Start' : 'Start Duty',
      requestPermission
        ? `Request late start permission for ${employee.name}${employee.enrollment_no ? ` (${employee.enrollment_no})` : ''} at ${lead.sender_name || 'Site'}?`
        : `Start ${shiftInfo.shiftName} duty for ${employee.name}${employee.enrollment_no ? ` (${employee.enrollment_no})` : ''} at ${lead.sender_name || 'Site'}?${lateText}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: requestPermission ? 'Request' : 'Start',
          onPress: async () => {
            try {
              setLoading(true);
              const nowISO = new Date().toISOString();
              const dutyStartISO = getSnappedDutyStart(shiftInfo.startTime);
              const dutyEndScheduled = getScheduledEndTime(
                shiftInfo.startTime,
                shiftInfo.durationHrs
              );

              // ── Auto-end active shift for single guard ──
              const siteActiveWorkers = activeStaff.filter(
                (s: any) =>
                  String(s.leadId?._id || s.leadId || '') === String(lead._id) &&
                  String(s.employeeId?._id || s.employeeId || '') !== String(employeeId)
              );

              if (siteActiveWorkers.length > 0) {
                const locData = await refreshGPS().catch(() => null);
                const geo = locData
                  ? {
                      lat: locData.latitude,
                      long: locData.longitude,
                      address: locData.resolvedName,
                    }
                  : null;

                for (const worker of siteActiveWorkers) {
                  const attendanceId = worker.attendanceId || worker._id;
                  const endNowISO = new Date().toISOString();
                  try {
                    await appService.httpClient.put(
                      `service/hr/attendance/${attendanceId}`,
                      {
                        dutyEnd: endNowISO,
                        forcedOff: true,
                        forcedOffReason: 'Shift Change / Handover (Auto-End Active Shift)',
                        location: geo,
                        $push: geo ? { geoHistory: { ...geo, type: 'end', time: endNowISO } } : {},
                      },
                      { headers: { Authorization: `Bearer ${token}` } }
                    );
                  } catch (err) {
                    console.error(`Failed to auto-end active worker ${worker._id}`, err);
                  }
                }
              }

              const res = await appService.httpClient.post(
                'service/hr/attendance',
                {
                  employeeId,
                  leadId: lead._id,
                  clientId: lead.clientId || null,
                  status: 'Present',
                  dutyLevel: 1,
                  rate,
                  isLate,
                  date: dutyStartISO.split('T')[0],
                  dutyStart: nowISO,
                  dutyStartScheduled: dutyStartISO,
                  dutyEndScheduled,
                  shiftCode: shiftInfo.shiftCode,
                  shiftPeriod: shiftInfo.shiftPeriod,
                  shiftType: shiftInfo.shiftType,
                  shiftLockHours: shiftInfo.durationHrs,
                  requestPermission,
                },
                { headers: { Authorization: `Bearer ${token}` } }
              );

              if (res.data?.success) {
                appService.showToast(
                  res.data.message ||
                    `Duty started for ${employee.name}${employee.enrollment_no ? ` (${employee.enrollment_no})` : ''}`,
                  'Success'
                );
                onRefresh();
                onClose();
              } else {
                appService.showToast(res.data?.message || 'Failed to start duty', 'Error');
              }
            } catch (err: any) {
              const errData = err?.response?.data;
              if (errData?.alreadyOnDuty) {
                Alert.alert('⚠️ Already On Duty', errData.message, [{ text: 'OK' }]);
              } else if (errData?.tooLate && !requestPermission) {
                Alert.alert(
                  'Permission Required',
                  errData.message ||
                    'More than 1 hour late starting shift. Request permission from Admin to start late?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Request Permission',
                      onPress: () => handleStartDuty(employeeId, lead, true),
                    },
                  ]
                );
              } else {
                appService.showToast(errData?.message || 'Failed to start duty', 'Error');
              }
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  /** Start duty for ALL selected employees at a site */
  const handleStartDutyForSelected = async (leadId: string, lead: any) => {
    const ids = selectedEmployeeIds[leadId] || [];
    if (ids.length === 0) {
      appService.showToast('No employees selected', 'Error');
      return;
    }

    // ── ONE WORKER · ONE SHIFT · ONE ATTENDANCE (frontend guard) ──────────
    const blockedNames: string[] = [];
    const eligibleIds = ids.filter((id) => {
      const isActive = activeStaff.some(
        (s: any) => String(s.employeeId?._id || s.employeeId) === String(id)
      );
      if (isActive) {
        const emp = employees.find((e: any) => String(e._id) === id);
        blockedNames.push(
          emp ? `${emp.name}${emp.enrollment_no ? ` (${emp.enrollment_no})` : ''}` : id
        );
      }
      return !isActive;
    });
    if (eligibleIds.length === 0) {
      Alert.alert(
        '⚠️ All Already On Duty',
        `${blockedNames.join(', ')} ${blockedNames.length === 1 ? 'is' : 'are'} already on duty. End their shifts first.`,
        [{ text: 'OK' }]
      );
      return;
    }
    if (blockedNames.length > 0) {
      appService.showToast(`Skipped: ${blockedNames.join(', ')} (already on duty)`, 'Info');
    }
    // ──────────────────────────────────────────────────────────────────────

    const bulkSiteShifts = (lead?.siteShifts || []).filter((s: any) => s.active !== false);
    if (bulkSiteShifts.length === 0) {
      Alert.alert(
        '🚫 Shifts Not Configured',
        `"${lead?.sender_name || 'This site'}" has no shift configuration.\n\nDuty cannot start until site shifts are set up.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Setup Shifts', onPress: () => setEnquiryLead(lead) },
        ]
      );
      return;
    }

    const names = eligibleIds
      .map((id) => {
        const emp = employees.find((e: any) => String(e._id) === id);
        return emp ? `${emp.name}${emp.enrollment_no ? ` (${emp.enrollment_no})` : ''}` : id;
      })
      .join(', ');

    Alert.alert(
      'Start Duty',
      `Start assigned duty for ${eligibleIds.length} worker(s):\n${names}\nat ${lead.sender_name || 'Site'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start All',
          onPress: async () => {
            setLoading(true);
            let count = 0;
            const failedNames: string[] = [];
            const endedAttendanceIds = new Set<string>();

            for (const empId of eligibleIds) {
              const employee = employees.find((e: any) => String(e._id) === empId);
              if (!employee) continue;
              const rate = employee.rate || 0;
              const shiftInfo = getSiteAwareShiftDetails(employee, lead);
              const { isLate } = checkIsLateDynamic(shiftInfo.startTime);

              // ── Auto-end active shift for single guard ──
              const siteActiveWorkers = activeStaff.filter(
                (s: any) =>
                  String(s.leadId?._id || s.leadId || '') === String(lead._id) &&
                  !endedAttendanceIds.has(s.attendanceId || s._id) &&
                  !eligibleIds.includes(String(s.employeeId?._id || s.employeeId || ''))
              );

              if (siteActiveWorkers.length > 0) {
                const locData = await refreshGPS().catch(() => null);
                const geo = locData
                  ? {
                      lat: locData.latitude,
                      long: locData.longitude,
                      address: locData.resolvedName,
                    }
                  : null;

                for (const worker of siteActiveWorkers) {
                  const attendanceId = worker.attendanceId || worker._id;
                  const endNowISO = new Date().toISOString();
                  try {
                    await appService.httpClient.put(
                      `service/hr/attendance/${attendanceId}`,
                      {
                        dutyEnd: endNowISO,
                        forcedOff: true,
                        forcedOffReason: 'Shift Change / Handover (Auto-End Active Shift)',
                        location: geo,
                        $push: geo ? { geoHistory: { ...geo, type: 'end', time: endNowISO } } : {},
                      },
                      { headers: { Authorization: `Bearer ${token}` } }
                    );
                    endedAttendanceIds.add(attendanceId);
                  } catch (err) {
                    console.error(`Failed to auto-end active worker ${worker._id}`, err);
                  }
                }
              }

              try {
                const nowISO = new Date().toISOString();
                const dutyStartISO = getSnappedDutyStart(shiftInfo.startTime);
                const dutyEndScheduled = getScheduledEndTime(
                  shiftInfo.startTime,
                  shiftInfo.durationHrs
                );
                const res = await appService.httpClient.post(
                  'service/hr/attendance',
                  {
                    employeeId: empId,
                    leadId: lead._id,
                    clientId: lead.clientId || null,
                    status: 'Present',
                    dutyLevel: 1,
                    rate,
                    isLate,
                    date: dutyStartISO.split('T')[0],
                    dutyStart: nowISO,
                    dutyStartScheduled: dutyStartISO,
                    dutyEndScheduled,
                    shiftCode: shiftInfo.shiftCode,
                    shiftPeriod: shiftInfo.shiftPeriod,
                    shiftType: shiftInfo.shiftType,
                    shiftLockHours: shiftInfo.durationHrs,
                  },
                  { headers: { Authorization: `Bearer ${token}` } }
                );
                if (res.data?.success) {
                  count++;
                } else if (res.data?.alreadyOnDuty) {
                  failedNames.push(
                    employee.name + (employee.enrollment_no ? ` (${employee.enrollment_no})` : '')
                  );
                } else {
                  appService.showToast(res.data?.message || `Failed for ${employee.name}`, 'Error');
                }
              } catch (err: any) {
                const errData = err?.response?.data;
                if (errData?.alreadyOnDuty) {
                  failedNames.push(employee.name);
                } else {
                  appService.showToast(errData?.message || `Failed for ${employee.name}`, 'Error');
                }
              }
            }
            setLoading(false);
            let msg = `Started duty for ${count} worker(s)`;
            if (failedNames.length > 0)
              msg += `\nSkipped (already on duty): ${failedNames.join(', ')}`;
            appService.showToast(msg, count > 0 ? 'Success' : 'Error');
            setSelectedEmployeeIds((prev) => ({ ...prev, [leadId]: [] }));
            setShowEmployeeSelectorForSite((prev) => ({ ...prev, [leadId]: false }));
            onRefresh();
            if (count > 0) {
              onClose();
            }
          },
        },
      ]
    );
  };

  const handleEndDuty = async (staff: any) => {
    const reliever = relieverMap[staff._id];
    const message = reliever
      ? `End duty for ${staff.displayName}?`
      : `End duty for ${staff.displayName}? No reliever worker was assigned.`;

    Alert.alert('End Duty', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Duty',
        style: 'destructive',
        onPress: async () => {
          try {
            const nowISO = new Date().toISOString();
            const locData = await refreshGPS().catch(() => null);
            const geo = locData
              ? {
                  lat: locData.latitude,
                  long: locData.longitude,
                  address: locData.resolvedName,
                }
              : null;
            const attendanceId = staff.attendanceId || staff._id;

            const res = await appService.httpClient.put(
              `service/hr/attendance/${attendanceId}`,
              {
                dutyEnd: nowISO,
                forcedOff: true,
                forcedOffReason: 'Shift Change / Handover',
                location: geo,
                $push: geo ? { geoHistory: { ...geo, type: 'end', time: nowISO } } : {},
              },
              { headers: { Authorization: `Bearer ${token}` } }
            );

            if (res.data?.success) {
              appService.showToast(`Duty ended for ${staff.displayName}`, 'Success');
              onRefresh();
              onClose();
            } else {
              appService.showToast(res.data?.message || 'Failed to end duty', 'Error');
            }
          } catch (err: any) {
            appService.showToast(err?.response?.data?.message || 'Failed to end duty', 'Error');
          }
        },
      },
    ]);
  };

  const handleBulkEndDuty = async () => {
    const selectedIds = Object.keys(selectedWorkers).filter(
      (id) => selectedWorkers[id] && visibleStaff.some((s) => s._id === id)
    );
    if (selectedIds.length === 0) {
      Alert.alert('No Workers Selected', 'Please select at least one worker.');
      return;
    }
    Alert.alert('Bulk End Duty', `End duty for ${selectedIds.length} workers?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Duty',
        style: 'destructive',
        onPress: async () => {
          setLoading(true);
          let successCount = 0;
          const nowISO = new Date().toISOString();

          const promises = selectedIds.map(async (id) => {
            const staff = visibleStaff.find((s) => s._id === id);
            if (!staff) return;
            try {
              const attendanceId = staff.attendanceId || staff._id;
              const endRes = await appService.httpClient.put(
                `service/hr/attendance/${attendanceId}`,
                {
                  dutyEnd: nowISO,
                  forcedOff: true,
                  forcedOffReason: 'Bulk End Duty',
                },
                { headers: { Authorization: `Bearer ${token}` } }
              );
              if (endRes.data?.success) successCount++;
            } catch (err) {
              console.error(`Failed to end duty for ${staff.displayName}`, err);
            }
          });

          await Promise.all(promises.map((p) => p.catch((err) => console.error(err))));

          setLoading(false);
          appService.showToast(`Ended duty for ${successCount} workers`, 'Success');
          onRefresh();
          if (successCount > 0) {
            onClose();
          }
        },
      },
    ]);
  };

  const handleChangeDuty = async (staff: any) => {
    const relieverInfo = relieverMap[staff._id];
    const relieverEmp = relieverInfo ? employees.find((e: any) => String(e._id) === relieverInfo.id) : null;
    if (relieverInfo && !relieverEmp) {
      Alert.alert('Error', 'Reliever details not found.');
      return;
    }
    const shiftInfo = relieverEmp ? getEmployeeShiftDetails(relieverEmp) : null;

    const activeEmp = employees.find(
      (e: any) => String(e._id) === String(staff.employeeId?._id || staff.employeeId || '')
    );
    const activeEnr = activeEmp?.enrollment_no;
    const activeNameWithEnr = activeEnr ? `${staff.displayName} (${activeEnr})` : staff.displayName;
    const relieverNameWithEnr = relieverEmp?.enrollment_no
      ? `${relieverInfo.name} (${relieverEmp.enrollment_no})`
      : relieverInfo?.name || '';

    Alert.alert(
      relieverInfo ? 'Shift Change' : 'End Duty',
      relieverInfo ? `Change shift from ${activeNameWithEnr} to reliever ${relieverNameWithEnr}?` : `End duty for ${activeNameWithEnr} without a reliever?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: relieverInfo ? 'Change Shift' : 'End Duty',
          onPress: async () => {
            try {
              setLoading(true);
              const nowISO = new Date().toISOString();
              const attendanceId = staff.attendanceId || staff._id;

              // End active worker duty
              const endRes = await appService.httpClient.put(
                `service/hr/attendance/${attendanceId}`,
                {
                  dutyEnd: nowISO,
                  forcedOff: true,
                  forcedOffReason: relieverInfo ? 'Shift Change / Handover' : 'Auto-End Duty (No Reliever)',
                },
                { headers: { Authorization: `Bearer ${token}` } }
              );

              if (endRes.data?.success) {
                if (relieverInfo && shiftInfo) {
                  const dutyStartISO = getSnappedDutyStart(shiftInfo.startTime);
                  const leadId = staff.leadId?._id || staff.leadId;
                  const clientId = staff.clientId?._id || staff.clientId;
                  const dutyEndScheduled = getScheduledEndTime(
                    shiftInfo.startTime,
                    shiftInfo.durationHrs
                  );

                  const startRes = await appService.httpClient.post(
                    'service/hr/attendance',
                    {
                      employeeId: relieverInfo.id,
                      leadId,
                      clientId: clientId || null,
                      status: 'Present',
                      dutyLevel: 1,
                      rate: relieverEmp.rate || 0,
                      date: dutyStartISO.split('T')[0],
                      dutyStart: nowISO,
                      dutyStartScheduled: dutyStartISO,
                      dutyEndScheduled,
                      shiftCode: shiftInfo.shiftCode,
                      shiftPeriod: shiftInfo.shiftPeriod,
                      shiftType: shiftInfo.shiftType,
                      shiftLockHours: shiftInfo.durationHrs,
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                  );

                  if (startRes.data?.success) {
                    appService.showToast(
                      `Shift change successful: ${activeNameWithEnr} ➔ ${relieverNameWithEnr}`,
                      'Success'
                    );
                    onRefresh();
                    onClose();
                  } else {
                    appService.showToast(
                      startRes.data?.message || 'Failed to start reliever duty',
                      'Error'
                    );
                  }
                } else {
                  appService.showToast(`Duty ended successfully for ${activeNameWithEnr}`, 'Success');
                  onRefresh();
                  onClose();
                }
              } else {
                appService.showToast(
                  endRes.data?.message || 'Failed to end active worker duty',
                  'Error'
                );
              }
            } catch (err: any) {
              appService.showToast(
                err?.response?.data?.message || 'Failed to process duty change',
                'Error'
              );
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleBulkShiftChange = async () => {
    const selectedIds = Object.keys(selectedWorkers).filter(
      (id) => selectedWorkers[id] && visibleStaff.some((s) => s._id === id)
    );
    if (selectedIds.length === 0) {
      Alert.alert('No Workers Selected', 'Please select at least one worker.');
      return;
    }

    Alert.alert('Bulk Shift Change', `Process shift change for ${selectedIds.length} workers?\n\nWorkers without an assigned reliever will be auto-ended without starting a new shift.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Process',
        onPress: async () => {
          setLoading(true);
          let successCount = 0;
          const nowISO = new Date().toISOString();

          const promises = selectedIds.map(async (id) => {
            const staff = visibleStaff.find((s) => s._id === id);
            if (!staff) return;
            const relieverInfo = relieverMap[staff._id];
            const relieverEmp = relieverInfo ? employees.find((e: any) => String(e._id) === relieverInfo.id) : null;
            const shiftInfo = relieverEmp ? getEmployeeShiftDetails(relieverEmp) : null;

            try {
              const attendanceId = staff.attendanceId || staff._id;
              const leadId = staff.leadId?._id || staff.leadId;
              const clientId = staff.clientId?._id || staff.clientId;

              // End active worker duty
              const endRes = await appService.httpClient.put(
                `service/hr/attendance/${attendanceId}`,
                {
                  dutyEnd: nowISO,
                  forcedOff: true,
                  forcedOffReason: relieverInfo ? 'Bulk Shift Change' : 'Auto-End Duty (No Reliever)',
                },
                { headers: { Authorization: `Bearer ${token}` } }
              );

              if (endRes.data?.success) {
                if (relieverInfo && shiftInfo) {
                  const dutyStartISO = getSnappedDutyStart(shiftInfo.startTime);
                  const dutyEndScheduled = getScheduledEndTime(
                    shiftInfo.startTime,
                    shiftInfo.durationHrs
                  );

                  // Start reliever worker duty
                  const startRes = await appService.httpClient.post(
                    'service/hr/attendance',
                    {
                      employeeId: relieverInfo.id,
                      leadId,
                      clientId: clientId || null,
                      status: 'Present',
                      dutyLevel: 1,
                      rate: relieverEmp.rate || 0,
                      date: dutyStartISO.split('T')[0],
                      dutyStart: nowISO,
                      dutyStartScheduled: dutyStartISO,
                      dutyEndScheduled,
                      shiftCode: shiftInfo.shiftCode,
                      shiftPeriod: shiftInfo.shiftPeriod,
                      shiftType: shiftInfo.shiftType,
                      shiftLockHours: shiftInfo.durationHrs,
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                  );

                  if (startRes.data?.success) {
                    successCount++;
                  }
                } else {
                  // Ended successfully, no reliever started
                  successCount++;
                }
              }
            } catch (err) {
              console.error(`Failed to swap for ${staff.displayName}`, err);
            }
          });

          await Promise.all(promises.map((p) => p.catch((err) => console.error(err))));

          setLoading(false);
          appService.showToast(`Processed ${successCount} shift changes`, 'Success');
          onRefresh();
          if (successCount > 0) {
            onClose();
          }
        },
      },
    ]);
  };

  const prevVisible = useRef(false);

  // ── reliever persistence ───────────────────────────────────────────────────
  const loadRelieverMap = async (currentVisible: any[], resetSelections = false) => {
    try {
      const stored = await AsyncStorage.getItem(RELIEVER_MAP_KEY);
      const map = stored ? JSON.parse(stored) : {};

      const todayStr = new Date().toISOString().split('T')[0];
      const yst = new Date();
      yst.setDate(yst.getDate() - 1);
      const yesterdayStr = yst.toISOString().split('T')[0];

      // Sort allAttendance by dutyStart descending to find the most recent matching record first
      const sortedLogs = [...allAttendance].sort((a: any, b: any) => {
        const timeA = new Date(a.dutyStart || a.createdAt || 0).getTime();
        const timeB = new Date(b.dutyStart || b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      // Auto-preselect reliever from yesterday's night or day shift if not already stored
      currentVisible.forEach((s) => {
        if (!map[s._id]) {
          const sSiteId = String(s.leadId?._id || s.leadId || '');
          const sEmpId = String(s.employeeId?._id || s.employeeId || '');
          const sShiftCode = String(s.shiftCode || '').trim();

          const sUpper = sShiftCode.toUpperCase();
          let expectedRelieverShifts: string[] = [];
          if (sUpper === 'D') expectedRelieverShifts = ['N', 'N2', 'NIGHT', 'NIGHT12'];
          else if (['N', 'N2', 'NIGHT', 'NIGHT12'].includes(sUpper))
            expectedRelieverShifts = ['D', 'DAY'];
          else if (sUpper === 'M') expectedRelieverShifts = ['A', 'AFTERNOON'];
          else if (sUpper === 'A') expectedRelieverShifts = ['N', 'NIGHT'];
          else if (sUpper === 'N') expectedRelieverShifts = ['M', 'MORNING'];

          // Find most recent completed attendance log from yesterday/today at the same site and shift.
          const match = sortedLogs.find((att: any) => {
            const attSiteId = String(att.leadId?._id || att.leadId || '');
            const attEmpId = String(att.employeeId?._id || att.employeeId || '');
            if (attSiteId !== sSiteId || attEmpId === sEmpId) return false;
            if (!att.dutyEnd) return false; // must be completed

            const attShiftCode = String(att.shiftCode || '')
              .trim()
              .toUpperCase();
            if (expectedRelieverShifts.length > 0) {
              if (!expectedRelieverShifts.includes(attShiftCode)) return false;
            } else if (sShiftCode && attShiftCode === sUpper) {
              return false; // prevent same shift code if no expected map
            }
            const endMs = new Date(att.dutyEnd).getTime();
            if (isNaN(endMs)) return false;
            const diffHrs = (Date.now() - endMs) / 3600000;
            return diffHrs >= 0 && diffHrs <= 30;
          });

          if (match) {
            let empId = '';
            let empName = '';
            if (match.employeeId && typeof match.employeeId === 'object') {
              empId = String(match.employeeId._id || match.employeeId.id || '');
              empName = match.employeeId.name || match.employee_name || '';
            } else {
              empId = String(match.employeeId || '');
              const foundEmp = employees.find((e: any) => String(e._id) === empId);
              empName = foundEmp?.name || match.employee_name || 'Unknown';
            }
            if (empId && empId !== '[object Object]') {
              const foundEmp = employees.find((e: any) => String(e._id) === empId);
              const enr = foundEmp?.enrollment_no;
              const formattedName = enr ? `${empName} (${enr})` : empName;
              map[s._id] = { id: empId, name: formattedName };
            }
          }
        }
      });

      setRelieverMap(map);

      setSelectedWorkers((prev) => {
        const next = resetSelections ? {} : { ...prev };
        currentVisible.forEach((s) => {
          if (next[s._id] === undefined) {
            next[s._id] = !!map[s._id];
          }
        });
        return next;
      });
    } catch (err) {
      console.error('Failed to load reliever map', err);
    }
  };

  const saveRelieverRelation = async (
    workerA: { id: string; name: string },
    workerB: { id: string; name: string }
  ) => {
    try {
      const stored = await AsyncStorage.getItem(RELIEVER_MAP_KEY);
      const map = stored ? JSON.parse(stored) : {};
      map[workerA.id] = { id: workerB.id, name: workerB.name };
      map[workerB.id] = { id: workerA.id, name: workerA.name };
      await AsyncStorage.setItem(RELIEVER_MAP_KEY, JSON.stringify(map));
      setRelieverMap(map);
    } catch (err) {
      console.error('Failed to save reliever relation', err);
    }
  };

  const clearRelieverRelation = async (staffId: string) => {
    try {
      const stored = await AsyncStorage.getItem(RELIEVER_MAP_KEY);
      const map = stored ? JSON.parse(stored) : {};
      delete map[staffId];
      await AsyncStorage.setItem(RELIEVER_MAP_KEY, JSON.stringify(map));
      setRelieverMap(map);
      setSelectedWorkers((prev) => ({ ...prev, [staffId]: false }));
    } catch (err) {
      console.error('Failed to clear reliever relation', err);
    }
  };

  useEffect(() => {
    if (visible) {
      const shouldReset = !prevVisible.current;
      loadRelieverMap(visibleStaff, shouldReset);
    } else {
      setSelectedWorkers({});
    }
    prevVisible.current = visible;
  }, [visible, activeStaff]);

  const toggleSelectAll = () => {
    const next: Record<string, boolean> = {};
    if (!isAllSelected)
      visibleStaff.forEach((s) => {
        next[s._id] = true;
      });
    setSelectedWorkers(next);
  };

  const toggleSelect = (id: string) => setSelectedWorkers((prev) => ({ ...prev, [id]: !prev[id] }));

  // Toggle an employee in/out of the multi-select list for a lead
  const toggleEmployeeForSite = (leadId: string, empId: string) => {
    setSelectedEmployeeIds((prev) => {
      const current = prev[leadId] || [];
      const exists = current.includes(empId);
      return {
        ...prev,
        [leadId]: exists ? current.filter((id) => id !== empId) : [...current, empId],
      };
    });
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}>
          <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
            {/* ── Header ── */}
            <View
              style={{
                height: 64,
                backgroundColor: COLORS.primary,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                borderBottomWidth: 1,
                borderBottomColor: 'rgba(255,255,255,0.1)',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 20, fontWeight: '900', color: '#fff', letterSpacing: 0.3 }}
                >
                  Shift Change Management
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.85)',
                    fontWeight: '600',
                    marginTop: 2,
                  }}
                >
                  Manage active shifts and handovers
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* ── Global Search bar ── */}
            <View
              style={{
                padding: 16,
                backgroundColor: '#fff',
                borderBottomWidth: 1,
                borderBottomColor: '#f1f5f9',
                flexDirection: 'row',
                gap: 8,
              }}
            >
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#f1f5f9',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  height: 50,
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                }}
              >
                <Ionicons name="search" size={20} color="#64748b" style={{ marginRight: 8 }} />
                <TextInput
                  placeholder={
                    activeTab === 'handover'
                      ? 'Search workers or sites...'
                      : 'Search client sites (A-Z)...'
                  }
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={{
                    flex: 1,
                    fontSize: 16,
                    color: '#0f172a',
                    fontWeight: '600',
                    padding: 0,
                  }}
                />
                {searchQuery ? (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={20} color="#94a3b8" />
                  </TouchableOpacity>
                ) : null}
              </View>
              {activeTab === 'start' && (
                <TouchableOpacity
                  onPress={() => setShowUnconfiguredSites(!showUnconfiguredSites)}
                  style={{
                    height: 50,
                    paddingHorizontal: 12,
                    backgroundColor: showUnconfiguredSites ? COLORS.primary : '#f8fafc',
                    borderWidth: 1,
                    borderColor: showUnconfiguredSites ? COLORS.primary : '#e2e8f0',
                    borderRadius: 12,
                    justifyContent: 'center',
                    alignItems: 'center',
                    flexDirection: 'row',
                    gap: 6,
                  }}
                >
                  <Ionicons
                    name="settings"
                    size={20}
                    color={showUnconfiguredSites ? '#fff' : '#64748b'}
                  />
                  {unconfiguredSitesCount > 0 && (
                    <View
                      style={{
                        backgroundColor: '#dc2626',
                        borderRadius: 10,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
                        {unconfiguredSitesCount}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* ── Tabs ── */}
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: '#fff',
                borderBottomWidth: 1,
                borderBottomColor: '#e2e8f0',
              }}
            >
              <TouchableOpacity
                onPress={() => setActiveTab('handover')}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  alignItems: 'center',
                  borderBottomWidth: 2,
                  borderBottomColor: activeTab === 'handover' ? COLORS.primary : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '800',
                    color: activeTab === 'handover' ? COLORS.primary : '#64748b',
                  }}
                >
                  Active / Handover ({visibleStaff.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setActiveTab('start')}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  alignItems: 'center',
                  borderBottomWidth: 2,
                  borderBottomColor: activeTab === 'start' ? COLORS.primary : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '800',
                    color: activeTab === 'start' ? COLORS.primary : '#64748b',
                  }}
                >
                  Start Duty
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── SiteShiftEditorModal ── */}
            {enquiryLead && (
              <SiteShiftEditorModal
                visible={!!enquiryLead}
                onClose={() => setEnquiryLead(null)}
                lead={enquiryLead}
                token={token}
                onSaved={(updatedLead) => {
                  setEnquiryLead(null);
                }}
              />
            )}

            {/* ── Near-end-of-duty section ── */}
            {activeTab === 'handover' && (
              <View style={{ flex: 1 }}>
                {visibleStaff.length > 0 ? (
                  <>
                    <View style={styles.topBar}>
                      <TouchableOpacity onPress={toggleSelectAll}>
                        <Ionicons
                          name={isAllSelected ? 'checkbox' : 'square-outline'}
                          size={28}
                          color={COLORS.primary}
                        />
                      </TouchableOpacity>
                      <View style={{ flex: 1, flexDirection: 'row', gap: 8, marginLeft: 12 }}>
                        <TouchableOpacity
                          style={{
                            flex: 1,
                            backgroundColor: '#dc2626',
                            paddingHorizontal: 4,
                            paddingVertical: 10,
                            borderRadius: 8,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          onPress={handleBulkEndDuty}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              color: '#fff',
                              fontWeight: '700',
                              textAlign: 'center',
                            }}
                          >
                            Bulk End ({visibleStaff.filter((s) => !relieverMap[s._id]).length})
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{
                            flex: 1,
                            backgroundColor: '#1e3a8a',
                            paddingHorizontal: 4,
                            paddingVertical: 10,
                            borderRadius: 8,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          onPress={handleBulkShiftChange}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              color: '#fff',
                              fontWeight: '700',
                              textAlign: 'center',
                            }}
                          >
                            Bulk Swap ({visibleStaff.filter((s) => !!relieverMap[s._id]).length})
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <ScrollView
                      style={{ flex: 1 }}
                      contentContainerStyle={[
                        styles.scrollContent,
                        {
                          flexDirection: 'column',
                          alignItems: 'stretch',
                          justifyContent: 'flex-start',
                        },
                      ]}
                      showsVerticalScrollIndicator={true}
                    >
                      {visibleStaff.map((staff) => {
                        const relieverInfo = relieverMap[staff._id];
                        let relieverShiftCode = '';
                        if (relieverInfo) {
                          const relieverEmp = employees.find(
                            (e: any) => String(e._id) === relieverInfo.id
                          );
                          if (relieverEmp) {
                            relieverShiftCode = getEmployeeShiftDetails(relieverEmp).shiftCode;
                          }
                        }
                        const activeEmp = employees.find(
                          (e: any) =>
                            String(e._id) ===
                            String(staff.employeeId?._id || staff.employeeId || '')
                        );
                        const empName =
                          staff.displayName ||
                          staff.employee_name ||
                          activeEmp?.name ||
                          staff.employeeId?.name ||
                          'Unknown';
                        const activeEnr = activeEmp?.enrollment_no;
                        const activeNameWithEnr = activeEnr ? `${empName} (${activeEnr})` : empName;
                        const scheduleStr = formatDutySchedule(staff);

                        const clientLeadName =
                          staff.site_name ||
                          staff.siteName ||
                          staff.leadName ||
                          (leads &&
                            leads.find(
                              (l: any) =>
                                String(l._id) === String(staff.leadId?._id || staff.leadId)
                            )?.sender_name) ||
                          '';

                        return (
                          <View
                            key={staff._id}
                            style={{
                              backgroundColor: '#fff',
                              borderRadius: 16,
                              padding: 12,
                              marginBottom: 12,
                              borderWidth: 1,
                              borderColor: '#f1f5f9',
                              shadowColor: '#000',
                              shadowOpacity: 0.05,
                              shadowRadius: 8,
                              elevation: 2,
                              flexDirection: 'row',
                              alignItems: 'center',
                            }}
                          >
                            {/* Left Checkbox */}
                            <TouchableOpacity
                              onPress={() => toggleSelect(staff._id)}
                              style={{ paddingRight: 12 }}
                            >
                              <Ionicons
                                name={selectedWorkers[staff._id] ? 'checkbox' : 'square-outline'}
                                size={24}
                                color={COLORS.primary}
                              />
                            </TouchableOpacity>

                            {/* Middle Content */}
                            <View style={{ flex: 1, flexDirection: 'column', gap: 6 }}>
                              {/* Row 1: Active duty */}
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View
                                  style={{
                                    backgroundColor: '#f0fdf4',
                                    paddingHorizontal: 10,
                                    paddingVertical: 4,
                                    borderRadius: 16,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                  }}
                                >
                                  <Text
                                    style={{ fontSize: 13, fontWeight: '700', color: '#15803d' }}
                                  >
                                    {activeNameWithEnr} ({staff.shiftCode})
                                  </Text>
                                </View>
                                {staff.nearEnd && <BlinkingEndingBadge />}
                                <Ionicons
                                  name="arrow-forward"
                                  size={16}
                                  color="#94a3b8"
                                  style={{ marginLeft: 6 }}
                                />
                              </View>

                              {/* Row 2: Reliever */}
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                {relieverInfo ? (
                                  <View
                                    style={{
                                      backgroundColor: '#eff6ff',
                                      paddingHorizontal: 10,
                                      paddingVertical: 4,
                                      borderRadius: 16,
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 13,
                                        fontWeight: '700',
                                        color: '#1d4ed8',
                                        marginRight: 6,
                                      }}
                                    >
                                      {relieverInfo.name} ({relieverShiftCode || '?'})
                                    </Text>
                                    <TouchableOpacity
                                      onPress={() => clearRelieverRelation(staff._id)}
                                    >
                                      <Ionicons name="close-circle" size={16} color="#dc2626" />
                                    </TouchableOpacity>
                                  </View>
                                ) : (
                                  <TouchableOpacity
                                    onPress={() => setSelectingRelieverFor(staff)}
                                    style={{
                                      backgroundColor: '#f1f5f9',
                                      paddingHorizontal: 10,
                                      paddingVertical: 4,
                                      borderRadius: 16,
                                    }}
                                  >
                                    <Text
                                      style={{ fontSize: 13, fontWeight: '700', color: '#64748b' }}
                                    >
                                      + Select Reliever
                                    </Text>
                                  </TouchableOpacity>
                                )}
                              </View>

                              {/* Row 3: Schedule line */}
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'flex-start',
                                  paddingRight: 8,
                                }}
                              >
                                <Ionicons
                                  name="time-outline"
                                  size={14}
                                  color="#15803d"
                                  style={{ marginTop: 2, marginRight: 4 }}
                                />
                                <Text
                                  style={{
                                    fontSize: 12,
                                    fontWeight: '700',
                                    color: '#15803d',
                                    flex: 1,
                                  }}
                                >
                                  {scheduleStr}
                                </Text>
                              </View>

                              {/* Row 4: Site line */}
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                {clientLeadName ? (
                                  <BlinkingSiteName clientLeadName={clientLeadName} />
                                ) : null}
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </ScrollView>
                  </>
                ) : (
                  <View
                    style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}
                  >
                    <Ionicons name="moon-outline" size={48} color="#cbd5e1" />
                    <Text
                      style={{ color: '#94a3b8', fontSize: 16, fontWeight: '600', marginTop: 12 }}
                    >
                      No active duty or handover needed
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ── Lead / site cards section ── */}
            {activeTab === 'start' &&
              (loading ? (
                <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 20 }} />
              ) : (
                <View style={{ flex: 1 }}>
                  <FlatList
                    ref={flatListRef}
                    contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    automaticallyAdjustKeyboardInsets={true}
                    data={sortedFilteredLeads}
                    keyExtractor={(lead) => String(lead._id)}
                    ListEmptyComponent={
                      <View style={styles.empty}>
                        <Ionicons name="business-outline" size={36} color="#cbd5e1" />
                        <Text style={styles.emptyText}>No client sites found.</Text>
                      </View>
                    }
                    renderItem={({ item: lead }) => {
                      const leadId = String(lead._id);

                      // Multi-employee selection
                      const selectedIds = selectedEmployeeIds[leadId] || [];
                      const showSelector = showEmployeeSelectorForSite[leadId] || false;
                      const matchingEmployees = employees.filter((e: any) => {
                        if (!isEligibleWorker(e)) return false;
                        return (e.name || '')
                          .toLowerCase()
                          .includes(employeeSearchQuery.toLowerCase());
                      });

                      const { activeHere, prevShift } = getSiteWorkerState(leadId);

                      // ── Site shift info ─────────────────────────────────
                      const siteShifts: any[] = (lead.siteShifts || []).filter(
                        (s: any) => s.active !== false
                      );
                      const hasNoSiteShifts = siteShifts.length === 0;

                      // Collapsible state: collapsed by default
                      const isExpanded = expandedLeads[leadId] || false;

                      // Is it missing workers during an active shift?
                      const hasActiveShift = isSiteActiveNow(lead);
                      const isMissingWorker = hasActiveShift && activeHere.length === 0;

                      return (
                        <BlinkingWarningWrapper
                          key={leadId}
                          isActiveButEmpty={isMissingWorker}
                          hasWorkers={activeHere.length > 0}
                          style={styles.leadCard}
                          onLayout={(e: any) => {
                            itemLayouts.current[leadId] = e.nativeEvent.layout.y;
                          }}
                        >
                          {({ animatedTextColor }: any) => (
                            <>
                              {/* ── Site name row ── */}
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  marginBottom: isExpanded ? 6 : 0,
                                  justifyContent: 'space-between',
                                }}
                              >
                                <TouchableOpacity
                                  onPress={() => {
                                    LayoutAnimation.configureNext(
                                      LayoutAnimation.Presets.easeInEaseOut
                                    );
                                    setExpandedLeads((prev) => ({
                                      ...prev,
                                      [leadId]: !isExpanded,
                                    }));
                                    if (!isExpanded) {
                                      setTimeout(() => {
                                        const y = itemLayouts.current[leadId];
                                        if (y !== undefined && flatListRef.current) {
                                          // Scroll item into view
                                          flatListRef.current.scrollToOffset({
                                            offset: Math.max(0, y - 20),
                                            animated: true,
                                          });
                                        }
                                      }, 350);
                                    }
                                  }}
                                  style={{
                                    flex: 1,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 4,
                                    marginRight: 6,
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <Ionicons
                                    name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                                    size={16}
                                    color="#64748b"
                                  />
                                  <Animated.Text
                                    style={{
                                      fontSize: 15,
                                      fontWeight: '800',
                                      color: isMissingWorker ? animatedTextColor : '#0f172a',
                                      flex: 1,
                                    }}
                                    numberOfLines={1}
                                  >
                                    {lead.sender_name || lead.name || 'Unnamed Site'}
                                  </Animated.Text>
                                </TouchableOpacity>

                                <View
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                                >
                                  {/* Enquiry / Shift Config button */}
                                  <TouchableOpacity
                                    onPress={() => setEnquiryLead(lead)}
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      gap: 3,
                                      backgroundColor: hasNoSiteShifts ? '#fef2f2' : '#f0fdf4',
                                      borderRadius: 6,
                                      paddingHorizontal: 6,
                                      paddingVertical: 2.5,
                                      borderWidth: 1,
                                      borderColor: hasNoSiteShifts ? '#fecaca' : '#bbf7d0',
                                    }}
                                  >
                                    <Ionicons
                                      name="settings-outline"
                                      size={12}
                                      color={hasNoSiteShifts ? '#dc2626' : '#15803d'}
                                    />
                                    <Text
                                      style={{
                                        fontSize: 11,
                                        fontWeight: '700',
                                        color: hasNoSiteShifts ? '#dc2626' : '#15803d',
                                      }}
                                    >
                                      {hasNoSiteShifts ? 'Setup' : 'Enquiry'}
                                    </Text>
                                  </TouchableOpacity>
                                  {activeHere.length > 0 && (
                                    <View
                                      style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        backgroundColor: '#dcfce7',
                                        borderRadius: 6,
                                        paddingHorizontal: 5,
                                        paddingVertical: 2.5,
                                        gap: 3,
                                        borderWidth: 1,
                                        borderColor: '#bbf7d0',
                                      }}
                                    >
                                      <View
                                        style={{
                                          width: 4,
                                          height: 4,
                                          borderRadius: 2,
                                          backgroundColor: '#15803d',
                                        }}
                                      />
                                      <Text
                                        style={{
                                          fontSize: 11,
                                          fontWeight: '800',
                                          color: '#15803d',
                                        }}
                                      >
                                        {activeHere.length} ACTIVE
                                      </Text>
                                    </View>
                                  )}
                                </View>
                              </View>

                              {isExpanded && (
                                <View style={{ marginTop: 6 }}>
                                  {/* ── Site Shift Summary Panel ── */}
                                  {siteShifts.length > 0 ? (
                                    <View
                                      style={{
                                        backgroundColor: '#f8fafc',
                                        borderRadius: 8,
                                        padding: 5,
                                        paddingHorizontal: 6,
                                        marginBottom: 6,
                                        borderWidth: 1,
                                        borderColor: '#e2e8f0',
                                      }}
                                    >
                                      <View
                                        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}
                                      >
                                        {siteShifts.map((ss: any, si: number) => {
                                          const [h] = (ss.startTime || '08:00')
                                            .split(':')
                                            .map(Number);
                                          const endH = (h + (ss.durationHrs || 8)) % 24;
                                          const endStr = `${String(endH).padStart(2, '0')}:${(ss.startTime || '08:00').split(':')[1]}`;
                                          const activeInShift = activeHere.filter(
                                            (w: any) => w.shiftCode === ss.shiftCode
                                          ).length;
                                          const slotFull = activeInShift >= (ss.workerSlots || 1);
                                          return (
                                            <View
                                              key={si}
                                              style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                backgroundColor:
                                                  ss.groupName === 'DaNi' ? '#f3e8ff' : '#e0f2fe',
                                                borderRadius: 4,
                                                paddingHorizontal: 4,
                                                paddingVertical: 1.5,
                                                borderWidth: 1,
                                                borderColor:
                                                  ss.groupName === 'DaNi' ? '#d8b4fe' : '#bae6fd',
                                                gap: 2,
                                              }}
                                            >
                                              <Text
                                                style={{
                                                  fontSize: 11,
                                                  fontWeight: '800',
                                                  color:
                                                    ss.groupName === 'DaNi' ? '#6b21a8' : '#0369a1',
                                                }}
                                              >
                                                {ss.shiftCode}
                                              </Text>
                                              <Text
                                                style={{
                                                  fontSize: 11,
                                                  color: '#334155',
                                                  fontWeight: '600',
                                                }}
                                              >
                                                {ss.startTime}–{endStr}
                                              </Text>
                                              <Text
                                                style={{
                                                  fontSize: 11,
                                                  fontWeight: '700',
                                                  color: slotFull ? '#dc2626' : '#15803d',
                                                }}
                                              >
                                                ({activeInShift}/{ss.workerSlots || 1})
                                              </Text>
                                            </View>
                                          );
                                        })}
                                      </View>
                                    </View>
                                  ) : (
                                    <View
                                      style={{
                                        backgroundColor: '#fef2f2',
                                        borderRadius: 8,
                                        padding: 6,
                                        marginBottom: 6,
                                        borderWidth: 1,
                                        borderColor: '#fecaca',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 6,
                                      }}
                                    >
                                      <Ionicons name="warning" size={14} color="#dc2626" />
                                      <Text
                                        style={{
                                          fontSize: 12,
                                          fontWeight: '600',
                                          color: '#dc2626',
                                          flex: 1,
                                        }}
                                      >
                                        No site shifts configured — duty start is blocked. Tap
                                        "Setup" to configure.
                                      </Text>
                                    </View>
                                  )}

                                  {/* ── Section 1: Active workers at THIS site ── */}
                                  {activeHere.length > 0 && (
                                    <View style={{ marginBottom: 6 }}>
                                      <Text
                                        style={{
                                          fontSize: 12,
                                          fontWeight: '800',
                                          color: '#15803d',
                                          letterSpacing: 0.3,
                                          marginBottom: 3,
                                        }}
                                      >
                                        🟢 CURRENTLY ON DUTY
                                      </Text>
                                      <View style={{ flexDirection: 'column', gap: 4 }}>
                                        {activeHere.map((worker: any) => {
                                          const elapsed = worker.dutyStart
                                            ? (
                                                (Date.now() -
                                                  new Date(worker.dutyStart).getTime()) /
                                                3_600_000
                                              ).toFixed(1)
                                            : null;
                                          return (
                                            <View
                                              key={worker.id}
                                              style={{
                                                backgroundColor: '#f0fdf4',
                                                borderColor: '#bbf7d0',
                                                borderWidth: 1,
                                                borderRadius: 6,
                                                padding: 5,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                marginBottom: 2,
                                              }}
                                            >
                                              <View style={{ flex: 1 }}>
                                                <View
                                                  style={{
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    gap: 3,
                                                    flexWrap: 'wrap',
                                                  }}
                                                >
                                                  <View
                                                    style={{
                                                      backgroundColor: '#15803d',
                                                      paddingHorizontal: 4,
                                                      paddingVertical: 0.5,
                                                      borderRadius: 3,
                                                    }}
                                                  >
                                                    <Text
                                                      style={{
                                                        fontSize: 10,
                                                        fontWeight: '800',
                                                        color: '#fff',
                                                      }}
                                                    >
                                                      {worker.shiftCode}
                                                    </Text>
                                                  </View>
                                                  <Text
                                                    style={{
                                                      fontSize: 14,
                                                      fontWeight: '600',
                                                      color: '#1e293b',
                                                    }}
                                                    numberOfLines={1}
                                                  >
                                                    {worker.name}
                                                  </Text>
                                                  {elapsed && (
                                                    <Text
                                                      style={{
                                                        fontSize: 11,
                                                        color: '#15803d',
                                                        fontWeight: '600',
                                                      }}
                                                    >
                                                      · {elapsed}h
                                                    </Text>
                                                  )}
                                                </View>
                                                <Text
                                                  style={{
                                                    fontSize: 11,
                                                    color: '#475569',
                                                    marginTop: 1,
                                                  }}
                                                  numberOfLines={1}
                                                >
                                                  {formatDutySchedule(worker)}
                                                </Text>
                                              </View>
                                            </View>
                                          );
                                        })}
                                      </View>
                                    </View>
                                  )}

                                  {/* ── Section 2: Previous shift workers (handover pending) ── */}
                                  {prevShift.length > 0 && (
                                    <View style={{ marginBottom: 6 }}>
                                      <Text
                                        style={{
                                          fontSize: 12,
                                          fontWeight: '800',
                                          color: '#b45309',
                                          letterSpacing: 0.3,
                                          marginBottom: 3,
                                        }}
                                      >
                                        {activeHere.length > 0
                                          ? '⏱ PREVIOUS SHIFT (ENDED)'
                                          : '🔄 AWAITING RELIEF — PREV SHIFT'}
                                      </Text>
                                      <View style={{ flexDirection: 'column', gap: 4 }}>
                                        {prevShift.map((worker: any) => {
                                          const shiftDetails = worker.emp
                                            ? getEmployeeShiftDetails(worker.emp)
                                            : null;
                                          const hasShift = !!shiftDetails?.startTime;

                                          const currentHour = new Date().getHours();
                                          const isCurrentTimeNight =
                                            currentHour >= 20 || currentHour < 8;
                                          const isCurrentTimeDay =
                                            currentHour >= 8 && currentHour < 20;

                                          const sCode =
                                            worker.shiftCode || shiftDetails?.shiftCode || '';
                                          const isDayShift = ['D', 'M', 'A', 'G'].includes(sCode);
                                          const isNightShift = ['N2', 'N'].includes(sCode);

                                          let isStartEnabled = true;
                                          let btnText = 'START';
                                          let iconName: 'play' | 'power' | 'hand-left' = 'play';
                                          let btnColor = '#10b981';

                                          if (isCurrentTimeNight && isDayShift) {
                                            isStartEnabled = false;
                                            btnText = 'WAIT';
                                            iconName = 'hand-left';
                                            btnColor = '#475569';
                                          } else if (isCurrentTimeDay && isNightShift) {
                                            isStartEnabled = false;
                                            btnText = 'WAIT';
                                            iconName = 'hand-left';
                                            btnColor = '#475569';
                                          } else if (hasShift) {
                                            isStartEnabled = true;
                                            btnText = 'START';
                                            iconName = 'power';
                                            btnColor = '#10b981';
                                          }

                                          return (
                                            <View
                                              key={worker.id}
                                              style={{
                                                backgroundColor: '#fffbeb',
                                                borderColor: '#fcd34d',
                                                borderWidth: 1,
                                                borderRadius: 6,
                                                padding: 5,
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                marginBottom: 2,
                                              }}
                                            >
                                              <View style={{ flex: 1, marginRight: 6 }}>
                                                <View
                                                  style={{
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    gap: 3,
                                                    flexWrap: 'wrap',
                                                  }}
                                                >
                                                  <View
                                                    style={{
                                                      backgroundColor: '#d97706',
                                                      paddingHorizontal: 4,
                                                      paddingVertical: 0.5,
                                                      borderRadius: 3,
                                                    }}
                                                  >
                                                    <Text
                                                      style={{
                                                        fontSize: 10,
                                                        fontWeight: '800',
                                                        color: '#fff',
                                                      }}
                                                    >
                                                      {worker.shiftCode}
                                                    </Text>
                                                  </View>
                                                  <Text
                                                    style={{
                                                      fontSize: 14,
                                                      fontWeight: '600',
                                                      color: '#78350f',
                                                    }}
                                                    numberOfLines={1}
                                                  >
                                                    {worker.name}
                                                  </Text>
                                                </View>
                                                <Text
                                                  style={{
                                                    fontSize: 11,
                                                    color: '#92400e',
                                                    fontWeight: '600',
                                                    marginTop: 1,
                                                  }}
                                                >
                                                  Prev Shift ended
                                                </Text>
                                              </View>
                                              <TouchableOpacity
                                                onPress={() => handleStartDuty(worker.id, lead)}
                                                disabled={!isStartEnabled}
                                                style={{
                                                  backgroundColor: btnColor,
                                                  paddingHorizontal: 8,
                                                  paddingVertical: 3.5,
                                                  borderRadius: 4,
                                                  flexDirection: 'row',
                                                  alignItems: 'center',
                                                  gap: 2,
                                                  minWidth: 60,
                                                  justifyContent: 'center',
                                                }}
                                              >
                                                <Ionicons name={iconName} size={14} color="#fff" />
                                                <Text
                                                  style={{
                                                    fontSize: 12,
                                                    color: '#fff',
                                                    fontWeight: '700',
                                                  }}
                                                >
                                                  {btnText}
                                                </Text>
                                              </TouchableOpacity>
                                            </View>
                                          );
                                        })}
                                      </View>
                                    </View>
                                  )}

                                  {/* ── Empty state: no active, no prev shift ── */}
                                  {activeHere.length === 0 && prevShift.length === 0 && (
                                    <View
                                      style={{
                                        paddingVertical: 4,
                                        alignItems: 'center',
                                        flexDirection: 'row',
                                        gap: 4,
                                        justifyContent: 'center',
                                        backgroundColor: '#f8fafc',
                                        borderRadius: 6,
                                        marginBottom: 4,
                                        borderWidth: 1,
                                        borderColor: '#e2e8f0',
                                      }}
                                    >
                                      <Ionicons name="moon-outline" size={14} color="#94a3b8" />
                                      <Text
                                        style={{
                                          fontSize: 12,
                                          color: '#94a3b8',
                                          fontWeight: '600',
                                        }}
                                      >
                                        No active or recent shift data
                                      </Text>
                                    </View>
                                  )}

                                  {/* ── Multi-employee selector ── */}
                                  <View
                                    style={{
                                      borderTopWidth: 1,
                                      borderTopColor: '#f1f5f9',
                                      paddingTop: 6,
                                    }}
                                  >
                                    {/* Selected employee chips row */}
                                    {selectedIds.length > 0 && (
                                      <View
                                        style={{
                                          flexDirection: 'row',
                                          flexWrap: 'wrap',
                                          gap: 4,
                                          marginBottom: 4,
                                        }}
                                      >
                                        {selectedIds.map((empId) => {
                                          const emp = employees.find(
                                            (e: any) => String(e._id) === empId
                                          );
                                          return (
                                            <View key={empId} style={styles.empChip}>
                                              <Text style={styles.empChipText} numberOfLines={1}>
                                                {emp
                                                  ? `${emp.name}${emp.enrollment_no ? ` (${emp.enrollment_no})` : ''}`
                                                  : empId}
                                              </Text>
                                              <TouchableOpacity
                                                onPress={() => toggleEmployeeForSite(leadId, empId)}
                                              >
                                                <Ionicons
                                                  name="close-circle"
                                                  size={13}
                                                  color="#1d4ed8"
                                                />
                                              </TouchableOpacity>
                                            </View>
                                          );
                                        })}
                                      </View>
                                    )}

                                    {/* Employee search + compact list */}
                                    {showSelector && (
                                      <View
                                        style={{
                                          marginBottom: 4,
                                          backgroundColor: '#fff',
                                          borderWidth: 1,
                                          borderColor: '#e2e8f0',
                                          borderRadius: 6,
                                          overflow: 'hidden',
                                        }}
                                      >
                                        {/* Compact search */}
                                        <View
                                          style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            backgroundColor: '#f8fafc',
                                            paddingHorizontal: 8,
                                            height: 30,
                                            borderBottomWidth: 1,
                                            borderBottomColor: '#f1f5f9',
                                          }}
                                        >
                                          <Ionicons
                                            name="search"
                                            size={10}
                                            color="#94a3b8"
                                            style={{ marginRight: 4 }}
                                          />
                                          <TextInput
                                            placeholder="Search..."
                                            placeholderTextColor="#94a3b8"
                                            value={employeeSearchQuery}
                                            onChangeText={setEmployeeSearchQuery}
                                            style={{
                                              flex: 1,
                                              fontSize: 13,
                                              color: '#0f172a',
                                              fontWeight: '600',
                                              padding: 0,
                                            }}
                                          />
                                          {employeeSearchQuery ? (
                                            <TouchableOpacity
                                              onPress={() => setEmployeeSearchQuery('')}
                                            >
                                              <Ionicons
                                                name="close-circle"
                                                size={10}
                                                color="#94a3b8"
                                              />
                                            </TouchableOpacity>
                                          ) : null}
                                        </View>
                                        {/* Compact employee rows */}
                                        <FlatList
                                          nestedScrollEnabled
                                          style={{ maxHeight: 110 }}
                                          keyboardShouldPersistTaps="handled"
                                          data={matchingEmployees}
                                          keyExtractor={(emp) => String(emp._id)}
                                          ListEmptyComponent={
                                            <Text
                                              style={{
                                                fontSize: 10,
                                                color: '#94a3b8',
                                                textAlign: 'center',
                                                paddingVertical: 6,
                                                fontWeight: '600',
                                              }}
                                            >
                                              No employees found
                                            </Text>
                                          }
                                          renderItem={({ item: emp }) => {
                                            const isSelected = selectedIds.includes(
                                              String(emp._id)
                                            );
                                            const isWorkerActive = activeStaff.some(
                                              (s: any) =>
                                                String(
                                                  s.employeeId?._id ||
                                                    s.employeeId ||
                                                    s.employee_id?._id ||
                                                    s.employee_id ||
                                                    ''
                                                ) === String(emp._id)
                                            );
                                            const shiftDetails = getEmployeeShiftDetails(emp);
                                            return (
                                              <TouchableOpacity
                                                key={emp._id}
                                                disabled={isWorkerActive}
                                                onPress={() =>
                                                  toggleEmployeeForSite(leadId, String(emp._id))
                                                }
                                                style={[
                                                  styles.empRow,
                                                  isSelected && styles.empRowSelected,
                                                  isWorkerActive && {
                                                    opacity: 0.7,
                                                    backgroundColor: '#f8fafc',
                                                  },
                                                ]}
                                              >
                                                <Ionicons
                                                  name={
                                                    isWorkerActive
                                                      ? 'lock-closed'
                                                      : isSelected
                                                        ? 'checkbox'
                                                        : 'square-outline'
                                                  }
                                                  size={14}
                                                  color={
                                                    isWorkerActive
                                                      ? '#94a3b8'
                                                      : isSelected
                                                        ? COLORS.primary
                                                        : '#cbd5e1'
                                                  }
                                                />
                                                <Text
                                                  style={[
                                                    styles.empRowName,
                                                    isWorkerActive
                                                      ? { color: '#15803d', fontWeight: '700' }
                                                      : isSelected && { color: COLORS.primary },
                                                  ]}
                                                  numberOfLines={1}
                                                >
                                                  {emp.name}
                                                  {emp.enrollment_no
                                                    ? ` (${emp.enrollment_no})`
                                                    : ''}{' '}
                                                  {isWorkerActive && '🟢 Active'}
                                                </Text>
                                                <Text style={styles.empRowBadge}>
                                                  {shiftDetails.shiftName.toUpperCase()}
                                                </Text>
                                              </TouchableOpacity>
                                            );
                                          }}
                                        />
                                      </View>
                                    )}
                                    <View style={{ flexDirection: 'row', gap: 6 }}>
                                      <TouchableOpacity
                                        onPress={() => {
                                          setShowEmployeeSelectorForSite((prev) => ({
                                            ...prev,
                                            [leadId]: !showSelector,
                                          }));
                                          setEmployeeSearchQuery('');
                                        }}
                                        style={[styles.addEmpBtn, { flex: 1 }]}
                                      >
                                        <Ionicons
                                          name={showSelector ? 'chevron-up' : 'person-add'}
                                          size={12}
                                          color="#64748b"
                                        />
                                        <Text
                                          style={{
                                            fontSize: 11,
                                            fontWeight: '600',
                                            color: '#64748b',
                                          }}
                                        >
                                          {showSelector
                                            ? 'Close'
                                            : selectedIds.length > 0
                                              ? `+ Add Selected (${selectedIds.length})`
                                              : 'Select Employees'}
                                        </Text>
                                      </TouchableOpacity>

                                      {selectedIds.length > 0 && (
                                        <TouchableOpacity
                                          onPress={() => handleStartDutyForSelected(leadId, lead)}
                                          style={[
                                            styles.miniBtn,
                                            {
                                              flex: 1,
                                              justifyContent: 'center',
                                              alignItems: 'center',
                                            },
                                          ]}
                                        >
                                          <Text style={styles.miniBtnText}>Start Duty For All</Text>
                                        </TouchableOpacity>
                                      )}
                                    </View>
                                  </View>
                                </View>
                              )}
                            </>
                          )}
                        </BlinkingWarningWrapper>
                      );
                    }}
                  />
                </View>
              ))}
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ── Reliever Selection Sub-modal ── */}
      <Modal visible={selectingRelieverFor !== null} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end' }}
          >
            <View
              style={{
                backgroundColor: '#fff',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                height: '70%',
                paddingBottom: insets.bottom,
              }}
            >
              {/* Header */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 18,
                  borderBottomWidth: 1,
                  borderBottomColor: '#f1f5f9',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>
                    Select Reliever Worker
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }} numberOfLines={1}>
                    Replacing: {selectingRelieverFor?.displayName}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setSelectingRelieverFor(null);
                    setRelieverSearchQuery('');
                  }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: '#f1f5f9',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Ionicons name="close" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* Search Bar */}
              <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#f1f5f9',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    height: 44,
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                  }}
                >
                  <Ionicons name="search" size={18} color="#64748b" style={{ marginRight: 8 }} />
                  <TextInput
                    placeholder="Search employees..."
                    placeholderTextColor="#94a3b8"
                    value={relieverSearchQuery}
                    onChangeText={setRelieverSearchQuery}
                    style={{
                      flex: 1,
                      fontSize: 14,
                      color: '#0f172a',
                      fontWeight: '600',
                      padding: 0,
                    }}
                  />
                  {relieverSearchQuery ? (
                    <TouchableOpacity onPress={() => setRelieverSearchQuery('')}>
                      <Ionicons name="close-circle" size={18} color="#94a3b8" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {/* List */}
              <FlatList
                contentContainerStyle={{ padding: 12 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                data={eligibleRelievers}
                keyExtractor={(emp) => String(emp._id)}
                ListEmptyComponent={
                  <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                    <Ionicons name="people-outline" size={40} color="#cbd5e1" />
                    <Text
                      style={{ color: '#94a3b8', marginTop: 8, fontWeight: '600', fontSize: 14 }}
                    >
                      No eligible reliever workers found.
                    </Text>
                  </View>
                }
                renderItem={({ item: emp }) => {
                  const shiftDetails = getEmployeeShiftDetails(emp);
                  const isWorkerActive = activeStaff.some(
                    (s: any) =>
                      String(
                        s.employeeId?._id ||
                          s.employeeId ||
                          s.employee_id?._id ||
                          s.employee_id ||
                          ''
                      ) === String(emp._id)
                  );
                  return (
                    <TouchableOpacity
                      key={emp._id}
                      disabled={isWorkerActive}
                      onPress={() => {
                        if (selectingRelieverFor) {
                          const workerAEmp = employees.find(
                            (e: any) =>
                              String(e._id) ===
                              String(
                                selectingRelieverFor.employeeId?._id ||
                                  selectingRelieverFor.employeeId ||
                                  ''
                              )
                          );
                          const workerAEnr = workerAEmp?.enrollment_no;
                          const workerAName = workerAEnr
                            ? `${selectingRelieverFor.displayName} (${workerAEnr})`
                            : selectingRelieverFor.displayName;

                          const workerBEnr = emp.enrollment_no;
                          const workerBName = workerBEnr ? `${emp.name} (${workerBEnr})` : emp.name;

                          saveRelieverRelation(
                            { id: selectingRelieverFor._id, name: workerAName },
                            { id: String(emp._id), name: workerBName }
                          );
                          // Auto check the card once a reliever is assigned
                          setSelectedWorkers((prev) => ({
                            ...prev,
                            [selectingRelieverFor._id]: true,
                          }));
                        }
                        setSelectingRelieverFor(null);
                        setRelieverSearchQuery('');
                      }}
                      style={[
                        {
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          borderBottomWidth: 1,
                          borderBottomColor: '#f1f5f9',
                          gap: 12,
                        },
                        isWorkerActive && { opacity: 0.7, backgroundColor: '#f8fafc' },
                      ]}
                    >
                      <Ionicons
                        name={isWorkerActive ? 'lock-closed' : 'person-circle-outline'}
                        size={26}
                        color={isWorkerActive ? '#94a3b8' : COLORS.primary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: '700',
                            color: isWorkerActive ? '#15803d' : '#1e293b',
                          }}
                        >
                          {emp.name}
                          {emp.enrollment_no ? ` (${emp.enrollment_no})` : ''}{' '}
                          {isWorkerActive && '🟢 Active'}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          Shift: {shiftDetails.shiftName} ({shiftDetails.shiftCode})
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topBarText: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  bulkBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bulkBtnText: { fontSize: 12, color: '#fff', fontWeight: '700' },
  scrollContent: { padding: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  cardNearEnd: { borderColor: '#fef08a', backgroundColor: '#fefce8' },
  cardCheckbox: { padding: 4 },
  empName: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  endIconBtn: { padding: 4 },
  dutyInfo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dutyText: { fontSize: 12, color: '#15803d', fontWeight: '700' },
  shiftText: { fontSize: 12, color: '#64748b', marginTop: 2 },
  warnText: { fontSize: 12, color: '#ca8a04', fontWeight: '700', marginTop: 2 },
  actions: { marginLeft: 10 },
  actionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  actionText: { fontSize: 13, fontWeight: '700' },
  empty: { padding: 60, alignItems: 'center' },
  emptyText: { color: '#94a3b8', marginTop: 8, fontWeight: '600', fontSize: 15 },
  leadCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  workerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeChipBorder: { borderColor: '#86efac' },
  activeNowPill: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 6,
  },
  miniBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  miniBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  addEmpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    height: 28,
  },
  empChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    maxWidth: 140,
  },
  empChipText: { fontSize: 10, fontWeight: '700', color: '#1d4ed8', flex: 1 },
  empRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 8,
  },
  empRowSelected: { backgroundColor: '#eff6ff' },
  empRowName: { flex: 1, fontSize: 12, color: '#334155', fontWeight: '600' },
  empRowBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 9,
    color: '#64748b',
    fontWeight: '700',
    overflow: 'hidden',
  },
});
