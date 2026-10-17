// ==============================================================================
// HERMES JARVIS — COMPUTER OPERATOR ACTION PLANNER
// Formulates step-by-step plans adhering to the Screen-Research loop:
// OBSERVE -> PLAN -> ONE SAFE ACTION -> VERIFY -> REPEAT
// ==============================================================================

import {
  ComputerAction,
  ComputerOperatorPlan,
  HighLevelIntentClass,
  ScreenObservation,
} from '../../types/computerOperator';
import { redactSecrets } from './credentialRedactor';

export class ActionPlanner {
  /**
   * Classifies an incoming user prompt into a high-level intent category
   */
  public static classifyIntent(prompt: string): HighLevelIntentClass {
    const lower = prompt.toLowerCase().trim();

    // 1. Dangerous action check
    if (
      lower.includes('delete') ||
      lower.includes('format') ||
      lower.includes('rm -rf') ||
      lower.includes('send money') ||
      lower.includes('upi') ||
      lower.includes('bank') ||
      lower.includes('publish') ||
      lower.includes('broadcast') ||
      lower.includes('हटाओ') ||
      lower.includes('डिलीट') ||
      lower.includes('पैसे')
    ) {
      return 'DANGEROUS_ACTION_REQUIRING_APPROVAL';
    }

    // 2. Computer operation check (VS Code, terminal, screen, mouse, click, type, error fix)
    if (
      lower.includes('vs code') ||
      lower.includes('vscode') ||
      lower.includes('browser') ||
      lower.includes('terminal') ||
      lower.includes('powershell') ||
      lower.includes('screen') ||
      lower.includes('screenshot') ||
      lower.includes('fix error') ||
      lower.includes('fix project') ||
      lower.includes('inspect') ||
      lower.includes('click') ||
      lower.includes('type') ||
      lower.includes('खोलो') ||
      lower.includes('स्क्रीन') ||
      lower.includes('समस्या') ||
      lower.includes('ठीक करो') ||
      lower.includes('कंप्यूटर') ||
      lower.includes('ऑपरेटर')
    ) {
      return 'COMPUTER_OPERATION';
    }

    // 3. Research check
    if (
      lower.includes('research') ||
      lower.includes('google search') ||
      lower.includes('search web') ||
      lower.includes('find info') ||
      lower.includes('खोजो')
    ) {
      return 'RESEARCH';
    }

    // 4. Special commands (telephony, routines, memory, settings)
    if (
      lower.includes('call') ||
      lower.includes('phone') ||
      lower.includes('dialer') ||
      lower.includes('routine') ||
      lower.includes('briefing') ||
      lower.includes('memory') ||
      lower.includes('क्लीनिक') ||
      lower.includes('कॉल')
    ) {
      return 'SPECIAL_COMMAND';
    }

    return 'NORMAL_CONVERSATION';
  }

  /**
   * Creates a structured action plan for an objective given the current screen state
   */
  public static createPlan(objective: string, observation: ScreenObservation): ComputerOperatorPlan {
    const planId = `plan-${Date.now()}`;
    const lower = objective.toLowerCase();
    const isHindi = /[\u0900-\u097F]/.test(objective) || lower.includes('kholo') || lower.includes('batao');

    const steps: ComputerAction[] = [];

    // Case 1: "Open VS Code and fix the project error" / "इस error को ठीक करो"
    if (
      (lower.includes('vs code') || lower.includes('vscode') || lower.includes('project')) &&
      (lower.includes('error') || lower.includes('fix') || lower.includes('ठीक'))
    ) {
      steps.push({
        id: `act-1-${Date.now()}`,
        type: 'SWITCH_WINDOW',
        targetApp: 'VS Code',
        description: 'Switch active focus to Visual Studio Code workspace',
        descriptionHi: 'VS Code विंडो पर स्विच करें',
        securityLevel: 1,
        requiresHumanApproval: false,
      });

      steps.push({
        id: `act-2-${Date.now()}`,
        type: 'INSPECT_SCREEN',
        targetApp: 'VS Code',
        description: 'Inspect VS Code editor and Problems tab to locate syntax or runtime errors',
        descriptionHi: 'VS Code स्क्रीन और समस्याओं के पैनल का निरीक्षण करें',
        securityLevel: 1,
        requiresHumanApproval: false,
      });

      steps.push({
        id: `act-3-${Date.now()}`,
        type: 'READ_FILE',
        filePath: 'src/types.ts',
        description: 'Read target project source file associated with reported issue',
        descriptionHi: 'संबंधित प्रोजेक्ट फ़ाइल पढ़ें',
        securityLevel: 1,
        requiresHumanApproval: false,
      });

      steps.push({
        id: `act-4-${Date.now()}`,
        type: 'EDIT_FILE',
        filePath: 'src/types.ts',
        description: 'Apply surgical fix to resolve identified type or logic error',
        descriptionHi: 'पहचानी गई समस्या को ठीक करने के लिए फ़ाइल अपडेट करें',
        securityLevel: 3,
        requiresHumanApproval: false,
      });

      steps.push({
        id: `act-5-${Date.now()}`,
        type: 'RUN_TESTS',
        command: 'npm test -- --run',
        description: 'Execute test suite to verify error resolution and prevent regressions',
        descriptionHi: 'सत्यापन के लिए टेस्ट सुइट चलाएं',
        securityLevel: 3,
        requiresHumanApproval: false,
      });
    }
    // Case 2: Inspect screen / "स्क्रीन देखकर बताओ क्या समस्या है"
    else if (lower.includes('inspect') || lower.includes('स्क्रीन') || lower.includes('समस्या') || lower.includes('what is on')) {
      steps.push({
        id: `act-1-${Date.now()}`,
        type: 'INSPECT_SCREEN',
        description: 'Capture screen and detect visible UI elements, active dialogs, and errors',
        descriptionHi: 'स्क्रीन कैप्चर करें और सभी सक्रिय तत्वों का विश्लेषण करें',
        securityLevel: 1,
        requiresHumanApproval: false,
      });
    }
    // Case 3: Launch / Switch to VS Code ("जार्विस, VS Code खोलो")
    else if (lower.includes('vs code') || lower.includes('vscode')) {
      steps.push({
        id: `act-1-${Date.now()}`,
        type: 'SWITCH_WINDOW',
        targetApp: 'VS Code',
        description: 'Switch active focus to Visual Studio Code',
        descriptionHi: 'Visual Studio Code विंडो खोलें',
        securityLevel: 1,
        requiresHumanApproval: false,
      });
    }
    // Case 4: Launch / Switch to Browser ("जार्विस, browser खोलो")
    else if (lower.includes('browser') || lower.includes('chrome') || lower.includes('ब्राउज़र')) {
      steps.push({
        id: `act-1-${Date.now()}`,
        type: 'SWITCH_WINDOW',
        targetApp: 'Chrome',
        description: 'Launch and bring Chrome browser to active foreground',
        descriptionHi: 'Google Chrome ब्राउज़र विंडो खोलें',
        securityLevel: 1,
        requiresHumanApproval: false,
      });
    }
    // Case 5: Terminal / PowerShell operation
    else if (lower.includes('terminal') || lower.includes('powershell') || lower.includes('cmd') || lower.includes('टर्मिनल')) {
      steps.push({
        id: `act-1-${Date.now()}`,
        type: 'SWITCH_WINDOW',
        targetApp: 'Terminal',
        description: 'Switch focus to Terminal / PowerShell console',
        descriptionHi: 'टर्मिनल विंडो पर स्विच करें',
        securityLevel: 1,
        requiresHumanApproval: false,
      });
      steps.push({
        id: `act-2-${Date.now()}`,
        type: 'TERMINAL_COMMAND',
        command: 'git status',
        description: 'Inspect current branch status and pending changes in terminal',
        descriptionHi: 'टर्मिनल में गिट स्टेटस की जाँच करें',
        securityLevel: 1,
        requiresHumanApproval: false,
      });
    }
    // Generic single-step inspection
    else {
      steps.push({
        id: `act-1-${Date.now()}`,
        type: 'INSPECT_SCREEN',
        description: `Inspect active desktop for: "${objective}"`,
        descriptionHi: `स्क्रीन का विश्लेषण करें: "${objective}"`,
        securityLevel: 1,
        requiresHumanApproval: false,
      });
    }

    return {
      id: planId,
      objective: redactSecrets(objective),
      objectiveHi: isHindi ? redactSecrets(objective) : undefined,
      currentStepIndex: 0,
      steps,
      createdAt: new Date().toISOString(),
    };
  }
}
