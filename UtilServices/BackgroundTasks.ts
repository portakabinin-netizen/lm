/**
 * BackgroundTasks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Defines ALL Expo TaskManager background tasks.
 * MUST be imported as the VERY FIRST import in app/_layout.tsx so tasks are
 * registered before any navigation code runs (Expo requirement).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { SmartLocationBuffer } from '@/services/SmartLocationBuffer';
import { LocationSyncService } from '@/services/LocationSyncService';

export const GEO_TRACKING_TASK = 'background-geo-tracking';
export const MISSED_SHIFT_BG_TASK = 'missed-shift-bg-check'; // reserved for future dedicated task

// ─── Haversine distance in metres ────────────────────────────────────────────
function haversineMetres(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Helper: Background Missed-Shift Alarm Check ─────────────────────────────
async function checkMissedShiftAlarmsInBackground(): Promise<void> {
  try {
    // 1. Role must be "Project" and duty status must be "On Duty"
    const rawDutyInfo = await AsyncStorage.getItem('active_duty_info');
    const currentDutyStatus =
      (await AsyncStorage.getItem('current_duty_status')) ||
      (rawDutyInfo ? JSON.parse(rawDutyInfo)?.dutyStatus : null);
    let userRole =
      (await AsyncStorage.getItem('user_role')) ||
      (rawDutyInfo ? JSON.parse(rawDutyInfo)?.userRole : null);

    if (!userRole) {
      const sessionRaw = await AsyncStorage.getItem('userSession');
      if (sessionRaw) {
        const session = JSON.parse(sessionRaw);
        userRole = session?.userRole || session?.role;
      }
    }

    const isProjectRole = String(userRole || '').trim().toLowerCase() === 'project';
    if (!isProjectRole) {
      await AsyncStorage.removeItem('missed_shift_pending_alarms').catch(() => {});
      await AsyncStorage.removeItem('active_missed_shift_alert').catch(() => {});
      return;
    }

    const isOnDuty =
      String(currentDutyStatus || '').trim().toUpperCase() === 'ON' ||
      String(currentDutyStatus || '').trim().toLowerCase() === 'on duty';

    if (!isOnDuty) {
      return;
    }

    const MISSED_KEY = 'missed_shift_pending_alarms';
    const rawAlarms = await AsyncStorage.getItem(MISSED_KEY);
    if (!rawAlarms) return;

    const alarms: Array<{
      key: string;
      leadId?: string;
      siteName: string;
      shiftCode?: string;
      shiftName: string;
      shiftStartTime: string;
      fireAtMs: number;
      window: string;
    }> = JSON.parse(rawAlarms);

    const now = Date.now();
    const LAST_ALERT_KEY = 'missed_shift_last_alert_time';
    const MIN_GAP_MS = 15 * 60_000; // 15-minute minimum gap between alerts
    const { AppState } = require('react-native');
    if (AppState?.currentState === 'active') {
      // In foreground: MissedShiftCheckerService handles checks with live attendance
      return;
    }

    const mannedCacheRaw = await AsyncStorage.getItem('manned_sites_cache');
    const mannedSites: string[] = mannedCacheRaw ? JSON.parse(mannedCacheRaw) : [];
    const mannedSet = new Set(mannedSites.map((s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')));

    const lastAlertStr = await AsyncStorage.getItem(LAST_ALERT_KEY);
    const lastAlertTime = lastAlertStr ? Number(lastAlertStr) : 0;

    const remaining: typeof alarms = [];
    let firedThisTick = false;

    for (const alarm of alarms) {
      // Prune entries older than 180 min past their fire time
      if (now - alarm.fireAtMs > 180 * 60_000) {
        console.log(`[GEO_TASK] Pruning expired alarm: ${alarm.key}`);
        continue;
      }

      // Drop alarm if site is currently manned
      const normSite = String(alarm.siteName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const leadIdStr = String(alarm.leadId || '');
      if (mannedSet.has(leadIdStr) || mannedSet.has(normSite)) {
        console.log(`[GEO_TASK] Dropping alarm: site "${alarm.siteName}" is manned.`);
        continue;
      }

      // Fire if fire time has been reached and hasn't fired yet
      if (now >= alarm.fireAtMs) {
        if (!firedThisTick) {
          // Check 15-minute gap
          if (lastAlertTime > 0 && now - lastAlertTime < MIN_GAP_MS) {
            remaining.push(alarm); // Keep in queue until 15-min gap has passed
            continue;
          }

          firedThisTick = true;
          await AsyncStorage.setItem(LAST_ALERT_KEY, String(now));

          // Save active alert info so foreground app can present work dialog on launch
          const activeAlertData = {
            key: alarm.key,
            leadId: alarm.leadId || '',
            siteName: alarm.siteName,
            shiftCode: alarm.shiftCode || '',
            shiftName: alarm.shiftName,
            shiftStartTime: alarm.shiftStartTime,
            window: alarm.window,
            startedAt: now,
          };
          await AsyncStorage.setItem(
            'active_missed_shift_alert',
            JSON.stringify(activeAlertData)
          );

          console.log(
            `[GEO_TASK] 🔔 Firing missed-shift alarm [${alarm.window}]: ${alarm.siteName} - ${alarm.shiftName}`
          );

          try {
            const { alarmService } = require('@/services/AlarmService');
            await alarmService.startAlarm({ autoStopMs: 60_000 });
          } catch (alarmErr) {
            console.warn('[GEO_TASK] Alarm fire failed:', alarmErr);
          }

          // Show native system heads-up notification (visible when killed/minimized)
          try {
            const { NativeModules } = require('react-native');
            const title = '🚨 Shift Still Unmanned';
            const msg = `Still no attendance marked at "${alarm.siteName}" for ${alarm.shiftName} (${alarm.shiftStartTime}). Tap to open app and take action.`;
            NativeModules?.CallTrackerModule?.showNotification?.(title, msg);
          } catch (notifErr) {
            console.warn('[GEO_TASK] Native notification failed:', notifErr);
          }
          // Do NOT carry this entry forward — it fired, discard it
        } else {
          // Another alarm already fired this tick; retain this alarm for next tick
          remaining.push(alarm);
        }
      } else {
        // Still in the future — keep it
        remaining.push(alarm);
      }
    }

    await AsyncStorage.setItem(MISSED_KEY, JSON.stringify(remaining));
  } catch (err) {
    console.warn('[GEO_TASK] Background missed-shift check failed:', err);
  }
}

// ─── Background Geo-Tracking Task ────────────────────────────────────────────
TaskManager.defineTask(GEO_TRACKING_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('[GEO_TASK] Error:', error.message);
    return;
  }

  // 🔔 1. Missed-Shift Alarm Check runs ALWAYS on every location tick,
  // even if user is not on duty or active_duty_info is null
  await checkMissedShiftAlarmsInBackground();

  if (!data?.locations?.length) return;

  const loc = data.locations[0];
  if (!loc?.coords) return;

  try {
    // Read active duty info saved on duty-start
    const stored = await AsyncStorage.getItem('active_duty_info');
    if (!stored) return;

    const dutyInfo = JSON.parse(stored);
    const { attendanceId, siteLat, siteLong, token, dbName, baseURL, isExempt } = dutyInfo;
    if (isExempt) return; // Skip tracking if user is exempt
    if (!attendanceId || !token || !baseURL) return;

    const { latitude, longitude, accuracy, speed } = loc.coords;

    // Check site proximity (flag if > 500 m from duty-start location)
    if (siteLat && siteLong) {
      const dist = haversineMetres(latitude, longitude, siteLat, siteLong);
      const isOutOfBounds = dist > 500;
      await AsyncStorage.setItem('geo_mismatch', isOutOfBounds ? 'true' : 'false');

      // ── Out-of-bounds: notify Project users + Admins (throttled to once per 30 min) ──
      if (isOutOfBounds) {
        const NOTIFY_ROLES = ['CorpAdmin', 'userAdmin', 'Project'];
        const THROTTLE_KEY = 'geo_oob_last_notified';
        const REARM_MS = 30 * 60 * 1000; // 30 minutes

        try {
          const lastNotifiedStr = await AsyncStorage.getItem(THROTTLE_KEY);
          const lastNotified = lastNotifiedStr ? parseInt(lastNotifiedStr, 10) : 0;
          const shouldNotify = Date.now() - lastNotified > REARM_MS;

          if (shouldNotify) {
            await AsyncStorage.setItem(THROTTLE_KEY, String(Date.now()));

            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            };
            if (dbName) headers['x-tenant-id'] = dbName;

            // Fetch staff list to resolve recipient IDs
            const staffRes = await fetch(`${baseURL}service/staff`, { headers });
            const staffData = await staffRes.json();
            const staffList: any[] = staffData?.data ?? [];

            const recipients = staffList.filter(
              (u: any) => NOTIFY_ROLES.includes(u.userRole) && u._id !== dutyInfo.employeeId
            );

            if (recipients.length > 0) {
              const timestamp = new Date().toLocaleTimeString('en-IN', {
                hour: '2-digit', minute: '2-digit', hour12: true,
              });
              const locationLine =
                `📍 Location: https://maps.google.com/?q=${latitude},${longitude}`;

              const message =
                `🚨 OUT OF BOUNDS ALERT (Background)\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `Worker ID : ${dutyInfo.employeeId}\n` +
                `Time      : ${timestamp}\n` +
                `Status    : Worker is MORE THAN 500 m from duty site!\n` +
                `${locationLine}\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `Please take immediate action.`;

              await Promise.allSettled(
                recipients.map((recipient: any) =>
                  fetch(`${baseURL}service/chat/send`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                      senderId: dutyInfo.employeeId,
                      text: message,
                      type: 'text',
                      isOneToOne: true,
                      receiverId: recipient._id,
                    }),
                  })
                )
              );
              console.log(`[GEO_TASK] OOB alert sent to ${recipients.length} recipients.`);
            }
          }
        } catch (err) {
          console.warn('[GEO_TASK] Error sending OOB notification:', err);
        }
      }
    }

    // Log to SQLite diagnostic cache
    try {
      const { logGeoTickToSQLite } = require("@/UtilServices/sqliteService");
      logGeoTickToSQLite(
        latitude,
        longitude,
        accuracy ?? null,
        siteLat && siteLong ? 'Assigned Site' : 'Unknown Place',
        true
      );
    } catch (err) {
      console.error("SQLite Geo Tick Log Error:", err);
    }

    let tickType = 'tick';
    
    try {
      const cachedClientsStr = await AsyncStorage.getItem('cached_clients');
      if (cachedClientsStr) {
        const clients = JSON.parse(cachedClientsStr);
        let minDist = 100; // 100 meters matching radius
        for (const client of clients) {
          const lLat = Number(client.location?.lat);
          const lLng = Number(client.location?.long);
          if (!lLat || !lLng) continue;
          const d = haversineMetres(latitude, longitude, lLat, lLng);
          if (d < minDist) {
            minDist = d;
            tickType = client.sender_name || client.name || 'Client Site';
          }
        }
      }
    } catch (err) {
      console.warn('[GEO_TASK] Error matching clients:', err);
    }

    // 🚀 Smart Ingest: Filters out GPS jitter, drops stationary duplicate ticks, and buffers
    try {
      const trackingPoint = {
        latitude,
        longitude,
        accuracy: accuracy ?? null,
        speed: speed ?? null,
        heading: (loc.coords as any)?.heading ?? null,
        timestamp: loc.timestamp || Date.now(),
        type: tickType as any,
      };

      const { shouldFlush } = await SmartLocationBuffer.ingest(trackingPoint);

      if (shouldFlush) {
        const compactPayload = await SmartLocationBuffer.drain();
        if (compactPayload) {
          await LocationSyncService.uploadCompact(compactPayload, {
            attendanceId,
            token,
            dbName,
            baseURL,
            isExempt,
          });
        }
      }
    } catch (bufferErr: any) {
      console.warn('[GEO_TASK] SmartLocationBuffer ingest failed:', bufferErr?.message);
    }

    // ─── Background Awake Monitoring Polling ───
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
      if (dbName) {
        headers['x-tenant-id'] = dbName;
      }
      const challengeRes = await fetch(`${baseURL}service/monitoring/challenge`, { headers });
      const challengeData = await challengeRes.json();
      if (challengeData?.challengePending && challengeData?.challengeId) {
        console.log('[GEO_TASK] Awake Challenge pending in background! Ringing alarm...');
        const { alarmService } = require('@/services/AlarmService');
        await alarmService.startAlarm();
      }
    } catch (err) {
      console.warn('[GEO_TASK] Background challenge poll failed:', err);
    }

  } catch (err: any) {
    // Silent fail — background tasks must never crash
    console.warn('[GEO_TASK] Silent fail:', err.message);
  }
});

