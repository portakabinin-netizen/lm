import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocationData, LeadGeoData, TrackingPoint } from '../types/gps';
import { GPS_CONSTANTS } from '../constants/gps';

const CACHE_KEYS = {
  PROFILE_LOCATIONS: 'gps_cache_profile',
  LEAD_LOCATIONS: 'gps_cache_leads',
  RAW_GPS: 'gps_cache_raw',
};

interface CacheEntry<T> {
  timestamp: number;
  data: T;
}

export class LocationCacheService {
  // In-memory cache fallback for fast synchronous access
  private static memoryCache: {
    profiles: CacheEntry<LocationData[]> | null;
    leads: CacheEntry<LeadGeoData[]> | null;
    gps: CacheEntry<TrackingPoint> | null;
  } = {
    profiles: null,
    leads: null,
    gps: null,
  };

  /**
   * Save Profiles to Cache
   */
  static async saveProfiles(data: LocationData[]): Promise<void> {
    const entry: CacheEntry<LocationData[]> = { timestamp: Date.now(), data };
    this.memoryCache.profiles = entry;
    try {
      await AsyncStorage.setItem(CACHE_KEYS.PROFILE_LOCATIONS, JSON.stringify(entry));
    } catch (e) {
      console.warn('Failed to cache profiles', e);
    }
  }

  /**
   * Get Profiles from Cache (checks TTL)
   */
  static async getProfiles(): Promise<LocationData[] | null> {
    return this.getCache<LocationData[]>(
      this.memoryCache.profiles, 
      CACHE_KEYS.PROFILE_LOCATIONS, 
      GPS_CONSTANTS.CACHE_TTL.PROFILE
    );
  }

  /**
   * Save Leads to Cache
   */
  static async saveLeads(data: LeadGeoData[]): Promise<void> {
    const entry: CacheEntry<LeadGeoData[]> = { timestamp: Date.now(), data };
    this.memoryCache.leads = entry;
    try {
      await AsyncStorage.setItem(CACHE_KEYS.LEAD_LOCATIONS, JSON.stringify(entry));
    } catch (e) {
      console.warn('Failed to cache leads', e);
    }
  }

  /**
   * Get Leads from Cache
   */
  static async getLeads(): Promise<LeadGeoData[] | null> {
    return this.getCache<LeadGeoData[]>(
      this.memoryCache.leads,
      CACHE_KEYS.LEAD_LOCATIONS,
      GPS_CONSTANTS.CACHE_TTL.LEAD
    );
  }

  /**
   * Save Raw GPS to Cache
   */
  static async saveRawGPS(point: TrackingPoint): Promise<void> {
    const entry: CacheEntry<TrackingPoint> = { timestamp: Date.now(), data: point };
    this.memoryCache.gps = entry;
    try {
      await AsyncStorage.setItem(CACHE_KEYS.RAW_GPS, JSON.stringify(entry));
    } catch (e) {
      console.warn('Failed to cache raw GPS', e);
    }
  }

  /**
   * Get Raw GPS from Cache
   */
  static async getRawGPS(): Promise<TrackingPoint | null> {
    return this.getCache<TrackingPoint>(
      this.memoryCache.gps,
      CACHE_KEYS.RAW_GPS,
      GPS_CONSTANTS.CACHE_TTL.GPS
    );
  }

  /**
   * Clear all caches
   */
  static async clearAll(): Promise<void> {
    this.memoryCache = { profiles: null, leads: null, gps: null };
    try {
      await AsyncStorage.multiRemove([
        CACHE_KEYS.PROFILE_LOCATIONS,
        CACHE_KEYS.LEAD_LOCATIONS,
        CACHE_KEYS.RAW_GPS,
      ]);
    } catch (e) {
      console.warn('Failed to clear cache', e);
    }
  }

  /**
   * Generic cache retrieval with TTL logic
   */
  private static async getCache<T>(
    memEntry: CacheEntry<T> | null, 
    storageKey: string, 
    ttl: number
  ): Promise<T | null> {
    const now = Date.now();
    
    // Check memory first
    if (memEntry && now - memEntry.timestamp < ttl) {
      return memEntry.data;
    }

    // Fallback to async storage
    try {
      const stored = await AsyncStorage.getItem(storageKey);
      if (stored) {
        const parsed: CacheEntry<T> = JSON.parse(stored);
        if (now - parsed.timestamp < ttl) {
          // Repopulate memory cache
          if (storageKey === CACHE_KEYS.PROFILE_LOCATIONS) this.memoryCache.profiles = parsed as any;
          if (storageKey === CACHE_KEYS.LEAD_LOCATIONS) this.memoryCache.leads = parsed as any;
          if (storageKey === CACHE_KEYS.RAW_GPS) this.memoryCache.gps = parsed as any;
          return parsed.data;
        } else {
          // Expired, clear storage
          AsyncStorage.removeItem(storageKey).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('Failed to read cache', e);
    }
    
    return null;
  }
}
