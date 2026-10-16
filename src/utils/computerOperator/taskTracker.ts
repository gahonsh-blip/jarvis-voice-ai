// ==============================================================================
// HERMES JARVIS — COMPUTER TASK TRACKER & COMMAND STREAM
// Tracks task execution, manages task lifecycle, emits command stream events,
// and handles user cancellation requests ("Stop", "Cancel", "रुक जाओ").
// ==============================================================================

import {
  CommandStreamEvent,
  ComputerOperatorTask,
  ComputerTaskState,
  HighLevelIntentClass,
  ComputerOperatorMode,
} from '../../types/computerOperator';
import { redactSecrets } from './credentialRedactor';

export type TaskStreamListener = (task: ComputerOperatorTask, event: CommandStreamEvent) => void;

export class TaskTracker {
  private static tasks: Map<string, ComputerOperatorTask> = new Map();
  private static activeTaskId: string | null = null;
  private static listeners: Set<TaskStreamListener> = new Set();
  private static cancelledTaskIds: Set<string> = new Set();

  /**
   * Subscribe to task lifecycle and command stream events
   */
  public static subscribe(listener: TaskStreamListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Generates a unique task ID
   */
  public static generateTaskId(): string {
    return `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }

  /**
   * Creates and registers a new computer operator task
   */
  public static createTask(params: {
    objective: string;
    intentClass: HighLevelIntentClass;
    mode?: ComputerOperatorMode;
  }): ComputerOperatorTask {
    const taskId = this.generateTaskId();
    const isHindi = /[\u0900-\u097F]/.test(params.objective);
    const now = new Date().toISOString();

    const task: ComputerOperatorTask = {
      taskId,
      objective: redactSecrets(params.objective),
      objectiveHi: isHindi ? redactSecrets(params.objective) : undefined,
      createdAt: now,
      updatedAt: now,
      intentClass: params.intentClass,
      mode: params.mode || 'hybrid',
      status: 'COMMAND_RECEIVED',
      streamEvents: [],
    };

    this.tasks.set(taskId, task);
    this.activeTaskId = taskId;

    // Emit COMMAND_RECEIVED event
    this.emitEvent(task, {
      id: `evt-${Date.now()}-1`,
      taskId,
      timestamp: now,
      stage: 'COMMAND_RECEIVED',
      message: `Command received: "${task.objective}". Initializing Screen-Research loop.`,
      messageHi: `आदेश प्राप्त हुआ: "${task.objective}"। स्क्रीन-रिसर्च लूप प्रारंभ।`,
    });

    return task;
  }

  /**
   * Emits a command stream event and updates task state
   */
  public static emitEvent(task: ComputerOperatorTask, event: CommandStreamEvent) {
    // Redact event message and details
    event.message = redactSecrets(event.message);
    if (event.messageHi) event.messageHi = redactSecrets(event.messageHi);
    if (event.error) event.error = redactSecrets(event.error);

    task.streamEvents.push(event);
    task.updatedAt = new Date().toISOString();

    // Map event stage to task status
    if (event.stage === 'COMPLETED') task.status = 'COMPLETED';
    else if (event.stage === 'BLOCKED') task.status = 'BLOCKED';
    else if (event.stage === 'NEEDS_APPROVAL') task.status = 'NEEDS_APPROVAL';
    else if (event.stage === 'CANCELLED') task.status = 'CANCELLED';
    else if (event.stage === 'ACTION') task.status = 'ACTION_EXECUTING';
    else if (event.stage === 'VERIFYING') task.status = 'VERIFYING';
    else if (event.stage === 'ANALYZING_SCREEN') task.status = 'ANALYZING_SCREEN';
    else if (event.stage === 'PLAN_CREATED') task.status = 'PLAN_CREATED';

    this.tasks.set(task.taskId, { ...task });

    // Notify listeners
    this.listeners.forEach((listener) => {
      try {
        listener(task, event);
      } catch (err) {
        console.error('Task listener error:', err);
      }
    });
  }

  /**
   * Requests immediate cancellation of the active task
   */
  public static cancelActiveTask(reason: string = 'User requested stop'): { cancelled: boolean; taskId?: string } {
    if (!this.activeTaskId) return { cancelled: false };

    const task = this.tasks.get(this.activeTaskId);
    if (!task) return { cancelled: false };

    this.cancelledTaskIds.add(task.taskId);
    task.status = 'CANCELLED';
    task.error = reason;

    this.emitEvent(task, {
      id: `evt-${Date.now()}-cancel`,
      taskId: task.taskId,
      timestamp: new Date().toISOString(),
      stage: 'CANCELLED',
      message: `Computer operator task halted: ${reason}.`,
      messageHi: `कंप्यूटर ऑपरेटर कार्य रोका गया: ${reason}`,
      error: reason,
    });

    const cancelledId = this.activeTaskId;
    this.activeTaskId = null;
    return { cancelled: true, taskId: cancelledId };
  }

  /**
   * Checks if a task has been cancelled
   */
  public static isTaskCancelled(taskId: string): boolean {
    return this.cancelledTaskIds.has(taskId);
  }

  /**
   * Retrieves a task by ID
   */
  public static getTask(taskId: string): ComputerOperatorTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Returns recent tasks
   */
  public static getRecentTasks(limit: number = 20): ComputerOperatorTask[] {
    return Array.from(this.tasks.values())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  /**
   * Retrieves the currently running task
   */
  public static getActiveTask(): ComputerOperatorTask | null {
    if (!this.activeTaskId) return null;
    return this.tasks.get(this.activeTaskId) || null;
  }

  /**
   * Checks if an utterance is a cancellation command
   */
  public static isCancellationCommand(text: string): boolean {
    const lower = text.toLowerCase().trim();
    const cancelKeywords = [
      'stop',
      'cancel',
      'abort',
      'halt',
      'shut down task',
      'रुक जाओ',
      'रुको',
      'काम बंद करो',
      'बंद करो',
      'रोक दो',
      'बस करो',
      'stop task',
      'cancel task',
      'cancel operator',
    ];

    return cancelKeywords.some((kw) => lower === kw || lower.startsWith(kw) || lower.includes(kw));
  }
}
