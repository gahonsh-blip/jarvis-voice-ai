// ==============================================================================
// HERMES JARVIS — COMPUTER ACTION VERIFIER MODULE
// Re-checks screen and application state after an action to confirm success,
// detects unexpected states or failures, and enforces retry limits.
// ==============================================================================

import { ComputerAction, ScreenObservation, VerificationResult } from '../../types/computerOperator';
import { redactSecrets } from './credentialRedactor';

export class ActionVerifier {
  private static retryCounters: Map<string, number> = new Map();
  public static readonly MAX_RETRIES = 3;

  /**
   * Only actions whose outcome could differ on a second attempt are retried.
   * Actions we cannot confirm at all (synthetic input, test runs, edits) would
   * fail identically every time, so retrying them just burns attempts and lets
   * the engine report a misleading "retrying" message.
   */
  private static readonly RETRYABLE_ACTION_TYPES = new Set([
    'CLICK',
    'DOUBLE_CLICK',
    'RIGHT_CLICK',
    'LAUNCH_APP',
    'SWITCH_WINDOW',
  ]);

  /**
   * Resets retry counter for an action ID
   */
  public static resetRetry(actionId: string) {
    this.retryCounters.delete(actionId);
  }

  /**
   * Verifies the outcome of an action by comparing pre-action and post-action observations
   */
  public static verifyAction(
    action: ComputerAction,
    preObservation: ScreenObservation,
    postObservation: ScreenObservation,
    stepIndex: number
  ): VerificationResult {
    const actionKey = `${action.id}_${action.type}`;
    const currentRetries = this.retryCounters.get(actionKey) || 0;

    // Check if post-observation is in an ambiguous state
    if (postObservation.isAmbiguous) {
      return {
        verified: false,
        stateChangeDetected: false,
        currentStepIndex: stepIndex,
        shouldRetry: false, // Ambiguous UI requires stopping and human guidance
        retryCount: currentRetries,
        maxRetries: this.MAX_RETRIES,
        error: `Ambiguous UI state detected: ${postObservation.ambiguityReason || 'Multiple popups or conflicting dialogs active.'}`,
        message: 'Action halted safely: UI state is ambiguous and requires human verification.',
        messageHi: 'कार्य सुरक्षित रूप से रोका गया: स्क्रीन की स्थिति अस्पष्ट है।',
      };
    }

    let verified = false;
    let stateChangeDetected = false;
    let message = '';
    let messageHi = '';

    switch (action.type) {
      case 'LAUNCH_APP':
      case 'SWITCH_WINDOW': {
        const expectedApp = (action.targetApp || '').toLowerCase();
        const actualApp = postObservation.activeApplication.toLowerCase();
        const actualWin = postObservation.activeWindow.toLowerCase();
        if (actualApp.includes(expectedApp) || actualWin.includes(expectedApp) || expectedApp.includes(actualApp)) {
          verified = true;
          stateChangeDetected = true;
          message = `Verified: Active window successfully transitioned to "${postObservation.activeApplication}".`;
          messageHi = `सत्यापित: विंडो सफलतापूर्वक "${postObservation.activeApplication}" पर स्विच हो गई।`;
        } else {
          verified = false;
          stateChangeDetected = false;
          message = `Verification failure: Expected window "${action.targetApp}" but found "${postObservation.activeApplication}".`;
          messageHi = `सत्यापन विफल: अपेक्षित विंडो "${action.targetApp}" नहीं मिली।`;
        }
        break;
      }

      case 'CLICK':
      case 'DOUBLE_CLICK':
      case 'RIGHT_CLICK': {
        // A click can only be claimed when the screen actually changed. The
        // previous version hardcoded `|| true`, which verified every click.
        const elementCountDiff = postObservation.visibleElements.length !== preObservation.visibleElements.length;
        const windowChanged = postObservation.windowTitle !== preObservation.windowTitle;
        const appChanged = postObservation.activeApplication !== preObservation.activeApplication;
        stateChangeDetected = elementCountDiff || windowChanged || appChanged;
        verified = stateChangeDetected;
        message = verified
          ? `Verified: ${action.type} produced an observable screen change.`
          : `Verification failure: no screen change was observed after ${action.type} at (${action.coordinates?.x || 0}, ${action.coordinates?.y || 0}).`;
        messageHi = verified
          ? `सत्यापित: क्लिक के बाद स्क्रीन में परिवर्तन देखा गया।`
          : `सत्यापन विफल: क्लिक के बाद स्क्रीन में कोई परिवर्तन नहीं दिखा।`;
        break;
      }

      case 'TYPE_TEXT':
      case 'KEY_COMBINATION':
      case 'SCROLL':
      case 'MOUSE_MOVE': {
        // Synthetic input cannot be confirmed without a real input backend, so
        // this must never report verified from observation alone.
        stateChangeDetected = postObservation.windowTitle !== preObservation.windowTitle;
        verified = false;
        message = `Unverified: ${action.type} was dispatched, but no OS input backend can confirm delivery.`;
        messageHi = `असत्यापित: ${action.type} भेजा गया, परंतु पुष्टि संभव नहीं।`;
        break;
      }

      case 'EDIT_FILE': {
        // The file is the evidence: confirm the edit is actually on disk and
        // that the searched text is gone.
        const target = action.fileDiff?.target || action.filePath;
        if (!target) {
          verified = false;
          stateChangeDetected = false;
          message = 'Verification failure: no file path was supplied for the edit.';
          messageHi = 'सत्यापन विफल: संपादन हेतु फ़ाइल पथ नहीं दिया गया।';
          break;
        }
        // Verification is delegated to on-disk checks performed by the caller.
        stateChangeDetected = postObservation.windowTitle !== preObservation.windowTitle;
        verified = false;
        message = `Unverified: edit of "${target}" requires a filesystem re-read to confirm.`;
        messageHi = `असत्यापित: "${target}" का संपादन डिस्क से सत्यापित करना आवश्यक है।`;
        break;
      }

      case 'RUN_TESTS': {
        // Exit status and parsed counts must come from the executor, not from
        // the mere fact that a test action was requested.
        stateChangeDetected = postObservation.windowTitle !== preObservation.windowTitle;
        verified = false;
        message = 'Unverified: test results require the runner exit status and parsed pass/fail counts.';
        messageHi = 'असत्यापित: टेस्ट परिणाम हेतु रनर की वास्तविक स्थिति आवश्यक है।';
        break;
      }

      case 'INSPECT_SCREEN':
      case 'TAKE_SCREENSHOT': {
        stateChangeDetected = true;
        // Only a real captured file counts as evidence.
        if (postObservation.screenshot) {
          verified = true;
          message = `Verified: screen captured to ${postObservation.screenshot}.`;
          messageHi = `सत्यापित: स्क्रीन कैप्चर ${postObservation.screenshot} पर सहेजा गया।`;
        } else {
          verified = false;
          message = `Unverified: screen inspection produced no captured file for step ${stepIndex + 1}.`;
          messageHi = `असत्यापित: स्क्रीन कैप्चर फ़ाइल उपलब्ध नहीं।`;
        }
        break;
      }

      default: {
        // Unknown actions cannot be declared successful.
        stateChangeDetected = postObservation.windowTitle !== preObservation.windowTitle;
        verified = false;
        message = `Unverified: no verification rule exists for action type ${action.type}.`;
        messageHi = `असत्यापित: इस कार्य के लिए सत्यापन नियम उपलब्ध नहीं।`;
        break;
      }
    }

    if (verified) {
      this.retryCounters.delete(actionKey);
      return {
        verified: true,
        stateChangeDetected,
        currentStepIndex: stepIndex,
        shouldRetry: false,
        retryCount: currentRetries,
        maxRetries: this.MAX_RETRIES,
        message: redactSecrets(message),
        messageHi: redactSecrets(messageHi),
      };
    } else {
      const newRetries = currentRetries + 1;
      this.retryCounters.set(actionKey, newRetries);
      const retryable = this.RETRYABLE_ACTION_TYPES.has(action.type);
      const shouldRetry = retryable && newRetries < this.MAX_RETRIES;

      if (!retryable) {
        // Non-retryable: surface the concrete reason so the task fails cleanly
        // instead of looping or implying a retry is happening.
        return {
          verified: false,
          stateChangeDetected,
          currentStepIndex: stepIndex,
          shouldRetry: false,
          retryCount: newRetries,
          maxRetries: this.MAX_RETRIES,
          error: redactSecrets(message),
          message: redactSecrets(message),
          messageHi: redactSecrets(messageHi),
        };
      }

      return {
        verified: false,
        stateChangeDetected,
        currentStepIndex: stepIndex,
        shouldRetry,
        retryCount: newRetries,
        maxRetries: this.MAX_RETRIES,
        error: message,
        message: shouldRetry
          ? `Verification pending: Attempt ${newRetries}/${this.MAX_RETRIES}. Retrying safe action...`
          : `Action verification permanently failed after ${this.MAX_RETRIES} attempts. Halting safely.`,
        messageHi: shouldRetry
          ? `सत्यापन लंबित: प्रयास ${newRetries}/${this.MAX_RETRIES}। पुनः प्रयास जारी...`
          : `कार्य सत्यापन ${this.MAX_RETRIES} प्रयासों के बाद विफल रहा। सुरक्षित विराम।`,
      };
    }
  }
}
