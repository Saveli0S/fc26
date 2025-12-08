import { Task, loadConfig } from '../config/tasks.js';

export type LogCallback = (message: string, type?: 'info' | 'error' | 'success' | 'warning') => void;

interface QueuedTask extends Task {
  resolvedPriority: number; // Priority after dependency resolution
}

/**
 * TaskQueue handles task ordering with priority and dependency resolution.
 * - Higher priority tasks run first
 * - Tasks with dependencies wait until dependencies complete
 */
export class TaskQueue {
  private log: LogCallback;
  private completedTasks: Set<string> = new Set();
  private failedTasks: Set<string> = new Set();

  constructor(logCallback?: LogCallback) {
    this.log = logCallback || ((msg) => console.log(`[TaskQueue] ${msg}`));
  }

  /**
   * Build execution order from enabled tasks
   * @returns Tasks sorted by priority with dependency constraints
   */
  buildExecutionOrder(tasks?: Task[]): Task[] {
    const allTasks = tasks || loadConfig().dailyTasks.filter((t) => t.enabled);

    // Validate dependencies exist
    const taskIds = new Set(allTasks.map((t) => t.id));
    for (const task of allTasks) {
      if (task.dependsOn) {
        for (const depId of task.dependsOn) {
          if (!taskIds.has(depId)) {
            this.log(`Task "${task.id}" depends on unknown task "${depId}"`, 'warning');
          }
        }
      }
    }

    // Topological sort with priority
    const sorted = this.topologicalSort(allTasks);
    return sorted;
  }

  /**
   * Check if a task can run (all dependencies satisfied)
   */
  canRun(task: Task): boolean {
    if (!task.dependsOn || task.dependsOn.length === 0) {
      return true;
    }

    for (const depId of task.dependsOn) {
      if (this.failedTasks.has(depId)) {
        this.log(`Task "${task.id}" blocked: dependency "${depId}" failed`, 'warning');
        return false;
      }
      if (!this.completedTasks.has(depId)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Mark a task as completed
   */
  markCompleted(taskId: string): void {
    this.completedTasks.add(taskId);
    this.failedTasks.delete(taskId);
  }

  /**
   * Mark a task as failed
   */
  markFailed(taskId: string): void {
    this.failedTasks.add(taskId);
    this.completedTasks.delete(taskId);
  }

  /**
   * Reset queue state (for new execution)
   */
  reset(): void {
    this.completedTasks.clear();
    this.failedTasks.clear();
  }

  /**
   * Get tasks blocked by failed dependencies
   */
  getBlockedTasks(tasks: Task[]): Task[] {
    return tasks.filter((task) => {
      if (!task.dependsOn) return false;
      return task.dependsOn.some((depId) => this.failedTasks.has(depId));
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Topological sort with priority-based tie-breaking
   * Uses Kahn's algorithm with priority queue
   */
  private topologicalSort(tasks: Task[]): Task[] {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    // Initialize
    for (const task of tasks) {
      inDegree.set(task.id, 0);
      dependents.set(task.id, []);
    }

    // Build dependency graph
    for (const task of tasks) {
      if (task.dependsOn) {
        for (const depId of task.dependsOn) {
          if (taskMap.has(depId)) {
            inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
            dependents.get(depId)?.push(task.id);
          }
        }
      }
    }

    // Priority queue (tasks with no dependencies)
    const ready: Task[] = tasks
      .filter((t) => (inDegree.get(t.id) || 0) === 0)
      .sort((a, b) => (b.priority || 50) - (a.priority || 50));

    const result: Task[] = [];

    while (ready.length > 0) {
      // Sort by priority before taking next
      ready.sort((a, b) => (b.priority || 50) - (a.priority || 50));

      const task = ready.shift()!;
      result.push(task);

      // Update dependents
      for (const depId of dependents.get(task.id) || []) {
        const newDegree = (inDegree.get(depId) || 1) - 1;
        inDegree.set(depId, newDegree);
        if (newDegree === 0) {
          const depTask = taskMap.get(depId);
          if (depTask) ready.push(depTask);
        }
      }
    }

    // Check for cycles
    if (result.length !== tasks.length) {
      const remaining = tasks.filter((t) => !result.find((r) => r.id === t.id));
      this.log(`Circular dependency detected in tasks: ${remaining.map((t) => t.id).join(', ')}`, 'error');
      // Return what we can, followed by remaining
      return [...result, ...remaining];
    }

    return result;
  }
}

// Singleton instance
let queueInstance: TaskQueue | null = null;

export function getTaskQueue(logCallback?: LogCallback): TaskQueue {
  if (!queueInstance) {
    queueInstance = new TaskQueue(logCallback);
  }
  return queueInstance;
}
