import React, { useState, useEffect } from 'react';
import { X, Search, ExternalLink, Globe, ArrowLeft, ArrowRight, RotateCw } from 'lucide-react';

interface BrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
  initialUrl?: string;
}

export const BrowserModal: React.FC<BrowserModalProps> = ({
  isOpen,
  onClose,
  initialQuery = '',
  initialUrl = '',
}) => {
  const [url, setUrl] = useState<string>('https://www.google.com');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    if (initialUrl) {
      setUrl(initialUrl);
    } else if (initialQuery) {
      setSearchQuery(initialQuery);
      setUrl(`https://www.google.com/search?q=${encodeURIComponent(initialQuery)}`);
    }
  }, [initialQuery, initialUrl, isOpen]);

  if (!isOpen) return null;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const target = searchQuery.startsWith('http://') || searchQuery.startsWith('https://')
      ? searchQuery
      : `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
    setUrl(target);
  };

  const quickLinks = [
    { label: 'Google Search', url: 'https://www.google.com', color: 'text-cyan-400' },
    { label: 'YouTube', url: 'https://www.youtube.com', color: 'text-red-400' },
    { label: 'Gmail', url: 'https://mail.google.com', color: 'text-amber-400' },
    { label: 'ChatGPT', url: 'https://chatgpt.com', color: 'text-emerald-400' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-3xl bg-slate-900 border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col glow-cyan-sm max-h-[85vh]">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-5 py-3 bg-slate-950 border-b border-cyan-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
              <Globe className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-hud font-bold text-cyan-200 uppercase tracking-wider">
                JARVIS WEB CHROME BROWSER
              </h2>
              <span className="text-[11px] font-mono text-slate-400">
                Web Navigator & Search Dispatcher
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Address Bar Form */}
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 p-3 bg-slate-950/90 border-b border-slate-800">
          <div className="flex items-center gap-1 text-slate-500">
            <button type="button" className="p-1 hover:text-slate-300 rounded"><ArrowLeft className="w-4 h-4" /></button>
            <button type="button" className="p-1 hover:text-slate-300 rounded"><ArrowRight className="w-4 h-4" /></button>
            <button type="button" className="p-1 hover:text-slate-300 rounded"><RotateCw className="w-4 h-4" /></button>
          </div>

          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Google or enter URL..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs font-mono text-cyan-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono"
          >
            Search
          </button>

          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 flex items-center gap-1 text-xs font-mono"
            title="Open in new browser tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Launch Tab</span>
          </a>
        </form>

        {/* Quick Access Badges */}
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-950/60 border-b border-slate-800 text-xs font-mono overflow-x-auto">
          <span className="text-slate-500">Quick Portals:</span>
          {quickLinks.map((ql) => (
            <button
              key={ql.label}
              onClick={() => {
                setUrl(ql.url);
                setSearchQuery(ql.url);
              }}
              className="px-2.5 py-1 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 text-[11px]"
            >
              <span className={ql.color}>●</span> {ql.label}
            </button>
          ))}
        </div>

        {/* Interactive Simulated Web View */}
        <div className="p-6 bg-slate-900/90 flex-1 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center glow-cyan-sm">
            <Globe className="w-8 h-8 text-cyan-400 animate-pulse" />
          </div>

          <div className="max-w-md">
            <h3 className="text-base font-hud font-bold text-cyan-200">
              Web Target Configured
            </h3>
            <p className="text-xs font-mono text-slate-400 mt-1 break-all bg-slate-950/80 p-2 rounded-lg border border-slate-800">
              {url}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-mono text-xs shadow-lg glow-cyan flex items-center gap-2 transition-all"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open Target in Secure Window</span>
            </a>
          </div>

          <p className="text-[11px] font-mono text-slate-500 max-w-sm">
            Voice command recognized: "open google", "open youtube", "open gmail", "open chatgpt", "search [query]".
          </p>
        </div>
      </div>
    </div>
  );
};
