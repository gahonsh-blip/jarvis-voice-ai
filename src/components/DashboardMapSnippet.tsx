import React from 'react';
import { MapPin, Navigation, Crosshair, Radio, RefreshCw, ArrowUpRight, Compass } from 'lucide-react';
import { GeoCoordinates, LocationAddress } from '../types/location';
import { formatDMS } from '../utils/locationService';

interface DashboardMapSnippetProps {
  coords: GeoCoordinates | null;
  address: LocationAddress | null;
  isLoading?: boolean;
  onOpenModal: () => void;
  onRefresh?: () => void;
}

export const DashboardMapSnippet: React.FC<DashboardMapSnippetProps> = ({
  coords,
  address,
  isLoading = false,
  onOpenModal,
  onRefresh,
}) => {
  const dms = coords ? formatDMS(coords.latitude, coords.longitude) : null;

  return (
    <div
      id="dashboard-location-snippet"
      className="w-full rounded-2xl bg-slate-950/70 border border-cyan-900/40 p-4 relative overflow-hidden backdrop-blur-md shadow-xl group hover:border-cyan-500/50 transition-all"
    >
      {/* Background glow & grid */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#08334410_1px,transparent_1px),linear-gradient(to_bottom,#08334410_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-cyan-950 pb-2.5 mb-3 relative z-10">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Crosshair className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold tracking-wider text-cyan-300 uppercase">
              GEO-TELEMETRY & RADAR
            </h3>
            <span className="text-[10px] font-mono text-slate-400">
              {coords ? 'ACTIVE POSITION FIX' : 'INITIALIZING GPS...'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {onRefresh && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
              title="Refresh GPS Fix"
              disabled={isLoading}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/60 text-slate-400 hover:text-cyan-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            onClick={onOpenModal}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-700/40 text-[11px] font-mono text-cyan-300 transition-colors"
          >
            <span>TACTICAL HUD</span>
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Mini Tactical Radar Snippet & Coordinates Layout */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 relative z-10 items-center">
        {/* Radar Snippet Visual */}
        <div
          onClick={onOpenModal}
          className="sm:col-span-5 h-28 rounded-xl bg-slate-900 border border-cyan-950 flex items-center justify-center relative overflow-hidden cursor-pointer group-hover:border-cyan-800 transition-colors"
          title="Click to expand Tactical Map"
        >
          {/* Radar Circles */}
          <div className="absolute w-20 h-20 rounded-full border border-cyan-500/20" />
          <div className="absolute w-32 h-32 rounded-full border border-cyan-500/15" />
          {/* Radar Sweep */}
          <div className="absolute w-28 h-28 rounded-full overflow-hidden pointer-events-none">
            <div className="w-full h-full origin-center animate-[spin_5s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_270deg,#06b6d433_360deg)]" />
          </div>
          {/* Center Pin */}
          <div className="relative z-10 flex flex-col items-center">
            <span className="flex h-4 w-4 relative items-center justify-center">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-300"></span>
            </span>
            <span className="text-[9px] font-mono text-cyan-300 mt-1 font-bold">
              {address?.city || 'CURRENT FIX'}
            </span>
          </div>
          {/* Subtle click prompt */}
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-mono bg-slate-950/80 text-slate-400">
            CLICK TO EXPAND
          </div>
        </div>

        {/* Numeric Telemetry & Civic Sector */}
        <div className="sm:col-span-7 flex flex-col justify-between space-y-2">
          {coords ? (
            <>
              {/* Coordinates Pill */}
              <div className="p-2 rounded-lg bg-slate-950/70 border border-cyan-950 flex items-center justify-between">
                <div>
                  <div className="text-[9px] font-mono text-slate-400 uppercase">COORDINATES</div>
                  <div className="text-xs font-mono font-bold text-cyan-300 tracking-wider">
                    {coords.latitude.toFixed(4)}°, {coords.longitude.toFixed(4)}°
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-mono text-slate-400 uppercase">PRECISION</div>
                  <div className="text-[11px] font-mono font-bold text-emerald-400">
                    ±{Math.round(coords.accuracy)}m
                  </div>
                </div>
              </div>

              {/* City / Address Pill */}
              <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800 flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] font-mono text-slate-400 uppercase">CIVIC SECTOR</div>
                  <p className="text-xs font-semibold text-slate-200 truncate">
                    {address?.formattedAddress || address?.city || 'Detecting geographic sector...'}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="py-3 text-center">
              <p className="text-xs font-mono text-slate-400 mb-2">Satellite lock initializing...</p>
              <button
                onClick={onOpenModal}
                className="px-3 py-1.5 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/40 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold"
              >
                Open Location Services
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
