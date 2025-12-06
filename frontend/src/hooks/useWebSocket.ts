import { useEffect, useRef, useSyncExternalStore } from 'react';
import { LogEntry, TaskResult } from '../types';

interface WebSocketMessage {
  type: 'log' | 'taskStatus';
  data: LogEntry | TaskResult;
}

type LogCallback = (entry: LogEntry) => void;
type TaskStatusCallback = (result: TaskResult) => void;

// Singleton WebSocket manager - single callback (replaces on HMR)
let globalWs: WebSocket | null = null;
let globalConnected = false;
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

function connect() {
  if (globalWs?.readyState === WebSocket.OPEN || globalWs?.readyState === WebSocket.CONNECTING) {
    return;
  }

  const ws = new WebSocket(getWsUrl());

  ws.onopen = () => {
    console.log('WebSocket connected');
    globalConnected = true;
    notifyListeners();
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    globalConnected = false;
    globalWs = null;
    notifyListeners();
    // Reconnect after 3 seconds
    setTimeout(connect, 3000);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
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
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    connect();
  }
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return globalConnected;
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

  return { connected };
}
