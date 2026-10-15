import { appService } from '@/UtilServices/appHelper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, DeviceEventEmitter } from 'react-native';
import { GPSService } from '../services/GPSService';
import { LiveTrackingService } from '../services/LiveTrackingService';
import { LocationSyncService } from '../services/LocationSyncService';
import { TrackingPoint } from '../types/gps';

const DUTY_INFO_KEY = 'active_duty_info';

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useLiveTracker() {
  const [activeStaff, setActiveStaff] = useState<any[]>([]);

  // Track LiveTrackingService State
  const [location, setLocation] = useState<TrackingPoint | null>(null);
  const [geoHistory, setGeoHistory] = useState<TrackingPoint[]>([]);

  // Track Duty
  const [dutyOn, setDutyOn] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // ── Fetch active staff from backend ───────────────────────────────────────
  const fetchActiveStaff = useCallback(async () => {
    try {
      const session = await appService.getSession();
      const token = session?.token;
      if (!token || !session?.dbName) return;
      const res = await appService.getActiveStaff(token);
      if (res?.success) {
        setActiveStaff(res.data);
      }
    } catch {
      // Fail silently
    }
  }, []);

  // ── Bootstrap: check duty status from AsyncStorage ────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(DUTY_INFO_KEY).then((stored) => {
      setDutyOn(!!stored);
    });
  }, []);

  // ── React to duty status changes from useAttendance ───────────────────────
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      'ATTENDANCE_RECORD_CHANGED',
      (data: { status: 'ON' | 'OFF' }) => {
        setDutyOn(data.status === 'ON');
      }
    );
    return () => sub.remove();
  }, []);

  // ── Subscribe to LiveTrackingService state ───────────────────────────────
  useEffect(() => {
    // 1. Instantly load cache
    import('../services/LocationCacheService').then(({ LocationCacheService }) => {
      LocationCacheService.getRawGPS().then((cached) => {
        setLocation((prev) => prev || cached);
      });
    });

    // 2. Fetch fresh location once on mount (so map centers on you even if dutyOff)
    GPSService.getCurrentLocation()
      .then((loc) => {
        setLocation((prev) => (!prev || loc.timestamp > prev.timestamp ? loc : prev));
      })
      .catch(() => {});

    // 3. Start a foreground watcher to keep coordinates fresh in real-time
    let isMounted = true;
    let watcherSub: any = null;
    GPSService.watchLocation((point) => {
      if (isMounted) {
        setLocation((prev) => (!prev || point.timestamp > prev.timestamp ? point : prev));
      }
    })
      .then((sub) => {
        if (isMounted) {
          watcherSub = sub;
        } else {
          sub.remove();
        }
      })
      .catch(() => {});

    const unsubscribe = LiveTrackingService.subscribe((state) => {
      if (isMounted && state.currentLocation) {
        setLocation((prev) =>
          !prev ||
          !prev.timestamp ||
          !state.currentLocation.timestamp ||
          state.currentLocation.timestamp > prev.timestamp
            ? state.currentLocation
            : prev
        );
      }
      if (isMounted) {
        setGeoHistory(state.route);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
      if (watcherSub) watcherSub.remove();
    };
  }, []);

  // ── Start / stop location watcher whenever duty status changes ────────────
  useEffect(() => {
    if (dutyOn) {
      LiveTrackingService.startTracking();
    } else {
      LiveTrackingService.stopTracking();
      LiveTrackingService.clearRoute();
    }
    return () => {
      LiveTrackingService.stopTracking();
    };
  }, [dutyOn]);

  // ── Staff polling + Socket + AppState refresh ─────────────────────────────
  useEffect(() => {
    fetchActiveStaff();

    let socket: any = null;
    appService.getSession().then((session) => {
      if (session?.dbName) {
        import('../hooks/Socket').then(({ getSocket, joinTenantRoom }) => {
          socket = getSocket();
          joinTenantRoom(session.dbName);

          socket.on('attendance:geo_update', (data: { attendanceId: string; tick: any }) => {
            setActiveStaff((prev) =>
              prev.map((staff) => {
                if (staff._id === data.attendanceId) {
                  const ticks = Array.isArray(data.tick) ? data.tick : [data.tick];
                  return { ...staff, geoHistory: [...(staff.geoHistory || []), ...ticks] };
                }
                return staff;
              })
            );
          });

          socket.on('attendance:duty_on', () => fetchActiveStaff());
          socket.on('attendance:duty_off', () => fetchActiveStaff());
        });
      }
    });

    const interval = setInterval(fetchActiveStaff, 300_000);
    const appStateSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        fetchActiveStaff();
      }
      appStateRef.current = nextState;
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
      if (socket) {
        socket.off('attendance:geo_update');
        socket.off('attendance:duty_on');
        socket.off('attendance:duty_off');
      }
    };
  }, [fetchActiveStaff]);

  // ── Sync >100m from start duty ──────────────────────────────────────────
  const lastSyncedLocation = useRef<TrackingPoint | null>(null);

  useEffect(() => {
    if (!dutyOn || !location) return;

    AsyncStorage.getItem(DUTY_INFO_KEY).then((stored) => {
      if (!stored) return;
      try {
        const dutyInfo = JSON.parse(stored);
        if (dutyInfo.isExempt) return;

        const myStaff = activeStaff.find((s) => s._id === dutyInfo.attendanceId);
        const startLat = Number(myStaff?.geoHistory?.[0]?.lat || dutyInfo.siteLat);
        const startLong = Number(myStaff?.geoHistory?.[0]?.long || dutyInfo.siteLong);

        if (startLat && startLong) {
          const distFromSite = haversineM(
            location.latitude,
            location.longitude,
            startLat,
            startLong
          );

          const distFromLastSync = lastSyncedLocation.current
            ? haversineM(
                location.latitude,
                location.longitude,
                lastSyncedLocation.current.latitude,
                lastSyncedLocation.current.longitude
              )
            : 500;

          if (distFromSite > 500 && distFromLastSync >= 500) {
            lastSyncedLocation.current = location;
            appService
              .updateGeoHistory(
                dutyInfo.attendanceId,
                {
                  lat: location.latitude,
                  long: location.longitude,
                  accuracy: location.accuracy,
                  speed: location.speed,
                },
                dutyInfo.token
              )
              .catch(() => {});
          }
        }
      } catch (e) {
        // ignore
      }
    });
  }, [location, dutyOn, activeStaff]);

  /**
   * Refreshes the location instantly, applies it to the visible self-marker,
   * enqueues it, and attempts an immediate sync.
   */
  const refreshLocation = useCallback(async () => {
    try {
      const loc = await GPSService.getCurrentLocation();

      // Apply the fresh fix to local state so the self-marker actually moves —
      // this was previously fetched and discarded, never reaching the map.
      setLocation((prev) => (!prev || loc.timestamp > prev.timestamp ? loc : prev));

      const stored = await AsyncStorage.getItem(DUTY_INFO_KEY);
      if (stored) {
        const dutyInfo = JSON.parse(stored);
        if (!dutyInfo.isExempt) {
          await LocationSyncService.enqueue(loc);
          await LocationSyncService.sync(dutyInfo);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  return {
    activeStaff,
    location,
    geoHistory,
    fetchActiveStaff,
    refreshLocation,
    dutyOn,
  };
}
