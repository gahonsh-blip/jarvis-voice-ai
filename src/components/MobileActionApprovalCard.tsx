import React from 'react';
import {
  Phone,
  PhoneOff,
  MessageSquare,
  ExternalLink,
  X,
  Send,
  Shield,
  ShieldAlert,
  Mic,
} from 'lucide-react';
import { AndroidPendingEvent } from '../types/mobileBridge';

interface MobileActionApprovalCardProps {
  pendingEvent: AndroidPendingEvent | null;
  onAnswerCall: () => void;
  onDeclineCall: () => void;
  onReplyMessage: () => void;
  onOpenApp: (packageName?: string) => void;
  onDismissMessage: () => void;
}

export const MobileActionApprovalCard: React.FC<MobileActionApprovalCardProps> = ({
  pendingEvent,
  onAnswerCall,
  onDeclineCall,
  onReplyMessage,
  onOpenApp,
  onDismissMessage,
}) => {
  if (!pendingEvent || pendingEvent.status !== 'AWAITING_APPROVAL') {
    return null;
  }

  const isCall = pendingEvent.type === 'CALL';

  return (
    <div id="mobile-action-approval-card" className="fixed top-20 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="rounded-xl border border-cyan-500/40 bg-slate-950/95 p-4 shadow-2xl shadow-cyan-950/50 backdrop-blur-md">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-3">
          <div className="flex items-center gap-2">
            {isCall ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400 animate-pulse">
                <Phone className="h-4 w-4" />
              </span>
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 animate-pulse">
                <MessageSquare className="h-4 w-4" />
              </span>
            )}
            <div>
              <h4 className="text-xs font-bold tracking-wider text-slate-100 uppercase">
                {isCall ? 'INCOMING PHONE CALL' : 'NEW MOBILE MESSAGE'}
              </h4>
              <p className="text-[10px] text-cyan-400/80 flex items-center gap-1 font-mono">
                <Shield className="h-2.5 w-2.5" /> LEVEL-4 HUMAN AUTHORIZATION GATE
              </p>
            </div>
          </div>
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-semibold text-amber-300 border border-amber-500/30 uppercase tracking-wider">
            WAITING FOR APPROVAL
          </span>
        </div>

        {/* Content Details */}
        <div className="space-y-2 text-xs mb-4 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
          {isCall ? (
            <>
              <div className="flex justify-between">
                <span className="text-slate-400">Caller:</span>
                <span className="font-semibold text-slate-100">{pendingEvent.sender}</span>
              </div>
              <div className="flex justify-between font-mono">
                <span className="text-slate-400">Number:</span>
                <span className="text-cyan-300">{pendingEvent.senderNumber || 'Unknown Number'}</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex justify-between">
                <span className="text-slate-400">Application:</span>
                <span className="font-semibold text-emerald-300">{pendingEvent.appName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">From:</span>
                <span className="font-semibold text-slate-100">{pendingEvent.sender}</span>
              </div>
              <div className="mt-1 pt-1 border-t border-slate-800/80">
                <span className="text-[11px] text-slate-400 block mb-0.5">Preview:</span>
                {pendingEvent.isSensitive ? (
                  <div className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-950/40 p-1.5 rounded border border-amber-900/50">
                    <ShieldAlert className="h-3 w-3 shrink-0" />
                    <span>Private / Sensitive content protected</span>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-200 italic line-clamp-2">
                    "{pendingEvent.previewText || 'No text preview'}"
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Voice Prompt Hint */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-3 px-1 font-mono">
          <Mic className="h-3 w-3 text-cyan-400 animate-pulse" />
          <span>
            Say: <strong className="text-cyan-300 font-normal">"{isCall ? 'हाँ / उठा लो' : 'हाँ / जवाब दो'}"</strong> or tap below:
          </span>
        </div>

        {/* Action Buttons */}
        {isCall ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              id="mobile-card-answer-call-btn"
              onClick={onAnswerCall}
              className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2 px-3 text-xs font-bold text-white shadow-lg shadow-emerald-950/50 transition-colors"
            >
              <Phone className="h-3.5 w-3.5" />
              ANSWER
            </button>
            <button
              id="mobile-card-decline-call-btn"
              onClick={onDeclineCall}
              className="flex items-center justify-center gap-2 rounded-lg bg-rose-700 hover:bg-rose-600 py-2 px-3 text-xs font-bold text-white shadow-lg shadow-rose-950/50 transition-colors"
            >
              <PhoneOff className="h-3.5 w-3.5" />
              DECLINE
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <button
              id="mobile-card-reply-msg-btn"
              onClick={onReplyMessage}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 py-2 px-2 text-[11px] font-bold text-white shadow transition-colors"
            >
              <Send className="h-3 w-3" />
              REPLY
            </button>
            <button
              id="mobile-card-open-app-btn"
              onClick={() => onOpenApp(pendingEvent.packageName)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 py-2 px-2 text-[11px] font-medium text-slate-200 border border-slate-700 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              OPEN
            </button>
            <button
              id="mobile-card-dismiss-msg-btn"
              onClick={onDismissMessage}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 py-2 px-2 text-[11px] font-medium text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
            >
              <X className="h-3 w-3" />
              DISMISS
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
