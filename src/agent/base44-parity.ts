/**
 * BASE44 PARITY PACK — the full 87-tool surface, registered on the Jarvis server.
 *
 * Why this file exists
 * --------------------
 * Jarvis runs as a plain Node server, while most of the 87 tools in the Base44
 * agent live inside Base44's own runtime (entities, workflows, connectors,
 * goals, sub-agents). A tool cannot be "copied" across that boundary, so every
 * tool here is honest about which of three things it is:
 *
 *   LOCAL  — really runs here (skill scripts, image, transcription, questions).
 *   BRIDGE — calls the Base44 bridge endpoint with the owner's API key, which is
 *            how a server-side agent reaches platform tools. Needs
 *            BASE44_API_URL + BASE44_API_KEY + BASE44_AGENT_ID.
 *   KEY    — runs here but needs one provider credential.
 *
 * Nothing silently pretends. A tool that cannot act says exactly which variable
 * is missing, the same way docs/TOOLS.md already does for Gmail and Twilio.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { AgentTool, ToolContext, ToolResult } from './types.js';

const MAX_OUTPUT = Number(process.env.AGENT_MAX_TOOL_OUTPUT || 12_000);

function clip(text: string, limit = MAX_OUTPUT): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n…[truncated ${text.length - limit} chars]`;
}

export const BRIDGE_ENV = ['BASE44_API_URL', 'BASE44_API_KEY', 'BASE44_AGENT_ID'] as const;

export function bridgeConfigured(): boolean {
  return BRIDGE_ENV.every((k) => Boolean(process.env[k]));
}

/** Call the Base44 bridge with one tool call. The bridge is a thin proxy that
 *  forwards {tool, arguments} to the Base44 agent and returns its result text. */
export async function callBridge(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
  const base = process.env.BASE44_API_URL || '';
  const key = process.env.BASE44_API_KEY || '';
  const agent = process.env.BASE44_AGENT_ID || '';
  const missing = BRIDGE_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    return {
      ok: false,
      output:
        `not_configured: ${tool} needs ${missing.join(', ')}. ` +
        'Set them to let Jarvis reach Base44 platform tools; until then this tool exists but cannot act.',
    };
  }
  const url = `${base.replace(/\/$/, '')}${process.env.BASE44_BRIDGE_PATH || '/api/tools/invoke'}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(process.env.AGENT_BRIDGE_TIMEOUT_MS || 60_000));
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ agent_id: agent, tool, arguments: args }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, output: clip(`bridge_http_${res.status}: ${text}`) };
    return { ok: true, output: clip(text || '(empty bridge response)') };
  } catch (err: any) {
    return { ok: false, output: `bridge_error: ${err?.message || String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}


/* ---------------------------- local tools ---------------------------- */

function safePath(root: string, target: string): string {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, target || '.');
  if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) {
    throw new Error(`path_outside_workspace: ${target}`);
  }
  return abs;
}

function runShell(command: string, cwd: string): Promise<ToolResult> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', command], { cwd, env: process.env, timeout: 120_000 });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    child.on('error', (e) => resolve({ ok: false, output: `spawn_failed: ${e.message}` }));
    child.on('close', (code) => {
      const body = [out, err].filter(Boolean).join('\n').trim() || '(no output)';
      resolve({ ok: code === 0, output: clip(`exit ${code}\n${body}`) });
    });
  });
}

async function runSkill(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const name = String(args.skill_name || '').trim();
  if (!name) return { ok: false, output: 'skill_name is required' };
  const base = safePath(ctx.root, path.join('.agents', 'skills', name));
  const candidates: Array<[string, string]> = [
    [path.join(base, 'scripts', 'run.sh'), 'sh'],
    [path.join(base, 'scripts', 'run.py'), 'py'],
    [path.join(base, 'scripts', 'run.js'), 'js'],
    [base + '.sh', 'sh'],
    [base + '.py', 'py'],
    [base + '.js', 'js'],
  ];
  const hit = candidates.find(([p]) => fs.existsSync(p));
  if (!hit) return { ok: false, output: `skill_not_found: ${name} (looked in .agents/skills)` };
  const [file, kind] = hit;
  const extra = String(args.arguments || '');
  const cmd =
    kind === 'sh' ? `bash ${JSON.stringify(file)} ${extra}` :
    kind === 'py' ? `python3 ${JSON.stringify(file)} ${extra}` :
    `node ${JSON.stringify(file)} ${extra}`;
  return runShell(cmd, ctx.root);
}

async function askClarifyingQuestions(args: Record<string, unknown>): Promise<ToolResult> {
  const list = Array.isArray(args.questions) ? args.questions : [];
  if (!list.length) return { ok: false, output: 'questions array is required' };
  const lines = list.slice(0, 3).map((q: any, i: number) => {
    const opts = Array.isArray(q?.options) ? q.options : [];
    const rendered = opts.map((o: any, j: number) => `   ${j + 1}) ${o?.label ?? o}`).join('\n');
    return `${i + 1}. ${q?.question ?? 'Question'}\n${rendered}`;
  });
  return {
    ok: true,
    output: clip(
      'No question widget on this host — ask these in plain text and wait for the answer:\n' + lines.join('\n'),
    ),
  };
}

async function providerPost(url: string, key: string, body: BodyInit, headers: Record<string, string> = {}): Promise<ToolResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, ...headers },
      body,
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, output: clip(`provider_http_${res.status}: ${text}`) };
    return { ok: true, output: clip(text) };
  } catch (err: any) {
    return { ok: false, output: `provider_error: ${err?.message || String(err)}` };
  } finally {
    clearTimeout(timer);
  }
}

async function generateImage(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const key = process.env.OPENAI_API_KEY || '';
  if (!key) {
    return { ok: false, output: 'not_configured: generate_image needs OPENAI_API_KEY (or set BASE44_* to use the Base44 bridge).' };
  }
  const prompt = String(args.prompt || '').trim();
  if (!prompt) return { ok: false, output: 'prompt is required' };
  const res = await providerPost(
    'https://api.openai.com/v1/images/generations',
    key,
    JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', prompt, size: '1024x1024' }),
    { 'content-type': 'application/json' },
  );
  if (!res.ok) return res;
  // Save the first b64 image into the workspace so later tools can use it.
  try {
    const data = JSON.parse(res.output);
    const b64 = data?.data?.[0]?.b64_json;
    const url = data?.data?.[0]?.url;
    if (b64) {
      const out = path.join(ctx.root, 'generated-image.png');
      fs.writeFileSync(out, Buffer.from(b64, 'base64'));
      return { ok: true, output: `saved ${out}` };
    }
    if (url) return { ok: true, output: url };
  } catch {
    /* fall through to raw output */
  }
  return res;
}

async function transcribeAudio(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const key = process.env.OPENAI_API_KEY || '';
  if (!key) {
    return { ok: false, output: 'not_configured: transcribe_audio needs OPENAI_API_KEY (or set BASE44_* to use the Base44 bridge).' };
  }
  const rel = String(args.file_path || '').trim();
  if (!rel) return { ok: false, output: 'file_path is required' };
  const abs = safePath(ctx.root, rel);
  if (!fs.existsSync(abs)) return { ok: false, output: `file_not_found: ${rel}` };
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(abs)]), path.basename(abs));
  form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1');
  return providerPost('https://api.openai.com/v1/audio/transcriptions', key, form);
}

const LOCAL_RUNNERS: Record<string, (a: Record<string, unknown>, c: ToolContext) => Promise<ToolResult>> = {
  run_skill: runSkill,
  ask_clarifying_questions: (a) => askClarifyingQuestions(a),
  generate_image: generateImage,
  transcribe_audio: transcribeAudio,
};


/* ------------------------- the 80 new tools ------------------------- */

type ParamMap = Record<string, [string, string]>;

function params(p: ParamMap): AgentTool['parameters'] {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [k, [t, d]] of Object.entries(p)) {
    properties[k] =
      t === 'array' ? { type: 'array', items: { type: 'string' }, description: d } :
      t === 'object' ? { type: 'object', description: d } :
      { type: t, description: d };
    required.push(k);
  }
  return { type: 'object', properties, required };
}

function make(name: string, description: string, p: ParamMap, mode: string): AgentTool {
  return {
    name,
    description,
    parameters: params(p),
    run: (args, ctx) => (mode === 'local' ? LOCAL_RUNNERS[name](args, ctx) : callBridge(name, args)),
  };
}

export const PARITY_TOOLS: AgentTool[] = [

  make("run_skill", "Run a reusable skill script from .agents/skills/<name> (a folder with scripts/run.sh|py|js, or a flat .sh/.py/.js file).", { skill_name: ['string', "skill name, with or without extension"], arguments: ['string', "arguments passed to the script"] }, "local"),
  make("forget_memory", "Delete one saved memory by its id.", { memory_id: ['string', "memory id"] }, "bridge"),
  make("update_identity", "Replace the content of IDENTITY.md or USER.md.", { name: ['string', "IDENTITY.md or USER.md"], content: ['string', "full new file content"] }, "bridge"),
  make("list_sessions", "List past conversation sessions, newest first.", { page: ['number', "page number, 1-indexed"] }, "bridge"),
  make("read_session_log", "Read the full transcript of one past conversation session.", { session_id: ['string', "session id from list_sessions"] }, "bridge"),
  make("search_sessions", "Search past conversations by keyword.", { query: ['string', "keyword or phrase"] }, "bridge"),
  make("browserbase_navigate", "Open a URL in the browser.", { url: ['string', "full http(s) URL"] }, "bridge"),
  make("browserbase_get_content", "Read the text of the current page or one element.", { selector: ['string', "optional CSS selector"] }, "bridge"),
  make("browserbase_screenshot", "Take a screenshot of the current page.", {  }, "bridge"),
  make("browserbase_click", "Click an element, or a point, on the page.", { selector: ['string', "CSS selector"], x: ['number', "viewport x"], y: ['number', "viewport y"] }, "bridge"),
  make("browserbase_type", "Type text into an input.", { text: ['string', "text to type"], selector: ['string', "CSS selector"] }, "bridge"),
  make("browserbase_observe", "Find actionable elements for a natural-language goal.", { instruction: ['string', "what to find"] }, "bridge"),
  make("browserbase_act", "Perform one action described in natural language.", { instruction: ['string', "the single action to perform"] }, "bridge"),
  make("browserbase_extract", "Extract structured data from the current page.", { instruction: ['string', "what data to extract"] }, "bridge"),
  make("browserbase_batch", "Run a short ordered sequence of browser steps in one call.", { steps: ['array', "array of {action, ...} steps, max 8"] }, "bridge"),
  make("browserbase_fast_nav", "Reach one concrete sub-goal with several mechanical steps in a single call.", { goal: ['string', "one verifiable sub-goal"], url: ['string', "optional start URL"], inputs: ['object', "named values to type, e.g. {search_query: \"...\"}"], max_steps: ['number', "step budget 1-60"] }, "bridge"),
  make("browserbase_get_session", "Status and details of the active browser session.", {  }, "bridge"),
  make("browserbase_get_live_urls", "Live view URLs for the active browser session.", {  }, "bridge"),
  make("browserbase_reset_context", "Clear cookies and login state of the browser context.", {  }, "bridge"),
  make("browserbase_stop_session", "Stop and release the active browser session.", {  }, "bridge"),
  make("browser_confirm_payment", "Click one payment control after the owner approves the charge.", { control: ['string', "control label"], site: ['string', "site"], element: ['string', "element handle"] }, "bridge"),
  make("generate_image", "Generate an image from a prompt with the configured image provider.", { prompt: ['string', "detailed prompt"], existing_image_urls: ['array', "reference image URLs"] }, "local"),
  make("upload_file", "Upload a sandbox file to public storage and return its URL.", { file_path: ['string', "path inside the workspace"] }, "bridge"),
  make("upload_private_file", "Upload a file to private storage, returning a file uri.", { file_path: ['string', "path inside the workspace"] }, "bridge"),
  make("create_file_signed_url", "Create a time-limited download URL for a private file.", { file_uri: ['string', "private file uri"], expires_in: ['number', "seconds until expiry"] }, "bridge"),
  make("send_image", "Send an image file to the owner on the current channel.", { file_path: ['string', "png/jpg path inside the workspace"] }, "bridge"),
  make("transcribe_audio", "Transcribe an audio file to text with the configured speech provider.", { file_path: ['string', "audio path inside the workspace"] }, "local"),
  make("get_connectors_info", "List supported connectors and their authorization status, or details for given ones.", { integration_types: ['array', "connector ids, e.g. [\"gmail\"]"] }, "bridge"),
  make("request_oauth_authorization", "Start an OAuth flow so the owner can authorize a service.", { integration_type: ['string', "connector id"], reason: ['string', "user-facing reason"], scopes: ['array', "minimal OAuth scopes"], connector_id: ['string', "workspace connector id"], force_reconnect: ['boolean', "force a different account"] }, "bridge"),
  make("get_connector_token", "Fetch an OAuth token for a connected service into the environment.", { integration_type: ['string', "connector id"], required_scopes: ['array', "exact OAuth scopes needed"] }, "bridge"),
  make("enable_connector", "Request owner approval for a Base44-managed connector.", { integration_type: ['string', "connector id"], summary: ['string', "why it is needed"] }, "bridge"),
  make("sequence_connect_oauth", "Connect a Sequence account through its OAuth flow.", {  }, "bridge"),
  make("suggest_payments_installation", "Offer to install a payment integration for the app.", { reason: ['string', "what payments are for"] }, "bridge"),
  make("create_or_update_workflow", "Create or update a scheduled, entity, connector or webhook workflow.", { name: ['string', "workflow name"], description: ['string', "what it does"], definition: ['object', "CNCF SWF v1.0 definition with document and do"], trigger: ['object', "trigger configuration"], change_summary: ['string', "short change note"] }, "bridge"),
  make("get_workflow_guide", "Read the workflow authoring guide and current workflows.", { sub_guides: ['array', "building-block names to document"], skip_main_guide: ['boolean', "skip the format core"] }, "bridge"),
  make("manage_workflow", "Activate, deactivate, archive or restore a workflow.", { workflow_name: ['string', "workflow name"], action: ['string', "activate|deactivate|archive|unarchive"] }, "bridge"),
  make("get_workflow_run", "List recent runs of a workflow, or inspect one run step by step.", { workflow_name: ['string', "workflow name"], run_id: ['string', "specific run id"] }, "bridge"),
  make("select_or_create_workflow_webhook", "Get a reusable inbound webhook listener id for a source.", { display_name: ['string', "human label"], provider_hint: ['string', "provider slug"], event_type_selector: ['object', "how the provider labels event types"] }, "bridge"),
  make("request_webhook_sample", "Record the payload shape for one webhook event type.", { webhook_id: ['string', "listener id"], event_type: ['string', "provider event label"], sample: ['object', "example payload"], docs_source_url: ['string', "docs page the shape came from"] }, "bridge"),
  make("configure_email_workflows", "Enable the standard email labeling and reply-drafting preset.", { provider: ['string', "gmail|outlook"], behaviors: ['array', "labeling, drafting"] }, "bridge"),
  make("manage_goal", "Create, read or advance a durable long-running goal.", { action: ['string', "create|read|update|add_tasks"], name: ['string', "stable goal name"], objective: ['string', "complete outcome"], tasks: ['array', "ordered task graph"], completion_policy: ['string', "all|first_success|sequential_fail_fast|consensus"], status: ['string', "active|blocked|completed|failed|cancelled"], expected_revision: ['number', "state revision for update"], task_updates: ['array', "task state changes"] }, "bridge"),
  make("deploy_backend_function", "Deploy a backend function so it is callable over HTTP.", { function_name: ['string', "camelCase name"], code: ['string', "TypeScript/JavaScript source"] }, "bridge"),
  make("test_backend_function", "Call a deployed backend function with a test payload.", { function_name: ['string', "function name"], payload: ['object', "JSON body"], method: ['string', "HTTP method"] }, "bridge"),
  make("get_backend_function_logs", "Fetch runtime logs of a deployed function.", { function_name: ['string', "function name"], limit: ['number', "max log entries"] }, "bridge"),
  make("delete_backend_function", "Delete a deployed backend function.", { function_name: ['string', "function name"] }, "bridge"),
  make("call_base44_backend_function", "Call a backend function deployed in one of the owner's Base44 apps.", { app_id: ['string', "target app id"], function_name: ['string', "function name"], payload: ['object', "JSON body"], method: ['string', "HTTP method"], query_params: ['object', "query parameters"] }, "bridge"),
  make("manage_entity_schemas", "Create, update, delete or list entity schemas.", { action: ['string', "list|create|update|delete"], entity_name: ['string', "PascalCase entity name"], schema: ['object', "JSON schema"] }, "bridge"),
  make("create_entity_records", "Create one or more records in an entity.", { entity_name: ['string', "entity name"], data: ['array', "array of record objects"], app_id: ['string', "target app id"] }, "bridge"),
  make("read_entities", "Read entity records with filter, sort and pagination.", { entity_name: ['string', "entity name"], query: ['object', "filter"], limit: ['number', "max records"], skip: ['number', "records to skip"], sort: ['string', "field, -field for descending"], fields: ['array', "fields to project"], app_id: ['string', "target app id"] }, "bridge"),
  make("update_entities", "Update every record matching a query filter.", { entity_name: ['string', "entity name"], query: ['object', "filter"], data: ['object', "fields to set"], summary: ['string', "plain-language description"], app_id: ['string', "target app id"] }, "bridge"),
  make("delete_entities", "Delete every record matching a query filter.", { entity_name: ['string', "entity name"], query: ['object', "filter"], summary: ['string', "plain-language description"], app_id: ['string', "target app id"] }, "bridge"),
  make("aggregate_entities", "Run a read-only aggregation pipeline over one entity.", { entity_name: ['string', "entity name"], pipeline: ['array', "MongoDB aggregation stages"] }, "bridge"),
  make("list_base44_apps", "List the owner's Base44 apps, optionally filtered by name.", { name: ['string', "case-insensitive name filter"], limit: ['number', "max apps"] }, "bridge"),
  make("list_user_apps", "List the owner's apps with their entity schemas.", {  }, "bridge"),
  make("send_message_to_builder", "Send an edit prompt to an existing Base44 app builder.", { app_id: ['string', "target app id"], message: ['string', "exact builder message"] }, "bridge"),
  make("get_base44_app_status", "Check whether a Base44 app build is ready, processing or errored.", { app_id: ['string', "app id"] }, "bridge"),
  make("show_channel_connection_options", "Show the connection widget for a messaging channel.", { channel: ['string', "all|whatsapp|telegram|imessage|slack|phone"] }, "bridge"),
  make("create_whatsapp_group", "Create a new WhatsApp group as the agent owner.", { subject: ['string', "group name"], description: ['string', "group description"], response_mode: ['string', "mention_only|always"] }, "bridge"),
  make("list_whatsapp_groups", "List the WhatsApp groups this agent operates.", {  }, "bridge"),
  make("manage_imessage_connections", "List or disconnect iMessage recipients.", { action: ['string', "list|disconnect"], connection_id: ['string', "connection id from list"] }, "bridge"),
  make("send_whatsapp_voice_message", "Send a spoken voice note on WhatsApp.", { message: ['string', "text to speak"], language: ['string', "language code"] }, "bridge"),
  make("make_phone_call", "Place a phone call to the owner or an allowlisted contact.", { contact: ['string', "owner, a contact name, or an E.164 number"], goal: ['string', "what the call must accomplish"], context: ['string', "extra context"], information_needed: ['array', "facts the call must return"], caller_intro: ['string', "name and affiliation"], retry_delays_minutes: ['array', "retry schedule"] }, "bridge"),
  make("manage_phone", "Phone channel: trusted callers, call history and outbound quota.", { action: ['string', "list_recent_calls|list_trusted_callers|add_trusted_caller|get_call_transcript|get_call_budget|setup"], name: ['string', "contact name"], phone_number: ['string', "E.164 number"], limit: ['number', "max rows"], call_id: ['string', "call id"], offset: ['number', "transcript offset"], code: ['string', "SMS code"] }, "bridge"),
  make("read_agent_api", "Read owner-management data for this Superagent (settings, collaborators).", { path: ['string', "relative GET path"], query_params: ['object', "query parameters"] }, "bridge"),
  make("call_agent_api", "Mutate supported owner-management data for this Superagent.", { method: ['string', "POST|PUT|PATCH|DELETE"], path: ['string', "relative path"], body: ['object', "JSON body"], query_params: ['object', "query parameters"] }, "bridge"),
  make("set_agent_model", "Set this Superagent's visible UI model.", { model: ['string', "visible UI model label or id"], target: ['string', "chat"] }, "bridge"),
  make("set_secrets", "Save encrypted secrets or environment variables for skills and bash.", { secrets_schema: ['array', "array of {secretName, description}"] }, "bridge"),
  make("activate_platform_skill", "Load detailed platform instructions for a capability.", { skill_name: ['string', "skill name"] }, "bridge"),
  make("ask_clarifying_questions", "Ask the owner 1-3 multiple-choice questions and wait for the answer.", { questions: ['array', "array of {question, options, multi_select}"] }, "local"),
  make("artifacts", "Create or rewrite a polished HTML/SVG artifact saved in Artifacts.", { command: ['string', "create|rewrite"], id: ['string', "stable artifact id"], title: ['string', "display title"], content: ['string', "full markup"], type: ['string', "text/html|image/svg+xml"], path: ['string', "existing notes path"] }, "bridge"),
  make("invite_friend", "Generate the owner's Base44 invite link.", {  }, "bridge"),
  make("vent_send_feedback", "Report a Base44 platform problem to the Base44 team.", { summary: ['string', "one-line summary"], details: ['string', "what happened"], suggested_fix: ['string', "suggested change"] }, "bridge"),
  make("proactive_manage_settings", "Read or update the owner's proactive delivery preferences.", { settings: ['object', "enabled, timezone, quiet hours, digest hour, channel"], morning_start_hour: ['number', "6-12"] }, "bridge"),
  make("proactive_manage_rule", "Persist a notification mute, snooze, follow, update or revocation.", { action: ['string', "create|update|revoke"], rule: ['object', "rule details"], rule_id: ['string', "rule id"], expected_revision: ['number', "revision"] }, "bridge"),
  make("proactive_inspect_rules", "Read the owner notification rules, mutes and follows.", { rule_id: ['string', "rule id"] }, "bridge"),
  make("proactive_read_prepared_work", "Read the full private draft or research for an entry id.", { entry_id: ['string', "entry id from owner updates"] }, "bridge"),
  make("sub_agent", "Delegate heavy or parallel work to background sub-agents.", { topic: ['string', "short label"], tasks: ['array', "batch of goal tasks"], goal_name: ['string', "goal name"] }, "bridge"),
  make("sub_agent_status", "Check background sub-agent group progress.", { group_id: ['string', "group id"] }, "bridge"),
  make("sub_agent_result", "Read a stored sub-agent result by task id.", { task_id: ['string', "task id"], offset: ['number', "character offset"], limit: ['number', "characters to read"] }, "bridge"),
  make("sub_agent_stop", "Stop a running sub-agent group and collect partial results.", { group_id: ['string', "group id"] }, "bridge"),
];

/* ------------------------------ manifest ------------------------------ */

/** The 87 Base44 tool names, grouped. tools.ts advertises exactly these. */
export const PARITY_GROUPS: Array<{ id: string; label: string; tools: string[] }> = [

  { id: "files", label: "Files and code", tools: ["read_file", "write_file", "grep", "bash", "run_skill"] },
  { id: "memory", label: "Memory and old chats", tools: ["save_memory", "search_previous_messages", "forget_memory", "update_identity", "list_sessions", "read_session_log", "search_sessions"] },
  { id: "internet", label: "Internet and browser", tools: ["web_search", "browserbase_navigate", "browserbase_get_content", "browserbase_screenshot", "browserbase_click", "browserbase_type", "browserbase_observe", "browserbase_act", "browserbase_extract", "browserbase_batch", "browserbase_fast_nav", "browserbase_get_session", "browserbase_get_live_urls", "browserbase_reset_context", "browserbase_stop_session", "browser_confirm_payment"] },
  { id: "media", label: "Media and file sharing", tools: ["generate_image", "upload_file", "upload_private_file", "create_file_signed_url", "send_image", "transcribe_audio"] },
  { id: "connectors", label: "Connecting accounts", tools: ["get_connectors_info", "request_oauth_authorization", "get_connector_token", "enable_connector", "sequence_connect_oauth", "suggest_payments_installation"] },
  { id: "automation", label: "Automation and long-running work", tools: ["create_or_update_workflow", "get_workflow_guide", "manage_workflow", "get_workflow_run", "select_or_create_workflow_webhook", "request_webhook_sample", "configure_email_workflows", "manage_goal"] },
  { id: "backend", label: "Backend functions", tools: ["deploy_backend_function", "test_backend_function", "get_backend_function_logs", "delete_backend_function", "call_base44_backend_function"] },
  { id: "database", label: "Database", tools: ["manage_entity_schemas", "create_entity_records", "read_entities", "update_entities", "delete_entities", "aggregate_entities"] },
  { id: "apps", label: "Base44 apps", tools: ["list_base44_apps", "list_user_apps", "send_message_to_builder", "get_base44_app_status"] },
  { id: "messaging", label: "Messaging and calls", tools: ["show_channel_connection_options", "create_whatsapp_group", "list_whatsapp_groups", "manage_imessage_connections", "send_whatsapp_voice_message", "make_phone_call", "manage_phone"] },
  { id: "settings", label: "Agent settings and chat", tools: ["read_agent_api", "call_agent_api", "set_agent_model", "set_secrets", "activate_platform_skill", "ask_clarifying_questions", "artifacts", "invite_friend", "vent_send_feedback"] },
  { id: "proactive", label: "Updates and notifications", tools: ["proactive_manage_settings", "proactive_manage_rule", "proactive_inspect_rules", "proactive_read_prepared_work"] },
  { id: "subagents", label: "Sub-agents", tools: ["sub_agent", "sub_agent_status", "sub_agent_result", "sub_agent_stop"] },
];

export const NEW_TOOL_NAMES: string[] = PARITY_GROUPS.flatMap((g) => g.tools);

/** Names tools.ts already had; they are re-registered under their Base44 name. */
export const COVERED_BY_NATIVE: Array<[string, string]> = [
  ['read_file', 'read_file'],
  ['write_file', 'write_file'],
  ['grep', 'grep_files'],
  ['bash', 'run_command'],
  ['web_search', 'web_search'],
  ['save_memory', 'memory_set'],
  ['search_previous_messages', 'recall'],
];

export const ALL_87_NAMES: string[] = PARITY_GROUPS.flatMap((g) => g.tools);

/** Tools that run here rather than through the bridge. */
export const LOCAL_TOOL_NAMES: string[] = ['run_skill', 'ask_clarifying_questions', 'generate_image', 'transcribe_audio'];

/** Tools that run here but need one provider credential. */
export const KEY_TOOL_NAMES: string[] = ['generate_image', 'transcribe_audio'];

/** Tools that reach Base44 through the bridge (need BASE44_API_URL/KEY/AGENT_ID). */
export const BRIDGE_TOOL_NAMES: string[] = PARITY_TOOLS
  .filter((t) => !LOCAL_TOOL_NAMES.includes(t.name))
  .map((t) => t.name);
