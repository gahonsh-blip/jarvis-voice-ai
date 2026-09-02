import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  MapPin,
  Compass,
  Navigation,
  Crosshair,
  Layers,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Radio,
  Globe,
  Sliders,
  AlertCircle,
  Volume2,
  ShieldCheck,
  Zap,
  ArrowUpRight,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  GeoCoordinates,
  LocationAddress,
  WaypointMarker,
  TACTICAL_PRESETS,
} from '../types/location';
import {
  formatDMS,
  calculateHaversineDistance,
  calculateBearing,
  reverseGeocodeCoordinates,
  saveCachedLocation,
  loadCachedLocation,
} from '../utils/locationService';

interface LocationServicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSpeak?: (text: string) => void;
  onCoordinatesUpdated?: (coords: GeoCoordinates, address: LocationAddress | null) => void;
}

export const LocationServicesModal: React.FC<LocationServicesModalProps> = ({
  isOpen,
  onClose,
  onSpeak,
  onCoordinatesUpdated,
}) => {
  // State
  const [coords, setCoords] = useState<GeoCoordinates | null>(() => {
    const cached = loadCachedLocation();
    return cached?.coords || null;
  });
  const [address, setAddress] = useState<LocationAddress | null>(() => {
    const cached = loadCachedLocation();
    return cached?.address || null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isWatching, setIsWatching] = useState<boolean>(false);
  const [highAccuracy, setHighAccuracy] = useState<boolean>(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [mapLayer, setMapLayer] = useState<'radar' | 'osm' | 'hybrid'>('radar');
  const [zoomLevel, setZoomLevel] = useState<number>(14);
  const [copiedCoords, setCopiedCoords] = useState<boolean>(false);
  const [selectedWaypoint, setSelectedWaypoint] = useState<WaypointMarker>(TACTICAL_PRESETS[0]);
  const [customLat, setCustomLat] = useState<string>('');
  const [customLon, setCustomLon] = useState<string>('');
  const [showManualInput, setShowManualInput] = useState<boolean>(false);

  const watchIdRef = useRef<number | null>(null);

  // Acquire current location
  const fetchCurrentLocation = useCallback(
    async (highAcc: boolean = true) => {
      setIsLoading(true);
      setPermissionError(null);

      if (!('geolocation' in navigator)) {
        setPermissionError('Geolocation API is not supported by this browser client.');
        setIsLoading(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const newCoords: GeoCoordinates = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude,
            altitudeAccuracy: pos.coords.altitudeAccuracy,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
            timestamp: pos.timestamp,
          };

          setCoords(newCoords);
          setIsLoading(false);

          // Reverse geocode
          const addr = await reverseGeocodeCoordinates(newCoords.latitude, newCoords.longitude);
          setAddress(addr);
          saveCachedLocation(newCoords, addr);
          onCoordinatesUpdated?.(newCoords, addr);
        },
        (err) => {
          setIsLoading(false);
          let msg = 'Unable to retrieve location telemetry.';
          if (err.code === 1) {
            msg = 'GPS Permission Denied. Please enable location access or select a preset node below.';
          } else if (err.code === 2) {
            msg = 'Position unavailable. Satellite/network fix lost.';
          } else if (err.code === 3) {
            msg = 'GPS location request timed out. Retrying with standard accuracy.';
          }
          setPermissionError(msg);

          // If no coords exist, seed with default HQ preset
          if (!coords) {
            const fallbackPreset = TACTICAL_PRESETS[0];
            const fallbackCoords: GeoCoordinates = {
              latitude: fallbackPreset.latitude,
              longitude: fallbackPreset.longitude,
              accuracy: 25,
              timestamp: Date.now(),
            };
            setCoords(fallbackCoords);
            reverseGeocodeCoordinates(fallbackCoords.latitude, fallbackCoords.longitude).then((addr) => {
              setAddress(addr);
              saveCachedLocation(fallbackCoords, addr);
            });
          }
        },
        {
          enableHighAccuracy: highAcc,
          timeout: 10000,
          maximumAge: 30000,
        }
      );
    },
    [coords, onCoordinatesUpdated]
  );

  // Toggle Live Watch Position
  const toggleLiveWatch = useCallback(() => {
    if (isWatching) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsWatching(false);
    } else {
      if (!('geolocation' in navigator)) {
        setPermissionError('Geolocation API not supported.');
        return;
      }
      setIsWatching(true);
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          const updated: GeoCoordinates = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            altitude: pos.coords.altitude,
            altitudeAccuracy: pos.coords.altitudeAccuracy,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
            timestamp: pos.timestamp,
          };
          setCoords(updated);
          saveCachedLocation(updated, address);
          onCoordinatesUpdated?.(updated, address);
        },
        (err) => {
          setPermissionError(`Live tracking interrupted: ${err.message}`);
          setIsWatching(false);
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout: 15000,
          maximumAge: 10000,
        }
      );
      watchIdRef.current = id;
    }
  }, [isWatching, highAccuracy, address, onCoordinatesUpdated]);

  // Clean up watch on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Trigger initial fetch when modal is opened if no coords
  useEffect(() => {
    if (isOpen && !coords) {
      fetchCurrentLocation(highAccuracy);
    }
  }, [isOpen, coords, highAccuracy, fetchCurrentLocation]);

  // Copy coordinates
  const handleCopyCoords = () => {
    if (!coords) return;
    const text = `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  // Speak Location Briefing
  const handleSpeakBriefing = () => {
    if (!coords) return;
    const dms = formatDMS(coords.latitude, coords.longitude);
    const locName = address?.city ? `${address.city}, ${address.country || ''}` : 'current coordinates';
    const speech = `Sir, your current geospatial fix is located at ${locName}. Latitude ${coords.latitude.toFixed(4)} degrees, Longitude ${coords.longitude.toFixed(4)} degrees, with a GPS precision of plus or minus ${Math.round(coords.accuracy)} meters.`;
    onSpeak?.(speech);
  };

  // Apply a preset
  const handleApplyPreset = async (preset: WaypointMarker) => {
    const newCoords: GeoCoordinates = {
      latitude: preset.latitude,
      longitude: preset.longitude,
      accuracy: 15,
      timestamp: Date.now(),
    };
    setCoords(newCoords);
    setSelectedWaypoint(preset);
    setPermissionError(null);
    setIsLoading(true);
    const addr = await reverseGeocodeCoordinates(preset.latitude, preset.longitude);
    setAddress(addr);
    setIsLoading(false);
    saveCachedLocation(newCoords, addr);
    onCoordinatesUpdated?.(newCoords, addr);
  };

  // Apply manual coordinates
  const handleApplyCustomCoords = async (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(customLat);
    const lon = parseFloat(customLon);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setPermissionError('Invalid coordinates. Latitude must be between -90 and 90, Longitude between -180 and 180.');
      return;
    }
    const customCoords: GeoCoordinates = {
      latitude: lat,
      longitude: lon,
      accuracy: 10,
      timestamp: Date.now(),
    };
    setCoords(customCoords);
    setPermissionError(null);
    setIsLoading(true);
    const addr = await reverseGeocodeCoordinates(lat, lon);
    setAddress(addr);
    setIsLoading(false);
    saveCachedLocation(customCoords, addr);
    onCoordinatesUpdated?.(customCoords, addr);
    setShowManualInput(false);
  };

  if (!isOpen) return null;

  const dms = coords ? formatDMS(coords.latitude, coords.longitude) : null;
  const waypointDistance = coords
    ? calculateHaversineDistance(
        coords.latitude,
        coords.longitude,
        selectedWaypoint.latitude,
        selectedWaypoint.longitude
      )
    : null;
  const waypointBearing = coords
    ? calculateBearing(
        coords.latitude,
        coords.longitude,
        selectedWaypoint.latitude,
        selectedWaypoint.longitude
      )
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        id="location-services-modal-container"
        className="w-full max-w-5xl bg-slate-950 border border-cyan-500/40 rounded-2xl shadow-2xl shadow-cyan-950/60 flex flex-col max-h-[92vh] overflow-hidden relative"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cyan-900/40 bg-slate-900/70">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-400/40 text-cyan-400">
                <Navigation className="w-6 h-6 animate-pulse" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold font-mono tracking-wider text-cyan-300">
                  GEOLOCATION & TACTICAL NAVIGATION CORE
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  WGS-84
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                HERMES Planetary Position Fix & Real-time Coordinate Telemetry
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {coords && onSpeak && (
              <button
                onClick={handleSpeakBriefing}
                title="Voice Telemetry Briefing"
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-700/50 text-cyan-300 font-mono text-xs transition-colors"
              >
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Voice Briefing</span>
              </button>
            )}
            <button
              onClick={onClose}
              id="close-location-modal-btn"
              className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Permission / Status Alert */}
          {permissionError && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs font-mono flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-amber-300">{permissionError}</p>
                <p className="text-amber-200/80 mt-1">
                  You can click any preset tactical node below or enter manual coordinates to simulate position tracking.
                </p>
              </div>
            </div>
          )}

          {/* Top Row: Coordinates Telemetry Card & Controls */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Primary Coordinates HUD */}
            <div className="lg:col-span-2 p-4 rounded-xl bg-slate-900/80 border border-cyan-900/40 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />

              <div className="flex items-center justify-between border-b border-cyan-950 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-mono font-bold tracking-wider text-slate-300 uppercase">
                    Active Orbital Fix
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {isWatching && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      STREAMING
                    </span>
                  )}
                  {coords && (
                    <button
                      onClick={handleCopyCoords}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-mono text-cyan-300 border border-slate-700 transition-colors"
                    >
                      {copiedCoords ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCoords ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
              </div>

              {coords ? (
                <div className="space-y-3">
                  {/* Big Lat/Lon Display */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-slate-950/70 border border-cyan-950">
                      <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">LATITUDE</div>
                      <div className="text-lg sm:text-xl font-mono font-bold text-cyan-300 tracking-wider">
                        {coords.latitude.toFixed(6)}°
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">{dms?.latDMS}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-950/70 border border-cyan-950">
                      <div className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">LONGITUDE</div>
                      <div className="text-lg sm:text-xl font-mono font-bold text-cyan-300 tracking-wider">
                        {coords.longitude.toFixed(6)}°
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">{dms?.lonDMS}</div>
                    </div>
                  </div>

                  {/* Address Badge */}
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-pink-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-mono text-slate-400 uppercase">CIVIC SECTOR / REVERSE GEOCODE</div>
                      <p className="text-sm font-semibold text-slate-200 truncate">
                        {address?.formattedAddress || 'Reverse geocoding address...'}
                      </p>
                      {address?.city && (
                        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400 mt-0.5">
                          <span>City: <strong className="text-cyan-300">{address.city}</strong></span>
                          <span>Country: <strong className="text-slate-300">{address.country}</strong></span>
                          {address.postcode && <span>Postal: {address.postcode}</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Secondary Telemetry Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80">
                      <div className="text-[9px] font-mono text-slate-500 uppercase">ACCURACY</div>
                      <div className="text-xs font-mono font-bold text-emerald-400">
                        ±{Math.round(coords.accuracy)}m
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80">
                      <div className="text-[9px] font-mono text-slate-500 uppercase">ALTITUDE</div>
                      <div className="text-xs font-mono font-bold text-cyan-300">
                        {coords.altitude !== null && coords.altitude !== undefined
                          ? `${Math.round(coords.altitude)}m ASL`
                          : 'Sea Level / N/A'}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80">
                      <div className="text-[9px] font-mono text-slate-500 uppercase">BEARING</div>
                      <div className="text-xs font-mono font-bold text-amber-300">
                        {coords.heading !== null && coords.heading !== undefined
                          ? `${Math.round(coords.heading)}°`
                          : 'Static / 0°'}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800/80">
                      <div className="text-[9px] font-mono text-slate-500 uppercase">SPEED</div>
                      <div className="text-xs font-mono font-bold text-purple-300">
                        {coords.speed !== null && coords.speed !== undefined
                          ? `${(coords.speed * 3.6).toFixed(1)} km/h`
                          : '0.0 km/h'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center space-y-3">
                  <Radio className="w-10 h-10 text-cyan-400 animate-pulse mx-auto opacity-60" />
                  <p className="text-sm font-mono text-slate-300">Awaiting Geolocation Hardware Lock...</p>
                  <button
                    onClick={() => fetchCurrentLocation(highAccuracy)}
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition-colors"
                  >
                    Acquire GPS Fix Now
                  </button>
                </div>
              )}
            </div>

            {/* Quick Actions & Stream Controls */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-cyan-900/40 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="text-xs font-mono font-bold tracking-wider text-slate-300 uppercase mb-3 flex items-center gap-1.5">
                  <Radio className="w-4 h-4 text-cyan-400" />
                  SENSOR CONTROLS
                </h3>

                <div className="space-y-2">
                  <button
                    onClick={() => fetchCurrentLocation(highAccuracy)}
                    disabled={isLoading}
                    className="w-full py-2 px-3 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 font-mono text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    <span>{isLoading ? 'Re-scanning Orbit...' : 'Refresh Position Fix'}</span>
                  </button>

                  <button
                    onClick={toggleLiveWatch}
                    className={`w-full py-2 px-3 rounded-lg border font-mono text-xs flex items-center justify-center gap-2 transition-colors ${
                      isWatching
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30'
                        : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <Radio className={`w-3.5 h-3.5 ${isWatching ? 'animate-pulse text-emerald-400' : ''}`} />
                    <span>{isWatching ? 'Stop Live Tracking' : 'Start Live GPS Watch'}</span>
                  </button>

                  <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-950/60 border border-slate-800 text-xs font-mono">
                    <span className="text-slate-400">High Precision GPS</span>
                    <button
                      onClick={() => setHighAccuracy(!highAccuracy)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        highAccuracy ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {highAccuracy ? 'ACTIVE' : 'STANDARD'}
                    </button>
                  </div>
                </div>
              </div>

              {/* External Mapping Link */}
              {coords && (
                <div className="pt-2 border-t border-slate-800">
                  <a
                    href={`https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 px-3 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-cyan-800 text-slate-300 hover:text-cyan-300 font-mono text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <span>View in External Google Maps</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Interactive Map Snippet Area */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-cyan-900/40 space-y-3">
            {/* Map Header & Layer Toggles */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-950 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-mono font-bold tracking-wider text-slate-300 uppercase">
                  Tactical Geospace Viewer
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setMapLayer('radar')}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                    mapLayer === 'radar'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Tactical Radar
                </button>
                <button
                  onClick={() => setMapLayer('osm')}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                    mapLayer === 'osm'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Street Map
                </button>
                <button
                  onClick={() => setMapLayer('hybrid')}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                    mapLayer === 'hybrid'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Satellite Grid
                </button>

                <div className="h-4 w-px bg-slate-800 mx-1" />

                {/* Zoom Controls */}
                <button
                  onClick={() => setZoomLevel((z) => Math.min(z + 1, 18))}
                  className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs flex items-center justify-center"
                  title="Zoom In"
                >
                  +
                </button>
                <button
                  onClick={() => setZoomLevel((z) => Math.max(z - 1, 3))}
                  className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs flex items-center justify-center"
                  title="Zoom Out"
                >
                  -
                </button>
              </div>
            </div>

            {/* Map Canvas / Visualizer */}
            <div className="relative w-full h-72 sm:h-96 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center select-none">
              {coords ? (
                <>
                  {/* Layer: OpenStreetMap Embed or Live Web Tiles */}
                  {mapLayer === 'osm' && (
                    <iframe
                      title="OpenStreetMap Snippet"
                      width="100%"
                      height="100%"
                      frameBorder="0"
                      scrolling="no"
                      marginHeight={0}
                      marginWidth={0}
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.longitude - 0.015 * (16 / zoomLevel)}%2C${coords.latitude - 0.015 * (16 / zoomLevel)}%2C${coords.longitude + 0.015 * (16 / zoomLevel)}%2C${coords.latitude + 0.015 * (16 / zoomLevel)}&layer=mapnik&marker=${coords.latitude}%2C${coords.longitude}`}
                      className="w-full h-full filter invert-[0.9] hue-rotate-180 contrast-[1.1] brightness-[0.85] opacity-80"
                    />
                  )}

                  {/* Layer: Tactical Radar or Hybrid Grid */}
                  {(mapLayer === 'radar' || mapLayer === 'hybrid') && (
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#0e3a47_0%,#020617_80%)] flex items-center justify-center overflow-hidden">
                      {/* Grid Lines */}
                      <div
                        className="absolute inset-0 bg-[linear-gradient(to_right,#08334433_1px,transparent_1px),linear-gradient(to_bottom,#08334433_1px,transparent_1px)]"
                        style={{ backgroundSize: `${32 * (zoomLevel / 12)}px ${32 * (zoomLevel / 12)}px` }}
                      />

                      {/* Concentric Radar Rings */}
                      <div className="absolute w-40 h-40 rounded-full border border-cyan-500/20" />
                      <div className="absolute w-80 h-80 rounded-full border border-cyan-500/15" />
                      <div className="absolute w-96 h-96 rounded-full border border-dashed border-cyan-500/10" />

                      {/* Rotating Radar Sweep */}
                      <div className="absolute w-80 h-80 rounded-full overflow-hidden pointer-events-none">
                        <div className="w-full h-full origin-center animate-[spin_6s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_270deg,#06b6d433_360deg)]" />
                      </div>

                      {/* Cardinal Crosshair lines */}
                      <div className="absolute inset-x-0 h-px bg-cyan-500/20 pointer-events-none" />
                      <div className="absolute inset-y-0 w-px bg-cyan-500/20 pointer-events-none" />

                      {/* Compass Degree Markers */}
                      <div className="absolute top-3 text-[10px] font-mono text-cyan-400 font-bold">000° N</div>
                      <div className="absolute bottom-3 text-[10px] font-mono text-cyan-400 font-bold">180° S</div>
                      <div className="absolute left-3 text-[10px] font-mono text-cyan-400 font-bold">270° W</div>
                      <div className="absolute right-3 text-[10px] font-mono text-cyan-400 font-bold">090° E</div>

                      {/* Target Pin in Center */}
                      <div className="relative z-10 flex flex-col items-center">
                        <span className="flex h-6 w-6 relative items-center justify-center">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-300 shadow-[0_0_12px_#22d3ee]"></span>
                        </span>
                        <div className="mt-2 px-2.5 py-1 rounded-md bg-slate-950/90 border border-cyan-500/60 backdrop-blur-md text-center shadow-lg">
                          <div className="text-[10px] font-mono font-bold text-cyan-300">
                            {address?.city || 'GPS Lock Point'}
                          </div>
                          <div className="text-[9px] font-mono text-slate-400">
                            {coords.latitude.toFixed(4)}°, {coords.longitude.toFixed(4)}°
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Watermark HUD Overlay */}
                  <div className="absolute bottom-3 left-3 z-20 px-2.5 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-400 space-y-0.5 pointer-events-none">
                    <div>MODE: {mapLayer.toUpperCase()} TACTICAL</div>
                    <div>ZOOM: {zoomLevel}x / SCALE 1:50000</div>
                    <div>DATUM: WGS 84 / EGM96 GEOID</div>
                  </div>
                </>
              ) : (
                <div className="text-center font-mono text-xs text-slate-500">
                  No spatial coordinates loaded.
                </div>
              )}
            </div>
          </div>

          {/* Waypoint Targeting & Distance Matrix */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-cyan-900/40 space-y-4">
            <div className="flex items-center justify-between border-b border-cyan-950 pb-3">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-mono font-bold tracking-wider text-slate-300 uppercase">
                  Global Waypoint Geodesic Matrix
                </span>
              </div>
              <button
                onClick={() => setShowManualInput(!showManualInput)}
                className="text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{showManualInput ? 'Hide Custom Input' : 'Enter Custom Coords'}</span>
              </button>
            </div>

            {/* Custom Coordinates Form */}
            {showManualInput && (
              <form
                onSubmit={handleApplyCustomCoords}
                className="p-3.5 rounded-xl bg-slate-950 border border-cyan-800/40 flex flex-wrap items-center gap-3 animate-in fade-in duration-150"
              >
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">LATITUDE (-90 to 90)</label>
                  <input
                    type="text"
                    value={customLat}
                    onChange={(e) => setCustomLat(e.target.value)}
                    placeholder="e.g. 28.6139"
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">LONGITUDE (-180 to 180)</label>
                  <input
                    type="text"
                    value={customLon}
                    onChange={(e) => setCustomLon(e.target.value)}
                    placeholder="e.g. 77.2090"
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="self-end">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition-colors"
                  >
                    Simulate Position
                  </button>
                </div>
              </form>
            )}

            {/* Tactical Presets Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {TACTICAL_PRESETS.map((preset) => {
                const isSelected = selectedWaypoint.id === preset.id;
                const dist = coords
                  ? calculateHaversineDistance(
                      coords.latitude,
                      coords.longitude,
                      preset.latitude,
                      preset.longitude
                    )
                  : null;

                return (
                  <button
                    key={preset.id}
                    onClick={() => handleApplyPreset(preset)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-cyan-950/40 border-cyan-400/80 shadow-md shadow-cyan-950'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-slate-200 truncate">{preset.name}</span>
                      <span className="text-[10px] font-mono text-cyan-400 font-semibold uppercase">
                        {preset.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{preset.description}</p>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-2 pt-2 border-t border-slate-800">
                      <span>{preset.latitude.toFixed(3)}°, {preset.longitude.toFixed(3)}°</span>
                      {dist && <span className="text-emerald-400 font-bold">{dist.km} km away</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Relative Geodesic Calculation Box */}
            {coords && waypointDistance && waypointBearing && (
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-950/70 border border-cyan-700/50 text-cyan-300">
                    <Compass className="w-5 h-5 animate-spin" style={{ animationDuration: '20s' }} />
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      GEODESIC VECTOR TO {selectedWaypoint.name.toUpperCase()}
                    </div>
                    <div className="text-sm font-mono font-bold text-cyan-300">
                      {waypointDistance.km} km ({waypointDistance.miles} mi) • Azimuth {waypointBearing.degrees}° ({waypointBearing.cardinal})
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-slate-400">
                    Est. Mach 0.8 Transit: <strong className="text-purple-300">{(waypointDistance.km / 980).toFixed(1)} hrs</strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-cyan-900/40 bg-slate-900/70 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Privacy Assured: Coordinates processed locally & over HTTPS</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Datum: WGS84 Standard</span>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
