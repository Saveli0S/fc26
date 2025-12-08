import { useState } from 'react';
import { Task, SquadBuilderRules, SBCCategory, TaskType, SpeedProfile, SBCCategoryType, TaskTypeType, SpeedProfileType } from '../types';
import { taskTemplates, TaskTemplate } from '../data/templates';

// Speed profile display labels and descriptions
const speedProfileInfo: Record<SpeedProfileType, { label: string; description: string; color: string }> = {
	[SpeedProfile.Fast]: {
		label: '⚡ Fast',
		description: 'Fastest execution, minimal delays',
		color: 'text-yellow-400',
	},
	[SpeedProfile.Normal]: {
		label: '🔄 Normal',
		description: 'Balanced speed and safety',
		color: 'text-blue-400',
	},
	[SpeedProfile.Safe]: {
		label: '🛡️ Safe',
		description: 'Slower with longer pauses',
		color: 'text-green-400',
	},
	[SpeedProfile.HumanLike]: {
		label: '🧑 Human-like',
		description: 'Realistic movements and timing',
		color: 'text-purple-400',
	},
};

interface TaskConfigProps {
	rules: SquadBuilderRules;
	onUpdateRules: (rules: SquadBuilderRules) => void;
	onAddTask: (task: Task) => void;
	onApplyTemplate: (tasks: Omit<Task, 'id'>[]) => void;
}

export function TaskConfig({ rules, onUpdateRules, onAddTask, onApplyTemplate }: TaskConfigProps) {
	const [isAddingTask, setIsAddingTask] = useState(false);
	const [isRulesCollapsed, setIsRulesCollapsed] = useState(true); // Collapsed by default
	const [isTemplatesCollapsed, setIsTemplatesCollapsed] = useState(false);
	const [newTask, setNewTask] = useState<Partial<Task>>({
		category: SBCCategory.Upgrades,
		repeatCount: 1,
		enabled: true,
		taskType: TaskType.Daily,
	});

	const handleApplyTemplate = (template: TaskTemplate) => {
		if (confirm(`Apply "${template.name}" template? This will add ${template.tasks.length} tasks.`)) {
			onApplyTemplate(template.tasks);
		}
	};

	const handleRuleChange = (key: keyof SquadBuilderRules, value: any) => {
		onUpdateRules({ ...rules, [key]: value });
	};

	const handleAddTask = () => {
		if (!newTask.cardTitle) return;

		const task: Task = {
			id: `task-${Date.now()}`,
			category: newTask.category || SBCCategory.Upgrades,
			cardTitle: newTask.cardTitle,
			repeatCount: newTask.repeatCount || 1,
			enabled: true,
			taskType: newTask.taskType || TaskType.Daily,
		};

		onAddTask(task);
		setNewTask({ category: SBCCategory.Upgrades, repeatCount: 1, enabled: true, taskType: TaskType.Daily });
		setIsAddingTask(false);
	};

	return (
		<div className="space-y-6">
			{/* Task Templates */}
			<div className="bg-[#131820] border border-ea-border rounded-lg overflow-hidden">
				<button
					onClick={() => setIsTemplatesCollapsed(!isTemplatesCollapsed)}
					className="w-full px-4 py-3 border-b border-ea-border flex items-center justify-between hover:bg-gray-800/30 transition-colors"
				>
					<div className="flex items-center gap-2">
						<svg
							className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isTemplatesCollapsed ? '' : 'rotate-90'}`}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
						</svg>
						<h3 className="text-sm font-medium text-gray-300">📋 Task Templates</h3>
					</div>
					<span className="text-xs text-gray-500">
						{taskTemplates.length} available
					</span>
				</button>

				{!isTemplatesCollapsed && (
					<div className="p-3 grid grid-cols-1 gap-2">
						{taskTemplates.map((template) => (
							<button
								key={template.id}
								onClick={() => handleApplyTemplate(template)}
								className="p-3 bg-gray-900/50 border border-ea-border rounded-lg text-left hover:border-ea-green/50 hover:bg-gray-900 transition-all group"
							>
								<div className="flex items-center gap-2">
									<span className="text-lg">{template.icon}</span>
									<div className="flex-1 min-w-0">
										<div className="text-sm font-medium text-white group-hover:text-ea-green transition-colors">
											{template.name}
										</div>
										<div className="text-xs text-gray-500">
											{template.description} • {template.tasks.length} tasks
										</div>
									</div>
									<svg
										className="w-4 h-4 text-gray-600 group-hover:text-ea-green transition-colors"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
									</svg>
								</div>
							</button>
						))}
					</div>
				)}
			</div>

			{/* Squad Builder Rules */}
			<div className="bg-[#131820] border border-ea-border rounded-lg overflow-hidden">
				<button
					onClick={() => setIsRulesCollapsed(!isRulesCollapsed)}
					className="w-full px-4 py-3 border-b border-ea-border flex items-center justify-between hover:bg-gray-800/30 transition-colors"
				>
					<div className="flex items-center gap-2">
						<svg
							className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isRulesCollapsed ? '' : 'rotate-90'}`}
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
						</svg>
						<h3 className="text-sm font-medium text-gray-300">Squad Builder Rules</h3>
					</div>
					<span className="text-xs text-gray-500">
						{rules.speedProfile}
					</span>
				</button>

				{!isRulesCollapsed && <div className="p-4 space-y-4">
					{/* Checkboxes */}
					<div className="grid grid-cols-2 gap-3">
						{[
							{ key: 'untradablesOnly', label: 'Untradeables Only' },
							{ key: 'excludeActiveSquad', label: 'Exclude Active Squad' },
							{ key: 'ignorePosition', label: 'Ignore Position' },
							{ key: 'preferCommon', label: 'Prefer Common' },
						].map(({ key, label }) => (
							<label
								key={key}
								className="flex items-center gap-2 cursor-pointer group"
							>
								<input
									type="checkbox"
									checked={rules[key as keyof SquadBuilderRules] as boolean}
									onChange={(e) => handleRuleChange(key as keyof SquadBuilderRules, e.target.checked)}
									className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-ea-green focus:ring-ea-green focus:ring-offset-0"
								/>
								<span className="text-sm text-gray-400 group-hover:text-gray-300">
									{label}
								</span>
							</label>
						))}
					</div>

					{/* Sort By */}
					<div>
						<label className="block text-xs text-gray-500 mb-1">Sort By</label>
						<select
							value={rules.sortBy}
							onChange={(e) => handleRuleChange('sortBy', e.target.value)}
							className="w-full bg-gray-900 border border-ea-border rounded px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-ea-green"
						>
							<option value="rating-low-to-high">Rating: Low to High</option>
							<option value="rating-high-to-low">Rating: High to Low</option>
						</select>
					</div>

					{/* Max OVR */}
					<div>
						<label className="block text-xs text-gray-500 mb-1">
							Max OVR: {rules.maxOVR}
						</label>
						<input
							type="range"
							min="1"
							max="99"
							value={rules.maxOVR}
							onChange={(e) => handleRuleChange('maxOVR', parseInt(e.target.value))}
							className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-ea-green"
						/>
					</div>

					{/* Speed Profile */}
					<div>
						<label className="block text-xs text-gray-500 mb-2">Automation Speed</label>
						<div className="grid grid-cols-2 gap-2">
							{(Object.keys(SpeedProfile) as Array<keyof typeof SpeedProfile>).map((key) => {
								const value = SpeedProfile[key];
								const info = speedProfileInfo[value];
								const isSelected = rules.speedProfile === value;
								return (
									<button
										key={value}
										onClick={() => handleRuleChange('speedProfile', value)}
										className={`p-2 rounded border text-left transition-all ${isSelected
											? 'border-ea-green bg-ea-green/10'
											: 'border-ea-border bg-gray-900 hover:border-gray-600'
											}`}
									>
										<div className={`text-sm font-medium ${isSelected ? info.color : 'text-gray-300'}`}>
											{info.label}
										</div>
										<div className="text-xs text-gray-500 mt-0.5">
											{info.description}
										</div>
									</button>
								);
							})}
						</div>
					</div>
				</div>}
			</div>

			{/* Add Task */}
			<div className="bg-[#131820] border border-ea-border rounded-lg overflow-hidden">
				<div className="px-4 py-3 border-b border-ea-border flex items-center justify-between">
					<h3 className="text-sm font-medium text-gray-300">Add New Task</h3>
					<button
						onClick={() => setIsAddingTask(!isAddingTask)}
						className="text-ea-green text-sm hover:underline"
					>
						{isAddingTask ? 'Cancel' : '+ Add'}
					</button>
				</div>

				{isAddingTask && (
					<div className="p-4 space-y-3">
						<div>
							<label className="block text-xs text-gray-500 mb-1">Card Title</label>
							<input
								type="text"
								value={newTask.cardTitle || ''}
								onChange={(e) => setNewTask({ ...newTask, cardTitle: e.target.value })}
								placeholder="e.g., Daily Bronze Upgrade"
								className="w-full bg-gray-900 border border-ea-border rounded px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-ea-green"
							/>
						</div>

						<div className="grid grid-cols-3 gap-3">
							<div>
								<label className="block text-xs text-gray-500 mb-1">Category</label>
								<select
									value={newTask.category}
									onChange={(e) => setNewTask({ ...newTask, category: e.target.value as SBCCategoryType })}
									className="w-full bg-gray-900 border border-ea-border rounded px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-ea-green"
								>
									{Object.values(SBCCategory).map((cat) => (
										<option key={cat} value={cat}>{cat}</option>
									))}
								</select>
							</div>

							<div>
								<label className="block text-xs text-gray-500 mb-1">Task Type</label>
								<select
									value={newTask.taskType}
									onChange={(e) => setNewTask({ ...newTask, taskType: e.target.value as TaskTypeType })}
									className="w-full bg-gray-900 border border-ea-border rounded px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-ea-green"
								>
									<option value={TaskType.Daily}>Daily</option>
									<option value={TaskType.Optional}>Optional</option>
									<option value={TaskType.Complex}>Complex</option>
								</select>
							</div>

							<div>
								<label className="block text-xs text-gray-500 mb-1">Repeat</label>
								<input
									type="number"
									min="1"
									max="99"
									value={newTask.repeatCount}
									onChange={(e) => setNewTask({ ...newTask, repeatCount: parseInt(e.target.value) })}
									className="w-full bg-gray-900 border border-ea-border rounded px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-ea-green"
								/>
							</div>
						</div>

						<button
							onClick={handleAddTask}
							disabled={!newTask.cardTitle}
							className="w-full py-2 bg-ea-green text-black font-medium rounded hover:bg-ea-green/90 transition-colors disabled:bg-gray-700 disabled:text-gray-500"
						>
							Add Task
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
