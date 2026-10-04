import { TrackingPoint, TrackingSession } from '../types/gps';
import { GPSService } from './GPSService';
import { calculateSpeeds } from '../utils/speedCalculator';
import * as Location from 'expo-location';

export class LiveTrackingService {
  private static watcher: Location.LocationSubscription | null = null;
  private static route: TrackingPoint[] = [];
  private static listeners: Set<(state: any) => void> = new Set();
  
  static isTracking = false;
  static isPaused = false;
  static sessionStartTime: number = 0;

  /**
   * Start tracking live location
   */
  static async startTracking() {
    if (this.watcher) return;
    this.isTracking = true;
    this.isPaused = false;
    this.sessionStartTime = Date.now();
    this.route = [];

    this.watcher = await GPSService.watchLocation((point) => {
      if (!this.isPaused) {
        this.route.push(point);
        this.notifyListeners();
      }
    });
    this.notifyListeners();
  }

  /**
   * Stop tracking
   */
  static stopTracking() {
    if (this.watcher) {
      this.watcher.remove();
      this.watcher = null;
    }
    this.isTracking = false;
    this.isPaused = false;
    this.notifyListeners();
  }

  /**
   * Pause tracking without stopping watcher
   */
  static pauseTracking() {
    this.isPaused = true;
    this.notifyListeners();
  }

  /**
   * Resume paused tracking
   */
  static resumeTracking() {
    this.isPaused = false;
    this.notifyListeners();
  }

  /**
   * Clear the current route history
   */
  static clearRoute() {
    this.route = [];
    this.notifyListeners();
  }

  /**
   * Get the current state
   */
  static getState() {
    const speeds = calculateSpeeds(this.route);
    return {
      isTracking: this.isTracking,
      isPaused: this.isPaused,
      currentLocation: this.route.length > 0 ? this.route[this.route.length - 1] : null,
      route: [...this.route],
      currentSpeed: speeds.currentSpeed,
      averageSpeed: speeds.averageSpeed,
      maxSpeed: speeds.maxSpeed,
      trackingDuration: this.isTracking ? Date.now() - this.sessionStartTime : 0,
      todayDistance: 0, // Mock implementation - would need full day route from storage
      sessionDistance: 0, // Mock implementation - would require DistanceService on route
    };
  }

  /**
   * Subscribe to state changes
   */
  static subscribe(listener: (state: any) => void) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private static notifyListeners() {
    const state = this.getState();
    this.listeners.forEach(l => l(state));
  }
}
