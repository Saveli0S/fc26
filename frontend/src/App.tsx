import { useState, useEffect, useCallback, useRef } from 'react';
import { TaskList } from './components/TaskList';
import { TaskConfig } from './components/TaskConfig';
import { StatusLog } from './components/StatusLog';
import { SessionReport } from './components/SessionReport';
import { useWebSocket } from './hooks/useWebSocket';
import { api } from './hooks/useApi';
import { Config, LogEntry, TaskResult, AppStatus, Task, SquadBuilderRules } from './types';

function App() {
	const [config, setConfig] = useState<Config | null>(null);
	const [status, setStatus] = useState<AppStatus>({ browserInitialized: false, isRunning: false });
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [taskResults, setTaskResults] = useState<Map<string, TaskResult>>(new Map());
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showReport, setShowReport] = useState(false);
	const runningAllTasks = useRef(false);

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
		setLoading(true);
		setError(null);
		try {
			await api.login();
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
						disabled={loading || !status.browserInitialized}
						className={`px-4 py-2 rounded font-medium text-sm transition-all ${!status.browserInitialized
							? 'bg-gray-800 text-gray-500 cursor-not-allowed'
							: 'bg-ea-purple/10 text-ea-purple border border-ea-purple/30 hover:bg-ea-purple/20'
							}`}
					>
						Login to EA
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
		</div>
	);
}

export default App;
