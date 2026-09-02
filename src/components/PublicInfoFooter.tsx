import React, { useState } from 'react';
import { ShieldCheck, Lock, ExternalLink, FileText, Info, CheckCircle2, AlertTriangle } from 'lucide-react';

export const PublicInfoFooter: React.FC = () => {
  const [detailsExpanded, setDetailsExpanded] = useState<boolean>(false);

  return (
    <footer id="public-compliance-footer" className="w-full bg-slate-950/90 border-t border-cyan-950/80 px-4 py-3 text-xs font-mono text-slate-400 mt-4 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left side: Application Identity & Security Guarantee */}
        <div className="flex items-center gap-2 text-center md:text-left flex-wrap justify-center md:justify-start">
          <div className="flex items-center gap-1.5 text-cyan-300 font-bold tracking-wider">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>HERMES JARVIS</span>
          </div>
          <span className="text-slate-600 hidden sm:inline">•</span>
          <span className="text-slate-400 text-[11px] max-w-xl">
            Privacy-First AI Assistant &amp; Automation Core with Level-4 Human-Controlled Authorization. Sensitive actions require explicit human approval.
          </span>
        </div>

        {/* Right side: Public Legal Links & Details Toggle */}
        <div className="flex items-center gap-3 shrink-0 flex-wrap justify-center">
          <button
            onClick={() => setDetailsExpanded(!detailsExpanded)}
            className="text-[11px] text-slate-400 hover:text-cyan-300 flex items-center gap-1 transition-colors underline"
          >
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>{detailsExpanded ? 'Hide Security Disclosures' : 'System Disclosures'}</span>
          </button>
          <span className="text-slate-700">•</span>
          <a
            id="public-privacy-link"
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold transition-colors underline"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Privacy Policy</span>
          </a>
          <span className="text-slate-700">•</span>
          <a
            id="public-terms-link"
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-300 hover:text-slate-100 flex items-center gap-1 font-semibold transition-colors underline"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Terms of Service</span>
          </a>
        </div>
      </div>

      {/* Expandable Application & Google OAuth Disclosures Section */}
      {detailsExpanded && (
        <div className="max-w-7xl mx-auto mt-3 pt-3 border-t border-slate-900 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-slate-400 animate-fadeIn">
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
            <div className="text-slate-200 font-bold flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Google OAuth &amp; YouTube Scopes</span>
            </div>
            <p>
              HERMES JARVIS requests only <code>youtube.readonly</code> and <code>youtube.upload</code> when authorized by the user. Tokens are encrypted at rest with AES-256-GCM.
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
            <div className="text-slate-200 font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Human-In-The-Loop (Level 4)</span>
            </div>
            <p>
              All publishing, video upload, and sensitive automation actions strictly require manual affirmative approval before execution. No autonomous publication occurs.
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
            <div className="text-slate-200 font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>User Deletion &amp; Revocation</span>
            </div>
            <p>
              Users can disconnect integrations at any time to purge credentials, or revoke access via Google Account Security controls. Data is never sold or shared.
            </p>
          </div>
        </div>
      )}
    </footer>
  );
};
