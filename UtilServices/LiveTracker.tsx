/**
 * LiveTracker.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * High-performance, clean real-time Live Tracker Map View.
 *
 * Core Features:
 *  • Active Duty Workers from Attendance DB (filtered by !dutyEnd & live sockets).
 *  • Marker ONLY on map — shows ONLY worker image with fallback initial (NO blank circles).
 *  • Geofencing: Displays site boundaries & checks worker proximity (Inside vs In-Transit).
 *  • Movement on Route: Smooth polyline with road-snapping (OSRM).
 *  • Replay Route by Date: Shows route points or clear "No route available" banner.
 *  • Worker Isolation on Selection: Tapping worker isolates their marker, centers camera,
 *    and displays their route history.
 *  • Clean UI: Floating status pills, top controls, and sleek bottom worker card.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Platform,
  Linking,
  Image,
} from 'react-native';
import MapView, { Marker, Polyline, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import Svg, { Circle as SvgCircle, ClipPath, Defs, Image as SvgImage } from 'react-native-svg';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { optimizeCloudinaryUrl } from '@/utils/cloudinaryHelper';
import { appService } from '@/UtilServices/appHelper';
import { getSocket } from '@/hooks/Socket';
import { SmartLocationBuffer } from '@/services/SmartLocationBuffer';
import { LocationSyncService } from '@/services/LocationSyncService';
import { GeofenceService } from '@/services/GeofenceService';
import { useUnifiedLocation } from '@/hooks/useUnifiedLocation';
import { GPS_CONSTANTS } from '@/constants/gps';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface LiveTrackerProps {
  location?: any;
  employee?: any;
  name?: string;
  profileImage?: string;
  currentMatchedSite?: any;
  reverseAddress?: string;
  geoHistory?: any[];
  activeStaff?: any[];
  leads?: any[];
  supervisorMobile?: string;
  onRefresh?: () => void | Promise<void>;
  activeDuty?: any;
  employees?: any[];
  workerId?: string;
  token?: string;
}

export interface NormalizedCoord {
  latitude: number;
  longitude: number;
  timestamp?: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
}

export interface GeofenceSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // in meters
}

export interface WorkerDisplayInfo {
  id: string;
  name: string;
  photoUrl: string | null;
  latitude: number;
  longitude: number;
  isSelf: boolean;
  isInsideGeofence: boolean;
  geofenceSiteName?: string | null;
  shiftName?: string;
  dutyStart?: string | null;
  mobile?: string | null;
  batteryLevel?: number | null;
  lastUpdated?: string | number | null;
  rawStaffData: any;
}

// ─── Utility Functions ────────────────────────────────────────────────────────

const BASE_URL = (appService.httpClient.defaults.baseURL || '').replace(/\/api\/?$/, '');

function resolveUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return null;
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('content:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }
  const clean = trimmed.replace(/\\/g, '/').replace(/^\//, '');
  return `${BASE_URL}/${clean}`;
}

function getPhotoUrl(user: any): string | null {
  if (!user) return null;
  const p =
    user.photo ||
    user.userProfileImage ||
    user.profileImage ||
    user.employeeImage ||
    user.photo_url ||
    user.profileimage ||
    user.profilePhoto ||
    user.avatar ||
    user.image ||
    user.employeeId?.photo ||
    user.employeeId?.userProfileImage ||
    user.employeeId?.profileImage ||
    user.employeeId?.employeeImage ||
    user.employeeId?.photo_url;
  return resolveUrl(p);
}

function getDisplayName(user: any, fallback = 'Worker'): string {
  if (!user) return fallback;
  const raw =
    user.displayName ||
    user.userDisplayName ||
    user.name ||
    user.employeeName ||
    fallback;
  return raw.replace('Unknown', 'Worker').trim();
}

/** Haversine formula to calculate accurate distance in meters */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toR = (v: number) => (v * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLon = toR(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toCoord(loc: any): { lat: number; lng: number } {
  const lat = Number(loc?.coords?.latitude ?? loc?.latitude ?? loc?.lat ?? 0);
  const lng = Number(loc?.coords?.longitude ?? loc?.longitude ?? loc?.long ?? 0);
  return { lat, lng };
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Snap GPS coordinates to roads using OSRM map matching (free, OSM-backed).
 * Batches in chunks of 100 with silent fallback to raw coordinates.
 */
async function snapCoordsToRoads(
  coords: Array<{ latitude: number; longitude: number }>
): Promise<Array<{ latitude: number; longitude: number }>> {
  if (coords.length < 2) return coords;
  const BATCH = 100;
  const snapped: Array<{ latitude: number; longitude: number }> = [];

  try {
    for (let i = 0; i < coords.length; i += BATCH) {
      const batch = coords.slice(i, i + BATCH);
      const coordStr = batch.map((c) => `${c.longitude},${c.latitude}`).join(';');
      const radiuses = batch.map(() => '40').join(';');
      const url = `https://router.project-osrm.org/match/v1/driving/${coordStr}?overview=full&geometries=geojson&radiuses=${radiuses}&gaps=ignore`;

      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: (() => {
          try {
            return AbortSignal.timeout(6000);
          } catch {
            return undefined as any;
          }
        })(),
      });

      if (!res.ok) {
        snapped.push(...batch);
        continue;
      }

      const data = await res.json();
      const matchings: any[] = data.matchings || [];
      if (matchings.length > 0) {
        for (const m of matchings) {
          const geoCoords: [number, number][] = m?.geometry?.coordinates || [];
          geoCoords.forEach(([lng, lat]) => {
            if (lat && lng) snapped.push({ latitude: lat, longitude: lng });
          });
        }
      } else {
        snapped.push(...batch);
      }
    }
    return snapped.length > 1 ? snapped : coords;
  } catch {
    return coords;
  }
}

// ─── PURE WORKER AVATAR MARKER (NO TEXT CALLOUTS, NEVER BLANK) ────────────────

let _workerClipCounter = 0;

interface WorkerMarkerProps {
  worker: WorkerDisplayInfo;
  isSelected: boolean;
  isIsolated: boolean;
  onPress: (worker: WorkerDisplayInfo) => void;
}

const WorkerImageMarker: React.FC<WorkerMarkerProps> = React.memo(
  ({ worker, isSelected, isIsolated, onPress }) => {
    const { photoUrl, name, isSelf, isInsideGeofence, latitude, longitude } = worker;
    const [ready, setReady] = useState(false);
    const [err, setErr] = useState(false);
    const clipId = useRef(`w_clip_${++_workerClipCounter}`).current;

    const url = resolveUrl(photoUrl);

    // Marker dimensions (sharp SVG circle, no transform scale clipping)
    const MS = isSelected || isIsolated ? 54 : 46;
    const BD = 3;
    const IN = MS - BD * 2;
    const R = MS / 2;

    const ringColor = isIsolated
      ? '#8b5cf6'
      : isSelf
        ? '#2563eb'
        : isInsideGeofence
          ? '#10b981'
          : '#f59e0b';

    const initialChar = (name || 'W').trim().charAt(0).toUpperCase();

    useEffect(() => {
      setReady(false);
      setErr(false);
      if (!url) {
        setReady(true);
      }
    }, [url, isSelected, isIsolated]);

    return (
      <Marker
        coordinate={{ latitude, longitude }}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={!ready}
        onPress={() => onPress(worker)}
        style={{ alignItems: 'center', justifyContent: 'center' }}
      >
        <View style={{ width: MS, height: MS, alignItems: 'center', justifyContent: 'center' }} collapsable={false}>
          {url && !err ? (
            <View style={{ width: MS, height: MS }} collapsable={false}>
              <Svg width={MS} height={MS} viewBox={`0 0 ${MS} ${MS}`}>
                <Defs>
                  <ClipPath id={clipId}>
                    <SvgCircle cx={R} cy={R} r={IN / 2} />
                  </ClipPath>
                </Defs>
                {/* Outer colored ring */}
                <SvgCircle cx={R} cy={R} r={R} fill={ringColor} />
                {/* Inner white separator ring */}
                <SvgCircle cx={R} cy={R} r={IN / 2 + 1} fill="#ffffff" />
                {/* Worker Avatar Image */}
                <SvgImage
                  href={url}
                  width={IN}
                  height={IN}
                  x={BD}
                  y={BD}
                  clipPath={`url(#${clipId})`}
                  preserveAspectRatio="xMidYMid slice"
                  onLoad={() => {
                    setTimeout(() => setReady(true), 300);
                  }}
                />
              </Svg>
            </View>
          ) : (
            <View
              style={{
                width: MS,
                height: MS,
                borderRadius: R,
                backgroundColor: '#f1f5f9',
                borderWidth: BD,
                borderColor: ringColor,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              collapsable={false}
            >
              <Text style={{ fontSize: MS * 0.38, fontWeight: '800', color: ringColor }}>
                {initialChar}
              </Text>
            </View>
          )}

          {/* Status Dot */}
          <View
            style={[
              styles.liveIndicatorDot,
              { backgroundColor: isInsideGeofence ? '#10b981' : '#f59e0b' },
            ]}
          />
        </View>
      </Marker>
    );
  }
);

// ─── MAIN LIVE TRACKER COMPONENT ──────────────────────────────────────────────

export const LiveTracker: React.FC<LiveTrackerProps> = ({
  location: propLocation,
  employee,
  name,
  profileImage,
  geoHistory = [],
  activeStaff = [],
  leads = [],
  supervisorMobile,
  onRefresh,
  activeDuty,
  employees = [],
  workerId,
}) => {
  const mapRef = useRef<MapView | null>(null);
  const isMapReady = useRef<boolean>(false);

  // Unified Location context hook
  const unifiedLoc = useUnifiedLocation('LiveTracker');

  // Internal live coordinates & trail
  const [deviceCoords, setDeviceCoords] = useState<NormalizedCoord | null>(null);
  const [liveTrail, setLiveTrail] = useState<NormalizedCoord[]>([]);
  const [snappedTrail, setSnappedTrail] = useState<NormalizedCoord[]>([]);
  const [isFollowing, setIsFollowing] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [showGeofences, setShowGeofences] = useState<boolean>(true);
  const [showRoute, setShowRoute] = useState<boolean>(true);

  // Worker Selection & Isolation states
  const [selectedWorker, setSelectedWorker] = useState<WorkerDisplayInfo | null>(null);
  const [isolatedWorkerId, setIsolatedWorkerId] = useState<string | null>(null);
  const [isWorkerListVisible, setIsWorkerListVisible] = useState<boolean>(false);

  // Date picker state for route replay
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isDatePickerVisible, setIsDatePickerVisible] = useState<boolean>(false);

  // Real-time map of socket-updated worker coordinates { workerId: { lat, lng, timestamp } }
  const [socketWorkerLocations, setSocketWorkerLocations] = useState<
    Record<string, { lat: number; lng: number; timestamp?: any }>
  >({});

  // 1. Resolve self user id
  const currentUserId = useMemo(() => {
    return (
      workerId ||
      employee?._id ||
      employee?.user_id ||
      employee?.id ||
      'current_worker'
    );
  }, [workerId, employee]);

  // Ensure active staff is fetched if not supplied via prop
  useEffect(() => {
    if (!activeStaff || activeStaff.length === 0) {
      unifiedLoc.fetchActiveStaff?.();
    }
  }, [activeStaff]);

  // Merge active staff from props or unified context
  const effectiveActiveStaff = useMemo(() => {
    if (activeStaff && activeStaff.length > 0) return activeStaff;
    if (unifiedLoc.activeStaff && unifiedLoc.activeStaff.length > 0) return unifiedLoc.activeStaff;
    return [];
  }, [activeStaff, unifiedLoc.activeStaff]);

  // 2. Prepare Geofence Sites from Leads & active site
  const geofences = useMemo<GeofenceSite[]>(() => {
    const list: GeofenceSite[] = [];
    (leads || []).forEach((lead: any, idx: number) => {
      const lat = Number(lead.location?.lat ?? lead.latitude ?? lead.lat);
      const lng = Number(lead.location?.long ?? lead.longitude ?? lead.long ?? lead.lng);
      if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
        list.push({
          id: String(lead._id || lead.id || `lead-${idx}`),
          name: lead.sender_name || lead.name || lead.displayName || `Site #${idx + 1}`,
          latitude: lat,
          longitude: lng,
          radius: Number(lead.geofenceRadius || lead.radius || 150),
        });
      }
    });

    if (activeDuty?.siteLat && activeDuty?.siteLong) {
      const sLat = Number(activeDuty.siteLat);
      const sLng = Number(activeDuty.siteLong);
      if (sLat && sLng && !list.some((g) => g.latitude === sLat && g.longitude === sLng)) {
        list.push({
          id: 'duty-site',
          name: activeDuty.site_name || activeDuty.siteName || 'Assigned Site',
          latitude: sLat,
          longitude: sLng,
          radius: 200,
        });
      }
    }
    return list;
  }, [leads, activeDuty]);

  // Register geofences in GeofenceService
  useEffect(() => {
    geofences.forEach((g) => {
      GeofenceService.addGeofence({
        id: g.id,
        latitude: g.latitude,
        longitude: g.longitude,
        radius: g.radius,
      });
    });
  }, [geofences]);

  // 3. Resolve All Active Duty Workers from Attendance DB
  const displayWorkers = useMemo<WorkerDisplayInfo[]>(() => {
    const workers: WorkerDisplayInfo[] = [];

    // Filter active staff: only on-duty employees (no dutyEnd)
    const onDutyList = (effectiveActiveStaff || []).filter((s: any) => {
      return !s.dutyEnd && s.status !== 'OFF' && s.dutyStatus !== 'OFF';
    });

    onDutyList.forEach((staff: any) => {
      const staffEmpId = String(staff.employeeId?._id || staff.employeeId || staff._id || '');
      const isSelf = staffEmpId === String(currentUserId);

      // Check socket override first
      let lat = 0;
      let lng = 0;
      if (socketWorkerLocations[staffEmpId]) {
        lat = socketWorkerLocations[staffEmpId].lat;
        lng = socketWorkerLocations[staffEmpId].lng;
      } else {
        const lastTick = staff.geoHistory?.[staff.geoHistory.length - 1];
        lat = Number(lastTick?.lat ?? lastTick?.latitude ?? staff.lat ?? staff.location?.lat ?? 0);
        lng = Number(lastTick?.long ?? lastTick?.longitude ?? staff.long ?? staff.location?.long ?? 0);
      }

      // Fallback to site coordinates if GPS fix not yet streamed
      if (!lat || !lng) {
        lat = Number(staff.siteLat || 0);
        lng = Number(staff.siteLong || 0);
      }

      if (!lat || !lng) return;

      // Geofence check
      let isInside = false;
      let matchedSiteName: string | null = null;
      for (const fence of geofences) {
        const d = haversineMeters(lat, lng, fence.latitude, fence.longitude);
        if (d <= fence.radius) {
          isInside = true;
          matchedSiteName = fence.name;
          break;
        }
      }

      const extraEmp = (employees || []).find(
        (e: any) => String(e._id) === staffEmpId || String(e.id) === staffEmpId
      );

      const resolvedPhoto =
        getPhotoUrl(staff) ||
        getPhotoUrl(extraEmp) ||
        getPhotoUrl(staff?.employeeId) ||
        (staff.photoUrl ? resolveUrl(staff.photoUrl) : null);

      workers.push({
        id: staffEmpId || `staff-${Math.random()}`,
        name: getDisplayName(extraEmp || staff),
        photoUrl: resolvedPhoto,
        latitude: lat,
        longitude: lng,
        isSelf,
        isInsideGeofence: isInside,
        geofenceSiteName: matchedSiteName,
        shiftName: staff.shiftName || staff.shiftCode || extraEmp?.shiftName || 'General',
        dutyStart: staff.dutyStart || null,
        mobile: staff.mobile || staff.employeeMobile || extraEmp?.mobile || null,
        batteryLevel: staff.batteryLevel ?? null,
        lastUpdated: staff.lastUpdated || staff.updatedAt || null,
        rawStaffData: staff,
      });
    });

    // If self device coordinate is active and not already in workers list, add self
    if (deviceCoords) {
      const selfIndex = workers.findIndex((w) => w.isSelf);
      let isInside = false;
      let matchedSiteName: string | null = null;
      for (const fence of geofences) {
        const d = haversineMeters(deviceCoords.latitude, deviceCoords.longitude, fence.latitude, fence.longitude);
        if (d <= fence.radius) {
          isInside = true;
          matchedSiteName = fence.name;
          break;
        }
      }

      const selfItem: WorkerDisplayInfo = {
        id: String(currentUserId),
        name: name || getDisplayName(employee, 'You'),
        photoUrl: resolveUrl(profileImage) || getPhotoUrl(employee),
        latitude: deviceCoords.latitude,
        longitude: deviceCoords.longitude,
        isSelf: true,
        isInsideGeofence: isInside,
        geofenceSiteName: matchedSiteName,
        shiftName: employee?.shiftName || 'General',
        dutyStart: activeDuty?.dutyStart || null,
        mobile: employee?.mobile || null,
        batteryLevel: null,
        lastUpdated: deviceCoords.timestamp,
        rawStaffData: employee,
      };

      if (selfIndex >= 0) {
        workers[selfIndex] = selfItem;
      } else {
        workers.unshift(selfItem);
      }
    }

    return workers;
  }, [
    effectiveActiveStaff,
    currentUserId,
    socketWorkerLocations,
    geofences,
    employees,
    deviceCoords,
    name,
    employee,
    profileImage,
    activeDuty,
  ]);

  // Prefetch active worker photos into memory cache so custom markers render immediately
  useEffect(() => {
    displayWorkers.forEach((w) => {
      if (w.photoUrl) {
        Image.prefetch(w.photoUrl).catch(() => {});
      }
    });
  }, [displayWorkers]);

  // Filtered workers when worker isolation is active
  const visibleWorkers = useMemo(() => {
    if (!isolatedWorkerId) return displayWorkers;
    return displayWorkers.filter((w) => w.id === isolatedWorkerId);
  }, [displayWorkers, isolatedWorkerId]);

  // Currently isolated worker object
  const isolatedWorker = useMemo(() => {
    if (!isolatedWorkerId) return null;
    return displayWorkers.find((w) => w.id === isolatedWorkerId) || null;
  }, [displayWorkers, isolatedWorkerId]);

  // 4. Real-time Foreground GPS Tracking with Expo-Location
  useEffect(() => {
    let subscriber: Location.LocationSubscription | null = null;
    let isMounted = true;
    const socket = getSocket();

    async function startLocationWatch() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('[LiveTracker] Location permission denied');
          return;
        }

        subscriber = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 3000,
            distanceInterval: 10,
          },
          async (pos) => {
            if (!isMounted || !pos?.coords) return;
            const { latitude, longitude, accuracy, speed, heading } = pos.coords;

            if (accuracy && accuracy > 35) return;

            const point: NormalizedCoord = {
              latitude,
              longitude,
              accuracy,
              speed,
              heading,
              timestamp: pos.timestamp,
            };

            setDeviceCoords(point);
            setLiveTrail((prev) => [...prev, point]);

            try {
              if (socket?.connected) {
                socket.emit('update_location', {
                  workerId: currentUserId,
                  latitude,
                  longitude,
                  accuracy,
                  speed,
                  heading,
                  timestamp: new Date().toISOString(),
                });
              }
            } catch {}

            if (activeDuty?._id) {
              try {
                const { shouldFlush } = await SmartLocationBuffer.ingest({
                  latitude,
                  longitude,
                  accuracy,
                  speed,
                  heading,
                  timestamp: pos.timestamp,
                  type: 'tick',
                });

                if (shouldFlush) {
                  const compact = await SmartLocationBuffer.drain();
                  if (compact) {
                    const session = await appService.getSession();
                    if (session?.token) {
                      await LocationSyncService.uploadCompact(compact, {
                        attendanceId: activeDuty._id,
                        token: session.token,
                        dbName: session.dbName || null,
                        baseURL: appService.httpClient.defaults.baseURL || '',
                        isExempt: false,
                      });
                    }
                  }
                }
              } catch {}
            }
          }
        );
      } catch (err) {
        console.warn('[LiveTracker] Location watch error:', err);
      }
    }

    startLocationWatch();

    // 5. Socket Listeners for Real-time Worker Location updates
    const onGeoUpdate = (data: any) => {
      if (!isMounted || !data) return;
      const attId = data.attendanceId || data.workerId;
      const tick = data.tick || data;
      const lat = Number(tick.lat ?? tick.latitude);
      const lng = Number(tick.long ?? tick.longitude);
      if (lat && lng && attId) {
        setSocketWorkerLocations((prev) => ({
          ...prev,
          [String(attId)]: { lat, lng, timestamp: tick.timestamp || Date.now() },
        }));
      }
    };

    const onLiveLocation = (data: any) => {
      if (!isMounted || !data) return;
      const wId = data.workerId;
      const lat = Number(data.latitude);
      const lng = Number(data.longitude);
      if (lat && lng && wId) {
        setSocketWorkerLocations((prev) => ({
          ...prev,
          [String(wId)]: { lat, lng, timestamp: data.lastUpdated || Date.now() },
        }));
      }
    };

    socket.on('attendance:geo_update', onGeoUpdate);
    socket.on('live_location_update', onLiveLocation);

    return () => {
      isMounted = false;
      if (subscriber) subscriber.remove();
      socket.off('attendance:geo_update', onGeoUpdate);
      socket.off('live_location_update', onLiveLocation);
    };
  }, [currentUserId, activeDuty]);

  // 6. Camera Follow Animation
  useEffect(() => {
    if (!isFollowing || !mapRef.current || !isMapReady.current) return;
    const target = isolatedWorker || deviceCoords || displayWorkers[0];
    if (target?.latitude && target?.longitude) {
      mapRef.current.animateCamera(
        {
          center: { latitude: target.latitude, longitude: target.longitude },
          zoom: isolatedWorker ? 17 : 16,
        },
        { duration: 600 }
      );
    }
  }, [deviceCoords, isFollowing, isolatedWorker]);

  // 7. Route Coordinates Processing (server history + live trail, supports isolated worker)
  const routePolylineCoords = useMemo<Array<{ latitude: number; longitude: number }>>(() => {
    if (!showRoute) return [];

    let targetHistory: any[] = [];
    if (isolatedWorker) {
      if (isolatedWorker.isSelf) {
        targetHistory = geoHistory || [];
      } else {
        targetHistory = isolatedWorker.rawStaffData?.geoHistory || [];
      }
    } else {
      targetHistory = geoHistory || [];
    }

    // Filter server geoHistory ticks for selected date
    const histPoints: Array<{ latitude: number; longitude: number }> = targetHistory
      .filter((loc: any) => {
        if (!loc.timestamp) return isSameDay(new Date(), selectedDate);
        return isSameDay(new Date(loc.timestamp), selectedDate);
      })
      .map((loc: any) => {
        const { lat, lng } = toCoord(loc);
        return { latitude: lat, longitude: lng };
      })
      .filter((c) => c.latitude && c.longitude);

    // If today is selected and looking at self (or non-isolated), append live trail
    if (isSameDay(selectedDate, new Date()) && (!isolatedWorker || isolatedWorker.isSelf)) {
      const livePoints = liveTrail.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
      return [...histPoints, ...livePoints];
    }

    return histPoints;
  }, [geoHistory, liveTrail, selectedDate, showRoute, isolatedWorker]);

  // Asynchronous Road Snapping (OSRM)
  useEffect(() => {
    if (routePolylineCoords.length < 2) {
      setSnappedTrail([]);
      return;
    }

    let isCancelled = false;
    snapCoordsToRoads(routePolylineCoords).then((snapped) => {
      if (!isCancelled) {
        setSnappedTrail(snapped);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [routePolylineCoords.length]);

  const activePolyline = snappedTrail.length > 1 ? snappedTrail : routePolylineCoords;

  // Fit camera when replay route changes
  useEffect(() => {
    if (!isSameDay(selectedDate, new Date()) && activePolyline.length > 1 && mapRef.current) {
      setTimeout(() => {
        (mapRef.current as any)?.fitToCoordinates?.(activePolyline, {
          edgePadding: { top: 90, right: 40, bottom: 120, left: 40 },
          animated: true,
        });
      }, 300);
    }
  }, [selectedDate, activePolyline.length]);

  // 8. Manual Refresh Handler
  const handleManualRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      if (unifiedLoc?.refreshLiveTrackerLocation) {
        await unifiedLoc.refreshLiveTrackerLocation();
      }
      if (unifiedLoc?.fetchActiveStaff) {
        await unifiedLoc.fetchActiveStaff();
      }
      if (onRefresh) {
        await onRefresh();
      }
      appService.showToast('Live map refreshed', 'Success');
    } catch {
      appService.showToast('Failed to refresh live map', 'Error');
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, unifiedLoc, onRefresh]);

  // Handle worker selection & isolation
  const handleWorkerSelect = useCallback(
    (worker: WorkerDisplayInfo) => {
      setSelectedWorker(worker);
      setIsolatedWorkerId(worker.id);
      setIsFollowing(false);
      if (mapRef.current) {
        mapRef.current.animateCamera({
          center: { latitude: worker.latitude, longitude: worker.longitude },
          zoom: 17,
        });
      }
    },
    []
  );

  // Clear worker isolation
  const handleClearIsolation = useCallback(() => {
    setIsolatedWorkerId(null);
    setSelectedWorker(null);
    setIsFollowing(true);
  }, []);

  // Initial map center
  const initialCenter = useMemo(() => {
    if (propLocation?.latitude && propLocation?.longitude) {
      return { latitude: propLocation.latitude, longitude: propLocation.longitude };
    }
    if (displayWorkers[0]?.latitude && displayWorkers[0]?.longitude) {
      return { latitude: displayWorkers[0].latitude, longitude: displayWorkers[0].longitude };
    }
    if (geofences[0]?.latitude && geofences[0]?.longitude) {
      return { latitude: geofences[0].latitude, longitude: geofences[0].longitude };
    }
    return GPS_CONSTANTS.DEFAULT_LOCATION;
  }, [propLocation, displayWorkers, geofences]);

  return (
    <View style={styles.container}>
      {/* ── MAP VIEW ── */}
      <MapView
        ref={mapRef as any}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={{
          latitude: initialCenter.latitude,
          longitude: initialCenter.longitude,
          latitudeDelta: 0.025,
          longitudeDelta: 0.025,
        }}
        onMapReady={() => {
          isMapReady.current = true;
        }}
        onPanDrag={() => setIsFollowing(false)}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
      >
        {/* Geofence Boundary Circles */}
        {showGeofences &&
          geofences.map((fence) => (
            <Circle
              key={fence.id}
              center={{ latitude: fence.latitude, longitude: fence.longitude }}
              radius={fence.radius}
              fillColor="rgba(37, 99, 235, 0.08)"
              strokeColor="rgba(37, 99, 235, 0.45)"
              strokeWidth={1.5}
            />
          ))}

        {/* Route Polyline (Worker Movement Path) */}
        {showRoute && activePolyline.length > 1 && (
          <Polyline
            coordinates={activePolyline}
            strokeColor="#2563eb"
            strokeWidth={4}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {/* WORKER IMAGE MARKERS ONLY (NO TEXT CALLOUTS, NEVER BLANK) */}
        {visibleWorkers.map((worker) => (
          <WorkerImageMarker
            key={`${worker.id}-${worker.photoUrl || 'no-photo'}`}
            worker={worker}
            isSelected={selectedWorker?.id === worker.id}
            isIsolated={isolatedWorkerId === worker.id}
            onPress={handleWorkerSelect}
          />
        ))}
      </MapView>

      {/* ── TOP FLOATING CONTROL BAR ── */}
      <View style={styles.topControlBar}>
        {/* Status Pill / Worker Isolation Pill */}
        {isolatedWorkerId ? (
          <View style={[styles.statusPill, styles.isolationPill]}>
            <View style={[styles.pulseDot, { backgroundColor: '#8b5cf6' }]} />
            <Text style={styles.statusPillText} numberOfLines={1}>
              {isolatedWorker?.name || 'Isolated'}
            </Text>
            <TouchableOpacity onPress={handleClearIsolation} style={styles.showAllPillButton}>
              <Text style={styles.showAllPillText}>Show All</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.statusPill}>
            <View style={styles.pulseDot} />
            <Text style={styles.statusPillText}>
              {displayWorkers.length} Active {displayWorkers.length === 1 ? 'Worker' : 'Workers'}
            </Text>
          </View>
        )}

        {/* Action Controls */}
        <View style={styles.topActionGroup}>
          {/* Worker List Drawer Toggle */}
          <TouchableOpacity
            style={styles.circleButton}
            onPress={() => setIsWorkerListVisible(!isWorkerListVisible)}
            activeOpacity={0.8}
          >
            <Ionicons name="people" size={18} color="#1e293b" />
          </TouchableOpacity>

          {/* Geofence Toggle */}
          <TouchableOpacity
            style={[styles.circleButton, showGeofences && styles.circleButtonActive]}
            onPress={() => setShowGeofences(!showGeofences)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={showGeofences ? 'radio' : 'radio-outline'}
              size={18}
              color={showGeofences ? '#2563eb' : '#64748b'}
            />
          </TouchableOpacity>

          {/* Route History Replay */}
          <TouchableOpacity
            style={[styles.circleButton, showRoute && styles.circleButtonActive]}
            onPress={() => setIsDatePickerVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons
              name="trail-sign"
              size={18}
              color={showRoute ? '#2563eb' : '#64748b'}
            />
          </TouchableOpacity>

          {/* Center / Follow Self */}
          <TouchableOpacity
            style={[styles.circleButton, isFollowing && styles.circleButtonActive]}
            onPress={() => {
              setIsFollowing(true);
              const target = isolatedWorker || deviceCoords || displayWorkers[0];
              if (target && mapRef.current) {
                mapRef.current.animateCamera({
                  center: { latitude: target.latitude, longitude: target.longitude },
                  zoom: 17,
                });
              }
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name={isFollowing ? 'locate' : 'locate-outline'}
              size={18}
              color={isFollowing ? '#2563eb' : '#64748b'}
            />
          </TouchableOpacity>

          {/* Refresh GPS */}
          <TouchableOpacity
            style={styles.circleButton}
            onPress={handleManualRefresh}
            disabled={isRefreshing}
            activeOpacity={0.8}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Ionicons name="refresh" size={18} color="#1e293b" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── ROUTE STATUS / NO ROUTE AVAILABLE BANNER ── */}
      {showRoute && (
        <View style={styles.routeBannerContainer}>
          {activePolyline.length > 1 ? (
            <View style={styles.routeBannerSuccess}>
              <Ionicons name="trail-sign" size={14} color="#2563eb" />
              <Text style={styles.routeBannerSuccessText}>
                Route: {isSameDay(selectedDate, new Date()) ? 'Today' : selectedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} ({activePolyline.length} pts)
                {isolatedWorker ? ` · ${isolatedWorker.name}` : ''}
              </Text>
              {!isSameDay(selectedDate, new Date()) && (
                <TouchableOpacity onPress={() => setSelectedDate(new Date())} style={styles.resetDateBtn}>
                  <Text style={styles.resetDateBtnText}>Today</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.routeBannerEmpty}>
              <Ionicons name="alert-circle" size={15} color="#d97706" />
              <Text style={styles.routeBannerEmptyText} numberOfLines={1}>
                No route available for {isSameDay(selectedDate, new Date()) ? 'Today' : selectedDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                {isolatedWorker ? ` (${isolatedWorker.name})` : ''}
              </Text>
              {!isSameDay(selectedDate, new Date()) && (
                <TouchableOpacity onPress={() => setSelectedDate(new Date())} style={styles.resetDateBtn}>
                  <Text style={styles.resetDateBtnText}>Today</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* ── BOTTOM WORKER DETAILS CARD (OUTSIDE MAP TO KEEP MAP PURE) ── */}
      {selectedWorker && (
        <View style={styles.workerDetailCard}>
          <View style={styles.workerCardContent}>
            {/* Worker Avatar with Fallback initial */}
            <View style={styles.cardAvatarWrapper}>
              <View style={[styles.cardAvatar, styles.fallbackAvatar, { backgroundColor: selectedWorker.isSelf ? '#2563eb' : selectedWorker.isInsideGeofence ? '#10b981' : '#f59e0b' }]}>
                <Text style={styles.fallbackAvatarText}>
                  {selectedWorker.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              {selectedWorker.photoUrl && (
                <Image
                  source={{ uri: selectedWorker.photoUrl }}
                  style={[StyleSheet.absoluteFillObject, styles.cardAvatar]}
                  resizeMode="cover"
                />
              )}
              <View
                style={[
                  styles.cardStatusBadge,
                  {
                    backgroundColor: selectedWorker.isInsideGeofence ? '#10b981' : '#f59e0b',
                  },
                ]}
              />
            </View>

            {/* Worker Info */}
            <View style={styles.cardInfo}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardWorkerName} numberOfLines={1}>
                  {selectedWorker.name}
                </Text>
                {selectedWorker.isSelf && (
                  <View style={styles.selfBadge}>
                    <Text style={styles.selfBadgeText}>YOU</Text>
                  </View>
                )}
                {isolatedWorkerId === selectedWorker.id && (
                  <View style={[styles.selfBadge, { backgroundColor: '#f3e8ff' }]}>
                    <Text style={[styles.selfBadgeText, { color: '#8b5cf6' }]}>ISOLATED</Text>
                  </View>
                )}
              </View>

              {/* Geofence Status */}
              <View style={styles.geofenceStatusRow}>
                <Ionicons
                  name={selectedWorker.isInsideGeofence ? 'shield-checkmark' : 'navigate'}
                  size={14}
                  color={selectedWorker.isInsideGeofence ? '#10b981' : '#f59e0b'}
                />
                <Text
                  style={[
                    styles.geofenceStatusText,
                    { color: selectedWorker.isInsideGeofence ? '#065f46' : '#92400e' },
                  ]}
                  numberOfLines={1}
                >
                  {selectedWorker.isInsideGeofence
                    ? `Inside ${selectedWorker.geofenceSiteName || 'Site'}`
                    : 'In Transit / Outside Geofence'}
                </Text>
              </View>

              <Text style={styles.cardShiftText}>
                Shift: {selectedWorker.shiftName}
                {selectedWorker.dutyStart
                  ? ` · Started ${new Date(selectedWorker.dutyStart).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : ''}
              </Text>
            </View>

            {/* Quick Actions */}
            <View style={styles.cardActionCol}>
              {/* Isolate / Show All Toggle */}
              <TouchableOpacity
                style={[styles.actionIconBtn, isolatedWorkerId === selectedWorker.id ? styles.actionIconBtnActive : null]}
                onPress={() => {
                  if (isolatedWorkerId === selectedWorker.id) {
                    handleClearIsolation();
                  } else {
                    handleWorkerSelect(selectedWorker);
                  }
                }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={isolatedWorkerId === selectedWorker.id ? 'scan' : 'scan-outline'}
                  size={16}
                  color={isolatedWorkerId === selectedWorker.id ? '#ffffff' : '#475569'}
                />
              </TouchableOpacity>

              {/* Phone call button */}
              {selectedWorker.mobile && (
                <TouchableOpacity
                  style={[styles.actionIconBtn, { backgroundColor: '#16a34a' }]}
                  onPress={() => {
                    Linking.openURL(`tel:${selectedWorker.mobile?.replace(/\D/g, '')}`);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="call" size={15} color="#ffffff" />
                </TouchableOpacity>
              )}

              {/* Close Card */}
              <TouchableOpacity
                style={styles.closeCardButton}
                onPress={() => setSelectedWorker(null)}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={18} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* ── ACTIVE WORKERS LIST TRAY MODAL ── */}
      <Modal
        visible={isWorkerListVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsWorkerListVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsWorkerListVisible(false)}
        >
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>On-Duty Staff ({displayWorkers.length})</Text>
                <Text style={styles.modalSubtitle}>Attendance Database & GPS Live</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsWorkerListVisible(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.workerListScroll}>
              {/* Show All Workers Option */}
              <TouchableOpacity
                style={[
                  styles.workerListItem,
                  !isolatedWorkerId && { backgroundColor: '#eff6ff' },
                ]}
                onPress={() => {
                  handleClearIsolation();
                  setIsWorkerListVisible(false);
                }}
              >
                <View style={[styles.listAvatar, { backgroundColor: '#2563eb', justifyContent: 'center', alignItems: 'center' }]}>
                  <Ionicons name="people" size={20} color="#ffffff" />
                </View>
                <View style={styles.listInfoCol}>
                  <Text style={[styles.listWorkerName, !isolatedWorkerId && { color: '#2563eb' }]}>
                    All Active Workers
                  </Text>
                  <Text style={styles.listSubText}>Show all on-duty workers on map</Text>
                </View>
                {!isolatedWorkerId && (
                  <Ionicons name="checkmark-circle" size={20} color="#2563eb" />
                )}
              </TouchableOpacity>

              {/* Individual Worker Items */}
              {displayWorkers.map((worker) => {
                const isItemIsolated = isolatedWorkerId === worker.id;
                return (
                  <TouchableOpacity
                    key={worker.id}
                    style={[styles.workerListItem, isItemIsolated && { backgroundColor: '#f5f3ff' }]}
                    onPress={() => {
                      handleWorkerSelect(worker);
                      setIsWorkerListVisible(false);
                    }}
                  >
                    <View style={styles.listAvatarWrapper}>
                      <View style={[styles.listAvatar, styles.fallbackAvatar, { backgroundColor: worker.isSelf ? '#2563eb' : worker.isInsideGeofence ? '#10b981' : '#f59e0b' }]}>
                        <Text style={styles.fallbackAvatarText}>
                          {worker.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      {worker.photoUrl && (
                        <Image
                          source={{ uri: worker.photoUrl }}
                          style={[StyleSheet.absoluteFillObject, styles.listAvatar]}
                          resizeMode="cover"
                        />
                      )}
                      <View
                        style={[
                          styles.listStatusDot,
                          { backgroundColor: worker.isInsideGeofence ? '#10b981' : '#f59e0b' },
                        ]}
                      />
                    </View>

                    <View style={styles.listInfoCol}>
                      <Text style={[styles.listWorkerName, isItemIsolated && { color: '#8b5cf6' }]} numberOfLines={1}>
                        {worker.name} {worker.isSelf && '(You)'}
                      </Text>
                      <Text style={styles.listSubText} numberOfLines={1}>
                        {worker.isInsideGeofence
                          ? `📍 Inside ${worker.geofenceSiteName || 'Site'}`
                          : '🚗 In Transit'}
                      </Text>
                    </View>

                    {isItemIsolated ? (
                      <View style={styles.isolatedBadge}>
                        <Text style={styles.isolatedBadgeText}>ISOLATED</Text>
                      </View>
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── ROUTE DATE PICKER MODAL (REPLAY ROUTE BY DATE) ── */}
      <Modal
        visible={isDatePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDatePickerVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setIsDatePickerVisible(false)}
        >
          <Pressable style={styles.datePickerCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.datePickerTitle}>Replay Route by Date</Text>
            <Text style={styles.datePickerSubtitle}>
              {isolatedWorker ? `Showing movement for ${isolatedWorker.name}` : 'Showing movement for active session'}
            </Text>

            <View style={styles.dateList}>
              {[0, 1, 2, 3, 4, 5, 6].map((dayOffset) => {
                const date = new Date();
                date.setDate(date.getDate() - dayOffset);
                const isSelected = isSameDay(date, selectedDate);
                const label =
                  dayOffset === 0
                    ? 'Today'
                    : dayOffset === 1
                      ? 'Yesterday'
                      : date.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });

                // Check point count for preview
                const targetHist = isolatedWorker
                  ? (isolatedWorker.isSelf ? geoHistory : isolatedWorker.rawStaffData?.geoHistory || [])
                  : geoHistory || [];

                const pointsForDay = targetHist.filter((loc: any) => {
                  if (!loc.timestamp) return dayOffset === 0;
                  return isSameDay(new Date(loc.timestamp), date);
                }).length + (dayOffset === 0 && (!isolatedWorker || isolatedWorker.isSelf) ? liveTrail.length : 0);

                return (
                  <TouchableOpacity
                    key={dayOffset}
                    style={[styles.dateOptionItem, isSelected && styles.dateOptionSelected]}
                    onPress={() => {
                      setSelectedDate(date);
                      setShowRoute(true);
                      setIsDatePickerVisible(false);
                      if (pointsForDay === 0) {
                        appService.showToast(`No route available for ${label}`, 'Info');
                      }
                    }}
                  >
                    <Ionicons
                      name="calendar"
                      size={18}
                      color={isSelected ? '#2563eb' : '#64748b'}
                    />
                    <Text
                      style={[
                        styles.dateOptionText,
                        isSelected && styles.dateOptionTextSelected,
                      ]}
                    >
                      {label}
                    </Text>

                    <Text
                      style={[
                        styles.datePointsCount,
                        pointsForDay > 0 ? styles.datePointsCountActive : null,
                      ]}
                    >
                      {pointsForDay > 0 ? `${pointsForDay} pts` : 'No route'}
                    </Text>

                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={18} color="#2563eb" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

export default LiveTracker;

// ─── STYLES ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  map: {
    flex: 1,
  },

  // Pure Marker Styles (NO text labels or bubbles, Never Blank)
  markerWrapper: {
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  avatarContainer: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    backgroundColor: '#e2e8f0',
  },
  fallbackAvatar: {
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackAvatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  liveIndicatorDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2,
    borderColor: '#ffffff',
  },

  // Floating Control Bar
  topControlBar: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  isolationPill: {
    backgroundColor: 'rgba(49, 46, 129, 0.95)',
    borderWidth: 1,
    borderColor: '#818cf8',
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 7,
  },
  statusPillText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 110,
  },
  showAllPillButton: {
    marginLeft: 8,
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  showAllPillText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  topActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  circleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
  },
  circleButtonActive: {
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#2563eb',
  },

  // Route Status Banner
  routeBannerContainer: {
    position: 'absolute',
    top: 66,
    left: 14,
    right: 14,
    zIndex: 9,
  },
  routeBannerSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    gap: 8,
  },
  routeBannerSuccessText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
  },
  routeBannerEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(254, 243, 199, 0.96)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
    elevation: 3,
    gap: 8,
  },
  routeBannerEmptyText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
  },
  resetDateBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  resetDateBtnText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },

  // Worker Detail Card
  workerDetailCard: {
    position: 'absolute',
    bottom: 84, // Elevated above bottom navigation menu (FOOTER_HEIGHT 68 + spacing)
    left: 16,
    right: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    zIndex: 20,
  },
  workerCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardAvatarWrapper: {
    position: 'relative',
    width: 48,
    height: 48,
  },
  cardAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  cardStatusBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  cardInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardWorkerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    maxWidth: 130,
  },
  selfBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  selfBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#2563eb',
  },
  geofenceStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  geofenceStatusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardShiftText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  cardActionCol: {
    alignItems: 'center',
    gap: 6,
  },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconBtnActive: {
    backgroundColor: '#8b5cf6',
  },
  closeCardButton: {
    padding: 2,
  },

  // Bottom Sheet Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '65%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  modalCloseButton: {
    padding: 4,
  },
  workerListScroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  workerListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f8fafc',
  },
  listAvatarWrapper: {
    position: 'relative',
    width: 40,
    height: 40,
  },
  listAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  listStatusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  listInfoCol: {
    flex: 1,
    marginLeft: 12,
  },
  listWorkerName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  listSubText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  isolatedBadge: {
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  isolatedBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#8b5cf6',
  },

  // Date Picker Modal
  datePickerCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 24,
    borderRadius: 20,
    padding: 20,
    elevation: 10,
  },
  datePickerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  datePickerSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 3,
    marginBottom: 14,
  },
  dateList: {
    gap: 6,
  },
  dateOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    gap: 10,
  },
  dateOptionSelected: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  dateOptionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  dateOptionTextSelected: {
    color: '#2563eb',
    fontWeight: '700',
  },
  datePointsCount: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },
  datePointsCountActive: {
    color: '#16a34a',
    fontWeight: '700',
  },
});
