import { useEffect, useRef, useSyncExternalStore } from 'react';
import { LogEntry, TaskResult } from '../types';

interface WebSocketMessage {
  type: 'log' | 'taskStatus';
  data: LogEntry | TaskResult;
}

type LogCallback = (entry: LogEntry) => void;
type TaskStatusCallback = (result: TaskResult) => void;

// Reconnection config
const RECONNECT_CONFIG = {
  BASE_DELAY: 1000, // 1 second
  MAX_DELAY: 30000, // 30 seconds max
  MAX_ATTEMPTS: 100, // Essentially infinite for long-running app
};

// Singleton WebSocket manager - single callback (replaces on HMR)
let globalWs: WebSocket | null = null;
let globalConnected = false;
let reconnectAttempts = 0;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let onLogCallback: LogCallback | null = null;
let onTaskStatusCallback: TaskStatusCallback | null = null;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(listener => listener());
}

function getWsUrl() {
  const isFileProtocol = window.location.protocol === 'file:';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = isFileProtocol ? 'localhost' : (window.location.hostname || 'localhost');
  return `${protocol}//${host}:3001`;
}

function getReconnectDelay(): number {
  // Exponential backoff: 1s, 2s, 4s, 8s... up to MAX_DELAY
  const delay = Math.min(
    RECONNECT_CONFIG.BASE_DELAY * Math.pow(2, reconnectAttempts),
    RECONNECT_CONFIG.MAX_DELAY
  );
  return delay;
}

function scheduleReconnect() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }

  if (reconnectAttempts >= RECONNECT_CONFIG.MAX_ATTEMPTS) {
    console.error('WebSocket: Max reconnect attempts reached');
    return;
  }

  const delay = getReconnectDelay();
  console.log(`WebSocket: Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1})`);

  reconnectTimeout = setTimeout(() => {
    reconnectAttempts++;
    connect();
  }, delay);
}

function connect() {
  if (globalWs?.readyState === WebSocket.OPEN || globalWs?.readyState === WebSocket.CONNECTING) {
    return;
  }

  try {
    const ws = new WebSocket(getWsUrl());

    ws.onopen = () => {
      console.log('WebSocket connected');
      globalConnected = true;
      reconnectAttempts = 0; // Reset on successful connection
      notifyListeners();
    };

    ws.onclose = (event) => {
      console.log(`WebSocket disconnected (code: ${event.code})`);
      globalConnected = false;
      globalWs = null;
      notifyListeners();

      // Auto-reconnect with backoff
      scheduleReconnect();
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      // onclose will handle reconnection
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        if (message.type === 'log' && onLogCallback) {
          onLogCallback(message.data as LogEntry);
        } else if (message.type === 'taskStatus' && onTaskStatusCallback) {
          onTaskStatusCallback(message.data as TaskResult);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    globalWs = ws;
  } catch (error) {
    console.error('WebSocket connection failed:', error);
    scheduleReconnect();
  }
}

function disconnect() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (globalWs) {
    globalWs.close();
    globalWs = null;
  }
  globalConnected = false;
  reconnectAttempts = 0;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    connect();
  }
  return () => {
    listeners.delete(listener);
    // Don't disconnect when all listeners removed - keep connection alive
  };
}

function getSnapshot() {
  return globalConnected;
}

/**
 * Force reconnection (can be called from UI if needed)
 */
export function forceReconnect() {
  disconnect();
  reconnectAttempts = 0;
  connect();
}

/**
 * Get current reconnect attempt count
 */
export function getReconnectAttempts() {
  return reconnectAttempts;
}

export function useWebSocket(
  onLog: LogCallback,
  onTaskStatus: TaskStatusCallback
) {
  const connected = useSyncExternalStore(subscribe, getSnapshot);

  // Keep callbacks in refs to avoid stale closures
  const onLogRef = useRef(onLog);
  const onTaskStatusRef = useRef(onTaskStatus);

  useEffect(() => {
    onLogRef.current = onLog;
    onTaskStatusRef.current = onTaskStatus;
  });

  // Register callbacks - single instance, replaced on each mount
  useEffect(() => {
    onLogCallback = (entry) => onLogRef.current(entry);
    onTaskStatusCallback = (result) => onTaskStatusRef.current(result);

    return () => {
      onLogCallback = null;
      onTaskStatusCallback = null;
    };
  }, []);

  return {
    connected,
    reconnect: forceReconnect,
    reconnectAttempts: getReconnectAttempts(),
  };
}
