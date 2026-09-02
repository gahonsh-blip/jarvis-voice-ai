export interface GeoCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number; // in meters
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

export interface LocationAddress {
  formattedAddress: string;
  city?: string;
  state?: string;
  country?: string;
  countryCode?: string;
  postcode?: string;
  district?: string;
  road?: string;
}

export interface WaypointMarker {
  id: string;
  name: string;
  category: 'satellite' | 'headquarters' | 'research' | 'safezone' | 'custom';
  latitude: number;
  longitude: number;
  description: string;
}

export interface GeolocationState {
  coords: GeoCoordinates | null;
  address: LocationAddress | null;
  permissionStatus: 'prompt' | 'granted' | 'denied' | 'unavailable';
  isWatching: boolean;
  isLoading: boolean;
  error: string | null;
  highAccuracy: boolean;
  lastUpdated: string | null;
  source: 'browser_gps' | 'ip_fallback' | 'simulated' | 'preset';
}

export const TACTICAL_PRESETS: WaypointMarker[] = [
  {
    id: 'hq_delhi',
    name: 'HERMES Command Core',
    category: 'headquarters',
    latitude: 28.6139,
    longitude: 77.2090,
    description: 'Central Administrative & AI Core Facility, New Delhi',
  },
  {
    id: 'silicon_valley',
    name: 'Bay Area Tech Corridor',
    category: 'research',
    latitude: 37.7749,
    longitude: -122.4194,
    description: 'Cloud Infrastructure & Autonomous Agent Lab, California',
  },
  {
    id: 'tokyo_grid',
    name: 'Tokyo Cyber Node',
    category: 'satellite',
    latitude: 35.6762,
    longitude: 139.6503,
    description: 'High-Density Telecom & Edge Computing Relay, Tokyo',
  },
  {
    id: 'london_meridian',
    name: 'Greenwich Prime Meridian',
    category: 'research',
    latitude: 51.4769,
    longitude: -0.0005,
    description: 'Universal Time Synchronizer & European Telemetry Hub',
  },
  {
    id: 'cern_geneva',
    name: 'CERN Advanced Quantum Core',
    category: 'research',
    latitude: 46.2330,
    longitude: 6.0557,
    description: 'Subatomic Sensor Network & Data Pipeline, Geneva',
  },
  {
    id: 'starbase_tx',
    name: 'Starbase Deep Space Uplink',
    category: 'satellite',
    latitude: 25.9972,
    longitude: -97.1557,
    description: 'Orbital Telemetry & Launch Platform Monitoring, Boca Chica',
  },
];
