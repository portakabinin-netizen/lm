import { appService } from '@/UtilServices/appHelper';
import { useUserContext } from '@/context/AuthContext';
import { COLORS, styles as GS, wfStyles } from '@/styles/stylesIndex';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logAttendanceToSQLite } from '@/UtilServices/sqliteService';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import * as Location from 'expo-location';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddEmployeeModal } from './AddEmployeeModal';
import { ShiftChangeModal } from './ShiftChangeModal';
import { getSocket } from '@/hooks/Socket';
import { useGPSCoordinates } from '@/hooks/useGPSCoordinates';
import { useUnifiedLocation } from '@/hooks/useUnifiedLocation';

interface Props {
  visible: boolean;
  onClose: () => void;
  onComplete: () => void;
  leads?: any[];
  initialLeadId?: string;
  workerToReplaceId?: string;
  workerToReplaceName?: string;
  initialViewType?: 'workerwise' | 'sitewise' | 'shiftwise';
}

// ΓöÇΓöÇΓöÇ Rate Dialog ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const RateDialog = ({ visible, employee, onSave, onClose }: any) => {
  const [daily, setDaily] = useState('');
  const [monthly, setMonthly] = useState('');
  // Calendar-aware: days in current month
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={wfStyles.wfOverlay}>
          <View style={wfStyles.wfDialogCard}>
            <Text style={wfStyles.wfDialogTitle}>
              Set Rate ΓÇö {employee?.name}
              {employee?.enrollment_no ? ` (${employee.enrollment_no})` : ''}
            </Text>
            <Text style={wfStyles.wfDialogSubtitle}>
              No previous rate for this site ┬╖ Month = {daysInMonth} days
            </Text>
            <View style={{ marginTop: 14 }}>
              <Text style={wfStyles.wfDialogLabel}>Monthly Rate (Γé╣)</Text>
              <TextInput
                style={wfStyles.wfDialogInput}
                keyboardType="numeric"
                value={monthly}
                placeholder="Enter monthly salary"
                onChangeText={(v) => {
                  setMonthly(v);
                  if (!isNaN(+v) && +v > 0) setDaily((+v / daysInMonth).toFixed(2));
                }}
              />
              <Text style={[wfStyles.wfDialogLabel, { marginTop: 10 }]}>
                Daily Rate (Γé╣){' '}
                <Text style={{ color: '#94a3b8', fontWeight: '400' }}>
                  (auto = monthly ├╖ {daysInMonth})
                </Text>
              </Text>
              <TextInput
                style={wfStyles.wfDialogInput}
                keyboardType="numeric"
                value={daily}
                placeholder={`Γëê ${monthly ? (+monthly / daysInMonth).toFixed(0) : '0'}/day`}
                onChangeText={(v) => {
                  setDaily(v);
                  if (!isNaN(+v) && +v > 0) setMonthly(String(Math.round(+v * daysInMonth)));
                }}
              />
            </View>
            <View style={wfStyles.wfDialogBtnRow}>
              <TouchableOpacity
                style={[wfStyles.wfDialogBtn, wfStyles.wfDialogBtnCancel]}
                onPress={onClose}
              >
                <Text style={wfStyles.wfDialogBtnTextDark}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  wfStyles.wfDialogBtn,
                  wfStyles.wfDialogBtnPrimary,
                  { backgroundColor: COLORS.primary },
                ]}
                onPress={() => onSave(parseFloat(daily) || 0, parseFloat(monthly) || 0)}
              >
                <Text style={wfStyles.wfDialogBtnTextLight}>Save Rate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ΓöÇΓöÇΓöÇ Enrollment Blocked Dialog ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const EnrollmentBlockedDialog = ({ visible, employee, onClose }: any) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={wfStyles.wfOverlay}>
        <View
          style={[
            wfStyles.wfDialogCard,
            { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
          ]}
        >
          <View style={{ position: 'relative', marginBottom: 24 }}>
            <View style={wfStyles.wfAvatarWrap}>
              {employee?.photo_url ? (
                <Image
                  source={{ uri: employee.photo_url }}
                  style={[
                    wfStyles.wfAvatar,
                    {
                      width: 120,
                      height: 120,
                      borderRadius: 60,
                      borderWidth: 3,
                      borderColor: '#fee2e2',
                    },
                  ]}
                />
              ) : (
                <View
                  style={[
                    wfStyles.wfAvatar,
                    wfStyles.wfAvatarFallback,
                    {
                      width: 120,
                      height: 120,
                      borderRadius: 60,
                      backgroundColor: '#fef2f2',
                      borderWidth: 3,
                      borderColor: '#fee2e2',
                    },
                  ]}
                >
                  <Text style={[wfStyles.wfAvatarInitial, { fontSize: 48, color: '#ef4444' }]}>
                    {(employee?.name || '?')[0].toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View
              style={{
                position: 'absolute',
                bottom: -5,
                right: -5,
                backgroundColor: '#fff',
                borderRadius: 25,
                padding: 4,
                elevation: 4,
                shadowColor: '#000',
                shadowOpacity: 0.1,
                shadowRadius: 4,
              }}
            >
              <Ionicons name="ban" size={40} color="#ef4444" />
            </View>
          </View>

          <Text
            style={[
              wfStyles.wfDialogTitle,
              { textAlign: 'center', fontSize: 20, color: '#1e293b' },
            ]}
          >
            Duty Allotment Blocked
          </Text>
          <View style={{ marginTop: 16, paddingHorizontal: 40 }}>
            <Text style={{ textAlign: 'center', fontSize: 15, color: '#475569', lineHeight: 22 }}>
              Worker{' '}
              <Text style={{ fontWeight: '800', color: '#0f172a' }}>
                {employee?.name}
                {employee?.enrollment_no ? ` (${employee.enrollment_no})` : ''}
              </Text>{' '}
              is not enrolled.
            </Text>
            <Text
              style={{
                textAlign: 'center',
                fontSize: 14,
                color: '#64748b',
                marginTop: 8,
                lineHeight: 20,
              }}
            >
              The 2-day grace period has expired. Please update the enrollment form number in the
              employee profile to continue.
            </Text>
          </View>

          <TouchableOpacity
            style={[
              wfStyles.wfDialogBtn,
              {
                backgroundColor: '#f1f5f9',
                width: '80%',
                marginTop: 32,
                height: 54,
                borderRadius: 16,
              },
            ]}
            onPress={onClose}
          >
            <Text style={[wfStyles.wfDialogBtnTextDark, { fontSize: 16, fontWeight: '800' }]}>
              Understood
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ΓöÇΓöÇΓöÇ Force Off Dialog ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const ForceOffDialog = ({ visible, onConfirm, onCancel }: any) => {
  const [reason, setReason] = useState('');
  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={wfStyles.wfOverlay}>
          <View style={wfStyles.wfDialogCard}>
            <Text style={wfStyles.wfDialogTitle}>Early Off-Duty</Text>
            <Text style={wfStyles.wfDialogSubtitle}>
              Worker has not completed duty hours. Enter reason:
            </Text>
            <TextInput
              style={wfStyles.wfDialogInputTall}
              placeholder="Reason for early off-duty..."
              multiline
              value={reason}
              onChangeText={setReason}
            />
            <View style={wfStyles.wfDialogBtnRow}>
              <TouchableOpacity
                style={[wfStyles.wfDialogBtn, wfStyles.wfDialogBtnCancel]}
                onPress={onCancel}
              >
                <Text style={wfStyles.wfDialogBtnTextDark}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[wfStyles.wfDialogBtn, wfStyles.wfDialogBtnDanger]}
                onPress={() => {
                  if (reason.trim()) {
                    onConfirm(reason);
                    setReason('');
                  }
                }}
              >
                <Text style={wfStyles.wfDialogBtnTextLight}>Confirm Off</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// Returns 'YYYY-MM-DD' in local timezone (avoids UTC date shift for IST+5:30)
const toLocalDateStr = (d: Date) => {
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${dy}`;
};

const formatToDDMMYYYY = (d: Date | string) => {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '';
  const yr = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const dy = String(date.getDate()).padStart(2, '0');
  return `${dy}-${mo}-${yr}`;
};

// Converts decimal hours to HH:MM:SS
const formatHMS = (decimalHours: number) => {
  const totalSeconds = Math.floor(decimalHours * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
};

const isShiftActiveAtTime = (
  startTimeStr: string,
  durationHrs: number,
  checkDate: Date = new Date()
) => {
  if (!startTimeStr) return false;
  const [sh, sm] = startTimeStr.split(':').map(Number);
  const nowHour = checkDate.getHours();
  const nowMin = checkDate.getMinutes();
  const nowTotalMins = nowHour * 60 + nowMin;

  const startTotalMins = sh * 60 + sm;
  const endTotalMins = (startTotalMins + durationHrs * 60) % 1440;

  if (startTotalMins < endTotalMins) {
    return nowTotalMins >= startTotalMins && nowTotalMins <= endTotalMins;
  } else {
    // Crosses midnight, e.g. 22:00 to 06:00
    return nowTotalMins >= startTotalMins || nowTotalMins <= endTotalMins;
  }
};

const isSiteActiveNow = (lead: any) => {
  const shifts = lead.siteShifts || [];
  const activeShifts = shifts.filter((s: any) => s.active);
  if (activeShifts.length === 0) return false;
  return activeShifts.some((s: any) => isShiftActiveAtTime(s.startTime, s.durationHrs));
};

const getShiftTimeRange = (startTime: string, durationHrs: number) => {
  if (!startTime) return 'any time';
  const [h, m] = startTime.split(':').map(Number);
  const startHour = String(h).padStart(2, '0');
  const startMin = String(m).padStart(2, '0');
  const endHour = String((h + durationHrs) % 24).padStart(2, '0');
  const endMin = startMin;
  return `${startHour}:${startMin}–${endHour}:${endMin}`;
};

// ΓöÇΓöÇΓöÇ Employee Card ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const EmployeeCard = ({
  item,
  attendanceMap,
  globalOnDutyLog,
  isToday,
  isMarking,
  onEdit,
  onMarkDuty,
  onForceOff,
  onDeleteLog,
  onCall,
  onWhatsApp,
  onPaySheet,
  onRateEdit,
  onUpdateScheduledEnd,
  tick,
  selectedDate,
  currentLead,
  acceptedLeads = [],
  onRefresh,
  isStaff,
  onContinueShift,
}: any) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  const siteLog = attendanceMap[item._id];
  const activeGlobalLog = globalOnDutyLog && !globalOnDutyLog.dutyEnd ? globalOnDutyLog : null;
  const activeSiteLog = siteLog && !siteLog.dutyEnd ? siteLog : null;
  const log = activeSiteLog || activeGlobalLog || siteLog;

  // Hours on duty (only meaningful when currently on duty)
  const isOnDuty = log && !log.dutyEnd;

  // Rule: Locked until 1 hour before scheduled end, ONLY for Staff!
  const isLocked =
    isStaff &&
    isOnDuty &&
    log?.dutyEndScheduled &&
    Date.now() < new Date(log.dutyEndScheduled).getTime() - 30 * 60 * 1000;
  const hoursOnDuty =
    log && !log.dutyEnd && log.dutyStart
      ? (Date.now() - new Date(log.dutyStart).getTime()) / 3600000
      : 0;

  // State machine for multiple shifts:
  // off    : Not working (can start new)
  // locked : Working < 8h (toggle disabled)
  // free   : Working >= 8h (can end normally)
  const dutyState = !isOnDuty ? 'off' : hoursOnDuty >= 8 ? 'free' : 'locked';
  const isDone = false; // We allow new shifts after one ends

  // Colors per state
  const trackBg = isOnDuty ? '#dcfce7' : '#fee2e2';
  const trackBorder = isOnDuty ? '#16a34a' : '#fca5a5';
  const labelColor = isOnDuty ? '#16a34a' : '#dc2626';
  const dotColor = isOnDuty ? '#22c55e' : '#ef4444';

  const totalDisplayHours = (log?.totalDayHours || 0) + hoursOnDuty;

  const dutyLabel = (() => {
    if (isOnDuty) {
      const lock = isLocked ? ' ≡ƒöÆ' : '';
      const start = new Date(log.dutyStart);
      const timeStr = start.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      const dateStr = start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

      const startedDateStr = toLocalDateStr(start);
      const isShiftC = startedDateStr !== toLocalDateStr(selectedDate);
      const dayPrefix = isShiftC ? `${dateStr} ` : '';

      return (
        <View>
          <Text style={{ color: '#16a34a', fontWeight: '600', fontSize: 10 }}>
            On Duty since {dayPrefix}
            {timeStr} ┬╖ {formatHMS(totalDisplayHours)} hrs
          </Text>

          <TouchableOpacity
            onPress={() => setShowEndTimePicker(true)}
            style={{
              marginTop: 4,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: '#f1f5f9',
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 4,
              alignSelf: 'flex-start',
            }}
          >
            <Ionicons name="time-outline" size={10} color="#64748b" />
            <Text style={{ fontSize: 9, color: '#475569', fontWeight: '700' }}>
              Sched. End:{' '}
              {log.dutyEndScheduled
                ? new Date(log.dutyEndScheduled).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })
                : 'Not Set'}
            </Text>
            <Ionicons name="create-outline" size={10} color={COLORS.primary} />
          </TouchableOpacity>

          {showEndTimePicker && (
            <DateTimePicker
              value={log.dutyEndScheduled ? new Date(log.dutyEndScheduled) : new Date()}
              mode="time"
              display="default"
              onChange={(e: any, d?: Date) => {
                setShowEndTimePicker(false);
                if (d) onUpdateScheduledEnd(item, log, d);
              }}
            />
          )}
        </View>
      );
    }
    if (totalDisplayHours > 0) {
      return `Off Duty ┬╖ Done ${formatHMS(totalDisplayHours)} (${log.shiftCount} shift${log.shiftCount > 1 ? 's' : ''})`;
    }
    return 'Off Duty';
  })();

  // Resolve actual lead from attendance log, fallback to current dropdown selection
  const actualLead = log?.leadId
    ? acceptedLeads.find((l: any) => l._id === log.leadId) || currentLead
    : currentLead;

  // Strict Proximity check (approx 5 meters tolerance)
  const isMatched =
    isOnDuty &&
    actualLead?.location?.lat &&
    tick?.coords?.lat &&
    Math.abs(tick.coords.lat - actualLead.location.lat) < 0.0005 &&
    Math.abs(tick.coords.long - actualLead.location.long) < 0.0005;

  const renderGeoStatus = () => {
    if (!log) return null; // Show geo/site info if they have any attendance log today

    // Site's fixed location/name from the actual attendance log
    const siteName = log.site_name || actualLead?.sender_name || 'Project Site';
    const siteCity = actualLead?.location?.address || actualLead?.sender_city || '';
    const siteAddr = siteCity ? `${siteName} (${siteCity})` : siteName;

    // Worker's live location from the minute-timer
    const currLat = tick?.coords?.lat;
    const currAddr = tick?.coords?.address;

    const statusColor = isMatched ? '#16a34a' : '#ef4444';

    return (
      <View style={{ marginTop: 3 }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <Ionicons name="business" size={12} color={statusColor} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 9, color: statusColor, fontWeight: '800', lineHeight: 11 }}>
              {siteAddr}
              {isOnDuty && (
                <Text style={{ fontSize: 8, fontWeight: '600' }}>
                  {' '}
                  {isMatched ? ' (On Site)' : ' (Off Site!)'}
                </Text>
              )}
            </Text>
          </View>
        </View>
        {currLat && !isMatched && (
          <Text style={{ fontSize: 8, color: '#ef4444', marginLeft: 16, marginTop: 1 }}>
            Current City: {currAddr || 'Unknown'}
          </Text>
        )}
      </View>
    );
  };

  const geoUI = renderGeoStatus();

  const [shiftModalVisible, setShiftModalVisible] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);

  // Continue Shift: close current shift then open shift picker for new shift
  const handleContinueShift = () => {
    if (isMarking) return;
    if (!isOnDuty || !log?._id) {
      appService.showToast('No active shift to continue', 'Info');
      return;
    }
    // Instantly open the shift modal
    setShiftModalVisible(true);
  };

  const handleToggle = () => {
    // Blocked while any network call for this employee is in-flight
    if (isMarking) return;

    if (dutyState === 'off') {
      if (!isToday) {
        appService.showToast('Can only start duty on today', 'Info');
        return;
      }
      setShiftModalVisible(true);
    } else if (dutyState === 'free') {
      onMarkDuty(item, log, false, false, ''); // end duty
    } else if (dutyState === 'locked') {
      const endStr = log?.dutyEndScheduled
        ? new Date(log.dutyEndScheduled).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : 'N/A';
      appService.showToast(`Locked: Shift ends at ${endStr}. You can end 30 mins before.`, 'Info');
    }
  };

  const handleSelectShift = async (shift: string) => {
    setShiftModalVisible(false);

    const now = new Date();
    let dutyStart = now;

    const matchedShift = actualLead?.siteShifts?.find((s: any) => s.shiftCode === shift);
    const duration = matchedShift?.durationHrs || (shift === 'D' || shift === 'N2' ? 12 : 8);
    const startTimeStr = matchedShift?.startTime;

    if (startTimeStr) {
      const [sh, sm] = startTimeStr.split(':').map(Number);
      const shiftStartToday = new Date(now);
      shiftStartToday.setHours(sh, sm, 0, 0);

      // +- 30 minutes range around the shift start time
      const minStart = new Date(shiftStartToday.getTime() - 30 * 60 * 1000);
      const maxStart = new Date(shiftStartToday.getTime() + 30 * 60 * 1000);

      if (now >= minStart && now <= maxStart) {
        dutyStart = shiftStartToday;
      }
    }

    const dutyEndScheduled = new Date(dutyStart.getTime() + duration * 60 * 60 * 1000);

    if (isOnDuty && log?._id) {
      setIsContinuing(true);
      try {
        await onMarkDuty(item, log, false, false, ''); // End current shift
        await new Promise((r) => setTimeout(r, 1000)); // allow state to settle
        await onMarkDuty(
          item,
          null,
          true,
          false,
          '',
          shift,
          dutyStart.toISOString(),
          dutyEndScheduled.toISOString()
        ); // Start new shift
      } finally {
        setIsContinuing(false);
      }
    } else {
      onMarkDuty(
        item,
        null,
        true,
        false,
        '',
        shift,
        dutyStart.toISOString(),
        dutyEndScheduled.toISOString()
      );
    }
  };

  const toggleMenu = () => {
    Animated.spring(menuAnim, {
      toValue: menuOpen ? 0 : 1,
      useNativeDriver: true,
      friction: 8,
    }).start();
    setMenuOpen(!menuOpen);
  };

  return (
    <View
      style={[
        wfStyles.wfCard,
        { width: '100%', alignSelf: 'stretch', flexDirection: 'column', padding: 10 },
        menuOpen && { zIndex: 100 },
      ]}
    >
      {/* Top Row: [Call, WhatsApp] (Left) & Menu (Right) */}
      <View
        style={{
          width: '100%',
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          marginBottom: 6,
          paddingBottom: 2,
        }}
      >
        <TouchableOpacity
          onPress={toggleMenu}
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            backgroundColor: menuOpen ? '#fee2e2' : '#f1f5f9',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Ionicons
            name={menuOpen ? 'close' : 'ellipsis-vertical'}
            size={22}
            color={menuOpen ? '#ef4444' : '#475569'}
          />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* Left: Photo / Toggle Button */}
        <TouchableOpacity
          onPress={handleToggle}
          disabled={isOnDuty || isLocked || isDone || isMarking}
          style={[
            wfStyles.wfAvatarWrap,
            {
              borderWidth: 2,
              borderColor: isOnDuty ? '#22c55e' : '#ef4444',
              borderRadius: 25,
              padding: 2,
              justifyContent: 'center',
              alignItems: 'center',
              opacity: isMarking ? 0.6 : 1,
            },
          ]}
        >
          {item.photo_url ? (
            <Image
              source={{ uri: item.photo_url }}
              style={[wfStyles.wfAvatar, { width: 46, height: 46, borderRadius: 23 }]}
            />
          ) : (
            <View
              style={[
                wfStyles.wfAvatar,
                wfStyles.wfAvatarFallback,
                { width: 46, height: 46, borderRadius: 23 },
              ]}
            >
              <Text style={wfStyles.wfAvatarInitial}>{(item.name || '?')[0].toUpperCase()}</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={{ flex: 1, paddingHorizontal: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={[wfStyles.wfStatusDot, { backgroundColor: dotColor }]} />
            <Text
              style={[wfStyles.wfEmpName, isOnDuty && isMatched && { color: '#16a34a' }]}
              numberOfLines={1}
            >
              {item.name}
              {item.enrollment_no ? ` (${item.enrollment_no})` : ''}
            </Text>
          </View>
          {['Sales', 'Project', 'Finance'].includes(item.role) ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              <View
                style={{
                  backgroundColor: '#f0f9ff',
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                  borderWidth: 0.5,
                  borderColor: '#bae6fd',
                }}
              >
                <Text style={{ fontSize: 9, color: '#0369a1', fontWeight: '900' }}>
                  {item.employmentHistory?.find((h: any) => h.active)?.groupName || 'MANG'}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: '#f5f3ff',
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                  borderWidth: 0.5,
                  borderColor: '#ddd6fe',
                }}
              >
                <Text style={{ fontSize: 9, color: '#6d28d9', fontWeight: '800' }}>
                  {log?.shiftCode ||
                    item.employmentHistory
                      ?.find((h: any) => h.active)
                      ?.shiftName?.substring(0, 1) ||
                    'G'}
                </Text>
              </View>
              {isOnDuty && (
                <View
                  style={{
                    backgroundColor: '#ecfdf5',
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                    borderWidth: 0.5,
                    borderColor: '#a7f3d0',
                  }}
                >
                  <Text style={{ fontSize: 9, color: '#059669', fontWeight: '800' }}>
                    DUTY ACTIVE
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <>
              {isOnDuty ? (
                dutyLabel
              ) : (
                <Text style={[wfStyles.wfDutyLabel, { color: '#dc2626' }]} numberOfLines={1}>
                  {dutyLabel}
                </Text>
              )}
              {geoUI}
            </>
          )}
        </View>

        {/* Right Section */}
        <View style={{ alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={onCall}
              style={[wfStyles.wfCallBtn, { width: 34, height: 34, borderRadius: 17 }]}
            >
              <Ionicons name="call" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onWhatsApp}
              style={[wfStyles.wfWaBtn, { width: 34, height: 34, borderRadius: 17 }]}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Loading Indicator */}
          {isMarking && <ActivityIndicator color={COLORS.primary} size="small" />}

          {/* Continue Shift button — visible when worker is currently ON duty */}
          {isOnDuty && (
            <TouchableOpacity
              onPress={handleContinueShift}
              disabled={isMarking || isContinuing}
              style={{
                marginTop: 2,
                paddingHorizontal: 6,
                paddingVertical: 3,
                borderRadius: 6,
                backgroundColor: '#f59e0b',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 3,
                opacity: isMarking || isContinuing ? 0.5 : 1,
              }}
            >
              {isContinuing ? (
                <ActivityIndicator size={8} color="#fff" />
              ) : (
                <Ionicons name="arrow-forward-circle" size={10} color="#fff" />
              )}
              <Text style={{ fontSize: 8, fontWeight: '800', color: '#fff' }}>NEXT SHIFT</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Dropdown menu */}
      {menuOpen && (
        <Animated.View
          style={[
            wfStyles.wfDropdown,
            {
              top: 48,
              opacity: menuAnim,
              transform: [
                { scaleY: menuAnim },
                { translateY: menuAnim.interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) },
              ],
            },
          ]}
        >
          <TouchableOpacity
            style={wfStyles.wfDropItem}
            onPress={() => {
              setMenuOpen(false);
              onPaySheet(item);
            }}
          >
            <Ionicons name="wallet-outline" size={14} color="#64748b" />
            <Text style={wfStyles.wfDropText} numberOfLines={1}>
              Payment Sheet
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={wfStyles.wfDropItem}
            onPress={() => {
              setMenuOpen(false);
              onEdit(item);
            }}
          >
            <Ionicons name="create-outline" size={14} color="#64748b" />
            <Text style={wfStyles.wfDropText} numberOfLines={1}>
              Edit Employee
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={wfStyles.wfDropItem}
            onPress={() => {
              setMenuOpen(false);
              onRateEdit(item);
            }}
          >
            <Ionicons name="cash-outline" size={14} color="#64748b" />
            <Text style={wfStyles.wfDropText} numberOfLines={1}>
              Daily / Monthly Rate
            </Text>
          </TouchableOpacity>
          {/* Force Duty Off ΓÇö Always available as a fallback when on duty, but highlighted when locked */}
          {isOnDuty && log?._id && (
            <TouchableOpacity
              style={[wfStyles.wfDropItem, isLocked ? wfStyles.wfDropItemForce : null]}
              onPress={() => {
                setMenuOpen(false);
                onForceOff(item, log);
              }}
            >
              <Ionicons name="warning-outline" size={14} color={isLocked ? '#f59e0b' : '#64748b'} />
              <Text
                style={[wfStyles.wfDropText, isLocked ? wfStyles.wfDropTextForce : null]}
                numberOfLines={1}
              >
                {isLocked ? 'Emergency Duty End' : 'End Duty'}
              </Text>
            </TouchableOpacity>
          )}
          {log?._id && (
            <TouchableOpacity
              style={[wfStyles.wfDropItem, wfStyles.wfDropItemDanger]}
              onPress={() => {
                setMenuOpen(false);
                onDeleteLog(item._id, log._id);
              }}
            >
              <Ionicons name="trash-outline" size={14} color="#ef4444" />
              <Text style={[wfStyles.wfDropText, wfStyles.wfDropTextDanger]} numberOfLines={1}>
                Delete Log
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* Shift Selection Modal */}
      {shiftModalVisible && (
        <Modal
          visible={true}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShiftModalVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: '#f8fafc', paddingTop: insets.top }}>
            {/* Top Navbar */}
            <View
              style={{
                height: 60,
                backgroundColor: COLORS.primary,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
              }}
            >
              <TouchableOpacity
                style={{ padding: 8, marginRight: 8, marginLeft: -8 }}
                onPress={() => setShiftModalVisible(false)}
              >
                <Ionicons name="arrow-back" size={24} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff' }} numberOfLines={1}>
                  Select Shift — {item.name}
                </Text>
                <Text
                  style={{ fontSize: 12, color: '#e2e8f0', fontWeight: '500' }}
                  numberOfLines={1}
                >
                  Shifts configured for {actualLead?.sender_name || 'this site'}
                </Text>
              </View>
            </View>

            {/* Content */}
            <View style={{ flex: 1, padding: 16 }}>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 10,
                  justifyContent: 'center',
                  marginTop: 15,
                }}
              >
                {!actualLead?.siteShifts ||
                actualLead.siteShifts.filter(
                  (s: any) => s.active && isShiftActiveAtTime(s.startTime, s.durationHrs || 8)
                ).length === 0 ? (
                  <Text
                    style={{
                      fontSize: 13,
                      color: '#ef4444',
                      fontWeight: '700',
                      paddingVertical: 20,
                      textAlign: 'center',
                    }}
                  >
                    No shifts are currently active for this site at this time.
                  </Text>
                ) : (
                  actualLead.siteShifts
                    .filter(
                      (s: any) => s.active && isShiftActiveAtTime(s.startTime, s.durationHrs || 8)
                    )
                    .map((s: any) => {
                      const isDaNi = s.groupName === 'DaNi' || s.durationHrs === 12;
                      const shiftColor = isDaNi ? '#7c3aed' : COLORS.primary;
                      const shiftBg = isDaNi ? '#7c3aed15' : COLORS.primary + '15';
                      const timeRangeStr = getShiftTimeRange(s.startTime, s.durationHrs);

                      return (
                        <TouchableOpacity
                          key={s._id || s.shiftCode}
                          style={{
                            width: 80,
                            height: 70,
                            borderRadius: 10,
                            backgroundColor: shiftBg,
                            justifyContent: 'center',
                            alignItems: 'center',
                            borderWidth: 2,
                            borderColor: shiftColor,
                          }}
                          onPress={() => handleSelectShift(s.shiftCode)}
                        >
                          <Text style={{ fontSize: 18, fontWeight: 'bold', color: shiftColor }}>
                            {s.shiftCode}
                          </Text>
                          <Text
                            style={{
                              fontSize: 9,
                              color: '#0f172a',
                              fontWeight: '700',
                              textAlign: 'center',
                            }}
                          >
                            {s.shiftName}
                          </Text>
                          <Text style={{ fontSize: 7, color: '#64748b', textAlign: 'center' }}>
                            {timeRangeStr}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

// ΓöÇΓöÇΓöÇ Main Modal ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
export const AttendanceModal: React.FC<Props> = ({
  visible,
  onClose,
  onComplete,
  leads = [],
  initialLeadId,
  workerToReplaceId,
  workerToReplaceName,
  initialViewType,
}) => {
  const { user } = useUserContext();
  const { refresh: refreshGPS } = useGPSCoordinates();
  const insets = useSafeAreaInsets();
  const isStaff = (user as any)?.role === 'Staff';

  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  // In-flight lock: prevents concurrent taps before React state re-renders
  const inFlight = useRef<Set<string>>(new Set());
  const [addVisible, setAddVisible] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [attendanceMap, setAttendanceMap] = useState<Record<string, any>>({});
  const [rateDialog, setRateDialog] = useState<{
    emp: any;
    resolve: (d: number, m: number) => void;
  } | null>(null);
  const [forceOffTarget, setForceOffTarget] = useState<{ item: any; log: any } | null>(null);
  const [paySheetEmp, setPaySheetEmp] = useState<any>(null);
  const [rateEditEmp, setRateEditEmp] = useState<any>(null);
  const [rateEditVals, setRateEditVals] = useState({ daily: '', monthly: '' });
  const [tick, setTick] = useState<any>({ count: 0, coords: null });
  const [globalOnDuty, setGlobalOnDuty] = useState<Record<string, any>>({});
  const [allAttendance, setAllAttendance] = useState<any[]>([]);
  const [isRepeating, setIsRepeating] = useState(false);
  const [enrollmentBlock, setEnrollmentBlock] = useState<any>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [fastLocation, setFastLocation] = useState<any>(null);

  // Fast location fetch for instant site sorting
  useEffect(() => {
    Location.getLastKnownPositionAsync({ maxAge: 600000 }).then(loc => {
      if (loc) setFastLocation({ lat: loc.coords.latitude, long: loc.coords.longitude });
    }).catch(()=>{});
  }, []);

  const [payRange, setPayRange] = useState({
    start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    end: new Date(),
  });
  const [bankLedgers, setBankLedgers] = useState<any[]>([]);
  const [selectedBankLedgerId, setSelectedBankLedgerId] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [paySheetData, setPaySheetData] = useState<any[]>([]);
  const [existingVoucher, setExistingVoucher] = useState<any>(null);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [viewType, setViewType] = useState<'workerwise' | 'sitewise' | 'shiftwise'>(
    initialViewType || 'workerwise'
  );
  const [workerwiseTab, setWorkerwiseTab] = useState<'off' | 'on'>('off');
  const [expandedSites, setExpandedSites] = useState<Record<string, boolean>>({});
  const [shiftChangeVisible, setShiftChangeVisible] = useState(false);
  const [shiftwiseSortBy, setShiftwiseSortBy] = useState<'worker' | 'client'>('worker');
  const [expandedShifts, setExpandedShifts] = useState<Record<string, boolean>>({});
  const [sessionToken, setSessionToken] = useState('');
  const [siteSearchQuery, setSiteSearchQuery] = useState('');
  const [sitewiseSearchQuery, setSitewiseSearchQuery] = useState('');
  const [showActiveSitesOnly, setShowActiveSitesOnly] = useState(false);
  const [siteDropdownOpen, setSiteDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

  const acceptedLeads =
    leads?.filter((l) => l.status === 'Accepted' || l.status === 'Tax Invoice') || [];
    
  const { nearbySites: filteredAndSortedSites, formatDistance } = useUnifiedLocation('nearBy', {
    sites: acceptedLeads,
    maxDistance: 15000,
    autoRefresh: false,
  });
  
  // Apply fast location sorting if hook hasn't returned yet
  let displaySortedLeads = filteredAndSortedSites.length > 0 ? filteredAndSortedSites : acceptedLeads;
  if (filteredAndSortedSites.length === 0 && fastLocation) {
    const withDist = [...acceptedLeads].map((l: any) => {
      if (l.location?.lat && l.location?.long) {
        const R = 6371e3; // metres
        const φ1 = fastLocation.lat * Math.PI/180; // φ, λ in radians
        const φ2 = l.location.lat * Math.PI/180;
        const Δφ = (l.location.lat-fastLocation.lat) * Math.PI/180;
        const Δλ = (l.location.long-fastLocation.long) * Math.PI/180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const d = R * c; // in metres
        return { ...l, distance: d };
      }
      return l;
    });
    displaySortedLeads = withDist.sort((a, b) => (a.distance || 999999) - (b.distance || 999999));
  }

  const activeLeads = displaySortedLeads.filter(isSiteActiveNow);
  const leadsToUse = activeLeads.length > 0 ? activeLeads : displaySortedLeads;
  const isToday = new Date().toDateString() === selectedDate.toDateString();
  const isEligibleWorker = (emp: any) => {
    if (!emp) return false;
    return !(
      emp.user_id ||
      emp.employeeType === 'userMaster' ||
      ['Admin', 'CorpAdmin', 'userAdmin', 'Sales', 'Project', 'Finance'].includes(emp.role)
    );
  };
  const eligibleEmployees = employees.filter(isEligibleWorker);
  const offDutyWorkerCount = eligibleEmployees.filter((emp) => !globalOnDuty[emp._id]).length;
  const onDutyWorkerCount = eligibleEmployees.filter((emp) => !!globalOnDuty[emp._id]).length;

  useEffect(() => {
    if (visible) {
      if (initialViewType) {
        setViewType(initialViewType);
      }
      getSession().then((s) => {
        if (s?.token) setSessionToken(s.token);
      });
    }
  }, [visible, initialViewType]);

  // Auto-end staff duty if scheduled end time is reached
  useEffect(() => {
    if (!visible || !sessionToken) return;

    const intervalId = setInterval(async () => {
      const now = Date.now();
      const nowISO = new Date().toISOString();
      let hasEndedAny = false;

      const activeLogs = allAttendance.filter(
        (log) => !log.dutyEnd && log.dutyEndScheduled && now >= new Date(log.dutyEndScheduled).getTime()
      );

      const promises = activeLogs.map(async (log) => {
        try {
          console.log(`[AttendanceModal] Auto-ending duty for attendance ID: ${log._id}`);
          const endRes = await appService.httpClient.put(
            `service/hr/attendance/${log._id}`,
            {
              dutyEnd: nowISO,
              forcedOff: true,
              forcedOffReason: 'Auto-End Duty (Time Reached)',
            },
            { headers: { Authorization: `Bearer ${sessionToken}` } }
          );
          if (endRes.data?.success) hasEndedAny = true;
        } catch (err) {
          console.error('[AttendanceModal] Auto-end failed for staff', err);
        }
      });

      await Promise.all(promises);
      if (hasEndedAny) {
        fetchDashboardData();
      }
    }, 60000); // Check every 60 seconds

    return () => clearInterval(intervalId);
  }, [visible, sessionToken, allAttendance]);

  useEffect(() => {
    if (visible && initialLeadId) {
      setSelectedLeadId(initialLeadId);
    } else if (visible && leadsToUse.length > 0 && !selectedLeadId) {
      setSelectedLeadId(leadsToUse[0]._id);
    }
  }, [visible, leadsToUse, initialLeadId]);

  useEffect(() => {
    if (visible && selectedLeadId) fetchDashboardData();
  }, [visible, selectedLeadId, selectedDate]);

  // Phase 2c Real-time: Listen to socket events for live attendance updates
  useEffect(() => {
    if (!visible) return;
    const socket = getSocket();
    if (!socket) return;

    const handleDutyChange = () => {
      fetchDashboardData();
    };

    socket.on('attendance:duty_on', handleDutyChange);
    socket.on('attendance:duty_off', handleDutyChange);
    socket.on('attendance:emergency_end', handleDutyChange);
    socket.on('attendance:double_shift', handleDutyChange);

    return () => {
      socket.off('attendance:duty_on', handleDutyChange);
      socket.off('attendance:duty_off', handleDutyChange);
      socket.off('attendance:emergency_end', handleDutyChange);
      socket.off('attendance:double_shift', handleDutyChange);
    };
  }, [visible, selectedLeadId, selectedDate]);


  useEffect(() => {
    if (paySheetEmp) {
      fetchPaySheetData(paySheetEmp._id);
      fetchBankLedgers();
    }
  }, [paySheetEmp, payRange]);

  const updateTick = async () => {
    let geo: any = null;
    try {
      const data = await refreshGPS();
      if (data) {
        geo = {
          lat: data.latitude,
          long: data.longitude,
          address: data.resolvedName,
        };
      }
    } catch (e) {}

    setTick((t: any) => ({ count: t.count + 1, coords: geo }));

    // ≡ƒÜ¿ OT ALERT CHECK
    const now = new Date();
    Object.values(attendanceMap).forEach((log: any) => {
      if (log && !log.dutyEnd && log.dutyEndScheduled) {
        const sched = new Date(log.dutyEndScheduled);
        const diffMins = (now.getTime() - sched.getTime()) / 60000;
        if (diffMins >= 30) {
          appService.showToast(
            `OT ALERT: ${log.employeeId?.name || 'Worker'}${log.employeeId?.enrollment_no ? ` (${log.employeeId.enrollment_no})` : ''} may be on Overtime at ${log.site_name || 'Site'}`,
            'Info'
          );
        }
      }
    });

    // ≡ƒÜÇ SYNC TO DATABASE: Update geoHistory for all active shifts
    if (geo) {
      const s = await getSession();
      if (!s?.token) return;
      const activeLogs = Object.values(attendanceMap).filter(
        (log: any) => log && !log.dutyEnd && log._id
      );

      for (const log of activeLogs as any[]) {
        try {
          await appService.httpClient.put(
            `service/hr/attendance/${log._id}`,
            {
              $push: { geoHistory: { ...geo, type: 'tick', timestamp: new Date().toISOString() } },
            },
            { headers: { Authorization: `Bearer ${s.token}` } }
          );
        } catch (err) {
          console.warn(`Failed to push geo tick for log ${log._id}`, err);
        }
      }
    }
  };

  // Live timer to update hours worked/locks AND location every 180s (3 mins)
  useEffect(() => {
    let timer: any;
    if (visible) {
      updateTick();
      timer = setInterval(updateTick, 180000);
    }
    return () => clearInterval(timer);
  }, [visible]);

  const getSession = () => appService.getSession();

  const processDashboardData = (data: any, selDateStr: string, prevDateStr: string) => {
    if (data.employees) setEmployees(data.employees);

    const map: Record<string, any> = {};
    const globalOnDutyMap: Record<string, any> = {};

    (data.attendance || []).forEach((log: any) => {
      const logLeadId = typeof log.leadId === 'object' ? log.leadId?._id : log.leadId;
      const empId = typeof log.employeeId === 'object' ? log.employeeId?._id : log.employeeId;
      if (!empId) return;

      // Track Global On-Duty (anyone currently on duty anywhere)
      if (!log.dutyEnd) {
        globalOnDutyMap[empId] = log;
      }

      if (String(logLeadId) !== String(selectedLeadId)) return;
      if (!log.dutyStart) return;

      const dutyStartDateStr = toLocalDateStr(new Date(log.dutyStart));
      const isSelectedDay = dutyStartDateStr === selDateStr;
      const isActive = !log.dutyEnd;
      if (!isSelectedDay && !isActive) return;

      const hours = log.hoursWorked || 0;

      if (!map[empId]) {
        map[empId] = { ...log, totalDayHours: hours, shiftCount: 1 };
      } else {
        // Aggregate
        map[empId].totalDayHours += hours;
        map[empId].shiftCount += 1;

        // Pick active record as the "primary" one for toggle status
        const existingActive = !map[empId].dutyEnd;
        const newActive = !log.dutyEnd;
        if (newActive && !existingActive) {
          // Swap primary but keep aggregates
          const totals = { h: map[empId].totalDayHours, c: map[empId].shiftCount };
          map[empId] = { ...log, totalDayHours: totals.h, shiftCount: totals.c };
        } else if (
          existingActive === newActive &&
          new Date(log.createdAt) > new Date(map[empId].createdAt)
        ) {
          // Keep active or pick newest completed
          const totals = { h: map[empId].totalDayHours, c: map[empId].shiftCount };
          map[empId] = { ...log, totalDayHours: totals.h, shiftCount: totals.c };
        }
      }
    });
    
    setAttendanceMap(map);
    setGlobalOnDuty(globalOnDutyMap);
    if (data.attendance) setAllAttendance(data.attendance);

    // Auto-expand the current site if in sitewise view
    if (selectedLeadId) {
      setExpandedSites((prev: any) => ({ ...prev, [selectedLeadId]: true }));
    }
  };

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const s = await getSession();
      if (!s?.token) return;

      const prevDay = new Date(selectedDate);
      prevDay.setDate(prevDay.getDate() - 1);
      const nextDay = new Date(selectedDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const fromStr = toLocalDateStr(prevDay);
      const toStr = toLocalDateStr(nextDay); // Include full selectedDay
      const selDateStr = toLocalDateStr(selectedDate);

      // --- CACHE LOAD FOR SPEED ---
      const cacheKey = `att_dash_${selectedLeadId}_${fromStr}_${toStr}`;
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          processDashboardData(parsed, selDateStr, fromStr);
          setLoading(false); // Instantly unlock UI
        }
      } catch (e) {}

      const res = await appService.httpClient.get('service/hr/attendance-dashboard', {
        params: { from_date: fromStr, to_date: toStr },
        headers: { Authorization: `Bearer ${s.token}` },
      });

      if (res.data.success) {
        // --- CACHE SAVE ---
        AsyncStorage.setItem(cacheKey, JSON.stringify(res.data)).catch(()=>{});
        processDashboardData(res.data, selDateStr, fromStr);
      }
    } catch (e) {
      console.error('Fetch dashboard data error', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchBankLedgers = async () => {
    try {
      const s = await getSession();
      if (!s?.token) return;
      const res = await appService.httpClient.get('finance/ledgers', {
        headers: { Authorization: `Bearer ${s.token}` },
      });
      if (res.data.success) {
        // Filter for Cash-in-hand, Petty Book, and Bank accounts (all under Cash-in-hand or Bank Accounts)
        const banks = (res.data.data || []).filter(
          (l: any) =>
            l.groupId?.name === 'Cash-in-hand' ||
            l.groupId?.name === 'Bank Accounts' ||
            (l.name && l.name.toLowerCase().includes('petty'))
        );
        setBankLedgers(banks);
        const cashBook = banks.find((l: any) => l.name === 'Cash Book');
        if (cashBook) setSelectedBankLedgerId(cashBook._id);
        else if (banks.length > 0) setSelectedBankLedgerId(banks[0]._id);
      }
    } catch (e: any) {
      console.error('Fetch bank ledgers error', e);
      appService.showToast('Fetch bank ledgers error: ' + (e?.message || e), 'Error');
    }
  };

  const fetchPaySheetData = async (empId: string) => {
    if (!empId || String(empId) === 'undefined' || String(empId) === 'null') return;
    try {
      const s = await getSession();
      if (!s?.token) return;
      const res = await appService.httpClient.get('service/hr/attendance', {
        params: {
          from_date: toLocalDateStr(payRange.start),
          to_date: toLocalDateStr(payRange.end),
          employeeId: empId,
        },
        headers: { Authorization: `Bearer ${s.token}` },
      });
      if (res.data.success) {
        setPaySheetData(res.data.data || []);
      }

      // ≡ƒöì Fetch existing voucher for this month
      const monthStr = payRange.start.toLocaleString('default', { month: 'long', year: 'numeric' });
      const vRes = await appService.httpClient.get('finance/salary/voucher', {
        params: { employeeId: empId, month: monthStr },
        headers: { Authorization: `Bearer ${s.token}` },
      });
      if (vRes.data.success) {
        setExistingVoucher(vRes.data.data);
      }
    } catch (e) {
      console.error('Fetch pay sheet data error', e);
    }
  };

  const handlePostJournal = async (emp: any, amount: number, attendanceIds: string[] = []) => {
    try {
      setIsPosting(true);
      const s = await getSession();
      if (!s?.token) return;
      const monthStr = payRange.start.toLocaleString('default', { month: 'long', year: 'numeric' });
      const res = await appService.httpClient.post(
        'finance/salary/post-journal',
        {
          employeeId: emp._id,
          employeeName: emp.name,
          amount,
          attendanceIds,
          clientId: emp.clientId || null, // Might need to get from lead
          leadId: selectedLeadId,
          month: monthStr,
          locationId: emp.locationId || null,
        },
        { headers: { Authorization: `Bearer ${s.token}` } }
      );

      if (res.data.success) {
        appService.showToast('Journal Entry Posted', 'Success');
      }
    } catch (e: any) {
      Alert.alert('Posting Error', e.response?.data?.message || e.message);
    } finally {
      setIsPosting(false);
    }
  };

  const handlePostPayment = async (emp: any, amount: number) => {
    if (!selectedBankLedgerId) {
      Alert.alert('Error', 'Select Bank/Cash account first');
      return;
    }
    try {
      setIsPosting(true);
      const s = await getSession();
      if (!s?.token) return;
      const monthStr = payRange.start.toLocaleString('default', { month: 'long', year: 'numeric' });
      const res = await appService.httpClient.post(
        'finance/salary/post-payment',
        {
          employeeId: emp._id,
          employeeName: emp.name,
          amount,
          bankLedgerId: selectedBankLedgerId,
          clientId: emp.clientId || null,
          leadId: selectedLeadId,
          month: monthStr,
          locationId: emp.locationId || null,
        },
        { headers: { Authorization: `Bearer ${s.token}` } }
      );

      if (res.data.success) {
        appService.showToast('Payment Entry Recorded', 'Success');
      }
    } catch (e: any) {
      Alert.alert('Payment Error', e.response?.data?.message || e.message);
    } finally {
      setIsPosting(false);
    }
  };

  const handleExportReport = async () => {
    if (!paySheetEmp || paySheetData.length === 0) return;
    try {
      const totalHrs = paySheetData.reduce((acc, l) => {
        let hrs = l.hoursWorked || 0;
        if (hrs === 0 && l.dutyStart && l.dutyEnd)
          hrs = (new Date(l.dutyEnd).getTime() - new Date(l.dutyStart).getTime()) / 3600000;
        return acc + hrs;
      }, 0);
      const totalDue = paySheetData.reduce(
        (acc, l) => acc + (l.status === 'Present' ? l.rate || 0 : 0),
        0
      );

      const rows = paySheetData
        .map((log) => {
          const start = log.dutyStart
            ? new Date(log.dutyStart).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              })
            : '-';
          const end = log.dutyEnd
            ? new Date(log.dutyEnd).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              })
            : '-';
          let hrs = log.hoursWorked || 0;
          if (hrs === 0 && log.dutyStart && log.dutyEnd)
            hrs = (new Date(log.dutyEnd).getTime() - new Date(log.dutyStart).getTime()) / 3600000;
          return `
          <tr>
            <td>${formatToDDMMYYYY(log.date)}</td>
            <td>${log.site_name || '-'}</td>
            <td>${start} - ${end}</td>
            <td style="text-align:center">${hrs.toFixed(1)}</td>
            <td style="text-align:right">Γé╣${(log.status === 'Present' ? log.rate || 0 : 0).toLocaleString()}</td>
          </tr>
        `;
        })
        .join('');

      const html = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 20px; color: #333; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1e293b; padding-bottom: 10px; }
              h1 { margin: 0; color: #1e293b; }
              .info { margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
              th { background-color: #1e293b; color: white; padding: 10px; text-align: left; }
              td { border-bottom: 1px solid #e2e8f0; padding: 10px; }
              .summary { background-color: #f8fafc; font-weight: bold; border-top: 2px solid #1e293b; }
              .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #64748b; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>ATTENDANCE REPORT</h1>
              <p>${formatToDDMMYYYY(payRange.start)} to ${formatToDDMMYYYY(payRange.end)}</p>
            </div>
            <div class="info">
              <p><strong>Employee:</strong> ${paySheetEmp.name}${paySheetEmp.enrollment_no ? ` (${paySheetEmp.enrollment_no})` : ''}</p>
              <p><strong>Lead ID:</strong> ${paySheetEmp._id}</p>
            </div>
            <table>
              <thead>
                <tr>
                  <th>DATE</th>
                  <th>SITE / CLIENT</th>
                  <th>TIMINGS</th>
                  <th style="text-align:center">HRS</th>
                  <th style="text-align:right">DUE (Γé╣)</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
                <tr class="summary">
                  <td colspan="3">TOTAL SUMMARY</td>
                  <td style="text-align:center">${totalHrs.toFixed(1)}</td>
                  <td style="text-align:right">Γé╣${totalDue.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
            <div class="footer">
              <p>Generated via Nex App on ${new Date().toLocaleString()}</p>
            </div>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Attendance_${paySheetEmp.name}`,
        UTI: 'com.adobe.pdf',
      });
    } catch (e: any) {
      Alert.alert('Export Error', e.message);
    }
  };

  const lookupRate = async (employeeId: string, leadId: string): Promise<number | null> => {
    try {
      const s = await getSession();
      if (!s?.token) return null;
      const res = await appService.httpClient.get('service/hr/rate-lookup', {
        params: { employeeId, leadId },
        headers: { Authorization: `Bearer ${s.token}` },
      });
      return res.data.rate;
    } catch {
      return null;
    }
  };

  const askForRate = (emp: any): Promise<{ daily: number; monthly: number }> =>
    new Promise((resolve) =>
      setRateDialog({
        emp,
        resolve: (d, m) => {
          setRateDialog(null);
          resolve({ daily: d, monthly: m });
        },
      })
    );

  const markDuty = async (
    item: any,
    existingLog: any,
    goingOn: boolean,
    forcedOff: boolean,
    reason: string,
    shiftCode?: string,
    customStart?: string,
    customEnd?: string
  ) => {
    if (goingOn && !selectedLeadId) {
      Alert.alert('Required', 'Select a Project Site first.');
      return;
    }

    const empId: string = item._id;
    if (inFlight.current.has(empId)) return;
    inFlight.current.add(empId);

    if (goingOn) {
      const existing = attendanceMap[empId];
      if (existing && !existing.dutyEnd) {
        appService.showToast(
          `${item.name}${item.enrollment_no ? ` (${item.enrollment_no})` : ''} is already ON duty`,
          'Info'
        );
        inFlight.current.delete(empId);
        return;
      }

      // Enrollment Check: Allow only 2 days of work without enrollment number
      if (!item.enrollment_no) {
        const join = item.joinDate
          ? new Date(item.joinDate)
          : item.createdAt
            ? new Date(item.createdAt)
            : new Date();
        const joinDay = new Date(join.getFullYear(), join.getMonth(), join.getDate());
        const today = new Date();
        const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const daysElapsed = Math.floor((currentDay.getTime() - joinDay.getTime()) / 86400000);

        if (daysElapsed >= 2) {
          setEnrollmentBlock(item);
          inFlight.current.delete(empId);
          return;
        }
      }
    }

    setMarking(empId);
    let payload: any = null;
    let putPayload: any = null;
    try {
      let geo: any = null;
      try {
        const loc = await refreshGPS();
        if (loc) {
          geo = { 
            lat: loc.latitude, 
            long: loc.longitude,
            address: loc.formattedAddress || 'Unknown Address'
          };
        }
      } catch (ge) {
        console.warn('Location fetch failed', ge);
      }

      const s = await getSession();
      if (!s?.token) return;
      const nowISO = new Date().toISOString();
      const lead = acceptedLeads.find((l: any) => l._id === selectedLeadId);

      // Determine shift dynamically from lead database
      let finalShiftCode = shiftCode;
      let finalStart = customStart;
      let finalEnd = customEnd;

      if (goingOn) {
        const activeSiteShifts = (lead?.siteShifts || []).filter((s: any) => s.active);
        let matchedShift = activeSiteShifts.find((s: any) => s.shiftCode === finalShiftCode);

        if (!matchedShift && activeSiteShifts.length > 0) {
          // Fallback to shift covering current time
          const now = new Date();
          const nowMinutes = now.getHours() * 60 + now.getMinutes();
          matchedShift = activeSiteShifts.find((s: any) => {
            if (!s.startTime) return false;
            const [sh, sm] = s.startTime.split(':').map(Number);
            const startMins = sh * 60 + sm;
            const endMins = (startMins + (s.durationHrs || 8) * 60) % 1440;
            if (startMins < endMins) {
              return nowMinutes >= startMins && nowMinutes <= endMins;
            } else {
              return nowMinutes >= startMins || nowMinutes <= endMins;
            }
          });
          if (!matchedShift) {
            matchedShift = activeSiteShifts[0];
          }
        }

        if (matchedShift) {
          finalShiftCode = matchedShift.shiftCode;
          const duration = matchedShift.durationHrs || 8;
          const startTimeStr = matchedShift.startTime || '08:00';

          if (!finalStart) {
            let dutyStart = new Date();
            if (startTimeStr) {
              const [sh, sm] = startTimeStr.split(':').map(Number);
              const shiftStartToday = new Date();
              shiftStartToday.setHours(sh, sm, 0, 0);

              const minStart = new Date(shiftStartToday.getTime() - 30 * 60 * 1000);
              const maxStart = new Date(shiftStartToday.getTime() + 30 * 60 * 1000);

              if (new Date() >= minStart && new Date() <= maxStart) {
                dutyStart = shiftStartToday;
              }
            }
            finalStart = dutyStart.toISOString();
          }

          if (!finalEnd && finalStart) {
            const startD = new Date(finalStart);
            finalEnd = new Date(startD.getTime() + duration * 60 * 60 * 1000).toISOString();
          }
        }
      }

      if (goingOn) {
        let rate = await lookupRate(empId, selectedLeadId);
        if (rate === null) {
          const asked = await askForRate(item);
          rate = asked.daily;
        }
        payload = {
          employeeId: empId,
          leadId: selectedLeadId,
          clientId: lead?.clientId || null,
          status: 'Present',
          dutyLevel: 1,
          rate,
          date: nowISO,
          dutyStart: finalStart || nowISO,
          dutyEndScheduled: finalEnd || null,
          shiftCode: finalShiftCode || 'G',
          site_name: lead?.sender_name || lead?.product_name || 'Unknown Site',
          geoHistory: geo ? [{ ...geo, type: 'start', timestamp: nowISO }] : [],
        };
        await appService.httpClient.post(
          'service/hr/attendance',
          payload,
          { headers: { Authorization: `Bearer ${s.token}` } }
        );
        appService.showToast(
          `${item.name}${item.enrollment_no ? ` (${item.enrollment_no})` : ''} is ON duty`,
          'Success'
        );
      } else {
        if (!existingLog?._id) {
          appService.showToast('No active duty record found', 'Error');
          return;
        }
        putPayload = {
          dutyEnd: nowISO,
          forcedOff,
          forcedOffReason: reason || '',
          $push: geo ? { geoHistory: { ...geo, type: 'end', timestamp: nowISO } } : {},
        };
        await appService.httpClient.put(
          `service/hr/attendance/${existingLog._id}`,
          putPayload,
          { headers: { Authorization: `Bearer ${s.token}` } }
        );
        appService.showToast(
          forcedOff ? `${item.name} forced OFF duty` : `${item.name} shift completed`,
          forcedOff ? 'Info' : 'Success'
        );
      }
      await fetchDashboardData();
    } catch (e: any) {
      if (!e.response || e.response.status === 403 || e.response.status === 500) {
        if (goingOn && payload) {
          console.log('[AttendanceModal] Marking offline attendance due to error');
          await logAttendanceToSQLite(payload);
          appService.showToast('Network error or rejected. Attendance saved locally!', 'Info');
        } else if (!goingOn && putPayload) {
          console.log('[AttendanceModal] Marking offline end duty due to error');
          await logAttendanceToSQLite({ ...putPayload, _id: existingLog?._id, method: 'PUT' });
          appService.showToast('Network error. End Duty saved locally!', 'Info');
        } else {
          Alert.alert('Error', e?.response?.data?.message || e.message || 'Failed to update duty');
        }
      } else {
        Alert.alert('Error', e?.response?.data?.message || e.message || 'Failed to update duty');
      }
    } finally {
      inFlight.current.delete(empId);
      setMarking(null);
    }
  };

  const handleRepeatLastDuty = async () => {
    if (!selectedLeadId) {
      Alert.alert('Error', 'Select a site first');
      return;
    }
    try {
      setIsRepeating(true);
      const s = await getSession();
      if (!s?.token) return;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = toLocalDateStr(yesterday);

      const res = await appService.httpClient.get('service/hr/attendance', {
        params: { from_date: yStr, to_date: yStr, leadId: selectedLeadId },
        headers: { Authorization: `Bearer ${s.token}` },
      });

      if (res.data?.success) {
        const lastDayLogs = res.data.data || [];
        const empIds = [
          ...new Set(
            lastDayLogs.map((l: any) =>
              typeof l.employeeId === 'object' ? l.employeeId?._id : l.employeeId
            )
          ),
        ];

        if (empIds.length === 0) {
          appService.showToast('No duty records found for yesterday', 'Info');
          return;
        }

        let count = 0;
        for (const empIdRaw of empIds) {
          const empId = String(empIdRaw);
          const emp = employees.find((e) => e._id === empId);
          if (emp && !attendanceMap[empId] && !globalOnDuty[empId]) {
            await markDuty(emp, null, true, false, '');
            count++;
          }
        }
        appService.showToast(`Auto-assigned ${count} workers matching yesterday's duty`, 'Success');
      }
    } catch (e) {
      console.error('Repeat last duty error', e);
    } finally {
      setIsRepeating(false);
    }
  };

  const deleteLog = async (empId: string, logId: string) => {
    Alert.alert('Remove Log', 'Delete this attendance record?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const s = await getSession();
          if (!s?.token) return;
          await appService.httpClient.delete(`service/hr/attendance/${logId}`, {
            headers: { Authorization: `Bearer ${s.token}` },
          });
          appService.showToast('Record removed', 'Success');
          fetchDashboardData();
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: any }) => (
    <EmployeeCard
      item={item}
      attendanceMap={attendanceMap}
      acceptedLeads={acceptedLeads}
      globalOnDutyLog={globalOnDuty[item._id]}
      isToday={isToday}
      isMarking={marking === item._id}
      onEdit={(emp: any) => {
        setSelectedEmployee(emp);
        setAddVisible(true);
      }}
      onMarkDuty={(
        emp: any,
        log: any,
        on: boolean,
        fo: boolean,
        r: string,
        shiftCode?: string,
        customStart?: string,
        customEnd?: string
      ) => markDuty(emp, log, on, fo, r, shiftCode, customStart, customEnd)}
      onForceOff={(item: any, log: any) => setForceOffTarget({ item, log })}
      onDeleteLog={deleteLog}
      onCall={() => item.mobile && Linking.openURL(`tel:${item.mobile}`)}
      onWhatsApp={() => item.mobile && Linking.openURL(`whatsapp://send?phone=91${item.mobile}`)}
      onPaySheet={(emp: any) => setPaySheetEmp(emp)}
      onRateEdit={(emp: any) => {
        setRateEditEmp(emp);
        const ae =
          (emp.employmentHistory || []).find((e: any) => e.active) ||
          (emp.employmentHistory || []).slice(-1)[0] ||
          null;
        const d = ae?.daily_rate ?? emp.daily_rate ?? 0;
        const m = ae?.monthly_rate ?? emp.monthly_rate ?? Math.round(d * daysInMonth);
        setRateEditVals({ daily: String(d), monthly: String(m) });
      }}
      onUpdateScheduledEnd={handleUpdateScheduledEnd}
      tick={tick}
      selectedDate={selectedDate}
      currentLead={acceptedLeads.find((l) => l._id === selectedLeadId)}
      onRefresh={() => {
        fetchDashboardData();
        updateTick();
      }}
      isStaff={isStaff}
    />
  );

  const handleUpdateScheduledEnd = async (emp: any, log: any, time: Date) => {
    try {
      const s = await getSession();
      if (!s?.token) return;
      const hh = time.getHours().toString().padStart(2, '0');
      const mm = time.getMinutes().toString().padStart(2, '0');
      const timeStr = `${hh}:${mm}`;

      // 1. Update current attendance record
      await appService.httpClient.put(
        `service/hr/attendance/${log._id}`,
        {
          dutyEndScheduled: time.toISOString(),
        },
        { headers: { Authorization: `Bearer ${s.token}` } }
      );

      // 2. Sync to Employee profile for future record defaults
      await appService.httpClient.put(
        `service/hr/employees/${emp._id}`,
        {
          shiftEndTime: timeStr,
        },
        { headers: { Authorization: `Bearer ${s.token}` } }
      );

      appService.showToast('Shift time updated & synced', 'Success');
      fetchDashboardData();
    } catch (e) {
      console.error('Update scheduled end error', e);
    }
  };

  const renderHeader = () => {
    let hiddenSitesCount = 0;
    if (viewType === 'sitewise') {
      const siteGroups: Record<string, any[]> = {};
      Object.values(globalOnDuty).forEach((log: any) => {
        const leadId = typeof log.leadId === 'object' ? log.leadId?._id : log.leadId;
        const rawEmp = log.employeeId;
        const emp =
          rawEmp && typeof rawEmp === 'object'
            ? rawEmp
            : employees.find((e: any) => String(e._id) === String(rawEmp));
        if (!isEligibleWorker(emp)) return;
        if (!siteGroups[leadId]) siteGroups[leadId] = [];
        siteGroups[leadId].push(log);
      });
      acceptedLeads.forEach((l) => {
        if (!siteGroups[l._id] || siteGroups[l._id].length === 0) hiddenSitesCount++;
      });
    }

    return (
      <View
        style={{
          backgroundColor: '#fff',
          borderBottomWidth: 1,
          borderBottomColor: '#f1f5f9',
          paddingBottom: 4,
        }}
      >
        {/* Search & Tabs */}
        <View style={{ paddingHorizontal: 16, paddingTop: 6 }}>
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: '#f1f5f9',
              borderRadius: 24,
              padding: 4,
              marginBottom: 12,
            }}
          >
            <TouchableOpacity
              style={{
                flex: 1,
                height: 40,
                borderRadius: 20,
                backgroundColor: viewType === 'workerwise' ? '#fff' : 'transparent',
                borderWidth: 1,
                borderColor: viewType === 'workerwise' ? COLORS.primary : 'transparent',
                justifyContent: 'center',
                alignItems: 'center',
                flexDirection: 'row',
                gap: 6,
                ...(viewType === 'workerwise'
                  ? { elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3 }
                  : {}),
              }}
              onPress={() => setViewType('workerwise')}
            >
              <Ionicons
                name="people"
                size={18}
                color={viewType === 'workerwise' ? COLORS.primary : '#64748b'}
              />
              <Text
                style={{
                  fontWeight: '700',
                  color: viewType === 'workerwise' ? COLORS.primary : '#64748b',
                  fontSize: 13,
                }}
              >
                Workerwise
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1,
                height: 40,
                borderRadius: 20,
                backgroundColor: viewType === 'sitewise' ? '#fff' : 'transparent',
                borderWidth: 1,
                borderColor: viewType === 'sitewise' ? COLORS.primary : 'transparent',
                justifyContent: 'center',
                alignItems: 'center',
                flexDirection: 'row',
                gap: 6,
                ...(viewType === 'sitewise'
                  ? { elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3 }
                  : {}),
              }}
              onPress={() => setViewType('sitewise')}
            >
              <Ionicons
                name="business"
                size={18}
                color={viewType === 'sitewise' ? COLORS.primary : '#64748b'}
              />
              <Text
                style={{
                  fontWeight: '700',
                  color: viewType === 'sitewise' ? COLORS.primary : '#64748b',
                  fontSize: 13,
                }}
              >
                Sitewise
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1,
                height: 40,
                borderRadius: 20,
                backgroundColor: viewType === 'shiftwise' ? '#fff' : 'transparent',
                borderWidth: 1,
                borderColor: viewType === 'shiftwise' ? COLORS.primary : 'transparent',
                justifyContent: 'center',
                alignItems: 'center',
                flexDirection: 'row',
                gap: 6,
                ...(viewType === 'shiftwise'
                  ? { elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3 }
                  : {}),
              }}
              onPress={() => setViewType('shiftwise')}
            >
              <Ionicons
                name="time"
                size={18}
                color={viewType === 'shiftwise' ? COLORS.primary : '#64748b'}
              />
              <Text
                style={{
                  fontWeight: '700',
                  color: viewType === 'shiftwise' ? COLORS.primary : '#64748b',
                  fontSize: 13,
                }}
              >
                Shiftwise
              </Text>
            </TouchableOpacity>
          </View>

          {viewType === 'workerwise' && (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <TouchableOpacity
                style={wfStyles.wfDateSelector}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar" size={16} color={COLORS.primary} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1e293b' }}>
                  {selectedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </Text>
              </TouchableOpacity>
              <View
                style={{
                  flex: 1,
                  height: 40,
                  backgroundColor: '#f1f5f9',
                  borderRadius: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                }}
              >
                <Ionicons name="search" size={20} color="#94a3b8" />
                <TextInput
                  style={{ flex: 1, marginLeft: 10, fontWeight: '600', color: '#1e293b' }}
                  placeholder="Search workers..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
            </View>
          )}

          {viewType === 'sitewise' && (
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <View
                style={{
                  flex: 1,
                  height: 44,
                  backgroundColor: '#f1f5f9',
                  borderRadius: 22,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                }}
              >
                <Ionicons name="search" size={20} color="#94a3b8" />
                <TextInput
                  style={{ flex: 1, marginLeft: 10, fontWeight: '600', color: '#1e293b' }}
                  placeholder="Search sites/clients..."
                  placeholderTextColor="#94a3b8"
                  value={sitewiseSearchQuery}
                  onChangeText={setSitewiseSearchQuery}
                />
              </View>
              <TouchableOpacity
                onPress={() => setShowActiveSitesOnly(!showActiveSitesOnly)}
                style={{
                  width: 44,
                  height: 44,
                  backgroundColor: '#f8fafc',
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Ionicons
                  name={showActiveSitesOnly ? 'eye-off' : 'eye'}
                  size={22}
                  color={showActiveSitesOnly ? '#dc2626' : COLORS.primary}
                />
                <View
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    backgroundColor: showActiveSitesOnly ? '#ef4444' : '#64748b',
                    borderRadius: 10,
                    minWidth: 20,
                    height: 20,
                    paddingHorizontal: 4,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
                    {showActiveSitesOnly ? hiddenSitesCount : 0}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          {viewType === 'shiftwise' && (
            <View style={{ flexDirection: 'column', gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <TouchableOpacity
                  style={wfStyles.wfDateSelector}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar" size={16} color={COLORS.primary} />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#1e293b' }}>
                    {selectedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </Text>
                </TouchableOpacity>
                <View
                  style={{
                    flex: 1,
                    height: 40,
                    backgroundColor: '#f1f5f9',
                    borderRadius: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: 14,
                  }}
                >
                  <Ionicons name="search" size={20} color="#94a3b8" />
                  <TextInput
                    style={{ flex: 1, marginLeft: 10, fontWeight: '600', color: '#1e293b' }}
                    placeholder="Search workers..."
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <View
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    backgroundColor: '#f1f5f9',
                    borderRadius: 12,
                    padding: 4,
                    height: 48,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setShiftwiseSortBy('worker')}
                    style={{
                      flex: 1,
                      backgroundColor: shiftwiseSortBy === 'worker' ? '#fff' : 'transparent',
                      borderRadius: 8,
                      justifyContent: 'center',
                      alignItems: 'center',
                      shadowColor: shiftwiseSortBy === 'worker' ? '#000' : 'transparent',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.1,
                      shadowRadius: 2,
                      elevation: shiftwiseSortBy === 'worker' ? 2 : 0,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: shiftwiseSortBy === 'worker' ? COLORS.primary : '#64748b',
                      }}
                    >
                      Sort by Worker
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setShiftwiseSortBy('client')}
                    style={{
                      flex: 1,
                      backgroundColor: shiftwiseSortBy === 'client' ? '#fff' : 'transparent',
                      borderRadius: 8,
                      justifyContent: 'center',
                      alignItems: 'center',
                      shadowColor: shiftwiseSortBy === 'client' ? '#000' : 'transparent',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.1,
                      shadowRadius: 2,
                      elevation: shiftwiseSortBy === 'client' ? 2 : 0,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: shiftwiseSortBy === 'client' ? COLORS.primary : '#64748b',
                      }}
                    >
                      Sort by Client
                    </Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={() => setShiftChangeVisible(true)}
                  style={{
                    height: 48,
                    backgroundColor: COLORS.primary,
                    paddingHorizontal: 16,
                    borderRadius: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Ionicons name="swap-horizontal" size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Handover</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Site Selector (Only in Workerwise) */}
        {viewType === 'workerwise' && (
          <View style={{ marginTop: 6, paddingHorizontal: 16, zIndex: 10 }}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                setSiteDropdownOpen(!siteDropdownOpen);
                setSiteSearchQuery('');
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#f1f5f9',
                borderRadius: 12,
                paddingHorizontal: 16,
                height: 40,
                borderWidth: 1,
                borderColor: siteDropdownOpen ? COLORS.primary : '#e2e8f0',
              }}
            >
              <Text style={{ flex: 1, fontSize: 15, color: '#0f172a', fontWeight: '600' }}>
                {acceptedLeads.find((l) => l._id === selectedLeadId)?.sender_name ||
                  'Select a site...'}
              </Text>
              <Ionicons
                name={siteDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#64748b"
              />
            </TouchableOpacity>

            {siteDropdownOpen && (
              <View
                style={{
                  marginTop: 8,
                  backgroundColor: '#fff',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  padding: 8,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.1,
                  shadowRadius: 12,
                  elevation: 4,
                  maxHeight: 300,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#f8fafc',
                    borderRadius: 12,
                    paddingHorizontal: 10,
                    height: 40,
                    marginBottom: 8,
                  }}
                >
                  <Ionicons name="search" size={16} color="#94a3b8" style={{ marginRight: 6 }} />
                  <TextInput
                    style={{ flex: 1, fontSize: 14, color: '#334155' }}
                    placeholder="Search site..."
                    placeholderTextColor="#94a3b8"
                    value={siteSearchQuery}
                    onChangeText={setSiteSearchQuery}
                    autoFocus
                  />
                </View>

                <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 240 }}>
                  {(siteSearchQuery ? acceptedLeads : leadsToUse)
                    .filter((l: any) =>
                      l.sender_name?.toLowerCase().includes(siteSearchQuery.toLowerCase())
                    )
                    .map((l: any) => {
                      const isSelected = selectedLeadId === l._id;
                      return (
                        <TouchableOpacity
                          key={l._id}
                          onPress={() => {
                            setSelectedLeadId(l._id);
                            setSiteDropdownOpen(false);
                            setSiteSearchQuery('');
                          }}
                          style={{
                            paddingVertical: 8,
                            paddingHorizontal: 16,
                            borderRadius: 20, // Rounded site names
                            backgroundColor: isSelected ? COLORS.primary + '15' : 'transparent',
                            marginBottom: 4,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 14,
                              fontWeight: isSelected ? '800' : '500',
                              color: isSelected ? COLORS.primary : '#334155',
                            }}
                          >
                            {l.sender_name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                </ScrollView>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const renderSitewise = () => {
    const siteGroups: Record<string, any[]> = {};
    Object.values(globalOnDuty).forEach((log: any) => {
      const leadId = typeof log.leadId === 'object' ? log.leadId?._id : log.leadId;
      const rawEmp = log.employeeId;
      const emp =
        rawEmp && typeof rawEmp === 'object'
          ? rawEmp
          : employees.find((e: any) => String(e._id) === String(rawEmp));
      if (!isEligibleWorker(emp)) return;
      if (!siteGroups[leadId]) siteGroups[leadId] = [];
      siteGroups[leadId].push(log);
    });

    const activeWorkerCountFor = (lead: any) => siteGroups[lead._id]?.length || 0;

    let displayLeads = [...acceptedLeads];

    if (sitewiseSearchQuery) {
      displayLeads = displayLeads.filter((l) =>
        l.sender_name?.toLowerCase().includes(sitewiseSearchQuery.toLowerCase())
      );
    }

    if (showActiveSitesOnly) {
      displayLeads = displayLeads.filter((l) => activeWorkerCountFor(l) > 0);
    }

    displayLeads.sort((a, b) => {
      const aWorkers = activeWorkerCountFor(a);
      const bWorkers = activeWorkerCountFor(b);
      if (!showActiveSitesOnly && aWorkers !== bWorkers) {
        if (aWorkers === 0) return -1;
        if (bWorkers === 0) return 1;
      }
      return (a.sender_name || '').localeCompare(b.sender_name || '');
    });

    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {displayLeads.map((lead, index) => {
          const workers = siteGroups[lead._id] || [];
          const isExpanded = expandedSites[lead._id];
          let workerSerial = 1;

          const siteShifts = Array.isArray(lead.siteShifts) ? lead.siteShifts.filter((s: any) => s.active !== false) : [];
          const assignedWorkers = new Set();
          
          const formatTime = (iso: string) => {
            if (!iso) return '';
            return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          };

          const renderWorkerLog = (log: any, sNo: number, isOther = false) => (
            <View key={log._id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#f1f5f9', overflow: 'hidden', marginRight: 8 }}>
                {log.employeeId?.photo_url ? (
                  <Image source={{ uri: log.employeeId.photo_url }} style={{ width: '100%', height: '100%' }} />
                ) : (
                  <Ionicons name="person" size={16} color="#cbd5e1" style={{ alignSelf: 'center', marginTop: 4 }} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1e293b' }}>
                  {index + 1}.{sNo}. {log.employeeId?.name || 'Worker'} <Text style={{ fontWeight: '400', color: isOther ? '#64748b' : '#3b82f6' }}>({log.shiftCode})</Text>
                </Text>
                <Text style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                  Duty: {formatTime(log.dutyStart)} - {formatTime(log.dutyEndScheduled) || 'Ongoing'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => markDuty(log.employeeId, log, false, false, '')}
                style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#fee2e2', borderRadius: 8, borderWidth: 1, borderColor: '#fca5a5' }}
              >
                <Text style={{ fontSize: 9, fontWeight: '800', color: '#ef4444' }}>END DUTY</Text>
              </TouchableOpacity>
            </View>
          );

          return (
            <View
              key={lead._id}
              style={{
                backgroundColor: '#fff',
                borderRadius: 20,
                borderWidth: 1,
                borderColor: '#e2e8f0',
                overflow: 'hidden',
                elevation: 2,
                shadowColor: '#000',
                shadowOpacity: 0.05,
                shadowRadius: 5,
                marginBottom: 12,
              }}
            >
              <TouchableOpacity
                onPress={() =>
                  setExpandedSites((prev) => ({ ...prev, [lead._id]: !prev[lead._id] }))
                }
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  backgroundColor: isExpanded ? COLORS.primary + '05' : '#fff',
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    backgroundColor: COLORS.primary + '15',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginRight: 12,
                  }}
                >
                  <Ionicons name="business" size={24} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>
                    {index + 1}. {lead.sender_name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: workers.length === 0 ? '#dc2626' : '#16a34a',
                      fontWeight: '700',
                      marginTop: 2,
                    }}
                  >
                    {workers.length} Workers on Duty
                  </Text>
                </View>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color="#94a3b8"
                />
              </TouchableOpacity>

              {isExpanded && (
                <View
                  style={{
                    padding: 10,
                    backgroundColor: '#f8fafc',
                    borderTopWidth: 1,
                    borderTopColor: '#f1f5f9',
                  }}
                >
                  {siteShifts.length === 0 && workers.length === 0 ? (
                    <Text style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13, fontStyle: 'italic' }}>
                      No workers currently on duty and no shifts configured.
                    </Text>
                  ) : (
                    <View style={{ gap: 12 }}>
                      {siteShifts.map((shift: any, sIdx: number) => {
                        const shiftWorkers = workers.filter(w => w.shiftCode === shift.shiftCode);
                        shiftWorkers.forEach(w => assignedWorkers.add(w._id));
                        const workerSlots = shift.workerSlots || 1;
                        
                        return (
                          <View key={shift._id || sIdx} style={{ backgroundColor: '#fff', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, justifyContent: 'space-between' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={{ backgroundColor: COLORS.primary + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                                  <Text style={{ fontSize: 10, fontWeight: '900', color: COLORS.primary }}>
                                    {shift.shiftCode}
                                  </Text>
                                </View>
                                <Text style={{ fontSize: 11, color: '#475569', fontWeight: '700' }}>
                                  {shift.shiftName} ({shift.durationHrs || 8} Hrs)
                                </Text>
                              </View>
                              <Text style={{ fontSize: 10, color: shiftWorkers.length >= workerSlots ? '#16a34a' : '#ef4444', fontWeight: '700' }}>
                                {shiftWorkers.length} / {workerSlots} Covered
                              </Text>
                            </View>
                            
                            <Text style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8, fontStyle: 'italic' }}>
                              Expected: {shift.startTime || '-'} for {shift.durationHrs || 8} Hrs
                            </Text>

                            {shiftWorkers.length === 0 ? (
                              <Text style={{ fontSize: 11, color: '#dc2626', fontStyle: 'italic', paddingVertical: 4 }}>Unfilled Shift Slot(s)</Text>
                            ) : (
                              <View style={{ gap: 6 }}>
                                {shiftWorkers.map(log => {
                                  const sNo = workerSerial++;
                                  return renderWorkerLog(log, sNo, false);
                                })}
                              </View>
                            )}
                          </View>
                        );
                      })}

                      {/* Other Workers */}
                      {workers.filter(w => !assignedWorkers.has(w._id)).length > 0 && (
                        <View style={{ backgroundColor: '#fff', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#64748b', marginBottom: 6 }}>Other Active Workers</Text>
                          <View style={{ gap: 6 }}>
                            {workers.filter(w => !assignedWorkers.has(w._id)).map(log => {
                              const sNo = workerSerial++;
                              return renderWorkerLog(log, sNo, true);
                            })}
                          </View>
                        </View>
                      )}
                    </View>
                  )}

                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  const renderShiftwise = () => {
    const normalizeShiftCode = (c: string): string => {
      const trimmed = (c || '').trim();
      if (['D', 'Day'].includes(trimmed)) return 'D';
      if (['N2', 'Night2', 'Night12'].includes(trimmed)) return 'N2';
      if (['M', 'Morning'].includes(trimmed)) return 'M';
      if (['A', 'Afternoon'].includes(trimmed)) return 'A';
      if (['N', 'Night', 'Night1'].includes(trimmed)) return 'N';
      if (['G', 'General'].includes(trimmed)) return 'G';
      return trimmed;
    };

    const shiftGroups: Record<string, any[]> = {};

    // 1. First, populate all shift codes that are actively running right now across all accepted sites
    acceptedLeads.forEach((lead) => {
      if (lead.siteShifts) {
        lead.siteShifts.forEach((s: any) => {
          if (s.active && isShiftActiveAtTime(s.startTime, s.durationHrs || 8)) {
            const code = normalizeShiftCode(s.shiftCode || 'G');
            if (!shiftGroups[code]) shiftGroups[code] = [];
          }
        });
      }
    });

    // 2. Then, populate any workers who are currently on duty (even if their shift time has ended)
    Object.values(globalOnDuty).forEach((log: any) => {
      const rawCode = log.shiftCode || 'G';
      const code = normalizeShiftCode(rawCode);
      if (!shiftGroups[code]) shiftGroups[code] = [];
      shiftGroups[code].push(log);
    });

    const SHIFT_NAMES: Record<string, string> = {
      D: 'Day Shift (12 hrs)',
      N2: 'Night Shift (12 hrs)',
      M: 'Morning Shift (8 hrs)',
      A: 'Afternoon Shift (8 hrs)',
      N: 'Night Shift (8 hrs)',
      G: 'General Shift (8 hrs)',
    };
    const SHIFT_COLORS: Record<string, string> = {
      D: '#f59e0b',
      N2: '#3b82f6',
      M: '#10b981',
      A: '#f97316',
      N: '#6366f1',
      G: '#64748b',
    };

    const allCodes = Object.keys(shiftGroups).sort();

    if (allCodes.length === 0) {
      return (
        <View style={{ padding: 50, alignItems: 'center' }}>
          <Ionicons name="time-outline" size={40} color="#ccc" />
          <Text style={{ color: '#94a3b8', marginTop: 8, fontWeight: '600', fontSize: 13 }}>
            No active staff on duty.
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={allCodes}
        keyExtractor={(code) => code.toString()}
        contentContainerStyle={{ padding: 16, paddingBottom: 30, gap: 16 }}
        renderItem={({ item: code }) => {
          const workers = shiftGroups[code];
          let displayWorkers = [...workers];

          // Apply search
          if (searchQuery) {
            const q = searchQuery.toLowerCase();
            displayWorkers = displayWorkers.filter((log) => {
              const empName = log.employeeId?.name || '';
              return empName.toLowerCase().includes(q);
            });
          }

          // Apply sort
          displayWorkers.sort((a, b) => {
            if (shiftwiseSortBy === 'client') {
              const leadA = acceptedLeads.find((l) => l._id === a.leadId) || a.leadId || {};
              const leadB = acceptedLeads.find((l) => l._id === b.leadId) || b.leadId || {};
              const clientA = leadA.client_name || '';
              const clientB = leadB.client_name || '';
              return clientA.localeCompare(clientB);
            } else {
              const nameA = a.employeeId?.name || '';
              const nameB = b.employeeId?.name || '';
              return nameA.localeCompare(nameB);
            }
          });

          if (searchQuery && displayWorkers.length === 0) return null;

          const displayName = SHIFT_NAMES[code] || `Shift: ${code}`;
          const shiftColor = SHIFT_COLORS[code] || COLORS.primary;
          const isExpanded = expandedShifts[code] ?? true;

          return (
            <View
              key={code}
              style={{
                backgroundColor: '#fff',
                borderRadius: 16,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: isExpanded ? shiftColor : '#e2e8f0',
                marginBottom: 16,
              }}
            >
              {/* Shift Header Toggle */}
              <TouchableOpacity
                onPress={() => setExpandedShifts((prev) => ({ ...prev, [code]: !prev[code] }))}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  backgroundColor: isExpanded ? shiftColor + '05' : '#fff',
                }}
                activeOpacity={0.7}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12, flex: 1 }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      backgroundColor: shiftColor + '15',
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginRight: 12,
                    }}
                  >
                    <Ionicons name="time" size={24} color={shiftColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>
                      {displayName}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#15803d', fontWeight: '800' }}>
                      {workers.length} {workers.length === 1 ? 'Worker' : 'Workers'} on Duty
                    </Text>
                  </View>
                </View>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={24}
                  color={shiftColor}
                />
              </TouchableOpacity>

              {/* Workers List */}
              {isExpanded && (
                <View style={{ padding: 12, backgroundColor: '#fff' }}>
                  <View style={{ gap: 10 }}>
                    {displayWorkers.map((log: any) => {
                      const emp = log.employeeId || {};
                      const lead =
                        acceptedLeads.find((l) => l._id === log.leadId) || log.leadId || {};
                      return (
                        <View
                          key={log._id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            padding: 12,
                            backgroundColor: '#f8fafc',
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: '#f1f5f9',
                          }}
                        >
                          <View
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 20,
                              backgroundColor: '#e2e8f0',
                              marginRight: 12,
                              overflow: 'hidden',
                            }}
                          >
                            {emp.photo ? (
                              <Image
                                source={{ uri: emp.photo }}
                                style={{ width: '100%', height: '100%' }}
                              />
                            ) : (
                              <Ionicons
                                name="person"
                                size={20}
                                color="#94a3b8"
                                style={{ alignSelf: 'center', marginTop: 10 }}
                              />
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: '#1e293b' }}>
                              {emp.name || 'Worker Name'}
                            </Text>
                            <Text
                              style={{
                                fontSize: 11,
                                color: '#64748b',
                                fontWeight: '600',
                                marginTop: 2,
                              }}
                              numberOfLines={1}
                            >
                              {lead.client_name || lead.sender_name || 'Site Unknown'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => markDuty(emp, log, false, false, '')}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              backgroundColor: '#fee2e2',
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: '#fca5a5',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 9,
                                fontWeight: '800',
                                color: '#ef4444',
                              }}
                            >
                              END DUTY
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          );
        }}
      />
    );
  };



  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={{ flex: 1, backgroundColor: '#f8fafc', paddingTop: insets.top }}>
        {/* Top Navbar */}
        <View
          style={{
            height: 60,
            backgroundColor: COLORS.primary,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
          }}
        >
          <TouchableOpacity
            onPress={onClose}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.2)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#fff' }}>
              Attendance Manager
            </Text>
            <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '800' }}>
              {selectedDate.toDateString()}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setAddVisible(true)}
            style={{
              backgroundColor: 'rgba(255,255,255,0.2)',
              width: 40,
              height: 40,
              borderRadius: 12,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Ionicons name="person-add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {renderHeader()}

        <View style={{ flex: 1 }}>
          {viewType === 'sitewise' ? (
            renderSitewise()
          ) : viewType === 'shiftwise' ? (
            renderShiftwise()
          ) : (
            <View style={{ flex: 1 }}>
              <View
                style={{
                  flexDirection: 'row',
                  marginHorizontal: 12,
                  marginBottom: 8,
                  backgroundColor: '#f1f5f9',
                  borderRadius: 8,
                  padding: 2,
                }}
              >
                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 6,
                    alignItems: 'center',
                    borderRadius: 6,
                    backgroundColor: workerwiseTab === 'off' ? '#fff' : 'transparent',
                    shadowColor: workerwiseTab === 'off' ? '#000' : 'transparent',
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    elevation: workerwiseTab === 'off' ? 2 : 0,
                  }}
                  onPress={() => setWorkerwiseTab('off')}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: workerwiseTab === 'off' ? '#dc2626' : '#64748b',
                    }}
                  >
                    Off Duty ({offDutyWorkerCount})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 6,
                    alignItems: 'center',
                    borderRadius: 6,
                    backgroundColor: workerwiseTab === 'on' ? '#fff' : 'transparent',
                    shadowColor: workerwiseTab === 'on' ? '#000' : 'transparent',
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    elevation: workerwiseTab === 'on' ? 2 : 0,
                  }}
                  onPress={() => setWorkerwiseTab('on')}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: workerwiseTab === 'on' ? '#16a34a' : '#64748b',
                    }}
                  >
                    On Duty ({onDutyWorkerCount})
                  </Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={eligibleEmployees
                  .filter((emp) => {
                    const isActive = !!globalOnDuty[emp._id];
                    if (workerwiseTab === 'on' && !isActive) return false;
                    if (workerwiseTab === 'off' && isActive) return false;

                    if (!searchQuery) return true;
                    const q = searchQuery.toLowerCase();
                    return (
                      emp.name?.toLowerCase().includes(q) ||
                      emp.mobile?.includes(q) ||
                      emp.enrollment_no?.toLowerCase().includes(q)
                    );
                  })
                  .sort((a, b) => {
                    const aActive = !!globalOnDuty[a._id];
                    const bActive = !!globalOnDuty[b._id];
                    if (aActive && !bActive) return -1;
                    if (!aActive && bActive) return 1;
                    return (a.name || '').localeCompare(b.name || '');
                  })}
                keyExtractor={(i) => i._id}
                renderItem={({ item }) => (
                  <EmployeeCard
                    item={item}
                    attendanceMap={attendanceMap}
                    acceptedLeads={acceptedLeads}
                    globalOnDutyLog={globalOnDuty[item._id]}
                    isToday={isToday}
                    isMarking={marking === item._id}
                    onEdit={(emp: any) => {
                      setSelectedEmployee(emp);
                      setAddVisible(true);
                    }}
                    onMarkDuty={markDuty}
                    onForceOff={(item: any, log: any) => setForceOffTarget({ item, log })}
                    onDeleteLog={deleteLog}
                    onCall={() => item.mobile && Linking.openURL(`tel:${item.mobile}`)}
                    onWhatsApp={() =>
                      item.mobile && Linking.openURL(`whatsapp://send?phone=91${item.mobile}`)
                    }
                    onPaySheet={(emp: any) => setPaySheetEmp(emp)}
                    onRateEdit={(emp: any) => {
                      setRateEditEmp(emp);
                      const d = emp.daily_rate || 0;
                      const m = emp.monthly_rate || Math.round(d * daysInMonth);
                      setRateEditVals({ daily: String(d), monthly: String(m) });
                    }}
                    onUpdateScheduledEnd={handleUpdateScheduledEnd}
                    tick={tick}
                    selectedDate={selectedDate}
                    currentLead={acceptedLeads.find((l) => l._id === selectedLeadId)}
                    onRefresh={() => {
                      fetchDashboardData();
                      updateTick();
                    }}
                    isStaff={isStaff}
                  />
                )}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12, paddingTop: 8 }}
                ListEmptyComponent={
                  <View style={{ padding: 50, alignItems: 'center' }}>
                    <Ionicons name="people-outline" size={40} color="#ccc" />
                    <Text
                      style={{ color: '#94a3b8', marginTop: 8, fontWeight: '600', fontSize: 13 }}
                    >
                      No workers found.
                    </Text>
                  </View>
                }
              />
            </View>
          )}

          <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
            <TouchableOpacity style={GS.btnSecondary} onPress={onClose}>
              <Text style={GS.btnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>

        <AddEmployeeModal
          visible={addVisible}
          onClose={() => setAddVisible(false)}
          onComplete={fetchDashboardData}
          employee={selectedEmployee}
        />

        {rateDialog && (
          <RateDialog
            visible
            employee={rateDialog.emp}
            onSave={(d: number, m: number) => rateDialog.resolve(d, m)}
            onClose={() => {
              rateDialog.resolve(0, 0);
              setRateDialog(null);
            }}
          />
        )}

        {/* ── Rate Edit Modal ── */}
        <Modal visible={!!rateEditEmp} transparent animationType="fade">
          <View
            style={[wfStyles.wfOverlay, { paddingTop: insets.top, backgroundColor: '#f8fafc' }]}
          >
            <View style={wfStyles.wfDialogCard}>
              {/* Header */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  backgroundColor: COLORS.primary,
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: 0.3 }}
                  >
                    Update Rate
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: 'rgba(255,255,255,0.85)',
                      fontWeight: '600',
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                  >
                    {rateEditEmp?.name}{' '}
                    {rateEditEmp?.enrollment_no ? `(${rateEditEmp.enrollment_no})` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setRateEditEmp(null)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: 'rgba(255,255,255,0.15)',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={{ padding: 16 }}>
                <Text
                  style={{ fontSize: 14, color: '#64748b', fontWeight: '700', marginBottom: 16 }}
                >
                  Month = {daysInMonth} days
                </Text>

                <Text
                  style={{ fontSize: 13, color: '#1e293b', fontWeight: '800', marginBottom: 6 }}
                >
                  Monthly Rate (₹)
                </Text>
                <TextInput
                  style={{
                    backgroundColor: '#f8fafc',
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    height: 48,
                    fontSize: 16,
                    fontWeight: '700',
                    color: '#0f172a',
                    marginBottom: 16,
                  }}
                  keyboardType="numeric"
                  value={rateEditVals.monthly}
                  onChangeText={(v) =>
                    setRateEditVals({ monthly: v, daily: (+v / daysInMonth).toFixed(2) })
                  }
                />

                <Text
                  style={{ fontSize: 13, color: '#1e293b', fontWeight: '800', marginBottom: 6 }}
                >
                  Daily Rate (₹) (auto)
                </Text>
                <TextInput
                  style={{
                    backgroundColor: '#f8fafc',
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    height: 48,
                    fontSize: 16,
                    fontWeight: '700',
                    color: '#0f172a',
                  }}
                  keyboardType="numeric"
                  value={rateEditVals.daily}
                  onChangeText={(v) =>
                    setRateEditVals({ daily: v, monthly: String(Math.round(+v * daysInMonth)) })
                  }
                />

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      height: 48,
                      borderRadius: 8,
                      backgroundColor: '#f1f5f9',
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                    onPress={() => setRateEditEmp(null)}
                  >
                    <Text style={{ color: '#64748b', fontWeight: '800', fontSize: 14 }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      height: 48,
                      borderRadius: 8,
                      backgroundColor: COLORS.primary,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                    onPress={async () => {
                      const sess = await appService.getSession();
                      if (!sess?.token) return;
                      const newDaily = parseFloat(rateEditVals.daily) || 0;
                      const newMonthly = parseFloat(rateEditVals.monthly) || 0;

                      // Build updated history: close current active, append new entry
                      const existing: any[] = rateEditEmp.employmentHistory || [];
                      const ae = existing.find((e: any) => e.active) || null;
                      let updatedHistory;
                      if (ae) {
                        updatedHistory = existing.map((e: any) =>
                          e.active ? { ...e, active: false, endDate: new Date() } : e
                        );
                        updatedHistory.push({
                          joinDate: new Date(),
                          daily_rate: newDaily,
                          monthly_rate: newMonthly,
                          shiftStartTime: ae.shiftStartTime || '',
                          shiftHours: ae.shiftHours || 8,
                          active: true,
                        });
                      } else {
                        updatedHistory = [
                          {
                            joinDate: new Date(),
                            daily_rate: newDaily,
                            monthly_rate: newMonthly,
                            shiftStartTime: '',
                            shiftHours: 8,
                            active: true,
                          },
                        ];
                      }

                      await appService.httpClient.put(
                        `service/hr/employees/${rateEditEmp._id}`,
                        {
                          daily_rate: newDaily,
                          monthly_rate: newMonthly,
                          employmentHistory: updatedHistory,
                        },
                        { headers: { Authorization: `Bearer ${sess.token}` } }
                      );
                      appService.showToast('Rate updated & new history entry added', 'Success');
                      setRateEditEmp(null);
                      fetchDashboardData();
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Save Rate</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </Modal>

        {/* ΓöÇΓöÇ Payment Sheet Modal ΓöÇΓöÇ */}
        <Modal visible={!!paySheetEmp} transparent animationType="slide">
          <View
            style={[wfStyles.wfOverlay, { paddingTop: insets.top, backgroundColor: '#f8fafc' }]}
          >
            <View style={wfStyles.wfDialogCard}>
              {/* Header */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  backgroundColor: COLORS.primary,
                  borderTopLeftRadius: 12,
                  borderTopRightRadius: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: 0.3 }}
                  >
                    Payment Sheet
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      color: 'rgba(255,255,255,0.85)',
                      fontWeight: '600',
                      marginTop: 2,
                    }}
                    numberOfLines={1}
                  >
                    {paySheetEmp?.name}{' '}
                    {paySheetEmp?.enrollment_no ? `(${paySheetEmp.enrollment_no})` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setPaySheetEmp(null);
                    setPaySheetData([]);
                  }}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: 'rgba(255,255,255,0.15)',
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <Ionicons name="close" size={20} color="#fff" />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 16 }}
              >
                {/* Date Range Picker */}
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: 12,
                      backgroundColor: '#f8fafc',
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                    }}
                    onPress={() => setShowStartPicker(true)}
                  >
                    <Text
                      style={{ fontSize: 11, color: '#64748b', fontWeight: '800', marginBottom: 2 }}
                    >
                      FROM
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#1e293b' }}>
                      {payRange.start.toLocaleDateString('en-IN')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      padding: 12,
                      backgroundColor: '#f8fafc',
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                    }}
                    onPress={() => setShowEndPicker(true)}
                  >
                    <Text
                      style={{ fontSize: 11, color: '#64748b', fontWeight: '800', marginBottom: 2 }}
                    >
                      TO
                    </Text>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#1e293b' }}>
                      {payRange.end.toLocaleDateString('en-IN')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {showStartPicker && (
                  <DateTimePicker
                    value={payRange.start}
                    mode="date"
                    display="default"
                    onChange={(_, d) => {
                      setShowStartPicker(false);
                      if (d) setPayRange((r) => ({ ...r, start: d }));
                    }}
                  />
                )}
                {showEndPicker && (
                  <DateTimePicker
                    value={payRange.end}
                    mode="date"
                    display="default"
                    onChange={(_, d) => {
                      setShowEndPicker(false);
                      if (d) setPayRange((r) => ({ ...r, end: d }));
                    }}
                  />
                )}

                {/* Calculation Summary */}
                {paySheetEmp &&
                  (() => {
                    const empLogs = paySheetData;
                    const unpostedLogs = empLogs.filter((l: any) => !l.isPosted);
                    const postedLogs = empLogs.filter((l: any) => l.isPosted);

                    const totalDays = unpostedLogs.filter(
                      (l: any) => l.status === 'Present'
                    ).length;
                    const totalHrs = unpostedLogs.reduce((acc: number, l: any) => {
                      let hrs = l.hoursWorked || 0;
                      if (hrs === 0 && l.dutyStart && l.dutyEnd) {
                        hrs =
                          (new Date(l.dutyEnd).getTime() - new Date(l.dutyStart).getTime()) /
                          3600000;
                      }
                      return acc + hrs;
                    }, 0);

                    // Resolve rate from active employment history entry, then log rates, then flat field
                    const ae =
                      (paySheetEmp.employmentHistory || []).find((e: any) => e.active) ||
                      (paySheetEmp.employmentHistory || []).slice(-1)[0] ||
                      null;
                    const maxLogRate = Math.max(0, ...unpostedLogs.map((l: any) => l.rate || 0));
                    const dailyRate = ae?.daily_rate || paySheetEmp.daily_rate || maxLogRate || 0;
                    const salary = totalDays * dailyRate;

                    const unpostedIds = unpostedLogs.map((l: any) => l._id);

                    // ≡ƒöì Existing Voucher Check
                    const voucherAmount =
                      existingVoucher?.entries?.reduce(
                        (acc: number, e: any) => acc + (e.debit || e.credit || 0),
                        0
                      ) / 2 || 0;
                    const isMismatch = existingVoucher && Math.abs(voucherAmount - salary) > 1; // Tolerance 1 INR
                    const isPerfect = existingVoucher && !isMismatch;

                    return (
                      <View>
                        <View
                          style={{
                            padding: 16,
                            backgroundColor: isMismatch ? '#fff7ed' : '#f0fdf4',
                            borderRadius: 12,
                            marginBottom: 20,
                          }}
                        >
                          {/* View Report Button */}
                          <TouchableOpacity
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 8,
                              backgroundColor: '#fff',
                              paddingVertical: 12,
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: isMismatch ? '#fdba74' : '#dcfce7',
                              marginBottom: 16,
                              shadowColor: '#000',
                              shadowOffset: { width: 0, height: 1 },
                              shadowOpacity: 0.05,
                              shadowRadius: 2,
                              elevation: 2,
                            }}
                            onPress={() => setReportVisible(true)}
                          >
                            <Ionicons
                              name="document-text"
                              size={18}
                              color={isMismatch ? '#f97316' : '#16a34a'}
                            />
                            <Text
                              style={{
                                color: isMismatch ? '#f97316' : '#16a34a',
                                fontWeight: '800',
                                fontSize: 14,
                              }}
                            >
                              View Detailed Report
                            </Text>
                          </TouchableOpacity>

                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              marginBottom: 8,
                            }}
                          >
                            <Text
                              style={{
                                color: isMismatch ? '#f97316' : '#16a34a',
                                fontWeight: '700',
                                fontSize: 14,
                              }}
                            >
                              Days Present (Unposted)
                            </Text>
                            <Text style={{ fontWeight: '800', color: '#111827', fontSize: 15 }}>
                              {totalDays} days
                            </Text>
                          </View>
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              marginBottom: 8,
                            }}
                          >
                            <Text
                              style={{
                                color: isMismatch ? '#f97316' : '#16a34a',
                                fontWeight: '700',
                                fontSize: 14,
                              }}
                            >
                              Total Hours
                            </Text>
                            <Text style={{ fontWeight: '800', color: '#111827', fontSize: 15 }}>
                              {totalHrs.toFixed(1)} hrs
                            </Text>
                          </View>
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              marginBottom: 8,
                            }}
                          >
                            <Text
                              style={{
                                color: isMismatch ? '#f97316' : '#16a34a',
                                fontWeight: '700',
                                fontSize: 14,
                              }}
                            >
                              Daily Rate
                            </Text>
                            <Text style={{ fontWeight: '800', color: '#111827', fontSize: 15 }}>
                              ₹{dailyRate}/day
                            </Text>
                          </View>
                          <View
                            style={{
                              height: 1,
                              backgroundColor: isMismatch ? '#fed7aa' : '#dcfce7',
                              marginVertical: 12,
                            }}
                          />
                          <View
                            style={{
                              flexDirection: 'row',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}
                          >
                            <Text
                              style={{
                                color: isMismatch ? '#f97316' : '#16a34a',
                                fontSize: 17,
                                fontWeight: '800',
                              }}
                            >
                              Current Due
                            </Text>
                            <Text
                              style={{
                                fontSize: 20,
                                fontWeight: '900',
                                color: isMismatch ? '#ea580c' : '#16a34a',
                              }}
                            >
                              ₹{salary.toLocaleString('en-IN')}
                            </Text>
                          </View>

                          {isMismatch && (
                            <View
                              style={{
                                marginTop: 12,
                                padding: 10,
                                backgroundColor: '#fff',
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: '#fdba74',
                              }}
                            >
                              <Text style={{ fontSize: 12, color: '#ea580c', fontWeight: '800' }}>
                                ⚠️ MISMATCH DETECTED
                              </Text>
                              <Text
                                style={{
                                  fontSize: 12,
                                  color: '#9a3412',
                                  marginTop: 4,
                                  lineHeight: 18,
                                }}
                              >
                                Posted: ₹{voucherAmount.toLocaleString('en-IN')} vs Current: ₹
                                {salary.toLocaleString('en-IN')}. Click below to update the journal
                                entry.
                              </Text>
                            </View>
                          )}

                          {isPerfect && (
                            <View
                              style={{
                                marginTop: 12,
                                padding: 10,
                                backgroundColor: '#f0fdf4',
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: '#bbf7d0',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                              <Text style={{ fontSize: 12, color: '#15803d', fontWeight: '700' }}>
                                Journal for this month is up to date.
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Accounting Actions */}
                        <View
                          style={{ borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 16 }}
                        >
                          <Text
                            style={{
                              fontSize: 15,
                              fontWeight: '800',
                              color: '#1e293b',
                              marginBottom: 12,
                            }}
                          >
                            Posting & Payments
                          </Text>

                          <TouchableOpacity
                            style={[
                              GS.btnPrimary,
                              {
                                backgroundColor: isPerfect
                                  ? '#94a3b8'
                                  : isMismatch
                                    ? '#f97316'
                                    : '#4f46e5',
                                marginBottom: 16,
                                height: 52,
                                borderRadius: 10,
                              },
                              (isPosting || (isPerfect && !isMismatch)) && { opacity: 0.7 },
                            ]}
                            disabled={isPosting || salary <= 0 || isPerfect}
                            onPress={async () => {
                              await handlePostJournal(paySheetEmp, salary, unpostedIds);
                              fetchPaySheetData(paySheetEmp._id);
                            }}
                          >
                            {isPosting ? (
                              <ActivityIndicator color="#fff" />
                            ) : (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Ionicons
                                  name={
                                    isPerfect ? 'checkmark-done' : isMismatch ? 'refresh' : 'book'
                                  }
                                  size={20}
                                  color="#fff"
                                />
                                <Text style={[GS.btnText, { fontSize: 14, fontWeight: '800' }]}>
                                  {isPerfect
                                    ? 'Journal Entry Posted'
                                    : isMismatch
                                      ? 'Update Journal Entry'
                                      : 'Post Journal Entry (Salary Due)'}
                                </Text>
                              </View>
                            )}
                          </TouchableOpacity>

                          <View
                            style={{ height: 1, backgroundColor: '#f1f5f9', marginVertical: 10 }}
                          />

                          <Text
                            style={{
                              fontSize: 13,
                              color: '#64748b',
                              fontWeight: '800',
                              marginBottom: 8,
                            }}
                          >
                            Select Payment Source (Bank/Cash)
                          </Text>
                          <View
                            style={{
                              backgroundColor: '#f8fafc',
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: '#e2e8f0',
                              marginBottom: 16,
                              height: 52,
                              justifyContent: 'center',
                            }}
                          >
                            <Picker
                              selectedValue={selectedBankLedgerId}
                              onValueChange={(v) => setSelectedBankLedgerId(v)}
                              style={{ height: 52, width: '100%' }}
                              dropdownIconColor={COLORS.primary}
                            >
                              <Picker.Item
                                label="Select Bank/Cash Account..."
                                value=""
                                color="#94a3b8"
                              />
                              {bankLedgers.map((l) => (
                                <Picker.Item key={l._id} label={l.name} value={l._id} />
                              ))}
                            </Picker>
                          </View>

                          <TouchableOpacity
                            style={[
                              GS.btnPrimary,
                              { backgroundColor: '#16a34a', height: 52, borderRadius: 10 },
                              isPosting && { opacity: 0.7 },
                            ]}
                            disabled={isPosting || salary <= 0}
                            onPress={() => handlePostPayment(paySheetEmp, salary)}
                          >
                            {isPosting ? (
                              <ActivityIndicator color="#fff" />
                            ) : (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Ionicons name="card" size={20} color="#fff" />
                                <Text style={[GS.btnText, { fontSize: 14, fontWeight: '800' }]}>
                                  Make Payment (Record Entry)
                                </Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        </View>

                        <View
                          style={{
                            marginTop: 24,
                            padding: 16,
                            backgroundColor: '#fff7ed',
                            borderRadius: 10,
                            borderLeftWidth: 4,
                            borderLeftColor: '#f97316',
                          }}
                        >
                          <Text style={{ fontSize: 13, color: '#9a3412', fontWeight: '800' }}>
                            Note:
                          </Text>
                          <Text
                            style={{
                              fontSize: 12,
                              color: '#c2410c',
                              marginTop: 4,
                              lineHeight: 18,
                              fontWeight: '500',
                            }}
                          >
                            Posting a Journal will debit "Salary & Wages" and credit the employee's
                            ledger. Making a Payment will debit the employee's ledger and credit the
                            selected Bank/Cash account.
                          </Text>
                        </View>
                      </View>
                    );
                  })()}
              </ScrollView>

              <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                <TouchableOpacity style={GS.btnSecondary} onPress={() => setPaySheetEmp(null)}>
                  <Text style={GS.btnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ΓöÇΓöÇ Report Preview Modal ΓöÇΓöÇ */}
        <Modal visible={reportVisible} transparent animationType="slide">
          <View
            style={[wfStyles.wfOverlay, { paddingTop: insets.top, backgroundColor: '#f8fafc' }]}
          >
            <View style={wfStyles.wfDialogCard}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: 16,
                  borderBottomWidth: 1,
                  borderBottomColor: '#e2e8f0',
                  backgroundColor: '#f8fafc',
                }}
              >
                <Ionicons
                  name="document-text"
                  size={20}
                  color={COLORS.primary}
                  style={{ marginRight: 8 }}
                />
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#1e293b', flex: 1 }}>
                  Attendance & Dues Report
                </Text>
                <TouchableOpacity onPress={() => setReportVisible(false)} style={{ padding: 4 }}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
                {/* Report Header */}
                <View style={{ marginBottom: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#0f172a' }}>
                    {paySheetEmp?.name?.toUpperCase()}
                    {paySheetEmp?.enrollment_no ? ` (${paySheetEmp.enrollment_no})` : ''}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '700' }}>
                    Period: {payRange.start.toLocaleDateString()} to{' '}
                    {payRange.end.toLocaleDateString()}
                  </Text>
                </View>

                {/* Grid Header */}
                <View
                  style={{
                    flexDirection: 'row',
                    backgroundColor: '#1e293b',
                    paddingVertical: 10,
                    paddingHorizontal: 6,
                    borderRadius: 4,
                  }}
                >
                  <Text style={{ flex: 1.2, color: '#fff', fontSize: 9, fontWeight: '800' }}>
                    DATE
                  </Text>
                  <Text style={{ flex: 1.8, color: '#fff', fontSize: 9, fontWeight: '800' }}>
                    SITE / CLIENT
                  </Text>
                  <Text style={{ flex: 2, color: '#fff', fontSize: 9, fontWeight: '800' }}>
                    TIMINGS (IN/OUT)
                  </Text>
                  <Text
                    style={{
                      flex: 0.8,
                      color: '#fff',
                      fontSize: 9,
                      fontWeight: '800',
                      textAlign: 'center',
                    }}
                  >
                    HRS
                  </Text>
                  <Text
                    style={{
                      flex: 1.2,
                      color: '#fff',
                      fontSize: 9,
                      fontWeight: '800',
                      textAlign: 'right',
                    }}
                  >
                    DUE (Γé╣)
                  </Text>
                </View>

                {/* Grid Rows */}
                {paySheetData.map((log, idx) => {
                  const start = log.dutyStart
                    ? new Date(log.dutyStart).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : '-';
                  const end = log.dutyEnd
                    ? new Date(log.dutyEnd).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })
                    : '-';
                  let hrs = log.hoursWorked || 0;
                  if (hrs === 0 && log.dutyStart && log.dutyEnd) {
                    hrs =
                      (new Date(log.dutyEnd).getTime() - new Date(log.dutyStart).getTime()) /
                      3600000;
                  }
                  const due = log.status === 'Present' ? log.rate || 0 : 0;

                  return (
                    <View
                      key={log._id || idx}
                      style={[
                        {
                          flexDirection: 'row',
                          paddingVertical: 8,
                          paddingHorizontal: 6,
                          borderBottomWidth: 1,
                          borderBottomColor: '#f1f5f9',
                          alignItems: 'center',
                        },
                        log.isPosted && { backgroundColor: '#f8fafc', opacity: 0.8 },
                      ]}
                    >
                      <View style={{ flex: 1.2 }}>
                        <Text
                          style={[
                            { fontSize: 9, color: '#334155', fontWeight: '600' },
                            log.isPosted && { textDecorationLine: 'line-through' },
                          ]}
                        >
                          {new Date(log.date).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </Text>
                        {log.isPosted && (
                          <Text style={{ fontSize: 7, color: '#16a34a', fontWeight: '800' }}>
                            POSTED
                          </Text>
                        )}
                      </View>
                      <Text style={{ flex: 1.8, fontSize: 8, color: '#334155' }} numberOfLines={2}>
                        {log.site_name || 'N/A'}
                      </Text>
                      <Text style={{ flex: 2, fontSize: 8, color: '#64748b' }}>
                        {start} - {end}
                      </Text>
                      <Text
                        style={{ flex: 0.8, fontSize: 9, color: '#334155', textAlign: 'center' }}
                      >
                        {hrs.toFixed(1)}
                      </Text>
                      <Text
                        style={[
                          {
                            flex: 1.2,
                            fontSize: 10,
                            color: '#1e293b',
                            fontWeight: '700',
                            textAlign: 'right',
                          },
                          log.isPosted && { color: '#94a3b8' },
                        ]}
                      >
                        {due > 0 ? `Γé╣${due}` : '-'}
                      </Text>
                    </View>
                  );
                })}

                {/* Summary Row */}
                <View
                  style={{
                    flexDirection: 'row',
                    backgroundColor: '#f8fafc',
                    paddingVertical: 12,
                    paddingHorizontal: 6,
                    marginTop: 4,
                    borderTopWidth: 2,
                    borderTopColor: '#1e293b',
                  }}
                >
                  <Text style={{ flex: 3.2, fontSize: 10, fontWeight: '900', color: '#1e293b' }}>
                    SUMMARY (TOTALS)
                  </Text>
                  <View style={{ flex: 0.8, alignItems: 'center' }}>
                    <Text style={{ fontSize: 9, color: '#64748b', fontWeight: '700' }}>HRS</Text>
                    <Text style={{ fontSize: 11, fontWeight: '900', color: '#1e293b' }}>
                      {paySheetData
                        .reduce((acc, l) => {
                          let hrs = l.hoursWorked || 0;
                          if (hrs === 0 && l.dutyStart && l.dutyEnd)
                            hrs =
                              (new Date(l.dutyEnd).getTime() - new Date(l.dutyStart).getTime()) /
                              3600000;
                          return acc + hrs;
                        }, 0)
                        .toFixed(1)}
                    </Text>
                  </View>
                  <View style={{ flex: 1.2, alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 9, color: '#64748b', fontWeight: '700' }}>
                      TOTAL DUE
                    </Text>
                    <Text style={{ fontSize: 12, fontWeight: '900', color: COLORS.primary }}>
                      Γé╣
                      {paySheetData
                        .reduce((acc, l) => acc + (l.status === 'Present' ? l.rate || 0 : 0), 0)
                        .toLocaleString()}
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: 30, alignItems: 'center' }}>
                  <View
                    style={{ width: 150, height: 1, backgroundColor: '#cbd5e1', marginBottom: 4 }}
                  />
                  <Text style={{ fontSize: 9, color: '#94a3b8', fontWeight: '700' }}>
                    Authorized Signature
                  </Text>
                </View>
              </ScrollView>

              <View
                style={{
                  padding: 16,
                  backgroundColor: '#fff',
                  borderTopWidth: 1,
                  borderTopColor: '#e2e8f0',
                  flexDirection: 'row',
                  gap: 10,
                }}
              >
                <TouchableOpacity
                  style={[GS.btnSecondary, { flex: 1 }]}
                  onPress={() => setReportVisible(false)}
                >
                  <Text style={GS.btnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[GS.btnPrimary, { flex: 2 }]} onPress={handleExportReport}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="share-social-outline" size={20} color="#fff" />
                    <Text style={GS.btnText}>Share PDF Report</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <ForceOffDialog
          visible={!!forceOffTarget}
          onConfirm={(reason: string) => {
            if (forceOffTarget)
              markDuty(forceOffTarget.item, forceOffTarget.log, false, true, reason);
            setForceOffTarget(null);
          }}
          onCancel={() => setForceOffTarget(null)}
        />

        <EnrollmentBlockedDialog
          visible={!!enrollmentBlock}
          employee={enrollmentBlock}
          onClose={() => setEnrollmentBlock(null)}
        />

        {shiftChangeVisible && (
          <ShiftChangeModal
            visible={shiftChangeVisible}
            onClose={() => setShiftChangeVisible(false)}
            onRefresh={() => {
              // setShiftChangeVisible(false);
              fetchDashboardData();
            }}
            activeStaff={Object.values(globalOnDuty)}
            token={sessionToken}
            employees={employees}
            leads={leads}
            allAttendance={allAttendance}
          />
        )}
      </View>
    </Modal>
  );
};
