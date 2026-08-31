import { ChatMessage, MemoryStore, VoiceSettings } from '../types';

const CHAT_HISTORY_KEY = 'hermes_jarvis_chat_history_v1';
const MEMORY_STORE_KEY = 'hermes_jarvis_memory_store_v1';
const VOICE_SETTINGS_KEY = 'hermes_jarvis_voice_settings_v1';
const PENDING_SYNC_KEY = 'hermes_jarvis_pending_sync_v1';

export interface PendingSyncItem {
  id: string;
  type: 'name' | 'note_add' | 'note_delete' | 'custom_key' | 'memory_sync';
  payload: any;
  timestamp: string;
}

export const defaultInitialMessages: ChatMessage[] = [
  {
    id: 'init-1',
    role: 'system',
    content: 'HERMES JARVIS PROTOCOL ACTIVE. Local offline storage initialized & synced with Oracle Cloud Always Free ARM node.',
    timestamp: new Date().toISOString(),
  },
  {
    id: 'init-2',
    role: 'jarvis',
    content: 'Good day, Sir! Hermes Jarvis online and standing by. Local neural memory banks are active and offline-ready. Speak or command me anytime.',
    timestamp: new Date().toISOString(),
  },
];

export const defaultInitialMemory: MemoryStore = {
  name: '',
  notes: [
    {
      id: 'default-note-1',
      title: 'Hermes Architecture Note',
      content: 'Local offline-first persistence enabled. Identity, voice settings, notes, and transcripts are preserved in browser memory banks across sessions.',
      createdAt: new Date().toISOString(),
    },
  ],
  customKeyValues: {
    system_engine: 'Oracle Always Free ARM64 + Local Hybrid Engine',
    voice_status: 'SpeechSynthesis + Web Audio API',
    persistence_mode: 'Offline-First LocalStorage & Backend Sync',
  },
  stats: {
    totalCommands: 0,
    actionsExecuted: 0,
    lastActive: new Date().toISOString(),
  },
};

/**
 * Safe LocalStorage getters and setters with error recovery
 */
export function loadLocalChatHistory(): ChatMessage[] {
  if (typeof window === 'undefined') return defaultInitialMessages;
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return defaultInitialMessages;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch (err) {
    console.warn('[OfflineStorage] Error reading chat history from localStorage:', err);
  }
  return defaultInitialMessages;
}

export function saveLocalChatHistory(messages: ChatMessage[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Keep last 120 messages to prevent exceeding browser storage quota
    const trimmed = messages.slice(-120);
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.warn('[OfflineStorage] Error saving chat history to localStorage:', err);
  }
}

export function clearLocalChatHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(CHAT_HISTORY_KEY);
  } catch (err) {
    console.warn('[OfflineStorage] Error clearing chat history:', err);
  }
}

export function loadLocalMemory(): MemoryStore {
  if (typeof window === 'undefined') return defaultInitialMemory;
  try {
    const raw = localStorage.getItem(MEMORY_STORE_KEY);
    if (!raw) return defaultInitialMemory;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        ...defaultInitialMemory,
        ...parsed,
        stats: {
          ...defaultInitialMemory.stats,
          ...(parsed.stats || {}),
        },
        notes: Array.isArray(parsed.notes) ? parsed.notes : defaultInitialMemory.notes,
        customKeyValues: {
          ...defaultInitialMemory.customKeyValues,
          ...(parsed.customKeyValues || {}),
        },
      };
    }
  } catch (err) {
    console.warn('[OfflineStorage] Error reading memory store from localStorage:', err);
  }
  return defaultInitialMemory;
}

export function saveLocalMemory(memory: MemoryStore): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MEMORY_STORE_KEY, JSON.stringify(memory));
  } catch (err) {
    console.warn('[OfflineStorage] Error saving memory store to localStorage:', err);
  }
}

export function loadLocalVoiceSettings(): VoiceSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(VOICE_SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[OfflineStorage] Error reading voice settings from localStorage:', err);
    return null;
  }
}

export function saveLocalVoiceSettings(settings: VoiceSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('[OfflineStorage] Error saving voice settings to localStorage:', err);
  }
}

// Sync queue for offline mutations
export function queuePendingSync(type: PendingSyncItem['type'], payload: any): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getPendingSyncQueue();
    const item: PendingSyncItem = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify([...existing, item]));
  } catch (err) {
    console.warn('[OfflineStorage] Error queueing pending sync:', err);
  }
}

export function getPendingSyncQueue(): PendingSyncItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearPendingSyncQueue(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PENDING_SYNC_KEY);
  } catch (err) {
    console.warn('[OfflineStorage] Error clearing sync queue:', err);
  }
}
