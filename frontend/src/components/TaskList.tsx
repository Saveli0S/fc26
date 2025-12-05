import { useState } from 'react';
import { Task, TaskResult, TaskType, TaskTypeType } from '../types';

interface TaskListProps {
	tasks: Task[];
	taskResults: Map<string, TaskResult>;
	onToggleTask: (taskId: string, enabled: boolean) => void;
	onUpdateRepeatCount: (taskId: string, repeatCount: number) => void;
	onRunTask: (taskId: string) => void;
	isRunning: boolean;
	browserReady: boolean;
}

// Task type colors mapped to enum values
const taskTypeColors: Record<TaskTypeType, { borderColor: string; text: string; badge: string; header: string }> = {
	[TaskType.Daily]: {
		borderColor: '#10b981', // emerald-500
		text: 'text-emerald-400',
		badge: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
		header: 'bg-emerald-500/10 border-emerald-500/30',
	},
	[TaskType.Optional]: {
		borderColor: '#0ea5e9', // sky-500
		text: 'text-sky-400',
		badge: 'bg-sky-500/20 text-sky-400 border border-sky-500/30',
		header: 'bg-sky-500/10 border-sky-500/30',
	},
	[TaskType.Complex]: {
		borderColor: '#f59e0b', // amber-500
		text: 'text-amber-400',
		badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
		header: 'bg-amber-500/10 border-amber-500/30',
	},
};

const taskTypeLabels: Record<TaskTypeType, string> = {
	[TaskType.Daily]: 'Daily Tasks',
	[TaskType.Optional]: 'Optional Tasks',
	[TaskType.Complex]: 'Complex Tasks',
};

const taskTypeOrder: TaskTypeType[] = [TaskType.Daily, TaskType.Optional, TaskType.Complex];

export function TaskList({
	tasks,
	taskResults,
	onToggleTask,
	onUpdateRepeatCount,
	onRunTask,
	isRunning,
	browserReady,
}: TaskListProps) {
	const [expandedSections, setExpandedSections] = useState<Set<TaskTypeType>>(
		new Set(taskTypeOrder)
	);

	const toggleSection = (taskType: TaskTypeType) => {
		setExpandedSections((prev) => {
			const next = new Set(prev);
			if (next.has(taskType)) {
				next.delete(taskType);
			} else {
				next.add(taskType);
			}
			return next;
		});
	};

	// Group tasks by taskType
	const groupedTasks = taskTypeOrder.reduce((acc, type) => {
		acc[type] = tasks.filter((t) => (t.taskType || TaskType.Daily) === type);
		return acc;
	}, {} as Record<TaskTypeType, Task[]>);

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

	const getTaskTypeStyle = (taskType: TaskTypeType) => {
		return taskTypeColors[taskType] || taskTypeColors[TaskType.Daily];
	};

	const renderTaskItem = (task: Task) => {
		const typeStyle = getTaskTypeStyle(task.taskType || TaskType.Daily);
		return (
			<div
				key={task.id}
				className={`p-4 flex items-center gap-4 transition-colors ${task.enabled ? 'bg-transparent' : 'bg-gray-900/50'}`}
				style={{ borderLeft: `4px solid ${typeStyle.borderColor}` }}
			>
				{/* Enable/Disable Toggle */}
				<button
					onClick={() => onToggleTask(task.id, !task.enabled)}
					className={`relative w-10 h-5 rounded-full transition-colors ${task.enabled ? 'bg-ea-green' : 'bg-gray-700'}`}
				>
					<div
						className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${task.enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
					/>
				</button>

				{/* Task Info */}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<span className={`font-medium ${task.enabled ? 'text-white' : 'text-gray-500'}`}>
							{task.cardTitle}
						</span>
						{getStatusBadge(task.id)}
					</div>
					<div className="text-xs text-gray-500 mt-0.5">
						{task.category}
					</div>
				</div>

				{/* Repeat Count Controls */}
				<div className="flex items-center gap-1">
					<button
						onClick={() => onUpdateRepeatCount(task.id, Math.max(1, task.repeatCount - 1))}
						disabled={task.repeatCount <= 1 || isRunning}
						className="w-6 h-6 flex items-center justify-center rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
					>
						−
					</button>
					<span className="w-8 text-center text-sm text-gray-300 font-medium">
						{task.repeatCount}x
					</span>
					<button
						onClick={() => onUpdateRepeatCount(task.id, Math.min(99, task.repeatCount + 1))}
						disabled={task.repeatCount >= 99 || isRunning}
						className="w-6 h-6 flex items-center justify-center rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed text-sm font-bold"
					>
						+
					</button>
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
		);
	};

	return (
		<div className="bg-[#131820] border border-ea-border rounded-lg overflow-hidden">
			<div className="px-4 py-3 border-b border-ea-border">
				<h3 className="text-sm font-medium text-gray-300">Tasks</h3>
			</div>

			{tasks.length === 0 ? (
				<div className="p-8 text-center text-gray-500">
					No tasks configured. Add tasks in tasks.config.json
				</div>
			) : (
				<div className="divide-y divide-ea-border">
					{taskTypeOrder.map((taskType) => {
						const tasksInGroup = groupedTasks[taskType];
						if (tasksInGroup.length === 0) return null;

						const style = taskTypeColors[taskType];
						const isExpanded = expandedSections.has(taskType);
						const enabledCount = tasksInGroup.filter((t) => t.enabled).length;

						return (
							<div key={taskType}>
								{/* Section Header */}
								<button
									onClick={() => toggleSection(taskType)}
									className={`w-full px-4 py-2.5 flex items-center justify-between ${style.header} hover:brightness-110 transition-all`}
								>
									<div className="flex items-center gap-2">
										<svg
											className={`w-4 h-4 ${style.text} transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
											fill="none"
											viewBox="0 0 24 24"
											stroke="currentColor"
										>
											<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
										</svg>
										<span className={`font-medium text-sm ${style.text}`}>
											{taskTypeLabels[taskType]}
										</span>
										<span className="text-xs text-gray-500">
											({enabledCount}/{tasksInGroup.length} enabled)
										</span>
									</div>
									<div
										className="w-2 h-2 rounded-full"
										style={{ backgroundColor: style.borderColor }}
									/>
								</button>

								{/* Task Items */}
								<div
									className={`divide-y divide-ea-border overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
								>
									{tasksInGroup.map(renderTaskItem)}
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
