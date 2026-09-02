# 📜 CHANGELOG — HERMES JARVIS

All notable improvements, security updates, and feature additions are documented in this file.

---

## [v2.4.0] - Natural Voice Assistant + Hindi Mode Upgrade

### 🎙️ Natural Voice & Multilingual Experience
- **Calm, Professional Voice Persona**: Upgraded tone to be soft, warm, respectful, and concise without robotic fillers or repetitive "Sir/सर" suffixes.
- **Hindi & Hinglish Natural Conversational Mode**: Added native Hindi (`hi-IN`) and bilingual Hinglish conversational fluency with accurate terminology preservation.
- **Dynamic Language Detection**: Auto-detection engine intelligently routes between Hindi, Hinglish, English, and 30+ regional languages.
- **Real-Time Speech Interruption**: Added instant speech interruption via voice commands ("Stop", "रुको", "Cancel", "चुप", "बस", "शांत रहो") and HUD controls.
- **Dynamic Language Selector in Settings**: Implemented interactive dropdown in `SettingsModal` bound to `SUPPORTED_LANGUAGES` registry with live locale switching.

### 🛡️ Security & Truth Invariants
- **Level-4 Human Authorization Voice Gateway**: Voice commands for public uploads, broadcasts, and remote changes enforce explicit human confirmation.
- **Truthful Status Inquiries**: Channel status queries return verified OAuth connection states without simulated or false claims.
- **Strict Finance Exclusions Guard**: Reinforced semantic blocking of all financial and payment commands.
- **6-Tier Permission Matrix**: Enforced user control over mobile telemetry (battery, weather, notifications, calendar, email, device health).

### 🧪 Automated Testing & Documentation
- Comprehensive Vitest suite with **69/69 passing tests** across 4 test files (`languages.test.ts`, `localJarvisEngine.test.ts`, `voiceAndHindiModes.test.ts`, `legalRoutes.test.ts`).
- Created and updated documentation: `README.md`, `docs/ARCHITECTURE.md`, `docs/VOICE.md`, `docs/PRIVACY.md`, `docs/SECURITY.md`, `docs/CHANGELOG.md`, `docs/AUDIT_REPORT.md`.
