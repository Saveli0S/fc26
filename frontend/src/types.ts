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

export const SpeedProfile = {
  Fast: 'fast',
  Normal: 'normal',
  Safe: 'safe',
  HumanLike: 'humanlike',
} as const;

export type SBCCategoryType = typeof SBCCategory[keyof typeof SBCCategory];
export type TaskTypeType = typeof TaskType[keyof typeof TaskType];
export type SpeedProfileType = typeof SpeedProfile[keyof typeof SpeedProfile];

export interface TaskSchedule {
  enabled: boolean;
  time?: string; // HH:MM format
  daysOfWeek: number[]; // 0=Sunday, 6=Saturday
}

export interface SquadBuilderFilters {
  quality?: 'Bronze' | 'Silver' | 'Gold' | 'Any';
  rarity?: 'Common' | 'Rare' | 'Any';
  ignorePosition?: boolean;
  isRarityRequired?: boolean;
}

export interface CardRequirement {
  count: number;
  quality: 'Bronze' | 'Silver' | 'Gold';
  rarity: 'Common' | 'Rare';
  isPositionDefined?: boolean;
}

export interface ComplexTaskConfig {
  bronzeCards?: CardRequirement;
  silverCards?: CardRequirement;
  goldCards?: CardRequirement;
}

export interface Task {
  id: string;
  category: SBCCategoryType;
  cardTitle: string;
  repeatCount: number;
  enabled: boolean;
  taskType: TaskTypeType;
  // Scheduling and automation
  schedule?: TaskSchedule;
  priority?: number; // 0-100, higher = runs first
  dependsOn?: string[]; // Task IDs this depends on
  // Complex task configuration
  complexConfig?: ComplexTaskConfig;
  // Squad builder filters
  squadBuilderFilters?: SquadBuilderFilters;
}

export interface SquadBuilderRules {
  untradablesOnly: boolean;
  excludeActiveSquad: boolean;
  ignorePosition: boolean;
  sortBy: 'rating-low-to-high' | 'rating-high-to-low';
  maxOVR: number;
  preferCommon: boolean;
  speedProfile: SpeedProfileType;
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
  schedulerRunning?: boolean;
}

export interface ScheduleInfo {
  taskId: string;
  cronExpression: string;
  nextRun: string | null;
}

export interface HealthCheckResult {
  healthy: boolean;
  reason: string;
}

// Analytics Types
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

// Card Inventory
export interface PlayerCard {
  id: string;
  cardType: 'Bronze' | 'Silver' | 'Gold';
  rarity: 'Common' | 'Rare';
  playerName: string;
  rating: number;
  position: string;
  scrapedAt: string;
}

export interface InventorySummary {
  total: number;
  byType: {
    Bronze: { Common: number; Rare: number };
    Silver: { Common: number; Rare: number };
    Gold: { Common: number; Rare: number };
  };
  lastSyncAt: string | null;
}
