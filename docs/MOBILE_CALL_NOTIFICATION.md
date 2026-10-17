# 📱 HERMES JARVIS — Android Call & Notification Assistant Bridge

This document provides the definitive architectural specification, step-by-step Android device setup guide, permission matrix, privacy constraints, and end-to-end testing protocols for the **HERMES JARVIS Android Mobile Bridge**.

---

## 1. System Overview & Architecture

The HERMES JARVIS Android Mobile Bridge connects your Android smartphone to the JARVIS autonomous core, enabling real-time caller announcements, voice-approved call answering, notifications parsing, and interactive morning telemetry.

### Architectural Invariants:
1. **Zero Autonomous Telephony Action**: JARVIS will **never** answer a phone call or dispatch a message reply without explicit Level-4 Human Authorization (verbal *"हाँ / उठा लो"* or manual UI tap).
2. **Deterministic Privacy Shield**: Sensitive notifications (OTPs, 2-factor authentication codes, bank debits/credits, UPI transactions, password resets) are identified via regex filters and are **never** read aloud over TTS or dispatched to public logs.
3. **Phone Number Masking**: All phone numbers in audit logs and user interfaces are masked (e.g., `+91 ******4321`) to prevent shoulder surfing and telemetry leakage.
4. **Global Kill Switch Override**: Engaging the Global Kill Switch (`POST /api/system/kill-switch`) immediately purges all telephony queues and freezes the bridge.

```
       +-----------------------------------------------------------+
       |                  ANDROID MOBILE DEVICE                    |
       |                                                           |
       |  [TelecomManager]           [NotificationListenerService] |
       |  Incoming Calls             Incoming App Notifications    |
       |          |                               |                |
       +----------|-------------------------------|----------------+
                  |                               |
                  | Encrypted REST / WebSocket    |
                  v                               v
       +-----------------------------------------------------------+
       |             HERMES JARVIS CORE (server.ts)                |
       |                                                           |
       |  POST /api/mobile/bridge/event                            |
       |    - Masks phone numbers                                  |
       |    - Flags OTP / Banking / Sensitive content              |
       |    - Enqueues into pending mobile event queue             |
       +------------------------------+----------------------------+
                                      |
                                      v
       +-----------------------------------------------------------+
       |                LEVEL-4 HUMAN AUTHORIZATION GATE           |
       |                                                           |
       |  [React HUD Approval Card]     [Hindi Voice Engine]       |
       |  "ANSWER" / "DECLINE" /        "हाँ, उठा लो" /            |
       |  "REPLY" Buttons               "कॉल काटो" / "रहने दो"     |
       +------------------------------+----------------------------+
                                      |
                      Explicit Approval Received
                                      v
       +-----------------------------------------------------------+
       |                    DISPATCH ACTION                        |
       |  POST /api/mobile/bridge/call/answer                      |
       |  POST /api/mobile/bridge/message/reply                    |
       +-----------------------------------------------------------+
```

---

## 2. Android Device Setup (Step-by-Step)

The Android companion bridge communicates with JARVIS via the lightweight `HERMES-ANDROID-BRIDGE/2.4.0` protocol.

### Step 1: Environment & Network Prerequisites
- **Android OS Version**: Android 10 (API 29) or higher recommended. (Android 8.0+ supported with limited dialer roles).
- **Network Routing**: Your phone and JARVIS host must have network line-of-sight (local Wi-Fi, WireGuard VPN, or public HTTPS via reverse proxy).
- **Backend Configuration**: Ensure `server.ts` is running and accessible at port `3000`.

### Step 2: Establish Bridge Connection
Send a device handshake request to register the Android device with JARVIS:

```bash
curl -X POST "https://<your-jarvis-host>/api/mobile/bridge/connect" \
  -H "Content-Type: application/json" \
  -d '{
    "device": {
      "deviceId": "pixel8_secure_bridge_01",
      "deviceName": "Owner Pixel 8 Pro",
      "model": "Pixel 8 Pro",
      "osVersion": "Android 14",
      "bridgeVersion": "HERMES-ANDROID-BRIDGE/2.4.0",
      "canDetectCalls": true,
      "canAnswerCalls": true,
      "telecomRoleDialer": true,
      "answerCallsPermission": true,
      "canReadNotifications": true,
      "canInlineReply": true,
      "canOpenApp": true,
      "canLookupContacts": true,
      "isSimulation": false
    },
    "permissions": {
      "phone_state": "GRANTED",
      "call_detection": "GRANTED",
      "answer_calls": "GRANTED",
      "telecom_dialer_role": "GRANTED",
      "notification_access": "GRANTED",
      "read_contacts": "GRANTED",
      "battery_telemetry": "GRANTED",
      "location_weather": "GRANTED"
    }
  }'
```

### Step 3: Verify Connection State in HUD
1. In the JARVIS Web HUD, click the **Mobile Status** or **Android Bridge** card.
2. Verify the indicator displays:
   - **Device**: `Owner Pixel 8 Pro (Android 14)`
   - **Status**: `CONNECTED (ROLE_DIALER ACTIVE)`
   - **Protocol**: `HERMES-ANDROID-BRIDGE/2.4.0`

---

## 3. Android Permission Matrix

Android's security architecture enforces strict separation between background services, notification inspection, and telephony control.

| Permission / Role | Required For | Android Manifest / System Setting | Degraded State if Missing |
| :--- | :--- | :--- | :--- |
| **`READ_PHONE_STATE`** | Detect incoming ring state & caller number. | `android.permission.READ_PHONE_STATE` | JARVIS cannot detect incoming calls. |
| **`READ_CALL_LOG`** / **`READ_CONTACTS`** | Resolve phone numbers to contact names. | `android.permission.READ_CONTACTS` | Calls are announced with masked numbers only (e.g. *"Unknown Caller"*). |
| **`ANSWER_PHONE_CALLS`** | Direct call pickup API on Android 8.0+. | `android.permission.ANSWER_PHONE_CALLS` | JARVIS will verbally inform the user that it lacks permission to answer calls. |
| **`TelecomManager.ROLE_DIALER`** | Headless programmatic call answering on Android 10+. | Android System Settings &rarr; Default Apps &rarr; Phone App | JARVIS announces calls but answering must be performed manually on device. |
| **`NotificationListenerService`** | Intercept incoming WhatsApp, SMS, Slack notifications. | Android Settings &rarr; Special App Access &rarr; Device & App Notifications | No notifications or messaging cards are received. |
| **`POST_NOTIFICATIONS`** | Companion background service persistent status. | `android.permission.POST_NOTIFICATIONS` | Background service may be killed by OEM battery optimizations. |

---

## 4. Privacy Guard & Sensitive Notification Protection

JARVIS enforces zero-tolerance data leak protection. The engine in `src/utils/androidBridgeEngine.ts` scans all inbound notification payloads against the following pattern suite:

```typescript
const SENSITIVE_PATTERNS = [
  /\b(otp|one time password|verification code|security code)\b/i,
  /\b(\d{4,8})\s+(is your|is the|to verify)\b/i,
  /\b(bank|account|debit|credit|upi|atm|card|transaction|inr|rs\.)\b/i,
  /\b(balance|credited|debited|transferred)\b/i,
  /\b(password|passcode|secret|pin)\b/i,
];
```

### Protection Rules:
1. **TTS Silence**: Notifications flagged as sensitive are **never spoken aloud**. JARVIS announces only: *"सर, [AppName] से एक गोपनीय सूचना प्राप्त हुई है।"* (English: *"Sir, a confidential alert was received on [AppName]."*).
2. **UI Masking**: In the HUD approval card, sensitive preview texts are replaced with a secure warning badge: `Private / Sensitive content protected`.
3. **Audit Log Sanitization**: Notification text bodies are stripped from persistent storage, logging only `[Content Redacted for Privacy]`.

---

## 5. Voice Interaction & Intent Commands

The local offline Hindi/Hinglish engine (`src/utils/localJarvisEngine.ts`) supports full hands-free operation:

### Incoming Call Voice Commands:
- **Approve / Answer**: `"हाँ"`, `"हां"`, `"उठा लो"`, `"कॉल उठाओ"`, `"कॉल उठा लो"`, `"phone uthao"`, `"answer call"`
- **Decline / Dismiss**: `"नहीं"`, `"मत उठाओ"`, `"काट दो"`, `"कॉल काटो"`, `"phone kato"`, `"decline call"`
- **Caller ID Inquiry**: `"किसका कॉल है?"`, `"who is calling?"`, `"caller कौन है?"`

### Messaging Voice Commands:
- **Reply Approval**: `"हाँ, जवाब दो"`, `"भेज दो"`, `"reply yes"`
- **Dismiss Message**: `"नहीं"`, `"रहने दो"`, `"dismiss"`
- **Notification Inquiry**: `"कोई notification आया क्या?"`, `"notifications check करो"`

---

## 6. Testing Matrix & Verification Protocols

Run automated regression tests to verify that the bridge behaves correctly in all states:

```bash
npm test -- --run
```

### Comprehensive Testing Scenarios:

| # | Scenario | Test Input / Action | Expected Result |
| :-: | :--- | :--- | :--- |
| **1** | **Named Caller Detection** | Ingress `INCOMING_CALL` for `"Rahul Verma"`, `+91 9876543210` | Spoken announcement: *"सर, राहुल वर्मा का फोन आ रहा है। क्या कॉल उठाना है?"* |
| **2** | **Unknown Caller Masking** | Ingress `INCOMING_CALL` with no name, number `+91 9876543210` | Number masked as `+91 ******3210`. Unsolicited audio does not leak raw number. |
| **3** | **Unsolicited Answer Block** | Ingress incoming call without user voice or button input | Status remains `AWAITING_APPROVAL`. Zero API answer calls sent. |
| **4** | **Voice Call Pickup** | User speaks: `"हाँ, उठा लो"` | Engine verifies `telecomRoleDialer`, executes answer, speaks: *"सर, कॉल उठा ली गई है।"* |
| **5** | **Voice Call Decline** | User speaks: `"कॉल काटो"` | Event queue shifts, call dismissed, speaks: *"सर, कॉल अस्वीकार कर दी गई है।"* |
| **6** | **Missing Telecom Role** | Call answer attempted on device without Dialer Role | Returns `ROLE_REQUIRED`. Spoken warning explaining missing role. |
| **7** | **OTP SMS Ingress** | Notification with text `"Your OTP for SBI NetBanking is 482910"` | Marked `isSensitive: true`. Text never spoken aloud. |
| **8** | **Bank Debit Ingress** | Notification with text `"INR 2,450.00 debited from A/C ...4012"` | Marked `isSensitive: true`. Financial guard blocks synthesis. |
| **9** | **WhatsApp Notification** | Message from `"Pooja"`: `"Meeting moved to 4 PM"` | Spoken announcement: *"सर, WhatsApp पर पूजा का संदेश आया है।"* |
| **10** | **Emergency Stop Override** | Engage Global Kill Switch while call is pending | Call answering instantly denied with `BLOCKED_EMERGENCY_STOP`. |
| **11** | **Notification Status Inquiry** | User asks: `"कोई notification आया क्या?"` with empty queue | JARVIS speaks: *"सर, इस समय कोई नया पेंडिंग नोटिफिकेशन नहीं है।"* |
| **12** | **Notification Status Inactive** | User asks: `"notifications check करो"` with active message | JARVIS announces the pending message details truthfully. |

---

## 7. Manual Staging Simulation

To test the bridge without a physical Android device, use the built-in simulation endpoint:

```bash
# 1. Simulate Incoming Phone Call
curl -X POST "http://localhost:3000/api/mobile/bridge/simulate" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "call",
    "callerName": "Dr. Sameer Joshi",
    "callerNumber": "+91 9811223344"
  }'

# 2. Verify Pending Call in Queue
curl -s "http://localhost:3000/api/mobile/bridge/audit" | jq .

# 3. Simulate Incoming Message Notification
curl -X POST "http://localhost:3000/api/mobile/bridge/simulate" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "notification",
    "appName": "WhatsApp",
    "sender": "Ananya Sharma",
    "text": "Please confirm the project deployment schedule for tomorrow."
  }'
```

In the Web HUD, the floating **LEVEL-4 HUMAN AUTHORIZATION GATE** will appear in the top-right corner with responsive audio prompts and visual action controls.
