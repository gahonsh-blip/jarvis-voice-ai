import React, { useState, useEffect } from 'react';
import {
  Wrench,
  X,
  Shield,
  ShieldAlert,
  GitBranch,
  FolderTree,
  GitFork,
  Code2,
  Globe,
  Mail,
  AlertOctagon,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  RotateCw,
  FileText,
  Trash2,
  Edit3,
  ExternalLink,
  Ban,
  Check,
  Search,
  Terminal,
  Cpu,
  Layers,
  ChevronRight,
  Send,
} from 'lucide-react';
import { PermissionActionRequest, IntegrationAuditItem, EmergencyControlState } from '../types';
import { PermissionGateway } from './PermissionGateway';

interface AutonomousToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ActiveTab = 'approvals' | 'git' | 'filesystem' | 'github' | 'web' | 'email' | 'integrations' | 'finance_guard';

export const AutonomousToolsModal: React.FC<AutonomousToolsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('approvals');
  const [loading, setLoading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Emergency Control State
  const [emergency, setEmergency] = useState<EmergencyControlState>({ emergencyPaused: false });

  // Approvals State
  const [pendingApprovals, setPendingApprovals] = useState<PermissionActionRequest[]>([]);
  const [allApprovals, setAllApprovals] = useState<PermissionActionRequest[]>([]);

  // Git State
  const [gitStatus, setGitStatus] = useState<any>(null);
  const [gitCommits, setGitCommits] = useState<string[]>([]);
  const [gitDiff, setGitDiff] = useState<string>('');

  // Filesystem State
  const [fsPath, setFsPath] = useState<string>('.');
  const [fsFiles, setFsFiles] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [newFileName, setNewFileName] = useState<string>('');
  const [newFileContent, setNewFileContent] = useState<string>('');

  // GitHub State
  const [githubStatus, setGithubStatus] = useState<any>(null);
  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [issueRepo, setIssueRepo] = useState<string>('');
  const [issueTitle, setIssueTitle] = useState<string>('');
  const [issueBody, setIssueBody] = useState<string>('');

  // Web Research State
  const [webUrl, setWebUrl] = useState<string>('https://news.ycombinator.com');
  const [webResult, setWebResult] = useState<any>(null);

  // Email State
  const [emailStatus, setEmailStatus] = useState<any>(null);

  // Integrations Audit State
  const [auditReport, setAuditReport] = useState<{
    summary: { total: number; connected: number; notConfigured: number };
    items: IntegrationAuditItem[];
  } | null>(null);

  // Load initial data on open
  useEffect(() => {
    if (isOpen) {
      fetchEmergencyStatus();
      fetchApprovals();
      fetchGitStatus();
      fetchFsList('.');
      fetchGithubData();
      fetchEmailStatus();
      fetchIntegrationsAudit();
    }
  }, [isOpen]);

  const showFeedback = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 5000);
  };

  // 1. Emergency Controls
  const fetchEmergencyStatus = async () => {
    try {
      const res = await fetch('/api/emergency/status');
      const data = await res.json();
      setEmergency(data);
    } catch {
      // safe fallback
    }
  };

  const handleToggleEmergency = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/emergency/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedBy: 'HUMAN_WEB_OPERATOR', reason: 'Operator manual toggle' }),
      });
      const data = await res.json();
      setEmergency(data);
      showFeedback(
        data.emergencyPaused
          ? '🚨 EMERGENCY STOP ACTIVATED: All autonomous actions paused.'
          : '🟢 EMERGENCY STOP DEACTIVATED: Normal operations resumed.',
        data.emergencyPaused ? 'error' : 'success'
      );
      fetchApprovals();
    } catch (err: any) {
      showFeedback('Failed to toggle emergency state: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 2. Approvals Gate
  const fetchApprovals = async () => {
    try {
      const [pendingRes, allRes] = await Promise.all([
        fetch('/api/approvals/pending').then((r) => r.json()),
        fetch('/api/approvals/all').then((r) => r.json()),
      ]);
      setPendingApprovals(pendingRes.pending || []);
      setAllApprovals(allRes.requests || []);
    } catch {
      // safe fallback
    }
  };

  const handleResolveApproval = async (id: string, decision: 'APPROVE' | 'REJECT') => {
    setLoading(true);
    try {
      const res = await fetch('/api/approvals/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, decision, approver: 'HUMAN_OPERATOR_WEB_GATE' }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(
          decision === 'APPROVE'
            ? `✅ Action executed successfully: ${data.request?.exactAction}`
            : `❌ Action rejected and safely cancelled.`,
          decision === 'APPROVE' ? 'success' : 'error'
        );
      } else {
        showFeedback(data.error || 'Execution blocked', 'error');
      }
      fetchApprovals();
    } catch (err: any) {
      showFeedback('Approval request failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 3. Git Tools
  const fetchGitStatus = async () => {
    try {
      const [statusRes, logRes, diffRes] = await Promise.all([
        fetch('/api/tools/git/status', { method: 'POST' }).then((r) => r.json()),
        fetch('/api/tools/git/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count: 5 }) }).then((r) => r.json()),
        fetch('/api/tools/git/diff', { method: 'POST' }).then((r) => r.json()),
      ]);
      setGitStatus(statusRes);
      setGitCommits(logRes.commits || []);
      setGitDiff(diffRes.diff || '');
    } catch {
      // safe fallback
    }
  };

  // 4. Filesystem Tools
  const fetchFsList = async (pathTarget: string) => {
    try {
      const res = await fetch('/api/tools/fs/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathTarget }),
      });
      const data = await res.json();
      if (data.success) {
        setFsFiles(data.files || []);
        setFsPath(pathTarget);
      }
    } catch {
      // safe fallback
    }
  };

  const handleReadFile = async (fileNameWithIcon: string) => {
    const cleanName = fileNameWithIcon.replace(/^[📁📄]\s*/, '').trim();
    if (fileNameWithIcon.startsWith('📁')) {
      const newSub = fsPath === '.' ? cleanName : `${fsPath}/${cleanName}`;
      fetchFsList(newSub);
      return;
    }

    const fullPath = fsPath === '.' ? cleanName : `${fsPath}/${cleanName}`;
    setSelectedFile(fullPath);
    try {
      const res = await fetch('/api/tools/fs/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath }),
      });
      const data = await res.json();
      if (data.success) {
        setFileContent(data.content || '');
      } else {
        showFeedback(data.error || 'Failed to read file', 'error');
      }
    } catch (err: any) {
      showFeedback('Error reading file: ' + err.message, 'error');
    }
  };

  const handleCreateOrSaveFile = async () => {
    if (!newFileName.trim()) {
      showFeedback('Please provide a file name.', 'error');
      return;
    }
    const target = fsPath === '.' ? newFileName.trim() : `${fsPath}/${newFileName.trim()}`;
    setLoading(true);
    try {
      const res = await fetch('/api/tools/fs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: target, content: newFileContent }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback(`File written successfully: ${target} (${data.bytesWritten} bytes)`);
        setNewFileName('');
        setNewFileContent('');
        fetchFsList(fsPath);
      } else {
        showFeedback(data.error || 'File write failed', 'error');
      }
    } catch (err: any) {
      showFeedback('Write error: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 5. GitHub Tools
  const fetchGithubData = async () => {
    try {
      const [statusRes, reposRes] = await Promise.all([
        fetch('/api/tools/github/status', { method: 'POST' }).then((r) => r.json()),
        fetch('/api/tools/github/repos', { method: 'POST' }).then((r) => r.json()),
      ]);
      setGithubStatus(statusRes);
      setGithubRepos(reposRes.repos || []);
    } catch {
      // safe fallback
    }
  };

  const handleQueueGithubIssue = async () => {
    if (!issueRepo || !issueTitle) {
      showFeedback('Repository and issue title are required.', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/approvals/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exactAction: `Create GitHub Issue on ${issueRepo}`,
          target: `GitHub Repository: ${issueRepo}`,
          contentChanges: `Title: "${issueTitle}" | Body: "${issueBody || '(No description)'}"`,
          level: 4,
          source: 'web_terminal',
          platform: 'GitHub',
          actionPayload: { repo: issueRepo, title: issueTitle, body: issueBody },
        }),
      });
      const data = await res.json();
      if (data.success) {
        showFeedback('Level 4 Approval Queued! Authorize the action in the Approvals tab.');
        setIssueTitle('');
        setIssueBody('');
        fetchApprovals();
        setActiveTab('approvals');
      } else {
        showFeedback(data.reason || 'Failed to queue issue action', 'error');
      }
    } catch (err: any) {
      showFeedback('Error queuing issue: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 6. Web Research
  const handleFetchWeb = async () => {
    if (!webUrl.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/tools/web/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webUrl.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setWebResult(data);
        showFeedback(`Successfully fetched and cleaned "${data.title}"`);
      } else {
        showFeedback(data.error || 'Failed to fetch web content', 'error');
      }
    } catch (err: any) {
      showFeedback('Web research error: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 7. Email & Integrations Audit
  const fetchEmailStatus = async () => {
    try {
      const res = await fetch('/api/tools/email/status', { method: 'POST' });
      const data = await res.json();
      setEmailStatus(data);
    } catch {
      // safe fallback
    }
  };

  const fetchIntegrationsAudit = async () => {
    try {
      const res = await fetch('/api/tools/integrations/audit');
      const data = await res.json();
      setAuditReport(data);
    } catch {
      // safe fallback
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-6xl max-h-[92vh] bg-slate-900 border border-cyan-500/40 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950/80 border border-cyan-500/50 flex items-center justify-center text-cyan-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">AUTONOMOUS TOOLS HUB</h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-mono font-bold">
                  LEVEL 1-4 GATED
                </span>
                {emergency.emergencyPaused ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-rose-950 border border-rose-500 text-rose-300 font-mono font-bold animate-pulse">
                    🚨 EMERGENCY STOP ACTIVE
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300 font-mono">
                    🟢 DAEMON ACTIVE
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Real Workspace Control • GitHub REST • Filesystem • Safe Web Research • Truth-in-Execution Audit
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Emergency Toggle Button */}
            <button
              onClick={handleToggleEmergency}
              className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 transition-all shadow-md ${
                emergency.emergencyPaused
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
              }`}
              title={emergency.emergencyPaused ? 'Click to Resume System' : 'Click to Emergency Stop All Actions'}
            >
              <AlertOctagon className="w-4 h-4" />
              <span>{emergency.emergencyPaused ? 'RESUME SYSTEM' : 'EMERGENCY STOP'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {actionMessage && (
          <div
            className={`px-4 py-2 text-xs font-mono font-semibold flex items-center gap-2 transition-all ${
              actionMessage.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-200 border-b border-emerald-800'
                : 'bg-rose-950/90 text-rose-200 border-b border-rose-800'
            }`}
          >
            {actionMessage.type === 'success' ? <Check className="w-4 h-4" /> : <AlertOctagon className="w-4 h-4" />}
            <span>{actionMessage.text}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-800/80 bg-slate-950/40 overflow-x-auto text-xs font-mono scrollbar-thin">
          <button
            onClick={() => setActiveTab('approvals')}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 shrink-0 transition-all font-semibold ${
              activeTab === 'approvals'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50 shadow-sm'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Human Approvals Gate</span>
            {pendingApprovals.length > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-bold text-[10px] flex items-center justify-center animate-pulse">
                {pendingApprovals.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('git')}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 shrink-0 transition-all font-semibold ${
              activeTab === 'git'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <GitBranch className="w-4 h-4 text-cyan-400" />
            <span>Git & Repo</span>
          </button>

          <button
            onClick={() => setActiveTab('filesystem')}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 shrink-0 transition-all font-semibold ${
              activeTab === 'filesystem'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <FolderTree className="w-4 h-4 text-emerald-400" />
            <span>Workspace Files</span>
          </button>

          <button
            onClick={() => setActiveTab('github')}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 shrink-0 transition-all font-semibold ${
              activeTab === 'github'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <GitFork className="w-4 h-4 text-slate-200" />
            <span>GitHub API</span>
          </button>

          <button
            onClick={() => setActiveTab('web')}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 shrink-0 transition-all font-semibold ${
              activeTab === 'web'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Globe className="w-4 h-4 text-blue-400" />
            <span>Web Research</span>
          </button>

          <button
            onClick={() => setActiveTab('email')}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 shrink-0 transition-all font-semibold ${
              activeTab === 'email'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Mail className="w-4 h-4 text-purple-400" />
            <span>Email Conduit</span>
          </button>

          <button
            onClick={() => setActiveTab('integrations')}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 shrink-0 transition-all font-semibold ${
              activeTab === 'integrations'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/50'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Layers className="w-4 h-4 text-teal-400" />
            <span>Integrations Diagnostics</span>
          </button>

          <button
            onClick={() => setActiveTab('finance_guard')}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 shrink-0 transition-all font-semibold ${
              activeTab === 'finance_guard'
                ? 'bg-rose-950 text-rose-300 border border-rose-500/50'
                : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            <Ban className="w-4 h-4 text-rose-400" />
            <span>Finance Exclusion Policy</span>
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* TAB 1: HUMAN APPROVALS GATE */}
          {activeTab === 'approvals' && (
            <div className="space-y-4">
              <PermissionGateway isStandalone={true} />
            </div>
          )}

          {/* TAB 2: GIT & REPOSITORY */}
          {activeTab === 'git' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-cyan-400" />
                    Local Git Repository Controller
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Real branch status, commit history, and diff inspection for the Oracle VM workspace.
                  </p>
                </div>
                <button
                  onClick={fetchGitStatus}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-cyan-300 flex items-center gap-1"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Refresh Git</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Branch & Working Tree</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Current Branch:</span>
                    <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-bold">
                      {gitStatus?.branch || 'main'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
                    {gitStatus?.statusText || 'Working tree clean.'}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">Recent Commit Log</span>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {gitCommits.map((c, i) => (
                      <div key={i} className="p-2 rounded bg-slate-900 border border-slate-800/80 text-slate-300">
                        {c}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 font-mono text-xs">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Working Tree Diff</span>
                <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {gitDiff || 'No uncommitted differences.'}
                </pre>
              </div>
            </div>
          )}

          {/* TAB 3: FILESYSTEM EXPLORER */}
          {activeTab === 'filesystem' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <FolderTree className="w-5 h-5 text-emerald-400" />
                    Workspace Filesystem Explorer
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Safe directory browsing, file reader, and Level 3 modifier locked to project root.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchFsList('.')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-300"
                  >
                    Root /
                  </button>
                  <button
                    onClick={() => fetchFsList(fsPath)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-emerald-300 flex items-center gap-1"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* File List */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 uppercase font-bold">Path: {fsPath}</span>
                    <span className="text-[10px] text-slate-500">{fsFiles.length} items</span>
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {fsFiles.map((f, i) => (
                      <button
                        key={i}
                        onClick={() => handleReadFile(f)}
                        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-800/80 text-slate-300 hover:text-white transition-colors truncate"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* File Viewer */}
                <div className="md:col-span-2 p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 uppercase font-bold truncate">
                      Viewing: {selectedFile || 'Select a file to inspect'}
                    </span>
                    {selectedFile && (
                      <span className="text-[10px] text-emerald-400">Level 1 Read Safe</span>
                    )}
                  </div>
                  <textarea
                    value={fileContent}
                    readOnly
                    placeholder="File contents will appear here..."
                    className="w-full h-44 p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-mono text-xs resize-none"
                  />
                </div>
              </div>

              {/* Create / Write File Tool */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  Create / Write Workspace File (Level 3 Modify)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="File Name (e.g. notes.txt or src/config.json)"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={handleCreateOrSaveFile}
                    disabled={loading || emergency.emergencyPaused}
                    className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>Write File to Workspace</span>
                  </button>
                </div>
                <textarea
                  placeholder="File content to save..."
                  value={newFileContent}
                  onChange={(e) => setNewFileContent(e.target.value)}
                  className="w-full h-24 p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-mono text-xs resize-none focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          )}

          {/* TAB 4: GITHUB REST API */}
          {activeTab === 'github' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <GitFork className="w-5 h-5 text-white" />
                    GitHub REST API Conduit
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Real user profile verification, repository listing, and Level 4 permission-gated issue dispatch.
                  </p>
                </div>
                <button
                  onClick={fetchGithubData}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-cyan-300 flex items-center gap-1"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Refresh GitHub</span>
                </button>
              </div>

              {/* Status Banner */}
              <div
                className={`p-4 rounded-xl border flex items-center justify-between font-mono text-xs ${
                  githubStatus?.connected
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                    : 'bg-amber-950/60 border-amber-500/40 text-amber-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  {githubStatus?.avatarUrl ? (
                    <img
                      src={githubStatus.avatarUrl}
                      alt="GitHub Avatar"
                      className="w-9 h-9 rounded-full border border-emerald-400"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <GitFork className="w-6 h-6" />
                  )}
                  <div>
                    <span className="font-bold">{githubStatus?.message || 'Inspecting GitHub connection...'}</span>
                    {githubStatus?.publicRepos !== undefined && (
                      <p className="text-[10px] text-slate-400">Public Repos: {githubStatus.publicRepos}</p>
                    )}
                  </div>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                    githubStatus?.connected
                      ? 'bg-emerald-900 border border-emerald-500 text-emerald-300'
                      : 'bg-amber-900 border border-amber-500 text-amber-300'
                  }`}
                >
                  {githubStatus?.connected ? 'AUTHENTICATED' : 'NOT CONNECTED'}
                </span>
              </div>

              {/* Repositories List */}
              {githubRepos.length > 0 && (
                <div className="space-y-3 font-mono text-xs">
                  <span className="text-[10px] text-slate-500 uppercase font-bold">
                    User Repositories ({githubRepos.length})
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                    {githubRepos.map((r, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                      >
                        <div className="truncate">
                          <span className="text-white font-bold block truncate">{r.fullName}</span>
                          <span className="text-[10px] text-slate-500 truncate">{r.description || 'No description'}</span>
                        </div>
                        <button
                          onClick={() => setIssueRepo(r.fullName)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-cyan-950 text-cyan-300 text-[10px] shrink-0 border border-slate-700"
                        >
                          Select for Issue
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Create Issue Action Gate */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                <span className="text-[10px] text-slate-500 uppercase font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  Queue GitHub Issue (Level 4 Human Approval Required)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Repository (e.g. owner/repo)"
                    value={issueRepo}
                    onChange={(e) => setIssueRepo(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                  <input
                    type="text"
                    placeholder="Issue Title"
                    value={issueTitle}
                    onChange={(e) => setIssueTitle(e.target.value)}
                    className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <textarea
                  placeholder="Issue Body / Description..."
                  value={issueBody}
                  onChange={(e) => setIssueBody(e.target.value)}
                  className="w-full h-20 p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-mono text-xs resize-none focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={handleQueueGithubIssue}
                  disabled={loading || emergency.emergencyPaused}
                  className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Queue for Human Approval</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: CONTROLLED WEB RESEARCH */}
          {activeTab === 'web' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Globe className="w-5 h-5 text-blue-400" />
                  Controlled Web Research Engine
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Safely retrieves public web pages, strips scripts/ads, and extracts structured text for autonomous research.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Target URL (e.g. https://news.ycombinator.com)"
                  value={webUrl}
                  onChange={(e) => setWebUrl(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={handleFetchWeb}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl bg-cyan-700 hover:bg-cyan-600 text-white font-bold font-mono text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Search className="w-4 h-4" />
                  <span>Fetch & Extract</span>
                </button>
              </div>

              {webResult && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-bold text-sm truncate">{webResult.title}</span>
                    <span className="text-[10px] text-cyan-400">{webResult.url}</span>
                  </div>
                  <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {webResult.textContent}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: EMAIL & COMMUNICATIONS */}
          {activeTab === 'email' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Mail className="w-5 h-5 text-purple-400" />
                  Outbound Communications & SMTP Gateway
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  Level 4 permission-gated conduit for client quotations, notifications, and inquiries.
                </p>
              </div>

              <div
                className={`p-4 rounded-xl border flex items-center justify-between font-mono text-xs ${
                  emailStatus?.configured
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                    : 'bg-amber-950/60 border-amber-500/40 text-amber-200'
                }`}
              >
                <div>
                  <span className="font-bold block">{emailStatus?.service || 'SMTP Gateway'}</span>
                  <p className="text-[10px] text-slate-400">{emailStatus?.message}</p>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                    emailStatus?.configured
                      ? 'bg-emerald-900 border border-emerald-500 text-emerald-300'
                      : 'bg-amber-900 border border-amber-500 text-amber-300'
                  }`}
                >
                  {emailStatus?.configured ? 'READY' : 'NOT CONFIGURED'}
                </span>
              </div>
            </div>
          )}

          {/* TAB 7: INTEGRATIONS DIAGNOSTICS */}
          {activeTab === 'integrations' && auditReport && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Layers className="w-5 h-5 text-teal-400" />
                    Truth-in-Execution Integrations Matrix
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Zero fake success states. Audits all official OAuth and REST API integrations for real credentials.
                  </p>
                </div>
                <div className="flex items-center gap-2 font-mono text-xs">
                  <span className="px-2.5 py-1 rounded bg-emerald-950 border border-emerald-500/40 text-emerald-300">
                    {auditReport.summary.connected} Connected
                  </span>
                  <span className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300">
                    {auditReport.summary.notConfigured} Pending Setup
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {auditReport.items.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white font-bold text-sm">{item.name}</span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          item.status === 'REAL_WORKING'
                            ? 'bg-emerald-950 border border-emerald-500/40 text-emerald-300'
                            : 'bg-amber-950 border border-amber-500/40 text-amber-300'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>

                    <p className="text-slate-400 text-xs">{item.reason}</p>

                    <div className="flex flex-wrap gap-1">
                      {item.capabilities.map((cap, i) => (
                        <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300">
                          {cap}
                        </span>
                      ))}
                    </div>

                    {item.requiredEnvVars.length > 0 && (
                      <div className="pt-2 border-t border-slate-800/80 space-y-1">
                        <span className="text-[10px] text-slate-500 uppercase font-bold">Required Environment Keys:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {item.requiredEnvVars.map((env, i) => (
                            <span
                              key={i}
                              className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                                env.configured
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-slate-900 text-slate-400 border border-slate-800'
                              }`}
                            >
                              {env.key} {env.configured ? '✓' : '✗'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 8: STRICT FINANCE EXCLUSION POLICY */}
          {activeTab === 'finance_guard' && (
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-rose-950/40 border-2 border-rose-500/50 space-y-4 font-mono text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-rose-900/80 border border-rose-500 flex items-center justify-center text-rose-200 shrink-0">
                    <Ban className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white uppercase tracking-wider">
                      STRICT FINANCE EXCLUSION SECURITY POLICY
                    </h3>
                    <p className="text-xs text-rose-300">
                      System-wide hardcoded safety barrier enforcing zero access to financial or monetary systems.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-rose-900/60 space-y-2 text-slate-300">
                  <h4 className="text-xs font-bold text-rose-400 uppercase">Policy Rules & Scope:</h4>
                  <ul className="list-disc pl-5 space-y-1 text-xs">
                    <li><strong>Zero Banking Access:</strong> JARVIS cannot access bank portals, account balances, or statements.</li>
                    <li><strong>Zero UPI & Payments:</strong> GPay, PhonePe, Paytm, BHIM, cards, and payment links are completely blocked.</li>
                    <li><strong>Zero Crypto & Trading:</strong> Bitcoin, Ethereum, USDT, Binance, and stock trading actions are strictly rejected.</li>
                    <li><strong>Zero Money Movement:</strong> No funds transfer, payouts, loan applications, or financial approvals.</li>
                  </ul>
                </div>

                <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                  <span>
                    Security status: <strong>FINANCE SAFETY LOCK ACTIVE (100% EXCLUDED)</strong>. Any user request or autonomous intent referencing financial transactions is automatically intercepted and terminated.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
