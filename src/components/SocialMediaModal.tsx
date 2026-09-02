import React, { useState, useEffect, useRef } from 'react';
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
  Video,
  Upload,
  Camera,
  Film,
  Play,
  Tag,
  Lock,
  Unlock,
  Trash2,
  Plus,
  Info,
  Calendar,
  FileVideo,
} from 'lucide-react';
import { SocialMediaPostDraft, PlatformIntegrationInfo, SocialPlatformKey } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSpeak: (text: string) => void;
}

export const SocialMediaModal: React.FC<Props> = ({ isOpen, onClose, onSpeak }) => {
  const [activeTab, setActiveTab] = useState<'drafts' | 'youtube' | 'platforms'>('drafts');
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
  const [isDraftingTestVideo, setIsDraftingTestVideo] = useState<boolean>(false);
  const [videoTitleInput, setVideoTitleInput] = useState<string>('');
  const [videoDescInput, setVideoDescInput] = useState<string>('');
  const [videoPrivacyInput, setVideoPrivacyInput] = useState<'private' | 'unlisted' | 'public'>('private');
  const [isSavingMetadata, setIsSavingMetadata] = useState<boolean>(false);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [isGoogleTestingModeBlocked, setIsGoogleTestingModeBlocked] = useState<boolean>(false);

  // Dedicated YouTube Upload Tab State
  const [ytVideoFile, setYtVideoFile] = useState<File | null>(null);
  const [ytVideoPreviewUrl, setYtVideoPreviewUrl] = useState<string | null>(null);
  const [ytVideoBase64, setYtVideoBase64] = useState<string | null>(null);
  const [ytVideoTitle, setYtVideoTitle] = useState<string>('HERMES JARVIS Autonomous Core Overview');
  const [ytVideoDesc, setYtVideoDesc] = useState<string>(
    'Automated end-to-end technical overview from HERMES JARVIS Autonomous Core.\n\n• Architecture: Oracle Always Free ARM Cloud + Gemini AI\n• Security Layer: Level-4 Human Authorization Matrix\n• Engine: YouTube Data API v3 (videos.insert)\n• Zero Fake Success Verified.'
  );
  const [ytVideoTags, setYtVideoTags] = useState<string[]>([
    'JARVIS',
    'AI',
    'AutonomousAgent',
    'GoogleCloud',
    'YouTubeAPI',
    'DevOps',
  ]);
  const [ytCustomTagInput, setYtCustomTagInput] = useState<string>('');
  const [ytPrivacy, setYtPrivacy] = useState<'private' | 'unlisted' | 'public'>('private');
  const [ytCategory, setYtCategory] = useState<string>('28'); // Science & Technology
  const [ytIsTestPayload, setYtIsTestPayload] = useState<boolean>(true);
  const [ytIsGeneratingAI, setYtIsGeneratingAI] = useState<boolean>(false);
  const [ytIsStaging, setYtIsStaging] = useState<boolean>(false);
  const [ytStagedPost, setYtStagedPost] = useState<SocialMediaPostDraft | null>(null);
  const [ytIsAuthorizing, setYtIsAuthorizing] = useState<boolean>(false);
  const [ytUploadResult, setYtUploadResult] = useState<{
    success: boolean;
    message: string;
    videoUrl?: string;
    videoId?: string;
    errorReason?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectedPost && selectedPost.platform === 'YouTube') {
      setVideoTitleInput(selectedPost.videoTitle || selectedPost.topic || '');
      setVideoDescInput(selectedPost.videoDescription || selectedPost.content || '');
      setVideoPrivacyInput(
        selectedPost.privacyStatus === 'unlisted' || selectedPost.privacyStatus === 'public'
          ? selectedPost.privacyStatus
          : 'private'
      );
    }
  }, [selectedPost]);

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
      } else if (event.data?.type === 'YOUTUBE_OAUTH_SUCCESS') {
        setIsConnectingOAuth(false);
        setOauthError(null);
        setIsGoogleTestingModeBlocked(false);
        setOauthNotice(`✅ Successfully connected YouTube Channel "${event.data.channel?.channelTitle || 'Channel'}"!`);
        fetchPlatforms();
        fetchPosts();
        onSpeak(`YouTube channel connected successfully for ${event.data.channel?.channelTitle || 'Channel'}, Sir.`);
      } else if (event.data?.type === 'YOUTUBE_OAUTH_ERROR') {
        setIsConnectingOAuth(false);
        const errMsg = event.data.error || 'Authorization cancelled';
        const isBlocked = Boolean(event.data.isGoogleTestingModeBlocked || errMsg.toLowerCase().includes('access_denied') || errMsg.toLowerCase().includes('verification') || errMsg.includes('403'));
        setIsGoogleTestingModeBlocked(isBlocked);
        setOauthError(isBlocked ? 'Google OAuth 403 (Access Blocked): App in "Testing" mode. Your Google account must be added to OAuth Consent Screen ➔ Test Users.' : `YouTube OAuth error: ${errMsg}`);
        setOauthNotice(null);
        onSpeak(isBlocked ? 'YouTube authorization blocked due to Google Cloud testing mode. Please add your account to Test Users, Sir.' : 'YouTube connection was not completed, Sir.');
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

  // Video File Selection Handler (Device / Camera)
  const handleVideoFileSelect = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setOauthError('Please select a valid video file format (MP4, WebM, MOV, etc.).');
      return;
    }
    setYtVideoFile(file);
    const preview = URL.createObjectURL(file);
    setYtVideoPreviewUrl(preview);
    setYtIsTestPayload(false);
    setYtUploadResult(null);

    // If default title, derive clean title from file name
    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    if (!ytVideoTitle || ytVideoTitle === 'HERMES JARVIS Autonomous Core Overview') {
      setYtVideoTitle(cleanName.slice(0, 100));
    }

    // Read base64 for upload payload
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const base64Data = res.includes(',') ? res.split(',')[1] : res;
      setYtVideoBase64(base64Data);
    };
    reader.readAsDataURL(file);
  };

  // Switch back to Synthesized Test Video Mode
  const handleUseSyntheticTestVideo = () => {
    setYtVideoFile(null);
    if (ytVideoPreviewUrl) {
      URL.revokeObjectURL(ytVideoPreviewUrl);
      setYtVideoPreviewUrl(null);
    }
    setYtVideoBase64(null);
    setYtIsTestPayload(true);
    setYtUploadResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  // Tag Management Handlers
  const handleAddTag = () => {
    const clean = ytCustomTagInput.replace(/^#/, '').trim();
    if (clean && !ytVideoTags.includes(clean)) {
      setYtVideoTags([...ytVideoTags, clean]);
      setYtCustomTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setYtVideoTags(ytVideoTags.filter((t) => t !== tagToRemove));
  };

  const handleAddSuggestedTag = (suggestedTag: string) => {
    const clean = suggestedTag.replace(/^#/, '').trim();
    if (!ytVideoTags.includes(clean)) {
      setYtVideoTags([...ytVideoTags, clean]);
    }
  };

  // AI Description & Title Generator for YouTube
  const handleGenerateYouTubeAI = async () => {
    setIsGenerating(true);
    setYtIsGeneratingAI(true);
    try {
      const res = await fetch('/api/social/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: ytVideoTitle || 'Autonomous AI Agents and Cloud Security Matrix',
          platform: 'YouTube',
        }),
      });
      const data = await res.json();
      if (data.success && data.draft) {
        if (data.draft.videoTitle) setYtVideoTitle(data.draft.videoTitle.slice(0, 100));
        if (data.draft.videoDescription || data.draft.content) {
          setYtVideoDesc(data.draft.videoDescription || data.draft.content);
        }
        if (Array.isArray(data.draft.hashtags) && data.draft.hashtags.length > 0) {
          const newTags = data.draft.hashtags.map((h: string) => h.replace(/^#/, '').trim()).filter(Boolean);
          setYtVideoTags(Array.from(new Set([...ytVideoTags, ...newTags])));
        }
        onSpeak('AI-generated YouTube title, description, and hashtags staged, Sir.');
      }
    } catch (err) {
      console.warn('AI generation for YouTube failed:', err);
    } finally {
      setIsGenerating(false);
      setYtIsGeneratingAI(false);
    }
  };

  // Stage YouTube Video for Level-4 Approval Flow
  const handleStageYouTubeVideo = async () => {
    if (!ytVideoTitle.trim()) {
      setOauthError('Please enter a valid Video Title before staging.');
      return;
    }
    setYtIsStaging(true);
    setYtUploadResult(null);

    try {
      const payload = {
        title: ytVideoTitle.trim(),
        description: ytVideoDesc.trim(),
        privacyStatus: ytPrivacy,
        tags: ytVideoTags.map((t) => (t.startsWith('#') ? t : `#${t}`)),
        videoFileName: ytVideoFile?.name || (ytIsTestPayload ? 'synthetic_jarvis_test.mp4' : 'uploaded_video.mp4'),
        videoPayloadBase64: ytVideoBase64 || undefined,
        isTestUpload: ytIsTestPayload,
      };

      const res = await fetch('/api/social/youtube/upload-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success && data.post) {
        setYtStagedPost(data.post);
        setPosts((prev) => [data.post, ...prev.filter((p) => p.id !== data.post.id)]);
        setSelectedPost(data.post);
        onSpeak(`YouTube video staged for Level-4 Authorization in ${ytPrivacy.toUpperCase()} mode, Sir.`);
      } else {
        setOauthError(data.message || 'Failed to stage YouTube video.');
      }
    } catch (err: any) {
      setOauthError(`Staging failed: ${err.message}`);
    } finally {
      setYtIsStaging(false);
    }
  };

  // Level-4 Human Authorization Execution
  const handleExecuteLevel4Approval = async () => {
    if (!ytStagedPost) return;
    setYtIsAuthorizing(true);
    setYtUploadResult(null);

    try {
      const res = await fetch('/api/social/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: ytStagedPost.id,
          action: 'approve_and_publish',
        }),
      });
      const data = await res.json();

      if (data.success && data.post) {
        setYtStagedPost(data.post);
        setSelectedPost(data.post);
        setPosts((prev) => prev.map((p) => (p.id === data.post.id ? data.post : p)));
        setYtUploadResult({
          success: true,
          message: data.message || 'Video successfully uploaded and verified on YouTube!',
          videoId: data.post.providerUrn,
          videoUrl: data.post.videoUrl || (data.post.providerUrn ? `https://www.youtube.com/watch?v=${data.post.providerUrn}` : undefined),
        });
        onSpeak('YouTube video verified and live on YouTube, Sir.');
      } else {
        const errorMsg = data.errorReason || data.message || 'Upload could not be published.';
        setYtStagedPost(data.post || ytStagedPost);
        setYtUploadResult({
          success: false,
          message: data.message || '⚠️ Real YouTube upload requires 1-Click OAuth Connect.',
          errorReason: errorMsg,
        });
        fetchPosts();
        onSpeak('Publishing held: OAuth credentials required for YouTube.');
      }
    } catch (err: any) {
      setYtUploadResult({
        success: false,
        message: 'Network error during upload authorization.',
        errorReason: err.message,
      });
    } finally {
      setYtIsAuthorizing(false);
    }
  };

  // Reject / Cancel Staged Video
  const handleRejectLevel4Approval = async () => {
    if (!ytStagedPost) return;
    try {
      await fetch('/api/social/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: ytStagedPost.id,
          action: 'reject',
        }),
      });
      setYtStagedPost(null);
      fetchPosts();
      onSpeak('YouTube video draft rejected and kept offline, Sir.');
    } catch (err) {
      console.warn('Reject failed:', err);
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

  const handleConnectYouTube = async () => {
    setIsConnectingOAuth(true);
    setOauthError(null);
    setOauthNotice(null);

    try {
      const redirectUri = window.location.origin + '/api/auth/youtube/callback';
      const res = await fetch(`/api/auth/youtube/url?redirect_uri=${encodeURIComponent(redirectUri)}`);
      const data = await res.json();

      if (!data.success || !data.url) {
        setIsConnectingOAuth(false);
        setOauthError(data.message || 'YOUTUBE_CLIENT_ID is missing. Please configure it in AI Studio Settings (⚙️).');
        onSpeak('Sir, YOUTUBE_CLIENT_ID is required before launching Google OAuth. Please check settings.');
        return;
      }

      const width = 600;
      const height = 720;
      const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
      const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);

      const popup = window.open(
        data.url,
        'youtube_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,status=yes`
      );

      if (!popup || popup.closed) {
        setIsConnectingOAuth(false);
        setOauthError('Popup window was blocked by browser. Please allow popups for this site.');
      }
    } catch (err: any) {
      setIsConnectingOAuth(false);
      setOauthError(`YouTube OAuth initiation error: ${err.message}`);
    }
  };

  const handleDisconnectYouTube = async () => {
    try {
      const res = await fetch('/api/auth/youtube/disconnect', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setOauthNotice('YouTube channel disconnected.');
        fetchPlatforms();
        onSpeak('YouTube channel disconnected, Sir.');
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

  const handleDraftTestYouTubeVideo = async () => {
    setIsDraftingTestVideo(true);
    try {
      const res = await fetch('/api/social/youtube/draft-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: topicPrompt.trim() || 'HERMES JARVIS Autonomous Core Overview (Safe Test)',
          privacyStatus: 'private', // Safe test default
        }),
      });
      const data = await res.json();
      if (data.success && data.post) {
        setPosts((prev) => [data.post, ...prev]);
        setSelectedPost(data.post);
        setTopicPrompt('');
        onSpeak('YouTube test video draft created in Private mode. Level 4 human confirmation required.');
      }
    } catch (err) {
      console.warn('Draft test video failed:', err);
    } finally {
      setIsDraftingTestVideo(false);
    }
  };

  const handleSaveYouTubeMetadata = async () => {
    if (!selectedPost) return;
    setIsSavingMetadata(true);
    try {
      const res = await fetch('/api/social/youtube/update-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: selectedPost.id,
          title: videoTitleInput,
          description: videoDescInput,
          privacyStatus: videoPrivacyInput,
        }),
      });
      const data = await res.json();
      if (data.success && data.post) {
        setSelectedPost(data.post);
        setPosts((prev) => prev.map((p) => (p.id === data.post.id ? data.post : p)));
        onSpeak('YouTube video parameters updated.');
      }
    } catch (err) {
      console.warn('Update draft error:', err);
    } finally {
      setIsSavingMetadata(false);
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
  const ytInfo = platforms.find((p) => p.id === 'youtube');
  const isYouTubeConnected = ytInfo?.status === 'CONNECTED';
  const ytOauth = ytInfo?.youTubeOAuthStatus;

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
                onClick={() => setActiveTab('youtube')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === 'youtube'
                    ? 'bg-red-950/80 text-red-200 border border-red-700/60 shadow-lg shadow-red-950/40'
                    : 'text-slate-400 hover:text-red-300'
                }`}
              >
                <Video className="w-3.5 h-3.5 text-red-500" />
                YouTube Studio
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

                <div className="flex flex-col gap-2">
                  <button
                    type="submit"
                    disabled={isGenerating || !topicPrompt.trim()}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors shadow"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {isGenerating ? 'Drafting with Gemini...' : `Draft Post for ${platform}`}
                  </button>

                  {platform === 'YouTube' && (
                    <button
                      type="button"
                      onClick={handleDraftTestYouTubeVideo}
                      disabled={isDraftingTestVideo}
                      className="w-full py-2 bg-red-950/80 hover:bg-red-900 border border-red-700/60 text-red-200 font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {isDraftingTestVideo ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Radio className="w-3.5 h-3.5 text-red-400" />
                      )}
                      Stage Safe Test Video (Private Mode)
                    </button>
                  )}
                </div>
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

                {/* YouTube Channel Status Bar */}
                {selectedPost.platform === 'YouTube' && (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-red-900/40 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-red-950/80 border border-red-700/60 flex items-center justify-center font-bold text-xs text-red-400">
                        ▶
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-200">
                            Target: YouTube Channel
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-red-950 text-red-300 border border-red-800">
                            Data API v3 (videos.insert)
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono">
                          {isYouTubeConnected
                            ? (ytOauth?.channelTitle || 'Connected YouTube Channel')
                            : 'OAuth Disconnected — Connect via Platform Hub'}
                        </p>
                      </div>
                    </div>

                    {!isYouTubeConnected ? (
                      <button
                        onClick={handleConnectYouTube}
                        disabled={isConnectingOAuth}
                        className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {isConnectingOAuth ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                        Connect YouTube
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                          <Check className="w-3 h-3" /> OAuth Ready
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-red-950 text-red-300 border border-red-800 uppercase">
                          {selectedPost.privacyStatus || 'PRIVATE'}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* YouTube Video Upload Configuration Parameters */}
                {selectedPost.platform === 'YouTube' && selectedPost.status !== 'published' && (
                  <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col gap-3 shadow-inner">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        YouTube Video Upload Parameters
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Default: Private (Safe Mode)
                      </span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-mono text-slate-300">Video Title (max 100 chars):</label>
                      <input
                        type="text"
                        value={videoTitleInput}
                        onChange={(e) => setVideoTitleInput(e.target.value)}
                        placeholder="Video Title..."
                        maxLength={100}
                        className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-mono text-slate-300">Video Description / Transcript:</label>
                      <textarea
                        value={videoDescInput}
                        onChange={(e) => setVideoDescInput(e.target.value)}
                        placeholder="Video Description..."
                        rows={3}
                        className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono"
                      />
                    </div>

                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                      <div className="flex items-center gap-3">
                        <span className="text-[11px] font-mono text-slate-400">Privacy Mode:</span>
                        <div className="flex gap-1.5">
                          {(['private', 'unlisted', 'public'] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setVideoPrivacyInput(mode)}
                              className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                                videoPrivacyInput === mode
                                  ? mode === 'private'
                                    ? 'bg-red-950 text-red-200 border border-red-500 font-bold'
                                    : 'bg-purple-950 text-purple-200 border border-purple-500 font-bold'
                                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800'
                              }`}
                            >
                              {mode.toUpperCase()} {mode === 'private' ? '🔒 (Safe)' : ''}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleSaveYouTubeMetadata}
                        disabled={isSavingMetadata}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-medium flex items-center gap-1.5 transition-colors"
                      >
                        {isSavingMetadata ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-emerald-400" />}
                        Save Parameters
                      </button>
                    </div>
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
                  <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800 text-xs font-mono flex items-center justify-between flex-wrap gap-2 text-emerald-200">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Provider Live ID:</span>
                      <span className="text-emerald-400 font-bold text-xs">{selectedPost.providerUrn}</span>
                    </div>

                    {selectedPost.platform === 'YouTube' && (
                      <a
                        href={selectedPost.videoUrl || `https://www.youtube.com/watch?v=${selectedPost.providerUrn}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Watch on YouTube
                      </a>
                    )}
                  </div>
                )}

                {/* Approval Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-800 flex-wrap gap-3">
                  <div className="text-xs font-mono text-slate-400">
                    {selectedPost.status === 'published' || selectedPost.finalTruthState === 'VERIFIED' ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        {selectedPost.platform === 'YouTube' ? 'Uploaded & Verified Live on YouTube' : 'Live & Verified'}
                      </span>
                    ) : selectedPost.status === 'not_published' || selectedPost.finalTruthState === 'NOT_PUBLISHED' ? (
                      <span className="text-amber-400 font-bold flex items-center gap-1.5">
                        <ShieldAlert className="w-4 h-4" />
                        Held in Draft (No Fake Success)
                      </span>
                    ) : (
                      <span>Status: Awaiting Human Action (Level 4)</span>
                    )}
                  </div>

                  {selectedPost.status === 'pending_approval' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(selectedPost.id, 'reject')}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
                      >
                        Reject Draft (No Upload)
                      </button>
                      <button
                        onClick={() => handleAction(selectedPost.id, 'approve_and_publish')}
                        className={`px-4 py-2 rounded-xl text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-lg ${
                          selectedPost.platform === 'YouTube'
                            ? 'bg-red-500 hover:bg-red-400 shadow-red-950 text-white'
                            : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {selectedPost.platform === 'YouTube' ? 'YES, Approve & Upload to YouTube (Level 4)' : 'YES, Approve & Publish (Level 4)'}
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
        ) : activeTab === 'youtube' ? (
          /* Dedicated YouTube Studio & Video Upload Center */
          <div className="flex-1 p-6 overflow-y-auto bg-slate-950/40 flex flex-col gap-6">
            {/* Google OAuth 403 Testing Mode Alert & Guide */}
            {isGoogleTestingModeBlocked && (
              <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/80 via-amber-950/50 to-slate-900 border-2 border-amber-500/80 shadow-2xl flex flex-col gap-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                    <h4 className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wider">
                      Google OAuth 403: App is in "Testing" Mode (Action Required)
                    </h4>
                  </div>
                  <button
                    onClick={() => setIsGoogleTestingModeBlocked(false)}
                    className="text-slate-400 hover:text-slate-200 text-xs px-2.5 py-1 rounded-lg bg-slate-800 font-mono transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
                <p className="text-xs text-slate-200 leading-relaxed">
                  Google Cloud blocks OAuth logins when the OAuth consent screen publishing status is set to <strong>"Testing"</strong> unless your Google email is explicitly on the <strong>Test Users</strong> list.
                </p>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col gap-2 font-mono text-xs">
                  <div className="font-bold text-amber-400 flex items-center gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5" /> 1-Minute Fix in Google Cloud Console:
                  </div>
                  <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300 pl-1">
                    <li>Open <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noreferrer" className="text-sky-400 underline font-semibold hover:text-sky-300">Google Cloud Console ➔ OAuth Consent Screen</a></li>
                    <li>Scroll down to the <strong>Test users</strong> card</li>
                    <li>Click <strong>+ ADD USERS</strong> and enter your Google account email</li>
                    <li>Click <strong>SAVE</strong>, then click <strong>"Connect YouTube Channel"</strong> button below!</li>
                  </ol>
                </div>
              </div>
            )}

            {/* Top YouTube Status & OAuth Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/50 via-slate-900 to-slate-950 border border-red-800/40 flex items-center justify-between flex-wrap gap-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-red-950/80 border border-red-700 flex items-center justify-center text-red-400 shadow-lg">
                  <Video className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-100">YouTube Data API v3 Studio</h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-red-950 text-red-300 border border-red-800 font-bold">
                      Official Multi-Part Upload Engine
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono">
                    {ytOauth?.status === 'API_VERIFIED' || (ytOauth?.connected && ytOauth?.canPublish)
                      ? `Channel: ${ytOauth.channelTitle || 'Google Account Authenticated'} | Scopes: youtube.upload, youtube.readonly`
                      : ytOauth?.status === 'CONFIGURED'
                      ? `Status: Configured (${ytOauth.authType || 'OAuth 2.0'}) — 1-Click OAuth Connect Required for Uploads`
                      : ytOauth?.status === 'TOKEN_INVALID' || ytOauth?.status === 'ERROR'
                      ? `Status: Token / Permission Error (${ytOauth.diagnosticError || 'Re-authentication required'})`
                      : 'Status: Ready for YouTube Video File Selection & Level-4 Human Authorization'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {isYouTubeConnected && ytOauth?.canPublish ? (
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-700 text-emerald-300 text-xs font-mono font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      OAuth Active
                    </span>
                    <button
                      onClick={handleDisconnectYouTube}
                      className="px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-700/50 text-rose-200 text-xs font-mono transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleConnectYouTube}
                    disabled={isConnectingOAuth}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold font-mono flex items-center gap-2 transition-all shadow-lg shadow-red-950 disabled:opacity-50"
                  >
                    {isConnectingOAuth ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    Connect YouTube Channel (1-Click OAuth)
                  </button>
                )}
              </div>
            </div>

            {/* Main Studio Two-Column Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Video File Selection & Preview */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col gap-4 shadow-lg">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-mono font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Film className="w-4 h-4" /> 1. Video Source Selection
                    </h4>
                    <span className="text-[10px] font-mono text-slate-400">
                      {ytIsTestPayload ? 'Synthetic Test Mode' : 'Binary File Mode'}
                    </span>
                  </div>

                  {/* Hidden File and Camera Inputs */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="video/*"
                    onChange={(e) => handleVideoFileSelect(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <input
                    type="file"
                    ref={cameraInputRef}
                    accept="video/*"
                    capture="environment"
                    onChange={(e) => handleVideoFileSelect(e.target.files?.[0] || null)}
                    className="hidden"
                  />

                  {/* Video Dropzone / Selection Area */}
                  {ytVideoPreviewUrl ? (
                    <div className="flex flex-col gap-3">
                      <div className="relative rounded-xl overflow-hidden bg-black border border-slate-800 aspect-video flex items-center justify-center shadow-inner">
                        <video
                          src={ytVideoPreviewUrl}
                          controls
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-2">
                          <FileVideo className="w-4 h-4 text-red-400" />
                          <div className="truncate max-w-[180px]">
                            <span className="text-slate-200 block truncate font-bold">{ytVideoFile?.name}</span>
                            <span className="text-[10px] text-slate-500">
                              {((ytVideoFile?.size || 0) / (1024 * 1024)).toFixed(2)} MB • {ytVideoFile?.type}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={handleUseSyntheticTestVideo}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-300 text-slate-400 transition-colors"
                          title="Remove file and revert to synthetic test"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-700 hover:border-red-500/70 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 bg-slate-950/60 hover:bg-slate-950 cursor-pointer transition-all text-center group"
                    >
                      <div className="w-12 h-12 rounded-full bg-slate-900 group-hover:bg-red-950/60 border border-slate-800 group-hover:border-red-700/50 flex items-center justify-center text-slate-400 group-hover:text-red-400 transition-colors">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-200 group-hover:text-red-300">
                          Click to select a video file or drag and drop
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          MP4, WebM, MOV, or AVI (up to 500 MB)
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Dual Action Buttons: Device Pick & Camera */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5 text-purple-400" />
                      Browse Device
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                      <Camera className="w-3.5 h-3.5 text-cyan-400" />
                      Record / Camera
                    </button>
                  </div>

                  {/* Synthetic Test Video Fallback Toggle */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold text-slate-300 block">
                        Safe Synthetic Test Generator
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Builds dynamic FFmpeg HUD test video if no binary file chosen.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleUseSyntheticTestVideo}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-colors ${
                        ytIsTestPayload
                          ? 'bg-red-950 text-red-300 border border-red-800'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {ytIsTestPayload ? '✓ Active Test Mode' : 'Use Test Mode'}
                    </button>
                  </div>
                </div>

                {/* Upload Safety Guidance Card */}
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col gap-2 text-xs font-sans">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5 font-mono">
                    <ShieldAlert className="w-4 h-4 text-emerald-400" />
                    Level-4 Zero Fake Success Policy
                  </span>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Every video staged in this studio is queued in a strict Level 4 Human Authorization Gateway.
                    No bytes will be transmitted to Google Cloud until you explicitly click <strong>Approve & Upload</strong>.
                  </p>
                </div>
              </div>

              {/* Right Column: Metadata, Tags, Privacy, and Level 4 Staging */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col gap-4 shadow-lg">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-mono font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Tag className="w-4 h-4" /> 2. Video Metadata & Settings
                    </h4>
                    <button
                      onClick={handleGenerateYouTubeAI}
                      disabled={ytIsGeneratingAI}
                      className="px-3 py-1 rounded-lg bg-purple-950 hover:bg-purple-900 border border-purple-700/60 text-purple-300 text-xs font-mono flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${ytIsGeneratingAI ? 'animate-spin' : ''}`} />
                      {ytIsGeneratingAI ? 'AI Enriching...' : 'AI Generate Content'}
                    </button>
                  </div>

                  {/* Title Input */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-mono text-slate-300 font-bold">Video Title:</label>
                      <span className={`text-[10px] font-mono ${ytVideoTitle.length > 90 ? 'text-amber-400' : 'text-slate-500'}`}>
                        {ytVideoTitle.length}/100 chars
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={100}
                      value={ytVideoTitle}
                      onChange={(e) => setYtVideoTitle(e.target.value)}
                      placeholder="e.g. HERMES JARVIS Autonomous Core Architecture Overview"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-red-500 transition-colors"
                    />
                  </div>

                  {/* Description Textarea */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-mono text-slate-300 font-bold">Video Description:</label>
                    <textarea
                      rows={5}
                      value={ytVideoDesc}
                      onChange={(e) => setYtVideoDesc(e.target.value)}
                      placeholder="Enter detailed video description, key timestamps, links, and system specs..."
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-red-500 leading-relaxed transition-colors"
                    />
                  </div>

                  {/* Privacy & Category Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Privacy Selector */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-mono text-slate-300 font-bold">Privacy Visibility:</label>
                      <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                        <button
                          type="button"
                          onClick={() => setYtPrivacy('private')}
                          className={`py-1.5 px-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center gap-1 ${
                            ytPrivacy === 'private'
                              ? 'bg-red-950 text-red-300 border border-red-700/60 shadow'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Lock className="w-3 h-3" /> Private
                        </button>
                        <button
                          type="button"
                          onClick={() => setYtPrivacy('unlisted')}
                          className={`py-1.5 px-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center gap-1 ${
                            ytPrivacy === 'unlisted'
                              ? 'bg-purple-950 text-purple-300 border border-purple-700/60 shadow'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Link2 className="w-3 h-3" /> Unlisted
                        </button>
                        <button
                          type="button"
                          onClick={() => setYtPrivacy('public')}
                          className={`py-1.5 px-2 rounded-lg text-xs font-mono font-bold transition-all flex items-center justify-center gap-1 ${
                            ytPrivacy === 'public'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700/60 shadow'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Globe className="w-3 h-3" /> Public
                        </button>
                      </div>
                    </div>

                    {/* Category Selector */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-mono text-slate-300 font-bold">YouTube Category:</label>
                      <select
                        value={ytCategory}
                        onChange={(e) => setYtCategory(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:border-red-500"
                      >
                        <option value="28">Science & Technology</option>
                        <option value="27">Education</option>
                        <option value="26">Howto & Style</option>
                        <option value="24">Entertainment</option>
                        <option value="20">Gaming</option>
                      </select>
                    </div>
                  </div>

                  {/* Tags Manager */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-mono text-slate-300 font-bold">Hashtags & Video Tags:</label>
                    <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-slate-950 border border-slate-800 min-h-[44px]">
                      {ytVideoTags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2.5 py-1 rounded-lg text-xs font-mono bg-red-950/60 text-red-300 border border-red-800/60 flex items-center gap-1.5"
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="text-red-400 hover:text-red-200"
                          >
                            ×
                          </button>
                        </span>
                      ))}

                      <div className="flex items-center gap-1 flex-1 min-w-[120px]">
                        <input
                          type="text"
                          value={ytCustomTagInput}
                          onChange={(e) => setYtCustomTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddTag();
                            }
                          }}
                          placeholder="Add tag and press Enter..."
                          className="w-full bg-transparent text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none px-1"
                        />
                        {ytCustomTagInput && (
                          <button
                            type="button"
                            onClick={handleAddTag}
                            className="p-1 rounded bg-slate-800 text-slate-300 hover:text-white"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Suggested Tag Pills */}
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono text-slate-500">
                      <span>Suggestions:</span>
                      {['#JARVIS', '#AutonomousAI', '#GoogleCloud', '#DevOps', '#Robotics', '#AI'].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => handleAddSuggestedTag(s)}
                          className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-purple-300 hover:border-purple-800 transition-colors"
                        >
                          +{s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Stage Action Button */}
                  <div className="pt-2">
                    <button
                      onClick={handleStageYouTubeVideo}
                      disabled={ytIsStaging || !ytVideoTitle.trim()}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-xs font-bold font-mono flex items-center justify-center gap-2 transition-all shadow-xl shadow-red-950/60 disabled:opacity-50"
                    >
                      {ytIsStaging ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Video className="w-4 h-4" />
                      )}
                      {ytIsStaging ? 'Staging Level 4 Payload...' : 'Stage YouTube Video for Level-4 Authorization'}
                    </button>
                  </div>
                </div>

                {/* Level-4 Authorization Gateway Staged Card */}
                {ytStagedPost && (
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-red-950/70 via-slate-900 to-slate-950 border-2 border-red-600 flex flex-col gap-4 shadow-2xl animate-fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                        <span className="text-xs font-mono font-bold text-red-300 uppercase tracking-wider">
                          Level-4 Human Authorization Required
                        </span>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold bg-red-950 text-red-300 border border-red-700">
                        {ytStagedPost.privacyStatus?.toUpperCase()} MODE
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col gap-2 font-mono text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Target Channel:</span>
                        <span className="text-slate-200 font-bold">{ytStagedPost.targetChannel || 'Connected YouTube Channel'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Video Title:</span>
                        <span className="text-red-300 font-bold truncate max-w-[280px]">{ytStagedPost.videoTitle}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Payload Source:</span>
                        <span className="text-purple-300 font-bold">{ytStagedPost.videoFileName || 'Synthetic Buffer'}</span>
                      </div>
                    </div>

                    {/* Interactive Level 4 Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        onClick={handleRejectLevel4Approval}
                        disabled={ytIsAuthorizing}
                        className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold font-mono transition-colors disabled:opacity-50"
                      >
                        Reject / Cancel (No Upload)
                      </button>

                      <button
                        onClick={handleExecuteLevel4Approval}
                        disabled={ytIsAuthorizing}
                        className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold font-mono flex items-center gap-2 transition-all shadow-lg shadow-red-950 disabled:opacity-50"
                      >
                        {ytIsAuthorizing ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        {ytIsAuthorizing ? 'Authorizing & Uploading...' : 'YES, Approve & Upload to YouTube (Level 4)'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Upload Execution Results & Diagnostics */}
                {ytUploadResult && (
                  <div
                    className={`p-4 rounded-2xl border text-xs font-mono flex flex-col gap-2 shadow-xl ${
                      ytUploadResult.success
                        ? 'bg-emerald-950/60 border-emerald-700 text-emerald-200'
                        : 'bg-amber-950/60 border-amber-700 text-amber-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-2">
                        {ytUploadResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <ShieldAlert className="w-4 h-4 text-amber-400" />
                        )}
                        {ytUploadResult.success ? 'Upload Success & Verified' : 'Level 4 Publish Held (Zero Fake Success)'}
                      </span>
                      {ytUploadResult.videoId && (
                        <span className="text-[10px] text-emerald-400 font-bold">ID: {ytUploadResult.videoId}</span>
                      )}
                    </div>

                    <p className="text-[11px] leading-relaxed">{ytUploadResult.message}</p>
                    {ytUploadResult.errorReason && (
                      <p className="text-[10px] text-amber-300/80 bg-slate-950/60 p-2 rounded-lg border border-amber-900/50">
                        Diagnostics: {ytUploadResult.errorReason}
                      </p>
                    )}

                    {ytUploadResult.videoUrl && (
                      <div className="pt-2 flex justify-end">
                        <a
                          href={ytUploadResult.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" /> Watch on YouTube
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
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
                const isYouTube = p.id === 'youtube';
                const oauth = p.oauthStatus;
                const ytOauth = p.youTubeOAuthStatus;

                return (
                  <div
                    key={p.id}
                    className={`p-5 rounded-2xl border flex flex-col gap-4 shadow-xl transition-all ${
                      isLinkedIn && p.status === 'CONNECTED'
                        ? 'bg-slate-900 border-[#0077b5]/40 shadow-blue-950/20'
                        : isYouTube && p.status === 'CONNECTED'
                        ? 'bg-slate-900 border-red-700/40 shadow-red-950/20'
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
                              : isYouTube
                              ? 'bg-red-950/40 border border-red-700/50 text-red-400'
                              : 'bg-slate-950 border border-slate-800 text-purple-400'
                          }`}
                        >
                          {isLinkedIn ? 'in' : isYouTube ? 'YT' : p.id.slice(0, 2).toUpperCase()}
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
                            {isYouTube && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-red-950 text-red-300 border border-red-800 font-semibold">
                                Google Cloud OAuth 2.0
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

                        {/* YouTube OAuth 1-Click Action Buttons */}
                        {isYouTube && (
                          <>
                            {ytOauth?.connected && ytOauth?.authType === 'OAUTH_2_0' ? (
                              <button
                                onClick={handleDisconnectYouTube}
                                className="px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-700/50 text-rose-200 text-xs font-mono flex items-center gap-1.5 transition-colors"
                              >
                                <LogOut className="w-3.5 h-3.5" />
                                Disconnect
                              </button>
                            ) : (
                              <button
                                onClick={handleConnectYouTube}
                                disabled={isConnectingOAuth}
                                className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium flex items-center gap-1.5 transition-colors shadow-lg shadow-red-950 disabled:opacity-50"
                              >
                                {isConnectingOAuth ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Link2 className="w-3.5 h-3.5" />
                                )}
                                Connect YouTube
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

                    {/* YouTube Connected Channel Banner */}
                    {isYouTube && ytOauth?.connected && (
                      <div className="p-3.5 rounded-xl bg-slate-950/80 border border-red-700/30 flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                          {ytOauth.avatarUrl ? (
                            <img
                              src={ytOauth.avatarUrl}
                              alt={ytOauth.channelTitle || 'Channel'}
                              className="w-10 h-10 rounded-full border border-slate-700 object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-red-950 border border-red-700 flex items-center justify-center text-red-300 font-bold text-sm">
                              ▶
                            </div>
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-100 text-xs">{ytOauth.channelTitle || 'YouTube Channel'}</span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                                {ytOauth.authType || 'OAuth 2.0'} Active
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 font-mono">
                              Channel ID: <code className="text-red-300">{ytOauth.channelId || 'Authenticated Google Account'}</code>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleConnectYouTube}
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

                        {/* Authorized Redirect URI Box (for Google Cloud Console / YouTube) */}
                        {isYouTube && ytOauth?.redirectUri && (
                          <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-700/40 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-red-200 font-mono text-xs flex items-center gap-1.5">
                                <Link2 className="w-3.5 h-3.5 text-red-400" />
                                Authorized Redirect URI (for Google Cloud Console):
                              </span>
                              <button
                                onClick={() => handleCopyRedirectUri(ytOauth.redirectUri!)}
                                className="px-2.5 py-1 rounded bg-red-900/60 hover:bg-red-800 border border-red-500/40 text-red-200 text-[11px] font-mono flex items-center gap-1 transition-colors"
                              >
                                {copiedRedirectUri ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                {copiedRedirectUri ? 'Copied!' : 'Copy URL'}
                              </button>
                            </div>
                            <code className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-red-300 font-mono text-xs break-all select-all">
                              {ytOauth.redirectUri}
                            </code>
                            <p className="text-[11px] text-slate-400">
                              Paste this exact URI into your Google Cloud Console under <strong>APIs & Services ➔ Credentials ➔ OAuth 2.0 Client IDs ➔ Authorized redirect URIs</strong>.
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
