import { GPSAccuracy } from '../types/gps';
import { GPS_CONSTANTS } from '../constants/gps';

/**
 * Returns a confidence level based on GPS accuracy (in meters)
 */
export const getGPSConfidence = (accuracy: number | null | undefined): GPSAccuracy => {
  if (accuracy == null || accuracy < 0) return 'Unknown';
  
  if (accuracy <= GPS_CONSTANTS.ACCURACY.EXCELLENT) return 'Excellent';
  if (accuracy <= GPS_CONSTANTS.ACCURACY.GOOD) return 'Good';
  if (accuracy <= GPS_CONSTANTS.ACCURACY.FAIR) return 'Fair';
  return 'Poor';
};
