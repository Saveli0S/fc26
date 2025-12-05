import { Config, Task, AppStatus } from '../types';

const API_BASE = '/api';

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
  login: () =>
    fetchApi<{ success: boolean; message: string }>('/browser/login', {
      method: 'POST',
    }),
  closeBrowser: () =>
    fetchApi<{ success: boolean; message: string }>('/browser/close', {
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
};
