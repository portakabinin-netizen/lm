/**
 * LiveTracker.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a real-time map with:
 *  • Self-marker that moves instantly as the device GPS updates (owns its own
 *    watchPositionAsync — does NOT wait for the prop chain).
 *  • Route polyline merged from server geoHistory (prop) + live foreground
 *    trail accumulated while the map tab is open.
 *  • Staff markers for other on-duty employees.
 *  • Geo-tag / client-match bubble annotations on the trail.
 *  • 3-dot menu: Today's route, route by date, call supervisor, toggle trail.
 *  • Date-picker (last 7 days) to replay any day's route.
 */

import { GPS_CONSTANTS } from '@/constants/gps';
import { C as COLORS } from '@/hooks/Theme';
import { S } from '@/styles/styledashboard';
import { appService } from '@/UtilServices/appHelper';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Callout, Marker, Polyline } from 'react-native-maps';
import Svg, { Circle, ClipPath, Defs, Image as SvgImage } from 'react-native-svg';
import { useUnifiedLocation } from '../hooks/useUnifiedLocation';

// ─── Shared utilities ────────────────────────────────────────────────────────
const BASE_URL = (appService.httpClient.defaults.baseURL || '').replace(/\/api\/?$/, '');

function resolveUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  const cleanUrl = url.replace(/\\/g, '/').replace(/^\//, '');
  return `${BASE_URL}/${cleanUrl}`;
}

function getPhotoUrl(user: any): string | null | undefined {
  if (!user) return null;
  return (
    user.photo || user.userProfileImage || user.employeeImage || user.photo_url || user.profileimage
  );
}

function getDisplayName(user: any, fallback = 'User'): string {
  if (!user) return fallback;
  return (user.displayName || user.name || user.employeeName || fallback).replace(
    'Unknown',
    'User'
  );
}

/** Normalise ANY location shape → { lat, lng } numbers (0 if missing). */
function toLLng(loc: any): { lat: number; lng: number } {
  return {
    lat: Number(loc?.coords?.latitude ?? loc?.latitude ?? loc?.lat ?? 0),
    lng: Number(loc?.coords?.longitude ?? loc?.longitude ?? loc?.long ?? 0),
  };
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Snap GPS coordinates to roads using OSRM Map Matching.
 * ─────────────────────────────────────────────────────────
 * FREE — no API key required. Uses the public OSRM server
 * (same engine as OpenStreetMap). Batches in groups of 100
 * (OSRM limit) and concatenates results.
 * Falls back to raw coords if offline or server unreachable.
 *
 * OSRM note: coordinates are lon,lat order (opposite of Google).
 */
async function snapCoordsToRoads(
  coords: Array<{ latitude: number; longitude: number }>
): Promise<Array<{ latitude: number; longitude: number }>> {
  if (coords.length < 2) return coords;

  const BATCH = 100; // OSRM match endpoint limit
  const snapped: Array<{ latitude: number; longitude: number }> = [];

  try {
    for (let i = 0; i < coords.length; i += BATCH) {
      const batch = coords.slice(i, i + BATCH);

      // OSRM expects: longitude,latitude;longitude,latitude;...
      const coordStr = batch.map((c) => `${c.longitude},${c.latitude}`).join(';');
      // radiuses: GPS accuracy window per point (50m is generous for mobile GPS)
      const radiuses = batch.map(() => '50').join(';');

      const url =
        `https://router.project-osrm.org/match/v1/driving/${coordStr}` +
        `?overview=full&geometries=geojson&radiuses=${radiuses}&gaps=ignore`;

      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        // 8-second timeout — fall back silently if OSRM is slow
        signal: (() => {
          try {
            return AbortSignal.timeout(8000);
          } catch {
            return undefined as any;
          }
        })(),
      });

      if (!res.ok) {
        snapped.push(...batch); // server error → keep raw batch
        continue;
      }

      const data = await res.json();

      // OSRM returns matchings[].geometry.coordinates: [[lon, lat], ...]
      const matchings: any[] = data.matchings || [];
      if (matchings.length > 0) {
        for (const matching of matchings) {
          const geoCoords: [number, number][] = matching?.geometry?.coordinates || [];
          geoCoords.forEach(([lng, lat]) => {
            if (lat && lng) snapped.push({ latitude: lat, longitude: lng });
          });
        }
      } else {
        snapped.push(...batch); // no match → keep raw batch
      }
    }
    return snapped.length > 1 ? snapped : coords;
  } catch {
    // Network error or timeout — fall back to raw coords
    return coords;
  }
}

function dayLabel(d: Date): string {
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, yest)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

const getMatchedSiteName = (lat: number, lng: number, leads: any[]): string | null => {
  if (!lat || !lng || !leads || leads.length === 0) return null;
  let minDist = 10; // strict 10-meter threshold
  let matchedName: string | null = null;
  for (const lead of leads) {
    const lLat = Number(lead.location?.lat);
    const lLng = Number(lead.location?.long);
    if (!lLat || !lLng) continue;
    const d = haversineM(lat, lng, lLat, lLng);
    if (d < minDist) {
      minDist = d;
      matchedName = lead.sender_name || lead.name || 'Client';
    }
  }
  return matchedName;
};

/**
 * Resolve a staff record's best-known coordinate.
 * ─────────────────────────────────────────────────────────
 * Priority (highest wins):
 *  1. Latest streamed GPS tick (geoHistory) — pushed live via the
 *     `attendance:geo_update` socket event, so it is always more current
 *     than the lat/long snapshot taken when the active-staff list was
 *     last fully fetched. It must win over the top-level field, never lose
 *     to it, or "active worker sync" silently stalls on the map after the
 *     very first render.
 *  2. Top-level lat/long (or location.lat/long) snapshot.
 *  3. Assigned site coordinates (siteLat/siteLong, or the matched lead's
 *     location) — flagged isAssumed, since this is not a live GPS fix.
 *  4. Duty-start tick — isAssumed + isStartLoc.
 */
function resolveStaffLocation(
  staff: any,
  leads: any[] = []
): {
  lat: number;
  lng: number;
  isAssumed: boolean;
  isStartLoc: boolean;
} {
  const latestGeo = staff.geoHistory?.[staff.geoHistory.length - 1];

  const lat = Number(latestGeo?.lat || staff.lat || staff.location?.lat || 0);
  const lng = Number(latestGeo?.long || staff.long || staff.location?.long || 0);

  if (lat && lng) return { lat, lng, isAssumed: false, isStartLoc: false };

  let siteLat = Number(staff.siteLat || 0);
  let siteLng = Number(staff.siteLong || 0);

  if (!siteLat || !siteLng) {
    if (typeof staff.leadId === 'object' && staff.leadId?.location?.lat) {
      siteLat = Number(staff.leadId.location.lat);
      siteLng = Number(staff.leadId.location.long);
    } else if (leads.length && staff.leadId) {
      const leadIdStr = String(staff.leadId._id || staff.leadId);
      const matchedLead = leads.find((l: any) => String(l._id) === leadIdStr);
      if (matchedLead?.location?.lat && matchedLead?.location?.long) {
        siteLat = Number(matchedLead.location.lat);
        siteLng = Number(matchedLead.location.long);
      }
    }
  }

  if (siteLat && siteLng) return { lat: siteLat, lng: siteLng, isAssumed: true, isStartLoc: false };

  const startGeo = staff.geoHistory?.find((g: any) => g.type === 'start');
  if (startGeo?.lat && startGeo?.long) {
    return {
      lat: Number(startGeo.lat),
      lng: Number(startGeo.long),
      isAssumed: true,
      isStartLoc: true,
    };
  }

  return { lat: 0, lng: 0, isAssumed: false, isStartLoc: false };
}

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

// ─── Avatar marker constants ──────────────────────────────────────────────────
const MS = 54; // marker size (px)
const BD = 3; // border width
const IN = MS - BD * 2; // inner diameter
const R = MS / 2;
const TW = Math.round(MS * 0.28); // triangle width
const TH = Math.round(MS * 0.22); // triangle height

let _clipN = 0; // unique SVG clip-path counter

// ─── AvatarMarker ─────────────────────────────────────────────────────────────
interface AvatarMarkerProps {
  photoUrl?: string | null;
  label: string;
  color?: string;
  onReady?: () => void;
}

function AvatarMarker({ photoUrl, label, color = '#3b82f6', onReady }: AvatarMarkerProps) {
  const url = resolveUrl(photoUrl);
  const [err, setErr] = useState(false);
  const clip = useRef(`clip_${++_clipN}`).current;

  useEffect(() => {
    if (!url || err) onReady?.();
  }, [url, err]);

  return (
    <View style={{ width: MS, height: MS + TH, alignItems: 'center' }} collapsable={false}>
      {/* Circle */}
      {url && !err ? (
        <View style={{ width: MS, height: MS }} collapsable={false}>
          <Svg width={MS} height={MS} viewBox={`0 0 ${MS} ${MS}`}>
            <Defs>
              <ClipPath id={clip}>
                <Circle cx={R} cy={R} r={IN / 2} />
              </ClipPath>
            </Defs>
            <Circle cx={R} cy={R} r={R} fill={color} />
            <Circle cx={R} cy={R} r={IN / 2 + 1} fill="#fff" />
            <SvgImage
              href={url}
              width={IN}
              height={IN}
              x={BD}
              y={BD}
              clipPath={`url(#${clip})`}
              preserveAspectRatio="xMidYMid slice"
              onLoad={() => setTimeout(() => onReady?.(), 200)}
            />
          </Svg>
        </View>
      ) : (
        <View
          style={{
            width: MS,
            height: MS,
            borderRadius: R,
            backgroundColor: '#cbd5e1',
            borderWidth: BD,
            borderColor: color,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          collapsable={false}
        >
          <Text style={{ fontSize: MS * 0.33, fontWeight: '700', color: '#0f172a' }}>
            {label.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      {/* Pin tail */}
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: TW / 2,
          borderLeftColor: 'transparent',
          borderRightWidth: TW / 2,
          borderRightColor: 'transparent',
          borderTopWidth: TH,
          borderTopColor: color,
          marginTop: -1,
        }}
        collapsable={false}
      />
    </View>
  );
}

// ─── StaffMarker (memo — position updates via coordinate prop) ─────────────────
function StaffMarker({
  staff,
  selfId,
  onAction,
  leads,
}: {
  staff: any;
  selfId?: string;
  onAction?: (action: 'route' | 'date' | 'call' | 'open_menu') => void;
  leads?: any[];
}) {
  const [ready, setReady] = useState(false);
  const ref = useRef<any>(null);

  const empId = String(staff.employeeId?._id || staff.employeeId || '');
  if (empId && empId === String(selfId)) return null;

  const { lat, lng, isAssumed, isStartLoc } = resolveStaffLocation(staff, leads || []);
  if (!lat || !lng) return null;

  const latestGeo = staff.geoHistory?.[staff.geoHistory.length - 1];
  const actualAddress = latestGeo?.address || staff.address || '';
  const isOnline = !staff.dutyEnd;
  const matchedSiteName = getMatchedSiteName(lat, lng, leads || []);
  const flagText = isAssumed ? 'File' : 'Live';
  const displayLabel = `[${flagText}] ${matchedSiteName ? `📍 At ${matchedSiteName}` : actualAddress}`;

  return (
    <Marker
      ref={ref}
      coordinate={{ latitude: lat, longitude: lng }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={!ready}
      onPress={(e) => {
        e.stopPropagation();
        onAction?.('open_menu');
      }}
      style={{ alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={{ alignItems: 'center' }}>
        <AvatarMarker
          photoUrl={getPhotoUrl(staff)}
          label={getDisplayName(staff)}
          color={isStartLoc ? '#8b5cf6' : isAssumed ? '#f59e0b' : '#3b82f6'}
          onReady={() => setReady(true)}
        />
        {isOnline && displayLabel && (
          <View
            style={{
              backgroundColor: 'rgba(255,255,255,0.9)',
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
              marginTop: 2,
              maxWidth: 120,
              borderWidth: 1,
              borderColor: '#f1f5f9',
            }}
          >
            <Text
              style={{ fontSize: 8, color: '#334155', textAlign: 'center', fontWeight: '700' }}
              numberOfLines={2}
            >
              {displayLabel}
            </Text>
          </View>
        )}
      </View>
    </Marker>
  );
}

// ─── SelfMarker — NOT memo'd so live coords always propagate ──────────────────
interface SelfMarkerProps {
  lat: number;
  lng: number;
  employee: any;
  name: string;
  profileImage?: string;
  currentMatchedSite: any;
  reverseAddress?: string;
  liveTag?: string; // "10:32 AM" — shown as sub-label while on duty
  leads?: any[];
  isMocked?: boolean;
}

function SelfMarker({
  lat,
  lng,
  employee,
  name,
  profileImage,
  currentMatchedSite,
  reverseAddress,
  liveTag,
  leads,
  isMocked,
}: SelfMarkerProps) {
  const [ready, setReady] = useState(false);
  const ref = useRef<any>(null);

  if (!lat || !lng) return null;

  const dynamicMatchedSiteName = getMatchedSiteName(lat, lng, leads || []);
  const displaySubText = dynamicMatchedSiteName
    ? `📍 At ${dynamicMatchedSiteName}`
    : currentMatchedSite
      ? `📍 At ${currentMatchedSite.sender_name}`
      : reverseAddress || 'Fetching address…';

  return (
    <Marker
      ref={ref}
      coordinate={{ latitude: lat, longitude: lng }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={true} /* always track — live position must update */
      onPress={() => ref.current?.showCallout()}
    >
      <View style={{ alignItems: 'center' }}>
        <AvatarMarker
          photoUrl={profileImage || getPhotoUrl(employee)}
          label={name || 'Me'}
          color={isMocked ? '#ef4444' : '#10b981'}
          onReady={() => setReady(true)}
        />
        <View
          style={{
            backgroundColor: 'rgba(255,255,255,0.9)',
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 6,
            marginTop: 2,
            maxWidth: 120,
            borderWidth: 1,
            borderColor: isMocked ? '#ef4444' : '#10b981',
          }}
        >
          <Text
            style={{
              fontSize: 9,
              color: isMocked ? '#ef4444' : '#10b981',
              textAlign: 'center',
              fontWeight: '800',
            }}
            numberOfLines={1}
          >
            {isMocked ? '⚠️ [MOCK] ' : ''}
            {name || 'Me'}
          </Text>
        </View>
      </View>
      <Callout tooltip>
        <View style={cs.callout}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' }} />
            <Text style={cs.calloutName} numberOfLines={1}>
              {name || 'You'}
            </Text>
          </View>
          <Text style={cs.calloutSub} numberOfLines={2}>
            {displaySubText}
          </Text>
          {liveTag && (
            <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
              🕐 Updated {liveTag}
            </Text>
          )}
        </View>
      </Callout>
    </Marker>
  );
}

// ─── GeoTagMarker (site-visit pins on trail) ──────────────────────────────────
function GeoTagMarker({ loc, index }: { loc: any; index: number }) {
  const { lat, lng } = toLLng(loc);
  if (!lat || !lng) return null;
  return (
    <Marker
      key={`gt-${index}`}
      coordinate={{ latitude: lat, longitude: lng }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={false}
    >
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            backgroundColor: '#16a34a',
            paddingHorizontal: 6,
            paddingVertical: 3,
            borderRadius: 8,
            maxWidth: 110,
            elevation: 4,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }} numberOfLines={1}>
            📍 {loc.clientName || 'Site Visit'}
          </Text>
        </View>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: 5,
            borderLeftColor: 'transparent',
            borderRightWidth: 5,
            borderRightColor: 'transparent',
            borderTopWidth: 7,
            borderTopColor: '#16a34a',
          }}
        />
      </View>
    </Marker>
  );
}

// ─── TrailAnnotation — client bubble or end marker ────────────────────────────
function TrailAnnotation({ loc, index, leads }: { loc: any; index: number; leads: any[] }) {
  const ref = useRef<any>(null);
  const { lat, lng } = toLLng(loc);
  if (!lat || !lng || loc.type === 'geotag') return null;

  // Client proximity match
  let matchedName: string | null = null;
  let minDist = 10;
  for (const lead of leads) {
    const lLat = Number(lead.location?.lat);
    const lLng = Number(lead.location?.long);
    if (!lLat || !lLng) continue;
    const d = haversineM(lat, lng, lLat, lLng);
    if (d < minDist) {
      minDist = d;
      matchedName = lead.sender_name || lead.name || 'Client';
    }
  }

  const isStart = loc.type === 'start';
  const isEnd = loc.type === 'end';
  const isMatch = !!matchedName;
  const isNotable = isStart || isEnd || isMatch;

  // Plain tick dot
  if (!isNotable) {
    const timeStr = loc.timestamp
      ? new Date(loc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    return (
      <Marker
        ref={ref}
        coordinate={{ latitude: lat, longitude: lng }}
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={false}
        onPress={() => ref.current?.showCallout()}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#94a3b8',
            borderWidth: 1.5,
            borderColor: '#fff',
          }}
          collapsable={false}
        />
        <Callout tooltip>
          <View style={cs.callout}>
            <Text style={cs.calloutName}>Tick</Text>
            {timeStr ? <Text style={cs.calloutSub}>🕐 {timeStr}</Text> : null}
            {loc.accuracy ? (
              <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
                ±{Math.round(loc.accuracy)} m
              </Text>
            ) : null}
          </View>
        </Callout>
      </Marker>
    );
  }

  let bg = '#ef4444';
  let label = '🏁 Duty End';
  if (isStart) {
    bg = '#3b82f6';
    label = '🚀 Duty Start';
  } else if (isMatch) {
    bg = '#f59e0b';
    label = `📍 ${matchedName}`;
  }

  return (
    <Marker
      ref={ref}
      coordinate={{ latitude: lat, longitude: lng }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={false}
      onPress={() => ref.current?.showCallout()}
    >
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            backgroundColor: bg,
            paddingHorizontal: 7,
            paddingVertical: 3,
            borderRadius: 8,
            maxWidth: 130,
            elevation: 4,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: 4,
            borderLeftColor: 'transparent',
            borderRightWidth: 4,
            borderRightColor: 'transparent',
            borderTopWidth: 6,
            borderTopColor: bg,
          }}
        />
      </View>
      <Callout tooltip>
        <View style={cs.callout}>
          <Text style={cs.calloutName}>
            {isStart ? 'Duty Start' : isMatch ? matchedName! : 'Duty End'}
          </Text>
          {loc.timestamp && (
            <Text style={cs.calloutSub}>
              🕐{' '}
              {new Date(loc.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          )}
          {loc.accuracy && (
            <Text style={{ fontSize: 10, color: '#94a3b8' }}>±{Math.round(loc.accuracy)} m</Text>
          )}
        </View>
      </Callout>
    </Marker>
  );
}

// ─── LiveTracker ─────────────────────────────────────────────────────────────
// ─── SiteCoordinateMarker — Renders site coordinates on the map with start source and site detail
function SiteCoordinateMarker({
  staffOrSelf,
  name,
  isSelf,
}: {
  staffOrSelf: any;
  name: string;
  isSelf: boolean;
}) {
  const siteLat = Number(staffOrSelf?.siteLat);
  const siteLong = Number(staffOrSelf?.siteLong);

  if (!siteLat || !siteLong) return null;

  const markedByDevice = staffOrSelf.markedByDevice !== false;
  const markedBy = markedByDevice ? 'Own' : staffOrSelf.markedByUserName || 'Supervisor';
  const siteDetail = staffOrSelf.site_name || staffOrSelf.siteName || 'Site Detail';
  const label = `Start by ${markedBy}`;
  const bg = '#f59e0b'; // Amber/Orange color for site coordinates

  const ref = useRef<any>(null);

  return (
    <Marker
      ref={ref}
      coordinate={{ latitude: siteLat, longitude: siteLong }}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={false}
      onPress={() => ref.current?.showCallout()}
    >
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            backgroundColor: bg,
            paddingHorizontal: 7,
            paddingVertical: 4,
            borderRadius: 8,
            maxWidth: 160,
            elevation: 4,
          }}
        >
          <Text
            style={{ color: '#fff', fontSize: 9, fontWeight: '800', textAlign: 'center' }}
            numberOfLines={2}
          >
            {label}
            {'\n'}
            {siteDetail}
          </Text>
        </View>
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: 4,
            borderLeftColor: 'transparent',
            borderRightWidth: 4,
            borderRightColor: 'transparent',
            borderTopWidth: 6,
            borderTopColor: bg,
          }}
        />
      </View>
      <Callout tooltip>
        <View style={cs.callout}>
          <Text style={cs.calloutName}>
            {isSelf ? 'Your Site Location' : `${name}'s Site Location`}
          </Text>
          <Text style={cs.calloutSub} numberOfLines={2}>
            📍 {siteDetail}
          </Text>
          <Text style={{ fontSize: 10, color: bg, marginTop: 3, fontWeight: '700' }}>
            👤 {label}
          </Text>
        </View>
      </Callout>
    </Marker>
  );
}

export interface LiveTrackerProps {
  /** Real-time location from useLiveTracker (LocationObject | null) */
  location?: any;
  employee?: any;
  name?: string;
  profileImage?: string;
  currentMatchedSite?: any;
  reverseAddress?: string;
  /** Server-stored geoHistory from active attendance record */
  geoHistory?: any[];
  activeStaff: any[];
  leads?: any[];
  supervisorMobile?: string;
  onRefresh?: () => void;
  activeDuty?: any;
  employees?: any[];
}

export const LiveTracker = ({
  location: propLocation,
  employee,
  name,
  profileImage,
  currentMatchedSite,
  reverseAddress,
  geoHistory,
  activeStaff,
  leads = [],
  supervisorMobile,
  onRefresh,
  activeDuty,
  employees = [],
}: LiveTrackerProps) => {
  const unifiedLoc = useUnifiedLocation('LiveTracker');
  const tracker = {
    activeStaff: unifiedLoc.activeStaff,
    location: unifiedLoc.currentLocation,
    geoHistory: unifiedLoc.geoHistory,
    fetchActiveStaff: unifiedLoc.fetchActiveStaff,
    refreshLocation: unifiedLoc.refreshLiveTrackerLocation,
    dutyOn: unifiedLoc.dutyOn,
  };

  const liveLat = tracker.location?.latitude || (propLocation ? toLLng(propLocation).lat : 0);
  const liveLng = tracker.location?.longitude || (propLocation ? toLLng(propLocation).lng : 0);
  const liveTime = tracker.location?.timestamp
    ? new Date(tracker.location.timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const liveTrail = tracker.geoHistory || [];

  const mapRef = useRef<MapView>(null);

  // ── Road-snapped route (async, cached by routeCoords length) ─────────────
  const [snappedRoute, setSnappedRoute] = useState<Array<{ latitude: number; longitude: number }>>(
    []
  );
  const lastSnappedLenRef = useRef<number>(0);
  const mapReady = useRef(false);

  // Follow on first fix
  useEffect(() => {
    if (mapRef.current && mapReady.current && liveLat && liveLng) {
      mapRef.current.animateToRegion(
        {
          latitude: liveLat,
          longitude: liveLng,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        600
      );
    }
  }, [liveLat, liveLng]);

  // Auto-follow live position on every GPS update (if following mode is on)
  const [isFollowing, setIsFollowing] = useState(true);

  // ── Staff isolation (declared here so auto-follow effect can reference it) ──
  const [isolatedStaffIds, setIsolatedStaffIds] = useState<string[]>([]);
  const [activeWorkerMenuId, setActiveWorkerMenuId] = useState<string | null>(null);
  const [isListVisible, setIsListVisible] = useState(false);
  const [selectedMarkerStaff, setSelectedMarkerStaff] = useState<any | null>(null);

  useEffect(() => {
    if (!isFollowing || !mapRef.current || !mapReady.current || !liveLat || !liveLng) return;
    if (isolatedStaffIds.length > 0) return;
    mapRef.current.animateCamera(
      { center: { latitude: liveLat, longitude: liveLng }, zoom: 16 },
      { duration: 600 }
    );
  }, [liveLat, liveLng, isFollowing, isolatedStaffIds]);

  // ── Route / date state ────────────────────────────────────────────────────
  const [routeDate, setRouteDate] = useState<Date>(new Date());
  const [showRoute, setShowRoute] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  // ── Staff isolation continued ─────────────────────────────────────────────
  const currentRole = (employee?.role || employee?.userRole || 'project').toLowerCase();
  const filteredStaff = useMemo(
    () =>
      activeStaff
        .filter((s) => {
          // Prevent rendering self twice (once as SelfMarker, once as StaffMarker)
          if (
            String(s._id) === String(employee?._id) ||
            String(s.employeeId?._id || s.employeeId) === String(employee?._id)
          )
            return false;
          return true;
        })
        .sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b))),
    [activeStaff, employee]
  );

  const prevIsolatedRef = useRef<string>('');

  useEffect(() => {
    const currentIsolatedStr = isolatedStaffIds.sort().join(',');
    if (currentIsolatedStr === prevIsolatedRef.current) return;
    prevIsolatedRef.current = currentIsolatedStr;

    if (!mapRef.current || !mapReady.current) return;

    const doFit = (coords: Array<{ latitude: number; longitude: number }>) => {
      if (coords.length < 2 || !mapRef.current) return;
      (mapRef.current as any).fitToCoordinates?.(coords, {
        edgePadding: { top: 80, right: 30, bottom: 100, left: 30 },
        animated: true,
      });
    };

    if (isolatedStaffIds.length > 0) {
      let workerRoute: { latitude: number; longitude: number }[] = [];
      const selectedStaffs = activeStaff.filter((s) => isolatedStaffIds.includes(s._id));

      selectedStaffs.forEach((s) => {
        const { lat: sLat, lng: sLng } = resolveStaffLocation(s, leads);
        if (sLat && sLng) workerRoute.push({ latitude: sLat, longitude: sLng });
        (s.geoHistory || []).forEach((loc: any) => {
          const { lat, lng } = toLLng(loc);
          if (lat && lng) workerRoute.push({ latitude: lat, longitude: lng });
        });
      });

      if (workerRoute.length > 1) {
        setTimeout(() => doFit(workerRoute), 350);
      } else if (workerRoute.length === 1) {
        mapRef.current.animateToRegion(
          {
            latitude: workerRoute[0].latitude,
            longitude: workerRoute[0].longitude,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          },
          800
        );
      }
    } else {
      const allCoords = filteredStaff
        .map((s) => {
          const { lat, lng } = resolveStaffLocation(s, leads);
          return { latitude: lat, longitude: lng };
        })
        .filter((c) => c.latitude && c.longitude);

      if (liveLat && liveLng) allCoords.push({ latitude: liveLat, longitude: liveLng });

      if (allCoords.length > 1) {
        setTimeout(() => doFit(allCoords), 350);
      } else if (allCoords.length === 1) {
        mapRef.current.animateToRegion(
          {
            latitude: allCoords[0].latitude,
            longitude: allCoords[0].longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          },
          800
        );
      }
    }
  }, [isolatedStaffIds, activeStaff, filteredStaff, liveLat, liveLng, leads]);

  // ── Route data: merge server geoHistory + live trail ─────────────────────
  const displayGeoHistory = useMemo(() => {
    if (isolatedStaffIds.length === 1) {
      return activeStaff.find((s) => s._id === isolatedStaffIds[0])?.geoHistory || [];
    }
    if (isolatedStaffIds.length > 1) return []; // Multiple routes rendered explicitly
    return geoHistory || [];
  }, [isolatedStaffIds, activeStaff, geoHistory]);

  /** Server history ticks filtered to the selected date (normalised to MapView coords) */
  const serverRoute = useMemo<Array<{ latitude: number; longitude: number }>>(() => {
    if (!showRoute) return [];
    return displayGeoHistory
      .filter((loc: any) => {
        if (loc.type === 'geotag') return false;
        if (!loc.timestamp) return true; // include ticks without timestamp in today's route
        return isSameDay(new Date(loc.timestamp), routeDate);
      })
      .map((loc: any) => {
        const { lat, lng } = toLLng(loc);
        return { latitude: lat, longitude: lng };
      })
      .filter((c: any) => c.latitude && c.longitude);
  }, [displayGeoHistory, routeDate, showRoute]);

  /**
   * Today's route = server history for today + live trail accumulated this session.
   * Other dates = server history only.
   */
  const routeCoords = useMemo(() => {
    if (!showRoute) return [];
    if (isolatedStaffIds.length === 0 && isSameDay(routeDate, new Date())) {
      // Merge: de-duplicate by keeping unique coords
      const combined = [...serverRoute, ...liveTrail];
      return combined;
    }
    return serverRoute;
  }, [serverRoute, liveTrail, routeDate, showRoute, isolatedStaffIds]);

  // ── Async road snapping: runs whenever routeCoords changes meaningfully ──
  useEffect(() => {
    if (routeCoords.length < 2) {
      setSnappedRoute([]);
      lastSnappedLenRef.current = 0;
      return;
    }
    // Only re-snap when we've accumulated 5+ new points to avoid excessive API calls
    if (Math.abs(routeCoords.length - lastSnappedLenRef.current) < 5 && snappedRoute.length > 0)
      return;

    let cancelled = false;
    snapCoordsToRoads(routeCoords).then((result) => {
      if (!cancelled) {
        setSnappedRoute(result);
        lastSnappedLenRef.current = routeCoords.length;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [routeCoords]);

  // The coords we actually draw: prefer snapped, fall back to raw
  const displayRouteCoords = snappedRoute.length > 1 ? snappedRoute : routeCoords;

  // ── Date options (last 7 days) ────────────────────────────────────────────
  const dateOptions = useMemo<Date[]>(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d);
    }
    return days;
  }, []);

  const fitRoute = useCallback((coords: Array<{ latitude: number; longitude: number }>) => {
    if (coords.length < 2 || !mapRef.current) return;
    (mapRef.current as any).fitToCoordinates?.(coords, {
      edgePadding: { top: 80, right: 30, bottom: 100, left: 30 },
      animated: true,
    });
  }, []);

  const handleCall = useCallback(() => {
    const n = supervisorMobile || employee?.supervisorMobile || employee?.mobile;
    if (n) Linking.openURL(`tel:${String(n).replace(/\D/g, '')}`);
    else Alert.alert('No Contact', 'No supervisor number configured.');
  }, [supervisorMobile, employee]);

  const focusSelf = useCallback(async () => {
    if (!mapRef.current) return;
    setIsFollowing(true);
    if (liveLat && liveLng) {
      mapRef.current.animateToRegion({
        latitude: liveLat,
        longitude: liveLng,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      });
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      mapRef.current.animateToRegion({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      });
    } catch {
      /* ignore */
    }
  }, [liveLat, liveLng]);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async (isAuto = false) => {
    if (isRefreshing) return;
    if (!isAuto) setIsRefreshing(true);
    try {
      // 1. Fetch current GPS position via the tracker
      await tracker.refreshLocation();

      // 2. Animate map to the current known position
      if (mapRef.current && !isAuto && liveLat && liveLng) {
        mapRef.current.animateToRegion(
          {
            latitude: liveLat,
            longitude: liveLng,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          },
          600
        );
      }

      // 3. Call parent onRefresh to fetch active staff and run other updates
      if (onRefresh) {
        await onRefresh();
      }
      if (!isAuto) appService.showToast('Live tracker refreshed', 'Success');
    } catch (err) {
      if (!isAuto) appService.showToast('Failed to refresh live tracker', 'Error');
    } finally {
      if (!isAuto) setIsRefreshing(false);
    }
  };

  // Live GPS tracking is handled in real-time via socket ('attendance:geo_update')
  // Manual refresh remains available via handleRefresh(false)

  const [gpsTimeout, setGpsTimeout] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setGpsTimeout(true);
    }, 5000); // 5 second timeout to show map anyway
    return () => clearTimeout(timer);
  }, []);

  // Dynamic fallback coordinates (checks leads first before India Gate)
  const firstLeadWithLoc = leads?.find((l: any) => l.location?.lat && l.location?.long);
  const fallbackLat = firstLeadWithLoc
    ? Number(firstLeadWithLoc.location.lat)
    : GPS_CONSTANTS.DEFAULT_LOCATION.latitude;
  const fallbackLng = firstLeadWithLoc
    ? Number(firstLeadWithLoc.location.long)
    : GPS_CONSTANTS.DEFAULT_LOCATION.longitude;

  const validSelfLat =
    liveLat || (propLocation ? toLLng(propLocation).lat : gpsTimeout ? fallbackLat : 0);
  const validSelfLng =
    liveLng || (propLocation ? toLLng(propLocation).lng : gpsTimeout ? fallbackLng : 0);

  if (!validSelfLat || !validSelfLng) {
    return (
      <View
        style={[
          S.flex1,
          { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
        ]}
      >
        <ActivityIndicator size="large" color="#10b981" />
        <Text style={{ marginTop: 12, fontSize: 14, color: '#64748b', fontWeight: '600' }}>
          Fetching real-time location...
        </Text>
      </View>
    );
  }

  return (
    <View style={S.flex1}>
      {/* ── MAP ──────────────────────────────────────────────────────────── */}
      <MapView
        ref={mapRef}
        style={S.flex1}
        provider="google"
        initialRegion={{
          latitude: validSelfLat,
          longitude: validSelfLng,
          latitudeDelta: 0.04,
          longitudeDelta: 0.04,
        }}
        scrollEnabled
        onPanDrag={() => setIsFollowing(false)}
        onRegionChangeComplete={(_, d) => {
          if ((d as any)?.isGesture) setIsFollowing(false);
        }}
        onMapReady={() => {
          mapReady.current = true;
          if (liveLat && liveLng) {
            mapRef.current?.animateToRegion(
              { latitude: liveLat, longitude: liveLng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
              400
            );
          }
        }}
      >
        {/* Self — live position marker (NOT memo'd for instant coordinate updates) */}
        {validSelfLat && validSelfLng ? (
          <SelfMarker
            lat={validSelfLat}
            lng={validSelfLng}
            employee={employee}
            name={name || 'Me'}
            profileImage={profileImage}
            currentMatchedSite={currentMatchedSite}
            reverseAddress={reverseAddress}
            liveTag={liveTime}
            leads={leads}
            isMocked={tracker.location?.isMocked}
          />
        ) : null}

        {/* Route polyline — road-snapped (falls back to raw GPS if API unavailable) */}
        {showRoute && displayRouteCoords.length > 1 && (
          <Polyline
            coordinates={displayRouteCoords}
            strokeColor="#3b82f6"
            strokeWidth={4}
            lineDashPattern={snappedRoute.length > 1 ? undefined : [8, 4]}
          />
        )}

        {/* Multiple Routes (if >1 selected) */}
        {isolatedStaffIds.length > 1 &&
          showRoute &&
          activeStaff
            .filter((s) => isolatedStaffIds.includes(s._id))
            .map((staff) => {
              const sHist = staff.geoHistory || [];
              const staffRoute = sHist
                .filter(
                  (loc: any) =>
                    loc.type !== 'geotag' &&
                    (!loc.timestamp || isSameDay(new Date(loc.timestamp), routeDate))
                )
                .map((loc: any) => {
                  const { lat, lng } = toLLng(loc);
                  return { latitude: lat, longitude: lng };
                })
                .filter((c: any) => c.latitude && c.longitude);
              return (
                <React.Fragment key={`route-multi-${staff._id}`}>
                  {staffRoute.length > 1 && (
                    <Polyline coordinates={staffRoute} strokeColor="#3b82f6" strokeWidth={4} />
                  )}
                  {sHist
                    .filter(
                      (loc: any) =>
                        loc.type !== 'geotag' &&
                        (!loc.timestamp || isSameDay(new Date(loc.timestamp), routeDate))
                    )
                    .map((loc: any, i: number) => (
                      <TrailAnnotation
                        key={`ann-multi-${staff._id}-${i}`}
                        loc={loc}
                        index={i}
                        leads={leads}
                      />
                    ))}
                </React.Fragment>
              );
            })}

        {/* Trail annotations: client bubbles, end markers, plain dots */}
        {displayGeoHistory
          .filter((loc: any) => loc.type !== 'geotag')
          .map((loc: any, i: number) => (
            <TrailAnnotation key={`ann-${i}`} loc={loc} index={i} leads={leads} />
          ))}

        {/* Geo-tag site-visit pins */}
        {displayGeoHistory
          .filter((loc: any) => loc.type === 'geotag')
          .map((loc: any, i: number) => (
            <GeoTagMarker key={`gt-${i}`} loc={loc} index={i} />
          ))}

        {/* Other staff markers */}
        {filteredStaff
          .filter((s) => isolatedStaffIds.length === 0 || isolatedStaffIds.includes(s._id))
          .map((s) => (
            <StaffMarker
              key={s._id}
              staff={s}
              selfId={employee?._id}
              leads={leads}
              onAction={(action) => {
                if (action === 'open_menu') {
                  setSelectedMarkerStaff(s);
                  if (!isolatedStaffIds.includes(s._id))
                    setIsolatedStaffIds((prev) => [...prev, s._id]);
                  const { lat: sLat, lng: sLng } = resolveStaffLocation(s, leads);
                  if (sLat && sLng && mapRef.current && mapReady.current) {
                    mapRef.current.animateToRegion({
                      latitude: Number(sLat),
                      longitude: Number(sLng),
                      latitudeDelta: 0.012,
                      longitudeDelta: 0.012,
                    });
                  }
                } else if (action === 'route') {
                  if (s.markedByDevice === false) {
                    appService.showToast('GPS-off. Route tracking unavailable.', 'Info');
                    return;
                  }
                  setIsolatedStaffIds([s._id]);
                  setShowRoute(true);
                  setIsListVisible(false);
                  setIsFollowing(true);
                  setSelectedMarkerStaff(null);
                } else if (action === 'date') {
                  if (s.markedByDevice === false) {
                    appService.showToast('GPS-off. Route tracking unavailable.', 'Info');
                    return;
                  }
                  setIsolatedStaffIds([s._id]);
                  setShowRoute(true);
                  setIsListVisible(false);
                  setIsFollowing(true);
                  setDatePickerVisible(true);
                  setSelectedMarkerStaff(null);
                } else if (action === 'call') {
                  const num = s.mobile || s.employeeMobile || s.userMobile;
                  if (num) Linking.openURL(`tel:${String(num).replace(/\\D/g, '')}`);
                  else Alert.alert('No Contact', 'No mobile number found for this worker.');
                  setSelectedMarkerStaff(null);
                }
              }}
            />
          ))}

        {/* Render Site coordinate marker for self if activeDuty has it */}
        {activeDuty && activeDuty.siteLat && activeDuty.siteLong && (
          <SiteCoordinateMarker staffOrSelf={activeDuty} name={name || 'You'} isSelf={true} />
        )}

        {/* Render Site coordinate marker for other filtered active staff */}
        {filteredStaff
          .filter((s) => isolatedStaffIds.length === 0 || isolatedStaffIds.includes(s._id))
          .map((s) => {
            if (s.siteLat && s.siteLong) {
              return (
                <SiteCoordinateMarker
                  key={`site-marker-${s._id}`}
                  staffOrSelf={s}
                  name={getDisplayName(s)}
                  isSelf={false}
                />
              );
            }
            return null;
          })}
      </MapView>

      {tracker.dutyOn && (!liveLat || !liveLng) ? (
        <View
          style={{
            position: 'absolute',
            top: 72,
            left: 14,
            right: 14,
            backgroundColor: 'rgba(254, 243, 199, 0.95)', // amber-50
            padding: 10,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#f59e0b', // amber-500
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            zIndex: 999,
            elevation: 6,
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowRadius: 3,
          }}
        >
          <Ionicons name="warning" size={18} color="#d97706" />
          <Text style={{ fontSize: 11, color: '#92400e', flex: 1, fontWeight: '600' }}>
            GPS signal unavailable. Showing fallback site location. Enable GPS on your emulator and
            set mock coordinates to sync.
          </Text>
        </View>
      ) : null}

      {/* ── Top-left: Workers toggle ──────────────────────────────────────── */}
      <View style={{ position: 'absolute', top: 14, left: 14 }}>
        <TouchableOpacity
          style={fab}
          onPress={() => {
            setIsListVisible(!isListVisible);
            setMenuVisible(false);
          }}
        >
          <Ionicons name={isListVisible ? 'close' : 'list'} size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* ── Top-right: Locate & Refresh ───────────────────────────────── */}
      <View
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          flexDirection: 'row',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <TouchableOpacity
          style={{
            backgroundColor: '#0f172a',
            borderRadius: 22,
            paddingHorizontal: 12,
            height: 44,
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
            elevation: 5,
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 4,
          }}
          onPress={() => handleRefresh(false)}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color="#10b981" />
          ) : (
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' }} />
          )}
          <Text style={{ fontSize: 12, color: '#fff', fontWeight: '700' }}>
            {liveTime ? `Live · updated ${liveTime}` : 'Refresh'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={fab} onPress={focusSelf}>
          <Ionicons
            name={isFollowing ? 'locate' : 'locate-outline'}
            size={22}
            color={isFollowing ? COLORS.primary : '#64748b'}
          />
        </TouchableOpacity>
      </View>

      {/* ── Custom Interactive Callout (Android safe) ── */}
      {selectedMarkerStaff && (
        <View
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: [{ translateX: -110 }, { translateY: -170 }],
            width: 220,
            zIndex: 1000,
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 8,
              elevation: 6,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 4 },
              overflow: 'hidden',
            }}
          >
            <View style={{ padding: 10, flexDirection: 'row', alignItems: 'flex-start' }}>
              <TouchableOpacity
                onPress={() => {
                  const emp = selectedMarkerStaff.employeeId || {};
                  const usr = selectedMarkerStaff.userId || {};
                  const num =
                    emp.mobile ||
                    emp.contactNumber ||
                    emp.employeeMobile ||
                    usr.mobile ||
                    usr.userMobile ||
                    usr.phone_number ||
                    selectedMarkerStaff.mobile ||
                    selectedMarkerStaff.employeeMobile ||
                    selectedMarkerStaff.userMobile;

                  if (num) Linking.openURL(`tel:${String(num).replace(/\\D/g, '')}`);
                  else Alert.alert('No Contact', 'No mobile number found for this worker.');
                  setSelectedMarkerStaff(null);
                }}
                style={{ paddingRight: 8, justifyContent: 'center' }}
              >
                <View style={{ backgroundColor: '#dcfce7', padding: 6, borderRadius: 16 }}>
                  <Ionicons name="call" size={14} color="#16a34a" />
                </View>
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ fontSize: 13, fontWeight: '700', color: '#0f172a' }}
                  numberOfLines={1}
                >
                  {getDisplayName(selectedMarkerStaff)}
                </Text>
                {(() => {
                  const {
                    lat: lLat,
                    lng: lLng,
                    isAssumed,
                    isStartLoc,
                  } = resolveStaffLocation(selectedMarkerStaff, leads || []);
                  const mName = getMatchedSiteName(lLat, lLng, leads || []);

                  return (
                    <>
                      <Text
                        style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}
                        numberOfLines={3}
                      >
                        {mName
                          ? `📍 At ${mName}`
                          : selectedMarkerStaff.geoHistory?.[
                              selectedMarkerStaff.geoHistory.length - 1
                            ]?.address ||
                            selectedMarkerStaff.location?.address ||
                            'Fetching address...'}
                      </Text>
                      <View style={{ marginTop: 4, flexDirection: 'row', alignItems: 'center' }}>
                        <View
                          style={{
                            backgroundColor: isStartLoc
                              ? '#ede9fe'
                              : isAssumed
                                ? '#fef3c7'
                                : '#dcfce7',
                            paddingHorizontal: 6,
                            paddingVertical: 2,
                            borderRadius: 4,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: '700',
                              color: isStartLoc ? '#8b5cf6' : isAssumed ? '#d97706' : '#16a34a',
                            }}
                          >
                            {isStartLoc
                              ? '🚀 Duty Start'
                              : isAssumed
                                ? '📍 Site Location'
                                : '📡 Live GPS'}
                          </Text>
                        </View>
                      </View>
                    </>
                  );
                })()}
              </View>
              <TouchableOpacity
                onPress={() => setSelectedMarkerStaff(null)}
                style={{ marginLeft: 4, padding: 2 }}
              >
                <Ionicons name="close" size={18} color="#94a3b8" />
              </TouchableOpacity>
            </View>
          </View>
          {/* Tail */}
          <View
            style={{
              width: 0,
              height: 0,
              borderLeftWidth: 10,
              borderRightWidth: 10,
              borderTopWidth: 12,
              borderLeftColor: 'transparent',
              borderRightColor: 'transparent',
              borderTopColor: '#f8fafc',
              alignSelf: 'center',
            }}
          />
        </View>
      )}

      {/* ── Date picker modal ─────────────────────────────────────────────── */}
      <Modal
        visible={datePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDatePickerVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            justifyContent: 'center',
            padding: 22,
          }}
          onPress={() => setDatePickerVisible(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                overflow: 'hidden',
                elevation: 14,
              }}
            >
              {/* Header */}
              <View style={{ backgroundColor: '#0f172a', padding: 16 }}>
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>
                  📅 Select Route Date
                </Text>
                <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                  Replay movement for any day
                </Text>
              </View>

              {dateOptions.map((d, i) => {
                const active = isSameDay(d, routeDate);
                const ticks = displayGeoHistory.filter(
                  (loc: any) => loc.timestamp && isSameDay(new Date(loc.timestamp), d)
                );
                const hasTicks = ticks.length > 0;
                return (
                  <TouchableOpacity
                    key={i}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: 14,
                      borderBottomWidth: i < dateOptions.length - 1 ? 0.5 : 0,
                      borderBottomColor: '#f1f5f9',
                      backgroundColor: active ? '#eff6ff' : '#fff',
                    }}
                    onPress={() => {
                      setRouteDate(d);
                      setShowRoute(true);
                      setDatePickerVisible(false);
                      // Fit map to that day's coords
                      setTimeout(() => {
                        const coords = displayGeoHistory
                          .filter(
                            (loc: any) =>
                              loc.type !== 'geotag' &&
                              loc.timestamp &&
                              isSameDay(new Date(loc.timestamp), d)
                          )
                          .map((loc: any) => {
                            const { lat, lng } = toLLng(loc);
                            return { latitude: lat, longitude: lng };
                          })
                          .filter((c: any) => c.latitude && c.longitude);
                        fitRoute(coords);
                      }, 350);
                    }}
                  >
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 19,
                        marginRight: 12,
                        backgroundColor: active ? '#3b82f6' : '#f1f5f9',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: '800',
                          fontSize: 13,
                          color: active ? '#fff' : '#334155',
                        }}
                      >
                        {d.getDate()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontWeight: '700',
                          fontSize: 14,
                          color: active ? '#1d4ed8' : '#0f172a',
                        }}
                      >
                        {dayLabel(d)}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748b' }}>
                        {d.toLocaleDateString('en-IN', {
                          weekday: 'long',
                          day: '2-digit',
                          month: 'short',
                        })}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: hasTicks ? '#10b981' : '#cbd5e1',
                        }}
                      >
                        {ticks.length} pts
                      </Text>
                      {active && <Ionicons name="checkmark-circle" size={18} color="#3b82f6" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Workers list ──────────────────────────────────────────────────── */}
      {isListVisible && (
        <View
          style={{
            position: 'absolute',
            top: 68,
            left: 14,
            right: 14,
            maxHeight: 300,
            backgroundColor: '#fff',
            borderRadius: 14,
            elevation: 8,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <View
            style={{
              padding: 12,
              borderBottomWidth: 0.5,
              borderBottomColor: '#f1f5f9',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a' }}>
                Active Workers ({filteredStaff.length})
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <TouchableOpacity
                onPress={() => setIsListVisible(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: '#10b981',
                  justifyContent: 'center',
                  alignItems: 'center',
                  elevation: 2,
                }}
              >
                <Ionicons name="checkmark" size={20} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setIsListVisible(false)}>
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
            {/* Show all */}
            <TouchableOpacity
              style={listRow}
              onPress={() => {
                const allIds = filteredStaff.map((s) => s._id);
                if (isolatedStaffIds.length === 0 || isolatedStaffIds.length === allIds.length) {
                  setIsolatedStaffIds(['__none__']);
                } else {
                  setIsolatedStaffIds(allIds);
                }
              }}
            >
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: COLORS.primary,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Ionicons name="people" size={16} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>
                  All Active Worker
                </Text>
              </View>
              <View style={{ marginLeft: 10, justifyContent: 'center' }}>
                <Ionicons
                  name={
                    isolatedStaffIds.length === 0 ||
                    isolatedStaffIds.length === filteredStaff.length
                      ? 'checkbox'
                      : 'square-outline'
                  }
                  size={22}
                  color={
                    isolatedStaffIds.length === 0 ||
                    isolatedStaffIds.length === filteredStaff.length
                      ? '#3b82f6'
                      : '#cbd5e1'
                  }
                />
              </View>
            </TouchableOpacity>

            {filteredStaff.map((s) => {
              const {
                lat: sLat,
                lng: sLng,
                isAssumed,
                isStartLoc,
              } = resolveStaffLocation(s, leads || []);
              const isSelfDevice = s.markedByDevice !== false;
              const hasLocation = !!sLat && !!sLng;

              let leadName = '';
              if (leads && s.leadId) {
                const leadIdStr = String(s.leadId._id || s.leadId);
                const matchedLead = leads.find((l: any) => String(l._id) === leadIdStr);
                if (matchedLead) {
                  leadName =
                    matchedLead.displayName ||
                    matchedLead.sender_name ||
                    matchedLead.product_name ||
                    '';
                }
              } else if (typeof s.leadId === 'object' && s.leadId) {
                leadName = s.leadId.displayName || s.leadId.sender_name || '';
              }
              const finalSiteName = leadName || s.site_name || s.siteName || '';
              const addressFallback =
                s.geoHistory?.[s.geoHistory.length - 1]?.address || s.location?.address;
              const rawCoords = hasLocation ? `${sLat.toFixed(5)}, ${sLng.toFixed(5)}` : '';

              const matchedSiteName = getMatchedSiteName(sLat, sLng, leads || []);
              const locText = matchedSiteName
                ? `At ${matchedSiteName}`
                : isSelfDevice
                  ? addressFallback || rawCoords || finalSiteName
                  : finalSiteName || addressFallback || rawCoords;

              return (
                <View key={s._id} style={{ borderBottomWidth: 1, borderBottomColor: '#f8fafc' }}>
                  <TouchableOpacity
                    style={[
                      listRow,
                      { borderBottomWidth: 0 },
                      isolatedStaffIds.includes(s._id) && { backgroundColor: '#eff6ff' },
                    ]}
                    onPress={() => {
                      if (!isSelfDevice) {
                        appService.showToast('GPS-off. User login with other device.', 'Info');
                        return;
                      }
                      if (hasLocation) {
                        setIsolatedStaffIds((prev) => {
                          if (prev.length === 0) {
                            return filteredStaff.map((fs) => fs._id).filter((id) => id !== s._id);
                          }
                          const current = prev.includes('__none__') ? [] : prev;
                          const newIds = current.includes(s._id)
                            ? current.filter((id) => id !== s._id)
                            : [...current, s._id];
                          return newIds.length === 0 ? ['__none__'] : newIds;
                        });
                        setIsFollowing(true);
                        setActiveWorkerMenuId(null);
                      } else {
                        appService.showToast('No location data available for this worker.', 'Info');
                      }
                    }}
                  >
                    {getPhotoUrl(s) ? (
                      <Image
                        source={{ uri: resolveUrl(getPhotoUrl(s))! }}
                        style={{ width: 36, height: 36, borderRadius: 18 }}
                      />
                    ) : (
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: hasLocation
                            ? isStartLoc
                              ? '#8b5cf6'
                              : isAssumed
                                ? '#f59e0b'
                                : '#3b82f6'
                            : '#cbd5e1',
                          justifyContent: 'center',
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>
                          {getDisplayName(s).charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Text style={{ fontWeight: '700', color: '#0f172a', fontSize: 13 }}>
                          {getDisplayName(s)}
                        </Text>
                        <View
                          style={{
                            backgroundColor: hasLocation
                              ? isAssumed
                                ? '#fef3c7'
                                : '#dcfce7'
                              : '#f1f5f9',
                            paddingHorizontal: 5,
                            paddingVertical: 2,
                            borderRadius: 4,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: '700',
                              color: hasLocation ? (isAssumed ? '#d97706' : '#16a34a') : '#8b5cf6',
                            }}
                          >
                            {hasLocation ? (isAssumed ? 'File' : 'Live') : 'No Location'}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}
                        numberOfLines={1}
                      >
                        {locText ? `at ${locText} · ` : ''}Shift{' '}
                        {s.shiftCode || s.shiftName || 'N/A'}
                      </Text>
                      {(() => {
                        if (!s.dutyStart) return null;
                        const actualStart = new Date(s.dutyStart).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        });

                        let dutyEndScheduled = s.dutyEndScheduled;
                        let lockHrs = s.shiftLockHours || 8;

                        if (!dutyEndScheduled && employees && employees.length > 0) {
                          const empId = s.employeeId?._id || s.employeeId || s.id || s.employee_id;
                          const emp = employees.find((e: any) => String(e._id) === String(empId));
                          if (emp) {
                            const shiftDetails = getEmployeeShiftDetails(emp);
                            if (shiftDetails) {
                              lockHrs = shiftDetails.durationHrs || 8;
                              dutyEndScheduled = getScheduledEndTime(
                                shiftDetails.startTime,
                                lockHrs
                              );
                            }
                          }
                        }

                        if (dutyEndScheduled) {
                          const schedEnd = new Date(dutyEndScheduled);
                          const schedStart = new Date(schedEnd.getTime() - lockHrs * 3600000);
                          const schedStartStr = schedStart.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          });
                          const schedEndStr = schedEnd.toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          });
                          return (
                            <Text
                              style={{
                                fontSize: 10,
                                color: '#16a34a',
                                fontWeight: '700',
                                marginTop: 2,
                              }}
                            >
                              {`Schd: ${schedStartStr} <-> ${schedEndStr} | Actual: ${actualStart}`}
                            </Text>
                          );
                        }
                        return (
                          <Text
                            style={{
                              fontSize: 10,
                              color: '#16a34a',
                              fontWeight: '700',
                              marginTop: 2,
                            }}
                          >
                            {`Actual: ${actualStart}`}
                          </Text>
                        );
                      })()}
                    </View>
                    <View style={{ marginLeft: 10, justifyContent: 'center' }}>
                      <Ionicons
                        name={
                          isolatedStaffIds.length === 0 || isolatedStaffIds.includes(s._id)
                            ? 'checkbox'
                            : 'square-outline'
                        }
                        size={22}
                        color={
                          isolatedStaffIds.length === 0 || isolatedStaffIds.includes(s._id)
                            ? '#3b82f6'
                            : '#cbd5e1'
                        }
                      />
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Route date badge (bottom) ──────────────────────────────────────── */}
      <View
        style={{
          position: 'absolute',
          bottom: 18,
          left: 14,
          right: 14,
          flexDirection: 'row',
          gap: 8,
          justifyContent: 'space-between',
        }}
      >
        {showRoute && displayRouteCoords.length > 1 ? (
          <View
            style={{
              backgroundColor: '#0f172a',
              borderRadius: 20,
              paddingHorizontal: 10,
              paddingVertical: 5,
              alignSelf: 'flex-start',
              elevation: 6,
            }}
          >
            <Text style={{ color: '#64748b', fontSize: 10 }}>
              {snappedRoute.length > 1 ? '🛣️' : '📍'} {displayRouteCoords.length} pts
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}

        {showRoute && !isSameDay(routeDate, new Date()) && (
          <TouchableOpacity
            style={{
              backgroundColor: '#3b82f6',
              borderRadius: 20,
              paddingHorizontal: 12,
              paddingVertical: 7,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              elevation: 5,
              alignSelf: 'flex-start',
            }}
            onPress={() => setDatePickerVisible(true)}
          >
            <Ionicons name="calendar" size={13} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
              {dayLabel(routeDate)}
            </Text>
            <TouchableOpacity
              onPress={() => {
                setRouteDate(new Date());
                setShowRoute(true);
              }}
            >
              <Ionicons name="close-circle" size={15} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

// ─── Static style constants ────────────────────────────────────────────────────
const fab = {
  width: 44,
  height: 44,
  borderRadius: 22,
  backgroundColor: '#fff',
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  elevation: 5,
  shadowColor: '#000',
  shadowOpacity: 0.18,
  shadowRadius: 4,
};

const dropdownStyle = {
  position: 'absolute' as const,
  top: 68 + 44 + 4,
  right: 14,
  backgroundColor: '#fff',
  borderRadius: 14,
  elevation: 12,
  shadowColor: '#000',
  shadowOpacity: 0.18,
  shadowRadius: 8,
  minWidth: 210,
  overflow: 'hidden' as const,
};

const row = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  paddingHorizontal: 16,
  paddingVertical: 13,
};

const rowTxt = { fontSize: 13, fontWeight: '600' as const, color: '#0f172a' };
const iconGap = { marginRight: 10 };
const divider = { height: 0.5, backgroundColor: '#f1f5f9', marginHorizontal: 0 };

const listRow = {
  padding: 12,
  borderBottomWidth: 0.5,
  borderBottomColor: '#f1f5f9',
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
};

const cs = {
  callout: {
    width: 230,
    padding: 11,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  calloutName: { fontWeight: '700' as const, fontSize: 14, color: '#0f172a' },
  calloutSub: { fontSize: 11, color: '#64748b', marginTop: 3 },
};

export default LiveTracker;
