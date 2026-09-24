// ==============================================================================
// HERMES JARVIS — COMPUTER ACTION EXECUTOR (SHARED / BROWSER-SAFE)
//
// This runs inside the UI bundle, so it cannot touch the OS directly. Every
// action is therefore routed to the agent host over HTTP and the host's receipt
// is passed through unchanged.
//
// The previous implementation returned `success: true` for clicks, keystrokes,
// app switches, file edits and test runs it never performed, and printed a fixed
// "141 tests passed" line. That is exactly the fabricated-success behaviour the
// zero-fake-success policy forbids, so it is gone.
// ==============================================================================

import { ComputerAction } from '../../types/computerOperator';
import {
  buildReceipt,
  type ExecutionOutcome,
  type ExecutionReceipt,
} from '../executionTruth';
import { ScreenObserver } from './screenObserver';
import { PermissionGuard } from './permissionGuard';

export interface ActionExecutionResult {
  actionId: string;
  /**
   * True ONLY when the host verified the action. Callers that need to
   * distinguish "dispatched" from "done" should read `receipt.outcome`.
   */
  success: boolean;
  outcome: ExecutionOutcome;
  receipt: ExecutionReceipt;
  message: string;
  output?: string;
  error?: string;
  timestamp: string;
  executionTimeMs: number;
}

interface HostExecuteResponse {
  success?: boolean;
  outcome?: ExecutionOutcome;
  receipt?: ExecutionReceipt;
  output?: string;
  error?: string;
}

type Finish = (partial: {
  success?: boolean;
  message: string;
  output?: string;
  error?: string;
  receipt: ExecutionReceipt;
}) => ActionExecutionResult;

/** Actions that are performed through the host API. */
const HOST_ROUTED_ACTIONS = new Set([
  'TERMINAL_COMMAND',
  'READ_FILE',
  'EDIT_FILE',
  'RUN_TESTS',
  'LAUNCH_APP',
]);

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.fetch === 'function';
}

export class ActionExecutor {
  /**
   * Executes a single discrete computer action.
   *
   * Browser context: forwards to `POST /api/computer-operator/execute-action`.
   * Host context: this class is only ever the UI-side client — the server uses
   * `HostActionExecutor` directly.
   */
  public static async executeAction(action: ComputerAction): Promise<ActionExecutionResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    const finish: Finish = (partial) => ({
      actionId: action.id,
      success: partial.success ?? partial.receipt.verified,
      outcome: partial.receipt.outcome,
      receipt: partial.receipt,
      message: partial.message,
      output: partial.output,
      error: partial.error,
      timestamp,
      executionTimeMs: Date.now() - startTime,
    });

    try {
      if (action.type === 'WAIT') {
        await new Promise((r) => setTimeout(r, 500));
        return finish({
          message: 'Waited 500ms for the UI transition to settle.',
          receipt: buildReceipt({
            action: action.type,
            target: 'ui',
            outcome: 'VERIFIED',
            detailEn: 'Timer elapsed as requested.',
            detailHi: '500ms प्रतीक्षा पूर्ण।',
            evidence: {
              kind: 'os_command',
              detail: 'WAIT 500ms elapsed',
              observedAt: new Date().toISOString(),
              ref: 'WAIT',
            },
          }),
        });
      }

      // Screen observation is available in-browser (with user permission), so it
      // is handled locally rather than round-tripping to the host.
      if (action.type === 'INSPECT_SCREEN' || action.type === 'TAKE_SCREENSHOT') {
        return this.inspectScreen(action, finish);
      }

      if (!isBrowser()) {
        return finish({
          message:
            'NOT_CONFIGURED: no host action executor is attached to this process. Attach one with HostActionExecutor.',
          receipt: buildReceipt({
            action: action.type,
            target: action.description,
            outcome: 'NOT_CONFIGURED',
            detailEn: `Action ${action.type} requires a host executor, which is not attached.`,
            detailHi: 'इस प्रक्रिया में होस्ट एक्ज़ीक्यूटर जुड़ा नहीं है।',
            evidence: null,
            failureReason: 'NO_HOST_EXECUTOR',
          }),
        });
      }

      if (!HOST_ROUTED_ACTIONS.has(action.type)) {
        return finish({
          message: `NOT_AVAILABLE: "${action.type}" cannot be performed — no OS input-automation backend is wired up.`,
          receipt: buildReceipt({
            action: action.type,
            target: action.description,
            outcome: 'NOT_AVAILABLE',
            detailEn: `No host implementation exists for ${action.type}.`,
            detailHi: 'इस कार्य के लिए होस्ट कार्यान्वयन उपलब्ध नहीं है।',
            evidence: null,
            failureReason: 'ACTION_NOT_AVAILABLE_ON_HOST',
          }),
        });
      }

      return await this.forwardToHost(action, finish);
    } catch (err: any) {
      return finish({
        message: `FAILED: ${err?.message || err}`,
        error: err?.message,
        receipt: buildReceipt({
          action: action.type,
          target: action.description,
          outcome: 'FAILED',
          detailEn: `Unexpected error while executing ${action.type}: ${err?.message || err}`,
          detailHi: 'कार्य निष्पादन में अनपेक्षित त्रुटि।',
          evidence: null,
          failureReason: 'UNEXPECTED_ERROR',
        }),
      });
    }
  }

  /** Local screen capture inside the browser, with honest labelling. */
  private static async inspectScreen(action: ComputerAction, finish: Finish): Promise<ActionExecutionResult> {
    const observation = await ScreenObserver.observeScreen({
      preferredApp: action.targetApp,
      includeScreenshot: true,
    });

    if (observation.isAmbiguous) {
      return finish({
        message: `BLOCKED: the screen state is ambiguous (${observation.ambiguityReason || 'unknown reason'}).`,
        receipt: buildReceipt({
          action: action.type,
          target: observation.activeApplication,
          outcome: 'BLOCKED',
          detailEn: `Screen state is ambiguous: ${observation.ambiguityReason || 'unknown'}`,
          detailHi: 'स्क्रीन की स्थिति अस्पष्ट है।',
          evidence: null,
          failureReason: 'AMBIGUOUS_SCREEN',
        }),
      });
    }

    if (!observation.screenshotBase64) {
      return finish({
        message:
          'NOT_AVAILABLE: no screen capture was produced (permission not granted or unsupported here). Nothing was captured.',
        receipt: buildReceipt({
          action: action.type,
          target: observation.activeApplication,
          outcome: 'NOT_AVAILABLE',
          detailEn: 'No screenshot was produced; capture permission was not granted or is unsupported.',
          detailHi: 'स्क्रीन कैप्चर उपलब्ध नहीं।',
          evidence: null,
          failureReason: 'NO_CAPTURE_PRODUCED',
        }),
      });
    }

    return finish({
      message: `Captured the current view of "${observation.activeApplication}".`,
      output: observation.windowTitle,
      receipt: buildReceipt({
        action: action.type,
        target: observation.activeApplication,
        outcome: 'VERIFIED',
        detailEn: `Captured ${observation.screenResolution.width}x${observation.screenResolution.height} view of ${observation.activeApplication}.`,
        detailHi: 'स्क्रीन कैप्चर पूर्ण।',
        evidence: {
          kind: 'remote_http_response',
          detail: 'Browser MediaStream capture produced image data',
          observedAt: new Date().toISOString(),
          ref: `obs-${observation.id}`,
        },
      }),
    });
  }

  private static async forwardToHost(action: ComputerAction, finish: Finish): Promise<ActionExecutionResult> {
    // Defense in depth: refuse a permanently-prohibited action here as well as on
    // the host, so the UI never even sends a finance/destructive request.
    const safety = PermissionGuard.evaluateHostSafety(action);
    if (safety) {
      return finish({
        success: false,
        message: safety.blockReason || 'Action blocked by the security policy.',
        receipt: buildReceipt({
          action: action.type,
          target: action.description,
          outcome: 'BLOCKED',
          detailEn: safety.blockReason || 'Action blocked by the security policy.',
          detailHi: 'सुरक्षा नीति द्वारा कार्य अवरुद्ध।',
          evidence: null,
          failureReason: safety.dangerCategory || 'BLOCKED_BY_POLICY',
        }),
      });
    }

    try {
      const res = await fetch('/api/computer-operator/execute-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        return finish({
          message: `FAILED: the host refused the action (HTTP ${res.status}).`,
          receipt: buildReceipt({
            action: action.type,
            target: action.description,
            outcome: 'FAILED',
            detailEn: `Host returned HTTP ${res.status} for ${action.type}.`,
            detailHi: 'होस्ट ने कार्य अस्वीकार किया।',
            evidence: null,
            failureReason: `HOST_HTTP_${res.status}`,
          }),
        });
      }

      const body = (await res.json()) as HostExecuteResponse;
      // Pass the host's receipt through untouched — never upgrade an outcome here.
      if (body.receipt) {
        return finish({
          success: body.receipt.verified,
          message: body.receipt.detailEn,
          output: body.output,
          error: body.receipt.outcome === 'FAILED' ? body.receipt.failureReason : undefined,
          receipt: body.receipt,
        });
      }

      const outcome: ExecutionOutcome = body.outcome || 'FAILED';
      return finish({
        message: body.error || `${outcome}: the host returned no receipt for ${action.type}.`,
        output: body.output,
        error: body.error,
        receipt: buildReceipt({
          action: action.type,
          target: action.description,
          outcome,
          detailEn: body.error || `Host reported ${outcome} without a receipt.`,
          detailHi: 'होस्ट से अपूर्ण उत्तर प्राप्त हुआ।',
          evidence: null,
          failureReason: 'HOST_RETURNED_NO_RECEIPT',
        }),
      });
    } catch (err: any) {
      return finish({
        message: `FAILED: could not reach the host to perform "${action.type}": ${err?.message || err}`,
        error: err?.message,
        receipt: buildReceipt({
          action: action.type,
          target: action.description,
          outcome: 'FAILED',
          detailEn: `Host request failed: ${err?.message || err}`,
          detailHi: 'होस्ट से संपर्क नहीं हो सका।',
          evidence: null,
          failureReason: 'HOST_UNREACHABLE',
        }),
      });
    }
  }
}