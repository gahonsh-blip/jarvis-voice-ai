# REAL HERMES AGENT BACKEND INTEGRATION SPECIFICATION & CONTRACT
**Target Interface**: JARVIS Frontend UI <---> Real External Hermes Agent Backend
**Document Status**: FROZEN & READY FOR IMPLEMENTATION

---

## 1. Architecture Overview & Clean Integration Boundary

This contract specifies the interface required to connect the JARVIS Frontend with a real external Hermes Agent running as an autonomous daemon (e.g. on an Oracle Cloud ARM VM or dedicated server).

```
┌─────────────────────────────────────────────────────────┐
│              JARVIS Frontend / Web UI Shell             │
│        (Voice Recognition, Speech Synthesis, HUD)       │
└────────────────────────────┬────────────────────────────┘
                             │  HTTPS / WSS / REST
                             ▼
┌─────────────────────────────────────────────────────────┐
│        Real External Hermes Agent Backend Service       │
│     (Autonomous Engine, Tools, Sandbox, Memory Core)    │
└───────────┬─────────────────┬───────────────────┬───────┘
            │                 │                   │
            ▼                 ▼                   ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │ Telegram Bot │   │  Oracle OCI  │   │ LLM Provider │
    │   (Live API) │   │   Telemetry  │   │(Gemini/Ollama│
    └──────────────┘   └──────────────┘   └──────────────┘
```

---

## 2. Environment Variables Specification

Define these in the deployment environment (`.env`) for the Hermes Agent service:

```env
# ==============================================================================
# HERMES AGENT CORE CONFIGURATION
# ==============================================================================
# Port and Host for Hermes Agent REST/WebSocket Gateway
HERMES_HOST=0.0.0.0
HERMES_PORT=8080

# Master Shared Secret for API Authentication (Bearer Token)
HERMES_API_SECRET=hermes_sec_replace_with_strong_token

# Environment Mode ('development' | 'production')
HERMES_ENV=production

# ==============================================================================
# LLM ENGINE (GEMINI / LOCAL)
# ==============================================================================
# Primary LLM API Key (Server-side only)
GEMINI_API_KEY=your_gemini_api_key_here
HERMES_MODEL_NAME=gemini-2.5-flash

# Optional: Local Ollama / vLLM Fallback URL
OLLAMA_BASE_URL=http://127.0.0.1:11434

# ==============================================================================
# TELEGRAM MOBILE GATEWAY (PHASE 4)
# ==============================================================================
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
TELEGRAM_ADMIN_CHAT_ID=987654321
TELEGRAM_WEBHOOK_URL=https://your-domain.com/api/hermes/telegram/webhook

# ==============================================================================
# ORACLE CLOUD OCI TELEMETRY (PHASE 1)
# ==============================================================================
OCI_COMPUTE_ID=ocid1.instance.oc1...
OCI_TENANCY_ID=ocid1.tenancy.oc1...
OCI_USER_ID=ocid1.user.oc1...
OCI_FINGERPRINT=aa:bb:cc:dd:ee:...
OCI_PRIVATE_KEY_PATH=/home/ubuntu/.oci/oci_api_key.pem
OCI_REGION=ap-mumbai-1

# ==============================================================================
# SOCIAL PLATFORMS & OUTBOUND (PHASE 8)
# ==============================================================================
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_ACCESS_TOKEN=
TWITTER_API_KEY=
TWITTER_API_SECRET=
TWITTER_ACCESS_TOKEN=
TWITTER_ACCESS_SECRET=
```

---

## 3. Authentication & Security Method

- **Header Authentication**:
  All client requests to the Hermes Backend must pass the Bearer Authorization header:
  ```http
  Authorization: Bearer <HERMES_API_SECRET>
  X-Hermes-Client-ID: jarvis-web-ui
  ```
- **Webhook HMAC Signature**:
  Incoming webhooks (e.g. Telegram or GitHub) must verify against the `X-Hermes-Signature` SHA-256 HMAC header.

---

## 4. API Endpoints Contract

### 4.1. Health & Status Check
- **Route**: `GET /api/v1/health`
- **Description**: Verifies Hermes agent daemon status, resource metrics, and sub-module connectivity.
- **Request Headers**:
  `Authorization: Bearer <TOKEN>`
- **Response Schema (`200 OK`)**:
  ```json
  {
    "status": "healthy",
    "version": "1.0.0-hermes",
    "uptime_seconds": 128400,
    "timestamp": "2026-08-31T08:30:00.000Z",
    "services": {
      "llm_engine": "connected",
      "telegram_bot": "active_polling",
      "oci_monitor": "connected",
      "memory_database": "synced"
    },
    "hardware": {
      "cpu_usage_pct": 12.4,
      "memory_used_mb": 3420,
      "memory_total_mb": 24576,
      "disk_used_gb": 32.8,
      "disk_total_gb": 200.0
    }
  }
  ```

---

### 4.2. Command Dispatch Endpoint
- **Route**: `POST /api/v1/command`
- **Description**: Dispatches a high-level user command or natural language instruction to Hermes for autonomous execution.
- **Request Schema**:
  ```json
  {
    "session_id": "session-uuid-v4",
    "command": "Check status of portfolio project and draft LinkedIn post",
    "language": "en-US",
    "security_level": 2,
    "context": {
      "active_app": "voice_core",
      "user_name": "Sir"
    }
  }
  ```
- **Response Schema (`200 OK`)**:
  ```json
  {
    "execution_id": "exec-98234",
    "status": "completed",
    "intent": "create_social_post",
    "reply_text": "Sir, I have audited your recent commit logs and prepared a draft LinkedIn post regarding autonomous agent deployments.",
    "spoken_summary": "I have audited the commits and drafted the post for your review.",
    "action_detail": {
      "type": "create_social_post",
      "title": "Autonomous AI Agent Architecture",
      "requires_human_approval": true,
      "payload": {
        "platform": "LinkedIn",
        "draft_id": "post-409"
      }
    },
    "audit_log_id": "audit-5912"
  }
  ```

---

### 4.3. Event / Execution Stream (Server-Sent Events / SSE)
- **Route**: `GET /api/v1/stream?session_id=<UUID>`
- **Description**: Real-time event streaming of agent chain-of-thought, tool invocation events, and terminal output.
- **Protocol**: `text/event-stream`
- **Event Types**:
  - `agent:thought` — Reasoning step
  - `agent:tool_call` — Sub-tool execution (e.g. `bash_exec`, `web_search`)
  - `agent:approval_required` — Human confirmation gate
  - `agent:final_response` — Finished payload
- **Sample Event Stream Payload**:
  ```sse
  event: agent:thought
  data: {"step": 1, "text": "Auditing local repository git log..."}

  event: agent:tool_call
  data: {"tool": "git_status", "args": {"repo": "/var/www/project"}, "status": "running"}

  event: agent:approval_required
  data: {"approval_id": "appr-102", "action": "Publish LinkedIn Post", "level": 4}

  event: agent:final_response
  data: {"reply": "Execution paused awaiting Level 4 confirmation."}
  ```

---

### 4.4. Memory Core Interface
- **Route**: `GET /api/v1/memory`
- **Route**: `POST /api/v1/memory/query` (Vector / Semantic Search)
- **Request (`POST /api/v1/memory/query`)**:
  ```json
  {
    "query": "client quotation rate for Aarav Tech",
    "limit": 3
  }
  ```
- **Response Schema (`200 OK`)**:
  ```json
  {
    "results": [
      {
        "id": "mem-291",
        "category": "freelance_quote",
        "content": "Aarav Tech Solutions quote ₹65,000 for WhatsApp AI Bot with CRM integration.",
        "similarity": 0.94,
        "timestamp": "2026-08-30T14:20:00.000Z"
      }
    ]
  }
  ```

---

### 4.5. Human Approval & Safety Gating
- **Route**: `POST /api/v1/security/approve`
- **Request**:
  ```json
  {
    "approval_id": "appr-102",
    "decision": "APPROVED",
    "approver": "HUMAN_OPERATOR",
    "feedback": ""
  }
  ```
- **Response Schema (`200 OK`)**:
  ```json
  {
    "status": "resumed",
    "execution_id": "exec-98234",
    "action_result": "Successfully broadcasted via LinkedIn API."
  }
  ```

---

## 5. Implementation Roadmap For Real Hermes Backend

When you are ready to implement the real Hermes Agent service:

1. **Host Setup**: Deploy Hermes service to your Oracle Always Free ARM Ubuntu 24.04 VM.
2. **Reverse Proxy & SSL**: Configure Nginx with Let's Encrypt SSL on the VM directing `/api/v1/*` to the Hermes daemon on port `8080`.
3. **Environment**: Place the specified environment variables into `.env` on the host.
4. **JARVIS Frontend Integration**: Point the JARVIS client endpoints to `https://your-vm-domain.com/api/v1` with the authorization token.
