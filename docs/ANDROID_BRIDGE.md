# Android Bridge — Real Device Contract

This document describes the authenticated bridge between an Android device and
the HERMES JARVIS server, and states precisely what has been verified versus
what still requires physical hardware.

## 1. What "connected" means

A device is only reported as `CONNECTED` when all of the following are true:

1. The device completed pairing and holds a valid session token.
2. A heartbeat arrived within the last 45 seconds.
3. The device reported capabilities that cover every probe in the negotiation table.

If any of these fail the status degrades honestly:

| Status | Meaning |
| :--- | :--- |
| `MOBILE_NOT_CONNECTED` | No device paired, or the heartbeat window lapsed. |
| `PERMISSION_REQUIRED` | Device is reachable but the operator has not granted notification-listener or telephony access. |
| `LIMITED_CAPABILITY` | Reachable, but the device cannot detect calls or notifications at all. |
| `PARTIALLY_CONNECTED` | Reachable and useful, but one or more capabilities are missing. |
| `CONNECTED` | Reachable and every capability probe passed. |
| `ERROR` | Reserved for unrecoverable bridge faults. |

A device reporting `isSimulation: true` can never reach `CONNECTED` and is never
reported as live.

## 2. Capability negotiation

The server holds a probe table. Each probe reports `available`, a human reason,
and the exact Android grant required. Nothing is inferred.

| Capability | Requires |
| :--- | :--- |
| `TELEMETRY_BATTERY` | A paired, non-simulated device. |
| `TELEMETRY_LOCATION` | `ACCESS_FINE_LOCATION`. |
| `TELEMETRY_NOTIFICATIONS` | Notification listener access. |
| `NOTIFICATION_LISTENER` | `BIND_NOTIFICATION_LISTENER_SERVICE`. |
| `CALL_DETECTION` | `READ_PHONE_STATE`. |
| `CALL_ANSWER` | `ROLE_DIALER` plus `ANSWER_PHONE_CALLS`. |
| `INLINE_REPLY` | Notification reply policy on the posting app. |
| `OPEN_APP` | Device-reported launch capability. |
| `CONTACTS_LOOKUP` | `READ_CONTACTS`. |

## 3. Authentication

Pairing requires `MOBILE_BRIDGE_PAIRING_SECRET` to be set on the server. If it is
unset the pairing endpoint returns `NOT_CONFIGURED` rather than accepting
anonymous devices.

- `POST /api/mobile/bridge/pair` — exchange the pairing secret for a session token.
- The token is returned exactly once and is never stored in plaintext; the server
  keeps an HMAC of it.
- Every subsequent call presents `X-Jarvis-Session-Token` (or `Authorization: Bearer`).
- Tokens are constant-time compared, expire on an absolute 12-hour clock, and die
  after 5 minutes of inactivity.
- Failed authentications are rate limited per IP. Successful ones are not.
- Disconnecting revokes the session immediately; the token stops working.
- Re-pairing supersedes and revokes the previous session.

Every device event must carry a monotonically increasing `sequence` and an
`eventTimestamp`. Replays, stale events and future-dated events are rejected.

## 4. Telemetry

Telemetry is only ever reported from data the device itself sent.

- No device → `NOT_CONFIGURED`.
- Device paired but silent → `FAILED` (no stale values are surfaced).
- Permission missing → `PERMISSION_REQUIRED`, naming the grant.
- No telemetry received yet → `NOT_CONFIGURED`.

There is no default battery percentage, temperature or location anywhere in the
telemetry path.

## 5. Actions and confirmation

Remote actions cannot be verified locally, so they are split in two:

1. `POST /api/mobile/bridge/call/answer` and `/message/reply` return
   `DISPATCHED` with `verified: false` and a `dispatchId`. Approval
   (`approved: true`) is mandatory and is checked explicitly.
2. `POST /api/mobile/bridge/action/confirm` accepts the device's own report. Only
   a success status echoed back by the same session upgrades the receipt to
   `VERIFIED`. A different session, an unknown dispatch id, or a repeat
   confirmation is refused.

Unacknowledged dispatches expire and are recorded as unconfirmed rather than
left looking successful.

When a reply cannot be sent through the notification's RemoteInput action, the
bridge opens the messaging app instead and states plainly that the message was
**not** sent by JARVIS.

## 6. Verification status

| Item | Status |
| :--- | :--- |
| Server-side pairing, session, replay and revocation | Verified by automated test against a real server process. |
| Capability negotiation and status degradation | Verified by automated test. |
| Telemetry truthfulness (no fabricated values) | Verified by automated test. |
| Dispatch/confirm ledger | Verified by automated test. |
| Server E2E chain (`src/tests/androidBridge.e2e.test.ts`) | 11/11 passing. |
| Physical Android device over a real network | **NOT YET VERIFIED — requires hardware.** |

### On-device checklist

To complete the final leg of the E2E chain on real hardware, the operator must:

1. Set `MOBILE_BRIDGE_PAIRING_SECRET` on the server.
2. Install the bridge app on the phone and complete pairing.
3. Grant `READ_PHONE_STATE`, `ANSWER_PHONE_CALLS` and the default-dialer role.
4. Grant notification listener access and `ACCESS_FINE_LOCATION`.
5. Confirm `/api/mobile/bridge/status` reports `CONNECTED` with `deviceLive: true`
   and the real device model.
6. Confirm `/api/mobile/bridge/telemetry/battery` returns the phone's actual
   battery percentage.
7. Place a real call to the phone and confirm the announcement, then confirm the
   device echoes back the answer result.
8. Record the outcome in `docs/COMPLETION_STATUS.md`.

## 7. Zero-fake-success rules

This module follows the project-wide rule that a feature is `VERIFIED` only with
evidence. Applied here:

- A simulated device is `SIMULATION_ONLY` and can never be `CONNECTED`.
- A dispatched action is `DISPATCHED`, never success.
- Missing telemetry is `NOT_CONFIGURED`, never a plausible default.
- A denied permission is `PERMISSION_REQUIRED` with the grant named.
- The `/simulate` endpoint is a labelled testbed that registers nothing.
