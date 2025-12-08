import { useState, useEffect } from 'react';
import { api } from '../hooks/useApi';
import { AnalyticsSummary } from '../types';

// Simple bar chart using CSS
function MiniBarChart({ data, maxValue, color }: { data: number[]; maxValue: number; color: string }) {
	return (
		<div className="flex items-end gap-1 h-16">
			{data.map((value, i) => (
				<div
					key={i}
					className="flex-1 rounded-t transition-all"
					style={{
						height: `${maxValue > 0 ? (value / maxValue) * 100 : 0}%`,
						backgroundColor: color,
						minHeight: value > 0 ? '4px' : '0',
					}}
					title={`${value}`}
				/>
			))}
		</div>
	);
}

// Format duration
function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	const mins = Math.floor(ms / 60000);
	const secs = Math.floor((ms % 60000) / 1000);
	return `${mins}m ${secs}s`;
}

// Format date
function formatDate(dateStr: string): string {
	const date = new Date(dateStr);
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr: string): string {
	const date = new Date(dateStr);
	return date.toLocaleString('en-US', {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

export function StatsDashboard() {
	const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [timeRange, setTimeRange] = useState(30);

	useEffect(() => {
		loadData();
	}, [timeRange]);

	const loadData = async () => {
		setLoading(true);
		setError(null);
		try {
			const data = await api.getAnalyticsSummary(timeRange);
			setSummary(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load analytics');
		} finally {
			setLoading(false);
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="text-gray-500">Loading analytics...</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="p-4 bg-ea-red/10 border border-ea-red/30 rounded-lg text-ea-red">
				{error}
				<button onClick={loadData} className="ml-4 underline">
					Retry
				</button>
			</div>
		);
	}

	if (!summary) return null;

	const maxDailyTasks = Math.max(...summary.dailyStats.map(d => d.tasksCompleted + d.tasksFailed), 1);

	return (
		<div className="space-y-6">
			{/* Time Range Selector */}
			<div className="flex items-center justify-between">
				<h2 className="text-lg font-semibold text-white">Analytics Dashboard</h2>
				<div className="flex gap-2">
					{[7, 14, 30].map((days) => (
						<button
							key={days}
							onClick={() => setTimeRange(days)}
							className={`px-3 py-1 rounded text-sm transition-all ${timeRange === days
									? 'bg-ea-blue text-white'
									: 'bg-gray-800 text-gray-400 hover:bg-gray-700'
								}`}
						>
							{days}d
						</button>
					))}
					<button
						onClick={loadData}
						className="px-3 py-1 rounded text-sm bg-gray-800 text-gray-400 hover:bg-gray-700 transition-all"
					>
						↻
					</button>
				</div>
			</div>

			{/* Overview Cards */}
			<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
				<div className="bg-[#131820] border border-ea-border rounded-lg p-4">
					<div className="text-3xl font-bold text-white">{summary.totalSessions}</div>
					<div className="text-xs text-gray-500 mt-1">Sessions</div>
				</div>
				<div className="bg-[#131820] border border-ea-border rounded-lg p-4">
					<div className="text-3xl font-bold text-ea-green">{summary.totalTasksRun}</div>
					<div className="text-xs text-gray-500 mt-1">Tasks Run</div>
				</div>
				<div className="bg-[#131820] border border-ea-border rounded-lg p-4">
					<div className="text-3xl font-bold text-ea-blue">{summary.totalRepeatsCompleted}</div>
					<div className="text-xs text-gray-500 mt-1">Repeats Done</div>
				</div>
				<div className="bg-[#131820] border border-ea-border rounded-lg p-4">
					<div className="text-3xl font-bold" style={{ color: summary.overallSuccessRate >= 80 ? '#22c55e' : summary.overallSuccessRate >= 50 ? '#f59e0b' : '#ef4444' }}>
						{summary.overallSuccessRate}%
					</div>
					<div className="text-xs text-gray-500 mt-1">Success Rate</div>
				</div>
			</div>

			{/* Daily Activity Chart */}
			<div className="bg-[#131820] border border-ea-border rounded-lg p-4">
				<h3 className="text-sm font-medium text-gray-300 mb-4">Daily Activity</h3>
				{summary.dailyStats.length > 0 ? (
					<>
						<MiniBarChart
							data={summary.dailyStats.map(d => d.tasksCompleted)}
							maxValue={maxDailyTasks}
							color="#22c55e"
						/>
						<div className="flex justify-between mt-2 text-xs text-gray-600">
							{summary.dailyStats.map((d, i) => (
								<span key={i} className="flex-1 text-center truncate">
									{formatDate(d.date)}
								</span>
							))}
						</div>
						<div className="flex items-center gap-4 mt-3 text-xs">
							<span className="flex items-center gap-1">
								<div className="w-3 h-3 rounded bg-ea-green" />
								<span className="text-gray-500">Completed</span>
							</span>
							<span className="text-gray-500">
								Total: {summary.dailyStats.reduce((sum, d) => sum + d.tasksCompleted, 0)} tasks
							</span>
						</div>
					</>
				) : (
					<div className="text-center text-gray-500 py-8">No data for this period</div>
				)}
			</div>

			{/* Task Performance */}
			<div className="bg-[#131820] border border-ea-border rounded-lg p-4">
				<h3 className="text-sm font-medium text-gray-300 mb-4">Task Performance</h3>
				{summary.taskStats.length > 0 ? (
					<div className="space-y-3">
						{summary.taskStats.slice(0, 8).map((task) => (
							<div key={task.taskId} className="flex items-center gap-3">
								<div className="flex-1 min-w-0">
									<div className="text-sm text-white truncate">{task.taskName}</div>
									<div className="text-xs text-gray-500">
										{task.totalExecutions} runs • {formatDuration(task.avgDurationMs)} avg
									</div>
								</div>
								<div className="flex items-center gap-2">
									<div className="w-20 h-2 bg-gray-800 rounded-full overflow-hidden">
										<div
											className="h-full bg-ea-green rounded-full transition-all"
											style={{ width: `${task.successRate}%` }}
										/>
									</div>
									<span className="text-xs text-gray-400 w-10 text-right">{task.successRate}%</span>
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="text-center text-gray-500 py-8">No task data yet</div>
				)}
			</div>

			{/* Recent Sessions */}
			<div className="bg-[#131820] border border-ea-border rounded-lg p-4">
				<h3 className="text-sm font-medium text-gray-300 mb-4">Recent Sessions</h3>
				{summary.recentSessions.length > 0 ? (
					<div className="space-y-2">
						{summary.recentSessions.map((session) => (
							<div
								key={session.id}
								className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg"
							>
								<div>
									<div className="text-sm text-white">
										{formatDateTime(session.startedAt)}
									</div>
									<div className="text-xs text-gray-500">
										Duration: {formatDuration(session.durationMs)}
									</div>
								</div>
								<div className="flex items-center gap-3">
									<div className="text-right">
										<div className="flex items-center gap-2 text-sm">
											<span className="text-ea-green">{session.completedTasks}✓</span>
											{session.failedTasks > 0 && (
												<span className="text-ea-red">{session.failedTasks}✗</span>
											)}
											{session.skippedTasks > 0 && (
												<span className="text-gray-500">{session.skippedTasks}⊘</span>
											)}
										</div>
										<div className="text-xs text-gray-500">
											{session.completedRepeats}/{session.totalRepeats} repeats
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="text-center text-gray-500 py-8">No sessions recorded yet</div>
				)}
			</div>

			{/* Export Button */}
			<div className="flex justify-end">
				<a
					href={api.exportAnalytics()}
					download
					className="px-4 py-2 rounded text-sm bg-gray-800 text-gray-300 hover:bg-gray-700 transition-all"
				>
					📥 Export Data
				</a>
			</div>
		</div>
	);
}
