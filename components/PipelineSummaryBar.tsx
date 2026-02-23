import React from 'react';
import { AlertTriangle, Clock, CheckSquare } from 'lucide-react';
import { Deal, Task, Deadline } from '../types';
import { cn } from '../lib/utils';

interface PipelineSummaryBarProps {
  deals: Deal[];
  tasks: Task[];
  deadlines: Deadline[];
  onFilterOverdue: () => void;
  onFilterStale: () => void;
}

export const PipelineSummaryBar: React.FC<PipelineSummaryBarProps> = ({
  deals, tasks, deadlines, onFilterOverdue, onFilterStale,
}) => {
  const activeDeals = deals.filter(d => d.stage !== 'Cancelled' && d.stage !== 'Sold');

  const now = Date.now();
  const overdueCount = deadlines.filter(d =>
    !d.is_acknowledged && new Date(d.due_date).getTime() < now
  ).length;

  const staleCount = activeDeals.filter(d => {
    if (!d.updated_at) return false;
    return (now - new Date(d.updated_at).getTime()) > 14 * 86400000;
  }).length;

  const pendingTasks = tasks.filter(t => t.status === 'To Do' || t.status === 'In Progress').length;

  return (
    <div className="px-5 py-2 border-b border-gray-200 bg-white flex items-center gap-5 flex-wrap">
      <Metric
        icon={<AlertTriangle size={12} />}
        label="Overdue"
        value={String(overdueCount)}
        valueClass={overdueCount > 0 ? 'text-red-600' : undefined}
        onClick={overdueCount > 0 ? onFilterOverdue : undefined}
      />
      <Metric
        icon={<Clock size={12} />}
        label="Stale"
        value={String(staleCount)}
        valueClass={staleCount > 0 ? 'text-amber-600' : undefined}
        onClick={staleCount > 0 ? onFilterStale : undefined}
      />
      <Metric
        icon={<CheckSquare size={12} />}
        label="Pending"
        value={String(pendingTasks)}
      />
    </div>
  );
};

const Metric: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
  onClick?: () => void;
}> = ({ icon, label, value, valueClass, onClick }) => {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5',
        onClick && 'hover:opacity-80 transition-opacity cursor-pointer',
      )}
    >
      <span className="text-gray-400">{icon}</span>
      <span className="text-micro text-gray-400 font-medium uppercase tracking-wide">{label}</span>
      <span className={cn('text-caption font-semibold text-gray-800', valueClass)}>{value}</span>
    </Wrapper>
  );
};
