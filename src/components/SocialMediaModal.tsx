import React, { useState, useEffect } from 'react';
import {
  X,
  Share2,
  Sparkles,
  CheckCircle2,
  ShieldAlert,
  Send,
  RefreshCw,
  Copy,
  Check,
  Smartphone,
  Eye,
  ExternalLink,
  Key,
  Globe,
  Radio,
  SlidersHorizontal,
  Layers,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  UserCheck,
  LogOut,
  ShieldCheck,
  Link2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { SocialMediaPostDraft, PlatformIntegrationInfo, SocialPlatformKey } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSpeak: (text: string) => void;
}

export const SocialMediaModal: React.FC<Props> = ({ isOpen, onClose, onSpeak }) => {
  const [activeTab, setActiveTab] = useState<'drafts' | 'platforms'>('drafts');
  const [posts, setPosts] = useState<SocialMediaPostDraft[]>([]);
  const [selectedPost, setSelectedPost] = useState<SocialMediaPostDraft | null>(null);
  const [topicPrompt, setTopicPrompt] = useState<string>('');
  const [platform, setPlatform] = useState<string>('LinkedIn');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedRedirectUri, setCopiedRedirectUri] = useState<boolean>(false);

  // Platform Integration Hub State
  const [platforms, setPlatforms] = useState<PlatformIntegrationInfo[]>([]);
  const [testingPlatform, setTestingPlatform] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; status: string; message: string; accountName?: string }>>({});
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>('linkedin');
  const [isConnectingOAuth, setIsConnectingOAuth] = useState<boolean>(false);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchPosts();
      fetchPlatforms();
    }
  }, [isOpen]);

  // Listen for OAuth Popup PostMessages
  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'LINKEDIN_OAUTH_SUCCESS') {
        setIsConnectingOAuth(false);
        setOauthError(null);
        setOauthNotice(`✅ Successfully authorized Personal Profile for ${event.data.member?.name || 'LinkedIn Member'}!`);
        fetchPlatforms();
        fetchPosts();
        onSpeak(`LinkedIn personal profile connected successfully for ${event.data.member?.name || 'Member'}, Sir.`);
      } else if (event.data?.type === 'LINKEDIN_OAUTH_ERROR') {
        setIsConnectingOAuth(false);
        setOauthError(`LinkedIn OAuth error: ${event.data.error || 'Authorization cancelled'}`);
        setOauthNotice(null);
        onSpeak('LinkedIn connection was not completed, Sir.');
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [onSpeak]);

  const fetchPosts = async () => {
    try {
      const res = await fetch('/api/social/posts');
      const data = await res.json();
      if (data.posts) {
        setPosts(data.posts);
        if (!selectedPost && data.posts.length > 0) {
          setSelectedPost(data.posts[0]);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch posts:', err);
    }
  };

  const fetchPlatforms = async () => {
    try {
      const res = await fetch('/api/social/platforms');
      const data = await res.json();
      if (data.platforms) {
        setPlatforms(data.platforms);
      }
    } catch (err) {
      console.warn('Failed to fetch platform integrations:', err);
    }
  };

  const handleConnectLinkedIn = async () => {
    setIsConnectingOAuth(true);
    setOauthError(null);
    setOauthNotice(null);

    try {
      const redirectUri = window.location.origin + '/api/auth/linkedin/callback';
      const res = await fetch(`/api/auth/linkedin/url?redirect_uri=${encodeURIComponent(redirectUri)}`);
      const data = await res.json();

      if (!data.success || !data.url) {
        setIsConnectingOAuth(false);
        setOauthError(data.message || 'LINKEDIN_CLIENT_ID is missing. Please configure it in AI Studio Settings (⚙️).');
        onSpeak('Sir, LINKEDIN_CLIENT_ID is required before launching OAuth. Please check settings.');
        return;
      }

      // Open OAuth Authorization Popup directly to provider URL
      const width = 600;
      const height = 720;
      const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

      const popup = window.open(
        data.url,
        'linkedin_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,status=yes`
      );

      if (!popup || popup.closed) {
        setIsConnectingOAuth(false);
        setOauthError('Popup window was blocked by browser. Please allow popups for this site.');
      }
    } catch (err: any) {
      setIsConnectingOAuth(false);
      setOauthError(`OAuth initiation error: ${err.message}`);
    }
  };

  const handleDisconnectLinkedIn = async () => {
    try {
      const res = await fetch('/api/auth/linkedin/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setOauthNotice('LinkedIn personal profile disconnected.');
        fetchPlatforms();
        onSpeak('LinkedIn personal profile disconnected, Sir.');
      }
    } catch (err) {
      console.warn('Disconnect error:', err);
    }
  };

  const handleCopyRedirectUri = (uri: string) => {
    navigator.clipboard.writeText(uri);
    setCopiedRedirectUri(true);
    setTimeout(() => setCopiedRedirectUri(false), 2500);
  };

  const handleTestConnection = async (platformKey: SocialPlatformKey) => {
    setTestingPlatform(platformKey);
    try {
      const res = await fetch('/api/social/platforms/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: platformKey }),
      });
      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [platformKey]: data,
      }));
      if (data.success) {
        onSpeak(`${platformKey} connection verified live, Sir.`);
      } else {
        onSpeak(`${platformKey} connection reported: ${data.status}. Check configuration.`);
      }
      fetchPlatforms();
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [platformKey]: { success: false, status: 'ERROR', message: err.message },
      }));
    } finally {
      setTestingPlatform(null);
    }
  };

  const handleGeneratePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicPrompt.trim() || isGenerating) return;

    setIsGenerating(true);
    try {
      const res = await fetch('/api/social/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topicPrompt, platform }),
      });
      const data = await res.json();
      if (data.success) {
        setPosts((prev) => [data.post, ...prev]);
        setSelectedPost(data.post);
        setTopicPrompt('');
        onSpeak(`Post prepared for ${platform}. It is queued in Human Approval Mode.`);
      }
    } catch (err) {
      console.warn('Post generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAction = async (postId: string, action: 'approve_and_publish' | 'reject') => {
    try {
      const res = await fetch('/api/social/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, action }),
      });
      const data = await res.json();
      if (data.success) {
        fetchPosts();
        if (selectedPost?.id === postId) {
          setSelectedPost(data.post);
        }
        if (action === 'approve_and_publish') {
          onSpeak(data.message || 'Post verified and broadcast complete, Sir.');
        } else {
          onSpeak('Post draft rejected and kept offline.');
        }
      } else {
        fetchPosts();
        if (selectedPost?.id === postId) {
          setSelectedPost(data.post || selectedPost);
        }
        onSpeak(data.message || 'Publishing held: missing credentials.');
      }
    } catch (err) {
      console.warn('Social action failed:', err);
    }
  };

  const handleCopyPost = () => {
    if (selectedPost) {
      navigator.clipboard.writeText(selectedPost.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const linkedInInfo = platforms.find((p) => p.id === 'linkedin');
  const isLinkedInConnected = linkedInInfo?.status === 'CONNECTED';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in font-sans">
      <div className="bg-slate-900 border border-purple-800/50 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-950 border border-purple-500/30 text-purple-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">Multi-Social Media & Growth Engine</h2>
                <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3 text-emerald-400" />
                  Level 4 Approval Active
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Official APIs for LinkedIn, Facebook, Instagram, YouTube & X/Twitter with Zero Fake Success
              </p>
            </div>
          </div>

          {/* Tab Switcher & Close */}
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveTab('drafts')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'drafts'
                    ? 'bg-purple-900/60 text-purple-200 border border-purple-700/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Drafts & Queue ({posts.length})
              </button>
              <button
                onClick={() => setActiveTab('platforms')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'platforms'
                    ? 'bg-purple-900/60 text-purple-200 border border-purple-700/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                Platform Hub (5)
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

        {/* Global OAuth Feedback Notification */}
        {oauthNotice && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-950/80 border border-emerald-600/50 text-emerald-200 text-xs flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{oauthNotice}</span>
            </div>
            <button onClick={() => setOauthNotice(null)} className="text-emerald-400 hover:text-emerald-200 text-xs font-mono">Dismiss</button>
          </div>
        )}
        {oauthError && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-950/80 border border-rose-600/50 text-rose-200 text-xs flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{oauthError}</span>
            </div>
            <button onClick={() => setOauthError(null)} className="text-rose-400 hover:text-rose-200 text-xs font-mono">Dismiss</button>
          </div>
        )}

        {/* Modal Body */}
        {activeTab === 'drafts' ? (
          <div className="flex-1 flex flex-col md:flex-row min-h-0 bg-slate-950/30">
            {/* Left: Generator Form & Posts List */}
            <div className="w-full md:w-5/12 border-r border-slate-800 p-4 overflow-y-auto flex flex-col gap-4 bg-slate-950/40">
              {/* Quick Generator Box */}
              <form
                onSubmit={handleGeneratePost}
                className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-3 shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider">
                    Generate New Post Draft
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">Level 2 AI Auto-Rule</span>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {['LinkedIn', 'Facebook Page', 'Instagram', 'YouTube', 'Twitter/X', 'Telegram'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPlatform(p)}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-mono transition-colors truncate ${
                        platform === p
                          ? 'bg-purple-950 border border-purple-500 text-purple-200 font-bold'
                          : 'bg-slate-950 text-slate-400 border border-slate-800 hover:bg-slate-800/60'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={topicPrompt}
                  onChange={(e) => setTopicPrompt(e.target.value)}
                  placeholder="Topic: e.g. 'How Oracle Free ARM VM runs Jarvis'..."
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />

                <button
                  type="submit"
                  disabled={isGenerating || !topicPrompt.trim()}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isGenerating ? 'Drafting with Gemini...' : `Draft Post for ${platform}`}
                </button>
              </form>

              {/* Posts Queue */}
              <div className="flex flex-col gap-2">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                  Drafts & Published Queue ({posts.length})
                </span>

                {posts.map((post) => {
                  const isSelected = selectedPost?.id === post.id;
                  return (
                    <button
                      key={post.id}
                      onClick={() => setSelectedPost(post)}
                      className={`p-3 rounded-xl text-left border transition-all flex flex-col gap-1 ${
                        isSelected
                          ? 'bg-purple-950/40 border-purple-500/50'
                          : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">{post.platform}</span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                            post.finalTruthState === 'VERIFIED' || post.status === 'published'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : post.status === 'not_published' || post.finalTruthState === 'NOT_PUBLISHED'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : post.status === 'failed' || post.finalTruthState === 'FAILED'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : post.status === 'pending_approval'
                              ? 'bg-purple-950 text-purple-300 border border-purple-800 animate-pulse'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {post.finalTruthState ? post.finalTruthState : post.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">{post.topic}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Preview & Human Approval Screen */}
            {selectedPost ? (
              <div className="w-full md:w-7/12 p-6 overflow-y-auto flex flex-col gap-5 bg-slate-900/40">
                {/* LinkedIn Personal Member Channel Status Bar */}
                {selectedPost.platform === 'LinkedIn' && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#0077b5]/20 border border-[#0077b5]/40 flex items-center justify-center font-bold text-xs text-[#0077b5]">
                        in
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-200">
                            Target: Personal Member Profile
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-blue-950 text-blue-300 border border-blue-800">
                            Posts API (2025/v2)
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono">
                          {isLinkedInConnected
                            ? (linkedInInfo?.accountName || 'Authenticated Member')
                            : 'Not Connected — Connect via OAuth'}
                        </p>
                      </div>
                    </div>

                    {!isLinkedInConnected ? (
                      <button
                        onClick={handleConnectLinkedIn}
                        disabled={isConnectingOAuth}
                        className="px-3 py-1.5 rounded-lg bg-[#0077b5] hover:bg-[#006097] text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {isConnectingOAuth ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                        Connect LinkedIn
                      </button>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                        <Check className="w-3 h-3" /> Ready
                      </span>
                    )}
                  </div>
                )}

                {/* Human Approval Warning Banner */}
                {selectedPost.status === 'pending_approval' && (
                  <div className="p-4 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-200 flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex-1 text-xs">
                      <span className="font-bold block mb-0.5">HUMAN APPROVAL REQUIRED (LEVEL 4 ACTION)</span>
                      JARVIS strictly requires your explicit authorization before publishing. State machine flow: <code className="text-amber-300">DRAFT ➔ APPROVAL_REQUIRED ➔ APPROVED ➔ EXECUTING ➔ API_CONFIRMED ➔ VERIFIED</code>.
                    </div>
                  </div>
                )}

                {/* Post Content Display */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400">
                      Target Channel: <span className="text-purple-400 font-bold">{selectedPost.platform}</span>
                    </span>
                    <button
                      onClick={handleCopyPost}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono flex items-center gap-1 transition-colors"
                    >
                      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copied ? 'Copied' : 'Copy Text'}
                    </button>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs leading-relaxed whitespace-pre-wrap font-sans shadow-inner">
                    {selectedPost.content}
                  </div>
                </div>

                {/* Creative Visual Asset Prompt */}
                {selectedPost.creativePrompt && (
                  <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs font-mono flex flex-col gap-1">
                    <span className="text-slate-400">Creative Graphic Asset Prompt:</span>
                    <span className="text-cyan-300 text-[11px]">"{selectedPost.creativePrompt}"</span>
                  </div>
                )}

                {/* Verification & Error Diagnostics */}
                {selectedPost.errorReason && (
                  <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800 text-xs font-mono flex flex-col gap-1 text-amber-200">
                    <span className="font-bold flex items-center gap-1 text-amber-400">
                      <ShieldAlert className="w-3.5 h-3.5" /> Verification Notice:
                    </span>
                    <span className="text-[11px] leading-relaxed">{selectedPost.errorReason}</span>
                  </div>
                )}

                {selectedPost.providerUrn && (
                  <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800 text-xs font-mono flex items-center justify-between text-emerald-200">
                    <span>Provider Live ID:</span>
                    <span className="text-emerald-400 font-bold text-[11px]">{selectedPost.providerUrn}</span>
                  </div>
                )}

                {/* Approval Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                  <div className="text-xs font-mono text-slate-400">
                    {selectedPost.status === 'published' || selectedPost.finalTruthState === 'VERIFIED' ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        Live & Verified
                      </span>
                    ) : selectedPost.status === 'not_published' || selectedPost.finalTruthState === 'NOT_PUBLISHED' ? (
                      <span className="text-amber-400 font-bold flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4" />
                        Held in Draft (No Fake Success)
                      </span>
                    ) : (
                      <span>Status: Awaiting Human Action</span>
                    )}
                  </div>

                  {selectedPost.status === 'pending_approval' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(selectedPost.id, 'reject')}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
                      >
                        Reject Draft
                      </button>
                      <button
                        onClick={() => handleAction(selectedPost.id, 'approve_and_publish')}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-950"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        YES, Approve & Publish (Level 4)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="w-full md:w-7/12 p-8 flex items-center justify-center text-slate-500 text-xs font-mono">
                Select or generate a social media draft to review.
              </div>
            )}
          </div>
        ) : (
          /* Multi-Platform Integration Hub */
          <div className="flex-1 p-6 overflow-y-auto bg-slate-950/40 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-purple-400" />
                  Connected Platforms & Official OAuth Status
                </h3>
                <p className="text-xs text-slate-400">
                  LinkedIn Personal Profile 3-legged OAuth 2.0 flow with 1-click browser popup connection and zero fake claims.
                </p>
              </div>
              <button
                onClick={fetchPlatforms}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh Status
              </button>
            </div>

            {/* Platform Cards Grid */}
            <div className="flex flex-col gap-4">
              {platforms.map((p) => {
                const isExpanded = expandedPlatform === p.id;
                const testResult = testResults[p.id];
                const isTesting = testingPlatform === p.id;
                const isLinkedIn = p.id === 'linkedin';
                const oauth = p.oauthStatus;

                return (
                  <div
                    key={p.id}
                    className={`p-5 rounded-2xl border flex flex-col gap-4 shadow-xl transition-all ${
                      isLinkedIn && p.status === 'CONNECTED'
                        ? 'bg-slate-900 border-[#0077b5]/40 shadow-blue-950/20'
                        : 'bg-slate-900/90 border-slate-800'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center font-mono font-bold text-sm ${
                            isLinkedIn
                              ? 'bg-[#0077b5]/20 border border-[#0077b5]/40 text-[#0077b5]'
                              : 'bg-slate-950 border border-slate-800 text-purple-400'
                          }`}
                        >
                          {isLinkedIn ? 'in' : p.id.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-slate-100">{p.name}</h4>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                              {p.category}
                            </span>
                            {isLinkedIn && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-blue-300 border border-blue-800 font-semibold">
                                Personal Profile
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 font-mono">
                            {p.accountName
                              ? `Authenticated: ${p.accountName}`
                              : 'Status: Ready for 1-Click OAuth Connection'}
                          </p>
                        </div>
                      </div>

                      {/* Action Buttons & Status Badge */}
                      <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Status Badge */}
                        <span
                          className={`px-3 py-1 rounded-lg text-xs font-mono font-bold border ${
                            p.status === 'CONNECTED' || p.status === 'VERIFIED'
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                              : p.status === 'AUTH_REQUIRED' || p.status === 'EXPIRED'
                              ? 'bg-amber-950/80 text-amber-300 border-amber-700'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {p.status}
                        </span>

                        {/* LinkedIn OAuth 1-Click Action Buttons */}
                        {isLinkedIn && (
                          <>
                            {p.status === 'CONNECTED' ? (
                              <button
                                onClick={handleDisconnectLinkedIn}
                                className="px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-700/50 text-rose-200 text-xs font-mono flex items-center gap-1.5 transition-colors"
                              >
                                <LogOut className="w-3.5 h-3.5" />
                                Disconnect
                              </button>
                            ) : (
                              <button
                                onClick={handleConnectLinkedIn}
                                disabled={isConnectingOAuth}
                                className="px-3.5 py-1.5 rounded-lg bg-[#0077b5] hover:bg-[#006097] text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-lg shadow-blue-950 disabled:opacity-50"
                              >
                                {isConnectingOAuth ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Link2 className="w-3.5 h-3.5" />
                                )}
                                Connect LinkedIn
                              </button>
                            )}
                          </>
                        )}

                        {/* Test Connection Probe */}
                        <button
                          onClick={() => handleTestConnection(p.id)}
                          disabled={isTesting}
                          className="px-3 py-1.5 rounded-lg bg-purple-950 hover:bg-purple-900 border border-purple-600/40 text-purple-200 text-xs font-mono font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          <Radio className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                          {isTesting ? 'Testing API...' : 'Test Connection'}
                        </button>

                        <button
                          onClick={() => setExpandedPlatform(isExpanded ? null : p.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* LinkedIn Connected Member Banner */}
                    {isLinkedIn && oauth?.connected && (
                      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-[#0077b5]/30 flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                          {oauth.picture ? (
                            <img
                              src={oauth.picture}
                              alt={oauth.name || 'Member'}
                              className="w-10 h-10 rounded-full border border-slate-700 object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-blue-950 border border-blue-700 flex items-center justify-center text-blue-300 font-bold text-sm">
                              {oauth.name?.slice(0, 2).toUpperCase() || 'LI'}
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-100 text-xs">{oauth.name || 'Personal Member'}</span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                                OAuth 2.0 Token Active
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 font-mono">
                              Author URN: <code className="text-purple-300">{oauth.authorUrn || `urn:li:person:${oauth.memberSub || 'self'}`}</code>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleConnectLinkedIn}
                            disabled={isConnectingOAuth}
                            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono flex items-center gap-1 transition-colors"
                          >
                            <RefreshCw className={`w-3 h-3 ${isConnectingOAuth ? 'animate-spin' : ''}`} />
                            Reconnect / Refresh
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Live Test Diagnostic Output */}
                    {testResult && (
                      <div
                        className={`p-3 rounded-xl text-xs font-mono border ${
                          testResult.success
                            ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                            : 'bg-amber-950/40 border-amber-800 text-amber-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 font-bold mb-1">
                          {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <ShieldAlert className="w-4 h-4 text-amber-400" />}
                          <span>Live Probe Result: {testResult.status}</span>
                        </div>
                        <p className="text-[11px] leading-relaxed">{testResult.message}</p>
                      </div>
                    )}

                    {/* Expanded Setup Guide & Variables Checklist */}
                    {isExpanded && (
                      <div className="pt-4 border-t border-slate-800 flex flex-col gap-4 text-xs font-sans">
                        {/* Authorized Redirect URI Box (Critical for LinkedIn Developer Portal) */}
                        {isLinkedIn && oauth?.redirectUri && (
                          <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-700/40 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-purple-200 font-mono text-xs flex items-center gap-1.5">
                                <Link2 className="w-3.5 h-3.5 text-purple-400" />
                                Authorized Redirect URL (for LinkedIn Developer Portal):
                              </span>
                              <button
                                onClick={() => handleCopyRedirectUri(oauth.redirectUri!)}
                                className="px-2.5 py-1 rounded bg-purple-900/60 hover:bg-purple-800 border border-purple-500/40 text-purple-200 text-[11px] font-mono flex items-center gap-1 transition-colors"
                              >
                                {copiedRedirectUri ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                {copiedRedirectUri ? 'Copied!' : 'Copy URL'}
                              </button>
                            </div>
                            <code className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-purple-300 font-mono text-xs break-all select-all">
                              {oauth.redirectUri}
                            </code>
                            <p className="text-[11px] text-slate-400">
                              Paste this exact URL into your LinkedIn Developer App under <strong>Auth ➔ OAuth 2.0 settings ➔ Authorized redirect URLs for your app</strong>.
                            </p>
                          </div>
                        )}

                        {/* Capabilities */}
                        <div>
                          <span className="text-xs font-mono font-bold text-slate-300 block mb-1.5">
                            Supported Capabilities:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {p.capabilities.map((cap, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-purple-300 font-mono text-[11px]"
                              >
                                ✓ {cap}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Required Environment Variables */}
                        <div>
                          <span className="text-xs font-mono font-bold text-slate-300 block mb-1.5">
                            Required Environment Variables (Settings Menu ⚙️):
                          </span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono">
                            {p.requiredEnvVars.map((v, i) => (
                              <div
                                key={i}
                                className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                              >
                                <div>
                                  <span className="font-bold text-slate-200 block">{v.key}</span>
                                  <span className="text-[10px] text-slate-400">{v.label}</span>
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    v.configured
                                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}
                                >
                                  {v.configured ? 'Configured' : 'Missing'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Setup Instructions */}
                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-purple-300 font-mono text-xs">
                              How to Obtain API Credentials:
                            </span>
                            <a
                              href={p.developerPortalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono"
                            >
                              <span>Official Developer Portal</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <ol className="list-decimal list-inside space-y-1 text-slate-300 text-xs leading-relaxed">
                            {p.setupInstructions.map((step, idx) => (
                              <li key={idx}>{step}</li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
