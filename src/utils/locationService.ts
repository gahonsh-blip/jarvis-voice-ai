import { GeoCoordinates, LocationAddress, WaypointMarker } from '../types/location';

const STORAGE_KEY = 'hermes_jarvis_last_location';

/**
 * Format decimal degrees into standard GPS DMS (Degrees Minutes Seconds) string
 */
export function formatDMS(latitude: number, longitude: number): { latDMS: string; lonDMS: string; combined: string } {
  const toDMS = (deg: number, isLat: boolean) => {
    const absolute = Math.abs(deg);
    const degrees = Math.floor(absolute);
    const minutesNotTruncated = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesNotTruncated);
    const seconds = ((minutesNotTruncated - minutes) * 60).toFixed(1);
    const direction = isLat ? (deg >= 0 ? 'N' : 'S') : deg >= 0 ? 'E' : 'W';
    return `${degrees}°${minutes}'${seconds}"${direction}`;
  };

  const latDMS = toDMS(latitude, true);
  const lonDMS = toDMS(longitude, false);
  return {
    latDMS,
    lonDMS,
    combined: `${latDMS}, ${lonDMS}`,
  };
}

/**
 * Calculate distance in kilometers using the Haversine formula
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { km: number; nauticalMiles: number; miles: number } {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = R * c;
  return {
    km: Math.round(km * 10) / 10,
    nauticalMiles: Math.round(km * 0.539957 * 10) / 10,
    miles: Math.round(km * 0.621371 * 10) / 10,
  };
}

/**
 * Calculate compass bearing in degrees and cardinal direction
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): { degrees: number; cardinal: string } {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  const normalizedDegrees = Math.round((brng + 360) % 360);

  const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
  const index = Math.round(normalizedDegrees / 45);
  const cardinal = cardinals[index] || 'N';

  return { degrees: normalizedDegrees, cardinal };
}

/**
 * Reverse geocode latitude and longitude to a human readable address
 */
export async function reverseGeocodeCoordinates(lat: number, lon: number): Promise<LocationAddress> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'HermesJarvisLocationService/1.0',
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      const addr = data.address || {};
      const city = addr.city || addr.town || addr.village || addr.suburb || addr.municipality || 'Urban Sector';
      const state = addr.state || addr.region || addr.province || '';
      const country = addr.country || 'Global Territory';
      const countryCode = (addr.country_code || 'UN').toUpperCase();
      const postcode = addr.postcode || '';
      const road = addr.road || addr.street || '';

      const formattedParts = [city, state, country].filter(Boolean);
      const formattedAddress = formattedParts.join(', ') || data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;

      return {
        formattedAddress,
        city,
        state,
        country,
        countryCode,
        postcode,
        road,
      };
    }
  } catch (err) {
    // Graceful fallback to offline region estimation
  }

  // Regional offline fallback
  return estimateOfflineRegion(lat, lon);
}

/**
 * Approximate offline region when network reverse geocoder is unavailable
 */
function estimateOfflineRegion(lat: number, lon: number): LocationAddress {
  // Rough geographic quadrant checks
  let city = 'Telemetry Sector';
  let country = 'Earth Grid';
  let countryCode = 'INT';

  if (lat >= 8 && lat <= 37 && lon >= 68 && lon <= 97) {
    city = 'Indian Subcontinent Core';
    country = 'India';
    countryCode = 'IN';
  } else if (lat >= 24 && lat <= 49 && lon >= -125 && lon <= -66) {
    city = 'North American Sector';
    country = 'United States';
    countryCode = 'US';
  } else if (lat >= 35 && lat <= 71 && lon >= -10 && lon <= 40) {
    city = 'European Continental Zone';
    country = 'European Union';
    countryCode = 'EU';
  } else if (lat >= 20 && lat <= 46 && lon >= 122 && lon <= 154) {
    city = 'East Asia Node';
    country = 'Japan / Asia';
    countryCode = 'JP';
  }

  return {
    formattedAddress: `${city}, ${country} (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`,
    city,
    country,
    countryCode,
  };
}

/**
 * Save coordinates to local storage for instant dashboard hydration
 */
export function saveCachedLocation(coords: GeoCoordinates, address: LocationAddress | null) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        coords,
        address,
        savedAt: new Date().toISOString(),
      })
    );
  } catch {}
}

/**
 * Provenance of the coordinates currently shown by a location surface. Only
 * `live` means the reading came from the device GPS radio in this session.
 */
export type CoordsSource = 'live' | 'cache' | 'preset' | 'manual';

const SOURCE_LABELS: Record<CoordsSource, string> = {
  live: 'LIVE GPS',
  cache: 'LAST KNOWN (CACHED)',
  preset: 'SIMULATED PRESET',
  manual: 'MANUAL ENTRY',
};

/** A null source means no position is held at all — never render it as a fix. */
const NO_FIX_LABEL = 'NO FIX';

export function locationSourceLabel(source: CoordsSource | null): string {
  return source ? SOURCE_LABELS[source] ?? SOURCE_LABELS.cache : NO_FIX_LABEL;
}

/**
 * Compact provenance badge for a status bar. `live` is the only value that may
 * be presented as a device GPS link; every other provenance — including none at
 * all — renders as a non-live label.
 */
export function locationFixBadge(source: CoordsSource | null): { label: string; live: boolean } {
  switch (source) {
    case 'live':
      return { label: 'LIVE GPS', live: true };
    case 'cache':
      return { label: 'CACHED FIX', live: false };
    case 'preset':
      return { label: 'PRESET ONLY', live: false };
    case 'manual':
      return { label: 'MANUAL ENTRY', live: false };
    default:
      return { label: 'NO FIX', live: false };
  }
}

/**
 * Accuracy figure to display. A preset, manual, or cached coordinate has no
 * measured GPS precision, so it must never render a fabricated ±Nm value.
 */
export function accuracyDisplay(source: CoordsSource | null, accuracy: number): string {
  return source === 'live' ? `±${Math.round(accuracy)}m` : 'N/A — no GPS fix';
}

/**
 * Spoken location briefing. When there is no live GPS fix it must say so and
 * name the real provenance instead of reading the position as a device fix.
 */
export function locationBriefing(
  source: CoordsSource | null,
  options: { latitude: number; longitude: number; accuracy: number; placeLabel: string },
): string {
  const { latitude, longitude, accuracy, placeLabel } = options;
  const position = `Latitude ${latitude.toFixed(4)} degrees, Longitude ${longitude.toFixed(4)} degrees`;
  if (source === 'live') {
    return `Sir, your current geospatial fix is located at ${placeLabel}. ${position}, with a GPS precision of plus or minus ${Math.round(accuracy)} meters.`;
  }
  const qualifier =
    source === 'preset'
      ? 'a simulated tactical preset'
      : source === 'manual'
        ? 'manually entered coordinates'
        : source === 'cache'
          ? 'the last known cached position'
          : 'an unverified position of unknown origin';
  return `Sir, there is no live GPS fix. I am showing ${placeLabel} at ${position} from ${qualifier}, which is not a device location reading.`;
}

/**
 * Load cached location from local storage
 */
export function loadCachedLocation(): { coords: GeoCoordinates; address: LocationAddress | null } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.coords) {
      return {
        coords: parsed.coords,
        address: parsed.address || null,
      };
    }
  } catch {}
  return null;
}
