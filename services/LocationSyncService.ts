import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrackingPoint } from '../types/gps';
import { GPS_CONSTANTS } from '../constants/gps';

const OFFLINE_QUEUE_KEY = 'offline_gps_queue';

export class LocationSyncService {
  /**
   * Add a point to the offline queue
   */
  static async enqueue(point: TrackingPoint) {
    try {
      const stored = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      const queue: TrackingPoint[] = stored ? JSON.parse(stored) : [];
      queue.push(point);
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.warn('Failed to enqueue GPS point', e);
    }
  }

  /**
   * Get all queued points
   */
  static async getQueue(): Promise<TrackingPoint[]> {
    try {
      const stored = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.warn('Failed to read GPS queue', e);
      return [];
    }
  }

  /**
   * Clear the queue
   */
  static async clearQueue() {
    try {
      await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
    } catch (e) {
      console.warn('Failed to clear GPS queue', e);
    }
  }

  /**
   * Upload points in batches.
   * This takes dutyInfo because it's tightly coupled to the Attendance API.
   */
  static async sync(dutyInfo: any) {
    if (!dutyInfo || !dutyInfo.attendanceId || !dutyInfo.token || !dutyInfo.baseURL || dutyInfo.isExempt) return;

    const queue = await this.getQueue();
    if (queue.length === 0) return;

    const batches = [];
    for (let i = 0; i < queue.length; i += GPS_CONSTANTS.UPLOAD.BATCH_SIZE) {
      batches.push(queue.slice(i, i + GPS_CONSTANTS.UPLOAD.BATCH_SIZE));
    }

    let syncedCount = 0;

    for (const batch of batches) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${dutyInfo.token}`,
        };
        if (dutyInfo.dbName) {
          headers['x-tenant-id'] = dutyInfo.dbName;
        }

        const geoHistory = batch.map(loc => ({
          lat: loc.latitude,
          long: loc.longitude,
          accuracy: loc.accuracy,
          speed: loc.speed,
          type: loc.type || 'tick',
          timestamp: new Date(loc.timestamp).toISOString(),
        }));

        const res = await fetch(`${dutyInfo.baseURL}service/hr/attendance/${dutyInfo.attendanceId}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            $push: {
              geoHistory: { $each: geoHistory }
            },
          }),
        });

        if (res.ok) {
          syncedCount += batch.length;
        } else {
          break; // Stop on first error to prevent data loss, keep rest in queue
        }
      } catch (e) {
        break; // Network error
      }
    }

    // Keep unsynced points in queue
    if (syncedCount > 0) {
      const remaining = queue.slice(syncedCount);
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    }
  }

  static async uploadCompact(payload: any, dutyInfo: any) {
    if (!dutyInfo || !dutyInfo.attendanceId || !dutyInfo.token || !dutyInfo.baseURL || dutyInfo.isExempt) return;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dutyInfo.token}`,
      };
      if (dutyInfo.dbName) {
        headers['x-tenant-id'] = dutyInfo.dbName;
      }
      await fetch(`${dutyInfo.baseURL}service/hr/attendance/${dutyInfo.attendanceId}/compact-gps`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // Ignore background upload error
    }
  }
}
