import { useRef, useEffect } from 'react';
import { LogEntry } from '../types';

interface StatusLogProps {
	logs: LogEntry[];
}

export function StatusLog({ logs }: StatusLogProps) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (containerRef.current) {
			containerRef.current.scrollTop = containerRef.current.scrollHeight;
		}
	}, [logs]);

	const formatTime = (timestamp: string) => {
		return new Date(timestamp).toLocaleTimeString('en-US', {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
		});
	};

	return (
		<div className="bg-[#0d1117] border border-ea-border rounded-lg overflow-hidden">
			<div className="px-4 py-3 border-b border-ea-border flex items-center gap-2">
				<div className="w-2 h-2 rounded-full bg-ea-green animate-pulse" />
				<h3 className="text-sm font-medium text-gray-300">Live Log</h3>
				<span className="text-xs text-gray-500 ml-auto">{logs.length} entries</span>
			</div>

			<div
				ref={containerRef}
				className="h-64 overflow-y-auto p-3 font-mono text-xs space-y-1"
			>
				{logs.length === 0 ? (
					<div className="text-gray-500 text-center py-8">
						No logs yet. Initialize browser to start.
					</div>
				) : (
					logs.map((log, index) => (
						<div
							key={index}
							className={`log-entry animate-slide-up log-${log.logType}`}
						>
							<span className="text-gray-600">[{formatTime(log.timestamp)}]</span>{' '}
							<span>{log.message}</span>
						</div>
					))
				)}
			</div>
		</div>
	);
}
