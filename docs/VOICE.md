# 🎙️ HERMES JARVIS — Natural Voice Assistant & Multi-Language Architecture

## 1. Executive Summary
HERMES JARVIS features a natural, calm, conversational voice assistant engineered for hands-free productivity, multilingual fluency, and deterministic security. The system operates on a **Local-First / Zero-Cost (₹0)** architecture backed by browser-native Web Speech APIs and server-side fallback engines.

---

## 2. Core Voice Design Principles

### 2.1 Natural, Respectful Tone
- **Calm & Professional**: Speaks with measured cadence, clarity, and composed phrasing.
- **Concise & Helpful**: Delivers direct answers without robotic fillers or repetitive prefixes.
- **Anti-Spam Protocol**: Strictly avoids excessive "Sir" or "सर" repetitions after every sentence.
- **Truthful & Grounded**: Never claims access to data or systems that are not actively connected or permitted.

### 2.2 Conversational Loop with Real-Time Interruption
```
User Speaks Naturally ──► Speech Recognition Engine (Locale Adaptive)
                                  │
                                  ▼
                         Language Detection & Interruption Check
                                  │
                   ┌──────────────┴──────────────┐
                   ▼                             ▼
       Interruption Command Detected?      Normal Intent Processing
      ("Stop", "रुको", "Cancel", "चुप")           │
                   │                             ▼
          Immediate Audio Cease            Local Engine / Server
                   │                             │
        Listen for New Instruction               ▼
                                           Calm Voice Response (TTS)
                                                 │
                                                 ▼
                                        User Can Interrupt Any Time
```

---

## 3. Supported Languages & Multi-Modal Capabilities

HERMES JARVIS supports a 30+ language registry defined in `src/utils/languages.ts`:

| Language Mode | Code | Speech Locale | Core Voice Persona & Behavior |
| :--- | :--- | :--- | :--- |
| **Auto-Detect** | `auto` | Adaptive | Dynamically detects Hindi, English, or Hinglish from speech and responds fluently in that exact mode. |
| **Hindi** | `hi-IN` | `hi-IN` | Authentic respectful conversational Hindi while preserving technical nouns (OAuth, YouTube, API, Telegram, Git). |
| **Hinglish** | `hinglish` | `hi-IN` / `en-IN` | Natural bilingual Hindi-English conversational mix for everyday Indian developer workflows. |
| **English (US)** | `en-US` | `en-US` | Calm, concise, globally standard executive assistant cadence. |
| **English (India)** | `en-IN` | `en-IN` | Crisp, polite Indian English tone. |
| **English (UK)** | `en-GB` | `en-GB` | Eloquent British cadence, crisp and respectful. |
| **Spanish, French, German, Japanese, Arabic, etc.** | `es-ES`, `fr-FR`, `de-DE`, etc. | Regional locales | Fully configured with native greetings and localized synthesis options. |

---

## 4. Speech Interruption Protocols

Users can interrupt JARVIS at any moment while voice is playing by speaking or clicking the interrupt button:

### 4.1 Voice Interruption Triggers
- **English**: `"stop"`, `"stop speaking"`, `"cancel"`, `"pause"`, `"wait"`, `"hold on"`, `"shut up"`, `"quiet"`, `"silence"`, `"abort"`
- **Hindi**: `"रुको"`, `"रुक जाओ"`, `"चुप"`, `"चुप रहो"`, `"बस"`, `"बस करो"`, `"शांत रहो"`, `"बोलना बंद करो"`
- **Hinglish**: `"ruko"`, `"ruk jao"`, `"chup"`, `"chup raho"`, `"bas"`, `"bas karo"`, `"shant ho jao"`, `"chup ho jao"`

### 4.2 Interruption Flow
1. Active speech utterance is immediately halted via `window.speechSynthesis.cancel()`.
2. Audio state transitions from `SPEAKING` to `IDLE` / `LISTENING`.
3. The interrupt reason is logged in telemetry without breaking conversational state.

---

## 5. Level-4 Human Authorization Voice Safeguards

Voice commands cannot bypass the Level-4 Human Authorization Gateway:
- **YouTube Public Video Upload**: Staged locally; requires explicit human confirmation before the API publishes.
- **Social Media Broadcasting**: Draft generated; requires human approval in UI or Telegram before posting.
- **Remote Push / Shell Execution**: Requires Level 3/4 permission review.
- **Financial Operations**: Permanently blocked at the semantic parser level with immediate safety notification.

---

## 6. Verification & Automated Testing

The voice subsystem is backed by Vitest unit and integration suites:
- `src/tests/languages.test.ts`: Language registry and option resolvers.
- `src/tests/localJarvisEngine.test.ts`: Local command processing across all intents.
- `src/tests/voiceAndHindiModes.test.ts`: Comprehensive test suite for Hindi, English, Hinglish, interruption commands, Level-4 gate verification, and truthful YouTube status reports.
