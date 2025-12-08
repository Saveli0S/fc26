import { useState } from 'react';
import { Task, TaskResult, TaskType, TaskTypeType, TaskSchedule } from '../types';
import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	DragEndEvent,
} from '@dnd-kit/core';
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TaskListProps {
	tasks: Task[];
	taskResults: Map<string, TaskResult>;
	onToggleTask: (taskId: string, enabled: boolean) => void;
	onUpdateRepeatCount: (taskId: string, repeatCount: number) => void;
	onUpdateSchedule: (taskId: string, schedule: TaskSchedule) => void;
	onRunTask: (taskId: string) => void;
	onReorderTasks?: (taskIds: string[]) => void;
	onDeleteTask?: (taskId: string) => void;
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

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Sortable Task Item Component
interface SortableTaskItemProps {
	task: Task;
	taskResults: Map<string, TaskResult>;
	onToggleTask: (taskId: string, enabled: boolean) => void;
	onUpdateRepeatCount: (taskId: string, repeatCount: number) => void;
	onUpdateSchedule: (taskId: string, schedule: TaskSchedule) => void;
	onRunTask: (taskId: string) => void;
	onDeleteTask?: (taskId: string) => void;
	isRunning: boolean;
	browserReady: boolean;
	expandedSchedules: Set<string>;
	toggleScheduleExpanded: (taskId: string) => void;
}

function SortableTaskItem({
	task,
	taskResults,
	onToggleTask,
	onUpdateRepeatCount,
	onUpdateSchedule,
	onRunTask,
	onDeleteTask,
	isRunning,
	browserReady,
	expandedSchedules,
	toggleScheduleExpanded,
}: SortableTaskItemProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: task.id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
		zIndex: isDragging ? 999 : 'auto',
	};

	const typeStyle = taskTypeColors[task.taskType || TaskType.Daily];
	const isScheduleExpanded = expandedSchedules.has(task.id);
	const schedule = task.schedule || { enabled: false, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] };

	const getStatusBadge = () => {
		const result = taskResults.get(task.id);
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

	const handleScheduleToggle = (enabled: boolean) => {
		const currentSchedule = task.schedule || { enabled: false, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] };
		onUpdateSchedule(task.id, { ...currentSchedule, enabled });
	};

	const handleScheduleTimeChange = (time: string) => {
		const currentSchedule = task.schedule || { enabled: false, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] };
		onUpdateSchedule(task.id, { ...currentSchedule, time });
	};

	const handleScheduleDayToggle = (day: number) => {
		const currentSchedule = task.schedule || { enabled: false, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] };
		const days = currentSchedule.daysOfWeek || [0, 1, 2, 3, 4, 5, 6];
		const newDays = days.includes(day)
			? days.filter((d) => d !== day)
			: [...days, day].sort((a, b) => a - b);
		onUpdateSchedule(task.id, { ...currentSchedule, daysOfWeek: newDays });
	};

	return (
		<div ref={setNodeRef} style={style}>
			<div
				className={`p-4 flex items-center gap-4 transition-colors ${task.enabled ? 'bg-transparent' : 'bg-gray-900/50'}`}
				style={{ borderLeft: `4px solid ${typeStyle.borderColor}` }}
			>
				{/* Drag Handle */}
				<button
					className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing touch-none"
					{...attributes}
					{...listeners}
				>
					<svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
						<path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-8a2 2 0 1 0-.001-4.001A2 2 0 0 0 13 6zm0 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
					</svg>
				</button>

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
						{getStatusBadge()}
						{schedule.enabled && schedule.time && (
							<span className="px-1.5 py-0.5 rounded text-xs bg-violet-500/20 text-violet-400 border border-violet-500/30">
								⏰ {schedule.time}
							</span>
						)}
					</div>
					<div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
						<span>{task.category}</span>
						{task.priority !== undefined && task.priority !== 50 && (
							<span className="text-amber-500">P{task.priority}</span>
						)}
					</div>
				</div>

				{/* Schedule Button */}
				<button
					onClick={() => toggleScheduleExpanded(task.id)}
					className={`w-8 h-8 flex items-center justify-center rounded transition-all ${isScheduleExpanded
						? 'bg-violet-500/20 text-violet-400'
						: schedule.enabled
							? 'bg-violet-500/10 text-violet-400 border border-violet-500/30'
							: 'bg-gray-800 text-gray-500 hover:text-gray-300'
						}`}
					title="Schedule"
				>
					<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				</button>

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

				{/* Delete Button */}
				{onDeleteTask && (
					<button
						onClick={() => {
							if (confirm(`Delete "${task.cardTitle}"?`)) {
								onDeleteTask(task.id);
							}
						}}
						disabled={isRunning}
						className="w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
						title="Delete task"
					>
						<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
					</button>
				)}
			</div>

			{/* Schedule Panel */}
			{isScheduleExpanded && (
				<div className="px-4 py-3 bg-gray-900/50 border-t border-ea-border" style={{ borderLeft: `4px solid ${typeStyle.borderColor}` }}>
					<div className="flex items-center gap-4 flex-wrap">
						{/* Schedule Enable Toggle */}
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="checkbox"
								checked={schedule.enabled}
								onChange={(e) => handleScheduleToggle(e.target.checked)}
								className="w-4 h-4 rounded border-ea-border bg-[#0a0e14] text-violet-500 focus:ring-violet-500 focus:ring-offset-0"
							/>
							<span className="text-sm text-gray-300">Daily Schedule</span>
						</label>

						{/* Time Picker */}
						<div className="flex items-center gap-2">
							<span className="text-xs text-gray-500">Run at:</span>
							<input
								type="time"
								value={schedule.time || '06:00'}
								onChange={(e) => handleScheduleTimeChange(e.target.value)}
								disabled={!schedule.enabled}
								className="px-2 py-1 rounded bg-[#0a0e14] border border-ea-border text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:border-violet-500"
							/>
						</div>

						{/* Day Selector */}
						<div className="flex items-center gap-1">
							{DAY_LABELS.map((label, idx) => {
								const isActive = (schedule.daysOfWeek || [0, 1, 2, 3, 4, 5, 6]).includes(idx);
								return (
									<button
										key={idx}
										onClick={() => handleScheduleDayToggle(idx)}
										disabled={!schedule.enabled}
										className={`w-7 h-7 text-xs rounded font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isActive
											? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
											: 'bg-gray-800 text-gray-500 hover:text-gray-300'
											}`}
									>
										{label}
									</button>
								);
							})}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

export function TaskList({
	tasks,
	taskResults,
	onToggleTask,
	onUpdateRepeatCount,
	onUpdateSchedule,
	onRunTask,
	onReorderTasks,
	onDeleteTask,
	isRunning,
	browserReady,
}: TaskListProps) {
	const [expandedSections, setExpandedSections] = useState<Set<TaskTypeType>>(
		new Set(taskTypeOrder)
	);
	const [expandedSchedules, setExpandedSchedules] = useState<Set<string>>(new Set());
	const [isCollapsed, setIsCollapsed] = useState(false);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
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

	const toggleScheduleExpanded = (taskId: string) => {
		setExpandedSchedules((prev) => {
			const next = new Set(prev);
			if (next.has(taskId)) {
				next.delete(taskId);
			} else {
				next.add(taskId);
			}
			return next;
		});
	};

	// Group tasks by taskType
	const groupedTasks = taskTypeOrder.reduce((acc, type) => {
		acc[type] = tasks.filter((t) => (t.taskType || TaskType.Daily) === type);
		return acc;
	}, {} as Record<TaskTypeType, Task[]>);

	const handleDragEnd = (event: DragEndEvent, taskType: TaskTypeType) => {
		const { active, over } = event;

		if (over && active.id !== over.id) {
			const tasksInGroup = groupedTasks[taskType];
			const oldIndex = tasksInGroup.findIndex((t) => t.id === active.id);
			const newIndex = tasksInGroup.findIndex((t) => t.id === over.id);

			const reorderedGroup = arrayMove(tasksInGroup, oldIndex, newIndex);

			// Build new full task order preserving other groups
			const newOrder: string[] = [];
			taskTypeOrder.forEach((type) => {
				if (type === taskType) {
					newOrder.push(...reorderedGroup.map((t) => t.id));
				} else {
					newOrder.push(...groupedTasks[type].map((t) => t.id));
				}
			});

			onReorderTasks?.(newOrder);
		}
	};

	return (
		<div className="bg-[#131820] border border-ea-border rounded-lg overflow-hidden">
			<button
				onClick={() => setIsCollapsed(!isCollapsed)}
				className="w-full px-4 py-3 border-b border-ea-border flex items-center justify-between hover:bg-gray-800/30 transition-colors"
			>
				<div className="flex items-center gap-2">
					<svg
						className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
					</svg>
					<h3 className="text-sm font-medium text-gray-300">Tasks</h3>
				</div>
				<span className="text-xs text-gray-500">
					{tasks.filter(t => t.enabled).length}/{tasks.length} enabled
				</span>
			</button>

			{!isCollapsed && (tasks.length === 0 ? (
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

								{/* Task Items with DnD */}
								<div
									className={`divide-y divide-ea-border overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
								>
									<DndContext
										sensors={sensors}
										collisionDetection={closestCenter}
										onDragEnd={(event) => handleDragEnd(event, taskType)}
									>
										<SortableContext
											items={tasksInGroup.map((t) => t.id)}
											strategy={verticalListSortingStrategy}
										>
											{tasksInGroup.map((task) => (
												<SortableTaskItem
													key={task.id}
													task={task}
													taskResults={taskResults}
													onToggleTask={onToggleTask}
													onUpdateRepeatCount={onUpdateRepeatCount}
													onUpdateSchedule={onUpdateSchedule}
													onRunTask={onRunTask}
													onDeleteTask={onDeleteTask}
													isRunning={isRunning}
													browserReady={browserReady}
													expandedSchedules={expandedSchedules}
													toggleScheduleExpanded={toggleScheduleExpanded}
												/>
											))}
										</SortableContext>
									</DndContext>
								</div>
							</div>
						);
					})}
				</div>
			))}
		</div>
	);
}
