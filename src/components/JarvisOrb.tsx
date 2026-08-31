import React from 'react';
import { motion } from 'motion/react';
import { Mic, MicOff, Volume2, Sparkles, Cpu } from 'lucide-react';

interface JarvisOrbProps {
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  volumeLevel: number;
  onToggleListen: () => void;
  statusText: string;
}

export const JarvisOrb: React.FC<JarvisOrbProps> = ({
  isListening,
  isSpeaking,
  isProcessing,
  volumeLevel,
  onToggleListen,
  statusText,
}) => {
  // Determine state color scheme
  let stateColor = 'cyan';
  let pulseSpeed = 4;
  let ringScale = 1 + (volumeLevel / 100) * 0.4;

  if (isSpeaking) {
    stateColor = 'blue';
    pulseSpeed = 1.5;
  } else if (isProcessing) {
    stateColor = 'amber';
    pulseSpeed = 1;
  } else if (isListening) {
    stateColor = 'emerald';
    pulseSpeed = 2;
  }

  return (
    <div className="relative flex flex-col items-center justify-center p-6 select-none">
      {/* Outer Rotating HUD Rings */}
      <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
        
        {/* Ring 1 - Outer Segmented Arc */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: isListening ? 10 : 30, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 rounded-full border border-dashed border-cyan-500/30"
          style={{ transform: `scale(${ringScale})` }}
        />

        {/* Ring 2 - Reverse Tech Ring */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 24, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-3 rounded-full border border-cyan-400/20 border-t-cyan-400 border-r-transparent"
        />

        {/* Ring 3 - Glowing Audio Ripple */}
        <motion.div
          animate={{
            scale: isListening || isSpeaking ? [1, 1.15, 1] : [1, 1.05, 1],
            opacity: isListening || isSpeaking ? [0.4, 0.9, 0.4] : [0.2, 0.4, 0.2],
          }}
          transition={{ duration: pulseSpeed, repeat: Infinity, ease: 'easeInOut' }}
          className={`absolute inset-8 rounded-full blur-md ${
            isSpeaking
              ? 'bg-cyan-400/30'
              : isProcessing
              ? 'bg-amber-500/30'
              : isListening
              ? 'bg-emerald-500/30'
              : 'bg-cyan-500/20'
          }`}
        />

        {/* Ring 4 - Internal Gyroscope Ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-10 rounded-full border-2 border-dashed border-cyan-300/40 border-b-transparent border-l-transparent"
        />

        {/* Core Interactive Reactor Center */}
        <motion.button
          id="jarvis-core-orb-button"
          onClick={onToggleListen}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`relative z-10 w-36 h-36 sm:w-40 sm:h-40 rounded-full flex flex-col items-center justify-center cursor-pointer transition-all duration-500 shadow-2xl ${
            isSpeaking
              ? 'bg-gradient-to-br from-cyan-900/90 via-slate-900 to-blue-950 border-2 border-cyan-400 shadow-cyan-500/50'
              : isProcessing
              ? 'bg-gradient-to-br from-amber-950/90 via-slate-900 to-amber-900 border-2 border-amber-400 shadow-amber-500/50'
              : isListening
              ? 'bg-gradient-to-br from-emerald-950/90 via-slate-900 to-teal-950 border-2 border-emerald-400 shadow-emerald-500/50 ring-4 ring-emerald-500/20'
              : 'bg-gradient-to-br from-cyan-950/80 via-slate-900 to-slate-950 border-2 border-cyan-500/60 shadow-cyan-500/30 hover:border-cyan-400'
          }`}
        >
          {/* Inner holographic grid line */}
          <div className="absolute inset-2 rounded-full border border-cyan-400/20 pointer-events-none" />

          {/* Center Icon */}
          <div className="relative z-10 flex flex-col items-center justify-center">
            {isSpeaking ? (
              <Volume2 className="w-10 h-10 text-cyan-300 animate-pulse" />
            ) : isProcessing ? (
              <Sparkles className="w-10 h-10 text-amber-300 animate-spin" />
            ) : isListening ? (
              <Mic className="w-10 h-10 text-emerald-300 animate-bounce" />
            ) : (
              <MicOff className="w-10 h-10 text-slate-400 group-hover:text-cyan-300" />
            )}

            <span className="mt-2 text-xs font-hud tracking-widest uppercase font-semibold text-cyan-200">
              {isSpeaking ? 'JARVIS SPEAKING' : isProcessing ? 'THINKING' : isListening ? 'LISTENING' : 'CLICK TO TALK'}
            </span>
          </div>

          {/* Core glow */}
          <div className="absolute inset-0 rounded-full bg-cyan-400/10 blur-sm pointer-events-none" />
        </motion.button>
      </div>

      {/* Dynamic Status / Subtitle Text */}
      <div className="mt-4 text-center max-w-md">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/80 border border-cyan-500/30 backdrop-blur-md">
          <span
            className={`w-2 h-2 rounded-full ${
              isSpeaking
                ? 'bg-cyan-400 animate-ping'
                : isProcessing
                ? 'bg-amber-400 animate-pulse'
                : isListening
                ? 'bg-emerald-400 animate-ping'
                : 'bg-cyan-500'
            }`}
          />
          <p className="text-xs font-mono tracking-wider text-cyan-300 font-medium">
            {statusText}
          </p>
        </div>
      </div>
    </div>
  );
};
