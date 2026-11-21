/**
 * The agent loop: plan, act with tools, verify, answer.
 *
 * It is deliberately provider independent. Providers that support native tool
 * calling use it; providers that only return text still work because the system
 * prompt teaches a strict JSON tool protocol that the loop can parse.
 */
import { randomUUID } from 'crypto';
import { chatWithFallback, providerStatus } from './providers.js';
import { TOOL_SPECS, executeTool } from './tools.js';
import { buildSystemPrompt, listPersonas, DEFAULT_PERSONA_ID } from './personas.js';
import type { AgentMessage, AgentRunResult, AgentStep, ToolCall } from './types.js';

export { SYSTEM_PROMPT } from './prompt.js';

export interface RunAgentOptions {
  task: string;
  /** Which voice answers. Unknown ids fall back to the default persona. */
  persona?: string;
  history?: AgentMessage[];
  maxSteps?: number;
  approved?: boolean;
  root?: string;
  signal?: AbortSignal;
  onStep?: (step: AgentStep) => void;
}

function extractJsonToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  const candidates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text))) candidates.push(m[1].trim());
  if (!candidates.length && /\{[\s\S]*"tool"[\s\S]*\}/.test(text)) candidates.push(text.trim());
  for (const raw of candidates) {
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of list) {
        if (item && typeof item.tool === 'string') {
          calls.push({ id: `json-${randomUUID().slice(0, 8)}`, name: item.tool, arguments: item.args || item.arguments || {} });
        }
      }
    } catch {
      /* not a tool step, treat as final text */
    }
  }
  return calls;
}

export async function runAgent(options: RunAgentOptions): Promise<AgentRunResult> {
  const started = Date.now();
  const root = options.root || process.env.AGENT_WORKSPACE_ROOT || process.cwd();
  const maxSteps = Math.min(Math.max(options.maxSteps ?? 12, 1), 30);
  const messages: AgentMessage[] = [
    { role: 'system', content: buildSystemPrompt(options.persona) },
    ...(options.history || []),
    { role: 'user', content: options.task },
  ];
  const steps: AgentStep[] = [];
  const providersTried: string[] = [];
  const callSignatureCount = new Map<string, number>();

  for (let i = 0; i < maxSteps; i++) {
    let reply;
    try {
      reply = await chatWithFallback({ messages, tools: TOOL_SPECS, signal: options.signal });
    } catch (err: any) {
      return {
        ok: false,
        answer: `No model could answer. ${err?.message || String(err)}\n\nConfigure another key (GROQ_API_KEY, OPENROUTER_API_KEY, CEREBRAS_API_KEY) or run Ollama locally, then retry.`,
        steps,
        providersTried,
        durationMs: Date.now() - started,
      };
    }
    providersTried.push(reply.provider);

    const nativeCalls = reply.toolCalls;
    const toolCalls = nativeCalls.length ? nativeCalls : extractJsonToolCalls(reply.text);
    const step: AgentStep = {
      index: i,
      provider: reply.provider,
      model: reply.model,
      text: reply.text,
      toolCalls,
      toolResults: [],
    };

    if (!toolCalls.length) {
      steps.push(step);
      options.onStep?.(step);
      return {
        ok: true,
        answer: reply.text.trim() || '(empty answer)',
        steps,
        providersTried,
        durationMs: Date.now() - started,
      };
    }

    messages.push({ role: 'assistant', content: reply.text || JSON.stringify({ tool: toolCalls[0].name, args: toolCalls[0].arguments }) });

    let approvalBlocked: string | undefined;
    for (const call of toolCalls) {
      const signature = `${call.name}:${JSON.stringify(call.arguments)}`;
      const seen = (callSignatureCount.get(signature) || 0) + 1;
      callSignatureCount.set(signature, seen);

      let result;
      if (seen > 2) {
        result = { ok: false, output: `skipped: identical call repeated ${seen} times, change approach` };
      } else {
        result = await executeTool(call.name, call.arguments, {
          root,
          approved: Boolean(options.approved),
          signal: options.signal,
        });
      }
      if (result.needsApproval) approvalBlocked = call.name;
      step.toolResults.push({ name: call.name, ok: result.ok, output: result.output, needsApproval: result.needsApproval });
      messages.push({
        role: 'tool',
        toolName: call.name,
        toolCallId: call.id,
        content: result.output,
      });
    }

    steps.push(step);
    options.onStep?.(step);

    if (approvalBlocked) {
      return {
        ok: false,
        answer: `Approval needed before I can continue: ${approvalBlocked}. Re-run with approval so I can finish.`,
        steps,
        providersTried,
        needsApproval: approvalBlocked,
        durationMs: Date.now() - started,
      };
    }
  }

  return {
    ok: false,
    answer: `Stopped after ${maxSteps} steps without a final answer. Last steps are in the log.`,
    steps,
    providersTried,
    durationMs: Date.now() - started,
  };
}

export function agentStatus() {
  const personas = listPersonas();
  const providers = providerStatus();
  const usable = providers.filter((p) => p.available);
  return {
    ready: usable.length > 0,
    usableProviders: usable.map((p) => p.id),
    providers,
    tools: TOOL_SPECS.map((t) => t.name),
    personas,
    defaultPersona: DEFAULT_PERSONA_ID,
    freeOnlyMode: usable.every((p) => p.freeTier),
  };
}
