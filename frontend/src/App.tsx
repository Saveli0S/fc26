import { useState, useEffect, useCallback, useRef } from 'react';
import { TaskList } from './components/TaskList';
import { TaskConfig } from './components/TaskConfig';
import { StatusLog } from './components/StatusLog';
import { SessionReport } from './components/SessionReport';
import { InventoryDialog } from './components/InventoryDialog';
import { useWebSocket } from './hooks/useWebSocket';
import { api } from './hooks/useApi';
import { Config, LogEntry, TaskResult, AppStatus, Task, SquadBuilderRules, InventorySummary, TaskSchedule } from './types';

// Check if running in Electron with secure storage
const isElectron = !!window.electronAPI?.credentials;

// Secure credential helpers
const secureCredentials = {
	async get() {
		if (isElectron) {
			return window.electronAPI!.credentials.get();
		}
		// Fallback to localStorage for dev/browser mode
		return {
			email: localStorage.getItem('fc26_ea_email') || '',
			password: localStorage.getItem('fc26_ea_password') || '',
			remember: localStorage.getItem('fc26_remember_credentials') === 'true',
		};
	},
	async set(creds: { email: string; password: string; remember: boolean }) {
		if (isElectron) {
			return window.electronAPI!.credentials.set(creds);
		}
		// Fallback to localStorage for dev/browser mode
		if (creds.remember) {
			localStorage.setItem('fc26_ea_email', creds.email);
			localStorage.setItem('fc26_ea_password', creds.password);
			localStorage.setItem('fc26_remember_credentials', 'true');
		} else {
			localStorage.removeItem('fc26_ea_email');
			localStorage.removeItem('fc26_ea_password');
			localStorage.removeItem('fc26_remember_credentials');
		}
		return { success: true };
	},
	async clear() {
		if (isElectron) {
			return window.electronAPI!.credentials.clear();
		}
		localStorage.removeItem('fc26_ea_email');
		localStorage.removeItem('fc26_ea_password');
		localStorage.removeItem('fc26_remember_credentials');
		return { success: true };
	},
};

function App() {
	const [config, setConfig] = useState<Config | null>(null);
	const [status, setStatus] = useState<AppStatus>({ browserInitialized: false, isRunning: false });
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [taskResults, setTaskResults] = useState<Map<string, TaskResult>>(new Map());
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showReport, setShowReport] = useState(false);
	const runningAllTasks = useRef(false);

	// Credentials state
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [rememberCredentials, setRememberCredentials] = useState(false);
	const [credentialsLoaded, setCredentialsLoaded] = useState(false);

	// Inventory state
	const [showInventory, setShowInventory] = useState(false);
	const [inventorySummary, setInventorySummary] = useState<InventorySummary | null>(null);
	const [syncingInventory, setSyncingInventory] = useState(false);

	// Load credentials from secure storage on mount
	useEffect(() => {
		secureCredentials.get().then((creds) => {
			setEmail(creds.email);
			setPassword(creds.password);
			setRememberCredentials(creds.remember);
			setCredentialsLoaded(true);
		});
	}, []);

	// Save credentials to secure storage when remember is enabled
	useEffect(() => {
		if (!credentialsLoaded) return; // Don't save until initial load complete
		if (rememberCredentials) {
			secureCredentials.set({ email, password, remember: true });
		}
	}, [email, password, rememberCredentials, credentialsLoaded]);

	// Save/clear credentials when remember checkbox changes
	const handleRememberChange = (checked: boolean) => {
		setRememberCredentials(checked);
		if (checked) {
			secureCredentials.set({ email, password, remember: true });
		} else {
			secureCredentials.clear();
		}
	};

	// Update email state
	const handleEmailChange = (value: string) => {
		setEmail(value);
	};

	// Update password state
	const handlePasswordChange = (value: string) => {
		setPassword(value);
	};

	// WebSocket handlers
	const handleLog = useCallback((entry: LogEntry) => {
		setLogs((prev) => [...prev.slice(-500), entry]); // Keep last 500 logs
	}, []);

	const handleTaskStatus = useCallback((result: TaskResult) => {
		setTaskResults((prev) => {
			const newResults = new Map(prev).set(result.taskId, result);

			// Check if all enabled tasks are complete (when running all)
			if (runningAllTasks.current && config) {
				const enabledTasks = config.dailyTasks.filter(t => t.enabled);
				const allDone = enabledTasks.every(task => {
					const r = newResults.get(task.id);
					return r && (r.status === 'completed' || r.status === 'failed' || r.status === 'skipped');
				});

				if (allDone && enabledTasks.length > 0) {
					// Show report after a short delay
					setTimeout(() => {
						setShowReport(true);
						setStatus(prev => ({ ...prev, isRunning: false }));
						runningAllTasks.current = false;
					}, 500);
				}
			}

			return newResults;
		});
	}, [config]);

	const { connected } = useWebSocket(handleLog, handleTaskStatus);

	// Load initial data
	useEffect(() => {
		loadConfig();
		loadStatus();
	}, []);

	const loadConfig = async () => {
		try {
			const data = await api.getConfig();
			setConfig(data);
		} catch (err) {
			setError('Failed to load config');
			console.error(err);
		}
	};

	const loadStatus = async () => {
		try {
			const data = await api.getStatus();
			setStatus(data);
		} catch (err) {
			console.error('Failed to load status:', err);
		}
	};

	const handleInitBrowser = async () => {
		setLoading(true);
		setError(null);
		try {
			await api.initBrowser();
			await loadStatus();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to initialize browser');
		} finally {
			setLoading(false);
		}
	};

	const handleLogin = async () => {
		if (!email || !password) {
			setError('Please enter email and password');
			return;
		}
		setLoading(true);
		setError(null);
		try {
			await api.login({ email, password });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to login');
		} finally {
			setLoading(false);
		}
	};

	const handleCloseBrowser = async () => {
		setLoading(true);
		try {
			await api.closeBrowser();
			await loadStatus();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to close browser');
		} finally {
			setLoading(false);
		}
	};

	const handleRunAll = async () => {
		setError(null);
		setShowReport(false);
		// Clear previous results for enabled tasks
		if (config) {
			const newResults = new Map(taskResults);
			config.dailyTasks.filter(t => t.enabled).forEach(task => {
				newResults.delete(task.id);
			});
			setTaskResults(newResults);
		}
		runningAllTasks.current = true;
		try {
			await api.runAll();
			setStatus((prev) => ({ ...prev, isRunning: true }));
		} catch (err) {
			runningAllTasks.current = false;
			setError(err instanceof Error ? err.message : 'Failed to run tasks');
		}
	};

	const handleRunTask = async (taskId: string) => {
		setError(null);
		try {
			await api.runTask(taskId);
			setStatus((prev) => ({ ...prev, isRunning: true }));
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to run task');
		}
	};

	const handleStop = async () => {
		try {
			await api.stop();
			setStatus((prev) => ({ ...prev, isRunning: false }));
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to stop');
		}
	};

	const handleToggleTask = async (taskId: string, enabled: boolean) => {
		try {
			await api.updateTask(taskId, { enabled });
			await loadConfig();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to update task');
		}
	};

	const handleShutdown = async () => {
		setLoading(true);
		try {
			await api.shutdown();
			setStatus({ browserInitialized: false, isRunning: false });
			runningAllTasks.current = false;
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to shutdown');
		} finally {
			setLoading(false);
		}
	};

	const handleUpdateRepeatCount = async (taskId: string, repeatCount: number) => {
		try {
			await api.updateTask(taskId, { repeatCount });
			await loadConfig();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to update repeat count');
		}
	};

	const handleUpdateRules = async (rules: SquadBuilderRules) => {
		if (!config) return;
		try {
			const newConfig = { ...config, squadBuilderRules: rules };
			await api.updateConfig(newConfig);
			setConfig(newConfig);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to update rules');
		}
	};

	const handleAddTask = async (task: Task) => {
		try {
			await api.addTask(task);
			await loadConfig();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to add task');
		}
	};

	const handleUpdateSchedule = async (taskId: string, schedule: TaskSchedule) => {
		try {
			await api.updateTaskSchedule(taskId, {
				enabled: schedule.enabled,
				time: schedule.time,
				daysOfWeek: schedule.daysOfWeek,
			});
			await loadConfig();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to update schedule');
		}
	};

	// Inventory handlers
	const loadInventorySummary = async () => {
		try {
			const summary = await api.getInventorySummary();
			setInventorySummary(summary);
		} catch (err) {
			console.error('Failed to load inventory summary:', err);
		}
	};

	const handleSyncInventory = async () => {
		setError(null);
		setSyncingInventory(true);
		try {
			await api.syncInventory();
			// Summary will be updated via logs - no need to poll here
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to start inventory sync');
		}
	};

	const handleStopSync = async () => {
		try {
			await api.stopSync();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to stop sync');
		}
	};

	// Load inventory summary on mount and after sync
	useEffect(() => {
		loadInventorySummary();
	}, []);

	// Detect when sync completes by watching logs
	useEffect(() => {
		const lastLog = logs[logs.length - 1];
		if (lastLog && lastLog.message.includes('Sync Complete')) {
			setSyncingInventory(false);
			loadInventorySummary();
		}
		if (lastLog && (lastLog.message.includes('Sync failed') || lastLog.message.includes('Sync stopped'))) {
			setSyncingInventory(false);
		}
	}, [logs]);

	// Refresh inventory count when cards are exchanged (removed from inventory)
	useEffect(() => {
		const lastLog = logs[logs.length - 1];
		if (lastLog && lastLog.message.includes('Inventory updated: removed')) {
			loadInventorySummary();
		}
	}, [logs]);

	return (
		<div className="min-h-screen bg-[#0a0e14]">
			{/* Header */}
			<header className="border-b border-ea-border bg-[#0d1117]">
				<div className="max-w-7xl mx-auto px-6 py-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="w-10 h-10 rounded-lg bg-gradient-to-br from-ea-green to-emerald-600 flex items-center justify-center">
								<span className="text-xl font-bold text-white">⚽</span>
							</div>
							<div>
								<h1 className="text-lg font-semibold text-white">FC26 SBC Automation</h1>
								<p className="text-xs text-gray-500">Automated Squad Building Challenges</p>
							</div>
						</div>

						<div className="flex items-center gap-3">
							{/* Kill Switch */}
							<button
								onClick={handleShutdown}
								disabled={loading}
								className="px-4 py-2 rounded-lg font-bold text-sm uppercase tracking-wide transition-all bg-red-600 text-white hover:bg-red-500 shadow-lg shadow-red-600/30 active:scale-95 disabled:opacity-50"
							>
								⚡ Kill All
							</button>

							{/* Scheduler Status */}
							<div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-900 border border-ea-border">
								<div
									className={`w-2 h-2 rounded-full ${status.schedulerRunning ? 'bg-violet-500' : 'bg-gray-600'
										}`}
								/>
								<span className="text-xs text-gray-400">
									{status.schedulerRunning ? 'Scheduler On' : 'Scheduler Off'}
								</span>
							</div>

							{/* Connection Status */}
							<div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-900 border border-ea-border">
								<div
									className={`w-2 h-2 rounded-full ${connected ? 'bg-ea-green' : 'bg-ea-red'
										}`}
								/>
								<span className="text-xs text-gray-400">
									{connected ? 'Connected' : 'Disconnected'}
								</span>
							</div>
						</div>
					</div>
				</div>
			</header>

			{/* Main Content */}
			<main className="max-w-7xl mx-auto px-6 py-6">
				{/* Error Banner */}
				{error && (
					<div className="mb-6 p-4 bg-ea-red/10 border border-ea-red/30 rounded-lg text-ea-red text-sm">
						{error}
						<button
							onClick={() => setError(null)}
							className="ml-4 text-ea-red/70 hover:text-ea-red"
						>
							Dismiss
						</button>
					</div>
				)}

				{/* EA Credentials */}
				<div className="mb-6 p-4 bg-[#131820] border border-ea-border rounded-lg">
					<div className="flex items-center gap-2 mb-3">
						<span className="text-sm font-medium text-gray-300">🔐 EA Account Credentials</span>
					</div>
					<div className="flex flex-wrap items-end gap-4">
						<div className="flex-1 min-w-[200px]">
							<label className="block text-xs text-gray-500 mb-1">Email</label>
							<input
								type="email"
								value={email}
								onChange={(e) => handleEmailChange(e.target.value)}
								placeholder="your@email.com"
								className="w-full px-3 py-2 bg-[#0a0e14] border border-ea-border rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:border-ea-blue"
							/>
						</div>
						<div className="flex-1 min-w-[200px]">
							<label className="block text-xs text-gray-500 mb-1">Password</label>
							<input
								type="password"
								value={password}
								onChange={(e) => handlePasswordChange(e.target.value)}
								placeholder="••••••••"
								className="w-full px-3 py-2 bg-[#0a0e14] border border-ea-border rounded text-sm text-white placeholder-gray-600 focus:outline-none focus:border-ea-blue"
							/>
						</div>
						<label className="flex items-center gap-2 cursor-pointer pb-2">
							<input
								type="checkbox"
								checked={rememberCredentials}
								onChange={(e) => handleRememberChange(e.target.checked)}
								className="w-4 h-4 rounded border-ea-border bg-[#0a0e14] text-ea-green focus:ring-ea-green focus:ring-offset-0"
							/>
							<span className="text-xs text-gray-400">Remember</span>
						</label>
					</div>
				</div>

				{/* Control Bar */}
				<div className="mb-6 flex flex-wrap items-center gap-3 p-4 bg-[#131820] border border-ea-border rounded-lg">
					<button
						onClick={handleInitBrowser}
						disabled={loading || status.browserInitialized}
						className={`px-4 py-2 rounded font-medium text-sm transition-all ${status.browserInitialized
							? 'bg-gray-800 text-gray-500 cursor-not-allowed'
							: 'bg-ea-blue/10 text-ea-blue border border-ea-blue/30 hover:bg-ea-blue/20'
							}`}
					>
						{loading ? 'Loading...' : status.browserInitialized ? '✓ Browser Ready' : 'Initialize Browser'}
					</button>

					<button
						onClick={handleLogin}
						disabled={loading || !status.browserInitialized || !email || !password}
						className={`px-4 py-2 rounded font-medium text-sm transition-all ${!status.browserInitialized || !email || !password
							? 'bg-gray-800 text-gray-500 cursor-not-allowed'
							: 'bg-ea-purple/10 text-ea-purple border border-ea-purple/30 hover:bg-ea-purple/20'
							}`}
					>
						Login to EA
					</button>

					{/* Inventory Buttons */}
					<div className="h-6 w-px bg-ea-border" />

					{syncingInventory ? (
						<button
							onClick={handleStopSync}
							className="px-4 py-2 rounded font-medium text-sm bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-all"
						>
							⏹ Stop Sync
						</button>
					) : (
						<button
							onClick={handleSyncInventory}
							disabled={!status.browserInitialized || status.isRunning}
							className={`px-4 py-2 rounded font-medium text-sm transition-all ${!status.browserInitialized || status.isRunning
								? 'bg-gray-800 text-gray-500 cursor-not-allowed'
								: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20'
								}`}
						>
							🔄 Sync Cards
						</button>
					)}

					<button
						onClick={() => setShowInventory(true)}
						className="px-4 py-2 rounded font-medium text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 transition-all flex items-center gap-2"
					>
						📦 Inventory
						{inventorySummary && inventorySummary.total > 0 && (
							<span className="px-1.5 py-0.5 rounded bg-ea-green/20 text-ea-green text-xs">
								{inventorySummary.total}
							</span>
						)}
					</button>

					<div className="flex-1" />

					{status.isRunning ? (
						<button
							onClick={handleStop}
							className="px-4 py-2 rounded font-medium text-sm bg-ea-red/10 text-ea-red border border-ea-red/30 hover:bg-ea-red/20 transition-all"
						>
							⏹ Stop
						</button>
					) : (
						<button
							onClick={handleRunAll}
							disabled={!status.browserInitialized}
							className={`px-4 py-2 rounded font-medium text-sm transition-all ${!status.browserInitialized
								? 'bg-gray-800 text-gray-500 cursor-not-allowed'
								: 'bg-ea-green text-black hover:bg-ea-green/90 animate-pulse-glow'
								}`}
						>
							▶ Run All Tasks
						</button>
					)}

					<button
						onClick={handleCloseBrowser}
						disabled={loading || !status.browserInitialized}
						className={`px-4 py-2 rounded font-medium text-sm transition-all ${!status.browserInitialized
							? 'bg-gray-800 text-gray-500 cursor-not-allowed'
							: 'bg-gray-800 text-gray-400 hover:bg-gray-700'
							}`}
					>
						Close Browser
					</button>
				</div>

				{/* Main Grid */}
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* Left Column - Tasks */}
					<div className="lg:col-span-2 space-y-6">
						{config && (
							<TaskList
								tasks={config.dailyTasks}
								taskResults={taskResults}
								onToggleTask={handleToggleTask}
								onUpdateRepeatCount={handleUpdateRepeatCount}
								onUpdateSchedule={handleUpdateSchedule}
								onRunTask={handleRunTask}
								isRunning={status.isRunning}
								browserReady={status.browserInitialized}
							/>
						)}

						<StatusLog logs={logs} onClearLogs={() => setLogs([])} />
					</div>

					{/* Right Column - Config */}
					<div>
						{config && (
							<TaskConfig
								rules={config.squadBuilderRules}
								onUpdateRules={handleUpdateRules}
								onAddTask={handleAddTask}
							/>
						)}
					</div>
				</div>
			</main>

			{/* Footer */}
			<footer className="border-t border-ea-border mt-12 py-6 text-center text-xs text-gray-600">
				FC26 SBC Automation Tool • Use responsibly
			</footer>

			{/* Session Report Modal */}
			{showReport && config && (
				<SessionReport
					tasks={config.dailyTasks}
					taskResults={taskResults}
					onClose={() => setShowReport(false)}
				/>
			)}

			{/* Inventory Dialog */}
			{showInventory && (
				<InventoryDialog onClose={() => setShowInventory(false)} />
			)}
		</div>
	);
}

export default App;
