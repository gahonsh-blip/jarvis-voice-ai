import React, { useState, useRef, useEffect } from 'react';
import { Send, Terminal as TerminalIcon, Sparkles, CheckCircle2, ChevronRight, Zap, Volume2 } from 'lucide-react';
import { ChatMessage } from '../types';

interface ChatTerminalProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isProcessing: boolean;
  onSpeakAgain: (text: string) => void;
}

export const ChatTerminal: React.FC<ChatTerminalProps> = ({
  messages,
  onSendMessage,
  isProcessing,
  onSpeakAgain,
}) => {
  const [inputVal, setInputVal] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || isProcessing) return;
    onSendMessage(inputVal.trim());
    setInputVal('');
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950/70 border border-cyan-900/40 rounded-2xl overflow-hidden backdrop-blur-md shadow-2xl">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/90 border-b border-cyan-900/50">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-hud font-bold text-cyan-200 tracking-wider">
            JARVIS COMMAND STREAM & TRANSCRIPT
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
        </div>
      </div>

      {/* Message Feed */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3.5 font-mono text-xs max-h-[380px] lg:max-h-[460px] scrollbar-thin">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${
              m.role === 'user'
                ? 'items-end'
                : m.role === 'jarvis'
                ? 'items-start'
                : 'items-center'
            }`}
          >
            {/* Role Header */}
            <div className="flex items-center gap-1.5 mb-1 px-1 text-[10px] text-slate-400 font-hud">
              {m.role === 'user' ? (
                <>
                  <span className="text-amber-400 font-bold">YOU (VOICE/TEXT)</span>
                  <span>•</span>
                  <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </>
              ) : m.role === 'jarvis' ? (
                <>
                  <span className="text-cyan-400 font-bold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-cyan-300" />
                    JARVIS AI CORE
                  </span>
                  <span>•</span>
                  <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  {m.intent && m.intent !== 'chat' && (
                    <span className="px-1.5 py-0.2 rounded bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 text-[9px] uppercase">
                      INTENT: {m.intent}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-slate-500 uppercase tracking-widest text-[9px]">SYSTEM LOG</span>
              )}
            </div>

            {/* Bubble */}
            <div
              className={`relative max-w-[88%] sm:max-w-[80%] rounded-xl p-3 leading-relaxed ${
                m.role === 'user'
                  ? 'bg-gradient-to-r from-amber-950/40 to-slate-900 border border-amber-500/30 text-amber-100'
                  : m.role === 'jarvis'
                  ? 'bg-gradient-to-r from-slate-900 to-cyan-950/40 border border-cyan-500/30 text-cyan-100'
                  : 'bg-slate-950/80 border border-slate-800 text-slate-400 text-center w-full'
              }`}
            >
              <div className="whitespace-pre-wrap">{m.content}</div>

              {/* Action Banner */}
              {m.actionExecuted && m.actionDetail && (
                <div className="mt-2 pt-2 border-t border-cyan-500/20 flex items-center justify-between text-[11px] text-cyan-300">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Action: {m.actionDetail.title}</span>
                  </span>
                </div>
              )}

              {/* Speech Replay Button */}
              {m.role === 'jarvis' && (
                <button
                  onClick={() => onSpeakAgain(m.content)}
                  className="absolute right-2 top-2 p-1 text-slate-500 hover:text-cyan-300 transition-colors"
                  title="Speak again"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs p-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            <span>Jarvis neural engine is processing your command...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input Box */}
      <form onSubmit={handleSubmit} className="p-3 bg-slate-950 border-t border-cyan-900/40 flex items-center gap-2">
        <div className="flex items-center text-cyan-400 pl-1">
          <ChevronRight className="w-4 h-4 animate-pulse" />
        </div>
        <input
          id="jarvis-terminal-input"
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Type command or click orb above to speak..."
          className="flex-1 bg-slate-900/80 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-cyan-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
        />
        <button
          type="submit"
          disabled={!inputVal.trim() || isProcessing}
          className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 font-bold text-xs font-mono flex items-center gap-1.5 transition-all shadow glow-cyan-sm"
        >
          <span>EXECUTE</span>
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
