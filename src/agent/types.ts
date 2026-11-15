/**
 * Super-Agent core types.
 *
 * These types are provider agnostic on purpose: HERMES JARVIS must keep working
 * when one AI provider's free quota runs out, so every model is accessed through
 * this small contract and the router can swap providers per call.
 */

export type AgentRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AgentMessage {
  role: AgentRole;
  content: string;
  /** Set on tool results so the model can match the answer to the call. */
  toolName?: string;
  toolCallId?: string;
}

export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ChatRequest {
  messages: AgentMessage[];
  tools: ToolSpec[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatResult {
  provider: string;
  model: string;
  text: string;
  toolCalls: ToolCall[];
  usage?: ChatUsage;
}

export interface Provider {
  /** Stable id used in env config and status output. */
  id: string;
  label: string;
  /** True when this provider can be used without paying (free tier / local). */
  freeTier: boolean;
  isConfigured(): boolean;
  chat(request: ChatRequest): Promise<ChatResult>;
}

export interface ToolResult {
  ok: boolean;
  /** Compact, model readable output. Truncated by the executors. */
  output: string;
  /** Set when a dangerous tool was blocked and a human must confirm. */
  needsApproval?: boolean;
}

export interface ToolContext {
  /** Every filesystem and shell tool is jailed inside this directory. */
  root: string;
  /** When true, tools marked dangerous (shell write, push, delete) may run. */
  approved: boolean;
  signal?: AbortSignal;
}

export interface AgentTool extends ToolSpec {
  dangerous?: boolean;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export interface AgentStep {
  index: number;
  provider?: string;
  model?: string;
  text?: string;
  toolCalls: ToolCall[];
  toolResults: Array<{ name: string; ok: boolean; output: string; needsApproval?: boolean }>;
}

export interface AgentRunResult {
  ok: boolean;
  answer: string;
  steps: AgentStep[];
  providersTried: string[];
  needsApproval?: string;
  durationMs: number;
}
