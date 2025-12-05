import { Task, TaskResult } from '../types';

interface SessionReportProps {
	tasks: Task[];
	taskResults: Map<string, TaskResult>;
	onClose: () => void;
}

export function SessionReport({ tasks, taskResults, onClose }: SessionReportProps) {
	const enabledTasks = tasks.filter(t => t.enabled);

	const stats = {
		total: enabledTasks.length,
		completed: 0,
		failed: 0,
		skipped: 0,
		totalRepeats: 0,
		completedRepeats: 0,
	};

	enabledTasks.forEach(task => {
		const result = taskResults.get(task.id);
		if (result) {
			if (result.status === 'completed') stats.completed++;
			else if (result.status === 'failed') stats.failed++;
			else if (result.status === 'skipped') stats.skipped++;
			stats.totalRepeats += result.totalRepeats;
			stats.completedRepeats += result.completedRepeats;
		}
	});

	const successRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

	return (
		<div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
			<div className="bg-[#131820] border border-ea-border rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
				{/* Header */}
				<div className="px-6 py-4 border-b border-ea-border flex items-center justify-between">
					<div>
						<h2 className="text-lg font-semibold text-white">Session Report</h2>
						<p className="text-xs text-gray-500 mt-0.5">
							{new Date().toLocaleString()}
						</p>
					</div>
					<button
						onClick={onClose}
						className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
					>
						✕
					</button>
				</div>

				{/* Summary Cards */}
				<div className="p-6 border-b border-ea-border">
					<div className="grid grid-cols-4 gap-4">
						<div className="bg-gray-900/50 rounded-lg p-4 text-center">
							<div className="text-2xl font-bold text-white">{stats.total}</div>
							<div className="text-xs text-gray-500 mt-1">Total Tasks</div>
						</div>
						<div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 text-center">
							<div className="text-2xl font-bold text-emerald-400">{stats.completed}</div>
							<div className="text-xs text-emerald-400/70 mt-1">Completed</div>
						</div>
						<div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
							<div className="text-2xl font-bold text-red-400">{stats.failed}</div>
							<div className="text-xs text-red-400/70 mt-1">Failed</div>
						</div>
						<div className="bg-gray-500/10 border border-gray-500/30 rounded-lg p-4 text-center">
							<div className="text-2xl font-bold text-gray-400">{stats.skipped}</div>
							<div className="text-xs text-gray-400/70 mt-1">Skipped</div>
						</div>
					</div>

					{/* Success Rate Bar */}
					<div className="mt-4">
						<div className="flex justify-between text-xs mb-1">
							<span className="text-gray-500">Success Rate</span>
							<span className="text-white font-medium">{successRate}%</span>
						</div>
						<div className="h-2 bg-gray-800 rounded-full overflow-hidden">
							<div
								className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-500"
								style={{ width: `${successRate}%` }}
							/>
						</div>
					</div>
				</div>

				{/* Task Table */}
				<div className="overflow-auto max-h-[40vh]">
					<table className="w-full">
						<thead className="bg-gray-900/50 sticky top-0">
							<tr>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Task
								</th>
								<th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
									Status
								</th>
								<th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
									Repeats
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Error
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-ea-border">
							{enabledTasks.map((task) => {
								const result = taskResults.get(task.id);
								const status = result?.status || 'pending';
								const statusColors: Record<string, string> = {
									completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
									failed: 'bg-red-500/20 text-red-400 border-red-500/30',
									skipped: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
									running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
									pending: 'bg-gray-700/50 text-gray-500 border-gray-600/30',
								};

								return (
									<tr key={task.id} className="hover:bg-gray-900/30">
										<td className="px-6 py-4">
											<div className="text-sm text-white">{task.cardTitle}</div>
											<div className="text-xs text-gray-500">{task.category}</div>
										</td>
										<td className="px-6 py-4 text-center">
											<span className={`inline-flex px-2 py-1 text-xs font-medium rounded border ${statusColors[status]}`}>
												{status.toUpperCase()}
											</span>
										</td>
										<td className="px-6 py-4 text-center">
											<span className="text-sm text-gray-300">
												{result ? `${result.completedRepeats}/${result.totalRepeats}` : '-'}
											</span>
										</td>
										<td className="px-6 py-4">
											{result?.error && (
												<span className="text-xs text-red-400 truncate block max-w-[200px]" title={result.error}>
													{result.error}
												</span>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>

				{/* Footer */}
				<div className="px-6 py-4 border-t border-ea-border flex justify-between items-center">
					<div className="text-xs text-gray-500">
						Total repeats: {stats.completedRepeats}/{stats.totalRepeats}
					</div>
					<button
						onClick={onClose}
						className="px-4 py-2 bg-ea-green text-black font-medium rounded hover:bg-ea-green/90 transition-colors"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	);
}
