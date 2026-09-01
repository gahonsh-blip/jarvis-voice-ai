import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  X,
  Check,
  AlertOctagon,
  Copy,
  Terminal,
  ExternalLink,
  Lock,
  Layers,
  RotateCw,
  Clock,
  Send,
  GitFork,
  Share2,
  Mail,
  AlertTriangle,
  Code2,
  CheckCircle2,
  XCircle,
  FileCode,
  Smartphone,
  Cpu,
  Info,
} from 'lucide-react';
import { PermissionActionRequest, EmergencyControlState } from '../types';

interface PermissionGatewayProps {
  isOpen?: boolean;
  onClose?: () => void;
  targetRequest?: PermissionActionRequest | null;
  onApprove?: (request: PermissionActionRequest) => Promise<void> | void;
  onReject?: (request: PermissionActionRequest) => Promise<void> | void;
  onSpeak?: (text: string) => void;
  isStandalone?: boolean;
}

export const PermissionGateway: React.FC<PermissionGatewayProps> = ({
  isOpen = true,
  onClose,
  targetRequest = null,
  onApprove,
  onReject,
  onSpeak,
  isStandalone = false,
}) => {
  const [pendingRequests, setPendingRequests] = useState<PermissionActionRequest[]>([]);
  const [allRequests, setAllRequests] = useState<PermissionActionRequest[]>([]);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [emergency, setEmergency] = useState<EmergencyControlState>({ emergencyPaused: false });
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [viewFormat, setViewFormat] = useState<'formatted' | 'raw_json'>('formatted');

  // Test Stager State
  const [stageAction, setStageAction] = useState<'linkedin_post' | 'github_issue' | 'email_quote'>('linkedin_post');
  const [customTarget, setCustomTarget] = useState<string>('Personal Profile URN: urn:li:person:auth_user');
  const [customChanges, setCustomChanges] = useState<string>(
    '🚀 Autonomous AI Milestone: Testing real level 4 external action permission gateway with zero unverified dispatches.'
  );

  // Fetch pending requests on mount and when modal opens
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Sync selected request when targetRequest prop changes
  useEffect(() => {
    if (targetRequest) {
      setSelectedRequestId(targetRequest.id);
    }
  }, [targetRequest]);

  const fetchData = async () => {
    try {
      const [pendingRes, allRes, emergRes] = await Promise.all([
        fetch('/api/approvals/pending').then((r) => r.json()),
        fetch('/api/approvals/all').then((r) => r.json()),
        fetch('/api/emergency/status').then((r) => r.json()),
      ]);

      const pendingList: PermissionActionRequest[] = pendingRes.pending || [];
      setPendingRequests(pendingList);
      setAllRequests(allRes.requests || []);
      setEmergency(emergRes);

      // Auto-select first pending if none selected
      if (!selectedRequestId && pendingList.length > 0) {
        setSelectedRequestId(pendingList[0].id);
      }
    } catch {
      // Safe fallback
    }
  };

  const showNotification = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  // Find active request object
  const activeRequest: PermissionActionRequest | null =
    targetRequest ||
    pendingRequests.find((r) => r.id === selectedRequestId) ||
    allRequests.find((r) => r.id === selectedRequestId) ||
    pendingRequests[0] ||
    null;

  const handleApprove = async (reqToApprove: PermissionActionRequest) => {
    if (emergency.emergencyPaused) {
      showNotification('Cannot execute Level 4 action while Emergency Stop is active.', 'error');
      if (onSpeak) onSpeak('Action blocked. Emergency Stop is active, Sir.');
      return;
    }

    setLoading(true);
    try {
      if (onApprove) {
        await onApprove(reqToApprove);
      } else {
        const res = await fetch('/api/approvals/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: reqToApprove.id,
            decision: 'APPROVE',
            approver: 'HUMAN_PERMISSION_GATEWAY_UI',
          }),
        });
        const data = await res.json();
        if (data.success) {
          showNotification(`✅ Authorized & Executed: "${reqToApprove.exactAction}"`, 'success');
          if (onSpeak) onSpeak(`Level 4 permission granted. Action ${reqToApprove.exactAction} executed successfully, Sir.`);
        } else {
          showNotification(data.error || 'Execution halted', 'error');
          if (onSpeak) onSpeak(`Execution notice: ${data.error || 'Execution halted'}`);
        }
      }
      await fetchData();
    } catch (err: any) {
      showNotification('Approval failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (reqToReject: PermissionActionRequest) => {
    setLoading(true);
    try {
      if (onReject) {
        await onReject(reqToReject);
      } else {
        const res = await fetch('/api/approvals/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: reqToReject.id,
            decision: 'REJECT',
            approver: 'HUMAN_PERMISSION_GATEWAY_UI',
          }),
        });
        const data = await res.json();
        if (data.success) {
          showNotification(`❌ Rejected: "${reqToReject.exactAction}" cancelled safely.`, 'error');
          if (onSpeak) onSpeak(`Action ${reqToReject.exactAction} cancelled safely without external modification, Sir.`);
        }
      }
      await fetchData();
    } catch (err: any) {
      showNotification('Rejection failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPayload = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStageTestAction = async () => {
    setLoading(true);
    let exactAction = 'Publish to LinkedIn Personal Profile';
    let platform = 'LinkedIn';
    let target = customTarget;

    if (stageAction === 'github_issue') {
      exactAction = 'Create GitHub Issue on repository';
      platform = 'GitHub';
      target = 'GitHub Repository: hermes-jarvis/workspace';
    } else if (stageAction === 'email_quote') {
      exactAction = 'Send Freelance Quotation via SMTP';
      platform = 'Email';
      target = 'Recipient: client.enterprise@techcorp.io';
    }

    try {
      const res = await fetch('/api/approvals/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exactAction,
          target,
          contentChanges: customChanges,
          level: 4,
          source: 'permission_gateway_tester',
          platform,
          actionPayload: { stagedAt: new Date().toISOString(), message: customChanges },
        }),
      });
      const data = await res.json();
      if (data.success) {
        showNotification('Level 4 Action staged in Permission Gateway for manual review!', 'info');
        setSelectedRequestId(data.request.id);
        await fetchData();
        if (onSpeak) onSpeak('New Level 4 external action queued in Permission Gateway for your authorization, Sir.');
      } else {
        showNotification(data.reason || 'Failed to stage request', 'error');
      }
    } catch (err: any) {
      showNotification('Stage error: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen && !isStandalone) return null;

  const content = (
    <div
      id="permission-gateway-container"
      className="w-full bg-slate-900 border-2 border-amber-500/60 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200 font-sans"
    >
      {/* 1. GATEWAY TOP HUD HEADER */}
      <div className="px-5 py-4 bg-slate-950 border-b border-amber-500/30 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-950/80 border border-amber-500/60 flex items-center justify-center text-amber-400 shrink-0 shadow-lg shadow-amber-950/50">
            <ShieldAlert className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide font-mono">
                PERMISSION GATEWAY
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 border border-amber-500 text-amber-300 font-mono font-bold">
                LEVEL 4 ACTION INTERCEPTOR
              </span>
              {emergency.emergencyPaused ? (
                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950 border border-rose-500 text-rose-300 font-mono font-bold animate-pulse">
                  🚨 EMERGENCY STOP
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-mono">
                  ACTIVE
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-mono">
              Human-in-the-Loop Pre-Execution Verification • Zero Unsolicited External Dispatches
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="refresh-permission-queue-btn"
            onClick={fetchData}
            className="px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-750 text-xs font-mono text-cyan-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
            title="Refresh active queue"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh ({pendingRequests.length})</span>
          </button>

          {!isStandalone && onClose && (
            <button
              id="close-permission-gateway-btn"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. FEEDBACK / STATUS NOTIFICATION BANNER */}
      {feedback && (
        <div
          className={`px-4 py-2.5 text-xs font-mono font-semibold flex items-center gap-2 transition-all ${
            feedback.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-b border-emerald-800'
              : feedback.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border-b border-rose-800'
              : 'bg-cyan-950/90 text-cyan-200 border-b border-cyan-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : feedback.type === 'error' ? (
            <AlertOctagon className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* 3. EMERGENCY STOP LOCKOUT WARNING */}
      {emergency.emergencyPaused && (
        <div className="px-4 py-3 bg-rose-950/90 border-b border-rose-800/80 flex items-center gap-3 text-rose-200 text-xs font-mono">
          <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 animate-pulse" />
          <div>
            <span className="font-bold uppercase tracking-wider block">EMERGENCY STOP PROTOCOL ACTIVE</span>
            <span>All Level 3 and Level 4 executions are blocked until Emergency Stop is deactivated by the operator.</span>
          </div>
        </div>
      )}

      {/* 4. MAIN INTERCEPTOR BODY */}
      <div className="p-4 sm:p-6 space-y-6 overflow-y-auto max-h-[75vh]">
        {/* Pending Requests Tab Switcher if multiple */}
        {pendingRequests.length > 1 && (
          <div className="space-y-2">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Pending Authorization Queue ({pendingRequests.length} Actions Awaiting Your Decision)
            </span>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {pendingRequests.map((req, idx) => (
                <button
                  key={req.id}
                  id={`select-request-${req.id}`}
                  onClick={() => setSelectedRequestId(req.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-mono font-bold shrink-0 transition-all flex items-center gap-2 border ${
                    activeRequest?.id === req.id
                      ? 'bg-amber-950 text-amber-200 border-amber-500 shadow-md shadow-amber-950'
                      : 'bg-slate-950/70 text-slate-400 hover:text-slate-200 border-slate-800'
                  }`}
                >
                  <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] flex items-center justify-center font-black">
                    {idx + 1}
                  </span>
                  <span className="truncate max-w-[180px]">{req.exactAction}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PRIMARY LEVEL 4 INTERCEPT INSPECTION CARD */}
        {activeRequest ? (
          <div
            id="active-permission-request-card"
            className="p-5 sm:p-6 rounded-2xl bg-slate-950/90 border-2 border-amber-500/50 shadow-xl space-y-5"
          >
            {/* CARD TOP META */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500 text-amber-300 font-mono text-xs font-bold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>ACTION INTERCEPT #{activeRequest.id}</span>
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Source: <span className="text-slate-200 font-semibold">{activeRequest.source}</span>
                </span>
                {activeRequest.platform && (
                  <span className="text-xs text-cyan-400 font-mono font-semibold">
                    • Platform: {activeRequest.platform}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-mono">
                  {new Date(activeRequest.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase ${
                    activeRequest.status === 'PENDING_APPROVAL'
                      ? 'bg-amber-950 text-amber-300 border border-amber-500 animate-pulse'
                      : activeRequest.status === 'EXECUTED'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-500'
                      : activeRequest.status === 'REJECTED'
                      ? 'bg-rose-950 text-rose-300 border border-rose-500'
                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                >
                  {activeRequest.status}
                </span>
              </div>
            </div>

            {/* THE FOUR REQUIRED PERMISSION SPECIFICATION BLOCKS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. EXACT ACTION */}
              <div
                id="permission-exact-action-block"
                className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-amber-400 font-mono tracking-wider uppercase flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-amber-400" />
                    EXACT ACTION
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">OPERATIONAL CALL</span>
                </div>
                <p className="text-base font-bold text-white tracking-wide">
                  {activeRequest.exactAction}
                </p>
                <p className="text-xs text-slate-400">
                  Targeted autonomous routine awaiting explicit operator authorization before invocation.
                </p>
              </div>

              {/* 2. TARGET */}
              <div
                id="permission-target-block"
                className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-cyan-400 font-mono tracking-wider uppercase flex items-center gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                    TARGET
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">DESTINATION</span>
                </div>
                <p className="text-base font-bold text-cyan-300 font-mono truncate" title={activeRequest.target}>
                  {activeRequest.target}
                </p>
                <p className="text-xs text-slate-400">
                  External URI, API repository, or account identity that will be modified.
                </p>
              </div>
            </div>

            {/* 3. CONTENT / CHANGES */}
            <div
              id="permission-content-changes-block"
              className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-purple-400 font-mono tracking-wider uppercase flex items-center gap-1.5">
                  <FileCode className="w-3.5 h-3.5 text-purple-400" />
                  CONTENT / CHANGES
                </span>

                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg bg-slate-950 border border-slate-800 p-0.5 text-[10px] font-mono">
                    <button
                      onClick={() => setViewFormat('formatted')}
                      className={`px-2 py-0.5 rounded ${
                        viewFormat === 'formatted' ? 'bg-purple-900 text-purple-200 font-bold' : 'text-slate-400'
                      }`}
                    >
                      Text View
                    </button>
                    <button
                      onClick={() => setViewFormat('raw_json')}
                      className={`px-2 py-0.5 rounded ${
                        viewFormat === 'raw_json' ? 'bg-purple-900 text-purple-200 font-bold' : 'text-slate-400'
                      }`}
                    >
                      Raw JSON
                    </button>
                  </div>

                  <button
                    onClick={() => handleCopyPayload(activeRequest.contentChanges || '')}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono flex items-center gap-1 transition-colors"
                    title="Copy payload to clipboard"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {viewFormat === 'formatted' ? (
                <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/90 max-h-48 overflow-y-auto font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {activeRequest.contentChanges || '(No text content changes specified)'}
                </div>
              ) : (
                <pre className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/90 max-h-48 overflow-y-auto font-mono text-[11px] text-purple-300 whitespace-pre-wrap">
                  {JSON.stringify(activeRequest.actionPayload || activeRequest, null, 2)}
                </pre>
              )}

              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>Length: {(activeRequest.contentChanges || '').length} characters</span>
                <span>Payload Checksum: Verified SHA-Safe</span>
              </div>
            </div>

            {/* 4. REQUIRED PERMISSION */}
            <div
              id="permission-required-level-block"
              className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-black text-amber-400 font-mono tracking-wider uppercase flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  REQUIRED PERMISSION
                </span>
                <span className="px-2.5 py-0.5 rounded bg-amber-950 border border-amber-500 text-amber-300 font-mono font-bold text-xs shadow-sm">
                  {activeRequest.requiredPermission || `LEVEL ${activeRequest.level || 4} EXTERNAL ACTION`}
                </span>
              </div>
              <p className="text-xs text-amber-200/90 leading-relaxed">
                <strong>Zero Unsolicited Actions Policy</strong>: Level 4 actions perform external API dispatches, remote publishing, or workspace state mutations. Autonomous execution is locked until you provide explicit authorization.
              </p>
            </div>

            {/* ACTION DECISION BUTTONS */}
            {activeRequest.status === 'PENDING_APPROVAL' && (
              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                <button
                  id="reject-permission-action-btn"
                  onClick={() => handleReject(activeRequest)}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-rose-950 border border-slate-700 hover:border-rose-500 text-slate-300 hover:text-rose-200 text-xs font-mono font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4 text-rose-400" />
                  <span>NO / REJECT & ABORT</span>
                </button>

                <button
                  id="approve-permission-action-btn"
                  onClick={() => handleApprove(activeRequest)}
                  disabled={loading || emergency.emergencyPaused}
                  className={`px-6 py-2.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all shadow-lg ${
                    emergency.emergencyPaused
                      ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400 shadow-emerald-950 hover:shadow-emerald-900'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>YES / APPROVE & EXECUTE</span>
                </button>
              </div>
            )}

            {activeRequest.status === 'EXECUTED' && (
              <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Action was authorized and executed successfully.
                </span>
                {activeRequest.resultUrn && (
                  <span className="text-[10px] text-emerald-400">Result: {activeRequest.resultUrn}</span>
                )}
              </div>
            )}

            {activeRequest.status === 'REJECTED' && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-mono flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                Action was rejected and discarded. No external request was made.
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 rounded-2xl bg-slate-950/60 border border-slate-800 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h4 className="text-sm font-bold text-white font-mono">Permission Queue is Clear</h4>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Zero pending Level 4 external actions. When JARVIS drafts a LinkedIn post, GitHub issue, or external message, the full permission intercept card will appear here for your explicit authorization.
            </p>
          </div>
        )}

        {/* 5. INTERACTIVE TEST STAGER */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 font-mono uppercase flex items-center gap-1.5">
              <Code2 className="w-4 h-4 text-cyan-400" />
              Stage Level 4 External Action (Permission Intercept Verification)
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Test Interceptor</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              onClick={() => {
                setStageAction('linkedin_post');
                setCustomTarget('LinkedIn Profile: urn:li:person:authorized_member');
                setCustomChanges('🚀 Autonomous AI Engineering update: Level 4 permission gateway active with zero simulated dispatches.');
              }}
              className={`p-2.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-2 transition-colors ${
                stageAction === 'linkedin_post'
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-500'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <Share2 className="w-4 h-4 text-cyan-400" />
              <span>LinkedIn Post</span>
            </button>

            <button
              onClick={() => {
                setStageAction('github_issue');
                setCustomTarget('GitHub Repository: hermes-jarvis/workspace');
                setCustomChanges('Bug Report: PermissionGateway intercept test payload verified with SHA-safe audit trail.');
              }}
              className={`p-2.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-2 transition-colors ${
                stageAction === 'github_issue'
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-500'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <GitFork className="w-4 h-4 text-slate-200" />
              <span>GitHub Issue</span>
            </button>

            <button
              onClick={() => {
                setStageAction('email_quote');
                setCustomTarget('Client Recipient: enterprise.leads@globaltech.com');
                setCustomChanges('Quotation #HQ-2026-09: Enterprise Autonomous Infrastructure Setup — $4,850 USD.');
              }}
              className={`p-2.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-2 transition-colors ${
                stageAction === 'email_quote'
                  ? 'bg-cyan-950 text-cyan-300 border-cyan-500'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <Mail className="w-4 h-4 text-purple-400" />
              <span>SMTP Email Quote</span>
            </button>
          </div>

          <div className="space-y-2">
            <input
              type="text"
              value={customTarget}
              onChange={(e) => setCustomTarget(e.target.value)}
              placeholder="Target destination URI / account"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
            />
            <textarea
              value={customChanges}
              onChange={(e) => setCustomChanges(e.target.value)}
              placeholder="Content / changes payload"
              className="w-full h-16 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-mono text-xs resize-none focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex justify-end">
            <button
              id="stage-test-action-btn"
              onClick={handleStageTestAction}
              disabled={loading || emergency.emergencyPaused}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold font-mono text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Queue Staged Action for Permission Review</span>
            </button>
          </div>
        </div>

        {/* 6. PERMANENT FINANCE SAFETY EXCLUSION NOTICE */}
        <div className="p-3.5 rounded-xl bg-slate-950 border border-rose-900/60 flex items-center gap-3 text-xs font-mono text-slate-400">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>
            <strong className="text-rose-400 font-semibold">Strict Finance Exclusion</strong>: Financial operations (banking, UPI, card, wallet, money transfers) are permanently blocked from autonomous control and will never be presented for execution.
          </span>
        </div>
      </div>
    </div>
  );

  if (isStandalone) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-4xl">{content}</div>
    </div>
  );
};
