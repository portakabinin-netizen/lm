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

export const GEO_TRACKING_TASK = 'background-geo-tracking';

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

// ─── Background Geo-Tracking Task ────────────────────────────────────────────
TaskManager.defineTask(GEO_TRACKING_TASK, async ({ data, error }: any) => {
  if (error) {
    console.error('[GEO_TASK] Error:', error.message);
    return;
  }
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
      await AsyncStorage.setItem('geo_mismatch', dist > 500 ? 'true' : 'false');
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

    // Push geo tick to backend ($push into geoHistory)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
    if (dbName) {
      headers['x-tenant-id'] = dbName;
    }

    const response = await fetch(`${baseURL}service/hr/attendance/${attendanceId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        $push: {
          geoHistory: {
            lat: latitude,
            long: longitude,
            accuracy: accuracy ?? null,
            speed: speed ?? null,
            type: 'tick',
            timestamp: new Date().toISOString(),
          },
        },
      }),
    });

    if (!response.ok) {
      console.warn('[GEO_TASK] Geo-tick failed:', response.status);
    }
  } catch (err: any) {
    // Silent fail — background tasks must never crash
    console.warn('[GEO_TASK] Silent fail:', err.message);
  }
});
