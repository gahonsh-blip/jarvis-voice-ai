// ==============================================================================
// HERMES JARVIS — SCREEN INTERPRETER MODULE
// Understands visible UI elements, detects buttons, text fields, dialogs,
// errors, terminal text, and assesses UI state ambiguity.
// ==============================================================================

import { ScreenObservation, UIElement } from '../../types/computerOperator';
import { redactSecrets } from './credentialRedactor';

export interface InterpretationResult {
  activeApplication: string;
  summary: string;
  summaryHi: string;
  buttons: UIElement[];
  tabs: UIElement[];
  inputs: UIElement[];
  dialogs: UIElement[];
  errorBadges: UIElement[];
  detectedErrors: string[];
  isAmbiguous: boolean;
  ambiguityReason?: string;
  suggestedNextTarget?: UIElement;
}

export class ScreenInterpreter {
  /**
   * Interprets the raw ScreenObservation into structured semantic UI components
   */
  public static interpret(observation: ScreenObservation, targetGoal?: string): InterpretationResult {
    const buttons = observation.visibleElements.filter((el) => el.type === 'button' || el.type === 'icon');
    const tabs = observation.visibleElements.filter((el) => el.type === 'tab');
    const inputs = observation.visibleElements.filter((el) => el.type === 'input');
    const dialogs = observation.visibleElements.filter((el) => el.type === 'dialog');
    const errorBadges = observation.visibleElements.filter((el) => el.type === 'error_badge');

    // Extract visible errors from observations or dialogs
    const detectedErrors: string[] = [...observation.detectedErrors];
    dialogs.forEach((d) => {
      const lower = d.label.toLowerCase();
      if (lower.includes('error') || lower.includes('exception') || lower.includes('failed')) {
        detectedErrors.push(d.label);
      }
    });

    if (observation.terminalOutput) {
      const lines = observation.terminalOutput.split('\n');
      for (const line of lines) {
        if (
          (line.toLowerCase().includes('error') ||
            line.toLowerCase().includes('failed') ||
            line.toLowerCase().includes('cannot find module')) &&
          !detectedErrors.includes(line.trim())
        ) {
          detectedErrors.push(line.trim());
        }
      }
    }

    // Ambiguity Assessment
    let isAmbiguous = observation.isAmbiguous;
    let ambiguityReason = observation.ambiguityReason;

    // Check for modal dialogs blocking view or conflicting popups
    if (dialogs.length > 2 && !isAmbiguous) {
      isAmbiguous = true;
      ambiguityReason = `Multiple modal dialogs (${dialogs.length}) open simultaneously. UI state requires clarification.`;
    }

    // Matching suggested target element based on goal
    let suggestedNextTarget: UIElement | undefined;
    if (targetGoal) {
      const lowerGoal = targetGoal.toLowerCase();
      const allElements = observation.visibleElements;
      suggestedNextTarget = allElements.find((el) => {
        const lowerLabel = el.label.toLowerCase();
        return (
          lowerGoal.includes(lowerLabel) ||
          lowerLabel.includes(lowerGoal) ||
          (lowerGoal.includes('vs code') && el.app.toLowerCase().includes('code')) ||
          (lowerGoal.includes('terminal') && el.app.toLowerCase().includes('terminal')) ||
          (lowerGoal.includes('error') && el.type === 'error_badge')
        );
      });
    }

    const summaryEn = `Screen showing "${observation.activeApplication}" (${observation.windowTitle}). ${observation.visibleElements.length} interactive UI elements detected. ${detectedErrors.length > 0 ? `Errors detected: ${detectedErrors.length}` : 'No visible errors.'}`;

    const summaryHi = `स्क्रीन पर "${observation.activeApplication}" खुला हुआ है (${observation.windowTitle})। ${observation.visibleElements.length} इंटरैक्टिव UI तत्व मिले। ${detectedErrors.length > 0 ? `${detectedErrors.length} त्रुटियाँ पाई गईं।` : 'कोई समस्या नहीं पाई गई।'}`;

    return {
      activeApplication: observation.activeApplication,
      summary: redactSecrets(summaryEn),
      summaryHi: redactSecrets(summaryHi),
      buttons,
      tabs,
      inputs,
      dialogs,
      errorBadges,
      detectedErrors: detectedErrors.map((e) => redactSecrets(e)),
      isAmbiguous,
      ambiguityReason: ambiguityReason ? redactSecrets(ambiguityReason) : undefined,
      suggestedNextTarget,
    };
  }

  /**
   * Finds a specific UI element by label or keyword
   */
  public static findElementByLabel(
    observation: ScreenObservation,
    keyword: string
  ): UIElement | undefined {
    const lower = keyword.toLowerCase();
    return observation.visibleElements.find((el) => el.label.toLowerCase().includes(lower));
  }
}
