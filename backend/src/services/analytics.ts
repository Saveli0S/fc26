import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// ============================================================================
// Types
// ============================================================================

export interface TaskExecution {
  id: string;
  taskId: string;
  taskName: string;
  taskType: string;
  status: 'completed' | 'failed' | 'skipped';
  completedRepeats: number;
  totalRepeats: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  error?: string;
}

export interface SessionSummary {
  id: string;
  startedAt: string;
  completedAt: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  skippedTasks: number;
  totalRepeats: number;
  completedRepeats: number;
  durationMs: number;
}

export interface DailyStats {
  date: string;
  tasksCompleted: number;
  tasksFailed: number;
  tasksSkipped: number;
  repeatsCompleted: number;
  totalDurationMs: number;
  sessions: number;
}

export interface TaskStats {
  taskId: string;
  taskName: string;
  taskType: string;
  totalExecutions: number;
  successCount: number;
  failCount: number;
  skipCount: number;
  successRate: number;
  avgDurationMs: number;
  totalRepeatsCompleted: number;
}

export interface AnalyticsSummary {
  totalSessions: number;
  totalTasksRun: number;
  totalRepeatsCompleted: number;
  overallSuccessRate: number;
  avgSessionDurationMs: number;
  dailyStats: DailyStats[];
  taskStats: TaskStats[];
  recentSessions: SessionSummary[];
}

interface AnalyticsData {
  executions: TaskExecution[];
  sessions: SessionSummary[];
}

// ============================================================================
// Configuration
// ============================================================================

const STORAGE_BASE = process.env.STORAGE_PATH || join(process.cwd(), 'storage');
const ANALYTICS_PATH = join(STORAGE_BASE, 'analytics.json');

// ============================================================================
// AnalyticsService Class
// ============================================================================

class AnalyticsService {
  private data: AnalyticsData = { executions: [], sessions: [] };
  private currentSession: {
    id: string;
    startedAt: string;
    executions: TaskExecution[];
  } | null = null;
  private taskStartTimes: Map<string, number> = new Map();

  constructor() {
    this.load();
  }

  // ==========================================================================
  // Session Management
  // ==========================================================================

  startSession(): string {
    const id = `session-${Date.now()}`;
    this.currentSession = {
      id,
      startedAt: new Date().toISOString(),
      executions: [],
    };
    return id;
  }

  endSession(): SessionSummary | null {
    if (!this.currentSession) return null;

    const executions = this.currentSession.executions;
    const completedAt = new Date().toISOString();
    const startedAt = this.currentSession.startedAt;

    const summary: SessionSummary = {
      id: this.currentSession.id,
      startedAt,
      completedAt,
      totalTasks: executions.length,
      completedTasks: executions.filter(e => e.status === 'completed').length,
      failedTasks: executions.filter(e => e.status === 'failed').length,
      skippedTasks: executions.filter(e => e.status === 'skipped').length,
      totalRepeats: executions.reduce((sum, e) => sum + e.totalRepeats, 0),
      completedRepeats: executions.reduce((sum, e) => sum + e.completedRepeats, 0),
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
    };

    this.data.sessions.push(summary);
    this.data.executions.push(...executions);
    this.save();

    this.currentSession = null;
    return summary;
  }

  // ==========================================================================
  // Task Tracking
  // ==========================================================================

  startTask(taskId: string): void {
    this.taskStartTimes.set(taskId, Date.now());
  }

  recordTaskExecution(
    taskId: string,
    taskName: string,
    taskType: string,
    status: 'completed' | 'failed' | 'skipped',
    completedRepeats: number,
    totalRepeats: number,
    error?: string
  ): TaskExecution {
    const startTime = this.taskStartTimes.get(taskId) || Date.now();
    const endTime = Date.now();

    const execution: TaskExecution = {
      id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      taskId,
      taskName,
      taskType,
      status,
      completedRepeats,
      totalRepeats,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date(endTime).toISOString(),
      durationMs: endTime - startTime,
      error,
    };

    this.taskStartTimes.delete(taskId);

    if (this.currentSession) {
      this.currentSession.executions.push(execution);
    } else {
      // Standalone execution (not in a session)
      this.data.executions.push(execution);
      this.save();
    }

    return execution;
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  getSummary(days = 30): AnalyticsSummary {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTime = cutoffDate.getTime();

    // Filter recent data
    const recentExecutions = this.data.executions.filter(
      e => new Date(e.startedAt).getTime() >= cutoffTime
    );
    const recentSessions = this.data.sessions.filter(
      s => new Date(s.startedAt).getTime() >= cutoffTime
    );

    // Calculate daily stats
    const dailyMap = new Map<string, DailyStats>();
    for (const exec of recentExecutions) {
      const date = exec.startedAt.split('T')[0];
      const existing = dailyMap.get(date) || {
        date,
        tasksCompleted: 0,
        tasksFailed: 0,
        tasksSkipped: 0,
        repeatsCompleted: 0,
        totalDurationMs: 0,
        sessions: 0,
      };

      if (exec.status === 'completed') existing.tasksCompleted++;
      else if (exec.status === 'failed') existing.tasksFailed++;
      else existing.tasksSkipped++;

      existing.repeatsCompleted += exec.completedRepeats;
      existing.totalDurationMs += exec.durationMs;

      dailyMap.set(date, existing);
    }

    // Count sessions per day
    for (const session of recentSessions) {
      const date = session.startedAt.split('T')[0];
      const existing = dailyMap.get(date);
      if (existing) existing.sessions++;
    }

    const dailyStats = Array.from(dailyMap.values()).sort(
      (a, b) => a.date.localeCompare(b.date)
    );

    // Calculate task stats
    const taskMap = new Map<string, TaskStats>();
    for (const exec of recentExecutions) {
      const existing = taskMap.get(exec.taskId) || {
        taskId: exec.taskId,
        taskName: exec.taskName,
        taskType: exec.taskType,
        totalExecutions: 0,
        successCount: 0,
        failCount: 0,
        skipCount: 0,
        successRate: 0,
        avgDurationMs: 0,
        totalRepeatsCompleted: 0,
      };

      existing.totalExecutions++;
      if (exec.status === 'completed') existing.successCount++;
      else if (exec.status === 'failed') existing.failCount++;
      else existing.skipCount++;

      existing.totalRepeatsCompleted += exec.completedRepeats;
      existing.avgDurationMs =
        (existing.avgDurationMs * (existing.totalExecutions - 1) + exec.durationMs) /
        existing.totalExecutions;

      taskMap.set(exec.taskId, existing);
    }

    // Calculate success rates
    const taskStats = Array.from(taskMap.values()).map(ts => ({
      ...ts,
      successRate: ts.totalExecutions > 0
        ? Math.round((ts.successCount / ts.totalExecutions) * 100)
        : 0,
    }));

    // Overall stats
    const totalCompleted = recentExecutions.filter(e => e.status === 'completed').length;
    const totalRun = recentExecutions.length;

    return {
      totalSessions: recentSessions.length,
      totalTasksRun: totalRun,
      totalRepeatsCompleted: recentExecutions.reduce((sum, e) => sum + e.completedRepeats, 0),
      overallSuccessRate: totalRun > 0 ? Math.round((totalCompleted / totalRun) * 100) : 0,
      avgSessionDurationMs: recentSessions.length > 0
        ? Math.round(recentSessions.reduce((sum, s) => sum + s.durationMs, 0) / recentSessions.length)
        : 0,
      dailyStats,
      taskStats: taskStats.sort((a, b) => b.totalExecutions - a.totalExecutions),
      recentSessions: recentSessions.slice(-10).reverse(),
    };
  }

  getDailyStats(days = 7): DailyStats[] {
    return this.getSummary(days).dailyStats;
  }

  getTaskStats(): TaskStats[] {
    return this.getSummary(30).taskStats;
  }

  getRecentSessions(limit = 10): SessionSummary[] {
    return this.data.sessions.slice(-limit).reverse();
  }

  // ==========================================================================
  // Data Management
  // ==========================================================================

  clearOldData(daysToKeep = 90): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffTime = cutoffDate.getTime();

    const originalCount = this.data.executions.length;
    this.data.executions = this.data.executions.filter(
      e => new Date(e.startedAt).getTime() >= cutoffTime
    );
    this.data.sessions = this.data.sessions.filter(
      s => new Date(s.startedAt).getTime() >= cutoffTime
    );

    this.save();
    return originalCount - this.data.executions.length;
  }

  exportData(): AnalyticsData {
    return { ...this.data };
  }

  // ==========================================================================
  // Persistence
  // ==========================================================================

  private load(): void {
    try {
      if (existsSync(ANALYTICS_PATH)) {
        const raw = readFileSync(ANALYTICS_PATH, 'utf-8');
        this.data = JSON.parse(raw);
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
      this.data = { executions: [], sessions: [] };
    }
  }

  private save(): void {
    try {
      const dir = dirname(ANALYTICS_PATH);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(ANALYTICS_PATH, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Failed to save analytics:', error);
    }
  }
}

// Singleton instance
export const analyticsService = new AnalyticsService();
