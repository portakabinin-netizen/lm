/**
 * 🔔 MissedShiftCheckerService.ts
 *
 * Two-layer missed-shift detection for Project users:
 *
 * ── Layer 1 (Foreground) ──────────────────────────────────────────────────────
 *   checkAll() is called from AttendanceModal / ShiftChangeModal when data loads.
 *   Shows Alert.alert + startAlarm() if a shift is missed in the foreground.
 *
 * ── Layer 2 (Background / Killed) ────────────────────────────────────────────
 *   On first attendance check, all pending alarms are persisted to AsyncStorage
 *   under the key MISSED_SHIFT_ALARMS_KEY.
 *   The GEO_TRACKING_TASK background task reads this key on every location tick
 *   and fires alarmService.startAlarm() if alarm time has been reached.
 *   Once an alarm fires in the background, its entry is removed from AsyncStorage.
 *   When attendance is later marked, clearAlarmsForShift() removes stored entries.
 *
 * ── Deduplication ─────────────────────────────────────────────────────────────
 *   In-memory Set  : "leadId|shiftCode|date|60-90"  or "|90-180"  (foreground)
 *   AsyncStorage   : array of PendingAlarm objects              (background)
 *
 * ── Alarm windows ─────────────────────────────────────────────────────────────
 *   60 – 89 min  → Alarm 1
 *   90 – 179 min → Alarm 2
 *   ≥ 180 min    → Silent (no alarm)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Alert, AppState, AppStateStatus, NativeModules } from 'react-native';
import { alarmService } from './AlarmService';
import { appService } from '@/UtilServices/appHelper';

// ─── AsyncStorage keys & Timing Constants ─────────────────────────────────────
export const MISSED_SHIFT_ALARMS_KEY = 'missed_shift_pending_alarms';
export const LAST_MISSED_SHIFT_ALERT_KEY = 'missed_shift_last_alert_time';
export const MIN_ALERT_GAP_MS = 15 * 60_000; // 15 minutes minimum gap between any alerts

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PendingAlarm {
  /** Unique dedup key: "leadId|shiftCode|date|window" */
  key: string;
  leadId: string;
  siteName: string;
  shiftCode: string;
  shiftName: string;
  shiftStartTime: string; // "HH:MM" for display
  /** Unix ms — when this alarm should fire */
  fireAtMs: number;
  /** Label for the alarm window: e.g. "60m", "75m", "90m", etc. */
  window: string;
}

export interface ActiveMissedShiftAlert {
  key: string;
  leadId: string;
  siteName: string;
  shiftCode: string;
  shiftName: string;
  shiftStartTime: string;
  elapsedMinutes?: number;
  window: string;
  startedAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DAY_SHORT_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_FULL_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

/**
 * Checks if a specific date is marked as exempt / weekly off in an exempt days list.
 * Supports string arrays (['Sun', 'Sat']), comma-delimited strings ('Sun, Sat'),
 * full day names ('Sunday'), and day indices ('0').
 */
function isDayExempt(exemptList: any, targetDate: Date): boolean {
  if (!exemptList) return false;
  const dayIdx = targetDate.getDay();
  const shortName = DAY_SHORT_NAMES[dayIdx];
  const fullName = DAY_FULL_NAMES[dayIdx];

  const items: string[] = [];
  if (Array.isArray(exemptList)) {
    items.push(...exemptList.map((x) => String(x)));
  } else if (typeof exemptList === 'string') {
    items.push(...exemptList.split(/[,|]/));
  }

  return items.some((item) => {
    const s = String(item).trim().toLowerCase();
    if (!s) return false;
    return s === shortName || s === fullName || s.startsWith(shortName) || s === String(dayIdx);
  });
}

/**
 * Evaluates whether a shift is exempt on a given date.
 * Checks shift-level exemptDays, lead-level exemptDays/weeklyOff, and falls
 * back to the system schema default (Sunday is exempt weekly off if unspecified).
 */
function isShiftExemptToday(shift: any, lead: any, targetDate: Date): boolean {
  // 1. Shift-level exemptions
  if (isDayExempt(shift.exemptDays, targetDate)) return true;
  if (isDayExempt(shift.exemptDay, targetDate)) return true;
  if (isDayExempt(shift.weeklyOff, targetDate)) return true;

  // 2. Lead-level exemptions
  if (isDayExempt(lead.exemptDays, targetDate)) return true;
  if (isDayExempt(lead.weeklyOff, targetDate)) return true;
  if (isDayExempt(lead.dutyShift?.exemptDays, targetDate)) return true;

  // 3. Fallback: If no exempt schedule has been set anywhere on the shift or lead,
  // the system model schema default is Sunday ('Sun') as weekly off.
  const hasCustomConfig =
    (Array.isArray(shift.exemptDays) && shift.exemptDays.length > 0) ||
    (typeof shift.exemptDays === 'string' && shift.exemptDays.trim().length > 0) ||
    shift.exemptDay ||
    shift.weeklyOff ||
    lead.exemptDays ||
    lead.weeklyOff;

  if (!hasCustomConfig && targetDate.getDay() === 0) {
    return true;
  }

  return false;
}

/**
 * Resolves the shift start Date.
 * Daytime shifts (e.g. 06:00, 08:00, 09:00) always start on today's calendar date.
 * Evening/night shifts (start >= 18:00) that cross midnight into early morning hours
 * (< 12:00) belong to yesterday.
 */
function resolveShiftStartDate(startTimeStr: string): Date {
  if (!startTimeStr) return new Date();
  const [hh, mm] = startTimeStr.split(':').map(Number);
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(hh || 0, mm || 0, 0, 0);

  const elapsedMs = now.getTime() - todayStart.getTime();
  if (elapsedMs < 0 && (hh || 0) >= 18 && now.getHours() < 12) {
    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }
  return todayStart;
}

function getAttendanceDateStr(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return toLocalDateStr(val);
  const str = String(val).trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return toLocalDateStr(d);
}

function isSameDayAsShiftStart(att: any, shiftStartDate: Date): boolean {
  const targetDateStr = toLocalDateStr(shiftStartDate);
  const dutyStartDateStr = getAttendanceDateStr(att.dutyStart);
  if (dutyStartDateStr === targetDateStr) return true;
  const dateStr = getAttendanceDateStr(att.date);
  if (dateStr === targetDateStr) return true;
  return false;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class MissedShiftCheckerService {
  /** In-memory dedup: prevents double-alerting in the same foreground session */
  private notifiedKeys = new Set<string>();
  private bgInterval: ReturnType<typeof setInterval> | null = null;

  /** Timestamp of the last triggered alert to enforce minimum 15-minute gap */
  private lastAlertTimestamp: number = 0;

  /** Cached references to latest leads and attendance for helper operations */
  private lastLeads: any[] = [];
  private lastAttendance: any[] = [];

  /** Currently ringing alert info (if any) */
  private activeAlert: ActiveMissedShiftAlert | null = null;
  private listeners = new Set<(alert: ActiveMissedShiftAlert | null) => void>();
  private autoSilenceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this._initAppStateListener();
    this._loadLastAlertTime();
    this.startMonitoring();
  }

  private async _loadLastAlertTime(): Promise<void> {
    try {
      const val = await AsyncStorage.getItem(LAST_MISSED_SHIFT_ALERT_KEY);
      if (val) {
        const t = Number(val);
        if (!isNaN(t)) this.lastAlertTimestamp = t;
      }
    } catch (_) {}
  }

  /** Subscribe to active missed shift alert state changes */
  public subscribe(listener: (alert: ActiveMissedShiftAlert | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.activeAlert);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private _notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn(this.activeAlert);
      } catch (e) {
        console.warn('[MissedShiftChecker] listener error:', e);
      }
    });
  }

  /** Current active alert info, or null if none is ringing */
  public getActiveAlert(): ActiveMissedShiftAlert | null {
    return this.activeAlert;
  }

  /** Whether the alarm sound/vibration is currently ringing */
  public isAlarmRinging(): boolean {
    return this.activeAlert !== null || alarmService.playing;
  }

  /**
   * User action to silence the alarm.
   * Alarm is for alert purposes only — tapping silence immediately halts
   * sound and vibration and dismisses active alert status.
   */
  public async silenceAlarm(): Promise<void> {
    if (!this.activeAlert && !alarmService.playing && !this.autoSilenceTimer) {
      return;
    }
    if (this.autoSilenceTimer) {
      clearTimeout(this.autoSilenceTimer);
      this.autoSilenceTimer = null;
    }
    this.activeAlert = null;
    this._notify();

    try {
      await alarmService.stopAlarm();
    } catch (e) {
      console.warn('[MissedShiftChecker] stopAlarm failed:', e);
    }

    console.log('[MissedShiftChecker] Alarm silenced by user.');
  }

  /**
   * Marks "NR" (No Reliever) in the attendance database for the missed shift.
   * Copies the previous worker who worked this shift at this site, sets status to "NR",
   * clears pending alarms, and silences the alarm.
   */
  public async markNoReliever(alertInfo: ActiveMissedShiftAlert): Promise<void> {
    await this.silenceAlarm();

    try {
      const leadIdStr = String(alertInfo.leadId);
      const shiftCode = alertInfo.shiftCode;

      // 1. Find previous worker who worked on the same shift at this site
      let prevRecord = this.lastAttendance.find((att: any) => {
        const attLeadId =
          typeof att.leadId === 'object' && att.leadId !== null
            ? att.leadId._id
            : att.leadId || att.siteId;
        return (
          String(attLeadId) === leadIdStr &&
          att.shiftCode === shiftCode &&
          att.employeeId &&
          !isSameDayAsShiftStart(att, new Date())
        );
      });

      // Fallback 1: Any record on same lead and shiftCode with an employee
      if (!prevRecord) {
        prevRecord = this.lastAttendance.find((att: any) => {
          const attLeadId =
            typeof att.leadId === 'object' && att.leadId !== null
              ? att.leadId._id
              : att.leadId || att.siteId;
          return String(attLeadId) === leadIdStr && att.shiftCode === shiftCode && att.employeeId;
        });
      }

      // Fallback 2: Any prior record at this site with an employee
      if (!prevRecord) {
        prevRecord = this.lastAttendance.find((att: any) => {
          const attLeadId =
            typeof att.leadId === 'object' && att.leadId !== null
              ? att.leadId._id
              : att.leadId || att.siteId;
          return String(attLeadId) === leadIdStr && att.employeeId;
        });
      }

      // Fallback 3: Query backend API for attendance at this site
      let remoteRecord: any = null;
      if (!prevRecord) {
        try {
          const s = await appService.getSession();
          if (s?.token) {
            const res = await appService.httpClient.get('service/hr/attendance', {
              params: { leadId: leadIdStr },
              headers: { Authorization: `Bearer ${s.token}` },
            });
            const list = res.data?.data || res.data || [];
            if (Array.isArray(list) && list.length > 0) {
              remoteRecord =
                list.find((r: any) => r.shiftCode === shiftCode && r.employeeId) ||
                list.find((r: any) => r.employeeId);
            }
          }
        } catch (apiErr) {
          console.warn('[MissedShiftChecker] Remote fetch for previous worker failed:', apiErr);
        }
      }

      const sourceRecord = prevRecord || remoteRecord;
      const rawEmp = sourceRecord?.employeeId;
      const empId = typeof rawEmp === 'object' && rawEmp !== null ? rawEmp._id : rawEmp;
      const empName =
        typeof rawEmp === 'object' && rawEmp !== null
          ? rawEmp.name || rawEmp.displayName
          : sourceRecord?.displayName || sourceRecord?.name || 'Previous Worker';

      const lead = this.lastLeads.find((l: any) => String(l._id) === leadIdStr);
      const shiftInfo = (lead?.siteShifts || lead?.shifts)?.find(
        (s: any) => s.shiftCode === shiftCode
      );

      const now = new Date();
      const todayDateStr = toLocalDateStr(now);
      const scheduledStart = resolveShiftStartDate(
        alertInfo.shiftStartTime || shiftInfo?.startTime || '08:00'
      );
      const durationHrs = shiftInfo?.durationHrs || 8;
      const scheduledEnd = new Date(scheduledStart.getTime() + durationHrs * 3600_000);

      const s = await appService.getSession();
      const token = s?.token;

      if (!empId) {
        Alert.alert(
          'Previous Worker Not Found',
          `Could not locate previous worker for "${alertInfo.siteName}" (${alertInfo.shiftName}). Please mark attendance directly from the roster.`,
          [{ text: 'OK' }]
        );
        return;
      }

      const payload = {
        employeeId: empId,
        employeeType: sourceRecord?.employeeType || 'Employees',
        leadId: alertInfo.leadId,
        siteId: alertInfo.leadId,
        site_name: alertInfo.siteName,
        role: sourceRecord?.role || 'Worker',
        rate: sourceRecord?.rate || shiftInfo?.salaryRate || shiftInfo?.billRate || 0,
        date: todayDateStr,
        dutyStartScheduled: scheduledStart.toISOString(),
        dutyStart: scheduledStart.toISOString(),
        dutyEndScheduled: scheduledEnd.toISOString(),
        dutyEnd: scheduledEnd.toISOString(),
        status: 'NR', // "NR" for No Reliever
        shiftCode: alertInfo.shiftCode,
        shiftPeriod: alertInfo.shiftName || shiftInfo?.shiftName || 'Morning',
        shiftType: durationHrs === 12 ? '12hr' : '8hr',
        shiftLockHours: durationHrs,
        remarks: `NR (No Reliever) - Prior Worker: ${empName}`,
        forcedOff: true,
        forcedOffReason: 'No Reliever',
        dutyLevel: 0,
      };

      const res = await appService.httpClient.post('service/hr/attendance', payload, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (res.data?.success || res.status === 200 || res.status === 201) {
        await this.clearAlarmsForShift(alertInfo.leadId, alertInfo.shiftCode);
        const createdRecord = res.data?.data || payload;
        this.lastAttendance.push(createdRecord);

        appService.showToast(
          `Marked "NR" (No Reliever) for ${empName} at ${alertInfo.siteName}`,
          'Success'
        );
      } else {
        appService.showToast(res.data?.message || 'Failed to mark No Reliever', 'Error');
      }
    } catch (e: any) {
      console.warn('[MissedShiftChecker] markNoReliever error:', e);
      appService.showToast(e?.response?.data?.message || 'Error recording No Reliever', 'Error');
    }
  }

  /** Helper: Resolves active user role from all persistent session sources */
  public async getCurrentUserRole(): Promise<string> {
    try {
      const sessionRaw = await AsyncStorage.getItem('userSession');
      if (sessionRaw) {
        const session = JSON.parse(sessionRaw);
        const r = session?.userRole || session?.role;
        if (r) return String(r).trim();
      }
      const storedRole = await AsyncStorage.getItem('user_role');
      if (storedRole) return storedRole.trim();
      const rawDuty = await AsyncStorage.getItem('active_duty_info');
      if (rawDuty) {
        const duty = JSON.parse(rawDuty);
        const r = duty?.userRole || duty?.role;
        if (r) return String(r).trim();
      }
    } catch {}
    return '';
  }

  /**
   * Fires the alarm for a missed shift with an auto-silence safety timeout (60s).
   * STRICTLY ISOLATED to role="Project" users only.
   * Enforces a minimum 15-minute gap before any subsequent alert can trigger.
   * Displays an alert with 'No Reliever' and 'OK' buttons, posts a high-priority system notification,
   * and triggers the in-app audio alarm.
   */
  public async triggerAlarm(
    alertInfo: ActiveMissedShiftAlert,
    title: string,
    message: string,
    bypassCooldown = false
  ): Promise<void> {
    const currentRole = await this.getCurrentUserRole();
    if (currentRole.toLowerCase() !== 'project') {
      console.log(
        `[MissedShiftChecker] Isolated to role="Project" only. Suppressing alarm trigger for role="${currentRole}".`
      );
      await this.silenceAlarm();
      return;
    }

    const now = Date.now();
    if (!bypassCooldown && this.lastAlertTimestamp > 0 && now - this.lastAlertTimestamp < MIN_ALERT_GAP_MS) {
      const remainingMins = Math.ceil((MIN_ALERT_GAP_MS - (now - this.lastAlertTimestamp)) / 60_000);
      console.log(
        `[MissedShiftChecker] Suppressing alert: 15-min gap active. Next alert allowed in ~${remainingMins} min.`
      );
      return;
    }

    this.lastAlertTimestamp = now;
    AsyncStorage.setItem(LAST_MISSED_SHIFT_ALERT_KEY, String(now)).catch(() => {});

    this.activeAlert = alertInfo;
    this._notify();

    // Trigger Android System Notification in Status Bar
    try {
      const summary = `Still no attendance marked at "${alertInfo.siteName}" for ${alertInfo.shiftName} (${alertInfo.shiftStartTime}). Tap to open and mark attendance.`;
      NativeModules?.CallTrackerModule?.showNotification?.(title, summary);
    } catch (notifErr) {
      console.warn('[MissedShiftChecker] CallTrackerModule.showNotification error:', notifErr);
    }

    // 60-second auto-silence safety timer (alert purpose only)
    if (this.autoSilenceTimer) {
      clearTimeout(this.autoSilenceTimer);
    }
    this.autoSilenceTimer = setTimeout(() => {
      console.log(
        '[MissedShiftChecker] Auto-silencing alarm after 60s timeout (alert purpose only)'
      );
      this.silenceAlarm();
    }, 60_000);

    try {
      await alarmService.startAlarm({ autoStopMs: 60_000 });
    } catch (e) {
      console.warn('[MissedShiftChecker] startAlarm error:', e);
    }

    Alert.alert(
      title,
      message,
      [
        {
          text: 'No Reliever',
          style: 'destructive',
          onPress: () => {
            this.markNoReliever(alertInfo);
          },
        },
        {
          text: 'OK',
          onPress: () => {
            this.silenceAlarm();
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          this.silenceAlarm();
        },
      }
    );
  }



  private _initAppStateListener(): void {
    AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const currentRole = await this.getCurrentUserRole();
        if (currentRole.toLowerCase() !== 'project') {
          // If not Project role, purge any cached alarms and keep silent
          await AsyncStorage.removeItem('active_missed_shift_alert').catch(() => {});
          await AsyncStorage.removeItem(MISSED_SHIFT_ALARMS_KEY).catch(() => {});
          this.silenceAlarm();
          return;
        }

        // Check if an alert fired while app was closed or minimized
        try {
          const stored = await AsyncStorage.getItem('active_missed_shift_alert');
          if (stored) {
            await AsyncStorage.removeItem('active_missed_shift_alert');
            const alertInfo: ActiveMissedShiftAlert = JSON.parse(stored);
            const title = '🚨 Shift Still Unmanned';
            const shiftLabel = alertInfo.shiftName
              ? `${alertInfo.shiftName} (${alertInfo.shiftStartTime})`
              : alertInfo.shiftStartTime;
            const message = `Still no attendance marked at:\n\n"${alertInfo.siteName}"\nShift: ${shiftLabel}\n\n🔁 Auto-Repeat: Alert will repeat every 15 minutes until attendance is marked or 'No Reliever' is selected.\n\nPlease take immediate action.`;
            this.triggerAlarm(alertInfo, title, message, true);
          }
        } catch (e) {
          console.warn('[MissedShiftChecker] Failed to restore background alert:', e);
        }

        // If alarm was triggered in background, ensure UI knows so silence button shows
        if (alarmService.playing && !this.activeAlert) {
          this.activeAlert = {
            key: 'bg-alarm',
            leadId: '',
            siteName: 'Pending Shift Check',
            shiftCode: '',
            shiftName: 'Shift Alert',
            shiftStartTime: '',
            window: 'auto',
            startedAt: Date.now(),
          };
          this._notify();
        }
      }
      this.checkPendingAlarmsNow();
    });
  }

  /** Continuous monitoring running every 30s in both foreground and background */
  public startMonitoring(): void {
    if (this.bgInterval) return;
    this.checkPendingAlarmsNow();
    this.bgInterval = setInterval(() => {
      this.checkPendingAlarmsNow();
    }, 30_000);
  }

  public stopMonitoring(): void {
    if (this.bgInterval) {
      clearInterval(this.bgInterval);
      this.bgInterval = null;
    }
  }

  public startBackgroundMonitoring(): void {
    this.startMonitoring();
  }

  public stopBackgroundMonitoring(): void {
    // Keep monitoring running to ensure alerts trigger even when active in foreground
  }

  public async checkPendingAlarmsNow(): Promise<void> {
    try {
      // Role must strictly be "Project" and duty status must be "ON"
      const userRole = await this.getCurrentUserRole();
      const isProject = userRole.toLowerCase() === 'project';

      if (!isProject) {
        // Purge pending alarms and silence if current user is not Project role
        await AsyncStorage.removeItem(MISSED_SHIFT_ALARMS_KEY).catch(() => {});
        await AsyncStorage.removeItem('active_missed_shift_alert').catch(() => {});
        this.silenceAlarm();
        return;
      }

      const rawDuty = await AsyncStorage.getItem('active_duty_info');
      const currentStatus =
        (await AsyncStorage.getItem('current_duty_status')) ||
        (rawDuty ? JSON.parse(rawDuty)?.dutyStatus : null);

      const isOnDuty =
        String(currentStatus || '').trim().toUpperCase() === 'ON' ||
        String(currentStatus || '').trim().toLowerCase() === 'on duty';

      if (!isOnDuty) {
        return;
      }

      const raw = await AsyncStorage.getItem(MISSED_SHIFT_ALARMS_KEY);
      if (!raw) return;
      const alarms: PendingAlarm[] = JSON.parse(raw);
      const now = Date.now();
      const remaining: PendingAlarm[] = [];
      let firedThisTick = false;

      for (const alarm of alarms) {
        if (now - alarm.fireAtMs > 180 * 60_000) continue; // Prune expired

        if (now >= alarm.fireAtMs) {
          if (!firedThisTick) {
            // Enforce 15-minute minimum gap before ringing any alert
            if (this.lastAlertTimestamp > 0 && now - this.lastAlertTimestamp < MIN_ALERT_GAP_MS) {
              remaining.push(alarm); // Keep in queue until 15-min gap has passed
              continue;
            }

            firedThisTick = true;
            this.lastAlertTimestamp = now;
            AsyncStorage.setItem(LAST_MISSED_SHIFT_ALERT_KEY, String(now)).catch(() => {});

            console.log(
              `[MissedShiftChecker] Firing alarm: ${alarm.siteName} (${alarm.shiftName})`
            );

            const alertData: ActiveMissedShiftAlert = {
              key: alarm.key,
              leadId: alarm.leadId,
              siteName: alarm.siteName,
              shiftCode: alarm.shiftCode,
              shiftName: alarm.shiftName,
              shiftStartTime: alarm.shiftStartTime,
              window: alarm.window,
              startedAt: now,
            };

            // If app is currently in background, save active_missed_shift_alert for app launch
            if (AppState.currentState !== 'active') {
              AsyncStorage.setItem('active_missed_shift_alert', JSON.stringify(alertData)).catch(() => {});
            }

            const title = '🚨 Shift Still Unmanned';
            const shiftLabel = alarm.shiftName
              ? `${alarm.shiftName} (${alarm.shiftStartTime})`
              : alarm.shiftStartTime;
            const message = `Still no attendance marked at:\n\n"${alarm.siteName}"\nShift: ${shiftLabel}\n\n🔁 Auto-Repeat: Alert will repeat every 15 minutes until attendance is marked or 'No Reliever' is selected.\n\nPlease take immediate action.`;

            this.triggerAlarm(alertData, title, message, true);
          } else {
            remaining.push(alarm);
          }
        } else {
          remaining.push(alarm);
        }
      }

      await AsyncStorage.setItem(MISSED_SHIFT_ALARMS_KEY, JSON.stringify(remaining));
    } catch (err) {
      console.warn('[MissedShiftChecker] checkPendingAlarmsNow error:', err);
    }
  }

  /**
   * Main entry point — evaluates missed shifts for Project role.
   *
   * Logic:
   * 1. Check leads with status = 'Accepted'.
   * 2. Check Shift Schedule in leads documents.
   * 3. Check shift time and shift day is not marked as exempt day / weekly off.
   *    If exempt day: clears pending alarms and skips alert.
   * 4. Filter attendance for that day, site, and shift.
   * 5. If no active duty (and no valid attendance / weekly off / NR) found,
   *    notify user for "Shift still Unmanned" with an Alert providing "No Reliever" and "OK" options.
   */
  checkAll(leads: any[], allAttendance: any[], userRole: string): void {
    if (leads) this.lastLeads = leads;
    if (allAttendance) this.lastAttendance = allAttendance;
    if (userRole?.toLowerCase() !== 'project') {
      this.reset();
      return;
    }

    const pendingToSave: PendingAlarm[] = [];
    const clearedShifts = new Set<string>();

    for (const lead of leads || []) {
      // 1. First check leads with status = 'Accepted'
      const status = String(lead?.status || '').trim().toLowerCase();
      if (status !== 'accepted') continue;

      // 2. Check Shift Schedule in leads documents
      const shifts = lead.siteShifts || lead.shifts;
      if (!Array.isArray(shifts) || shifts.length === 0) continue;

      const siteName = lead.sender_name || lead.name || 'Unknown Site';

      for (const shift of shifts) {
        if (shift.active === false) continue;
        if (!shift.startTime) continue;

        // 3. Check shift time and shift day doesn't marked exempt day
        const shiftStartDate = resolveShiftStartDate(shift.startTime);
        const shiftDateStr = toLocalDateStr(shiftStartDate);

        // If today is marked exempt day (weekly off) by schedule, skip and clear alarms
        if (isShiftExemptToday(shift, lead, shiftStartDate)) {
          clearedShifts.add(`${lead._id}|${shift.shiftCode}`);
          continue;
        }

        const elapsedMins = (Date.now() - shiftStartDate.getTime()) / 60_000;

        // 4. Filter that day attendance in collection attendance
        const todayRecords = (allAttendance || []).filter((att: any) => {
          const attLeadId =
            typeof att.leadId === 'object' && att.leadId !== null
              ? att.leadId._id
              : att.leadId || att.siteId;
          return (
            String(attLeadId) === String(lead._id) &&
            att.shiftCode === shift.shiftCode &&
            isSameDayAsShiftStart(att, shiftStartDate)
          );
        });

        // 4a. Check if Weekly Off (W), exempt day, or No Reliever (NR) was marked in attendance
        const hasHandledAttendance = todayRecords.some((att: any) => {
          const st = String(att.status ?? '').trim().toLowerCase();
          return (
            st === 'w' ||
            st === 'weekly off' ||
            st === 'nr' ||
            st === 'no reliever' ||
            att.isExemptDay === true
          );
        });

        if (hasHandledAttendance) {
          clearedShifts.add(`${lead._id}|${shift.shiftCode}`);
          continue;
        }

        // 4b. Check if any worker is actively on duty
        const hasActiveDuty = todayRecords.some((att: any) => {
          const isDutyOngoing = !att.dutyEnd;
          const st = String(att.status ?? '').trim().toLowerCase();
          const isNotAbsent = !['a', 'absent', 'l', 'leave'].includes(st);
          return isDutyOngoing && isNotAbsent;
        });

        // 4c. Check if valid attendance (present / completed duty)
        const hasValidAttendance = todayRecords.some((att: any) => {
          const st = String(att.status ?? '').trim().toLowerCase();
          return !['a', 'absent', 'l', 'leave'].includes(st);
        });

        const isManned = hasActiveDuty || hasValidAttendance;

        if (isManned) {
          clearedShifts.add(`${lead._id}|${shift.shiftCode}`);
          continue;
        }

        // 5. If no active duty found:
        // ── Build pending background alarms (60 to 179 min at min 15-min intervals) ──
        if (elapsedMins < 180) {
          const shiftLabel = shift.shiftName || shift.shiftCode || 'Shift';
          const nowMs = Date.now();
          for (let slot = 60; slot < 180; slot += 15) {
            const fireAtMs = shiftStartDate.getTime() + slot * 60_000;
            const slotKey = `${lead._id}|${shift.shiftCode}|${shiftDateStr}|${slot}m`;
            if (nowMs < fireAtMs) {
              pendingToSave.push({
                key: slotKey,
                leadId: String(lead._id),
                siteName,
                shiftCode: shift.shiftCode,
                shiftName: shiftLabel,
                shiftStartTime: shift.startTime,
                fireAtMs,
                window: `${slot}m`,
              });
            }
          }
        }

        // ── Foreground notification for "Shift still Unmanned" (60 - 179 min, 15m gap) ──
        if (elapsedMins >= 60 && elapsedMins < 180) {
          const slot = Math.floor(elapsedMins / 15) * 15; // 60, 75, 90, 105, 120, 135, 150, 165
          const slotKey = `${lead._id}|${shift.shiftCode}|${shiftDateStr}|${slot}m`;
          const shiftLabel = shift.shiftName
            ? `${shift.shiftName} (${shift.startTime})`
            : shift.startTime;
          const elapsed = Math.floor(elapsedMins);

          if (!this.notifiedKeys.has(slotKey)) {
            const nowMs = Date.now();
            const has15MinGap = this.lastAlertTimestamp === 0 || nowMs - this.lastAlertTimestamp >= MIN_ALERT_GAP_MS;

            if (has15MinGap) {
              this.notifiedKeys.add(slotKey);
              this.triggerAlarm(
                {
                  key: slotKey,
                  leadId: String(lead._id),
                  siteName,
                  shiftCode: shift.shiftCode,
                  shiftName: shift.shiftName || shift.shiftCode || 'Shift',
                  shiftStartTime: shift.startTime,
                  elapsedMinutes: elapsed,
                  window: `${slot}m`,
                  startedAt: nowMs,
                },
                '🚨 Shift Still Unmanned',
                `Still no attendance marked at:\n\n"${siteName}"\nShift: ${shiftLabel}\n\nShift started ${elapsed} minutes ago.\n\n🔁 Auto-Repeat: Alert will repeat every 15 minutes until attendance is marked or 'No Reliever' is selected.\n\nPlease take immediate action.`
              );
            }
          }
        }
      }
    }

    // Batch clear alarms for all manned/exempt shifts in a single disk operation
    if (clearedShifts.size > 0) {
      this._batchClearAlarms(clearedShifts).catch(() => {});
    }

    // Persist pending alarms to AsyncStorage for background/killed-app firing
    if (pendingToSave.length > 0) {
      this._mergePendingAlarms(pendingToSave).catch(() => {});
    }
  }

  /**
   * Batches removal of alarms from AsyncStorage in a single read/write cycle.
   */
  private async _batchClearAlarms(clearedSet: Set<string>): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(MISSED_SHIFT_ALARMS_KEY);
      if (!raw) return;
      const existing: PendingAlarm[] = JSON.parse(raw);
      const filtered = existing.filter(
        (a) => !clearedSet.has(`${a.leadId}|${a.shiftCode}`)
      );
      if (filtered.length !== existing.length) {
        await AsyncStorage.setItem(MISSED_SHIFT_ALARMS_KEY, JSON.stringify(filtered));
      }
    } catch (err) {
      console.warn('[MissedShiftChecker] _batchClearAlarms failed:', err);
    }
  }

  /**
   * Merges newly computed pending alarms into AsyncStorage.
   * - Existing entries with the same key are NOT overwritten (idempotent).
   * - Entries whose fireAtMs is already > 180 min past are pruned.
   */
  private async _mergePendingAlarms(incoming: PendingAlarm[]): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(MISSED_SHIFT_ALARMS_KEY);
      const existing: PendingAlarm[] = raw ? JSON.parse(raw) : [];

      const existingKeys = new Set(existing.map((a) => a.key));
      const now = Date.now();

      // Prune stale entries (> 180 min past fireAtMs)
      const pruned = existing.filter((a) => now - a.fireAtMs < 180 * 60_000);

      // Add only new keys
      for (const alarm of incoming) {
        if (!existingKeys.has(alarm.key)) {
          pruned.push(alarm);
        }
      }

      await AsyncStorage.setItem(MISSED_SHIFT_ALARMS_KEY, JSON.stringify(pruned));
      console.log(
        `[MissedShiftChecker] Persisted ${pruned.length} pending alarms to AsyncStorage.`
      );
    } catch (err) {
      console.warn('[MissedShiftChecker] Failed to persist alarms:', err);
    }
  }

  /**
   * Call when attendance is successfully marked for a site+shift.
   * Removes the alarm entries for that site+shift from AsyncStorage so
   * the background task no longer fires for them.
   */
  async clearAlarmsForShift(leadId: string, shiftCode: string): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(MISSED_SHIFT_ALARMS_KEY);
      if (!raw) return;
      const existing: PendingAlarm[] = JSON.parse(raw);
      const filtered = existing.filter(
        (a) => !(String(a.leadId) === String(leadId) && a.shiftCode === shiftCode)
      );
      await AsyncStorage.setItem(MISSED_SHIFT_ALARMS_KEY, JSON.stringify(filtered));
      console.log(`[MissedShiftChecker] Cleared alarms for lead=${leadId} shift=${shiftCode}`);
    } catch (err) {
      console.warn('[MissedShiftChecker] clearAlarmsForShift failed:', err);
    }
  }

  /**
   * Clears all in-memory dedup keys (call on modal close / date change).
   * Does NOT clear AsyncStorage — background alarms remain until attendance
   * is marked or they expire naturally (> 180 min).
   */
  reset(): void {
    this.notifiedKeys.clear();
  }

  /**
   * Full reset: clears both in-memory keys AND AsyncStorage pending alarms.
   * Call on logout or date rollover.
   */
  async hardReset(): Promise<void> {
    this.notifiedKeys.clear();
    await AsyncStorage.removeItem(MISSED_SHIFT_ALARMS_KEY).catch(() => {});
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
export const missedShiftChecker = new MissedShiftCheckerService();

// ─── React Hook for easy UI integration ──────────────────────────────────────
export function useMissedShiftAlarm() {
  const [alert, setAlert] = useState<ActiveMissedShiftAlert | null>(
    missedShiftChecker.getActiveAlert()
  );
  const [isRinging, setIsRinging] = useState<boolean>(missedShiftChecker.isAlarmRinging());
  const [isProject, setIsProject] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    missedShiftChecker.getCurrentUserRole().then((r) => {
      if (mounted) {
        const ok = r.toLowerCase() === 'project';
        setIsProject(ok);
        if (!ok) {
          setIsRinging(false);
          setAlert(null);
        }
      }
    });

    const unsubChecker = missedShiftChecker.subscribe((active) => {
      missedShiftChecker.getCurrentUserRole().then((role) => {
        if (mounted) {
          const ok = role.toLowerCase() === 'project';
          setIsProject(ok);
          if (ok) {
            setAlert(active);
            setIsRinging(missedShiftChecker.isAlarmRinging());
          } else {
            setAlert(null);
            setIsRinging(false);
          }
        }
      });
    });
    const unsubAlarm = alarmService.onStateChange((playing) => {
      missedShiftChecker.getCurrentUserRole().then((role) => {
        if (mounted) {
          const ok = role.toLowerCase() === 'project';
          setIsProject(ok);
          if (ok) {
            setIsRinging(playing || missedShiftChecker.getActiveAlert() !== null);
          } else {
            setIsRinging(false);
          }
        }
      });
    });

    return () => {
      mounted = false;
      unsubChecker();
      unsubAlarm();
    };
  }, []);

  return {
    activeAlert: isProject ? alert : null,
    isRinging: isProject && isRinging,
    silenceAlarm: () => missedShiftChecker.silenceAlarm(),
  };
}
