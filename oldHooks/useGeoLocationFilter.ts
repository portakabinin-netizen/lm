import { useCallback, useEffect, useState, useMemo } from 'react';
import { ProjectSite, GeoLocation } from '../types/gps';
import { DistanceService } from '../services/DistanceService';
import { GPSService } from '../services/GPSService';

interface UseGeoLocationFilterOptions {
  maxDistance?: number; // Maximum distance to include sites (in meters), default: 10km
  autoRefresh?: boolean; // Auto-refresh location periodically
  refreshInterval?: number; // Refresh interval in ms, default: 30000
}

export const useGeoLocationFilter = (
  sites: ProjectSite[],
  options: UseGeoLocationFilterOptions = {}
) => {
  const {
    maxDistance = 10000,
    autoRefresh = true,
    refreshInterval = 30000,
  } = options;

  const [currentLocation, setCurrentLocation] = useState<GeoLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Request location permission and get current location
   */
  const getCurrentLocation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const point = await GPSService.getCurrentLocation();
      const currentLoc: GeoLocation = { latitude: point.latitude, longitude: point.longitude };
      setCurrentLocation(currentLoc);
      return currentLoc;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get location';
      setError(errorMsg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Compute filtered and sorted sites based on currentLocation, sites and maxDistance
   */
  const filteredAndSortedSites = useMemo(() => {
    if (!currentLocation || !sites) return [];
    
    const sitesWithDistance = sites.map(site => {
      const lat = site.location?.lat;
      const long = site.location?.long;
      
      const distance = DistanceService.calculateDistance(
        currentLocation, 
        (lat && long) ? { latitude: Number(lat), longitude: Number(long) } : null
      );
      
      return {
        ...site,
        distance
      };
    });

    return sitesWithDistance
      .filter(site => site.distance <= maxDistance)
      .sort((a, b) => (a.distance ?? 999_999) - (b.distance ?? 999_999));
  }, [sites, currentLocation, maxDistance]);

  /**
   * Compute near matched sites (within 500m)
   */
  const nearMatchedSites = useMemo(() => {
    return filteredAndSortedSites.filter(site => (site.distance ?? 999_999) <= 500);
  }, [filteredAndSortedSites]);

  /**
   * Initialize location on mount
   */
  useEffect(() => {
    getCurrentLocation();
  }, [getCurrentLocation]);

  /**
   * Setup auto-refresh interval
   */
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      getCurrentLocation();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, getCurrentLocation]);

  return {
    currentLocation,
    filteredAndSortedSites,
    nearMatchedSites,
    loading,
    error,
    refreshLocation: getCurrentLocation,
    formatDistance: DistanceService.formatDistance,
    getDistanceCategory: DistanceService.getDistanceCategory,
  };
};

export default useGeoLocationFilter;
