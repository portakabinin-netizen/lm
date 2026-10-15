import { GeoLocation } from '../types/gps';

const R = 6371e3; // Earth's radius in meters
const TO_RAD = Math.PI / 180;

/**
 * Calculates the Haversine distance between two coordinates in meters
 */
export const calculateDistance = (
  lat1?: number | null,
  lon1?: number | null,
  lat2?: number | null,
  lon2?: number | null
): number => {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    return 999_999;
  }

  const phi1 = lat1 * TO_RAD;
  const phi2 = lat2 * TO_RAD;
  const deltaPhi = (lat2 - lat1) * TO_RAD;
  const deltaLambda = (lon2 - lon1) * TO_RAD;

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/**
 * Checks if distance is within a given radius
 */
export const isWithinRadius = (
  loc1: GeoLocation,
  loc2: GeoLocation,
  radiusMeters: number
): boolean => {
  return calculateDistance(loc1.latitude, loc1.longitude, loc2.latitude, loc2.longitude) <= radiusMeters;
};

/**
 * Sorts an array of items by their distance to a given location
 */
export const sortByDistance = <T>(
  items: T[],
  currentLoc: GeoLocation,
  getLoc: (item: T) => GeoLocation | null
): (T & { distance: number })[] => {
  return items
    .map(item => {
      const loc = getLoc(item);
      const distance = loc 
        ? calculateDistance(currentLoc.latitude, currentLoc.longitude, loc.latitude, loc.longitude)
        : 999_999;
      return { ...item, distance };
    })
    .sort((a, b) => a.distance - b.distance);
};

/**
 * Finds the nearest item to a given location
 */
export const nearestLocation = <T>(
  items: T[],
  currentLoc: GeoLocation,
  getLoc: (item: T) => GeoLocation | null
): (T & { distance: number }) | null => {
  if (!items.length) return null;
  const sorted = sortByDistance(items, currentLoc, getLoc);
  return sorted[0];
};
