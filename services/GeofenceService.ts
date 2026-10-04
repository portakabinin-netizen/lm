import { Geofence, GeoLocation } from '../types/gps';
import { DistanceService } from './DistanceService';

export class GeofenceService {
  private static geofences: Map<string, Geofence> = new Map();

  /**
   * Add a circular geofence
   */
  static addGeofence(geofence: Geofence) {
    this.geofences.set(geofence.id, geofence);
  }

  /**
   * Remove a geofence
   */
  static removeGeofence(id: string) {
    this.geofences.delete(id);
  }

  /**
   * Check if a location is inside a specific geofence
   */
  static isInside(id: string, location: GeoLocation): boolean {
    const fence = this.geofences.get(id);
    if (!fence) return false;

    return DistanceService.isWithinRadius(
      location,
      { latitude: fence.latitude, longitude: fence.longitude },
      fence.radius
    );
  }

  /**
   * Get all geofences the location is currently inside
   */
  static getActiveGeofences(location: GeoLocation): Geofence[] {
    const active: Geofence[] = [];
    this.geofences.forEach((fence) => {
      if (DistanceService.isWithinRadius(
        location,
        { latitude: fence.latitude, longitude: fence.longitude },
        fence.radius
      )) {
        active.push(fence);
      }
    });
    return active;
  }
}
