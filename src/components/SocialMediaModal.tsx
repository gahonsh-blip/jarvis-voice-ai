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
} from 'lucide-react';
import { SocialMediaPostDraft } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSpeak: (text: string) => void;
}

export const SocialMediaModal: React.FC<Props> = ({ isOpen, onClose, onSpeak }) => {
  const [posts, setPosts] = useState<SocialMediaPostDraft[]>([]);
  const [selectedPost, setSelectedPost] = useState<SocialMediaPostDraft | null>(null);
  const [topicPrompt, setTopicPrompt] = useState<string>('');
  const [platform, setPlatform] = useState<string>('LinkedIn');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      fetchPosts();
    }
  }, [isOpen]);

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
          onSpeak('Post confirmed and simulated broadcast complete, Sir.');
        }
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in font-sans">
      <div className="bg-slate-900 border border-purple-800/50 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-950 border border-purple-500/30 text-purple-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100">Social Media Automation & Human Approval</h2>
                <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3 text-emerald-400" />
                  Human Approval Mode Active
                </span>
              </div>
              <p className="text-xs text-slate-400">
                AI drafts the post ➔ Asks your mobile ("Publish करूँ? ➔ YES") ➔ Only publishes upon your explicit approval
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 bg-slate-950/30">
          {/* Left: Generator Form & Posts List */}
          <div className="w-full md:w-5/12 border-r border-slate-800 p-4 overflow-y-auto flex flex-col gap-4 bg-slate-950/40">
            {/* Quick Generator Box */}
            <form
              onSubmit={handleGeneratePost}
              className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-3"
            >
              <span className="text-xs font-mono font-bold text-purple-400 uppercase tracking-wider">
                Generate New Post Draft
              </span>

              <div className="flex gap-2">
                {['LinkedIn', 'Twitter/X', 'Telegram'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatform(p)}
                    className={`flex-1 py-1 rounded text-[11px] font-mono transition-colors ${
                      platform === p
                        ? 'bg-purple-950 border border-purple-500 text-purple-200'
                        : 'bg-slate-950 text-slate-400 border border-slate-800'
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
                {isGenerating ? 'Drafting with AI...' : 'Draft Post (Level 2)'}
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
              {/* Human Approval Warning Banner */}
              {selectedPost.status === 'pending_approval' && (
                <div className="p-4 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-200 flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs">
                    <span className="font-bold block mb-0.5">HUMAN APPROVAL REQUIRED (LEVEL 4 ACTION)</span>
                    JARVIS will never publish to public feeds without your explicit authorization. Review the content below and click approve to broadcast.
                  </div>
                </div>
              )}

              {/* Post Content Display */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">
                    Platform: <span className="text-purple-400 font-bold">{selectedPost.platform}</span>
                  </span>
                  <button
                    onClick={handleCopyPost}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono flex items-center gap-1"
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
                  <span>Provider URN:</span>
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
                      Not Published (Held in Draft)
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
      </div>
    </div>
  );
};
