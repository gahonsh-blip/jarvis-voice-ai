import React, { useState, useEffect } from 'react';
import { X, Sliders, Volume2, Mic, Globe, Zap, Check, Sparkles, MessageSquare, Info } from 'lucide-react';
import { VoiceSettings } from '../types';
import { SUPPORTED_LANGUAGES, getLanguageOption, POPULAR_LANGUAGE_CODES, LanguageOption } from '../utils/languages';

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
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const currentLangOption = getLanguageOption(localSettings.language);

  // Find voices matching the currently selected language
  const matchingVoices = availableVoices.filter((v) => {
    const langPrefix = localSettings.language.split('-')[0].toLowerCase();
    const vPrefix = v.lang.split('-')[0].toLowerCase();
    return v.lang.toLowerCase() === localSettings.language.toLowerCase() || vPrefix === langPrefix;
  });

  const handleLanguageChange = (newCode: string) => {
    // If current voiceURI doesn't match new language, suggest best matching voice if available
    let updatedVoiceURI = localSettings.voiceURI;
    const targetVoices = availableVoices.filter((v) => {
      const langPrefix = newCode.split('-')[0].toLowerCase();
      const vPrefix = v.lang.split('-')[0].toLowerCase();
      return v.lang.toLowerCase() === newCode.toLowerCase() || vPrefix === langPrefix;
    });

    if (targetVoices.length > 0 && !targetVoices.some((v) => v.voiceURI === localSettings.voiceURI)) {
      // Pick first matching voice
      updatedVoiceURI = targetVoices[0].voiceURI;
    }

    setLocalSettings({
      ...localSettings,
      language: newCode,
      voiceURI: updatedVoiceURI,
    });
  };

  const handleSave = () => {
    onUpdateSettings(localSettings);
    onClose();
  };

  const filteredLanguages = searchFilter.trim()
    ? SUPPORTED_LANGUAGES.filter(
        (l) =>
          l.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
          l.nativeName.toLowerCase().includes(searchFilter.toLowerCase()) ||
          l.code.toLowerCase().includes(searchFilter.toLowerCase()) ||
          l.region.toLowerCase().includes(searchFilter.toLowerCase())
      )
    : SUPPORTED_LANGUAGES;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-xl bg-slate-900 border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col glow-cyan-sm max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-cyan-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
              <Sliders className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-hud font-bold text-cyan-200 uppercase tracking-wider">
                AUDIO &amp; MULTI-LANGUAGE PROTOCOLS
              </h2>
              <span className="text-[11px] font-mono text-slate-400">
                Speech recognition locale &amp; AI conversational language
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
          {/* Primary Language Selection Section */}
          <div className="p-4 rounded-xl bg-slate-950 border border-cyan-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-400" />
                <label className="font-hud font-semibold text-slate-100 text-sm">
                  Interaction Language &amp; Speech Locale
                </label>
              </div>
              <span className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-[10px] text-cyan-300 font-bold">
                {currentLangOption.flag} {currentLangOption.code}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Select the primary language used for Web Speech recognition capture and AI conversational reasoning.
            </p>

            {/* Language Selection Dropdown */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Select from Global Languages ({SUPPORTED_LANGUAGES.length}):</span>
                {searchFilter && (
                  <button
                    onClick={() => setSearchFilter('')}
                    className="text-cyan-400 hover:underline text-[10px]"
                  >
                    Clear filter
                  </button>
                )}
              </div>
              <select
                id="language-selection-dropdown"
                value={localSettings.language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="w-full bg-slate-900 border border-cyan-500/50 hover:border-cyan-400 rounded-lg p-2.5 text-cyan-100 font-sans text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400 cursor-pointer shadow-inner"
              >
                {filteredLanguages.map((lang) => (
                  <option key={lang.code} value={lang.code} className="bg-slate-900 text-slate-200 py-1 font-mono">
                    {lang.flag} {lang.name} — {lang.nativeName} ({lang.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Quick-Switch Popular Languages */}
            <div className="space-y-1.5 pt-1">
              <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                Quick Shortcuts:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {POPULAR_LANGUAGE_CODES.map((code) => {
                  const opt = getLanguageOption(code);
                  const isSelected = localSettings.language === code;
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleLanguageChange(code)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-all flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-cyan-500/25 border border-cyan-400 text-cyan-200 font-bold shadow-sm'
                          : 'bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <span>{opt.flag}</span>
                      <span>{opt.nativeName}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Status / Feedback Card for Selected Language */}
            <div className="mt-2 p-3 rounded-lg bg-cyan-950/30 border border-cyan-900/60 space-y-1.5">
              <div className="flex items-center gap-1.5 text-cyan-300 font-bold text-[11px]">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Active Language Profile: {currentLangOption.name}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-slate-300 pt-1">
                <div className="bg-slate-950/60 p-2 rounded border border-slate-800/80">
                  <div className="text-slate-500 font-semibold flex items-center gap-1">
                    <Mic className="w-3 h-3 text-cyan-400" />
                    <span>SPEECH RECOGNITION LOCALE:</span>
                  </div>
                  <div className="font-bold text-cyan-300 mt-0.5">
                    <code>recognition.lang = '{currentLangOption.code}'</code>
                  </div>
                </div>
                <div className="bg-slate-950/60 p-2 rounded border border-slate-800/80">
                  <div className="text-slate-500 font-semibold flex items-center gap-1">
                    <MessageSquare className="w-3 h-3 text-purple-400" />
                    <span>AI INTERACTION MODE:</span>
                  </div>
                  <div className="text-purple-300 mt-0.5 truncate" title={currentLangOption.geminiPromptDesc}>
                    {currentLangOption.geminiPromptDesc}
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-slate-400 italic pt-1 border-t border-cyan-950 flex items-center gap-1">
                <span className="text-cyan-400 font-semibold not-italic">Sample Greeting:</span>
                <span>"{currentLangOption.samplePhrase}"</span>
              </div>
            </div>
          </div>

          {/* Voice Synthesis (TTS) Toggle */}
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

          {/* Synthesizer Voice Selection */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-hud font-semibold text-slate-200 block">Synthesizer Voice Profile</label>
              {matchingVoices.length > 0 && (
                <span className="text-[10px] text-cyan-400 font-mono">
                  {matchingVoices.length} native voice(s) found
                </span>
              )}
            </div>
            <select
              value={localSettings.voiceURI}
              onChange={(e) => setLocalSettings({ ...localSettings, voiceURI: e.target.value })}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-cyan-200 focus:outline-none focus:border-cyan-400 text-xs"
            >
              <option value="">Default System Voice (Auto)</option>
              {availableVoices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang}) {v.lang.toLowerCase().startsWith(localSettings.language.split('-')[0].toLowerCase()) ? '★ MATCH' : ''}
                </option>
              ))}
            </select>
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
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
            <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block"></span>
            <span>Target Locale: <strong>{localSettings.language}</strong></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono transition-colors flex items-center gap-1.5 shadow glow-cyan-sm cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Apply Protocol</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

