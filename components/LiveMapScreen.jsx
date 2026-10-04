import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import FastImage from './FastImageCompat';
import * as Location from 'expo-location';
import { getSocket } from '@/hooks/Socket';
import { optimizeCloudinaryUrl } from '@/utils/cloudinaryHelper';

// Haversine formula to calculate distance in meters
const getDistanceFromLatLonInMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const LiveMapScreen = (props) => {
  // Safe param extraction supporting standard React Navigation (route.params), direct props, or empty fallback
  const routeParams = props.route?.params || {};
  const workerId = props.workerId || routeParams.workerId || 'current_worker';
  const workerPhotoUrl = props.workerPhotoUrl || routeParams.workerPhotoUrl || null;
  const workerName = props.workerName || routeParams.workerName || 'Worker';

  const [currentLocation, setCurrentLocation] = useState(null);
  const lastSentLocation = useRef(null);
  const mapRef = useRef(null);

  // Cloudinary image URL optimization safely preserving signed signatures & query params
  const optimizedPhotoUrl = workerPhotoUrl
    ? optimizeCloudinaryUrl(workerPhotoUrl, { width: 100, height: 100, crop: 'fill', quality: 'auto' })
    : null;

  useEffect(() => {
    let isMounted = true;
    let locationSubscription = null;
    const socket = getSocket();

    const startWatchingLocation = async () => {
      try {
        // Request foreground permissions if not already granted
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('Location permission not granted for LiveMapScreen');
          return;
        }

        // High accuracy watch with 10m distance filter
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 10, // Smart hardware-level distance filter (10 meters)
            timeInterval: 3000,
          },
          (position) => {
            if (!isMounted || !position?.coords) return;
            const { latitude, longitude, speed, heading, accuracy } = position.coords;

            // Accuracy Filter: Discard noisy indoor/multipath fixes
            if (accuracy && accuracy > 35) return;

            const newCoords = { latitude, longitude };

            // 1. Optimistic UI: Update local state immediately for zero lag
            setCurrentLocation(newCoords);

            // 2. Smart Movement Check: Threshold >= 10 meters
            if (lastSentLocation.current) {
              const distance = getDistanceFromLatLonInMeters(
                lastSentLocation.current.latitude,
                lastSentLocation.current.longitude,
                latitude,
                longitude
              );

              if (distance < 10) {
                // Worker is stationary; skip socket emit to save bandwidth and DB writes
                return;
              }
            }

            // 3. Emit location update via Socket.io asynchronously
            lastSentLocation.current = newCoords;
            socket.emit('update_location', {
              workerId,
              latitude,
              longitude,
              speed: speed ?? null,
              heading: heading ?? null,
              accuracy: accuracy ?? null,
              timestamp: new Date(),
            });
          }
        );
      } catch (err) {
        console.error('Geolocation error:', err);
      }
    };

    startWatchingLocation();

    return () => {
      isMounted = false;
      if (locationSubscription && typeof locationSubscription.remove === 'function') {
        locationSubscription.remove();
      }
    };
  }, [workerId]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={styles.map}
        region={
          currentLocation
            ? {
                ...currentLocation,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }
            : undefined
        }
        showsUserLocation={false}
        showsMyLocationButton={true}
      >
        {currentLocation && (
          <Marker coordinate={currentLocation} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.markerContainer}>
              {optimizedPhotoUrl ? (
                <FastImage
                  style={styles.avatar}
                  source={{
                    uri: optimizedPhotoUrl,
                    priority: FastImage.priority.high,
                  }}
                  resizeMode={FastImage.resizeMode.cover}
                />
              ) : (
                <View style={[styles.avatar, styles.fallbackAvatar]}>
                  <Text style={styles.fallbackText}>
                    {(workerName || 'W').trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
          </Marker>
        )}
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  markerContainer: {
    borderWidth: 2,
    borderColor: '#007AFF',
    borderRadius: 25,
    overflow: 'hidden',
    backgroundColor: '#fff',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  fallbackAvatar: {
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default LiveMapScreen;
