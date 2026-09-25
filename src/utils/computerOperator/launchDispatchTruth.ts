// ==============================================================================
// HERMES JARVIS — LAUNCH DISPATCH TRUTH
//
// The `/api/chat` launch intents (`operate_vscode`, `operate_browser`,
// `operate_terminal`, `open_notepad`, `open_calculator`, `open_paint`,
// `open_chrome`, `open_google`, `open_youtube`, `open_gmail`, `open_chatgpt`)
// each spoke an unqualified success and set `actionExecuted = true` without
// touching the host at all: "Visual Studio Code brought to active foreground",
// "Opening Notepad. Ready for your notes, Sir.", "Opening Chrome Web Browser.",
// "Navigating to Google Search." On a headless server — the default in the
// automation sandbox — no application was ever launched, yet the transcript and
// the Security Matrix recorded performed work.
//
// The verdict below is derived only from what the process can observe: the host
// capability map (`hostActionCapabilities()`) and the real executor receipt for
// the `LAUNCH_APP` action. `LAUNCH_APP` returns VERIFIED only when the launched
// process is independently observed in the foreground, so a confirmed launch is
// a genuine fact and everything else is stated as unconfirmed.
// ==============================================================================

import type { ExecutionOutcome, ExecutionReceipt } from '../executionTruth';

export type HostActionCapabilityMap = Record<string, { available: boolean; reason?: string }>;

export type LaunchOutcome =
  | 'FOREGROUND_CONFIRMED'
  | 'DISPATCHED_AWAITING_OBSERVATION'
  | 'NO_DISPLAY_SESSION'
  | 'NOT_AVAILABLE'
  | 'FAILED'
  | 'BLOCKED'
  | 'UNVERIFIED';

export interface LaunchVerdict {
  /**
   * True only when the executor independently observed the application in the
   * foreground. A successfully spawned process that was never observed is not
   * an executed launch.
   */
  actionExecuted: boolean;
  outcome: LaunchOutcome;
  /** Honest action title; never "Launching X" unless the foreground was seen. */
  title: string;
  detailEn: string;
  detailHi: string;
  receipt: ExecutionReceipt | null;
}

/** The capability that proves this host has a desktop to launch an app into. */
function displayCapability(caps: HostActionCapabilityMap): { available: boolean; reason?: string } {
  return caps.LAUNCH_APP || caps.INSPECT_SCREEN || { available: false };
}

function outcomeFromReceipt(receipt: ExecutionReceipt | null): LaunchOutcome {
  if (!receipt) return 'UNVERIFIED';
  const outcome = receipt.outcome as ExecutionOutcome;
  if (outcome === 'VERIFIED') return 'FOREGROUND_CONFIRMED';
  if (outcome === 'DISPATCHED') return 'DISPATCHED_AWAITING_OBSERVATION';
  if (outcome === 'NOT_AVAILABLE') return 'NOT_AVAILABLE';
  if (outcome === 'FAILED') return 'FAILED';
  if (outcome === 'BLOCKED' || outcome === 'PERMISSION_REQUIRED') return 'BLOCKED';
  return 'UNVERIFIED';
}

/**
 * Builds the honest verdict for a launch intent.
 *
 * @param appName the application the operator asked for, as spoken back to the user
 * @param caps    the host capability map from `hostActionCapabilities()`
 * @param receipt the real `LAUNCH_APP` receipt, or `null` when the executor was
 *                never reached (no display session, or a capability refusal)
 */
export function launchVerdict(
  appName: string,
  caps: HostActionCapabilityMap,
  receipt: ExecutionReceipt | null,
): LaunchVerdict {
  const display = displayCapability(caps);
  if (!display.available) {
    const reason = display.reason || 'No desktop session is available to launch applications.';
    return {
      actionExecuted: false,
      outcome: 'NO_DISPLAY_SESSION',
      title: `Launch Not Executed (no display session)`,
      detailEn: `${appName} was not launched: ${reason}`,
      detailHi: `${appName} लॉन्च नहीं हुआ — इस होस्ट पर कोई डेस्कटॉप सत्र उपलब्ध नहीं है।`,
      receipt: null,
    };
  }

  const outcome = outcomeFromReceipt(receipt);
  const fallbackReason = receipt?.detailEn;

  switch (outcome) {
    case 'FOREGROUND_CONFIRMED':
      return {
        actionExecuted: true,
        outcome,
        title: `${appName} (foreground confirmed)`,
        detailEn: `"${appName}" is the foreground application.`,
        detailHi: `"${appName}" अब सामने खुला है।`,
        receipt,
      };
    case 'DISPATCHED_AWAITING_OBSERVATION':
      return {
        actionExecuted: false,
        outcome,
        title: `${appName} Dispatched (foreground not observed)`,
        detailEn: `The launch of "${appName}" was dispatched, but the application was not observed in the foreground.`,
        detailHi: `"${appName}" लॉन्च अनुरोध भेजा गया, परंतु ऐप सामने खुलने की पुष्टि नहीं हुई।`,
        receipt,
      };
    case 'FAILED':
      return {
        actionExecuted: false,
        outcome,
        title: `${appName} Launch Failed`,
        detailEn: fallbackReason || `Launching "${appName}" failed.`,
        detailHi: `"${appName}" लॉन्च नहीं हो सका।`,
        receipt,
      };
    case 'BLOCKED':
      return {
        actionExecuted: false,
        outcome,
        title: `${appName} Launch Blocked`,
        detailEn: fallbackReason || `Launching "${appName}" was refused by the security policy.`,
        detailHi: `"${appName}" को सुरक्षा नीति द्वारा रोका गया।`,
        receipt,
      };
    case 'NOT_AVAILABLE':
      return {
        actionExecuted: false,
        outcome,
        title: `${appName} Not Available`,
        detailEn: fallbackReason || `${appName} cannot be launched on this host.`,
        detailHi: `इस होस्ट पर ${appName} लॉन्च नहीं किया जा सकता।`,
        receipt,
      };
    default:
      return {
        actionExecuted: false,
        outcome: 'UNVERIFIED',
        title: `${appName} Launch Unverified`,
        detailEn: `The launch of "${appName}" was requested but no result was observed.`,
        detailHi: `"${appName}" लॉन्च का अनुरोध किया गया, परंतु कोई परिणाम दर्ज नहीं हुआ।`,
        receipt,
      };
  }
}

/** Honest spoken reply for a launch verdict, in the operator's language. */
export function launchReply(appName: string, verdict: LaunchVerdict, language: string): string {
  const hi = language.startsWith('hi');
  if (verdict.actionExecuted) {
    return hi
      ? `${appName} अब सामने खुला है।`
      : `${appName} is now in the foreground.`;
  }
  return hi ? verdict.detailHi : verdict.detailEn;
}
