import React, { useState } from 'react';
import { X, Database, Plus, Trash2, Edit3, User, BookOpen, Clock, Activity, Download, HardDrive, CheckCircle } from 'lucide-react';
import { MemoryStore } from '../types';

interface MemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  memory: MemoryStore;
  onUpdateName: (name: string) => void;
  onAddCustomKey: (key: string, value: string) => void;
  onDeleteNote: (id: string) => void;
}

export const MemoryModal: React.FC<MemoryModalProps> = ({
  isOpen,
  onClose,
  memory,
  onUpdateName,
  onAddCustomKey,
  onDeleteNote,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(memory.name || '');
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [activeTab, setActiveTab] = useState<'profile' | 'notes' | 'knowledge'>('profile');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateName(nameInput);
    setEditingName(false);
  };

  const handleAddKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newVal.trim()) return;
    onAddCustomKey(newKey.trim(), newVal.trim());
    setNewKey('');
    setNewVal('');
  };

  const handleExportJSON = () => {
    try {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(memory, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `hermes_jarvis_memory_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.warn('Failed to export memory JSON:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-2xl bg-slate-900 border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col glow-cyan-sm max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-cyan-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
              <Database className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-hud font-bold text-cyan-200 uppercase tracking-wider">
                  JARVIS MEMORY BANKS [memory.json]
                </h2>
                <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-mono">
                  <HardDrive className="w-2.5 h-2.5" />
                  LocalStorage Synced
                </span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Offline-First Persistent Identity & Knowledge Matrix
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportJSON}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/40 text-xs font-mono text-cyan-300 flex items-center gap-1 transition-colors"
              title="Download Memory Backup JSON"
            >
              {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5" />}
              <span>{copied ? 'Downloaded' : 'Backup'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center border-b border-slate-800 bg-slate-950/60 px-4 text-xs font-mono">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2.5 border-b-2 font-medium transition-colors ${
              activeTab === 'profile'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            User Profile & Identity
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`px-4 py-2.5 border-b-2 font-medium transition-colors ${
              activeTab === 'notes'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Recorded Notes ({memory.notes?.length || 0})
          </button>
          <button
            onClick={() => setActiveTab('knowledge')}
            className={`px-4 py-2.5 border-b-2 font-medium transition-colors ${
              activeTab === 'knowledge'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Key-Value Facts
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 bg-slate-900/90 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'profile' && (
            <div className="space-y-4">
              {/* User Identity Card */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-hud text-slate-400 uppercase">Primary User</span>
                  </div>
                  <button
                    onClick={() => setEditingName(!editingName)}
                    className="text-xs font-mono text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>{editingName ? 'Cancel' : 'Edit'}</span>
                  </button>
                </div>

                {editingName ? (
                  <form onSubmit={handleSaveName} className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Enter user name..."
                      className="flex-1 bg-slate-900 border border-cyan-500/50 rounded-lg px-3 py-1.5 text-xs font-mono text-cyan-100 focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs font-mono"
                    >
                      Save
                    </button>
                  </form>
                ) : (
                  <div className="text-xl font-bold font-hud text-cyan-300">
                    {memory.name || 'Not logged yet (Say "My name is...")'}
                  </div>
                )}
                <p className="text-[11px] font-mono text-slate-500">
                  Triggered by voice commands: "My name is [name]" or "What is my name".
                </p>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-3">
                  <Activity className="w-5 h-5 text-emerald-400" />
                  <div>
                    <div className="text-lg font-hud font-bold text-slate-100">
                      {memory.stats?.totalCommands || 0}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      Total Voice / Text Commands
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-3">
                  <Clock className="w-5 h-5 text-cyan-400" />
                  <div>
                    <div className="text-lg font-hud font-bold text-slate-100">
                      {memory.stats?.actionsExecuted || 0}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      Autonomous Actions Executed
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-3">
              {memory.notes && memory.notes.length > 0 ? (
                memory.notes.map((n) => (
                  <div key={n.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs font-hud font-bold text-cyan-300">{n.title}</div>
                      <p className="text-xs font-mono text-slate-300 whitespace-pre-wrap">{n.content}</p>
                      <div className="text-[10px] font-mono text-slate-500">
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => onDeleteNote(n.id)}
                      className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-900 transition-colors"
                      title="Delete note"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-slate-500 font-mono text-xs">
                  No notes recorded yet. Say "create file" or "save notes" to log content.
                </div>
              )}
            </div>
          )}

          {activeTab === 'knowledge' && (
            <div className="space-y-4">
              <form onSubmit={handleAddKey} className="flex items-center gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
                <input
                  type="text"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Key (e.g. coffee_pref)"
                  className="w-1/3 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-cyan-200 focus:outline-none"
                />
                <input
                  type="text"
                  value={newVal}
                  onChange={(e) => setNewVal(e.target.value)}
                  placeholder="Value (e.g. Black with no sugar)"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-cyan-200 focus:outline-none"
                />
                <button
                  type="submit"
                  className="p-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold"
                  title="Add Memory Fact"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </form>

              <div className="space-y-2">
                {Object.entries(memory.customKeyValues || {}).map(([k, v]) => (
                  <div key={k} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs font-mono">
                    <span className="text-cyan-400 font-semibold">{k}:</span>
                    <span className="text-slate-300">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
