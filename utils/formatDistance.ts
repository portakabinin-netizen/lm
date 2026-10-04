/**
 * Formats a distance in meters to a human readable string.
 * E.g., 120m, 1.35 km
 */
export const formatDistance = (distanceInMeters: number | null | undefined): string => {
  if (distanceInMeters == null) return 'Unknown';
  
  if (distanceInMeters >= 1000) {
    return `${(distanceInMeters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(distanceInMeters)} m`;
};
