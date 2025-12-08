import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { TaskRunner, TaskResult } from './automation/task-runner.js';
import { loadConfig, saveConfig, updateTask, addTask, removeTask, Config, Task, TaskSchedule } from './config/tasks.js';
import { ClubScraper } from './automation/club-scraper.js';
import { inventoryService } from './services/inventory.js';
import { getScheduler } from './services/scheduler.js';
import { getTaskQueue } from './services/task-queue.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Store connected clients
const clients = new Set<WebSocket>();

// Task runner instance
let taskRunner: TaskRunner | null = null;

// Club scraper instance
let clubScraper: ClubScraper | null = null;

// Broadcast log message to all connected clients
function broadcastLog(message: string, type: 'info' | 'error' | 'success' | 'warning' = 'info') {
  const payload = JSON.stringify({
    type: 'log',
    data: { message, logType: type, timestamp: new Date().toISOString() },
  });

  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Broadcast task status update
function broadcastTaskStatus(result: TaskResult) {
  const payload = JSON.stringify({
    type: 'taskStatus',
    data: result,
  });

  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Initialize scheduler with broadcast logging
const scheduler = getScheduler(broadcastLog);
const taskQueue = getTaskQueue(broadcastLog);

// Set up scheduler to run tasks
scheduler.setTaskRunner(async (taskId: string) => {
  if (!taskRunner) {
    broadcastLog('Scheduled task skipped: browser not initialized', 'warning');
    return;
  }
  if (taskRunner.getIsRunning()) {
    broadcastLog('Scheduled task skipped: another task is running', 'warning');
    return;
  }
  broadcastLog(`Running scheduled task: ${taskId}`, 'info');
  const result = await taskRunner.runSingleTask(taskId);
  if (result) {
    broadcastTaskStatus(result);
  }
});

// WebSocket connection handler
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('Client connected');

  ws.on('close', () => {
    clients.delete(ws);
    console.log('Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clients.delete(ws);
  });
});

// API Routes

// Get current config
app.get('/api/config', (req, res) => {
  try {
    const config = loadConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Update config
app.put('/api/config', (req, res) => {
  try {
    const config: Config = req.body;
    saveConfig(config);
    res.json({ success: true, config });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

// Get all tasks
app.get('/api/tasks', (req, res) => {
  try {
    const config = loadConfig();
    res.json(config.dailyTasks);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Update a task
app.patch('/api/tasks/:id', (req, res) => {
  try {
    const taskId = req.params.id;
    const updates = req.body;
    const config = updateTask(taskId, updates);

    // Refresh scheduler if schedule was updated
    if (updates.schedule !== undefined) {
      scheduler.refreshSchedules();
    }

    res.json({ success: true, config });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

// Add a new task
app.post('/api/tasks', (req, res) => {
  try {
    const task: Task = req.body;
    const config = addTask(task);
    res.json({ success: true, config });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

// Remove a task
app.delete('/api/tasks/:id', (req, res) => {
  try {
    const taskId = req.params.id;
    const config = removeTask(taskId);
    res.json({ success: true, config });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

// Initialize browser
app.post('/api/browser/init', async (req, res) => {
  try {
    if (taskRunner) {
      await taskRunner.close();
      taskRunner = null;
    }

    const runner = new TaskRunner(broadcastLog, broadcastTaskStatus);
    await runner.initialize();
    taskRunner = runner; // Only assign after successful initialization

    res.json({ success: true, message: 'Browser initialized' });
  } catch (error) {
    taskRunner = null; // Ensure taskRunner is null on failure
    res.status(500).json({ error: String(error) });
  }
});

// Login to EA
app.post('/api/browser/login', async (req, res) => {
  try {
    if (!taskRunner) {
      return res.status(400).json({ error: 'Browser not initialized' });
    }

    const { email, password } = req.body || {};
    const success = await taskRunner.login(email, password);
    res.json({ success, message: success ? 'Logged in successfully' : 'Login failed' });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Close browser
app.post('/api/browser/close', async (req, res) => {
  try {
    if (taskRunner) {
      await taskRunner.close();
      taskRunner = null;
    }
    res.json({ success: true, message: 'Browser closed' });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Run all tasks
app.post('/api/run/all', async (req, res) => {
  try {
    if (!taskRunner) {
      return res.status(400).json({ error: 'Browser not initialized' });
    }

    if (taskRunner.getIsRunning()) {
      return res.status(400).json({ error: 'Tasks already running' });
    }

    // Run tasks asynchronously
    res.json({ success: true, message: 'Started running all tasks' });

    const results = await taskRunner.runAllTasks();
    results.forEach(result => broadcastTaskStatus(result));

  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Run single task
app.post('/api/run/:taskId', async (req, res) => {
  try {
    if (!taskRunner) {
      return res.status(400).json({ error: 'Browser not initialized' });
    }

    if (taskRunner.getIsRunning()) {
      return res.status(400).json({ error: 'Tasks already running' });
    }

    const taskId = req.params.taskId;

    // Run task asynchronously
    res.json({ success: true, message: `Started running task: ${taskId}` });

    const result = await taskRunner.runSingleTask(taskId);
    if (result) {
      broadcastTaskStatus(result);
    }

  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Stop running tasks
app.post('/api/run/stop', (req, res) => {
  try {
    if (taskRunner) {
      taskRunner.stop();
    }
    res.json({ success: true, message: 'Stop signal sent' });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Emergency stop - stop all tasks, close browser, AND kill all servers
app.post('/api/shutdown', async (req, res) => {
  try {
    // Stop tasks and close browser first
    if (taskRunner) {
      taskRunner.stop();
      await taskRunner.close();
      taskRunner = null;
    }

    // Send response before killing servers
    res.json({ success: true, message: 'Shutting down all servers...' });

    // Kill all servers after a small delay to let response be sent
    setTimeout(async () => {
      const { exec } = await import('child_process');
      exec('kill $(lsof -ti:3001) 2>/dev/null; pkill -f "npm run dev:backend" 2>/dev/null; pkill -f "npm run dev:frontend" 2>/dev/null', (error) => {
        if (error) {
          console.log('Shutdown command completed (some processes may have already been stopped)');
        }
      });
    }, 100);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get runner status
app.get('/api/status', (req, res) => {
  res.json({
    browserInitialized: taskRunner !== null,
    isRunning: taskRunner?.getIsRunning() || false,
    schedulerRunning: scheduler.getIsRunning(),
  });
});

// Browser health check
app.get('/api/browser/health', async (req, res) => {
  try {
    if (!taskRunner) {
      return res.json({ healthy: false, reason: 'Browser not initialized' });
    }

    const healthy = await taskRunner.checkHealth();
    res.json({
      healthy,
      reason: healthy ? 'Browser is responsive' : 'Browser may be unresponsive',
    });
  } catch (error) {
    res.json({ healthy: false, reason: String(error) });
  }
});

// Dismiss modals (recovery action)
app.post('/api/browser/dismiss-modals', async (req, res) => {
  try {
    if (!taskRunner) {
      return res.status(400).json({ error: 'Browser not initialized' });
    }

    await taskRunner.dismissModals();
    res.json({ success: true, message: 'Modal dismiss attempted' });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// Scheduler API
// ============================================================================

// Get active schedules
app.get('/api/scheduler/schedules', (req, res) => {
  try {
    const schedules = scheduler.getActiveSchedules();
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Start scheduler
app.post('/api/scheduler/start', (req, res) => {
  try {
    scheduler.initialize();
    res.json({ success: true, message: 'Scheduler started' });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Stop scheduler
app.post('/api/scheduler/stop', (req, res) => {
  try {
    scheduler.stop();
    res.json({ success: true, message: 'Scheduler stopped' });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Refresh schedules from config
app.post('/api/scheduler/refresh', (req, res) => {
  try {
    scheduler.refreshSchedules();
    res.json({ success: true, message: 'Schedules refreshed' });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Update task schedule directly
app.put('/api/tasks/:id/schedule', (req, res) => {
  try {
    const taskId = req.params.id;
    const { enabled, time, daysOfWeek } = req.body as { enabled: boolean; time?: string; daysOfWeek?: number[] };

    // Update task in config
    const schedule: TaskSchedule = {
      enabled,
      time,
      daysOfWeek: daysOfWeek || [0, 1, 2, 3, 4, 5, 6],
    };
    updateTask(taskId, { schedule });

    // Update scheduler
    scheduler.updateTaskSchedule(taskId, enabled, time, daysOfWeek);

    res.json({ success: true, message: 'Schedule updated' });
  } catch (error) {
    res.status(400).json({ error: String(error) });
  }
});

// Get task execution order (with priority/dependencies)
app.get('/api/tasks/execution-order', (req, res) => {
  try {
    const config = loadConfig();
    const enabledTasks = config.dailyTasks.filter((t) => t.enabled);
    const order = taskQueue.buildExecutionOrder(enabledTasks);
    res.json(order.map((t) => ({ id: t.id, cardTitle: t.cardTitle, priority: t.priority || 50 })));
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// ============================================================================
// Inventory API
// ============================================================================

// Get inventory summary
app.get('/api/inventory/summary', (req, res) => {
  try {
    const summary = inventoryService.getSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Get all cards (with optional filters)
app.get('/api/inventory/cards', (req, res) => {
  try {
    const { cardType, rarity } = req.query;
    const cards = inventoryService.getFiltered(
      cardType as string | undefined,
      rarity as string | undefined
    );
    res.json(cards);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Start inventory sync
app.post('/api/inventory/sync', async (req, res) => {
  try {
    if (!taskRunner) {
      return res.status(400).json({ error: 'Browser not initialized' });
    }

    if (inventoryService.isSyncInProgress()) {
      return res.status(400).json({ error: 'Sync already in progress' });
    }

    if (taskRunner.getIsRunning()) {
      return res.status(400).json({ error: 'Cannot sync while tasks are running' });
    }

    // Create scraper with browser manager from task runner
    clubScraper = new ClubScraper(taskRunner.getBrowserManager(), broadcastLog);

    // Send response before starting sync
    res.json({ success: true, message: 'Starting inventory sync...' });

    // Run sync asynchronously
    await clubScraper.syncInventory();
    clubScraper = null;

  } catch (error) {
    clubScraper = null;
    res.status(500).json({ error: String(error) });
  }
});

// Stop inventory sync
app.post('/api/inventory/sync/stop', (req, res) => {
  try {
    if (clubScraper) {
      clubScraper.stop();
    }
    res.json({ success: true, message: 'Stop signal sent' });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket available on ws://localhost:${PORT}`);

  // Initialize scheduler on startup
  scheduler.initialize();
  console.log('Scheduler initialized');
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  scheduler.stop();
  if (taskRunner) {
    await taskRunner.close();
  }
  process.exit(0);
});
