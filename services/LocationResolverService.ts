import { LocationData, LeadGeoData, ResolvedLocation, GeoLocation } from '../types/gps';
import { DistanceService } from './DistanceService';
import { GPS_CONSTANTS } from '../constants/gps';
import { LocationCacheService } from './LocationCacheService';
import { GPSService } from './GPSService';
import { appService } from '@/UtilServices/appHelper';
import { getGPSConfidence } from '../utils/gpsConfidence';

export class LocationResolverService {
  /**
   * Fetches Profile Master locations. Checks cache first, else fetches from API.
   */
  static async getProfileLocations(user: any): Promise<LocationData[]> {
    if (!user?.token) return [];

    let profiles = await LocationCacheService.getProfiles();
    if (!profiles) {
      try {
        const pmRes = await appService.httpClient.get('setting/update/corporate', {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        const corp = pmRes.data?.data?.accessCorporate || {};
        profiles = corp.locations || [];
        await LocationCacheService.saveProfiles(profiles!);
      } catch (e) {
        console.warn('Failed to fetch profile locations from API', e);
        profiles = [];
      }
    }
    return profiles || [];
  }

  /**
   * Fetches Leads locations. Checks cache first, else fetches from API.
   */
  static async getLeadLocations(user: any): Promise<LeadGeoData[]> {
    if (!user?.token) return [];

    let leads = await LocationCacheService.getLeads();
    if (!leads) {
      try {
        const leadsRes = await appService.getProjectLeads(
          user.token, 
          user.corporateId || user.corpAdminId || undefined
        );
        leads = leadsRes?.data || leadsRes || [];
        await LocationCacheService.saveLeads(leads!);
      } catch (e) {
        console.warn('Failed to fetch lead locations from API', e);
        leads = [];
      }
    }
    return leads || [];
  }

  /**
   * Resolves device GPS to the nearest office, lead, or reverse geocoded address.
   */
  static async resolveLocation(user: any): Promise<ResolvedLocation> {
    // 1. Get raw device GPS
    const rawLoc = await GPSService.getCurrentLocation();
    
    let resolved: Partial<ResolvedLocation> = {
      latitude: rawLoc.latitude,
      longitude: rawLoc.longitude,
      source: 'device',
      matchType: 'none',
      timestamp: Date.now(),
      accuracy: rawLoc.accuracy ?? undefined,
      confidence: getGPSConfidence(rawLoc.accuracy),
    };

    const deviceGeo = { latitude: rawLoc.latitude, longitude: rawLoc.longitude };

    // 2. Fetch Reference Data (Concurrent)
    const [profiles, leads] = await Promise.all([
      this.getProfileLocations(user),
      this.getLeadLocations(user)
    ]);

    let minDistance = GPS_CONSTANTS.DISTANCE_THRESHOLD + 1; // Start higher than threshold

    // 3. Match against Profile locations
    if (profiles.length > 0) {
      const nearestProfile = DistanceService.findNearest(
        profiles,
        deviceGeo,
        (p) => p.address?.lat && p.address?.long ? { latitude: Number(p.address.lat), longitude: Number(p.address.long) } : null
      );

      if (nearestProfile && nearestProfile.distance <= GPS_CONSTANTS.DISTANCE_THRESHOLD) {
        minDistance = nearestProfile.distance;
        resolved.matchType = 'profileMaster';
        resolved.matchedLocation = nearestProfile;
        resolved.resolvedName = nearestProfile.locationName || 'Branch Office';
        resolved.distance = nearestProfile.distance;
      }
    }

    // 4. Match against Lead locations if no Profile was found within threshold
    if (resolved.matchType !== 'profileMaster' && leads.length > 0) {
      const nearestLead = DistanceService.findNearest(
        leads,
        deviceGeo,
        (l) => l.location?.lat && l.location?.long ? { latitude: Number(l.location.lat), longitude: Number(l.location.long) } : null
      );

      if (nearestLead && nearestLead.distance <= GPS_CONSTANTS.DISTANCE_THRESHOLD) {
        minDistance = nearestLead.distance;
        resolved.matchType = 'lead';
        resolved.matchedLead = nearestLead;
        resolved.resolvedName = nearestLead.sender_city || 'Lead Location';
        resolved.distance = nearestLead.distance;
      }
    }

    // 5. Reverse Geocode if no match
    if (resolved.matchType === 'none' || resolved.matchType === undefined) {
      const reverseCoords = await GPSService.reverseGeocode(rawLoc.latitude, rawLoc.longitude);
      const address = reverseCoords?.[0];
      if (address) {
        resolved.matchType = 'reverseGeocode';
        resolved.resolvedName = address.city || address.subregion || address.region || 'Unknown Location';
        resolved.reverseGeocode = {
          city: address.city || '',
          state: address.region || '',
          district: address.subregion || '',
          pincode: address.postalCode || '',
          formattedAddress: [address.street, address.city, address.region, address.postalCode].filter(Boolean).join(', ')
        };
      } else {
        resolved.resolvedName = 'Unknown Location';
      }
    }

    return resolved as ResolvedLocation;
  }
}
