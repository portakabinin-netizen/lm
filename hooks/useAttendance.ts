/**
 * useAttendance.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for all shift-aware duty management:
 *  • 8-hour shifts: A (Morning 06-14), B (Afternoon 14-22), C (Night 22-06)
 *  • 12-hour shifts: D (Day 08-20), E (Night 20-08)
 *  • Shift lock: Staff cannot end duty before lock hours (except override roles)
 *  • Background geo-tracking via expo-task-manager (persists when app closed)
 *  • Emergency all-off: Project User / CorpAdmin / Admin only
 */

import { GEO_TRACKING_TASK } from '@/UtilServices/BackgroundTasks';
import { appService } from '@/UtilServices/appHelper';
import { useUserContext } from '@/context/AuthContext';
import { getSocket } from '@/hooks/Socket';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logAttendanceToSQLite } from '@/UtilServices/sqliteService';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, DeviceEventEmitter } from 'react-native';
import { GPSService } from '@/services/GPSService';
import { useGPSCoordinates } from '@/hooks/useGPSCoordinates';

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // meters
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Shift Definitions ────────────────────────────────────────────────────────
// Shift logic is now purely dynamic and fetched from assignedShiftDetails.

// Roles that can end duty before the shift lock expires
const OVERRIDE_ROLES = ['CorpAdmin', 'Project', 'userAdmin'];

// AsyncStorage key for background task info
const DUTY_INFO_KEY = 'active_duty_info';
const GEO_MISMATCH_KEY = 'geo_mismatch';

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

  // Resolve shift details dynamically from userMaster or employee database
  let startTime = employee?.dutyShift?.startFrom || employee?.dutyShift?.startTime || '09:00';

  const activeEntry =
    employee?.employmentHistory?.find((e: any) => e.active) ||
    (employee?.employmentHistory?.length
      ? employee.employmentHistory[employee.employmentHistory.length - 1]
      : null);

  let durationHrs = employee?.dutyShift?.durationHrs || employee?.dutyShift?.shiftHours || 0;
  let groupName = employee?.dutyShift?.groupName || '';

  if (activeEntry) {
    startTime = activeEntry.shiftStartTime || startTime;
    durationHrs = activeEntry.shiftHours || durationHrs;
    groupName = activeEntry.groupName || groupName;
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

  const [h, m] = startTime.split(':').map(Number);
  const endHrs = (h + durationHrs) % 24;
  let endTime = `${String(endHrs).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  let shiftType = durationHrs === 12 ? '12hr' : '8hr';

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

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAttendance() {
  const { user } = useUserContext();
  const token = (user?.token ?? '').replace(/['"]+/g, '').trim();
  const [employeeProfile, setEmployeeProfile] = useState<any>(null);
  const employeeId = employeeProfile?._id || user?.userId || user?._id || '';

  const [activeDuty, setActiveDuty] = useState<any | null>(null);
  const [dutyStatus, setDutyStatus] = useState<'ON' | 'OFF'>('OFF');
  const [selectedShift, setSelectedShift] = useState<string>('General');
  const [isLoading, setIsLoading] = useState(false);
  const [isOutOfBounds, setIsOutOfBounds] = useState(false);
  const [location, setLocation] = useState<any | null>(null);
  const [tick, setTick] = useState(0); // increments each 10s for live timer

  const { getCurrentLocation } = useGPSCoordinates();

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canOverride = OVERRIDE_ROLES.includes(user?.userRole ?? '');
  const canEmergencyOff = canOverride;
  const canBroadcast = ['CorpAdmin', 'userAdmin'].includes(user?.userRole ?? '');

  // ── Live ticker (increments every 10s so UI stays fresh without re-fetching)
  useEffect(() => {
    if (dutyStatus === 'ON') {
      tickRef.current = setInterval(() => setTick((t) => t + 1), 10_000);
    } else {
      if (tickRef.current) clearInterval(tickRef.current);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [dutyStatus]);

  // ── Out-of-bounds check (read from AsyncStorage written by background task)
  useEffect(() => {
    if (dutyStatus !== 'ON') return;
    const check = async () => {
      const mismatch = await AsyncStorage.getItem(GEO_MISMATCH_KEY);
      setIsOutOfBounds(mismatch === 'true');
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [dutyStatus]);

  // ── Reset duty and profile when corporate changes to avoid showing old corporate data ──
  useEffect(() => {
    setActiveDuty(null);
    setDutyStatus('OFF');
    setEmployeeProfile(null);
  }, [user?.dbName]);

  // ── Bootstrap: restore active duty from backend on mount
  useEffect(() => {
    if (!employeeId || !token || !user?.dbName) return;
    (async () => {
      try {
        const res = await appService.getActiveDuty(employeeId, token);
        if (res?.data) {
          setActiveDuty(res.data);
          setDutyStatus('ON');
          if (res.data.shiftCode) setSelectedShift(res.data.shiftCode);

          // ─── Proximity check for supervisor marked duty ───
          if (res.data.markedByDevice === false && res.data.siteLat && res.data.siteLong) {
            GPSService.getCurrentLocation().then((currentLoc) => {
              if (currentLoc) {
                const dist = haversineM(
                  currentLoc.latitude,
                  currentLoc.longitude,
                  Number(res.data.siteLat),
                  Number(res.data.siteLong)
                );
                if (dist > 100) {
                  Alert.alert(
                    'Duty Location Mismatch',
                    'You are not at your duty site. Please reach your duty location or close your duty.',
                    [{ text: 'OK' }]
                  );
                }
              }
            }).catch((err) => {
              console.warn('[useAttendance] Proximity check failed:', err?.message);
            });
          }

          // Alert if duty has exceeded shift hours
          const lockHrs = res.data.shiftLockHours || 8;
          const elapsedHrs = (Date.now() - new Date(res.data.dutyStart).getTime()) / 3600000;
          if (elapsedHrs > lockHrs) {
            Alert.alert(
              'Shift Expired',
              `Your duty has exceeded the scheduled ${lockHrs} hours. Please close the duty to start a new shift.`,
              [{ text: 'OK' }]
            );
          }
        } else {
          // ─── FIX: Backend confirms duty is OFF — clear any stale AsyncStorage
          // This is the root cause of "clear cache and data fixes it":
          // a previous session left DUTY_INFO_KEY in storage, causing background
          // tasks and useLiveTracker to think duty is still ON.
          AsyncStorage.multiRemove([
            DUTY_INFO_KEY,
            GEO_MISMATCH_KEY,
            'last_recorded_location',
          ]).catch(() => {});
          setActiveDuty(null);
          setDutyStatus('OFF');
        }
      } catch {
        /* silently ignore */
      }
    })();
  }, [employeeId, token, user?.dbName]);


  // ── Fetch Employee Profile to get assigned shift
  useEffect(() => {
    if (!employeeId || !token || !user?.dbName) return;

    const applyProfile = (empData: any) => {
      setEmployeeProfile(empData);

      // Priority 1: check dutyShift (profile shift info from fallback userMaster)
      if (empData.dutyShift?.shiftName) {
        const { shiftName, groupName } = empData.dutyShift;
        let code = '';
        if (groupName === 'MANG') {
          if (shiftName === 'Morning') code = 'M';
          else if (shiftName === 'Afternoon') code = 'A';
          else if (shiftName === 'Night') code = 'N';
          else if (shiftName === 'General') code = 'G';
        } else if (groupName === 'DaNi') {
          if (shiftName === 'Day') code = 'D';
          else if (shiftName === 'Night') code = 'N2';
        }
        setSelectedShift(code || empData.dutyShift.shiftName);
        return;
      }

      // Priority 2: Derive shift code from active employmentHistory entry (canonical source of truth)
      const activeHistEntry =
        empData.employmentHistory?.find((e: any) => e.active) ||
        (empData.employmentHistory?.length
          ? empData.employmentHistory[empData.employmentHistory.length - 1]
          : null);

      if (activeHistEntry) {
        const { shiftName, groupName } = activeHistEntry;
        let code = '';
        if (groupName === 'MANG') {
          if (shiftName === 'Morning') code = 'M';
          else if (shiftName === 'Afternoon') code = 'A';
          else if (shiftName === 'Night') code = 'N';
          else if (shiftName === 'General') code = 'G';
        } else if (groupName === 'DaNi') {
          if (shiftName === 'Day') code = 'D';
          else if (shiftName === 'Night') code = 'N2';
        }
        if (code) {
          setSelectedShift(code);
          return;
        }
      }

      // Priority 3: root-level selectedShift (synced from employmentHistory on save)
      if (empData.selectedShift) {
        setSelectedShift(empData.selectedShift);
      } else {
        const activeEntry = empData.employmentHistory?.find((e: any) => e.active);
        if (activeEntry && activeEntry.shiftName) {
          setSelectedShift(activeEntry.shiftName);
        }
      }
    };

    (async () => {
      // 1. Fetch userMaster profile (if available) to get latest dutyShift config
      let userMasterProfile: any = null;
      try {
        const res = await appService.httpClient.get('setting/update/user', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.data?.data?.user) {
          userMasterProfile = res.data.data.user;
        }
      } catch (e) {
        // ignore
      }

      // 2. Fetch local corporate employee profile
      try {
        let empData;
        try {
          const res = await appService.getEmployee(employeeId, token);
          if (res?.data) empData = res.data;
        } catch (e: any) {
          if (e.response?.status === 404) {
            // Try 1: Search by mobile
            let mobileNumber = user?.mobile || (user as any)?.userMobile;
            if (!mobileNumber && token) {
              try {
                const { jwtDecode } = require('jwt-decode');
                const decoded: any = jwtDecode(token);
                mobileNumber = decoded.ownMobile;
              } catch (decodeErr) {
                /* ignore */
              }
            }

            if (mobileNumber) {
              try {
                const searchRes = await appService.httpClient.get('service/hr/employees', {
                  params: { mobile: mobileNumber },
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (searchRes.data?.success && searchRes.data.data.length > 0) {
                  empData = searchRes.data.data[0];
                }
              } catch (err) {
                // ignore
              }
            }

            // Try 2: Search by name if mobile search failed or mobile was missing
            if (!empData && user?.userDisplayName) {
              try {
                const searchRes = await appService.httpClient.get('service/hr/employees', {
                  params: { name: user.userDisplayName },
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (searchRes.data?.success && searchRes.data.data.length > 0) {
                  empData = searchRes.data.data[0];
                }
              } catch (err) {
                // ignore
              }
            }

            if (!empData) {
              throw e; // Rethrow original 404 if both fallbacks fail
            }
          } else {
            throw e;
          }
        }

        // 3. Merge or fallback
        const isReg =
          userMasterProfile?.userRole ||
          userMasterProfile?.role ||
          (!userMasterProfile?.employmentHistory && userMasterProfile?.dutyShift);
        if (isReg && userMasterProfile) {
          applyProfile(userMasterProfile);
        } else if (empData) {
          if (userMasterProfile) {
            empData = {
              ...empData,
              dutyShift: userMasterProfile.dutyShift || empData.dutyShift,
            };
          }
          applyProfile(empData);
        } else if (userMasterProfile) {
          applyProfile(userMasterProfile);
        }
      } catch (err) {
        if (userMasterProfile) {
          applyProfile(userMasterProfile);
        }
      }
    })();
  }, [employeeId, token, user?.dbName]);

  // ── Compute assigned shift details from employeeProfile
  const assignedShiftDetails = useMemo(() => {
    return getEmployeeShiftDetails(employeeProfile);
  }, [employeeProfile]);

  // ── Sync state across hook instances on the same device
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('ATTENDANCE_RECORD_CHANGED', (data: any) => {
      if (data.employeeId === employeeId) {
        setDutyStatus(data.status);
        setActiveDuty(data.activeDuty);
        if (data.selectedShift) setSelectedShift(data.selectedShift);
      }
    });
    return () => sub.remove();
  }, [employeeId]);

  // ── Socket Listener for automatic duty status changes
  useEffect(() => {
    if (!employeeId) return;
    const socket = getSocket();

    const handleDutyOn = (data: any) => {
      if (String(data.employeeId) === String(employeeId)) {
        setDutyStatus('ON');
        // Fetch full active duty to be safe
        appService
          .getActiveDuty(employeeId, token)
          .then(async (res) => {
            if (res?.data) {
              setActiveDuty(res.data);
              if (res.data.shiftCode) setSelectedShift(res.data.shiftCode);
              DeviceEventEmitter.emit('ATTENDANCE_RECORD_CHANGED', {
                employeeId,
                status: 'ON',
                activeDuty: res.data,
                selectedShift: res.data.shiftCode || selectedShift,
              });

              // ── AsyncStorage sync: write active_duty_info so background geo
              // task and useLiveTracker read fresh data on ALL devices ──────────
              try {
                const baseURL = appService.httpClient.defaults.baseURL || '';
                await AsyncStorage.setItem(
                  DUTY_INFO_KEY,
                  JSON.stringify({
                    attendanceId: res.data._id,
                    token,
                    dbName: user?.dbName ?? null,
                    baseURL,
                    siteLat: res.data.location?.lat ?? null,
                    siteLong: res.data.location?.long ?? null,
                    siteName: res.data.site_name ?? null,
                  })
                );
              } catch (e) {
                console.warn('[useAttendance] AsyncStorage duty_on sync failed:', e);
              }
            }
          })
          .catch(() => {});
      }
    };

    const handleDutyOff = (data: any) => {
      if (String(data.employeeId) === String(employeeId)) {
        setDutyStatus('OFF');
        setActiveDuty(null);
        DeviceEventEmitter.emit('ATTENDANCE_RECORD_CHANGED', {
          employeeId,
          status: 'OFF',
          activeDuty: null,
          selectedShift,
        });

        // ── AsyncStorage sync: clear duty info so background geo task stops ──
        AsyncStorage.multiRemove([DUTY_INFO_KEY, GEO_MISMATCH_KEY, 'last_recorded_location']).catch(
          (e) => console.warn('[useAttendance] AsyncStorage duty_off clear failed:', e)
        );
      }
    };

    socket.on('attendance:duty_on', handleDutyOn);
    socket.on('attendance:duty_off', handleDutyOff);
    socket.on('attendance:emergency_end', handleDutyOff);

    return () => {
      socket.off('attendance:duty_on', handleDutyOn);
      socket.off('attendance:duty_off', handleDutyOff);
      socket.off('attendance:emergency_end', handleDutyOff);
    };
  }, [employeeId, token]);

  // ─── Format elapsed duration ───────────────────────────────────────────────
  const formatDuration = useCallback(
    (startIso: string): string => {
      const diffMs = Date.now() - new Date(startIso).getTime();
      const totalSec = Math.floor(diffMs / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },
    [tick]
  ); // tick dependency keeps it live

  // ─── Start Background Tracking ─────────────────────────────────────────────
  const startBackgroundTracking = useCallback(
    async (attendanceId: string, siteLocation?: { lat?: number; long?: number }) => {
      try {
        // Exemption check: Admins and workers are exempt from tracking
        const userRole = user?.userRole || employeeProfile?.userRole || employeeProfile?.role;
        const isAdmin = ['CorpAdmin', 'userAdmin', 'Admin'].includes(userRole || '');
        const isWorker = !!(
          employeeProfile?.employmentHistory && employeeProfile.employmentHistory.length > 0
        );
        const isRegistered = !!(
          userRole ||
          (!employeeProfile?.employmentHistory && employeeProfile?.dutyShift)
        );
        const isExempt = isAdmin || isWorker || !isRegistered;

        // Write duty info for the background task to read
        const baseURL = appService.httpClient.defaults.baseURL || '';
        await AsyncStorage.setItem(
          DUTY_INFO_KEY,
          JSON.stringify({
            attendanceId,
            token,
            dbName: user?.dbName ?? null,
            baseURL,
            siteLat: siteLocation?.lat ?? null,
            siteLong: siteLocation?.long ?? null,
            isExempt,
          })
        );

        if (isExempt) {
          console.log(
            '[useAttendance] User is exempt from tracking. Skipping location updates registration.'
          );
          return;
        }

        let fg = 'denied';
        try {
          const fgResult = await Location.requestForegroundPermissionsAsync();
          fg = fgResult.status;
        } catch (permErr: any) {
          console.warn('[useAttendance] Foreground permission request failed:', permErr?.message);
        }
        if (fg !== 'granted') {
          // Non-blocking: log a warning but allow duty to proceed (location will be null)
          console.warn('[useAttendance] Foreground location permission not granted — tracking skipped.');
          return;
        }
        try {
          const bgResult = await Location.requestBackgroundPermissionsAsync();
          if (bgResult.status !== 'granted') {
            console.warn('[useAttendance] Background location permission not granted — background tracking skipped.');
          }
        } catch (bgErr: any) {
          console.warn('[useAttendance] Background permission request failed:', bgErr?.message);
        }

        const isRegisteredTask = await TaskManager.isTaskRegisteredAsync(GEO_TRACKING_TASK);
        if (isRegisteredTask) {
          await Location.stopLocationUpdatesAsync(GEO_TRACKING_TASK).catch(() => {});
        }

        await Location.startLocationUpdatesAsync(GEO_TRACKING_TASK, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 60 * 1000, // every 60 seconds (battery-saving)
          distanceInterval: 50, // OR every 50 metres
          foregroundService: {
            notificationTitle: '🟢 On Duty',
            notificationBody: `Shift ${selectedShift} — tracking active`,
            notificationColor: '#10B981',
          },
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
        });
      } catch (err: any) {
        console.warn('[useAttendance] startBackgroundTracking failed:', err.message);
      }
    },
    [token, selectedShift, user, employeeProfile]
  );

  // ── Start background tracking when duty goes ON and profile is loaded
  useEffect(() => {
    if (dutyStatus !== 'ON' || !activeDuty || !employeeProfile) return;
    const attendanceId = activeDuty._id || activeDuty.id;
    if (!attendanceId) return;

    startBackgroundTracking(attendanceId, {
      lat: activeDuty.siteLat || activeDuty.startLat,
      long: activeDuty.siteLong || activeDuty.startLong,
    });
  }, [dutyStatus, activeDuty, employeeProfile, startBackgroundTracking]);

  // ─── Stop Background Tracking ──────────────────────────────────────────────
  const stopBackgroundTracking = useCallback(async () => {
    try {
      const isRunning = await TaskManager.isTaskRegisteredAsync(GEO_TRACKING_TASK);
      if (isRunning) await Location.stopLocationUpdatesAsync(GEO_TRACKING_TASK);
      await AsyncStorage.removeItem(DUTY_INFO_KEY);
      await AsyncStorage.removeItem(GEO_MISMATCH_KEY);
      await AsyncStorage.removeItem('last_recorded_location');
    } catch (err: any) {
      console.warn('[useAttendance] stopBackgroundTracking failed:', err.message);
    }
  }, []);

  // ─── Start Duty (ON) ───────────────────────────────────────────────────────
  const startDuty = useCallback(
    async (siteName?: string, leadId?: string, requestPermission = false) => {
      if (!employeeId || !token) {
        appService.showToast('Unable to start duty. Missing user session or token.', 'Error');
        return;
      }
      setIsLoading(true);
      let payload: any = null;
      try {
        // ─── GPS location: gracefully handle denied/unavailable ───────────────
        let locData: any = null;
        try {
          locData = await getCurrentLocation();
          setLocation(locData);
        } catch (locErr: any) {
          console.warn('[useAttendance] Could not get location (continuing without it):', locErr?.message);
        }

        // ─── Late Check (Flag as late if > 30 mins after shift start) ───────────
        const nowTime = new Date(appService.getIST());
        const [startH, startM] = (assignedShiftDetails.startTime || '09:00').split(':').map(Number);
        const shiftStart = new Date(nowTime);
        shiftStart.setHours(startH, startM, 0, 0);

        let diffMins = (nowTime.getTime() - shiftStart.getTime()) / 60000;
        // Handle cross-day shifts
        if (diffMins < -12 * 60) {
          diffMins += 24 * 60;
        } else if (diffMins > 12 * 60) {
          diffMins -= 24 * 60;
        }
        const isLate = diffMins > 30;

        const isSpecialAction = ['CorpAdmin', 'userAdmin'].includes(user?.userRole || '');
        if (!isSpecialAction && !requestPermission) {
          if (diffMins < -15) {
            Alert.alert(
              'Too Early',
              `Too early to start duty. Shift starts at ${assignedShiftDetails.startTime}. You can only start up to 15 minutes before the shift starts.`,
              [{ text: 'OK' }]
            );
            setIsLoading(false);
            return;
          }
          if (diffMins > 60) {
            Alert.alert('Permission Required', `You are over 60 minutes late for your ${assignedShiftDetails.startTime} shift. Request permission to start?`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Request', onPress: () => startDuty(siteName, leadId, true) },
            ]);
            setIsLoading(false);
            return;
          }
        }
        // ─── Fallback to persisted site if not provided (e.g. from drawer) ───
        let sName = siteName;
        let lId = leadId;
        if (!sName || !lId) {
          try {
            const siteStr = await AsyncStorage.getItem('selected_site');
            if (siteStr) {
              const site = JSON.parse(siteStr);
              sName = sName || site?.sender_name;
              lId = lId || site?._id;
            }
          } catch { /* ignore storage error */ }
        }

        payload = {
          employeeId,
          type: 'ON' as const,
          lat: locData?.latitude ?? null,
          long: locData?.longitude ?? null,
          address: locData?.formattedAddress ?? null,
          shiftCode: selectedShift,
          shiftType: assignedShiftDetails.shiftType,
          shiftPeriod: assignedShiftDetails.shiftPeriod,
          shiftLockHours: assignedShiftDetails.durationHrs,
          startTime: assignedShiftDetails.startTime,
          site_name: sName || 'HQ/Remote',
          leadId: lId,
          isLate,
          requestPermission,
        };
        const response = await appService.httpClient.post('service/hr/attendance/toggle', payload, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const res = response.data;

        if (res?.success) {
          const dutyRecord = res?.data ?? res?.attendance ?? null;
          setActiveDuty(dutyRecord);
          setDutyStatus('ON');

          DeviceEventEmitter.emit('ATTENDANCE_RECORD_CHANGED', {
            employeeId,
            status: 'ON',
            activeDuty: dutyRecord,
            selectedShift,
          });

          // ─── Safe background tracking: dutyRecord may not have _id in all cases
          const attendanceId = dutyRecord?._id ?? dutyRecord?.id ?? '';
          if (attendanceId) {
            await startBackgroundTracking(attendanceId, {
              lat: locData?.latitude,
              long: locData?.longitude,
            });
          }
          const lateMsg = isLate ? ' ⚠️ Late' : '';
          appService.showToast(`Shift ${selectedShift} started ✅${lateMsg}`, 'Success');
        } else {
          appService.showToast(res?.message || 'Failed to start duty', 'Error');
        }
      } catch (err: any) {
        console.log('[useAttendance] Error in startDuty:', err.message || err);
        const resData = err?.response?.data;
        if (resData?.tooEarly) {
          Alert.alert(
            'Too Early',
            resData.message ||
              `Too early to start duty. Shift starts at ${assignedShiftDetails.startTime}. You can only start up to 15 minutes before the shift starts.`,
            [{ text: 'OK' }]
          );
        } else if (resData?.tooLate) {
          Alert.alert('Permission Required', resData.message, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Request Permission',
              onPress: () => startDuty(siteName, leadId, true),
            },
          ]);
        } else {
          // ─── Save locally if network fails or any other error ──
          console.log('[useAttendance] Marking attendance locally due to error');
          await logAttendanceToSQLite(payload);
          appService.showToast('Network error or server rejected. Attendance saved locally!', 'Info');
        }
      } finally {
        setIsLoading(false);
      }
    },
    [employeeId, token, selectedShift, startBackgroundTracking, assignedShiftDetails.startTime]
  );

  // ─── End Duty (OFF) ────────────────────────────────────────────────────────
  const endDuty = useCallback(
    async (force = false, reason?: string, emergencyOff = false) => {
      if (!employeeId || !token || !activeDuty) return;
      setIsLoading(true);
      try {
        const locData = await getCurrentLocation().catch(() => null);
        const lockHrs = activeDuty.shiftLockHours || assignedShiftDetails.durationHrs || 8;
        const elapsedHrs = (Date.now() - new Date(activeDuty.dutyStart).getTime()) / 3600000;

        const isRestrictedRole = user?.userRole === 'Project' || !user?.userRole;

        // Scheduled end time = scheduled shift start + duration
        const schedEnd = activeDuty.dutyEndScheduled
          ? new Date(activeDuty.dutyEndScheduled).getTime()
          : new Date(activeDuty.dutyStart).getTime() + lockHrs * 3600000;

        const isEarlyEnd = Date.now() < schedEnd - 15 * 60 * 1000;

        if (isEarlyEnd && !force && isRestrictedRole) {
          Alert.alert(
            'Early End Duty Permission',
            'You are ending duty more than 15 minutes before your scheduled end time. Request permission from Admin to end early?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Request',
                onPress: () => endDuty(true, 'Requested early end duty'),
              },
            ]
          );
          setIsLoading(false);
          return;
        }

        // Fallback shift lock check for non-restricted/non-override roles
        let minRequiredHrs = lockHrs;
        if (lockHrs === 8) minRequiredHrs = 7.5;
        if (lockHrs === 12) minRequiredHrs = 11.5;
        const isLocked = elapsedHrs < minRequiredHrs;
        const canOverride = ['corpadmin', 'project', 'sales', 'finance', 'useradmin'].includes((user?.userRole || '').toLowerCase());

        if (isLocked && !force && !canOverride && !isRestrictedRole) {
          Alert.alert(
            "Can't off duty without HR permission",
            `Shift ${activeDuty.shiftCode || selectedShift} requires at least ${minRequiredHrs}h. You have only worked ${elapsedHrs.toFixed(1)}h.`,
            [{ text: 'OK' }]
          );
          setIsLoading(false);
          return;
        }
        const response = await appService.httpClient.post('service/hr/attendance/toggle', {
            employeeId,
            type: 'OFF',
            lat: locData?.latitude,
            long: locData?.longitude,
            address: locData?.formattedAddress,
            forcedOff: force,
            forcedOffReason: reason,
            emergencyOff: emergencyOff,
            emergencyReason: emergencyOff ? reason : undefined,
          }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const res = response.data;

        if (res?.success) {
          setActiveDuty(null);
          setDutyStatus('OFF');

          DeviceEventEmitter.emit('ATTENDANCE_RECORD_CHANGED', {
            employeeId,
            status: 'OFF',
            activeDuty: null,
            selectedShift,
          });

          await stopBackgroundTracking();
          appService.showToast(
            `Duty ended — ${res.data?.hoursWorked?.toFixed(1) ?? '?'}h worked`,
            'Success'
          );
        } else if (res?.locked) {
          Alert.alert('🔒 Shift Locked', res.message || 'Cannot end duty yet', [{ text: 'OK' }]);
        } else {
          appService.showToast(res?.message || 'Failed to end duty', 'Error');
        }
      } catch (err: any) {
        const serverMsg = err?.response?.data?.message || err.message;
        if (err?.response?.data?.locked) {
          Alert.alert('🔒 Shift Locked', serverMsg);
        } else {
          appService.showToast(serverMsg || 'Failed to end duty', 'Error');
          // Auto-fix local state if the backend says the duty is already off
          if (err?.response?.status === 404 || serverMsg === 'No active duty session found') {
            setActiveDuty(null);
            setDutyStatus('OFF');
            DeviceEventEmitter.emit('ATTENDANCE_RECORD_CHANGED', {
              employeeId,
              status: 'OFF',
              activeDuty: null,
              selectedShift,
            });
            await stopBackgroundTracking();
          }
        }
      } finally {
        setIsLoading(false);
      }
    },
    [employeeId, token, activeDuty, selectedShift, canOverride, stopBackgroundTracking]
  );

  // ─── Toggle Duty ───────────────────────────────────────────────────────────
  const toggleDuty = useCallback(async () => {
    if (dutyStatus === 'OFF') {
      await startDuty();
    } else {
      await endDuty();
    }
  }, [dutyStatus, startDuty, endDuty]);

  // ─── Emergency All-Off (Project / Admin / CorpAdmin only) ─────────────────
  const emergencyEndEmployee = useCallback(
    async (empId: string, reason: string) => {
      if (!canEmergencyOff) {
        appService.showToast(
          'Access denied. Only Project Users and Admins can trigger emergency shutdown.',
          'Error'
        );
        return;
      }
      Alert.alert(
        '🆘 Emergency End Duty',
        `End this employee's duty immediately before shift lock expires?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'End Duty Now',
            style: 'destructive',
            onPress: async () => {
              setIsLoading(true);
              try {
                // 🚀 Fixed: Use emergencyEndEmployee instead of emergencyAllOff
                const res = await (appService as any).emergencyEndEmployee(
                  user?.userId ?? '',
                  'Emergency end by supervisor',
                  token
                );
                if (res?.success) {
                  // Also end own duty if on
                  if (dutyStatus === 'ON') {
                    setActiveDuty(null);
                    setDutyStatus('OFF');
                    await stopBackgroundTracking();
                  }
                  appService.showToast(`Emergency duty end applied ✅`, 'Success');
                } else {
                  appService.showToast(res?.message || 'Emergency end failed', 'Error');
                }
              } catch (err: any) {
                appService.showToast(
                  err?.response?.data?.message || 'Emergency end failed',
                  'Error'
                );
              } finally {
                setIsLoading(false);
              }
            },
          },
        ]
      );
    },
    [user?.userId, token, dutyStatus, stopBackgroundTracking]
  );

  // ─── Shift Complete Check ──────────────────────────────────────────────────
  // Auto-end duty if scheduled end time is reached
  useEffect(() => {
    if (!activeDuty || !activeDuty.dutyEndScheduled || dutyStatus === 'OFF') return;

    const intervalId = setInterval(() => {
      const scheduledEnd = new Date(activeDuty.dutyEndScheduled).getTime();
      const now = Date.now();

      if (now >= scheduledEnd && !isLoading) {
        console.log('[useAttendance] Auto-ending duty because scheduled time reached');
        endDuty();
      }
    }, 60000); // Check every 60 seconds

    // Immediate check on mount/update
    const scheduledEnd = new Date(activeDuty.dutyEndScheduled).getTime();
    if (Date.now() >= scheduledEnd && !isLoading) {
      console.log('[useAttendance] Auto-ending duty because scheduled time reached');
      endDuty();
    }

    return () => clearInterval(intervalId);
  }, [activeDuty, dutyStatus, endDuty, isLoading]);

  const isShiftComplete = useMemo(() => {
    if (!activeDuty) return false;
    const lockHrs = activeDuty.shiftLockHours || assignedShiftDetails.durationHrs || 8;
    const elapsedHrs = (Date.now() - new Date(activeDuty.dutyStart).getTime()) / 3600000;

    let minRequiredHrs = lockHrs;
    if (lockHrs === 8) minRequiredHrs = 7.5;
    if (lockHrs === 12) minRequiredHrs = 11.5;

    return elapsedHrs >= minRequiredHrs;
  }, [activeDuty, selectedShift, tick]);

  // ─── Continue Into Next Shift (Double Shift) ──────────────────────────────
  const continueShift = useCallback(async () => {
    if (!employeeId || !token || !activeDuty) return;
    setIsLoading(true);
    try {
      const locData = await getCurrentLocation().catch(() => null);

      const res = await appService.continueShift(
        {
          employeeId,
          nextShiftCode: 'Continued',
          nextShiftType: assignedShiftDetails.shiftType as '8hr' | '12hr',
          nextShiftPeriod: 'Continued',
          lat: locData?.latitude,
          long: locData?.longitude,
          address: locData?.formattedAddress,
          site_name: activeDuty.site_name,
          leadId: activeDuty.leadId,
        },
        token
      );

      if (res?.success) {
        setActiveDuty(res.data);

        DeviceEventEmitter.emit('ATTENDANCE_RECORD_CHANGED', {
          employeeId,
          status: 'ON',
          activeDuty: res.data,
          selectedShift: 'Continued',
        });

        appService.showToast(`Shift continued ✅`, 'Success');
      } else {
        appService.showToast(res?.message || 'Failed to change shift', 'Error');
      }
    } catch (err: any) {
      appService.showToast(err?.response?.data?.message || 'Failed to change shift', 'Error');
    } finally {
      setIsLoading(false);
    }
  }, [employeeId, token, activeDuty, selectedShift]);

  return {
    // State
    activeDuty,
    dutyStatus,
    selectedShift,
    isLoading,
    isOutOfBounds,
    location,
    tick,
    // Shift config removed
    // Computed
    canOverride,
    canEmergencyOff,
    canBroadcast,
    isShiftComplete,
    // Actions
    setSelectedShift,
    startDuty,
    endDuty,
    toggleDuty,
    emergencyEndEmployee,
    continueShift,
    startBackgroundTracking,
    stopBackgroundTracking,
    // Helpers
    formatDuration,
    employeeProfile,
    assignedShiftDetails,
  };
}
