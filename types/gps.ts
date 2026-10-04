export interface GeoLocation {
  latitude: number;
  longitude: number;
}

export type GPSAccuracy = 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Unknown';

export interface GPSResult {
  latitude: number | null;
  longitude: number | null;
  resolvedName: string;
  matchType: 'profileMaster' | 'lead' | 'reverseGeocode' | 'none';
  matchedLocation?: LocationData;
  matchedLead?: LeadGeoData;
  distance?: number;
  reverseGeoCity: string;
  reverseGeoState: string;
  reverseGeoDistrict: string;
  reverseGeoPincode: string;
  formattedAddress: string;
  gpsAccuracy?: number;
  gpsConfidence?: GPSAccuracy;
}

export interface LocationData {
  _id: string;
  locationName: string;
  isRegisteredOffice: boolean;
  address: any;
  gstin: string;
  bankDetails: any;
  contactPerson: string;
  contactMobile: string;
  contactEmail: string;
  active: boolean;
  locationType?: 'HO' | 'RO' | 'BO';
}

export interface LeadGeoData {
  _id: string;
  sender_name: string;
  sender_city: string;
  sender_state: string;
  location?: { lat?: number; long?: number; address?: string };
}

export interface ResolvedLocation {
  latitude: number | null;
  longitude: number | null;
  source: 'device' | 'cache';
  resolvedName: string;
  matchType: 'profileMaster' | 'lead' | 'reverseGeocode' | 'none';
  matchedLocation?: LocationData;
  matchedLead?: LeadGeoData;
  distance?: number;
  reverseGeocode?: {
    city: string;
    state: string;
    district: string;
    pincode: string;
    formattedAddress: string;
  };
  accuracy?: number;
  confidence?: GPSAccuracy;
  timestamp: number;
}

export interface NearbyLocation {
  id: string;
  name: string;
  distance: number;
  type: 'profileMaster' | 'lead';
  latitude: number;
  longitude: number;
  originalData: LocationData | LeadGeoData;
}

export interface ProjectSite {
  _id: string;
  sender_name: string;
  location?: { lat?: number; long?: number; address?: string };
  city?: string;
  distance?: number;
}

export interface TrackingPoint {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading?: number | null;
  timestamp: number;
  type: 'tick' | 'event';
  isStale?: boolean;
  isMocked?: boolean;
}

export interface TrackingSession {
  sessionId: string;
  startTime: number;
  endTime?: number;
  deviceInfo: any;
}

export interface TrackingState {
  isTracking: boolean;
  isPaused: boolean;
  currentLocation: TrackingPoint | null;
  route: TrackingPoint[];
  currentSpeed: number;
  averageSpeed: number;
  maxSpeed: number;
  trackingDuration: number;
  todayDistance: number;
  sessionDistance: number;
  lastSync: number | null;
  pendingUploads: number;
}

export interface Geofence {
  id: string;
  latitude: number;
  longitude: number;
  radius: number; // meters
}
