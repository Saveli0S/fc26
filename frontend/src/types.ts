// Enums
export const SBCCategory = {
  All: 'All',
  Favourites: 'Favourites',
  Players: 'Players',
  Upgrades: 'Upgrades',
  Challenges: 'Challenges',
  Icons: 'Icons',
  Foundations: 'Foundations',
} as const;

export const TaskType = {
  Daily: 'daily',
  Optional: 'optional',
  Complex: 'complex',
} as const;

export type SBCCategoryType = typeof SBCCategory[keyof typeof SBCCategory];
export type TaskTypeType = typeof TaskType[keyof typeof TaskType];

export interface Task {
  id: string;
  category: SBCCategoryType;
  cardTitle: string;
  repeatCount: number;
  enabled: boolean;
  taskType: TaskTypeType;
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
