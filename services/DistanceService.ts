import { GeoLocation } from '../types/gps';
import { calculateDistance, isWithinRadius, sortByDistance, nearestLocation } from '../utils/haversine';
import { formatDistance as formatDistanceUtil } from '../utils/formatDistance';
import { GPS_CONSTANTS } from '../constants/gps';

export class DistanceService {
  /**
   * Calculates distance between two locations in meters.
   */
  static calculateDistance(loc1?: GeoLocation | null, loc2?: GeoLocation | null): number {
    if (!loc1 || !loc2) return 999_999;
    return calculateDistance(loc1.latitude, loc1.longitude, loc2.latitude, loc2.longitude);
  }

  /**
   * Formats distance to readable string (e.g., 120m, 1.35 km)
   */
  static formatDistance(distanceInMeters: number | null | undefined): string {
    return formatDistanceUtil(distanceInMeters);
  }

  /**
   * Gets distance category (near, medium, far) based on thresholds
   */
  static getDistanceCategory(distanceInMeters: number): 'near' | 'medium' | 'far' {
    if (distanceInMeters <= 500) return 'near';
    if (distanceInMeters <= 5000) return 'medium';
    return 'far';
  }

  /**
   * Sorts array by distance
   */
  static sortByDistance<T>(
    items: T[], 
    currentLoc: GeoLocation, 
    getLoc: (item: T) => GeoLocation | null
  ): (T & { distance: number })[] {
    return sortByDistance(items, currentLoc, getLoc);
  }

  /**
   * Checks if within given radius
   */
  static isWithinRadius(loc1: GeoLocation, loc2: GeoLocation, radiusMeters: number): boolean {
    return isWithinRadius(loc1, loc2, radiusMeters);
  }

  /**
   * Finds the nearest item from an array
   */
  static findNearest<T>(
    items: T[],
    currentLoc: GeoLocation,
    getLoc: (item: T) => GeoLocation | null
  ): (T & { distance: number }) | null {
    return nearestLocation(items, currentLoc, getLoc);
  }
}
