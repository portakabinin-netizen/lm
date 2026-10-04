export const GPS_CONSTANTS = {
  /** Default fallback location (India Gate, New Delhi) */
  DEFAULT_LOCATION: {
    latitude: 28.6139,
    longitude: 77.2090,
  },
  
  /** Maximum acceptable distance to consider a location matched (in meters) */
  DISTANCE_THRESHOLD: 50,
  /** Default maximum distance for geo-filtering sites (in meters) - 10km */
  DEFAULT_MAX_DISTANCE: 10000,
  
  /** Minimum distance to consider for movement (in meters) */
  MOVEMENT_THRESHOLD: 10,
  
  /** Cache TTL in milliseconds */
  CACHE_TTL: {
    PROFILE: 6 * 60 * 60 * 1000, // 6 hours
    LEAD: 15 * 60 * 1000,        // 15 minutes
    GPS: 2 * 60 * 1000,          // 2 minutes
  },
  
  /** Accuracy thresholds in meters */
  ACCURACY: {
    EXCELLENT: 15,
    GOOD: 50,
    FAIR: 100,
  },
  
  /** Live tracking intervals in milliseconds */
  TRACKING: {
    FOREGROUND_INTERVAL: 5000, // 5 seconds
    FOREGROUND_DISTANCE: 10,   // 10 meters
  },

  /** Upload constants */
  UPLOAD: {
    BATCH_SIZE: 50,
    RETRY_INTERVAL: 30000, // 30 seconds
  },
  
  /** Timeouts in milliseconds */
  TIMEOUTS: {
    GPS_REQUEST: 15000, // 15 seconds
  }
};
