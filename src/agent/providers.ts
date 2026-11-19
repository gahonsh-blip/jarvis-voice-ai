/**
 * Multi-provider model router.
 *
 * Why: the whole point of the super-agent upgrade is that JARVIS must not stop
 * working when a single API key hits its daily free quota. Providers are tried
 * in order, each failure cools that provider down for a few minutes, and the
 * next one answers. Every adapter speaks the same tiny contract.
 */
import type { AgentMessage, ChatRequest, ChatResult, Provider, ToolCall, ToolSpec } from './types.js';

const DEFAULT_TIMEOUT_MS = Number(process.env.AGENT_REQUEST_TIMEOUT_MS || 60_000);
const COOLDOWN_MS = Number(process.env.AGENT_PROVIDER_COOLDOWN_MS || 5 * 60_000);

const cooldown = new Map<string, number>();
const lastError = new Map<string, string>();
const stats = new Map<string, { ok: number; fail: number }>();

function noteStat(id: string, ok: boolean) {
  const s = stats.get(id) || { ok: 0, fail: 0 };
  if (ok) s.ok++;
  else s.fail++;
  stats.set(id, s);
}

function withTimeout(signal?: AbortSignal): { signal: AbortSignal; cancel: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('agent_request_timeout')), DEFAULT_TIMEOUT_MS);
  const onAbort = () => ctrl.abort(signal?.reason);
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  return {
    signal: ctrl.signal,
    cancel: () => {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    },
  };
}

export function toOpenAiTools(tools: ToolSpec[]) {
  return tools.map((t) => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/** Convert the shared transcript into OpenAI chat-completions messages. */
export function toOpenAiMessages(messages: AgentMessage[]) {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId || m.toolName || 'tool', content: m.content };
    }
    if (m.role === 'assistant' && m.toolCallId) {
      // Assistant text that represents a completed call is folded into the tool reply.
      return { role: 'assistant', content: m.content };
    }
    return { role: m.role, content: m.content };
  });
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return { _raw: raw };
    }
  }
  return {};
}

/* -------------------------------------------------------------------------- */
/* OpenAI compatible adapter (Groq, OpenRouter, Ollama, DeepSeek, Together...)  */
/* -------------------------------------------------------------------------- */

export interface OpenAiCompatibleOptions {
  id: string;
  label: string;
  baseUrl: string;
  apiKeyEnv?: string;
  modelEnv: string;
  defaultModel: string;
  freeTier: boolean;
  /** Extra headers, e.g. OpenRouter attribution. */
  headers?: Record<string, string>;
  /** Ollama ignores the auth header entirely. */
  requiresKey?: boolean;
}

export function createOpenAiCompatibleProvider(opts: OpenAiCompatibleOptions): Provider {
  return {
    id: opts.id,
    label: opts.label,
    freeTier: opts.freeTier,
    isConfigured() {
      if (opts.requiresKey === false) return true;
      return Boolean(opts.apiKeyEnv && process.env[opts.apiKeyEnv]);
    },
    async chat(request: ChatRequest): Promise<ChatResult> {
      const model = process.env[opts.modelEnv] || opts.defaultModel;
      const key = opts.apiKeyEnv ? process.env[opts.apiKeyEnv] : '';
      const { signal, cancel } = withTimeout(request.signal);
      try {
        const res = await fetch(`${opts.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          signal,
          headers: {
            'content-type': 'application/json',
            ...(key ? { authorization: `Bearer ${key}` } : {}),
            ...(opts.headers || {}),
          },
          body: JSON.stringify({
            model,
            messages: toOpenAiMessages(request.messages),
            tools: request.tools.length ? toOpenAiTools(request.tools) : undefined,
            tool_choice: request.tools.length ? 'auto' : undefined,
            temperature: request.temperature ?? 0.3,
            max_tokens: request.maxTokens ?? 4096,
          }),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`${opts.id}_http_${res.status}: ${body.slice(0, 180)}`);
        }
        const data: any = await res.json();
        const choice = data.choices?.[0]?.message || {};
        const calls: ToolCall[] = (choice.tool_calls || []).map((c: any, i: number) => ({
          id: c.id || `${opts.id}-call-${i}`,
          name: c.function?.name || 'unknown',
          arguments: parseArgs(c.function?.arguments),
        }));
        return {
          provider: opts.id,
          model,
          text: typeof choice.content === 'string' ? choice.content : '',
          toolCalls: calls,
          usage: {
            inputTokens: data.usage?.prompt_tokens,
            outputTokens: data.usage?.completion_tokens,
          },
        };
      } finally {
        cancel();
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Google Gemini adapter (free tier, already configured in this project)       */
/* -------------------------------------------------------------------------- */

function toGeminiContents(messages: AgentMessage[]) {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.role === 'tool' ? `Tool result (${m.toolName || 'tool'}):\n${m.content}` : m.content }],
    }));
}

function toGeminiTools(tools: ToolSpec[]) {
  if (!tools.length) return undefined;
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}

/* A key typed into the UI for this request only. Never persisted server-side. */
export let keyOverride = '';
export function setKeyOverride(v: string) { keyOverride = String(v || '').trim(); }

export const geminiProvider: Provider = {
  id: 'gemini',
  label: 'Google Gemini (free tier)',
  freeTier: true,
  isConfigured: () => Boolean(process.env.GEMINI_API_KEY || keyOverride),
  async chat(request: ChatRequest): Promise<ChatResult> {
    const model = process.env.AGENT_GEMINI_MODEL || 'gemini-2.5-flash';
    const key = keyOverride || process.env.GEMINI_API_KEY;
    const systemText = request.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const { signal, cancel } = withTimeout(request.signal);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: 'POST',
          signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
            contents: toGeminiContents(request.messages),
            tools: toGeminiTools(request.tools),
            generationConfig: {
              temperature: request.temperature ?? 0.3,
              maxOutputTokens: request.maxTokens ?? 4096,
            },
          }),
        },
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`gemini_http_${res.status}: ${body.slice(0, 180)}`);
      }
      const data: any = await res.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((p: any) => typeof p.text === 'string').map((p: any) => p.text).join('');
      const calls: ToolCall[] = parts
        .filter((p: any) => p.functionCall)
        .map((p: any, i: number) => ({
          id: `gemini-call-${i}`,
          name: p.functionCall.name,
          arguments: parseArgs(p.functionCall.args),
        }));
      return {
        provider: 'gemini',
        model,
        text,
        toolCalls: calls,
        usage: {
          inputTokens: data.usageMetadata?.promptTokenCount,
          outputTokens: data.usageMetadata?.candidatesTokenCount,
        },
      };
    } finally {
      cancel();
    }
  },
};

/* -------------------------------------------------------------------------- */
/* Registry + fallback router                                                 */
/* -------------------------------------------------------------------------- */

export const ALL_PROVIDERS: Provider[] = [
  geminiProvider,
  createOpenAiCompatibleProvider({
    id: 'groq',
    label: 'Groq (free tier, very fast)',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKeyEnv: 'GROQ_API_KEY',
    modelEnv: 'AGENT_GROQ_MODEL',
    defaultModel: 'llama-3.3-70b-versatile',
    freeTier: true,
  }),
  createOpenAiCompatibleProvider({
    id: 'openrouter',
    label: 'OpenRouter (free models)',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    modelEnv: 'AGENT_OPENROUTER_MODEL',
    defaultModel: process.env.AGENT_OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
    freeTier: true,
    headers: { 'HTTP-Referer': 'https://gahonsh-blip.github.io', 'X-Title': 'HERMES JARVIS' },
  }),
  createOpenAiCompatibleProvider({
    id: 'cerebras',
    label: 'Cerebras (free tier)',
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKeyEnv: 'CEREBRAS_API_KEY',
    modelEnv: 'AGENT_CEREBRAS_MODEL',
    defaultModel: 'llama-3.3-70b',
    freeTier: true,
  }),
  createOpenAiCompatibleProvider({
    id: 'deepseek',
    label: 'DeepSeek (low cost)',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    modelEnv: 'AGENT_DEEPSEEK_MODEL',
    defaultModel: 'deepseek-chat',
    freeTier: false,
  }),
  createOpenAiCompatibleProvider({
    id: 'ollama',
    label: 'Ollama on this machine (offline, free)',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1',
    modelEnv: 'AGENT_OLLAMA_MODEL',
    defaultModel: 'qwen2.5-coder:7b',
    freeTier: true,
    requiresKey: false,
  }),
];

const DEFAULT_ORDER = ['gemini', 'groq', 'openrouter', 'cerebras', 'ollama', 'deepseek'];

export function providerOrder(): string[] {
  const raw = process.env.AGENT_PROVIDER_ORDER;
  const order = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_ORDER;
  // Unknown ids are ignored so a typo cannot silently disable the agent.
  return order.filter((id) => ALL_PROVIDERS.some((p) => p.id === id));
}

export function providerStatus() {
  return ALL_PROVIDERS.map((p) => {
    const cooling = (cooldown.get(p.id) || 0) > Date.now();
    return {
      id: p.id,
      label: p.label,
      configured: p.isConfigured(),
      freeTier: p.freeTier,
      available: p.isConfigured() && !cooling,
      cooldownUntil: cooling ? new Date(cooldown.get(p.id)!).toISOString() : null,
      lastError: lastError.get(p.id) || null,
      stats: stats.get(p.id) || { ok: 0, fail: 0 },
    };
  });
}

export function resetProviderState() {
  cooldown.clear();
  lastError.clear();
  stats.clear();
}

/**
 * Try every configured provider in order until one answers.
 * A provider that fails is cooled down so the next call skips it briefly.
 */
export async function chatWithFallback(
  request: ChatRequest,
  order: string[] = providerOrder(),
): Promise<ChatResult> {
  const tried: string[] = [];
  const errors: string[] = [];
  for (const id of order) {
    const provider = ALL_PROVIDERS.find((p) => p.id === id);
    if (!provider || !provider.isConfigured()) continue;
    if ((cooldown.get(id) || 0) > Date.now()) {
      tried.push(`${id}(cooling)`);
      continue;
    }
    tried.push(id);
    try {
      const result = await provider.chat(request);
      noteStat(id, true);
      lastError.delete(id);
      return result;
    } catch (err: any) {
      noteStat(id, false);
      const message = err?.message || String(err);
      lastError.set(id, message);
      cooldown.set(id, Date.now() + COOLDOWN_MS);
      errors.push(`${id}: ${message}`);
    }
  }
  throw new Error(
    `no_model_available (tried: ${tried.join(', ') || 'none configured'}) ${errors.join(' | ')}`.trim(),
  );
}
