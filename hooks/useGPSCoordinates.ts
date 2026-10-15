import { useState, useCallback, useEffect } from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { LocationResolverService } from '../services/LocationResolverService';
import { LocationCacheService } from '../services/LocationCacheService';
import { GPSService } from '../services/GPSService';
import { GPSResult } from '../types/gps';

export function useGPSCoordinates() {
  const { user } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GPSResult | null>(null);

  /**
   * Refreshes Reference Data (Profiles and Leads) by clearing the cache and refetching.
   */
  const refreshData = async () => {
    await LocationCacheService.clearAll();
    // Warm up the cache
    await LocationResolverService.getProfileLocations(user);
    await LocationResolverService.getLeadLocations(user);
  };

  /**
   * Refreshes the GPS location and resolves it against reference data.
   */
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resolvedLoc = await LocationResolverService.resolveLocation(user);
      
      const newResult: GPSResult = {
        latitude: resolvedLoc.latitude,
        longitude: resolvedLoc.longitude,
        resolvedName: resolvedLoc.resolvedName,
        matchType: resolvedLoc.matchType,
        matchedLocation: resolvedLoc.matchedLocation,
        matchedLead: resolvedLoc.matchedLead,
        distance: resolvedLoc.distance,
        reverseGeoCity: resolvedLoc.reverseGeocode?.city || 'Unknown',
        reverseGeoState: resolvedLoc.reverseGeocode?.state || '',
        reverseGeoDistrict: resolvedLoc.reverseGeocode?.district || '',
        reverseGeoPincode: resolvedLoc.reverseGeocode?.pincode || '',
        formattedAddress: resolvedLoc.reverseGeocode?.formattedAddress || 'Unknown Address',
        gpsAccuracy: resolvedLoc.accuracy,
        gpsConfidence: resolvedLoc.confidence,
      };

      setResult(newResult);
      return newResult;
    } catch (err: any) {
      setError(err?.message || 'Failed to get location');
      setResult(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  /**
   * Directly get device current location with address details.
   */
  const getCurrentLocation = useCallback(async () => {
    return GPSService.getCurrentLocationWithAddress();
  }, []);

  return {
    ...result, // null initially, destructuring handles it
    loading,
    error,
    refresh,
    refreshData,
    result,
    getCurrentLocation
  };
}
