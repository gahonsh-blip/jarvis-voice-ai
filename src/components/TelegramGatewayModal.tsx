import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Smartphone,
  CheckCircle2,
  Bot,
  User,
  ShieldCheck,
  Zap,
  Volume2,
  Mic,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { TelegramMessage, TelegramBotConfig } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSpeak: (text: string) => void;
}

export const TelegramGatewayModal: React.FC<Props> = ({ isOpen, onClose, onSpeak }) => {
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [config, setConfig] = useState<TelegramBotConfig>({
    botName: 'Hermes JARVIS Mobile Controller',
    botUsername: '@HermesJarvisAssistantBot',
    botTokenMasked: '7192837492:AAH*********_MaskedInVault',
    webhookStatus: 'connected',
    allowedUserIds: ['@Sir_Owner (Admin ID: 849201948)'],
    humanApprovalRequired: true,
    notificationsEnabled: true,
  });
  const [inputText, setInputText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchMessages();
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchMessages = async () => {
    try {
      const res = await fetch('/api/telegram/messages');
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
      if (data.config) setConfig(data.config);
    } catch (err) {
      console.warn('Failed to fetch telegram messages:', err);
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || isSending) return;

    setIsSending(true);
    setInputText('');

    try {
      const res = await fetch('/api/telegram/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages((prev) => [...prev, data.userMessage, data.botMessage]);
        if (data.botMessage?.text) {
          // Clean markdown before speaking
          const cleanSpeech = data.botMessage.text.replace(/[*_`#]/g, '');
          onSpeak(cleanSpeech);
        }
      }
    } catch (err) {
      console.warn('Telegram send failed:', err);
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in font-sans">
      <div className="bg-slate-900 border border-blue-800/50 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-950 border border-blue-500/30 text-blue-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">Android Telegram Mobile Gateway</h2>
                <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Webhook Active
                </span>
              </div>
              <p className="text-xs text-slate-400">
                100% remote Android phone control • No laptop needed • Direct Telegram Bot integration
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Telegram Config Bar */}
        <div className="px-6 py-2.5 bg-slate-950/50 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-300">
          <div className="flex items-center gap-4">
            <span className="text-slate-400">Bot: <span className="text-blue-400 font-bold">{config.botUsername}</span></span>
            <span className="text-slate-400">Auth: <span className="text-slate-200">Owner Whitelist (ID 849201948)</span></span>
          </div>
          <div className="flex items-center gap-2 text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Human Approval Mode: ON</span>
          </div>
        </div>

        {/* Telegram Chat Simulation Interface */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 bg-slate-950/30">
          {/* Main Mobile Screen Mockup */}
          <div className="flex-1 flex flex-col border-r border-slate-800">
            {/* Chat Messages */}
            <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
              {messages.map((msg) => {
                const isUser = msg.sender === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 max-w-[85%] ${
                      isUser ? 'self-end flex-row-reverse' : 'self-start'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                        isUser ? 'bg-cyan-600 text-slate-950' : 'bg-blue-600 text-slate-100'
                      }`}
                    >
                      {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>

                    <div
                      className={`p-3 rounded-2xl text-xs leading-relaxed ${
                        isUser
                          ? 'bg-cyan-950/80 border border-cyan-700/50 text-cyan-100 rounded-tr-none'
                          : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none shadow-md'
                      }`}
                    >
                      <pre className="whitespace-pre-wrap font-sans text-xs">{msg.text}</pre>

                      {/* Interactive Telegram Approval Buttons if pending */}
                      {msg.actionData?.status === 'pending_approval' && (
                        <div className="mt-3 pt-2 border-t border-slate-700/50 flex gap-2">
                          <button
                            onClick={() => handleSendMessage('YES, publish this post.')}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-lg text-[11px] transition-colors"
                          >
                            ✅ YES (Publish)
                          </button>
                          <button
                            onClick={() => handleSendMessage('NO, keep as draft.')}
                            className="px-3 py-1 bg-rose-900/60 hover:bg-rose-800 text-rose-200 rounded-lg text-[11px] transition-colors"
                          >
                            ❌ REJECT
                          </button>
                        </div>
                      )}

                      <span className="block text-[10px] text-slate-500 mt-1.5 text-right font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input Bar */}
            <div className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Type command as sent from Telegram mobile (e.g. 'JARVIS, project check करो')..."
                className="flex-1 px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={isSending || !inputText.trim()}
                className="p-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-slate-100 rounded-xl transition-colors font-bold"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Mobile Commands Sidebar */}
          <div className="w-full md:w-72 p-4 bg-slate-950/60 flex flex-col gap-3 font-mono text-xs overflow-y-auto">
            <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px]">
              MOBILE QUICK COMMANDS
            </span>

            <button
              onClick={() => handleSendMessage('JARVIS, project check करो')}
              className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left text-cyan-300 transition-colors flex items-center justify-between"
            >
              <span>"JARVIS, project check करो"</span>
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
            </button>

            <button
              onClick={() => handleSendMessage('JARVIS, आज की LinkedIn post बनाओ')}
              className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left text-blue-300 transition-colors flex items-center justify-between"
            >
              <span>"आज की LinkedIn post बनाओ"</span>
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            </button>

            <button
              onClick={() => handleSendMessage('JARVIS, client inquiry के लिए quotation तैयार करो')}
              className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left text-emerald-300 transition-colors flex items-center justify-between"
            >
              <span>"Quotation तैयार करो"</span>
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
            </button>

            <button
              onClick={() => handleSendMessage('JARVIS, cloud server status बताओ')}
              className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left text-amber-300 transition-colors flex items-center justify-between"
            >
              <span>"Cloud server status बताओ"</span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </button>

            <button
              onClick={() => handleSendMessage('JARVIS, कल सुबह 9 बजे मुझे report देना')}
              className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left text-purple-300 transition-colors flex items-center justify-between"
            >
              <span>"सुबह 9 बजे report देना"</span>
              <Zap className="w-3.5 h-3.5 text-purple-400" />
            </button>

            <div className="mt-auto p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 leading-relaxed font-sans">
              💡 <span className="font-semibold text-slate-200">How it works:</span> When deployed on Oracle Cloud, your Telegram bot webhooks instantly forward messages to Hermes JARVIS for 24/7 background execution.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
