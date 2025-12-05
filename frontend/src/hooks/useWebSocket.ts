import { useEffect, useRef, useCallback, useState } from 'react';
import { LogEntry, TaskResult } from '../types';

interface WebSocketMessage {
  type: 'log' | 'taskStatus';
  data: LogEntry | TaskResult;
}

export function useWebSocket(
  onLog: (entry: LogEntry) => void,
  onTaskStatus: (result: TaskResult) => void
) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = '3001'; // Backend port
    const wsUrl = `${protocol}//${host}:${port}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      // Reconnect after 3 seconds
      setTimeout(connect, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        if (message.type === 'log') {
          onLog(message.data as LogEntry);
        } else if (message.type === 'taskStatus') {
          onTaskStatus(message.data as TaskResult);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    wsRef.current = ws;
  }, [onLog, onTaskStatus]);

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { connected };
}
