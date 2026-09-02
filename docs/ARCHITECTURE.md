# 🏛️ HERMES JARVIS — Deep System Architecture

## 1. System Design Overview

HERMES JARVIS is structured as a full-stack, event-driven, single-process autonomous agent daemon. It is engineered specifically for low-latency operation on ARM64 Linux instances (such as Oracle Cloud Always Free Ampere A1) with minimal memory footprint (~45MB resident RSS).

```
                      +------------------------------------------+
                      |         ANDROID MOBILE USER (YOU)        |
                      +--------------------+---------------------+
                                           |
                    +----------------------+----------------------+
                    |                                             |
                    v                                             v
        +-----------------------+                     +-----------------------+
        |  Telegram Bot Client  |                     |  React 18 Web HUD     |
        |  (@HermesJarvisBot)   |                     |  (Desktop / Mobile)   |
        +-----------+-----------+                     +-----------+-----------+
                    |                                             |
                    | Long Polling / Webhook                      | REST APIs / JSON
                    v                                             v
+-----------------------------------------------------------------------------------+
|                        HERMES JARVIS BACKEND CORE (server.ts)                     |
|                                                                                   |
|  +---------------------+   +---------------------+   +--------------------------+ |
|  | Intent & NLP Engine |   | Permission Gateway  |   | 24/7 Background Cron     | |
|  | (Gemini 2.5 Flash + |   | (Level 1-4 Security |   | (IST 09:00, 14:00,       | |
|  | Bilingual Fallback) |   | & Human Gate)       |   |  18:30, 22:30 Briefings) | |
|  +----------+----------+   +----------+----------+   +------------+-------------+ |
|             |                         |                           |               |
|             +-------------------------+---------------------------+               |
|                                       |                                           |
|                                       v                                           |
|  +------------------------------------------------------------------------------+ |
|  |                         AUTONOMOUS TOOLS EXECUTION ENGINE                    | |
|  |  * Native Filesystem Reader/Writer (realFsList, realFsRead, realFsWrite)     | |
|  |  * Real Git & GitHub Issue Client (realGitStatus, realGithubCreateIssue)     | |
|  |  * Live Web Research Scraper (realWebFetch)                                  | |
|  |  * Real Social Media Dispatcher (LinkedIn UGC, YouTube Data API v3)          | |
|  |  * Global Kill Switch Controller (/api/system/kill-switch)                    | |
|  +------------------------------------+-----------------------------------------+ |
|                                       |                                           |
|                                       v                                           |
|  +------------------------------------------------------------------------------+ |
|  |                         MULTI-TIER ENCRYPTED PERSISTENCE                     | |
|  |  * Disk Vault: jarvis_memory.json (Atomic Sync, Encrypted Connection State)  | |
|  |  * Client Vault: localStorage with offline queue & reconciliation           | |
|  |  * Immutable Audit Log Stream                                                | |
|  +------------------------------------------------------------------------------+ |
+-----------------------------------------------------------------------------------+
```

---

## 2. Component Hierarchy

### A. AI Reasoning & Intent Classifier
- **Primary Engine**: Google Gemini 2.5 Flash via `@google/genai` SDK on the server side.
- **Offline / Standby Engine**: Deterministic Regex & Keyword Classifier (`classifyIntentLocally`) supporting dual English & Hindi queries (e.g., *"JARVIS, project check करो"*, *"LinkedIn post बनाओ"*, *"Quotation तैयार करो"*).
- **Safety Gate**: Any query involving banking, transactions, credit cards, or fund transfers is intercepted by `isFinanceBlocked()` and permanently blocked with a security reason.

### B. Security Matrix & Permission Gateway
All actions within the system are strictly categorized into 4 security levels:
- **Level 1 (Read-Only)**: File inspect, system diagnostics, git branch queries. Auto-approved.
- **Level 2 (Create)**: Generating file drafts, quotation estimates, social media post drafts. Auto-approved locally.
- **Level 3 (Modify)**: Direct file overwrites or subsystem configuration modifications.
- **Level 4 (External Broadcast)**: Publishing live posts to LinkedIn/YouTube, remote Git pushing, emailing clients.
  - **Human-in-the-Loop Protocol**: Level 4 actions are placed in the `memoryState.actionRequests` queue in `PENDING_APPROVAL` status. An interactive approval card is sent to Telegram with inline buttons (`YES / APPROVE` and `NO / REJECT`) and rendered in the web HUD. Execution ONLY occurs after explicit human authorization.

### C. Global Kill Switch Engine
- **Endpoint**: `POST /api/system/kill-switch`
- **Mechanism**:
  1. Sets `emergencyStopState.emergencyPaused = true`.
  2. Cancels and rejects all pending items in `memoryState.actionRequests`.
  3. Disables Telegram long polling (`telegramPollingActive = false`).
  4. Injects an immutable Level 4 audit log entry.
  5. Sends an urgent Telegram broadcast notice to the administrator.
- **Resumption**: `POST /api/system/resume` restores standard permission gating and restarts Telegram polling.

### D. Multi-Tier Offline Memory Engine
- **Server Persistence**: `jarvis_memory.json` is updated atomically via `persistMemory()`. It stores user name, notes, custom key-values, freelance CRM leads, social media drafts, YouTube/LinkedIn OAuth connection metadata, and audit logs.
- **Client Resilience**: The React client uses `saveLocalMemory()` in `localStorage`. If offline, mutations are pushed to `localStorage.jarvis_pending_sync_queue` and flushed automatically when `/api/health` connectivity is restored.

---

## 3. Comprehensive Backend Routes

### Core System & Diagnostics
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health check and uptime probe. |
| `GET` | `/api/daemon/status` | Comprehensive system telemetry, memory usage, scheduler state. |
| `POST` | `/api/chat` | Main Jarvis conversational API & tool reasoning engine. |
| `POST` | `/api/system/kill-switch` | Global Kill Switch emergency trigger. |
| `POST` | `/api/system/resume` | Resumes system operations from emergency halt. |
| `GET` | `/api/emergency/status` | Returns emergency pause state and reason. |
| `POST` | `/api/emergency/toggle` | Toggles emergency pause state. |

### Memory & Persistence
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/memory` | Retrieves user profile, notes, custom keys, and stats. |
| `POST` | `/api/memory` | Updates user preferences, notes, or stats. |

### Mobile Telegram Gateway
| Method | Route | Description |
| :--- | :--- | :--- |
| `POST` | `/api/telegram/webhook` | Ingress webhook for Telegram updates. |
| `GET` | `/api/telegram/messages` | Returns Telegram message history and connection config. |
| `POST` | `/api/telegram/send` | Dispatches message/command through the Telegram gateway. |

### Social Media & OAuth 2.0
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/social/platforms` | Returns live status and setup guidelines for all platforms. |
| `POST` | `/api/social/platforms/test` | Runs a real live API probe against a platform. |
| `GET` | `/api/social/posts` | Lists all social post drafts and history. |
| `POST` | `/api/social/generate` | Generates a platform-optimized social post draft. |
| `POST` | `/api/social/action` | Approves or rejects a social post draft. |
| `GET` | `/api/auth/linkedin/url` | Generates LinkedIn OAuth 2.0 authorization URL. |
| `GET` | `/api/auth/linkedin/callback` | Exchanges LinkedIn OAuth authorization code for token. |
| `POST` | `/api/auth/linkedin/disconnect` | Disconnects LinkedIn account. |
| `GET` | `/api/auth/youtube/url` | Generates Google / YouTube OAuth 2.0 authorization URL. |
| `GET` | `/api/auth/youtube/callback` | Exchanges Google OAuth authorization code for tokens. |
| `GET` | `/api/auth/youtube/status` | Returns YouTube channel authentication status. |
| `POST` | `/api/auth/youtube/disconnect` | Disconnects YouTube channel. |

### Permission Gateway & Approvals
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/approvals/pending` | Lists all pending Level 4 approval requests. |
| `GET` | `/api/approvals/all` | Lists complete history of approval requests. |
| `POST` | `/api/approvals/create` | Registers a new action request for human approval. |
| `POST` | `/api/approvals/resolve` | Approves and executes or rejects a Level 4 action. |
| `GET` | `/api/actions/audit` | Returns immutable audit trail. |

### Developer & System Tools
| Method | Route | Description |
| :--- | :--- | :--- |
| `POST` | `/api/tools/fs/list` | Lists files in workspace directory. |
| `POST` | `/api/tools/fs/read` | Reads content of a workspace file. |
| `POST` | `/api/tools/fs/write` | Writes content to a workspace file (Level 3). |
| `POST` | `/api/tools/fs/delete` | Deletes a workspace file. |
| `POST` | `/api/tools/git/status` | Returns real `git status` output. |
| `POST` | `/api/tools/git/log` | Returns real `git log` history. |
| `POST` | `/api/tools/git/diff` | Returns real `git diff` output. |
| `POST` | `/api/tools/github/status` | Returns GitHub connection and rate limit status. |
| `POST` | `/api/tools/github/repos` | Fetches repositories for the authenticated user. |
| `POST` | `/api/tools/github/create-issue` | Creates a new issue in a GitHub repository. |
| `POST` | `/api/tools/web/fetch` | Performs real HTTP fetch and title/meta extraction. |
| `POST` | `/api/tools/email/status` | Checks SMTP / transactional email configuration. |
| `GET` | `/api/tools/integrations/audit` | Comprehensive verification matrix of all tools. |

### Public Legal & Google OAuth Compliance Endpoints
| Method | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/privacy` / `/privacy-policy` | Dedicated standalone HTML Privacy Policy disclosing requested scopes (`youtube.readonly`, `youtube.upload`), AES-256-GCM token encryption, human-in-the-loop authorization, and user data deletion. Accessible publicly with no authentication or JavaScript required. |
| `GET` | `/terms` / `/terms-of-service` | Dedicated standalone HTML Terms of Service covering acceptable use, AI limitations, Level-4 gate, kill switch, and liability disclaimers. |

