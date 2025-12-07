import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Enums - these define valid values
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

// Enums for complex task card requirements
export const CardQuality = {
  Bronze: 'Bronze',
  Silver: 'Silver',
  Gold: 'Gold',
} as const;

export const CardRarity = {
  Common: 'Common',
  Rare: 'Rare',
} as const;

// Speed profiles for rate limiting
export const SpeedProfile = {
  Fast: 'fast',
  Normal: 'normal',
  Safe: 'safe',
  HumanLike: 'humanlike',
} as const;

export type SBCCategoryType = typeof SBCCategory[keyof typeof SBCCategory];
export type TaskTypeType = typeof TaskType[keyof typeof TaskType];
export type CardQualityType = typeof CardQuality[keyof typeof CardQuality];
export type CardRarityType = typeof CardRarity[keyof typeof CardRarity];
export type SpeedProfileType = typeof SpeedProfile[keyof typeof SpeedProfile];

// Complex task card requirement schema
export const CardRequirementSchema = z.object({
  count: z.number().min(1).default(1),
  quality: z.enum(['Bronze', 'Silver', 'Gold']),
  rarity: z.enum(['Common', 'Rare']),
  isPositionDefined: z.boolean().default(true),
});

export const ComplexTaskConfigSchema = z.object({
  bronzeCards: CardRequirementSchema.optional(),
  silverCards: CardRequirementSchema.optional(),
  goldCards: CardRequirementSchema.optional(),
});

// Squad Builder filters for daily/optional tasks
export const SquadBuilderFiltersSchema = z.object({
  quality: z.enum(['Bronze', 'Silver', 'Gold', 'Any']).optional(),
  rarity: z.enum(['Common', 'Rare', 'Any']).optional(),
  ignorePosition: z.boolean().optional(),
});

export type CardRequirement = z.infer<typeof CardRequirementSchema>;
export type ComplexTaskConfig = z.infer<typeof ComplexTaskConfigSchema>;
export type SquadBuilderFilters = z.infer<typeof SquadBuilderFiltersSchema>;

// Extract enum values for Zod schema
const sbcCategoryValues = Object.values(SBCCategory) as [string, ...string[]];
const taskTypeValues = Object.values(TaskType) as [string, ...string[]];

export const TaskSchema = z.object({
  id: z.string(),
  category: z.enum(sbcCategoryValues),
  cardTitle: z.string(),
  repeatCount: z.number().min(1).default(1),
  enabled: z.boolean().default(true),
  taskType: z.enum(taskTypeValues).default(TaskType.Daily),
  complexConfig: ComplexTaskConfigSchema.optional(),
  squadBuilderFilters: SquadBuilderFiltersSchema.optional(),
});

// Extract speed profile values for Zod schema
const speedProfileValues = Object.values(SpeedProfile) as [string, ...string[]];

export const SquadBuilderRulesSchema = z.object({
  untradablesOnly: z.boolean().default(true),
  excludeActiveSquad: z.boolean().default(true),
  ignorePosition: z.boolean().default(true),
  sortBy: z.enum(['rating-low-to-high', 'rating-high-to-low']).default('rating-low-to-high'),
  maxOVR: z.number().min(1).max(99).default(85),
  preferCommon: z.boolean().default(true),
  speedProfile: z.enum(speedProfileValues).default(SpeedProfile.Normal),
});

export const ConfigSchema = z.object({
  dailyTasks: z.array(TaskSchema),
  squadBuilderRules: SquadBuilderRulesSchema,
});

export type Task = z.infer<typeof TaskSchema>;
export type SquadBuilderRules = z.infer<typeof SquadBuilderRulesSchema>;
export type Config = z.infer<typeof ConfigSchema>;

// Use CONFIG_PATH env var if set (for Electron), otherwise default to project root
const CONFIG_PATH = process.env.CONFIG_PATH || join(process.cwd(), '..', 'tasks.config.json');

export function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) {
    const defaultConfig: Config = {
      dailyTasks: [
        {
          id: 'daily-bronze-upgrade',
          category: 'Upgrades',
          cardTitle: 'Daily Bronze Upgrade',
          repeatCount: 1,
          enabled: true,
          taskType: 'daily',
        },
      ],
      squadBuilderRules: {
        untradablesOnly: true,
        excludeActiveSquad: true,
        ignorePosition: true,
        sortBy: 'rating-low-to-high',
        maxOVR: 85,
        preferCommon: true,
        speedProfile: 'normal',
      },
    };
    saveConfig(defaultConfig);
    return defaultConfig;
  }

  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  const parsed = JSON.parse(raw);
  return ConfigSchema.parse(parsed);
}

export function saveConfig(config: Config): void {
  const validated = ConfigSchema.parse(config);
  writeFileSync(CONFIG_PATH, JSON.stringify(validated, null, 2));
}

export function updateTask(taskId: string, updates: Partial<Task>): Config {
  const config = loadConfig();
  const taskIndex = config.dailyTasks.findIndex(t => t.id === taskId);

  if (taskIndex === -1) {
    throw new Error(`Task not found: ${taskId}`);
  }

  config.dailyTasks[taskIndex] = { ...config.dailyTasks[taskIndex], ...updates };
  saveConfig(config);
  return config;
}

export function addTask(task: Task): Config {
  const config = loadConfig();

  if (config.dailyTasks.some(t => t.id === task.id)) {
    throw new Error(`Task already exists: ${task.id}`);
  }

  config.dailyTasks.push(task);
  saveConfig(config);
  return config;
}

export function removeTask(taskId: string): Config {
  const config = loadConfig();
  config.dailyTasks = config.dailyTasks.filter(t => t.id !== taskId);
  saveConfig(config);
  return config;
}
