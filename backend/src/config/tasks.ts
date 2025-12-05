import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export const TaskSchema = z.object({
  id: z.string(),
  category: z.enum(['All', 'Favourites', 'Players', 'Upgrades', 'Challenges', 'Icons', 'Foundations']),
  cardTitle: z.string(),
  repeatCount: z.number().min(1).default(1),
  enabled: z.boolean().default(true),
});

export const SquadBuilderRulesSchema = z.object({
  untradablesOnly: z.boolean().default(true),
  excludeActiveSquad: z.boolean().default(true),
  ignorePosition: z.boolean().default(true),
  sortBy: z.enum(['rating-low-to-high', 'rating-high-to-low']).default('rating-low-to-high'),
  maxOVR: z.number().min(1).max(99).default(85),
  preferCommon: z.boolean().default(true),
});

export const ConfigSchema = z.object({
  dailyTasks: z.array(TaskSchema),
  squadBuilderRules: SquadBuilderRulesSchema,
});

export type Task = z.infer<typeof TaskSchema>;
export type SquadBuilderRules = z.infer<typeof SquadBuilderRulesSchema>;
export type Config = z.infer<typeof ConfigSchema>;

const CONFIG_PATH = join(process.cwd(), '..', 'tasks.config.json');

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
        },
      ],
      squadBuilderRules: {
        untradablesOnly: true,
        excludeActiveSquad: true,
        ignorePosition: true,
        sortBy: 'rating-low-to-high',
        maxOVR: 85,
        preferCommon: true,
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
