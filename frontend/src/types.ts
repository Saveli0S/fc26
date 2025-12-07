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
