# Computer Operator — what actually happens

This document describes the Computer Operator (backlog items 8-13) after the
zero-fake-success rework. It states plainly what is real, what is unavailable,
and how every claim is backed by evidence.

## The rule

No layer may report success for something it did not do. Outcomes come from the
shared vocabulary in `src/utils/executionTruth.ts`:

| Outcome | Meaning |
| :--- | :--- |
| `VERIFIED` | Independently confirmed. The only success state. |
| `DISPATCHED` | Handed to a system that has not confirmed yet. |
| `NOT_AVAILABLE` | Physically impossible on this host. |
| `NOT_CONFIGURED` | Missing setup, credentials, or a wired backend. |
| `PERMISSION_REQUIRED` | The host or device withheld a permission. |
| `SIMULATION_ONLY` | Illustrative output, never a real result. |
| `BLOCKED` | A safety gate refused the action. |
| `FAILED` | Attempted and it did not work. |

A `VERIFIED` outcome without evidence is downgraded to `DISPATCHED` by
`buildReceipt`, so an unsupported success claim cannot be constructed by accident.

## Action capability matrix

| Action | Status | How it is performed |
| :--- | :--- | :--- |
| `TERMINAL_COMMAND` | Real | Spawns a real shell (`powershell.exe` on Windows, `/bin/sh` elsewhere). Exit code is the evidence. |
| `READ_FILE` | Real | Reads the file from disk, constrained to the workspace root. |
| `EDIT_FILE` | Real | Search/replace with a re-read from disk to confirm the write persisted. |
| `RUN_TESTS` | Real | Runs the suite and parses the runner's own pass/fail counts. |
| `TAKE_SCREENSHOT` | Real on a desktop host | OS capture, then file verification. |
| `INSPECT_SCREEN` | Real on a desktop host | Host window/process probe plus optional capture. |
| `LAUNCH_APP` | Partial | The OS launch command runs, but focus is not guaranteed, so the result is `DISPATCHED` unless the app is observed in the foreground. |
| `WAIT` | Real | A timer. |
| `CLICK`, `DOUBLE_CLICK`, `RIGHT_CLICK`, `TYPE_TEXT`, `KEY_COMBINATION`, `SCROLL`, `MOUSE_MOVE`, `SWITCH_WINDOW`, `CLOSE_WINDOW` | `NOT_AVAILABLE` | No OS input-automation backend is wired up. Attempting one returns the reason. |

The synthetic-input gap is deliberate. Synthesising a click without a real input
backend produces no observable effect, and reporting it as done is exactly the
failure mode this rework removes. Wiring it up requires a native input layer
(for example Windows `SendInput` through a small helper process) plus a way to
confirm the effect; until then the honest answer is `NOT_AVAILABLE`.

## Screenshot capture and verification

Capture is platform-specific and happens on the agent host, not in the browser:

| Platform | Command |
| :--- | :--- |
| Windows | PowerShell `System.Drawing` `CopyFromScreen` over the virtual screen |
| macOS | `screencapture -x -t png` |
| Linux | `import -window root` |

The capture command's exit code is not trusted on its own. `verifyScreenshotFile()`
then checks that:

- the path exists and is a regular file,
- its size is greater than zero,
- PNG IHDR bytes yield the real width and height,
- a sha256 of the file is recorded as evidence.

A verified capture produces a receipt containing the absolute path, filename,
byte size, dimensions, timestamp and hash. When the host has no display (a
headless container, for example) the result is `NOT_AVAILABLE` with the reason,
and no file and no path are reported.

The screenshot root defaults to `~/.jarvis/screenshots` and is overridable with
`JARVIS_SCREENSHOT_DIR`. Earlier builds displayed a fixed `C:\Jarvis\Screenshots`
path that never corresponded to a real location; that string no longer appears in
the codebase.

## Verification rules

`ActionVerifier` decides whether an action actually landed. It no longer returns
success unconditionally. Each action type has a rule:

- Window switch or app launch: the observed foreground application must match the
  target.
- Click: the screen must have changed — element count, window title, or active
  application.
- Text entry, key combinations, scrolling: never verified from observation alone.
- File edit: not verified by the verifier; the executor confirms it by re-reading
  the file from disk.
- Test run: not verified by the verifier; the executor parses the runner's counts.
- Screenshot: verified only when a captured file path is attached.
- Unknown action types: reported as unverified.

Retries are limited to actions whose outcome can genuinely differ on a second
attempt (clicks, launches, window switches). Edits and test runs fail identically
every time, so they are not retried.

## Permission and safety gates

`PermissionGuard` runs before any action executes:

- The global kill switch blocks everything.
- Financial operations are permanently refused.
- Destructive system commands are refused.
- Security-bypass attempts are refused.
- Level 4 actions (deletes, publishing, external messages) require explicit human
  approval and halt the task at `NEEDS_APPROVAL`.

File actions are additionally constrained to the workspace root; a path that
escapes it returns `BLOCKED`.

## HTTP surface

| Endpoint | Purpose |
| :--- | :--- |
| `POST /api/computer-operator/execute-action` | Runs one action on the host and returns its receipt. |
| `POST /api/computer-operator/screenshot` | Captures and verifies a screenshot. |
| `GET /api/computer-operator/host-capabilities` | Reports what this host can genuinely do. |
| `POST /api/computer-operator/execute` | Runs a full objective through the operator engine. |
| `POST /api/computer-operator/observe` | Returns a host-grounded screen observation. |

HTTP status codes mirror the outcome: `200` for `VERIFIED`, `202` for
`DISPATCHED`, `403` for `BLOCKED`, `423` when the kill switch is engaged, `501`
for `NOT_AVAILABLE`, and `500` for `FAILED`.

## Wiring

The server installs the real backends at startup:

```ts
ComputerOperatorEngine.setExecutor(hostActionExecutor);
ScreenObserver.setSource((options) =>
  describeHostScreen(process.cwd(), { includeScreenshot: options.includeScreenshot })
);
```

The browser build cannot touch the OS, so `ActionExecutor` there forwards to
`/api/computer-operator/execute-action` and passes the host's receipt through
unchanged. The UI marks any locally rendered observation as an illustrative
preview rather than showing it as live screen state.

## Tests

| File | Covers |
| :--- | :--- |
| `src/tests/screenshotStore.test.ts` | Availability reporting, file verification, headless behaviour, no-fake-path guarantees. |
| `src/tests/hostActionExecutor.test.ts` | Real commands, real file I/O, test parsing, refusals, verifier rules, host operator adapter. |
| `src/tests/computerOperator.e2e.test.ts` | The full HTTP surface against a real server process, including the kill switch and the absence of fake paths. |
| `src/tests/screenObserver.test.ts` | Simulation labelling, the injectable source, and no invented test results. |
| `src/tests/computerOperatorEngine.test.ts` | Intent classification, planning, approval gates, kill switch. |

## Remaining work

- Synthetic input needs a native backend before click/type actions can be real.
- A Windows host is required to exercise the PowerShell capture path end to end;
  this container exercises the `NOT_AVAILABLE` branch.