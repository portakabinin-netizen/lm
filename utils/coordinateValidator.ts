/**
 * Validates coordinate numbers
 */
export const isValidCoordinate = (lat: any, lon: any): boolean => {
  const numLat = Number(lat);
  const numLon = Number(lon);
  
  if (isNaN(numLat) || isNaN(numLon)) return false;
  if (numLat < -90 || numLat > 90) return false;
  if (numLon < -180 || numLon > 180) return false;
  
  // Reject exact 0,0 if it's considered invalid in business context
  // but the requirement says "Accept 0 latitude/longitude".
  // So we accept it.
  
  return true;
};

/**
 * Normalizes coordinates to ensure they are valid numbers
 */
export const normalizeCoordinate = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
};
