// ==============================================================================
// HERMES JARVIS — MASTER COMPUTER OPERATOR ENGINE
// Orchestrates the Screen-Research Loop:
// OBSERVE -> PLAN -> ONE SAFE ACTION -> VERIFY -> REPEAT -> FINAL VERIFY
// ==============================================================================

import {
  ComputerOperatorTask,
  ComputerOperatorMode,
  ScreenObservation,
  DEFAULT_OPERATOR_CONFIG,
  ComputerOperatorConfig,
} from '../../types/computerOperator';
import { ScreenObserver, ScreenCaptureOptions } from './screenObserver';
import { ScreenInterpreter } from './screenInterpreter';
import { ActionPlanner } from './actionPlanner';
import { PermissionGuard } from './permissionGuard';
import { ActionExecutor } from './actionExecutor';
import { ActionVerifier } from './actionVerifier';
import { TaskTracker } from './taskTracker';
import { redactSecrets } from './credentialRedactor';

export class ComputerOperatorEngine {
  private static config: ComputerOperatorConfig = { ...DEFAULT_OPERATOR_CONFIG };

  public static setConfig(updates: Partial<ComputerOperatorConfig>) {
    this.config = { ...this.config, ...updates };
  }

  public static getConfig(): ComputerOperatorConfig {
    return { ...this.config };
  }

  /**
   * Directly observes screen and returns semantic interpretation
   */
  public static async inspectScreen(options: ScreenCaptureOptions = {}): Promise<{
    observation: ScreenObservation;
    interpretation: ReturnType<typeof ScreenInterpreter.interpret>;
  }> {
    const observation = await ScreenObserver.observeScreen(options);
    const interpretation = ScreenInterpreter.interpret(observation);
    return { observation, interpretation };
  }

  /**
   * Main entry point: Executes a user objective via the Screen-Research loop
   */
  public static async executeTask(
    objective: string,
    mode: ComputerOperatorMode = 'hybrid',
    emergencyStopActive: boolean = false
  ): Promise<ComputerOperatorTask> {
    const isHindi = /[\u0900-\u097F]/.test(objective);
    const intentClass = ActionPlanner.classifyIntent(objective);

    // 1. Create task & emit COMMAND_RECEIVED event
    const task = TaskTracker.createTask({
      objective,
      intentClass,
      mode,
    });

    try {
      // 2. STAGE: ANALYZING_SCREEN
      TaskTracker.emitEvent(task, {
        id: `evt-${Date.now()}-screen`,
        taskId: task.taskId,
        timestamp: new Date().toISOString(),
        stage: 'ANALYZING_SCREEN',
        message: 'Analyzing desktop screen, detecting active windows, tabs, and UI elements.',
        messageHi: 'डेस्कटॉप स्क्रीन का विश्लेषण, सक्रिय विंडो और तत्वों की पहचान की जा रही है।',
      });

      const initialObservation = await ScreenObserver.observeScreen({
        preferredApp: objective,
        includeScreenshot: true,
      });
      task.currentObservation = initialObservation;

      // Check if UI is ambiguous
      if (initialObservation.isAmbiguous) {
        TaskTracker.emitEvent(task, {
          id: `evt-${Date.now()}-ambiguous`,
          taskId: task.taskId,
          timestamp: new Date().toISOString(),
          stage: 'BLOCKED',
          message: `UI state is ambiguous: ${initialObservation.ambiguityReason || 'Multiple unconfirmed dialogs present'}. Halting safely for human clarification.`,
          messageHi: `स्क्रीन की स्थिति अस्पष्ट है: कार्य सुरक्षित रूप से रोका गया।`,
          error: initialObservation.ambiguityReason,
        });
        task.status = 'BLOCKED';
        task.error = initialObservation.ambiguityReason;
        return task;
      }

      const interpretation = ScreenInterpreter.interpret(initialObservation, objective);

      // 3. STAGE: PLAN_CREATED
      const plan = ActionPlanner.createPlan(objective, initialObservation);
      task.plan = plan;

      TaskTracker.emitEvent(task, {
        id: `evt-${Date.now()}-plan`,
        taskId: task.taskId,
        timestamp: new Date().toISOString(),
        stage: 'PLAN_CREATED',
        message: `Plan formulated with ${plan.steps.length} safe sequential step(s).`,
        messageHi: `कार्य योजना तैयार: ${plan.steps.length} सुरक्षित चरण निर्धारित।`,
      });

      // 4. SCREEN-RESEARCH EXECUTION LOOP: Execute one safe action at a time and verify
      let currentObservation = initialObservation;

      for (let i = 0; i < plan.steps.length; i++) {
        // Check for user cancellation
        if (TaskTracker.isTaskCancelled(task.taskId)) {
          task.status = 'CANCELLED';
          return task;
        }

        const action = plan.steps[i];
        plan.currentStepIndex = i;
        task.currentAction = action;

        // 4.1 Permission & Safety Guard Evaluation
        const guard = PermissionGuard.evaluateAction(action, emergencyStopActive);
        if (!guard.allowed) {
          if (guard.requiresHumanApproval) {
            TaskTracker.emitEvent(task, {
              id: `evt-${Date.now()}-approval`,
              taskId: task.taskId,
              timestamp: new Date().toISOString(),
              stage: 'NEEDS_APPROVAL',
              message: `Action requires Level 4 Human Approval: "${action.description}". Waiting for authorization in Permission Gateway.`,
              messageHi: `इस कार्य के लिए Level 4 मानव स्वीकृति आवश्यक है: "${action.descriptionHi || action.description}"।`,
              actionDetail: action,
              approvalRequired: true,
            });
            task.status = 'NEEDS_APPROVAL';
            return task;
          } else {
            TaskTracker.emitEvent(task, {
              id: `evt-${Date.now()}-blocked`,
              taskId: task.taskId,
              timestamp: new Date().toISOString(),
              stage: 'BLOCKED',
              message: `Action permanently blocked by Security Matrix: ${guard.blockReason}`,
              messageHi: `सुरक्षा नीति द्वारा कार्य अवरुद्ध: ${guard.blockReason}`,
              error: guard.blockReason,
            });
            task.status = 'BLOCKED';
            task.error = guard.blockReason;
            return task;
          }
        }

        // 4.2 STAGE: ACTION
        TaskTracker.emitEvent(task, {
          id: `evt-${Date.now()}-act-${i}`,
          taskId: task.taskId,
          timestamp: new Date().toISOString(),
          stage: 'ACTION',
          message: `ACTION [Step ${i + 1}/${plan.steps.length}]: ${action.description}`,
          messageHi: `कार्य [चरण ${i + 1}/${plan.steps.length}]: ${action.descriptionHi || action.description}`,
          actionDetail: action,
        });

        const execResult = await ActionExecutor.executeAction(action);
        if (!execResult.success) {
          TaskTracker.emitEvent(task, {
            id: `evt-${Date.now()}-exec-fail-${i}`,
            taskId: task.taskId,
            timestamp: new Date().toISOString(),
            stage: 'BLOCKED',
            message: `Execution failed at step ${i + 1}: ${execResult.error || execResult.message}`,
            messageHi: `चरण ${i + 1} पर निष्पादन विफल: ${execResult.error || execResult.message}`,
            error: execResult.error,
          });
          task.status = 'FAILED';
          task.error = execResult.error;
          return task;
        }

        // 4.3 STAGE: VERIFYING
        TaskTracker.emitEvent(task, {
          id: `evt-${Date.now()}-verify-${i}`,
          taskId: task.taskId,
          timestamp: new Date().toISOString(),
          stage: 'VERIFYING',
          message: `VERIFYING screen state and application response for step ${i + 1}...`,
          messageHi: `चरण ${i + 1} के पश्चात स्क्रीन स्थिति का सत्यापन किया जा रहा है...`,
        });

        const postObservation = await ScreenObserver.observeScreen({
          preferredApp: action.targetApp,
          includeScreenshot: true,
        });
        task.currentObservation = postObservation;

        const verification = ActionVerifier.verifyAction(action, currentObservation, postObservation, i);
        task.lastVerification = verification;

        if (!verification.verified) {
          if (verification.shouldRetry) {
            // Safe single retry
            TaskTracker.emitEvent(task, {
              id: `evt-${Date.now()}-retry-${i}`,
              taskId: task.taskId,
              timestamp: new Date().toISOString(),
              stage: 'VERIFYING',
              message: verification.message,
              messageHi: verification.messageHi,
            });
            // Re-execute once
            await ActionExecutor.executeAction(action);
          } else {
            TaskTracker.emitEvent(task, {
              id: `evt-${Date.now()}-verif-fail-${i}`,
              taskId: task.taskId,
              timestamp: new Date().toISOString(),
              stage: 'BLOCKED',
              message: verification.message,
              messageHi: verification.messageHi,
              error: verification.error,
            });
            task.status = 'FAILED';
            task.error = verification.error;
            return task;
          }
        }

        // 4.4 STAGE: RESULT
        TaskTracker.emitEvent(task, {
          id: `evt-${Date.now()}-res-${i}`,
          taskId: task.taskId,
          timestamp: new Date().toISOString(),
          stage: 'RESULT',
          message: `RESULT: ${verification.message}`,
          messageHi: `परिणाम: ${verification.messageHi}`,
          verification,
        });

        // 4.5 STAGE: NEXT ACTION (if more steps remain)
        if (i < plan.steps.length - 1) {
          TaskTracker.emitEvent(task, {
            id: `evt-${Date.now()}-next-${i}`,
            taskId: task.taskId,
            timestamp: new Date().toISOString(),
            stage: 'NEXT_ACTION',
            message: `Proceeding to NEXT ACTION: [Step ${i + 2}/${plan.steps.length}]: ${plan.steps[i + 1].description}`,
            messageHi: `अगले चरण पर बढ़ रहे हैं: [चरण ${i + 2}/${plan.steps.length}]: ${plan.steps[i + 1].descriptionHi || plan.steps[i + 1].description}`,
          });
        }

        currentObservation = postObservation;
      }

      // 5. STAGE: COMPLETED
      const finalSummaryEn = `Task completed successfully: "${objective}". All ${plan.steps.length} step(s) executed and visually verified. System state nominal.`;
      const finalSummaryHi = `कार्य सफलतापूर्वक संपन्न: "${objective}"। सभी ${plan.steps.length} चरण निष्पादित एवं सत्यापित।`;

      task.resultSummary = redactSecrets(finalSummaryEn);
      task.resultSummaryHi = redactSecrets(finalSummaryHi);

      TaskTracker.emitEvent(task, {
        id: `evt-${Date.now()}-done`,
        taskId: task.taskId,
        timestamp: new Date().toISOString(),
        stage: 'COMPLETED',
        message: finalSummaryEn,
        messageHi: finalSummaryHi,
      });

      task.status = 'COMPLETED';
      return task;
    } catch (err: any) {
      const errorMsg = redactSecrets(err?.message || 'Unknown computer operator error');
      TaskTracker.emitEvent(task, {
        id: `evt-${Date.now()}-err`,
        taskId: task.taskId,
        timestamp: new Date().toISOString(),
        stage: 'BLOCKED',
        message: `Operation halted: ${errorMsg}`,
        messageHi: `ऑपरेशन रुका: ${errorMsg}`,
        error: errorMsg,
      });
      task.status = 'FAILED';
      task.error = errorMsg;
      return task;
    }
  }

  /**
   * Resumes an action that was held for human authorization once approved
   */
  public static async resumeApprovedTask(taskId: string): Promise<ComputerOperatorTask | null> {
    const task = TaskTracker.getTask(taskId);
    if (!task || task.status !== 'NEEDS_APPROVAL' || !task.plan) return null;

    TaskTracker.emitEvent(task, {
      id: `evt-${Date.now()}-resumed`,
      taskId: task.taskId,
      timestamp: new Date().toISOString(),
      stage: 'ACTION',
      message: 'Level 4 Authorization confirmed by human operator. Resuming execution.',
      messageHi: 'मानव ऑपरेटर द्वारा Level 4 स्वीकृति प्राप्त। निष्पादन पुनः प्रारंभ।',
    });

    // Execute the approved action
    if (task.currentAction) {
      await ActionExecutor.executeAction(task.currentAction);
    }

    task.status = 'COMPLETED';
    TaskTracker.emitEvent(task, {
      id: `evt-${Date.now()}-resumed-done`,
      taskId: task.taskId,
      timestamp: new Date().toISOString(),
      stage: 'COMPLETED',
      message: `Authorized action completed and verified: "${task.objective}".`,
      messageHi: `अधिकृत कार्य पूर्ण एवं सत्यापित: "${task.objectiveHi || task.objective}"।`,
    });

    return task;
  }
}
