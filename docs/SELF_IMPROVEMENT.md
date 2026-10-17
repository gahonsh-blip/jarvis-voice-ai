# 🧬 HERMES JARVIS — Autonomous Self-Improvement & Review Architecture

This document specifies the exact architecture, safety constraints, risk classification, review metrics, and execution protocols for JARVIS's Autonomous Self-Improvement Engine.

---

## 1. Core Mission & Philosophy

HERMES JARVIS operates a **controlled, bounded, and auditable self-improvement loop**.
The engine is engineered to identify its own operational errors, refine internal prompts, create reusable tool skills, generate comprehensive documentation, and improve runtime resilience **without ever compromising safety, bypassing security gates, or entering recursive runaways**.

```
  +-------------------------------------------------------------+
  |                   GOAL & RULES INGESTION                    |
  +------------------------------+------------------------------+
                                 |
                                 v
  +-------------------------------------------------------------+
  |                          OBSERVE                            |
  |   • Inspect logs, audit trails, test outputs, error counts   |
  +------------------------------+------------------------------+
                                 |
                                 v
  +-------------------------------------------------------------+
  |                          RESEARCH                           |
  |   • Gemini AI diagnostics, root cause synthesis             |
  +------------------------------+------------------------------+
                                 |
                                 v
  +-------------------------------------------------------------+
  |                            PLAN                             |
  |   • Target files, proposed diffs, risk scoring (Level 1-4)  |
  +------------------------------+------------------------------+
                                 |
                                 v
  +-------------------------------------------------------------+
  |                       BUILD / MODIFY                        |
  |   • Apply scoped edits to code, prompts, skills, or docs    |
  +------------------------------+------------------------------+
                                 |
                                 v
  +-------------------------------------------------------------+
  |                            TEST                             |
  |   • Run syntax checks (tsc --noEmit), unit checks, audits   |
  +------------------------------+------------------------------+
                                 |
                                 v
  +-------------------------------------------------------------+
  |                       REVIEW & SCORE                        |
  |   • Compute 0-100 Quality Score (Correctness, Security,     |
  |     Maintainability, Duplication, Regression Risk)          |
  +------------------------------+------------------------------+
                                 |
                 +---------------+---------------+
                 |                               |
                 v (Score >= 80 & Risk <= L2)    v (Score < 80 OR Risk >= L3)
  +------------------------------+ +------------------------------+
  |     SAFE CHANGE (APPLY)      | |   APPROVAL REQUIRED / STAGE  |
  | • Atomic commit to memory    | | • Queued for Human Decision  |
  | • Update metrics & skills    | | • Sent to Telegram & Web HUD |
  +--------------+---------------+ +--------------+---------------+
                 |                               |
                 +---------------+---------------+
                                 |
                                 v
  +-------------------------------------------------------------+
  |                    MEMORY & EXPERIENCE                      |
  |   • Record cycle outcome, lessons learned, rollback snapshot|
  +-------------------------------------------------------------+
```

---

## 2. Safe Autonomy Levels & Permission Boundary

All autonomous improvement actions must strictly adhere to the 4 Security Levels:

| Level | Classification | Scope & Permitted Actions | Approval Requirement |
| :--- | :--- | :--- | :--- |
| **Level 1** | **AUTO SAFE** | Documentation fixes, Markdown formatting, internal prompt optimizations, non-sensitive analysis, reports, draft generation. | Auto-applied immediately if tests pass. |
| **Level 2** | **AUTO WITH VALIDATION** | Reusable skill improvements, non-sensitive local bug fixes, test suite hardening, local refactoring, internal workflow improvements. | Auto-applied ONLY after TypeScript compilation and static verification pass (Score $\ge 80$). |
| **Level 3** | **HUMAN APPROVAL** | Core production server route modifications, external API integration changes, social media broadcasts, new OAuth scopes, major structural alterations. | Staged in `pending_approval` queue; requires explicit human authorization (`YES/APPROVE`). |
| **Level 4** | **ALWAYS BLOCKED / HUMAN RESTRICTED** | Financial/banking operations, credential extraction, bypassing authorization gates, disabling Kill Switch, removing audit logs, leaking secrets. | Permanently blocked by `FINANCE_SECURITY_GUARD` and hardcoded gateway checks. |

---

## 3. Strict Security Invariants (Non-Negotiable)

The autonomous self-improvement engine is **STRICTLY FORBIDDEN** from modifying or disabling:
1. **Global Kill Switch**: The emergency stop mechanism at `/api/system/kill-switch`.
2. **Permission Gateway**: The Level 4 Human-in-the-Loop approval gate at `/api/approvals/*`.
3. **Finance & Banking Guard**: The permanent `FINANCE_SECURITY_GUARD` block in `server.ts`.
4. **Credential Obfuscation**: Passwords, OAuth client secrets, and bearer tokens are never logged or stored in plaintext memory.
5. **Immutable Audit Trails**: Actions logged to `auditLog` cannot be deleted or rewritten by autonomous cycles.

---

## 4. Multi-Dimensional Quality Scoring Algorithm

Every cycle evaluates proposed modifications against 7 weighted metrics ($0 - 100$):

$$\text{Quality Score} = 0.25 \cdot C + 0.25 \cdot S + 0.15 \cdot M + 0.15 \cdot R + 0.10 \cdot P + 0.05 \cdot K + 0.05 \cdot D$$

- **Correctness ($C$)**: Syntax validity, TypeScript type safety, adherence to contracts.
- **Security ($S$)**: Zero secret leakage, no permission escalation, bounded inputs.
- **Maintainability ($M$)**: Clean modular structure, explicit types, standard conventions.
- **Reliability ($R$)**: Error handling, timeouts, zero unhandled promise rejections.
- **Performance ($P$)**: Memory efficiency, low CPU footprint, non-blocking I/O.
- **Knowledge Retention ($K$)**: Reusable skills formatted with clear input/output schemas.
- **Anti-Duplication ($D$)**: Re-use of existing services; no duplicate memory or schedulers.

### Decision Matrix:
- **Score $\ge 80$ + Risk $\le 2$**: Marked `AUTO_APPLIED`.
- **Score $\ge 70$ + Risk $\ge 3$**: Marked `STAGED_PENDING_APPROVAL`.
- **Score $< 70$**: Marked `REJECTED_LOW_QUALITY` and reverted to previous snapshot.

---

## 5. Memory & Experience Schema

Autonomous self-improvement data is persisted in `jarvis_memory.json` under `selfImprovement`:

```json
{
  "selfImprovement": {
    "totalCyclesRun": 14,
    "improvementsApplied": 12,
    "lastCycleTimestamp": 1740000000000,
    "cycleHistory": [
      {
        "cycleId": "cycle-1740000000000-abc",
        "timestamp": 1740000000000,
        "objective": "Hardened YouTube multipart chunking retry logic",
        "targetModules": ["server.ts", "SocialMediaModal.tsx"],
        "testsExecuted": ["tsc --noEmit", "lint_applet", "runtime_probe"],
        "qualityScore": 94,
        "riskLevel": 2,
        "actionTaken": "AUTO_APPLIED",
        "humanApprovalRequired": false,
        "rollbackSnapshot": "{...}"
      }
    ],
    "learnedSkills": [
      {
        "id": "skill-yt-upload-resilience",
        "name": "YouTube Resilient Chunking",
        "category": "social",
        "description": "Multi-tier exponential backoff for large video stream uploads",
        "usageCount": 8,
        "successRate": 1.0,
        "codeTemplate": "..."
      }
    ],
    "knownFailurePatterns": [
      {
        "pattern": "Telegram reply_markup serialized with invalid type",
        "occurrenceCount": 1,
        "resolution": "Use JSON.stringify() with explicit ReplyKeyboardMarkup schema",
        "status": "RESOLVED"
      }
    ]
  }
}
```

---

## 6. Real-Time Telemetry & API Endpoints

- `GET /api/self-improvement/status` — Returns cycle count, success rate, and engine health.
- `POST /api/self-improvement/cycle` — Initiates an autonomous diagnose, plan, build, test, and review cycle.
- `GET /api/self-improvement/history` — Lists past improvement cycles with scores and diffs.
- `POST /api/self-improvement/rollback` — Safely rolls back a specific cycle using stored snapshot.
- `GET /api/skills/list` — Lists all registered reusable skills.
- `POST /api/skills/register` — Registers or updates an AI-crafted reusable skill.
- `POST /api/review/evaluate` — Performs on-demand multi-dimensional quality scoring on arbitrary code, prompts, or drafts.
