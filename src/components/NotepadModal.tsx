import React, { useState, useEffect } from 'react';
import { X, Save, Download, Copy, Trash2, Check, FileText } from 'lucide-react';

interface NotepadModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialContent?: string;
  onSaveNote?: (title: string, content: string) => void;
}

export const NotepadModal: React.FC<NotepadModalProps> = ({
  isOpen,
  onClose,
  initialContent = '',
  onSaveNote,
}) => {
  const [text, setText] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [savedStatus, setSavedStatus] = useState(false);

  useEffect(() => {
    if (initialContent) {
      setText((prev) => (prev ? `${prev}\n\n[Jarvis Input]: ${initialContent}` : initialContent));
    } else {
      const stored = localStorage.getItem('jarvis_notepad_content');
      if (stored) setText(stored);
    }
  }, [initialContent, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    localStorage.setItem('jarvis_notepad_content', text);
    if (onSaveNote) {
      onSaveNote('Desktop Note', text);
    }
    setSavedStatus(true);
    setTimeout(() => setSavedStatus(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([text || 'Jarvis Voice Notes'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Jarvis_Notes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-2xl bg-slate-900 border border-cyan-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] glow-cyan-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-cyan-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
              <FileText className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-hud font-bold text-cyan-200 uppercase tracking-wider">
                JARVIS NOTEPAD [Jarvis_Notes.txt]
              </h2>
              <span className="text-[11px] font-mono text-slate-400">
                Auto-synced desktop text editor
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

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-950/60 border-b border-slate-800 text-xs font-mono">
          <div className="flex items-center gap-2 text-slate-400">
            <span>Words: {text.trim() ? text.trim().split(/\s+/).length : 0}</span>
            <span>•</span>
            <span>Chars: {text.length}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 transition-colors"
              title="Download as Jarvis_Notes.txt"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export .TXT</span>
            </button>

            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold transition-colors shadow"
              title="Save to local state"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{savedStatus ? 'Saved!' : 'Save'}</span>
            </button>
          </div>
        </div>

        {/* Text Area */}
        <div className="flex-1 p-4 bg-slate-900">
          <textarea
            id="jarvis-notepad-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type notes or ask Jarvis to 'create file' / 'save notes' via voice..."
            className="w-full h-80 bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-sm font-mono text-cyan-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400 resize-none"
          />
        </div>
      </div>
    </div>
  );
};
