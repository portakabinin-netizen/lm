import { ProjectSite, GeoLocation } from '../types/gps';
import { DistanceService } from './DistanceService';
import { GPSService } from './GPSService';
import { GPS_CONSTANTS } from '../constants/gps';

export class GeoFilterService {
  /**
   * Filters and sorts sites based on distance from current location.
   */
  static async filterAndSortSites(
    sites: ProjectSite[],
    maxDistance: number = GPS_CONSTANTS.DEFAULT_MAX_DISTANCE
  ): Promise<{
    currentLocation: GeoLocation | null;
    filteredAndSortedSites: ProjectSite[];
    nearMatchedSites: ProjectSite[];
  }> {
    try {
      const point = await GPSService.getCurrentLocation();
      const currentLoc: GeoLocation = { latitude: point.latitude, longitude: point.longitude };

      const sitesWithDistance = sites.map(site => {
        let lat = site.location?.lat;
        let long = site.location?.long;
        
        let distance = DistanceService.calculateDistance(
          currentLoc, 
          (lat && long) ? { latitude: Number(lat), longitude: Number(long) } : null
        );
        
        return {
          ...site,
          distance
        };
      });

      const filteredAndSortedSites = sitesWithDistance
        .filter(site => site.distance <= maxDistance)
        .sort((a, b) => (a.distance ?? 999_999) - (b.distance ?? 999_999));

      const nearMatchedSites = filteredAndSortedSites.filter(site => (site.distance ?? 999_999) <= 500);

      return {
        currentLocation: currentLoc,
        filteredAndSortedSites,
        nearMatchedSites
      };
    } catch (e) {
      console.warn('Failed to filter and sort sites', e);
      return {
        currentLocation: null,
        filteredAndSortedSites: [],
        nearMatchedSites: []
      };
    }
  }
}
