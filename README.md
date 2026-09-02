# 🤖 Mobile-Controlled HERMES JARVIS

> **Autonomous Cloud Daemon & Mobile-Supervised AI Assistant with Zero False-Positive Verification Architecture**  
> *Target Stack: Oracle Cloud Always Free (ARM Ampere A1, 4 OCPU / 24 GB RAM) | Telegram Bot Gateway | Full-Stack Node.js (Express + TypeScript + Vite + React 18)*

---

## 📌 1. Project Overview (सिस्टम परिचय)

**HERMES JARVIS** is a production-ready, zero-subscription personal AI agent daemon. It enables complete hands-free remote supervision and autonomous task execution from your Android mobile (via Telegram Bot and responsive web dashboard) backed by a 24/7 persistent background daemon.

### 🌟 Core Design Principles
1. **Strict Zero-Cost Infrastructure (₹0 / Forever Free)**: Built natively to run on Oracle Cloud Always Free Compute (ARM64) with free-tier Gemini 2.5/3.7 Flash and zero-cost Telegram Bot APIs.
2. **Deterministic Truth & Zero-Fake Claims**: No simulated "success" or fake "published" flags. All social media, cloud, and git integrations run live validation probes and report true provider statuses.
3. **Four-Tier Security Permission Gateway (Level 1-4)**:
   - **Level 1 (Read-Only)**: Passive system inspection, git status, file queries.
   - **Level 2 (Create)**: Local generation of drafts, quotations, notes.
   - **Level 3 (Modify)**: Controlled workspace file edits and task updates.
   - **Level 4 (External Actions)**: Live social posting, client emails, remote push. **Always requires explicit human confirmation ("Post तैयार है। Publish करूँ? -> YES")**.
4. **Global Kill Switch**: Immediate emergency protocol from the HUD or Telegram to terminate background daemons, purge task queues, and pause polling loops.
5. **Multi-Tier Offline-First Memory**: Encrypted JSON persistence (`jarvis_memory.json`) with client-side localStorage fallback and automatic reconciliation upon network restore.

---

## 🗺️ 2. Architectural Blueprint & Phased Capabilities

HERMES JARVIS is engineered around a 10-phase master blueprint (Phases 0 through 9):

| Phase Code | Module Name | Primary Capabilities |
| :--- | :--- | :--- |
| **PHASE_0** | Zero-Cost Infrastructure Setup | Oracle Cloud Always Free ARM64 Ubuntu 24.04 provisioning, Nginx reverse proxy, PM2 daemon. |
| **PHASE_1** | Linux Environment & System Hardening | Systemd service setup, firewall rules (ports 22, 80, 443, 3000), security sandboxing. |
| **PHASE_2** | Hermes Core Framework & Sandbox | Core agent loop, deterministic tool routing, localized bash execution sandboxing. |
| **PHASE_3** | Hardware-Optimized AI Brain | Gemini 2.5/3.7 Flash server-side integration + bilingual heuristic fallback engine. |
| **PHASE_4** | Mobile Telegram Gateway | 2-way Telegram Bot (`@HermesJarvisBot`) with long polling, deduplication, inline approval cards. |
| **PHASE_5** | Multi-Tier Context Memory | File-backed JSON vault (`jarvis_memory.json`), strict zero-credential memory leakage policy. |
| **PHASE_6** | Autonomous Developer Tools Suite | Native filesystem explorer, real Git status/diff/log tools, GitHub issue creator, web scraper. |
| **PHASE_7** | Freelance CRM & Quotation Engine | Lead ingestion, automated requirement parsing, dynamic multi-currency proposals (₹ INR / $ USD). |
| **PHASE_8** | Social Media Engine & Human Approval | LinkedIn UGC OAuth 2.0, YouTube Data API v3, Meta Facebook/Instagram & X/Twitter stubs with Level 4 gate. |
| **PHASE_9** | Proactive 24/7 Automation Routines | IST cron scheduler: 09:00 AM Morning Briefing, 02:00 PM Site Health, 06:30 PM Social, 10:30 PM Work Summary. |

---

## 🛠️ 3. Quick Start & Local Execution

### Prerequisites
- Node.js 20+ (or Node.js 22 LTS)
- npm or bun

### Setup Steps
```bash
# 1. Clone repository
git clone https://github.com/your-username/mobile-controlled-hermes-jarvis.git
cd mobile-controlled-hermes-jarvis

# 2. Copy environment template
cp .env.example .env

# 3. Install dependencies
npm install

# 4. Start Development Full-Stack Server
npm run dev
# The application binds to http://0.0.0.0:3000
```

---

## 📚 4. Documentation Index

Detailed engineering and configuration guides are available in the `/docs` directory:

- [📖 Architecture & Deep Systems Blueprint (docs/ARCHITECTURE.md)](./docs/ARCHITECTURE.md)
- [⚙️ Setup & Cloud Deployment Guide (docs/SETUP.md)](./docs/SETUP.md)
- [🔐 OAuth 2.0 & Platform Integrations Setup (docs/OAUTH.md)](./docs/OAUTH.md)
- [🧪 Testing & Verification Protocols (docs/TESTING.md)](./docs/TESTING.md)

---

## 🛡️ 5. Security & Responsible AI Notice
- Financial and payment execution commands are **strictly prohibited** and blocked at the parser level (`FINANCE_SECURITY_GUARD`).
- Secret tokens and API keys are **never stored** in chat memory or logs.
- Sensitive environment variables are masked in all diagnostic reports.
