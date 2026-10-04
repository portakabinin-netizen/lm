import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { appService } from '@/UtilServices/appHelper';
import { getSocket } from '@/hooks/Socket';
import FastImage from './FastImageCompat';
import { optimizeCloudinaryUrl } from '@/utils/cloudinaryHelper';
import { SmartLocationBuffer } from '@/services/SmartLocationBuffer';
import { LocationSyncService } from '@/services/LocationSyncService';

export interface LocationCoord {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  timestamp?: number;
}

// 🌐 Haversine formula to calculate accurate distance in meters between two coordinates
export function getHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface LiveTrackingProps {
  attendanceId?: string;
  token?: string;
  workerId?: string;
  workerName?: string;
  workerPhotoUrl?: string | null;
  minMovementMeters?: number; // Minimum delta to trigger DB write (default 15m)
  heartbeatIntervalMs?: number; // Stationary keepalive interval (default 5 mins)
  onLocationUpdate?: (location: LocationCoord) => void;
}

export const LiveTracking: React.FC<LiveTrackingProps> = ({
  attendanceId,
  token,
  workerId = 'current_worker',
  workerName = 'Worker',
  workerPhotoUrl = null,
  minMovementMeters = 15,
  heartbeatIntervalMs = 5 * 60 * 1000,
  onLocationUpdate,
}) => {
  const [currentCoords, setCurrentCoords] = useState<LocationCoord | null>(null);
  const [routeHistory, setRouteHistory] = useState<LocationCoord[]>([]);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [accuracyWarning, setAccuracyWarning] = useState<boolean>(false);

  const lastDbRecordedCoords = useRef<LocationCoord | null>(null);
  const lastSyncTimestamp = useRef<number>(0);
  const mapRef = useRef<MapView | null>(null);

  const optimizedPhoto = workerPhotoUrl
    ? optimizeCloudinaryUrl(workerPhotoUrl, {
        width: 80,
        height: 80,
        crop: 'fill',
        quality: 'auto',
      })
    : null;

  // Synchronize location point — socket for real-time, SmartLocationBuffer for DB
  const syncLocationToDatabase = useCallback(
    async (coords: LocationCoord) => {
      const socket = getSocket();

      // 1. Emit live socket update for immediate real-time dashboard listeners
      try {
        if (socket?.connected) {
          socket.emit('update_location', {
            workerId,
            latitude: coords.latitude,
            longitude: coords.longitude,
            speed: coords.speed ?? null,
            heading: coords.heading ?? null,
            accuracy: coords.accuracy ?? null,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (socketErr) {
        console.warn('[LiveTracking] Socket emit failed:', socketErr);
      }

      // 2. Persist to DB via SmartLocationBuffer — filters, batches, then sends
      //    one compact request rather than a raw PUT per tick.
      if (!attendanceId || !token) return;

      try {
        setIsSyncing(true);
        const trackingPoint = {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy ?? null,
          speed: coords.speed ?? null,
          heading: coords.heading ?? null,
          timestamp: coords.timestamp ?? Date.now(),
          type: 'tick' as const,
        };

        const { shouldFlush } = await SmartLocationBuffer.ingest(trackingPoint);

        if (shouldFlush) {
          const compactPayload = await SmartLocationBuffer.drain();
          if (compactPayload) {
            const baseURL = appService.httpClient.defaults.baseURL || '';
            await LocationSyncService.uploadCompact(compactPayload, {
              attendanceId,
              token,
              dbName: null, // LiveTracking doesn't have tenant context — falls back to header
              baseURL,
              isExempt: false,
            });
          }
        }

        lastDbRecordedCoords.current = coords;
        lastSyncTimestamp.current = Date.now();
      } catch (err: any) {
        console.warn('[LiveTracking] Buffer/upload error:', err?.message);
      } finally {
        setIsSyncing(false);
      }
    },
    [attendanceId, token, workerId]
  );


  useEffect(() => {
    let subscriber: Location.LocationSubscription | null = null;
    let isMounted = true;

    async function initWatch() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('[LiveTracking] Location permission not granted');
          return;
        }

        // Hardware-level throttle with distance filter
        subscriber = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 4000, // 4s check interval
            distanceInterval: 10, // 10m hardware trigger
          },
          (position) => {
            if (!isMounted || !position?.coords) return;
            const { latitude, longitude, accuracy, speed, heading } = position.coords;

            // 1. Accuracy Check (Filter out indoor jitter / cell tower approximations > 35m)
            if (accuracy && accuracy > 35) {
              setAccuracyWarning(true);
              return;
            }
            setAccuracyWarning(false);

            const point: LocationCoord = {
              latitude,
              longitude,
              accuracy,
              speed,
              heading,
              timestamp: position.timestamp,
            };

            // 2. Optimistic UI update: polyline & marker update smoothly
            setCurrentCoords(point);
            setRouteHistory((prev) => [...prev, point]);
            if (onLocationUpdate) onLocationUpdate(point);

            // Animate map view towards current location
            if (mapRef.current) {
              mapRef.current.animateCamera(
                {
                  center: { latitude, longitude },
                  zoom: 17,
                },
                { duration: 800 }
              );
            }

            // 3. Movement Delta Logic: Should we update database?
            const lastPoint = lastDbRecordedCoords.current;
            let shouldUpdateDb = false;

            if (!lastPoint) {
              // Always record the initial starting coordinate
              shouldUpdateDb = true;
            } else {
              const distanceMoved = getHaversineDistanceMeters(
                lastPoint.latitude,
                lastPoint.longitude,
                latitude,
                longitude
              );

              const timeSinceLast = Date.now() - lastSyncTimestamp.current;

              // Condition A: User has actually moved >= minMovementMeters (e.g. 15m)
              // Condition B: Stationary keepalive timeout elapsed (e.g. 5 minutes)
              if (distanceMoved >= minMovementMeters || timeSinceLast >= heartbeatIntervalMs) {
                shouldUpdateDb = true;
              }
            }

            if (shouldUpdateDb) {
              syncLocationToDatabase(point);
            }
          }
        );
      } catch (err) {
        console.error('[LiveTracking] watchPositionAsync error:', err);
      }
    }

    initWatch();

    return () => {
      isMounted = false;
      if (subscriber) {
        subscriber.remove();
      }
    };
  }, [minMovementMeters, heartbeatIntervalMs, onLocationUpdate, syncLocationToDatabase]);

  return (
    <View style={styles.container}>
      {currentCoords ? (
        <View style={styles.mapWrapper}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={styles.map}
            initialRegion={{
              latitude: currentCoords.latitude,
              longitude: currentCoords.longitude,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            }}
          >
            {/* Route polyline */}
            <Polyline
              coordinates={routeHistory}
              strokeColor="#2563eb"
              strokeWidth={4}
            />

            {/* Live Worker Marker */}
            <Marker
              coordinate={{
                latitude: currentCoords.latitude,
                longitude: currentCoords.longitude,
              }}
              title={workerName}
              description={isSyncing ? 'Syncing to database...' : 'GPS Live'}
            >
              <View style={styles.markerBadge}>
                {optimizedPhoto ? (
                  <FastImage source={{ uri: optimizedPhoto }} style={styles.markerImage} />
                ) : (
                  <Ionicons name="person" size={16} color="#ffffff" />
                )}
              </View>
            </Marker>
          </MapView>

          {/* Status overlay */}
          <View style={styles.statusOverlay}>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isSyncing ? '#f59e0b' : '#10b981' },
                ]}
              />
              <Text style={styles.statusText}>
                {isSyncing ? 'Updating Database...' : 'Tracking Active (Location Filter ON)'}
              </Text>
            </View>
            {accuracyWarning && (
              <Text style={styles.warningText}>Low GPS accuracy: jitter filtered</Text>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Acquiring GPS Signal...</Text>
        </View>
      )}
    </View>
  );
};

export default LiveTracking;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  mapWrapper: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  markerBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  markerImage: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  statusOverlay: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  warningText: {
    marginTop: 4,
    fontSize: 11,
    color: '#d97706',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
});
