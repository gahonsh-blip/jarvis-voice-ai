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
import { ActiveCallHUD } from './components/ActiveCallHUD';
import { TelephonyHubModal } from './components/TelephonyHubModal';
import { LocationServicesModal } from './components/LocationServicesModal';
import { DashboardMapSnippet } from './components/DashboardMapSnippet';
import { GeoCoordinates, LocationAddress } from './types/location';
import {
  loadCachedLocation,
  saveCachedLocation,
  reverseGeocodeCoordinates,
} from './utils/locationService';
import { telephonyAudio } from './utils/telephonyAudio';
import {
  evaluateSpamScore,
  generateCallSummary,
  processCallTurnWithAi,
} from './utils/telephonyEngine';
import {
  CallRecord,
  TelephonySettings,
  ContactItem,
  SimulatedCallerPersona,
  DEFAULT_CONTACTS,
  DEFAULT_TELEPHONY_SETTINGS,
  DEFAULT_CALL_RECORDS,
  isNumberInContacts,
} from './types/telephony';
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
import {
  determineTtsLocale,
  findBestVoiceForLocale,
  buildSpeechDiagnostics,
  SpeechDiagnostics,
} from './utils/speechTtsEngine';
import { isSpeechInterruptionCommand } from './utils/languages';
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
  const [speechDiagnostics, setSpeechDiagnostics] = useState<SpeechDiagnostics | null>(null);

  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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

  // Autonomous Voice AI Telephony State
  const [activeCall, setActiveCall] = useState<CallRecord | null>(null);
  const [callHistory, setCallHistory] = useState<CallRecord[]>(() => {
    try {
      const saved = localStorage.getItem('hermes_jarvis_call_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      return DEFAULT_CALL_RECORDS;
    } catch {
      return DEFAULT_CALL_RECORDS;
    }
  });
  const [telephonyContacts] = useState<ContactItem[]>(DEFAULT_CONTACTS);
  const [telephonySettings, setTelephonySettings] = useState<TelephonySettings>(() => {
    try {
      const saved = localStorage.getItem('hermes_jarvis_telephony_settings');
      return saved ? { ...DEFAULT_TELEPHONY_SETTINGS, ...JSON.parse(saved) } : DEFAULT_TELEPHONY_SETTINGS;
    } catch {
      return DEFAULT_TELEPHONY_SETTINGS;
    }
  });
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [isCallOnHold, setIsCallOnHold] = useState(false);
  const [isAudioFilterActive, setIsAudioFilterActive] = useState(true);

  // Geolocation & Geospatial Telemetry State
  const [userCoords, setUserCoords] = useState<GeoCoordinates | null>(() => {
    return loadCachedLocation()?.coords || null;
  });
  const [userAddress, setUserAddress] = useState<LocationAddress | null>(() => {
    return loadCachedLocation()?.address || null;
  });
  const [isLocationLoading, setIsLocationLoading] = useState<boolean>(false);

  const handleRefreshLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
    setIsLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const c: GeoCoordinates = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
          altitudeAccuracy: pos.coords.altitudeAccuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
          timestamp: pos.timestamp,
        };
        setUserCoords(c);
        setIsLocationLoading(false);
        const addr = await reverseGeocodeCoordinates(c.latitude, c.longitude);
        setUserAddress(addr);
        saveCachedLocation(c, addr);
      },
      () => {
        setIsLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, []);

  // Request initial location on startup if not already loaded
  useEffect(() => {
    if (!userCoords && typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      handleRefreshLocation();
    }
  }, [userCoords, handleRefreshLocation]);

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

  // Initialize Voices with Android Chrome resilience and asynchronous voiceschanged event listener
  useEffect(() => {
    let isMounted = true;

    const updateVoices = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0 && isMounted) {
          setAvailableVoices(voices);
        }
      }
    };

    updateVoices();

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    // Android Chrome can delay populating voices list on initial page load
    const timer1 = setTimeout(updateVoices, 250);
    const timer2 = setTimeout(updateVoices, 1000);

    return () => {
      isMounted = false;
      clearTimeout(timer1);
      clearTimeout(timer2);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
      }
    };
  }, []);

  // Stop Speaking Callback (interruption & cancellation handling)
  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
    }
    activeUtteranceRef.current = null;
    setIsSpeaking(false);
    setStatusText('SPEECH HALTED • AWAITING COMMAND');
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

  // Speak Text Function with Audited Hindi TTS Locale & Native Voice Resolution
  const speakText = useCallback(
    (text: string, targetLangOverride?: string) => {
      if (!voiceSettings.autoSpeak || typeof window === 'undefined' || !('speechSynthesis' in window)) {
        return;
      }

      try {
        // Interruption safety: cancel previous speech and clear paused state
        window.speechSynthesis.cancel();
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }

        // Clean markdown formatting symbols for crisp, natural speech
        const cleanText = text.replace(/[*_`#]/g, '').trim();
        if (!cleanText) return;

        // Fresh dynamic voice discovery: query live browser voices
        const liveVoices = window.speechSynthesis.getVoices();
        const voices = liveVoices.length > 0 ? liveVoices : availableVoices;
        if (liveVoices.length > 0 && availableVoices.length === 0) {
          setAvailableVoices(liveVoices);
        }

        // 1. Determine TTS Locale
        const { targetLocale, isHindiTarget } = determineTtsLocale(
          cleanText,
          voiceSettings.language,
          targetLangOverride
        );

        // 2. Select Voice
        const resolution = findBestVoiceForLocale(voices, targetLocale, voiceSettings.voiceURI);

        // 3. Build & record non-sensitive diagnostics
        const diagnostics = buildSpeechDiagnostics(voiceSettings.language, resolution);
        setSpeechDiagnostics(diagnostics);

        if (isHindiTarget && !resolution.selectedVoice) {
          console.warn(
            '[HERMES JARVIS TTS] Hindi TTS voice unavailable on this device/browser. Outputting with lang="hi-IN" without English override.'
          );
        }

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = voiceSettings.rate;
        utterance.pitch = voiceSettings.pitch;
        utterance.volume = voiceSettings.volume;
        utterance.lang = targetLocale;

        if (resolution.selectedVoice) {
          utterance.voice = resolution.selectedVoice;
        }

        // Retain reference to prevent Android Chrome V8 garbage collection mid-speech
        activeUtteranceRef.current = utterance;

        utterance.onstart = () => {
          setIsSpeaking(true);
          const langBadge = isHindiTarget ? ' [HINDI TTS]' : '';
          setStatusText(`JARVIS SPEAKING${langBadge}: "${cleanText.slice(0, 30)}..."`);
        };

        utterance.onend = () => {
          activeUtteranceRef.current = null;
          setIsSpeaking(false);
          setStatusText('SYSTEM READY • AWAITING COMMAND');
        };

        utterance.onerror = (event: any) => {
          activeUtteranceRef.current = null;
          setIsSpeaking(false);
          const errType = event.error || 'unknown_error';
          console.warn('[HERMES JARVIS TTS] Speech error event:', errType);
          setSpeechDiagnostics((prev) => (prev ? { ...prev, ttsErrorState: String(errType) } : null));
          setStatusText('SYSTEM READY');
        };

        // Small timeout ensures clean audio focus transition on mobile/Android Chrome
        setTimeout(() => {
          window.speechSynthesis.speak(utterance);
        }, 15);
      } catch (err: any) {
        console.warn('[HERMES JARVIS TTS] Speech synthesis failed:', err);
        activeUtteranceRef.current = null;
        setIsSpeaking(false);
        setSpeechDiagnostics((prev) =>
          prev ? { ...prev, ttsErrorState: err?.message || 'exception' } : null
        );
      }
    },
    [voiceSettings, availableVoices]
  );

  // Telephony call termination & summarizer
  const handleEndCall = useCallback(() => {
    if (!activeCall) return;
    telephonyAudio.stopAll();
    telephonyAudio.playDisconnectTone();

    const finalizedSummary = generateCallSummary(activeCall);

    const endedCall: CallRecord = {
      ...activeCall,
      status: 'ended',
      summary: finalizedSummary.summary,
      followUpActions: finalizedSummary.followUpActions,
      sentiment: finalizedSummary.sentiment,
      durationSeconds: Math.max(activeCall.durationSeconds || 14, 14),
    };

    setActiveCall(endedCall);
    setCallHistory((prev) => [endedCall, ...prev]);

    fetch('/api/telephony/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(endedCall),
    }).catch(() => {});
  }, [activeCall]);

  // Telephony call rejection
  const handleDeclineCall = useCallback(() => {
    if (!activeCall) return;
    telephonyAudio.stopAll();
    telephonyAudio.playBusyTone();

    const declinedCall: CallRecord = {
      ...activeCall,
      status: 'declined',
      summary: 'Call declined by user or spam filter.',
      durationSeconds: 0,
    };

    setActiveCall(null);
    setCallHistory((prev) => [declinedCall, ...prev]);

    fetch('/api/telephony/calls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(declinedCall),
    }).catch(() => {});
  }, [activeCall]);

  // Telephony answer call
  const handleAnswerCall = useCallback(
    (mode: 'ai_autonomous' | 'ai_copilot' | 'direct_user' = 'ai_autonomous') => {
      if (!activeCall) return;
      telephonyAudio.stopAll();

      const greeting = telephonySettings.aiReceptionistGreeting;
      const callId = activeCall.id;

      setActiveCall((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          status: 'in_call',
          transcript: [
            ...prev.transcript,
            {
              id: `turn_agent_${Date.now()}`,
              speaker: 'agent',
              text: greeting,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            },
          ],
        };
      });

      speakText(greeting);

      if (mode === 'ai_autonomous' && activeCall.direction === 'inbound') {
        setTimeout(async () => {
          const currentCall = activeCall;
          const callerInitialUtterance = currentCall.transcript[0]?.text || 'Hello, I was calling for Alex.';
          const aiResponse = await processCallTurnWithAi({
            callerUtterance: callerInitialUtterance,
            transcript: currentCall.transcript,
            activeCall: currentCall,
            settings: telephonySettings,
          });

          setActiveCall((prev) => {
            if (!prev || prev.id !== callId || prev.status !== 'in_call') return prev;
            const updated = [
              ...prev.transcript,
              {
                id: `turn_agent_reply_${Date.now()}`,
                speaker: 'agent' as const,
                text: aiResponse.replyText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              },
            ];
            if (aiResponse.whisperTip) {
              updated.push({
                id: `turn_whisper_${Date.now()}`,
                speaker: 'whisper' as const,
                text: aiResponse.whisperTip,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              });
            }
            return {
              ...prev,
              transcript: updated,
              sentiment: aiResponse.sentiment || prev.sentiment,
            };
          });

          speakText(aiResponse.replyText);

          if (aiResponse.shouldEndCall) {
            setTimeout(() => {
              handleEndCall();
            }, 3500);
          }
        }, 2500);
      }
    },
    [activeCall, telephonySettings, speakText, handleEndCall]
  );

  // Outbound call starter
  const handleStartOutboundCall = useCallback(
    ({
      recipientNumber,
      recipientName,
      objective,
      aiPersona,
    }: {
      recipientNumber: string;
      recipientName: string;
      objective: string;
      aiPersona?: string;
    }) => {
      telephonyAudio.init();
      if (telephonySettings.acousticFilterEnabled) {
        telephonyAudio.enableTelephoneBandpass(true);
      }
      telephonyAudio.startDialTone();

      const callId = `call_${Date.now()}`;
      const newCall: CallRecord = {
        id: callId,
        direction: 'outbound',
        callerName: memory.name || 'Alex (Executive)',
        callerNumber: telephonySettings.twilioPhoneNumber || '+1 (555) 728-4827',
        recipientName: recipientName || 'Direct Contact',
        recipientNumber: recipientNumber || '+1 (415) 890-2134',
        status: 'dialing',
        mode: 'ai_autonomous',
        startTime: new Date().toISOString(),
        durationSeconds: 0,
        transcript: [],
        summary: '',
        sentiment: 'neutral',
        intent: 'outbound_coordination',
        followUpActions: [],
        objective: objective || 'General executive coordination',
        aiPersona: aiPersona || telephonySettings.aiPersona,
      };

      setActiveCall(newCall);

      // Transition to ringing after 1.5s
      setTimeout(() => {
        setActiveCall((prev) => (prev?.id === callId ? { ...prev, status: 'ringing' } : prev));
        telephonyAudio.startRingback();

        // Callee answers after another 2.2s
        setTimeout(() => {
          telephonyAudio.stopAll();
          const firstGreeting = `Hello, this is JARVIS calling on behalf of Alex regarding ${newCall.objective}. Am I speaking with ${newCall.recipientName}?`;

          setActiveCall((prev) => {
            if (prev?.id !== callId) return prev;
            return {
              ...prev,
              status: 'in_call',
              transcript: [
                {
                  id: `turn_${Date.now()}`,
                  speaker: 'agent' as const,
                  text: firstGreeting,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                },
              ],
            };
          });

          speakText(firstGreeting);

          // Callee responds after 3s
          setTimeout(async () => {
            const calleeAnswer = `Yes, this is ${newCall.recipientName}. Thank you for calling. What would you like to arrange?`;
            setActiveCall((prev) => {
              if (!prev || prev.id !== callId || prev.status !== 'in_call') return prev;
              const nextTurns = [
                ...prev.transcript,
                {
                  id: `turn_${Date.now()}`,
                  speaker: 'callee' as const,
                  text: calleeAnswer,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                },
              ];
              return { ...prev, transcript: nextTurns };
            });

            const aiTurn = await processCallTurnWithAi({
              callerUtterance: calleeAnswer,
              transcript: [
                { id: '1', speaker: 'agent', text: firstGreeting, timestamp: '00:01' },
                { id: '2', speaker: 'callee', text: calleeAnswer, timestamp: '00:04' },
              ],
              activeCall: newCall,
              settings: telephonySettings,
            });

            setActiveCall((prev) => {
              if (!prev || prev.id !== callId || prev.status !== 'in_call') return prev;
              const nextTurns = [
                ...prev.transcript,
                {
                  id: `turn_${Date.now()}`,
                  speaker: 'agent' as const,
                  text: aiTurn.replyText,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                },
              ];
              if (aiTurn.whisperTip) {
                nextTurns.push({
                  id: `whisper_${Date.now()}`,
                  speaker: 'whisper' as const,
                  text: aiTurn.whisperTip,
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                });
              }
              return { ...prev, transcript: nextTurns };
            });

            speakText(aiTurn.replyText);
          }, 3200);
        }, 2200);
      }, 1500);
    },
    [memory.name, telephonySettings, speakText]
  );

  // Incoming call simulator starter
  const handleTriggerIncomingCall = useCallback(
    (persona: SimulatedCallerPersona) => {
      telephonyAudio.init();
      if (telephonySettings.acousticFilterEnabled) {
        telephonyAudio.enableTelephoneBandpass(true);
      }
      telephonyAudio.startRinging();

      const spamAnalysis = evaluateSpamScore(persona.firstLine, persona.callerName);
      const callId = `call_${Date.now()}`;

      const isCallerInContacts = isNumberInContacts(persona.callerNumber, telephonyContacts);
      const maskActive = telephonySettings.maskUnknownCallerId !== false;

      const newCall: CallRecord = {
        id: callId,
        direction: 'inbound',
        callerName: persona.callerName,
        callerNumber: persona.callerNumber,
        recipientName: memory.name || 'Alex (Executive)',
        recipientNumber: telephonySettings.twilioPhoneNumber || '+1 (555) 728-4827',
        status: 'ringing',
        mode: 'ai_autonomous',
        startTime: new Date().toISOString(),
        durationSeconds: 0,
        transcript: [
          {
            id: `turn_caller_0`,
            speaker: 'caller' as const,
            text: persona.firstLine,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          },
        ],
        summary: '',
        sentiment: persona.isSpam ? 'negative' : 'neutral',
        intent: persona.intent || persona.goal || 'inbound_inquiry',
        followUpActions: [],
        spamScore: persona.isSpam ? 85 : spamAnalysis.score,
        spamKeywords: spamAnalysis.reasons,
        objective: persona.scenarioTitle,
        aiPersona: telephonySettings.aiPersona,
      };

      setActiveCall(newCall);
    },
    [memory.name, telephonySettings, telephonyContacts]
  );

  // Auto-persist callHistory & telephonySettings
  useEffect(() => {
    try {
      localStorage.setItem('hermes_jarvis_call_history', JSON.stringify(callHistory));
    } catch (e) {
      console.warn('Failed to save call history:', e);
    }
  }, [callHistory]);

  useEffect(() => {
    try {
      localStorage.setItem('hermes_jarvis_telephony_settings', JSON.stringify(telephonySettings));
    } catch (e) {
      console.warn('Failed to save telephony settings:', e);
    }
  }, [telephonySettings]);

  // Handle incoming call auto-answer
  useEffect(() => {
    if (
      activeCall &&
      activeCall.direction === 'inbound' &&
      activeCall.status === 'ringing' &&
      telephonySettings.autoAnswerInbound
    ) {
      const delayMs = (telephonySettings.autoAnswerDelaySeconds || 2) * 1000;
      const timer = setTimeout(() => {
        handleAnswerCall('ai_autonomous');
      }, delayMs);
      return () => clearTimeout(timer);
    }
  }, [activeCall?.id, activeCall?.status, telephonySettings.autoAnswerInbound, telephonySettings.autoAnswerDelaySeconds, handleAnswerCall]);

  // Execute Local System Action
  const handleExecuteAction = useCallback(
    (intent: IntentCategory, payload?: any) => {
      switch (intent) {
        case 'make_call':
          handleStartOutboundCall({
            recipientName: payload?.target || 'Direct Contact',
            recipientNumber: payload?.number || '+1 (555) 728-4827',
            objective: payload?.objective || 'Autonomous phone call coordination',
          });
          break;
        case 'answer_call':
          handleAnswerCall('ai_autonomous');
          break;
        case 'hangup_call':
          handleEndCall();
          break;
        case 'reject_call':
          handleDeclineCall();
          break;
        case 'telephony_hub':
        case 'call_history':
          setActiveApp('telephony');
          break;
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
        case 'language_switch':
          if (payload?.language) {
            setVoiceSettings((prev) => ({ ...prev, language: payload.language }));
          }
          break;
        case 'weather_inquiry':
        case 'time_inquiry':
          setActiveApp('mobile_personal_status');
          break;
        case 'math_computation':
          setActiveApp('calculator');
          break;
        case 'location_services':
          setActiveApp('location');
          break;
        default:
          break;
      }
    },
    []
  );

  // Send Command to Backend with Offline Fallback
  const handleSendCommand = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || isProcessing) return;

      // Real-time speech interruption check
      if (isSpeechInterruptionCommand(text)) {
        stopSpeaking();
        setStatusText('SYSTEM READY • SPEECH INTERRUPTED');
        return;
      }

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

        let updatedLang = voiceSettings.language;
        if (data.languageChangedTo) {
          updatedLang = data.languageChangedTo;
          setVoiceSettings((prev) => ({ ...prev, language: data.languageChangedTo }));
        }

        // Voice Response with guaranteed locale propagation
        speakText(data.reply, updatedLang);
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

        let offlineTargetLang = voiceSettings.language;
        if (localResult.intent === 'language_switch' && localResult.actionDetail?.payload?.language) {
          offlineTargetLang = localResult.actionDetail.payload.language;
          setVoiceSettings((prev) => ({ ...prev, language: offlineTargetLang }));
        }

        speakText(localResult.reply, offlineTargetLang);
        setStatusText('LOCAL OFFLINE ENGINE EXECUTED • PERSISTED TO LOCAL STORAGE');
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing, messages, memory, voiceSettings.language, speakText, stopSpeaking, handleExecuteAction]
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
      recognition.lang =
        voiceSettings.language === 'hinglish' || voiceSettings.language === 'auto'
          ? 'hi-IN'
          : voiceSettings.language;

      recognition.onstart = () => {
        setIsListening(true);
        setStatusText(`LISTENING (${recognition.lang})... SPEAK NOW`);
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

  // Telephony Controls
  const handleToggleHold = useCallback(() => {
    setIsCallOnHold((prev) => {
      const next = !prev;
      if (next) {
        telephonyAudio.startHoldMusic();
        setActiveCall((c) => (c ? { ...c, status: 'on_hold' } : null));
      } else {
        telephonyAudio.stopHoldMusic();
        setActiveCall((c) => (c ? { ...c, status: 'in_call' } : null));
      }
      return next;
    });
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsCallMuted((prev) => !prev);
  }, []);

  const handleToggleAudioFilter = useCallback(() => {
    setIsAudioFilterActive((prev) => {
      const next = !prev;
      telephonyAudio.enableTelephoneBandpass(next);
      return next;
    });
  }, []);

  const handleSendDtmf = useCallback((digit: string) => {
    telephonyAudio.playDtmf(digit);
  }, []);

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
        onOpenLocation={() => setActiveApp('location')}
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
            onStopSpeaking={stopSpeaking}
            statusText={statusText}
          />

          {/* Quick Voice Shortcuts */}
          <div className="w-full max-w-sm mt-4 pt-4 border-t border-cyan-950 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>HERMES BLUEPRINT MACROS</span>
              <span className="text-cyan-400">CLICK TO EXECUTE</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 font-mono text-xs">
              <button
                onClick={() => handleSendCommand('JARVIS, project check करो')}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-300 text-left truncate transition-colors"
              >
                "Project check"
              </button>
              <button
                onClick={() => handleSendCommand('JARVIS, आज की LinkedIn post बनाओ')}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-purple-300 text-left truncate transition-colors"
              >
                "LinkedIn post"
              </button>
              <button
                onClick={() => handleSendCommand('Where am I? Current location')}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-emerald-300 text-left truncate transition-colors"
              >
                "Where am I?"
              </button>
              <button
                onClick={() => handleSendCommand('JARVIS, client inquiry के लिए quotation तैयार करो')}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-amber-300 text-left truncate transition-colors"
              >
                "Quotation"
              </button>
              <button
                onClick={() => handleSendCommand('JARVIS, कल सुबह 9 बजे मुझे report देना')}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-pink-300 text-left truncate transition-colors"
              >
                "Morning report"
              </button>
              <button
                onClick={() => setActiveApp('telephony')}
                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-300 text-left truncate transition-colors"
              >
                "Telephony Hub"
              </button>
            </div>
          </div>

          {/* Dashboard Geolocation Radar Snippet */}
          <div className="w-full max-w-sm mt-4">
            <DashboardMapSnippet
              coords={userCoords}
              address={userAddress}
              isLoading={isLocationLoading}
              onOpenModal={() => setActiveApp('location')}
              onRefresh={handleRefreshLocation}
            />
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
        speechDiagnostics={speechDiagnostics}
      />

      {/* Autonomous Voice AI Telephony Live HUD & Management Hub */}
      <ActiveCallHUD
        activeCall={activeCall}
        settings={telephonySettings}
        contacts={telephonyContacts}
        isMuted={isCallMuted}
        isOnHold={isCallOnHold}
        audioFilterActive={isAudioFilterActive}
        onToggleMute={handleToggleMute}
        onToggleHold={handleToggleHold}
        onToggleAudioFilter={handleToggleAudioFilter}
        onEndCall={handleEndCall}
        onAnswerCall={handleAnswerCall}
        onDeclineCall={handleDeclineCall}
        onSendDtmf={handleSendDtmf}
        onCloseSummary={() => setActiveCall(null)}
      />

      <TelephonyHubModal
        isOpen={activeApp === 'telephony'}
        onClose={() => setActiveApp(null)}
        activeCall={activeCall}
        callHistory={callHistory}
        contacts={telephonyContacts}
        settings={telephonySettings}
        onUpdateSettings={(s) => setTelephonySettings(s)}
        onStartOutboundCall={handleStartOutboundCall}
        onTriggerIncomingCall={handleTriggerIncomingCall}
        onClearHistory={() => {
          setCallHistory([]);
          try {
            localStorage.removeItem('hermes_jarvis_call_history');
          } catch {}
        }}
      />

      {/* Geolocation & Tactical Navigation Services Modal */}
      <LocationServicesModal
        isOpen={activeApp === 'location'}
        onClose={() => setActiveApp(null)}
        onSpeak={speakText}
        onCoordinatesUpdated={(c, a) => {
          setUserCoords(c);
          setUserAddress(a);
        }}
      />
    </div>
  );
}
