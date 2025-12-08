import { Config, Task, AppStatus, InventorySummary, PlayerCard, ScheduleInfo, HealthCheckResult, AnalyticsSummary, DailyStats, TaskStats, SessionSummary } from '../types';

// In Electron (file://), use localhost explicitly
const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';
const API_BASE = isFileProtocol ? 'http://localhost:3001/api' : '/api';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

export const api = {
  // Config
  getConfig: () => fetchApi<Config>('/config'),
  updateConfig: (config: Config) =>
    fetchApi<{ success: boolean; config: Config }>('/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  // Tasks
  getTasks: () => fetchApi<Task[]>('/tasks'),
  updateTask: (id: string, updates: Partial<Task>) =>
    fetchApi<{ success: boolean }>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  addTask: (task: Task) =>
    fetchApi<{ success: boolean }>('/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    }),
  deleteTask: (id: string) =>
    fetchApi<{ success: boolean }>(`/tasks/${id}`, {
      method: 'DELETE',
    }),

  // Browser
  initBrowser: () =>
    fetchApi<{ success: boolean; message: string }>('/browser/init', {
      method: 'POST',
    }),
  login: (credentials?: { email: string; password: string }) =>
    fetchApi<{ success: boolean; message: string }>('/browser/login', {
      method: 'POST',
      body: JSON.stringify(credentials || {}),
    }),
  closeBrowser: () =>
    fetchApi<{ success: boolean; message: string }>('/browser/close', {
      method: 'POST',
    }),
  checkBrowserHealth: () => fetchApi<HealthCheckResult>('/browser/health'),
  dismissModals: () =>
    fetchApi<{ success: boolean; message: string }>('/browser/dismiss-modals', {
      method: 'POST',
    }),

  // Run
  runAll: () =>
    fetchApi<{ success: boolean; message: string }>('/run/all', {
      method: 'POST',
    }),
  runTask: (taskId: string) =>
    fetchApi<{ success: boolean; message: string }>(`/run/${taskId}`, {
      method: 'POST',
    }),
  stop: () =>
    fetchApi<{ success: boolean; message: string }>('/run/stop', {
      method: 'POST',
    }),

  // Status
  getStatus: () => fetchApi<AppStatus>('/status'),

  // Emergency shutdown
  shutdown: () =>
    fetchApi<{ success: boolean; message: string }>('/shutdown', {
      method: 'POST',
    }),

  // Inventory
  getInventorySummary: () => fetchApi<InventorySummary>('/inventory/summary'),
  getInventoryCards: (cardType?: string, rarity?: string) => {
    const params = new URLSearchParams();
    if (cardType) params.append('cardType', cardType);
    if (rarity) params.append('rarity', rarity);
    const query = params.toString();
    return fetchApi<PlayerCard[]>(`/inventory/cards${query ? `?${query}` : ''}`);
  },
  syncInventory: () =>
    fetchApi<{ success: boolean; message: string }>('/inventory/sync', {
      method: 'POST',
    }),
  stopSync: () =>
    fetchApi<{ success: boolean; message: string }>('/inventory/sync/stop', {
      method: 'POST',
    }),

  // Scheduler
  getSchedules: () => fetchApi<ScheduleInfo[]>('/scheduler/schedules'),
  startScheduler: () =>
    fetchApi<{ success: boolean; message: string }>('/scheduler/start', {
      method: 'POST',
    }),
  stopScheduler: () =>
    fetchApi<{ success: boolean; message: string }>('/scheduler/stop', {
      method: 'POST',
    }),
  refreshSchedules: () =>
    fetchApi<{ success: boolean; message: string }>('/scheduler/refresh', {
      method: 'POST',
    }),
  updateTaskSchedule: (taskId: string, schedule: { enabled: boolean; time?: string; daysOfWeek?: number[] }) =>
    fetchApi<{ success: boolean; message: string }>(`/tasks/${taskId}/schedule`, {
      method: 'PUT',
      body: JSON.stringify(schedule),
    }),
  getExecutionOrder: () =>
    fetchApi<Array<{ id: string; cardTitle: string; priority: number }>>('/tasks/execution-order'),

  // Analytics
  getAnalyticsSummary: (days = 30) =>
    fetchApi<AnalyticsSummary>(`/analytics/summary?days=${days}`),
  getDailyStats: (days = 7) =>
    fetchApi<DailyStats[]>(`/analytics/daily?days=${days}`),
  getTaskStats: () =>
    fetchApi<TaskStats[]>('/analytics/tasks'),
  getRecentSessions: (limit = 10) =>
    fetchApi<SessionSummary[]>(`/analytics/sessions?limit=${limit}`),
  exportAnalytics: () => `${API_BASE}/analytics/export`,
  cleanupAnalytics: (daysToKeep = 90) =>
    fetchApi<{ success: boolean; deletedRecords: number }>('/analytics/cleanup', {
      method: 'POST',
      body: JSON.stringify({ daysToKeep }),
    }),
};
