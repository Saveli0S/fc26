export interface Task {
  id: string;
  category: string;
  cardTitle: string;
  repeatCount: number;
  enabled: boolean;
}

export interface SquadBuilderRules {
  untradablesOnly: boolean;
  excludeActiveSquad: boolean;
  ignorePosition: boolean;
  sortBy: 'rating-low-to-high' | 'rating-high-to-low';
  maxOVR: number;
  preferCommon: boolean;
}

export interface Config {
  dailyTasks: Task[];
  squadBuilderRules: SquadBuilderRules;
}

export interface LogEntry {
  message: string;
  logType: 'info' | 'error' | 'success' | 'warning';
  timestamp: string;
}

export interface TaskResult {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  completedRepeats: number;
  totalRepeats: number;
  error?: string;
}

export interface AppStatus {
  browserInitialized: boolean;
  isRunning: boolean;
}
