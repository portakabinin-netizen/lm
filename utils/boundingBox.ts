import { GeoLocation } from '../types/gps';

/**
 * Creates a bounding box around a given coordinate.
 * Very rough approximation: 1 degree latitude ~ 111km
 * 1 degree longitude ~ 111km * cos(latitude)
 */
export const isInBoundingBox = (
  center: GeoLocation,
  target: GeoLocation,
  radiusMeters: number
): boolean => {
  const latRadian = (center.latitude * Math.PI) / 180;
  
  const degLat = radiusMeters / 111000;
  const degLon = radiusMeters / (111000 * Math.cos(latRadian));
  
  const minLat = center.latitude - degLat;
  const maxLat = center.latitude + degLat;
  const minLon = center.longitude - degLon;
  const maxLon = center.longitude + degLon;
  
  return (
    target.latitude >= minLat &&
    target.latitude <= maxLat &&
    target.longitude >= minLon &&
    target.longitude <= maxLon
  );
};
