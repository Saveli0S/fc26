import cron from 'node-cron';
import { loadConfig, Task } from '../config/tasks.js';

export type SchedulerCallback = (taskId: string) => Promise<void>;
export type LogCallback = (message: string, type?: 'info' | 'error' | 'success' | 'warning') => void;

interface ScheduledJob {
  taskId: string;
  cronExpression: string;
  job: cron.ScheduledTask;
}

/**
 * SchedulerService manages scheduled task execution using node-cron.
 * Schedules are stored in tasks.config.json and loaded on startup.
 */
export class SchedulerService {
  private scheduledJobs: Map<string, ScheduledJob> = new Map();
  private onTaskRun: SchedulerCallback | null = null;
  private log: LogCallback;
  private isRunning = false;

  constructor(logCallback?: LogCallback) {
    this.log = logCallback || ((msg) => console.log(`[Scheduler] ${msg}`));
  }

  /**
   * Set callback for when a scheduled task should run
   */
  setTaskRunner(callback: SchedulerCallback): void {
    this.onTaskRun = callback;
  }

  /**
   * Initialize scheduler - load schedules from config and start cron jobs
   */
  initialize(): void {
    this.log('Initializing scheduler...', 'info');
    this.refreshSchedules();
    this.isRunning = true;
    this.log('Scheduler initialized', 'success');
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    this.log('Stopping scheduler...', 'info');
    this.scheduledJobs.forEach((job) => {
      job.job.stop();
    });
    this.scheduledJobs.clear();
    this.isRunning = false;
    this.log('Scheduler stopped', 'info');
  }

  /**
   * Refresh schedules from config file
   */
  refreshSchedules(): void {
    const config = loadConfig();
    const existingTaskIds = new Set(this.scheduledJobs.keys());

    for (const task of config.dailyTasks) {
      existingTaskIds.delete(task.id);

      if (task.schedule?.enabled && task.schedule.time) {
        const cronExpression = this.timeToCron(task.schedule.time, task.schedule.daysOfWeek);
        const existingJob = this.scheduledJobs.get(task.id);

        // Only update if schedule changed
        if (!existingJob || existingJob.cronExpression !== cronExpression) {
          this.scheduleTask(task, cronExpression);
        }
      } else {
        // Remove schedule if disabled
        this.unscheduleTask(task.id);
      }
    }

    // Remove jobs for deleted tasks
    existingTaskIds.forEach((taskId) => {
      this.unscheduleTask(taskId);
    });
  }

  /**
   * Update schedule for a single task
   */
  updateTaskSchedule(taskId: string, enabled: boolean, time?: string, daysOfWeek?: number[]): void {
    if (enabled && time) {
      const days = daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
      const cronExpression = this.timeToCron(time, days);
      const task = loadConfig().dailyTasks.find((t) => t.id === taskId);
      if (task) {
        this.scheduleTask(task, cronExpression);
      }
    } else {
      this.unscheduleTask(taskId);
    }
  }

  /**
   * Get list of active schedules
   */
  getActiveSchedules(): Array<{ taskId: string; cronExpression: string; nextRun: Date | null }> {
    return Array.from(this.scheduledJobs.values()).map((job) => ({
      taskId: job.taskId,
      cronExpression: job.cronExpression,
      nextRun: this.getNextRunTime(job.cronExpression),
    }));
  }

  /**
   * Check if scheduler is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private scheduleTask(task: Task, cronExpression: string): void {
    // Remove existing job if any
    this.unscheduleTask(task.id);

    if (!cron.validate(cronExpression)) {
      this.log(`Invalid cron expression for task ${task.id}: ${cronExpression}`, 'error');
      return;
    }

    const job = cron.schedule(cronExpression, async () => {
      this.log(`⏰ Scheduled run: ${task.cardTitle}`, 'info');
      if (this.onTaskRun) {
        try {
          await this.onTaskRun(task.id);
        } catch (error) {
          this.log(`Scheduled task ${task.id} failed: ${error}`, 'error');
        }
      } else {
        this.log('No task runner configured - skipping execution', 'warning');
      }
    });

    this.scheduledJobs.set(task.id, {
      taskId: task.id,
      cronExpression,
      job,
    });

    const nextRun = this.getNextRunTime(cronExpression);
    this.log(`Scheduled "${task.cardTitle}" at ${cronExpression} (next: ${nextRun?.toLocaleString() || 'N/A'})`, 'info');
  }

  private unscheduleTask(taskId: string): void {
    const existing = this.scheduledJobs.get(taskId);
    if (existing) {
      existing.job.stop();
      this.scheduledJobs.delete(taskId);
      this.log(`Unscheduled task: ${taskId}`, 'info');
    }
  }

  /**
   * Convert HH:MM time and days array to cron expression
   * Cron format: minute hour * * dayOfWeek
   */
  private timeToCron(time: string, daysOfWeek: number[]): string {
    const [hours, minutes] = time.split(':').map(Number);
    const days = daysOfWeek.length === 7 ? '*' : daysOfWeek.join(',');
    return `${minutes} ${hours} * * ${days}`;
  }

  /**
   * Calculate next run time from cron expression (approximate)
   */
  private getNextRunTime(cronExpression: string): Date | null {
    try {
      // Parse cron parts
      const parts = cronExpression.split(' ');
      if (parts.length < 5) return null;

      const [minute, hour] = parts.map(Number);
      const daysStr = parts[4];

      const now = new Date();
      const next = new Date();
      next.setHours(hour, minute, 0, 0);

      // If time already passed today, check for next valid day
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }

      // Handle specific days of week
      if (daysStr !== '*') {
        const validDays = daysStr.split(',').map(Number);
        let attempts = 0;
        while (!validDays.includes(next.getDay()) && attempts < 7) {
          next.setDate(next.getDate() + 1);
          attempts++;
        }
      }

      return next;
    } catch {
      return null;
    }
  }
}

// Singleton instance
let schedulerInstance: SchedulerService | null = null;

export function getScheduler(logCallback?: LogCallback): SchedulerService {
  if (!schedulerInstance) {
    schedulerInstance = new SchedulerService(logCallback);
  }
  return schedulerInstance;
}
