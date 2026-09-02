# 🔒 Security & Authorization Architecture

## 1. Four-Tier Human Authorization Gateway (Level 1–4)

HERMES JARVIS enforces a strict 4-level permission policy across all subsystems:

```
[Level 1: Read-Only]      ──► System stats, time, diagnostics, git status (Autonomous)
[Level 2: Draft/Create]   ──► Create local notes, draft proposals, staging (Autonomous)
[Level 3: Modify State]   ──► Edit local files, update routines, switch modes (Human Awareness)
[Level 4: External Action]──► YouTube upload, Social publishing, Remote push (MANDATORY HUMAN GATE)
```

### Level 4 Invariant:
No external write, upload, or broadcasting action can occur without explicit human approval ("YES / APPROVE").

---

## 2. Strict Financial Exclusions Guard
- All financial, banking, crypto, and payment-related commands are blocked at the semantic parsing level.
- Any query attempting fund transfers, credit card charges, or wallet movements triggers the `FINANCE_SECURITY_GUARD` rejection response.

---

## 3. Global Kill Switch Protocol
- Emergency stop triggers can be issued via voice (`"emergency stop"`, `"जार्विस तुरंत सब बंद करो"`), UI button, or Telegram command (`/stop`, `/emergency_stop`).
- Upon activation:
  - All background polling and scheduled tasks are frozen.
  - Active network broadcasts are terminated.
  - Subsystems enter a safe, read-only standby state until explicitly unpaused via Level 4 authorization (`/resume`).
