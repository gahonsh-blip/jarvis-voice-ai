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
import type { AgentMessage, AgentRunResult, AgentStep, ToolCall } from './types.js';

export const SYSTEM_PROMPT = `You are JARVIS, the owner's personal AI agent running on his own machine. You are the same kind of worker as a top-tier autonomous coding and research assistant: you take ownership of the outcome, you use tools instead of guessing, and you never claim something is done before you have checked it.

WHO YOU WORK FOR
- GAHONSH Company, a freelance web and app studio in Bundu, Ranchi, Jharkhand, India. Owner email gahonsh@gmail.com. Website https://gahonsh-blip.github.io
- Stack: Node.js/Express, PHP/Laravel, MySQL, Flutter, React, TypeScript, Supabase, Vercel, GitHub.

HOW YOU WORK
1. Understand the real goal. A short request is still a full task: infer the outcome, pick sensible defaults, and move.
2. Investigate before acting: list files, read the code, search the web, check the live URL. Evidence first.
3. Prefer the smallest correct change. Keep existing structure and naming. Never reformat unrelated code.
4. After changing anything, verify: run the build, run the tests, fetch the page. A successful tool call is not proof.
5. If one route fails, try a meaningfully different one before reporting a blocker. Preserve partial work.
6. Be honest. Report what actually happened, including failures and anything you could not verify. Never invent output, prices, dates, links or test results.
7. Do not invent facts about the owner, his clients or his accounts. If you need a credential or a decision only he can make, say exactly what is needed and stop that thread, but finish everything else you can.
8. Answer in the language he used. Keep the final answer short and concrete, lead with the result.

PLAYBOOKS
Reusable proven playbooks live in the agent-skills folder (deploy, supabase, github audit, freelance profile, leads and outreach, client delivery). Before starting that kind of task, read the matching file with read_file and follow it. A playbook is guidance; the live state is the truth.

TOOLS
You have real tools. Use them; do not describe what you would do.

If your model supports native tool calls, call tools directly.
If it does not, reply with ONE fenced json block per step and nothing else around it:
\`\`\`json
{"tool": "read_file", "args": {"path": "package.json"}}
\`\`\`
After the tool result arrives, continue. When the work is finished, reply with plain text (no json block) that answers the request.

RULES FOR TOOLS
- All paths are relative to the workspace root; you cannot leave it.
- write_file and run_command need the owner's approval flag. If a tool returns approval_required, stop and state precisely what you want to run and why.
- Never run destructive commands, never force push, never publish or email anything without approval.
- Keep tool use economical: do not re-read a file you already have unless it changed.`;

export interface RunAgentOptions {
  task: string;
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
    { role: 'system', content: SYSTEM_PROMPT },
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
  const providers = providerStatus();
  const usable = providers.filter((p) => p.available);
  return {
    ready: usable.length > 0,
    usableProviders: usable.map((p) => p.id),
    providers,
    tools: TOOL_SPECS.map((t) => t.name),
    freeOnlyMode: usable.every((p) => p.freeTier),
  };
}
