import { Task, TaskResult } from '../types';

interface TaskListProps {
	tasks: Task[];
	taskResults: Map<string, TaskResult>;
	onToggleTask: (taskId: string, enabled: boolean) => void;
	onRunTask: (taskId: string) => void;
	isRunning: boolean;
	browserReady: boolean;
}

export function TaskList({
	tasks,
	taskResults,
	onToggleTask,
	onRunTask,
	isRunning,
	browserReady,
}: TaskListProps) {
	const getStatusBadge = (taskId: string) => {
		const result = taskResults.get(taskId);
		if (!result) return null;

		const styles: Record<string, string> = {
			pending: 'bg-gray-700 text-gray-300',
			running: 'bg-ea-blue/20 text-ea-blue border border-ea-blue/30',
			completed: 'bg-ea-green/20 text-ea-green border border-ea-green/30',
			failed: 'bg-ea-red/20 text-ea-red border border-ea-red/30',
			skipped: 'bg-gray-700 text-gray-400',
		};

		return (
			<span className={`px-2 py-0.5 rounded text-xs ${styles[result.status]}`}>
				{result.status}
				{result.status === 'running' && (
					<span className="ml-1">
						({result.completedRepeats}/{result.totalRepeats})
					</span>
				)}
			</span>
		);
	};

	return (
		<div className="bg-[#131820] border border-ea-border rounded-lg overflow-hidden">
			<div className="px-4 py-3 border-b border-ea-border">
				<h3 className="text-sm font-medium text-gray-300">Tasks</h3>
			</div>

			<div className="divide-y divide-ea-border">
				{tasks.length === 0 ? (
					<div className="p-8 text-center text-gray-500">
						No tasks configured. Add tasks in tasks.config.json
					</div>
				) : (
					tasks.map((task) => (
						<div
							key={task.id}
							className={`p-4 flex items-center gap-4 transition-colors ${task.enabled ? 'bg-transparent' : 'bg-gray-900/50'
								}`}
						>
							{/* Enable/Disable Toggle */}
							<button
								onClick={() => onToggleTask(task.id, !task.enabled)}
								className={`relative w-10 h-5 rounded-full transition-colors ${task.enabled ? 'bg-ea-green' : 'bg-gray-700'
									}`}
							>
								<div
									className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${task.enabled ? 'translate-x-5' : 'translate-x-0.5'
										}`}
								/>
							</button>

							{/* Task Info */}
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span
										className={`font-medium ${task.enabled ? 'text-white' : 'text-gray-500'
											}`}
									>
										{task.cardTitle}
									</span>
									{getStatusBadge(task.id)}
								</div>
								<div className="text-xs text-gray-500 mt-0.5">
									{task.category} • {task.repeatCount}x repeat
								</div>
							</div>

							{/* Run Button */}
							<button
								onClick={() => onRunTask(task.id)}
								disabled={!browserReady || isRunning || !task.enabled}
								className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${!browserReady || isRunning || !task.enabled
										? 'bg-gray-800 text-gray-600 cursor-not-allowed'
										: 'bg-ea-green/10 text-ea-green border border-ea-green/30 hover:bg-ea-green/20'
									}`}
							>
								Run
							</button>
						</div>
					))
				)}
			</div>
		</div>
	);
}
