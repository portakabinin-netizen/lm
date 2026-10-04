import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState, AppStateStatus, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GPSService } from '../services/GPSService';
import { LiveTrackingService } from '../services/LiveTrackingService';
import { LocationSyncService } from '../services/LocationSyncService';
import { LocationResolverService } from '../services/LocationResolverService';
import { DistanceService } from '../services/DistanceService';
import { GPS_CONSTANTS } from '../constants/gps';
import { appService } from '../UtilServices/appHelper';
import { useAuthContext } from '../context/AuthContext';
import { TrackingPoint } from '../types/gps';

export type UnifiedLocationMode = 'LiveTracker' | 'reverseAddress' | 'nearBy' | 'geofencing';

const DUTY_INFO_KEY = 'active_duty_info';

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useUnifiedLocation(initialMode?: UnifiedLocationMode, options: any = {}) {
  const { user } = useAuthContext();
  
  // Shared States
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<TrackingPoint | null>(null);

  // LiveTracker Screen States
  const [activeStaff, setActiveStaff] = useState<any[]>([]);
  const [geoHistory, setGeoHistory] = useState<TrackingPoint[]>([]);
  const [dutyOn, setDutyOn] = useState(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastSyncedLocation = useRef<TrackingPoint | null>(null);

  // reverseAddress Screen States
  const [address, setAddress] = useState<any | null>(null);

  // nearBy Screen States
  const [fetchedLeads, setFetchedLeads] = useState<any[]>([]);

  // geofencing Screen States
  const [isWithinRange, setIsWithinRange] = useState<boolean | null>(null);
  const [distanceToTarget, setDistanceToTarget] = useState<number | null>(null);

  // Fetch database leads/sites if in nearBy mode and no sites list is passed in options
  useEffect(() => {
    const activeMode = initialMode || options.mode;
    if (activeMode === 'nearBy' && !options.sites && user) {
      LocationResolverService.getLeadLocations(user)
        .then((res) => {
          setFetchedLeads(res);
        })
        .catch(() => {});
    }
  }, [user, initialMode, options.mode, options.sites]);

  // Synchronous reactive calculation of nearby sites & matches based on currentLocation
  const { nearbySites, nearMatchedSites } = useMemo(() => {
    const sitesToFilter = options.sites || fetchedLeads;
    if (!currentLocation || !sitesToFilter) {
      return { nearbySites: [], nearMatchedSites: [] };
    }

    const deviceGeo = { latitude: currentLocation.latitude, longitude: currentLocation.longitude };
    const maxDist = options.maxDistance ?? GPS_CONSTANTS.DEFAULT_MAX_DISTANCE;

    const sitesWithDistance = sitesToFilter.map((site: any) => {
      const lat = site.location?.lat;
      const long = site.location?.long;

      const dist = DistanceService.calculateDistance(
        deviceGeo,
        (lat && long) ? { latitude: Number(lat), longitude: Number(long) } : null
      );

      return {
        ...site,
        distance: dist
      };
    });

    const filtered = sitesWithDistance
      .filter((site: any) => site.distance !== null && site.distance <= maxDist)
      .sort((a: any, b: any) => (a.distance ?? 999999) - (b.distance ?? 999999));

    const matched = filtered.filter((site: any) => (site.distance ?? 999999) <= 500);

    return { nearbySites: filtered, nearMatchedSites: matched };
  }, [currentLocation, options.sites, fetchedLeads, options.maxDistance]);

  // --- REUSABLE SERVICE WORKERS (ON-DEMAND CALLS) ---

  // Get current raw device coordinates
  const getDeviceLocation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loc = await GPSService.getCurrentLocation();
      setCurrentLocation(loc);
      return loc;
    } catch (err: any) {
      setError(err?.message || 'Failed to get location');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch active staff (for LiveTracker)
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

  // LiveTracker map location refresher
  const refreshLiveTrackerLocation = useCallback(async () => {
    try {
      const loc = await GPSService.getCurrentLocation();
      setCurrentLocation(loc);
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

  // reverseAddress worker
  const getReverseAddress = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loc = await GPSService.getCurrentLocationWithAddress();
      if (loc) {
        setAddress(loc);
        setCurrentLocation({
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: null,
          speed: null,
          heading: null,
          timestamp: Date.now(),
          type: 'tick',
          isMocked: false
        });
      }
      return loc;
    } catch (err: any) {
      setError(err?.message || 'Failed to get address details');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // nearBy worker - simply resolves/updates current device location
  const getNearbySites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loc = await GPSService.getCurrentLocation();
      setCurrentLocation(loc);
      return loc;
    } catch (err: any) {
      setError(err?.message || 'Failed to search nearby sites');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // geofencing / site validation worker
  const validateSite = useCallback(async (targetLat: number, targetLng: number, threshold = 50) => {
    setLoading(true);
    setError(null);
    try {
      const loc = await GPSService.getCurrentLocation();
      setCurrentLocation(loc);

      const dist = DistanceService.calculateDistance(
        { latitude: loc.latitude, longitude: loc.longitude },
        { latitude: targetLat, longitude: targetLng }
      );

      setDistanceToTarget(dist);
      const within = dist !== null && dist <= threshold;
      setIsWithinRange(within);

      return { within, distance: dist };
    } catch (err: any) {
      setError(err?.message || 'Failed to perform geofence check');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // --- SWITCH CASE CONTROLLER FOR SCREEN-BASED EFFECT TRIGGERS ---
  useEffect(() => {
    const activeMode = initialMode || options.mode;
    if (!activeMode) return;

    switch (activeMode) {
      case 'LiveTracker': {
        // Initialize Duty Status
        AsyncStorage.getItem(DUTY_INFO_KEY).then((stored) => {
          setDutyOn(!!stored);
        });

        // Listen to changes from useAttendance
        const sub = DeviceEventEmitter.addListener(
          'ATTENDANCE_RECORD_CHANGED',
          (data: { status: 'ON' | 'OFF' }) => {
            setDutyOn(data.status === 'ON');
          }
        );

        // Load Cache
        import('../services/LocationCacheService').then(({ LocationCacheService }) => {
          LocationCacheService.getRawGPS().then((cached) => {
            if (cached) setCurrentLocation(cached);
          });
        });

        // Fresh fix on mount
        GPSService.getCurrentLocation()
          .then((loc) => {
            setCurrentLocation(loc);
          })
          .catch(() => {});

        // Foreground watcher
        let isMounted = true;
        let watcherSub: any = null;
        GPSService.watchLocation((point) => {
          if (isMounted) {
            setCurrentLocation(point);
          }
        })
          .then((sub) => {
            if (isMounted) watcherSub = sub;
            else sub.remove();
          })
          .catch(() => {});

        // Subscribe to LiveTrackingService
        const trackingSub = LiveTrackingService.subscribe((state) => {
          if (isMounted && state.currentLocation) {
            setCurrentLocation(state.currentLocation);
          }
          if (isMounted) {
            setGeoHistory(state.route);
          }
        });

        // Sync Active Staff and Sockets
        fetchActiveStaff();
        let socket: any = null;
        appService.getSession().then((session) => {
          if (session?.dbName) {
            import('./Socket').then(({ getSocket, joinTenantRoom }) => {
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
          isMounted = false;
          sub.remove();
          trackingSub();
          if (watcherSub) watcherSub.remove();
          clearInterval(interval);
          appStateSub.remove();
          if (socket) {
            socket.off('attendance:geo_update');
            socket.off('attendance:duty_on');
            socket.off('attendance:duty_off');
          }
        };
      }

      case 'reverseAddress': {
        getReverseAddress();
        break;
      }

      case 'nearBy': {
        getNearbySites();
        if (options.autoRefresh !== false) {
          const interval = setInterval(() => {
            getNearbySites();
          }, options.refreshInterval || 30000);
          return () => clearInterval(interval);
        }
        break;
      }

      case 'geofencing': {
        if (options.targetLat && options.targetLng) {
          validateSite(options.targetLat, options.targetLng, options.threshold);
        }
        break;
      }

      default:
        break;
    }
  }, [
    initialMode,
    options.mode,
    options.targetLat,
    options.targetLng,
    options.threshold,
    options.autoRefresh,
    options.refreshInterval,
    fetchActiveStaff,
    getReverseAddress,
    getNearbySites,
    validateSite
  ]);

  // LiveTracker side effect: Start/Stop native tracking
  useEffect(() => {
    const activeMode = initialMode || options.mode;
    if (activeMode === 'LiveTracker') {
      if (dutyOn) {
        LiveTrackingService.startTracking();
      } else {
        LiveTrackingService.stopTracking();
        LiveTrackingService.clearRoute();
      }
      return () => {
        LiveTrackingService.stopTracking();
      };
    }
  }, [dutyOn, initialMode, options.mode]);

  // LiveTracker side effect: Sync movement (>500m)
  useEffect(() => {
    const activeMode = initialMode || options.mode;
    if (activeMode === 'LiveTracker' && dutyOn && currentLocation) {
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
              currentLocation.latitude,
              currentLocation.longitude,
              startLat,
              startLong
            );

            const distFromLastSync = lastSyncedLocation.current
              ? haversineM(
                  currentLocation.latitude,
                  currentLocation.longitude,
                  lastSyncedLocation.current.latitude,
                  lastSyncedLocation.current.longitude
                )
              : 500;

            if (distFromSite > 500 && distFromLastSync >= 500) {
              lastSyncedLocation.current = currentLocation;
              appService
                .updateGeoHistory(
                  dutyInfo.attendanceId,
                  {
                    lat: currentLocation.latitude,
                    long: currentLocation.longitude,
                    accuracy: currentLocation.accuracy,
                    speed: currentLocation.speed,
                  },
                  dutyInfo.token
                )
                .catch(() => {});
            }
          }
        } catch {
          // ignore
        }
      });
    }
  }, [currentLocation, dutyOn, activeStaff, initialMode, options.mode]);

  return {
    // Shared states & actions
    loading,
    error,
    currentLocation,
    getDeviceLocation,

    // LiveTracker states & actions
    activeStaff,
    geoHistory,
    dutyOn,
    fetchActiveStaff,
    refreshLiveTrackerLocation,

    // reverseAddress states & actions
    address,
    getReverseAddress,

    // nearBy states & actions
    nearbySites,
    nearMatchedSites,
    getNearbySites,
    formatDistance: DistanceService.formatDistance,
    getDistanceCategory: DistanceService.getDistanceCategory,

    // geofencing states & actions
    isWithinRange,
    distanceToTarget,
    validateSite
  };
}
