import React, { useState, useEffect } from 'react';
import { X, Sliders, Volume2, Mic, Globe, Zap, Check } from 'lucide-react';
import { VoiceSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: VoiceSettings;
  onUpdateSettings: (settings: VoiceSettings) => void;
  availableVoices: SpeechSynthesisVoice[];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  availableVoices,
}) => {
  const [localSettings, setLocalSettings] = useState<VoiceSettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdateSettings(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-lg bg-slate-900 border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col glow-cyan-sm max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-cyan-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
              <Sliders className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-hud font-bold text-cyan-200 uppercase tracking-wider">
                AUDIO & SPEECH PROTOCOLS
              </h2>
              <span className="text-[11px] font-mono text-slate-400">
                Voice synthesis and recognition settings
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

        {/* Form Body */}
        <div className="p-5 space-y-4 bg-slate-900/95 overflow-y-auto text-xs font-mono">
          {/* Auto Speak Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <div className="font-hud font-semibold text-slate-200">Voice Synthesis (TTS)</div>
              <div className="text-slate-400 text-[11px]">Jarvis reads responses out loud automatically</div>
            </div>
            <input
              type="checkbox"
              checked={localSettings.autoSpeak}
              onChange={(e) => setLocalSettings({ ...localSettings, autoSpeak: e.target.checked })}
              className="w-5 h-5 accent-cyan-500 rounded cursor-pointer"
            />
          </div>

          {/* Voice Selection */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <label className="font-hud font-semibold text-slate-200 block">Synthesizer Voice Profile</label>
            <select
              value={localSettings.voiceURI}
              onChange={(e) => setLocalSettings({ ...localSettings, voiceURI: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-cyan-200 focus:outline-none focus:border-cyan-400"
            >
              <option value="">Default System Voice</option>
              {availableVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>

          {/* Language Selection (English & Hindi support matching original python) */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <label className="font-hud font-semibold text-slate-200 block">Speech Recognition Language</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLocalSettings({ ...localSettings, language: 'en-US' })}
                className={`p-2.5 rounded-lg border text-center transition-all ${
                  localSettings.language === 'en-US'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                English (US / Global)
              </button>
              <button
                type="button"
                onClick={() => setLocalSettings({ ...localSettings, language: 'hi-IN' })}
                className={`p-2.5 rounded-lg border text-center transition-all ${
                  localSettings.language === 'hi-IN'
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                Hindi / हिन्दी (hi-IN)
              </button>
            </div>
          </div>

          {/* Speech Rate & Pitch */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-slate-300">
                <span>Speech Speed Rate:</span>
                <span className="text-cyan-400">{localSettings.rate}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.8"
                step="0.1"
                value={localSettings.rate}
                onChange={(e) => setLocalSettings({ ...localSettings, rate: parseFloat(e.target.value) })}
                className="w-full accent-cyan-400"
              />
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-slate-300">
                <span>Pitch Frequency:</span>
                <span className="text-cyan-400">{localSettings.pitch}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.5"
                step="0.1"
                value={localSettings.pitch}
                onChange={(e) => setLocalSettings({ ...localSettings, pitch: parseFloat(e.target.value) })}
                className="w-full accent-cyan-400"
              />
            </div>
          </div>

          {/* Legal & Policy Links */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="font-hud font-semibold text-slate-200">Legal &amp; Privacy Compliance</div>
            <p className="text-[11px] text-slate-400">
              HERMES JARVIS enforces Level-4 Human Authorization for all sensitive external actions.
            </p>
            <div className="flex items-center gap-3 pt-1">
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 underline text-xs font-semibold"
              >
                Privacy Policy
              </a>
              <span className="text-slate-600">•</span>
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 underline text-xs font-semibold"
              >
                Terms of Service
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono transition-colors flex items-center gap-1.5 shadow glow-cyan-sm"
          >
            <Check className="w-4 h-4" />
            <span>Apply Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
