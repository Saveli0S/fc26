import { Task, TaskType, SBCCategory } from '../types';

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  tasks: Omit<Task, 'id'>[];
}

export const taskTemplates: TaskTemplate[] = [
  {
    id: 'daily-grind',
    name: 'Daily Grind',
    description: 'All daily upgrade SBCs',
    icon: '📅',
    tasks: [
      {
        category: SBCCategory.Upgrades,
        cardTitle: 'Daily Bronze Upgrade',
        repeatCount: 3,
        enabled: true,
        taskType: TaskType.Daily,
        priority: 60,
        squadBuilderFilters: {
          quality: 'Bronze',
          rarity: 'Common',
          ignorePosition: true,
          isRarityRequired: false,
        },
      },
      {
        category: SBCCategory.Upgrades,
        cardTitle: 'Daily Silver Upgrade',
        repeatCount: 3,
        enabled: true,
        taskType: TaskType.Daily,
        priority: 50,
        squadBuilderFilters: {
          quality: 'Silver',
          rarity: 'Common',
          ignorePosition: true,
          isRarityRequired: false,
        },
      },
      {
        category: SBCCategory.Upgrades,
        cardTitle: 'Daily Rare Gold Upgrade',
        repeatCount: 3,
        enabled: true,
        taskType: TaskType.Daily,
        priority: 40,
        squadBuilderFilters: {
          quality: 'Gold',
          rarity: 'Common',
          ignorePosition: true,
          isRarityRequired: false,
        },
      },
    ],
  },
  {
    id: 'bronze-farm',
    name: 'Bronze Farm',
    description: 'Bronze upgrades for silver cards',
    icon: '🥉',
    tasks: [
      {
        category: SBCCategory.Upgrades,
        cardTitle: 'Daily Bronze Upgrade',
        repeatCount: 3,
        enabled: true,
        taskType: TaskType.Daily,
        priority: 60,
        squadBuilderFilters: {
          quality: 'Bronze',
          rarity: 'Common',
          ignorePosition: true,
          isRarityRequired: false,
        },
      },
      {
        category: SBCCategory.Upgrades,
        cardTitle: 'Bronze Upgrade',
        repeatCount: 5,
        enabled: true,
        taskType: TaskType.Optional,
        priority: 50,
        squadBuilderFilters: {
          quality: 'Bronze',
          rarity: 'Common',
          ignorePosition: true,
          isRarityRequired: false,
        },
      },
    ],
  },
  {
    id: 'silver-farm',
    name: 'Silver Farm',
    description: 'Silver upgrades for gold cards',
    icon: '🥈',
    tasks: [
      {
        category: SBCCategory.Upgrades,
        cardTitle: 'Daily Silver Upgrade',
        repeatCount: 3,
        enabled: true,
        taskType: TaskType.Daily,
        priority: 60,
        squadBuilderFilters: {
          quality: 'Silver',
          rarity: 'Common',
          ignorePosition: true,
          isRarityRequired: false,
        },
      },
      {
        category: SBCCategory.Upgrades,
        cardTitle: 'Silver Upgrade',
        repeatCount: 5,
        enabled: true,
        taskType: TaskType.Optional,
        priority: 50,
        squadBuilderFilters: {
          quality: 'Silver',
          rarity: 'Common',
          ignorePosition: true,
          isRarityRequired: false,
        },
      },
    ],
  },
  {
    id: 'gold-grind',
    name: 'Gold Grind',
    description: 'Gold upgrades for rare players',
    icon: '🥇',
    tasks: [
      {
        category: SBCCategory.Upgrades,
        cardTitle: 'Daily Rare Gold Upgrade',
        repeatCount: 3,
        enabled: true,
        taskType: TaskType.Daily,
        priority: 60,
        squadBuilderFilters: {
          quality: 'Gold',
          rarity: 'Common',
          ignorePosition: true,
          isRarityRequired: false,
        },
      },
      {
        category: SBCCategory.Upgrades,
        cardTitle: 'Gold Upgrade',
        repeatCount: 3,
        enabled: true,
        taskType: TaskType.Optional,
        priority: 50,
        squadBuilderFilters: {
          quality: 'Gold',
          rarity: 'Common',
          ignorePosition: true,
          isRarityRequired: false,
        },
      },
    ],
  },
  {
    id: 'full-ladder',
    name: 'Full Ladder',
    description: 'Bronze → Silver → Gold chain',
    icon: '🪜',
    tasks: [
      {
        category: SBCCategory.Upgrades,
        cardTitle: 'Daily Bronze Upgrade',
        repeatCount: 3,
        enabled: true,
        taskType: TaskType.Daily,
        priority: 100,
        squadBuilderFilters: {
          quality: 'Bronze',
          rarity: 'Common',
          ignorePosition: true,
          isRarityRequired: false,
        },
      },
      {
        category: SBCCategory.Upgrades,
        cardTitle: 'Bronze Upgrade',
        repeatCount: 3,
        enabled: true,
        taskType: TaskType.Optional,
        priority: 90,
        squadBuilderFilters: {
          quality: 'Bronze',
          rarity: 'Common',
          ignorePosition: true,
          isRarityRequired: false,
        },
      },
      {
        category: SBCCategory.Upgrades,
        cardTitle: 'Daily Silver Upgrade',
        repeatCount: 3,
        enabled: true,
        taskType: TaskType.Daily,
        priority: 80,
        squadBuilderFilters: {
          quality: 'Silver',
          rarity: 'Common',
          ignorePosition: true,
          isRarityRequired: false,
        },
      },
      {
        category: SBCCategory.Upgrades,
        cardTitle: 'Silver Upgrade',
        repeatCount: 3,
        enabled: true,
        taskType: TaskType.Optional,
        priority: 70,
        squadBuilderFilters: {
          quality: 'Silver',
          rarity: 'Common',
          ignorePosition: true,
          isRarityRequired: false,
        },
      },
      {
        category: SBCCategory.Upgrades,
        cardTitle: 'Daily Rare Gold Upgrade',
        repeatCount: 3,
        enabled: true,
        taskType: TaskType.Daily,
        priority: 60,
        squadBuilderFilters: {
          quality: 'Gold',
          rarity: 'Common',
          ignorePosition: true,
          isRarityRequired: false,
        },
      },
    ],
  },
];
