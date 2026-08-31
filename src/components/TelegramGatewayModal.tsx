import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Send,
  Smartphone,
  Bot,
  User,
  ShieldCheck,
  Zap,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Radio,
  CheckCircle2,
  AlertCircle,
  QrCode,
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
    botTokenMasked: 'Not Configured',
    isLiveTokenConfigured: false,
    isLiveConnected: false,
    mode: 'simulator',
    webhookStatus: 'waiting_token',
    telegramLink: 'https://t.me/BotFather',
    allowedUserIds: ['Owner (Auto-registers on /start)'],
    humanApprovalRequired: true,
    notificationsEnabled: true,
  });
  const [inputText, setInputText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isTestingLive, setIsTestingLive] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'live_chat' | 'connect_guide'>('live_chat');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchMessages();
      // Auto-poll every 3.5 seconds to sync live Telegram messages from phone
      const interval = setInterval(fetchMessages, 3500);
      return () => clearInterval(interval);
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

  const handleTestLiveConnection = async () => {
    setIsTestingLive(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/telegram/test-live', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          message: data.notificationSent
            ? '✅ Live Bot Verified! Ping notification sent to your Telegram app on mobile.'
            : `✅ Connected to ${data.bot?.username || 'Telegram'}. Send /start from your phone to register chat ID.`,
        });
        fetchMessages();
      } else {
        setTestResult({
          success: false,
          message: data.message || data.error || 'Failed to connect to Telegram API.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Connection test timed out.',
      });
    } finally {
      setIsTestingLive(false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in font-sans">
      <div className="bg-slate-900 border border-blue-800/50 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-950 border border-blue-500/40 text-blue-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">Live Telegram Mobile Controller</h2>
                {config.isLiveConnected ? (
                  <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1.5">
                    <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                    LIVE ONLINE
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-blue-950 text-blue-300 border border-blue-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    Interactive Gateway
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Control HERMES JARVIS from anywhere using your Android / iOS phone via Telegram
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs font-medium">
              <button
                onClick={() => setActiveTab('live_chat')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  activeTab === 'live_chat' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Live Controller
              </button>
              <button
                onClick={() => setActiveTab('connect_guide')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  activeTab === 'connect_guide' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Connect Your Bot
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Bar */}
        <div className="px-6 py-2.5 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-slate-300">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-slate-400">
              Bot Handle: <span className="text-blue-400 font-bold">{config.botUsername}</span>
            </span>
            <span className="text-slate-400">
              Mode:{' '}
              <span className={config.isLiveConnected ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                {config.isLiveConnected ? 'Real Telegram API (Long Polling)' : 'Web Gateway Mode'}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleTestLiveConnection}
              disabled={isTestingLive}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-[11px] flex items-center gap-1.5 border border-slate-700 transition-colors"
            >
              <RefreshCw className={`w-3 h-3 ${isTestingLive ? 'animate-spin text-blue-400' : ''}`} />
              <span>{isTestingLive ? 'Testing...' : 'Test Connection'}</span>
            </button>

            {config.telegramLink && (
              <a
                href={config.telegramLink}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 bg-blue-600/90 hover:bg-blue-500 text-white rounded-lg text-[11px] font-sans font-medium flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <span>Open in Telegram</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Test Result Toast Banner if any */}
        {testResult && (
          <div
            className={`px-6 py-2 text-xs flex items-center justify-between border-b ${
              testResult.success
                ? 'bg-emerald-950/60 border-emerald-800/50 text-emerald-200'
                : 'bg-amber-950/60 border-amber-800/50 text-amber-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-amber-400" />}
              <span>{testResult.message}</span>
            </div>
            <button onClick={() => setTestResult(null)} className="text-slate-400 hover:text-slate-100">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main Body */}
        {activeTab === 'live_chat' ? (
          <div className="flex-1 flex flex-col md:flex-row min-h-0 bg-slate-950/30">
            {/* Main Mobile Screen Mockup */}
            <div className="flex-1 flex flex-col border-r border-slate-800">
              {/* Chat Messages */}
              <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 min-h-[320px]">
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
                  placeholder="Type command (e.g. 'JARVIS, project check करो' or 'LinkedIn post बनाओ')..."
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
            <div className="w-full md:w-80 p-4 bg-slate-950/60 flex flex-col gap-3 font-mono text-xs overflow-y-auto">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px] flex items-center justify-between">
                <span>MOBILE QUICK CONTROLS</span>
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
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

              <div className="mt-auto p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-300 leading-relaxed font-sans space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-blue-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>24/7 Mobile Command</span>
                </div>
                <p className="text-slate-400">
                  Messages you send from your phone on Telegram execute autonomously on your Oracle Cloud VM and sync live back to this matrix.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Connect Guide Tab */
          <div className="flex-1 p-6 overflow-y-auto bg-slate-950/50 space-y-5 text-slate-300 text-xs leading-relaxed font-sans">
            <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-800/40 space-y-2">
              <h3 className="text-sm font-bold text-blue-200 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-400" />
                How to Connect Your Real Telegram Bot in 60 Seconds
              </h3>
              <p className="text-slate-300">
                You can create a free bot in Telegram and add its token to your Settings to enable 100% real mobile control from your phone anywhere in the world.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="w-6 h-6 rounded-full bg-blue-900 text-blue-200 font-bold flex items-center justify-center text-xs">
                  1
                </div>
                <h4 className="font-semibold text-slate-100 text-sm">Open @BotFather</h4>
                <p className="text-slate-400">
                  Open Telegram on your mobile phone, search for{' '}
                  <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-blue-400 underline font-bold">
                    @BotFather
                  </a>
                  , and send the command <code className="bg-slate-950 px-1 py-0.5 rounded text-cyan-300">/newbot</code>.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="w-6 h-6 rounded-full bg-blue-900 text-blue-200 font-bold flex items-center justify-center text-xs">
                  2
                </div>
                <h4 className="font-semibold text-slate-100 text-sm">Copy API Token</h4>
                <p className="text-slate-400">
                  BotFather will give you a token like <code className="bg-slate-950 px-1 py-0.5 rounded text-amber-300">719283749:AAH...</code>. Copy this token.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="w-6 h-6 rounded-full bg-blue-900 text-blue-200 font-bold flex items-center justify-center text-xs">
                  3
                </div>
                <h4 className="font-semibold text-slate-100 text-sm">Add to Environment</h4>
                <p className="text-slate-400">
                  Set <code className="bg-slate-950 px-1 py-0.5 rounded text-emerald-300">TELEGRAM_BOT_TOKEN</code> in your Settings / .env. HERMES JARVIS automatically connects via long-polling!
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2 font-mono text-[11px]">
              <div className="text-slate-400 font-bold">SAMPLE .env CONFIGURATION:</div>
              <div className="p-3 bg-slate-950 rounded-lg text-slate-300 border border-slate-800">
                TELEGRAM_BOT_TOKEN=7891234567:AAFxxxxxxxxxxxxxxxxxxxxxx<br />
                TELEGRAM_ADMIN_CHAT_ID=849201948
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

