# 🧪 HERMES JARVIS — Testing & Verification Protocols

This document provides step-by-step verification procedures to test all integrated subsystems of HERMES JARVIS without producing false-positive claims.

---

## 1. Subsystem Verification Checklist

| Subsystem | Test Objective | Expected Behavior |
| :--- | :--- | :--- |
| **Health API** | Query `/api/health` | Returns `{ status: 'ok', uptime, timestamp }`. |
| **Daemon Telemetry** | Query `/api/daemon/status` | Returns memory footprint, scheduler jobs, uptime, and system diagnostics. |
| **Global Kill Switch** | Trigger Kill Switch from HUD or `POST /api/system/kill-switch` | Emergency stop activates, task queue purges, Telegram polling halts, immutable audit log created. |
| **System Resume** | Click Resume in HUD or `POST /api/system/resume` | Emergency halt released, standard level 1-4 permission mode restored. |
| **Telegram Bot** | Send text message to Bot in Telegram | Bot parses intent, checks permissions, returns responsive markdown reply with execution status. |
| **Level 4 Permission Gate**| Request LinkedIn post publish or remote action | Placed in `PENDING_APPROVAL`, approval card with `YES/NO` buttons dispatched to Telegram and HUD. |
| **YouTube OAuth 2.0** | Click Connect YouTube in Social Hub | Opens Google OAuth popup, exchanges authorization code, returns live channel metadata. |
| **LinkedIn OAuth 2.0** | Click Connect LinkedIn in Social Hub | Opens LinkedIn OAuth popup, exchanges authorization code, locks in Author URN and profile name. |
| **Filesystem Tools** | Read/List files via `/api/tools/fs/*` | Executes real filesystem operations confined to the workspace root directory. |
| **Git Diagnostics** | Query `/api/tools/git/status` | Executes real `git status` command and returns branch & working tree state. |
| **Offline Resilience** | Disconnect network in DevTools | HUD displays `OFFLINE READY`, user notes persist in `localStorage` and sync upon reconnection. |

---

## 2. Step-by-Step Manual Test Scenarios

### Scenario A: Testing the Global Kill Switch
1. In the HUD, verify the status badge reads `₹0 Always Free` and `SYNCED`.
2. Click the red **KILL SWITCH** button in the HUD header.
3. In the confirmation dialog, review the emergency protocol and click **ENGAGE KILL SWITCH**.
4. **Verification**:
   - The top banner turns flashing red with `🚨 GLOBAL KILL SWITCH ACTIVE: ALL BACKGROUND DAEMONS & QUEUES FROZEN`.
   - Any scheduled or pending task in the Permission Gateway is immediately cleared.
   - If Telegram is connected, an emergency alert notice is sent to the admin chat.
5. Click **RESUME SYSTEM**. Verify the top banner clears and normal operations resume.

---

### Scenario B: Testing Telegram Gateway & Intent Classification
1. Ensure `TELEGRAM_BOT_TOKEN` is set.
2. In Telegram, open your bot chat and send:
   `"JARVIS, project check करो"`
3. **Verification**:
   - The bot replies in clean Hinglish/English with current project repository status, memory stats, and active tasks.
4. Send an unauthorized finance command:
   `"JARVIS, transfer ₹5000 to client"`
5. **Verification**:
   - JARVIS rejects the command immediately with a `FINANCE_SECURITY_GUARD` policy violation log.

---

### Scenario C: Testing YouTube OAuth 2.0 Flow
1. Set `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET`.
2. In the HUD, click **Social Approval** (or **Social Media Hub**).
3. Scroll to the **YouTube** card.
4. Ensure the Google Cloud Console has your exact Redirect URI listed.
5. Click **Connect YouTube**.
6. Sign in and grant permissions.
7. **Verification**:
   - Popup window closes automatically with postMessage event.
   - The YouTube card turns green with connected channel title and avatar.

---

### Scenario D: Testing Autonomous Tools & Git Explorer
1. Click **Autonomous Tools** in the HUD bottom navigation.
2. In the **Workspace File Explorer**, browse through project directories and inspect file contents.
3. In the **Git Repository Inspector**, inspect current modified files, commit log, and active branch.
4. In the **Live Web Research** tab, enter a valid URL (e.g., `https://news.ycombinator.com`) and click **Execute Real Web Fetch**.
5. **Verification**:
   - Real HTTP GET request is performed with HTTP status, title, and preview extracted accurately.

---

## 3. Automated Validation Commands

Run these terminal commands to verify the integrity and compilation of the codebase:

```bash
# 1. Typecheck and lint
npm run lint

# 2. Production build compilation test
npm run build

# 3. Test dev server boot
node dist/server.cjs
```
