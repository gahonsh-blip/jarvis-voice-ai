# 🛡️ Privacy & Data Governance Framework

## 1. Privacy First Architecture
HERMES JARVIS is designed with strict data minimization principles. All user data, notes, and local interaction histories remain under the complete sovereignty of the user.

---

## 2. Telemetry & Mobile Permission Matrix
The system provides a granular 6-tier Permission Matrix for device telemetry:

| Permission Key | Description | Default State | User Revocation |
| :--- | :--- | :--- | :--- |
| `BATTERY_STATUS` | Device battery level and charging state | Enabled | Instant toggle in Settings |
| `WEATHER_LOCATION` | Weather conditions and temperature | Enabled | Instant toggle in Settings |
| `NOTIFICATIONS` | Priority notification count | Enabled | Instant toggle in Settings |
| `CALENDAR_EVENTS` | Daily agenda count | Enabled | Instant toggle in Settings |
| `EMAIL_INBOX` | Unread priority email count | Enabled | Instant toggle in Settings |
| `DEVICE_HEALTH` | CPU/RAM/Thermal health telemetry | Enabled | Instant toggle in Settings |

When any permission is toggled OFF:
1. Telemetry probes are immediately bypassed.
2. The morning briefing and diagnostics report explicitly state that permission has been denied.
3. No simulated or fictitious data is substituted.

---

## 3. Google OAuth & YouTube Integration Compliance
- **Zero Token Leakage**: OAuth access tokens and refresh tokens are encrypted at rest using AES-256-GCM. Plaintext tokens are never stored in `jarvis_memory.json` or transmitted to the client.
- **Scope Minimization**: Only requested scopes (`youtube.readonly`, `youtube.upload`) are utilized.
- **Data Revocation**: Users can disconnect Google OAuth at any time with a single click, instantly purging encrypted tokens and session memory.
- **Compliance with Google API Services User Data Policy**: Dedicated, zero-JS accessible legal endpoints are served at `/privacy` and `/terms`.
