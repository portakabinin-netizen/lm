import * as Location from 'expo-location';
import { Platform, Alert, Linking } from 'react-native';
import { TrackingPoint } from '../types/gps';
import { LocationCacheService } from './LocationCacheService';
import { GPS_CONSTANTS } from '../constants/gps';
import { appService } from '../UtilServices/appHelper';
import { GST_STATES } from '../UtilServices/gstConstants';
import AsyncStorage from '@react-native-async-storage/async-storage';

export class GPSService {
  /**
   * Request foreground location permission.
   */
  static async requestPermission(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Location.getForegroundPermissionsAsync();
      if (existingStatus === 'granted') {
        return true;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch (e) {
      console.warn('Failed to request GPS permission', e);
      return false;
    }
  }

  /**
   * Prompt the user to enable Wi-Fi if location times out.
   */
  static promptEnableWifi(): void {
    Alert.alert(
      'Location Timeout',
      'Unable to get GPS coordinates. Enabling Wi-Fi can help locate your device faster. Would you like to open Wi-Fi settings?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Settings',
          onPress: async () => {
            try {
              if (Platform.OS === 'android') {
                await Linking.sendIntent('android.settings.WIFI_SETTINGS');
              } else {
                await Linking.openURL('App-Prefs:root=WIFI');
              }
            } catch (err) {
              Linking.openSettings().catch(() => {});
            }
          },
        },
      ]
    );
  }

  /**
   * Fallback to local storage cached location.
   */
  static async getCachedLocation(): Promise<Location.LocationObject | null> {
    try {
      const stored = await AsyncStorage.getItem('gps_cache_raw');
      if (stored) {
        const entry = JSON.parse(stored);
        if (entry && entry.data) {
          const data = entry.data;
          return {
            coords: {
              latitude: data.latitude,
              longitude: data.longitude,
              accuracy: data.accuracy ?? 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: data.heading ?? 0,
              speed: data.speed ?? 0,
            },
            timestamp: data.timestamp ?? Date.now(),
            mocked: data.isMocked ?? false,
          } as Location.LocationObject;
        }
      }
    } catch (e) {
      console.warn('[GPS] Failed to read raw cached location:', e);
    }
    return null;
  }

  /**
   * Get the current device location (returns a TrackingPoint).
   * It also updates the Raw GPS cache.
   */
  static async getCurrentLocation(options?: Location.LocationOptions): Promise<TrackingPoint> {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) {
      throw new Error('Location permission not granted');
    }

    // Ensure device-level location services are enabled
    try {
      if (Platform.OS === 'android') {
        try {
          await Location.enableNetworkProviderAsync();
        } catch (err) {
          console.warn('[GPS] Failed to enable network provider:', err);
        }
      }
    } catch (e) {
      console.warn('[GPS] Error checking location services:', e);
    }

    let loc: Location.LocationObject | null = null;
    try {
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        ...options
      });
      // 10 second timeout
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000));
      
      const result = await Promise.race([locationPromise, timeoutPromise]);
      if (result) {
        loc = result as Location.LocationObject;
      }
    } catch (e) {
      console.warn("getCurrentPositionAsync failed:", e);
    }

    // Fallback to last known position if timeout or error
    if (!loc) {
      try {
        loc = await Location.getLastKnownPositionAsync({ maxAge: 600000 }); // 10 minutes
        if (!loc) {
          loc = await Location.getLastKnownPositionAsync(); // any age
        }
      } catch (e) {
        console.warn("getLastKnownPositionAsync failed:", e);
      }
    }

    if (!loc) {
      loc = await this.getCachedLocation();
    }

    if (!loc && __DEV__) {
      console.warn('[GPS] Using development mock location (getCurrentLocation)');
      loc = { 
        coords: { latitude: 28.6139, longitude: 77.2090, accuracy: 10, altitude: 0, altitudeAccuracy: 0, heading: 0, speed: 0 },
        timestamp: Date.now(),
        mocked: true
      } as Location.LocationObject;
    }

    if (!loc) {
      this.promptEnableWifi();
      throw new Error("Failed to get location: GPS timed out and no last known position available");
    }

    const point: TrackingPoint = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? null,
      speed: loc.coords.speed ?? null,
      heading: loc.coords.heading ?? null,
      timestamp: loc.timestamp,
      type: 'tick',
      isMocked: loc.mocked || false
    };

    // Cache the latest point
    await LocationCacheService.saveRawGPS(point);
    return point;
  }

  /**
   * Reverse geocodes a latitude and longitude into an address array.
   */
  static async reverseGeocode(lat: number, lon: number): Promise<Location.LocationGeocodedAddress[]> {
    try {
      return await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    } catch (e) {
      console.warn('Reverse geocode failed', e);
      return [];
    }
  }

  /**
   * Watch live location.
   */
  static async watchLocation(
    callback: (point: TrackingPoint) => void,
    options?: Location.LocationTaskOptions
  ): Promise<Location.LocationSubscription> {
    const hasPermission = await this.requestPermission();
    if (!hasPermission) {
      throw new Error('Location permission not granted');
    }

    return await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: GPS_CONSTANTS.TRACKING.FOREGROUND_DISTANCE,
        timeInterval: GPS_CONSTANTS.TRACKING.FOREGROUND_INTERVAL,
        ...options,
      },
      (loc) => {
        const point: TrackingPoint = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? null,
          speed: loc.coords.speed ?? null,
          heading: loc.coords.heading ?? null,
          timestamp: loc.timestamp,
          type: 'tick',
          isMocked: loc.mocked || false
        };
        LocationCacheService.saveRawGPS(point).catch(() => {});
        callback(point);
      }
    );
  }

  /**
   * Get current location, reverse geocode, normalize state, and return formatted location object.
   */
  static async getCurrentLocationWithAddress(): Promise<{
    latitude: number;
    longitude: number;
    city: string;
    district: string;
    state: string;
    pincode: string;
    formattedAddress: string;
  } | null> {
    // ── Step 0: Device-level location services check ──────────────────────────
    try {
      if (Platform.OS === 'android') {
        try {
          await Location.enableNetworkProviderAsync();
        } catch (err) {
          console.warn('[GPS] Failed to enable network provider:', err);
        }
      }
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        appService.showToast(
          'Location services are OFF. Please enable Location in device Settings and try again.',
          'Error'
        );
        return null;
      }
    } catch (svcErr) {
      console.warn('[GPS] hasServicesEnabledAsync error (non-fatal):', svcErr);
    }

    // ── Step 1: Permission ────────────────────────────────────────────────────
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        const result = await Location.requestForegroundPermissionsAsync();
        status = result.status;
      }
      if (status !== 'granted') {
        appService.showToast(
          'Location permission denied. Please allow location access in App Settings.',
          'Error'
        );
        return null;
      }
    } catch (permErr: any) {
      console.error('[GPS] Permission error:', permErr?.message || permErr);
      appService.showToast('Failed to request location permission.', 'Error');
      return null;
    }

    // ── Step 2: Get coordinates ───────────────────────────────────────────────
    let loc: any = null;
    try {
      const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 });
      if (lastKnown) {
        loc = lastKnown;
      } else {
        const locationPromise = Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000));
        loc = await Promise.race([locationPromise, timeoutPromise]);

        if (!loc) {
          try {
            const fallbackLoc = await Location.getLastKnownPositionAsync();
            if (fallbackLoc) {
              loc = fallbackLoc;
            }
          } catch (fallbackErr) {
            console.warn('[GPS] Fallback last known location fetch failed:', fallbackErr);
          }
        }

        if (!loc) {
          loc = await this.getCachedLocation();
        }

        if (!loc && __DEV__) {
          console.warn('[GPS] Using development mock location');
          loc = { coords: { latitude: 28.6139, longitude: 77.2090, accuracy: 10 } };
        }

        if (!loc) {
          appService.showToast('Location timeout, please enable WiFi', 'Error');
          this.promptEnableWifi();
          return null;
        }
      }
    } catch (e: any) {
      console.error('[GPS] Location fetch error:', e?.message || e);
      try {
        const fallbackLoc = await Location.getLastKnownPositionAsync();
        if (fallbackLoc) {
          loc = fallbackLoc;
        }
      } catch (fallbackErr) {
        console.warn('[GPS] Fallback last known location fetch failed after error:', fallbackErr);
      }

      if (!loc) {
        loc = await this.getCachedLocation();
      }

      if (!loc && __DEV__) {
        console.warn('[GPS] Using development mock location (fallback)');
        loc = { coords: { latitude: 28.6139, longitude: 77.2090, accuracy: 10 } };
      }

      if (!loc) {
        appService.showToast(
          `Could not get location: ${e?.message || 'Unknown error'}. Ensure GPS is enabled.`,
          'Error'
        );
        this.promptEnableWifi();
        return null;
      }
    }

    // ── Step 3: Reverse geocode ───────────────────────────────────────────────
    let addr: any = null;
    try {
      const geoPromise = Location.reverseGeocodeAsync(loc.coords);
      const geoTimeoutPromise = new Promise<any[]>((resolve) => setTimeout(() => resolve([]), 10000));
      const geoRes = await Promise.race([geoPromise, geoTimeoutPromise]);
      if (geoRes && geoRes.length > 0) {
        addr = geoRes[0];
      }
    } catch (err) {
      console.warn('[GPS] Reverse geocode error:', err);
    }
    if (!addr || !addr.region) {
      appService.showToast(
        'GPS coordinates captured. Address details unavailable — please fill State, District & Pincode manually.'
      );
    }

    // ── Step 4: Normalise state name to GST list ──────────────────────────────
    let stateVal = addr?.region || '';
    if (stateVal) {
      const lowerState = stateVal.toLowerCase();
      const matchedState = GST_STATES.find((s) => {
        const lowerName = s.name.toLowerCase();
        return lowerName.includes(lowerState) || lowerState.includes(lowerName);
      });
      if (matchedState) {
        stateVal = matchedState.name;
      }
    }

    const districtVal = addr?.subregion || addr?.district || '';

    return {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      city: addr?.city || 'Unknown',
      district: districtVal,
      state: stateVal,
      pincode: addr?.postalCode || '',
      formattedAddress: addr?.formattedAddress || 'Unknown Address',
    };
  }
}
