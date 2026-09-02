import React, { useState, useEffect, useRef, useCallback } from 'react';
import { HUDHeader } from './components/HUDHeader';
import { JarvisOrb } from './components/JarvisOrb';
import { ChatTerminal } from './components/ChatTerminal';
import { AppDock } from './components/AppDock';
import { NotepadModal } from './components/NotepadModal';
import { CalculatorModal } from './components/CalculatorModal';
import { PaintModal } from './components/PaintModal';
import { BrowserModal } from './components/BrowserModal';
import { ScreenshotModal } from './components/ScreenshotModal';
import { MemoryModal } from './components/MemoryModal';
import { SettingsModal } from './components/SettingsModal';
import { BlueprintRoadmapModal } from './components/BlueprintRoadmapModal';
import { TelegramGatewayModal } from './components/TelegramGatewayModal';
import { OracleCloudModal } from './components/OracleCloudModal';
import { FreelancePipelineModal } from './components/FreelancePipelineModal';
import { SocialMediaModal } from './components/SocialMediaModal';
import { ProactiveRoutinesModal } from './components/ProactiveRoutinesModal';
import { SecurityMatrixModal } from './components/SecurityMatrixModal';
import { AutonomousToolsModal } from './components/AutonomousToolsModal';
import { PermissionGateway } from './components/PermissionGateway';
import { MobilePersonalStatusModal } from './components/MobilePersonalStatusModal';
import { PublicInfoFooter } from './components/PublicInfoFooter';
import {
  ChatMessage,
  MemoryStore,
  VoiceSettings,
  ActiveAppWindow,
  IntentCategory,
} from './types';
import {
  loadLocalChatHistory,
  saveLocalChatHistory,
  clearLocalChatHistory,
  loadLocalMemory,
  saveLocalMemory,
  loadLocalVoiceSettings,
  saveLocalVoiceSettings,
  queuePendingSync,
  getPendingSyncQueue,
  clearPendingSyncQueue,
} from './utils/offlineStorage';
import { processOfflineCommand } from './utils/localJarvisEngine';
import { Mic, Volume2, ShieldAlert, Sparkles, Terminal, Smartphone, Cloud, Briefcase, Share2, Sunrise, Lock, Wifi, WifiOff } from 'lucide-react';

export default function App() {
  // State with offline-first localStorage hydration
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadLocalChatHistory());
  const [memory, setMemory] = useState<MemoryStore>(() => loadLocalMemory());

  const [activeApp, setActiveApp] = useState<ActiveAppWindow>(null);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [volumeLevel, setVolumeLevel] = useState<number>(0);
  const [statusText, setStatusText] = useState<string>('SYSTEM READY • OFFLINE-FIRST STORAGE ACTIVE');
  const [geminiConnected, setGeminiConnected] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [notepadInitialContent, setNotepadInitialContent] = useState<string>('');
  const [browserSearchQuery, setBrowserSearchQuery] = useState<string>('');

  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(() => {
    const saved = loadLocalVoiceSettings();
    return (
      saved || {
        autoSpeak: true,
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
        voiceURI: '',
        language: 'en-US',
        wakeWordEnabled: false,
        wakeWord: 'jarvis',
      }
    );
  });

  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);

  // Audio Context & Recognition References
  const recognitionRef = useRef<any>(null);

  // Synchronize state changes to localStorage
  useEffect(() => {
    saveLocalChatHistory(messages);
  }, [messages]);

  useEffect(() => {
    saveLocalMemory(memory);
  }, [memory]);

  useEffect(() => {
    saveLocalVoiceSettings(voiceSettings);
  }, [voiceSettings]);

  // Online / Offline Detection & Sync Queue Processor
  const flushPendingSyncQueue = useCallback(async () => {
    const queue = getPendingSyncQueue();
    if (queue.length === 0) return;

    console.log(`[OfflineStorage] Flushing ${queue.length} pending updates to server...`);
    try {
      // Send current complete local memory to keep server in sync
      const currentMem = loadLocalMemory();
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentMem),
      });
      if (res.ok) {
        clearPendingSyncQueue();
        console.log('[OfflineStorage] Pending sync queue flushed successfully.');
      }
    } catch (err) {
      console.warn('[OfflineStorage] Retry flush failed, queued for next reconnect:', err);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setStatusText('BACKEND RECONNECTED • SYNCING MEMORY');
      flushPendingSyncQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setStatusText('OFFLINE MODE ACTIVE • LOCAL PERSISTENCE RUNNING');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [flushPendingSyncQueue]);

  // Initialize Voices
  useEffect(() => {
    const updateVoices = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        setAvailableVoices(voices);
      }
    };
    updateVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  // Fetch initial memory and health from server, merging with local storage
  useEffect(() => {
    fetch('/api/memory')
      .then((res) => res.json())
      .then((serverData) => {
        setMemory((prevLocal) => {
          // Merge server data with any existing local memory
          const merged: MemoryStore = {
            ...prevLocal,
            ...serverData,
            name: serverData.name || prevLocal.name || '',
            notes: (serverData.notes && serverData.notes.length > 0) ? serverData.notes : prevLocal.notes,
            customKeyValues: {
              ...prevLocal.customKeyValues,
              ...(serverData.customKeyValues || {}),
            },
            stats: {
              totalCommands: Math.max(prevLocal.stats?.totalCommands || 0, serverData.stats?.totalCommands || 0),
              actionsExecuted: Math.max(prevLocal.stats?.actionsExecuted || 0, serverData.stats?.actionsExecuted || 0),
              lastActive: serverData.stats?.lastActive || prevLocal.stats?.lastActive || new Date().toISOString(),
            },
          };
          saveLocalMemory(merged);
          return merged;
        });
        // Flush any offline queued mutations
        flushPendingSyncQueue();
      })
      .catch((err) => {
        console.warn('[OfflineStorage] Server fetch failed, running seamlessly from local offline memory:', err);
      });

    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.geminiEnabled) setGeminiConnected(true);
      })
      .catch(() => {
        setGeminiConnected(false);
      });
  }, [flushPendingSyncQueue]);

  // Speak Text Function
  const speakText = useCallback(
    (text: string) => {
      if (!voiceSettings.autoSpeak || typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return;
      }
      try {
        window.speechSynthesis.cancel();
        // Strip markdown formatting symbols for clean speech
        const cleanText = text.replace(/[*_`#]/g, '');
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = voiceSettings.rate;
        utterance.pitch = voiceSettings.pitch;
        utterance.volume = voiceSettings.volume;
        utterance.lang = voiceSettings.language;

        if (voiceSettings.voiceURI) {
          const selected = availableVoices.find((v) => v.voiceURI === voiceSettings.voiceURI);
          if (selected) utterance.voice = selected;
        } else {
          // Find matching native voice for the selected language if available
          const langPrefix = voiceSettings.language.split('-')[0].toLowerCase();
          const matching = availableVoices.find(
            (v) => v.lang.toLowerCase() === voiceSettings.language.toLowerCase() || v.lang.split('-')[0].toLowerCase() === langPrefix
          );
          if (matching) utterance.voice = matching;
        }

        utterance.onstart = () => {
          setIsSpeaking(true);
          setStatusText(`JARVIS SPEAKING: "${cleanText.slice(0, 35)}..."`);
        };

        utterance.onend = () => {
          setIsSpeaking(false);
          setStatusText('SYSTEM READY • AWAITING COMMAND');
        };

        utterance.onerror = () => {
          setIsSpeaking(false);
          setStatusText('SYSTEM READY');
        };

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('Speech synthesis failed:', err);
        setIsSpeaking(false);
      }
    },
    [voiceSettings, availableVoices]
  );

  // Execute Local System Action
  const handleExecuteAction = useCallback(
    (intent: IntentCategory, payload?: any) => {
      switch (intent) {
        case 'check_project':
          setActiveApp('blueprint');
          break;
        case 'create_social_post':
          setActiveApp('social');
          break;
        case 'generate_quotation':
          setActiveApp('freelance');
          break;
        case 'schedule_morning_report':
          setActiveApp('routines');
          break;
        case 'morning_briefing':
        case 'mobile_personal_status':
          setActiveApp('mobile_personal_status');
          break;
        case 'cloud_telemetry':
          setActiveApp('oracle');
          break;
        case 'security_audit':
          setActiveApp('security');
          break;
        case 'tools_audit':
        case 'git_status_tool':
        case 'github_repos_tool':
        case 'list_files_tool':
        case 'web_research_tool':
          setActiveApp('autonomous_tools');
          break;
        case 'pending_approvals':
          setActiveApp('permission_gateway');
          break;
        case 'open_notepad':
        case 'create_file':
          if (payload?.content) {
            setNotepadInitialContent(payload.content);
          }
          setActiveApp('notepad');
          break;
        case 'open_calculator':
          setActiveApp('calculator');
          break;
        case 'open_paint':
          setActiveApp('paint');
          break;
        case 'open_chrome':
        case 'open_google':
        case 'open_youtube':
        case 'open_gmail':
        case 'open_chatgpt':
          setBrowserSearchQuery('');
          setActiveApp('browser');
          break;
        case 'google_search':
          setBrowserSearchQuery(payload?.query || '');
          setActiveApp('browser');
          break;
        case 'take_screenshot':
          setActiveApp('screenshots');
          break;
        case 'volume_up':
          setVoiceSettings((prev) => ({ ...prev, volume: Math.min(1.0, prev.volume + 0.2) }));
          break;
        case 'volume_down':
          setVoiceSettings((prev) => ({ ...prev, volume: Math.max(0.1, prev.volume - 0.2) }));
          break;
        default:
          break;
      }
    },
    []
  );

  // Send Command to Backend with Offline Fallback
  const handleSendCommand = useCallback(
    async (text: string) => {
      if (!text.trim() || isProcessing) return;

      const userMsg: ChatMessage = {
        id: String(Date.now()),
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => {
        const next = [...prev, userMsg];
        saveLocalChatHistory(next);
        return next;
      });

      setIsProcessing(true);
      setStatusText(`ANALYZING COMMAND: "${text}"`);

      // Attempt backend API with a 6-second timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history: messages.slice(-6),
            language: voiceSettings.language,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          throw new Error(`Server returned status ${res.status}`);
        }

        const data = await res.json();
        const jarvisMsg: ChatMessage = {
          id: String(Date.now() + 1),
          role: 'jarvis',
          content: data.reply || 'Command acknowledged, Sir.',
          timestamp: new Date().toISOString(),
          intent: data.intent,
          actionExecuted: data.actionExecuted,
          actionDetail: data.actionDetail,
        };

        setMessages((prev) => {
          const next = [...prev, jarvisMsg];
          saveLocalChatHistory(next);
          return next;
        });

        if (data.memory) {
          setMemory((prev) => {
            const merged = { ...prev, ...data.memory };
            saveLocalMemory(merged);
            return merged;
          });
        }

        if (data.actionExecuted && data.intent) {
          handleExecuteAction(data.intent, data.actionDetail?.payload);
        }

        // Voice Response
        speakText(data.reply);
        setStatusText('SYSTEM READY • AWAITING VOICE/TEXT INPUT');
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.warn('[Hermes Jarvis] Backend unreachable or timed out, executing offline local intelligence engine:', err.message);

        // Process seamlessly with Local Offline Intent & Fallback Engine
        const localResult = processOfflineCommand(text, memory, voiceSettings.language);

        const offlineJarvisMsg: ChatMessage = {
          id: String(Date.now() + 1),
          role: 'jarvis',
          content: localResult.reply,
          timestamp: new Date().toISOString(),
          intent: localResult.intent,
          actionExecuted: localResult.actionExecuted,
          actionDetail: localResult.actionDetail,
        };

        setMessages((prev) => {
          const next = [...prev, offlineJarvisMsg];
          saveLocalChatHistory(next);
          return next;
        });

        if (localResult.updatedMemory) {
          setMemory(localResult.updatedMemory);
          saveLocalMemory(localResult.updatedMemory);
          queuePendingSync('memory_sync', localResult.updatedMemory);
        }

        if (localResult.actionExecuted && localResult.intent) {
          handleExecuteAction(localResult.intent, localResult.actionDetail?.payload);
        }

        speakText(localResult.reply);
        setStatusText('LOCAL OFFLINE ENGINE EXECUTED • PERSISTED TO LOCAL STORAGE');
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, messages, memory, voiceSettings.language, speakText, handleExecuteAction]
  );

  // Setup Web Speech Recognition
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported by your browser. Please use Chrome/Edge or type your command.');
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = voiceSettings.language;

      recognition.onstart = () => {
        setIsListening(true);
        setStatusText(`LISTENING (${voiceSettings.language})... SPEAK NOW`);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setIsListening(false);
        if (transcript) {
          handleSendCommand(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        setStatusText('VOICE CAPTURE TIMED OUT • CLICK TO TRY AGAIN');
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();

      // Simulated visualizer pulse
      const simPulse = setInterval(() => {
        setVolumeLevel(Math.floor(20 + Math.random() * 60));
      }, 100);

      setTimeout(() => clearInterval(simPulse), 5000);
    } catch (err) {
      console.warn('Recognition start failed:', err);
      setIsListening(false);
    }
  }, [voiceSettings.language, handleSendCommand]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
    setStatusText('VOICE CAPTURE STOPPED');
  }, []);

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Memory Handlers with immediate LocalStorage persistence and background sync
  const handleUpdateName = async (name: string) => {
    const updatedMemory = { ...memory, name };
    setMemory(updatedMemory);
    saveLocalMemory(updatedMemory);

    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.memory) {
        setMemory(data.memory);
        saveLocalMemory(data.memory);
      }
    } catch (err) {
      console.warn('[OfflineStorage] Update name offline, saved to localStorage and queued for sync:', err);
      queuePendingSync('name', { name });
    }
  };

  const handleAddCustomKey = async (key: string, value: string) => {
    const updatedMemory = {
      ...memory,
      customKeyValues: {
        ...memory.customKeyValues,
        [key]: value,
      },
    };
    setMemory(updatedMemory);
    saveLocalMemory(updatedMemory);

    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customKeyValues: { [key]: value } }),
      });
      const data = await res.json();
      if (data.memory) {
        setMemory(data.memory);
        saveLocalMemory(data.memory);
      }
    } catch (err) {
      console.warn('[OfflineStorage] Add custom key offline, saved to localStorage and queued for sync:', err);
      queuePendingSync('custom_key', { [key]: value });
    }
  };

  const handleDeleteNote = async (id: string) => {
    const updatedNotes = memory.notes.filter((n) => n.id !== id);
    const updatedMemory = { ...memory, notes: updatedNotes };
    setMemory(updatedMemory);
    saveLocalMemory(updatedMemory);

    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: updatedNotes }),
      });
      const data = await res.json();
      if (data.memory) {
        setMemory(data.memory);
        saveLocalMemory(data.memory);
      }
    } catch (err) {
      console.warn('[OfflineStorage] Delete note offline, saved to localStorage and queued for sync:', err);
      queuePendingSync('note_delete', { id });
    }
  };

  const handleSaveNotepadNote = async (title: string, content: string) => {
    const newNote = {
      id: String(Date.now()),
      title,
      content,
      createdAt: new Date().toISOString(),
    };
    const updatedNotes = [newNote, ...(memory.notes || [])];
    const updatedMemory = { ...memory, notes: updatedNotes };
    setMemory(updatedMemory);
    saveLocalMemory(updatedMemory);

    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: updatedNotes }),
      });
      const data = await res.json();
      if (data.memory) {
        setMemory(data.memory);
        saveLocalMemory(data.memory);
      }
    } catch (err) {
      console.warn('[OfflineStorage] Save note offline, saved to localStorage and queued for sync:', err);
      queuePendingSync('note_add', newNote);
    }
  };

  const handleClearChatHistory = () => {
    clearLocalChatHistory();
    setMessages(loadLocalChatHistory());
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* HUD Header */}
      <HUDHeader
        userName={memory.name}
        geminiConnected={geminiConnected}
        isOnline={isOnline}
        language={voiceSettings.language}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenMemory={() => setActiveApp('memory')}
        onOpenBlueprint={() => setActiveApp('blueprint')}
        onOpenTelegram={() => setActiveApp('telegram')}
        onOpenOracle={() => setActiveApp('oracle')}
        onOpenFreelance={() => setActiveApp('freelance')}
        onOpenSocial={() => setActiveApp('social')}
        onOpenRoutines={() => setActiveApp('routines')}
        onOpenSecurity={() => setActiveApp('security')}
        onOpenAutonomousTools={() => setActiveApp('autonomous_tools')}
        onOpenPermissionGateway={() => setActiveApp('permission_gateway')}
        onOpenMobileStatus={() => setActiveApp('mobile_personal_status')}
      />

      {/* Main Sci-Fi Dashboard */}
      <main className="max-w-7xl mx-auto w-full p-4 lg:p-6 flex-1 flex flex-col lg:flex-row items-stretch gap-6">
        {/* Left Column: Jarvis Voice Core Reactor & Audio Controls */}
        <div className="w-full lg:w-5/12 flex flex-col items-center justify-center p-6 rounded-3xl bg-slate-950/60 border border-cyan-900/30 backdrop-blur-md relative overflow-hidden shadow-2xl">
          {/* Subtle grid background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#08334415_1px,transparent_1px),linear-gradient(to_bottom,#08334415_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

          <JarvisOrb
            isListening={isListening}
            isSpeaking={isSpeaking}
            isProcessing={isProcessing}
            volumeLevel={volumeLevel}
            onToggleListen={toggleListening}
            statusText={statusText}
          />

          {/* Quick Voice Shortcuts */}
          <div className="w-full max-w-sm mt-4 pt-4 border-t border-cyan-950 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>HERMES BLUEPRINT MACROS</span>
              <span className="text-cyan-400">CLICK TO EXECUTE</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
              <button
                onClick={() => handleSendCommand('JARVIS, project check करो')}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-300 text-left truncate transition-colors"
              >
                "Project check करो"
              </button>
              <button
                onClick={() => handleSendCommand('JARVIS, आज की LinkedIn post बनाओ')}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-purple-300 text-left truncate transition-colors"
              >
                "LinkedIn post बनाओ"
              </button>
              <button
                onClick={() => handleSendCommand('JARVIS, client inquiry के लिए quotation तैयार करो')}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-amber-300 text-left truncate transition-colors"
              >
                "Quotation तैयार करो"
              </button>
              <button
                onClick={() => handleSendCommand('JARVIS, कल सुबह 9 बजे मुझे report देना')}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-pink-300 text-left truncate transition-colors"
              >
                "Morning briefing"
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live Conversation Terminal & Execution Stream */}
        <div className="w-full lg:w-7/12 flex flex-col">
          <ChatTerminal
            messages={messages}
            onSendMessage={handleSendCommand}
            isProcessing={isProcessing}
            onSpeakAgain={speakText}
            onClearHistory={handleClearChatHistory}
          />
        </div>
      </main>

      {/* Interactive Tool Dock */}
      <AppDock
        activeApp={activeApp}
        onSelectApp={(app) => setActiveApp(app)}
        onQuickCommand={(cmd) => handleSendCommand(cmd)}
      />

      {/* Public Legal Compliance & Application Presentation Footer */}
      <PublicInfoFooter />

      {/* Blueprint & Specialized Modals */}
      <BlueprintRoadmapModal
        isOpen={activeApp === 'blueprint'}
        onClose={() => setActiveApp(null)}
        onRunCommand={handleSendCommand}
      />

      <TelegramGatewayModal
        isOpen={activeApp === 'telegram' || activeApp === 'mobile_remote'}
        onClose={() => setActiveApp(null)}
        onSpeak={speakText}
      />

      <OracleCloudModal
        isOpen={activeApp === 'oracle'}
        onClose={() => setActiveApp(null)}
      />

      <FreelancePipelineModal
        isOpen={activeApp === 'freelance'}
        onClose={() => setActiveApp(null)}
      />

      <SocialMediaModal
        isOpen={activeApp === 'social'}
        onClose={() => setActiveApp(null)}
        onSpeak={speakText}
      />

      <ProactiveRoutinesModal
        isOpen={activeApp === 'routines'}
        onClose={() => setActiveApp(null)}
        onSpeak={speakText}
      />

      <SecurityMatrixModal
        isOpen={activeApp === 'security'}
        onClose={() => setActiveApp(null)}
      />

      <AutonomousToolsModal
        isOpen={activeApp === 'autonomous_tools'}
        onClose={() => setActiveApp(null)}
      />

      <PermissionGateway
        isOpen={activeApp === 'permission_gateway'}
        onClose={() => setActiveApp(null)}
        onSpeak={speakText}
      />

      <MobilePersonalStatusModal
        isOpen={activeApp === 'mobile_personal_status'}
        onClose={() => setActiveApp(null)}
        onSpeak={speakText}
        onOpenPermissionGateway={() => setActiveApp('permission_gateway')}
        userName={memory.name || 'Sir'}
      />

      {/* Tool Modals */}
      <NotepadModal
        isOpen={activeApp === 'notepad'}
        onClose={() => setActiveApp(null)}
        initialContent={notepadInitialContent}
        onSaveNote={handleSaveNotepadNote}
      />

      <CalculatorModal
        isOpen={activeApp === 'calculator'}
        onClose={() => setActiveApp(null)}
      />

      <PaintModal
        isOpen={activeApp === 'paint'}
        onClose={() => setActiveApp(null)}
      />

      <BrowserModal
        isOpen={activeApp === 'browser'}
        onClose={() => setActiveApp(null)}
        initialQuery={browserSearchQuery}
      />

      <ScreenshotModal
        isOpen={activeApp === 'screenshots'}
        onClose={() => setActiveApp(null)}
      />

      <MemoryModal
        isOpen={activeApp === 'memory'}
        onClose={() => setActiveApp(null)}
        memory={memory}
        onUpdateName={handleUpdateName}
        onAddCustomKey={handleAddCustomKey}
        onDeleteNote={handleDeleteNote}
      />

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={voiceSettings}
        onUpdateSettings={(s) => setVoiceSettings(s)}
        availableVoices={availableVoices}
      />
    </div>
  );
}
