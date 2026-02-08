import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { fetchTasksByDealId, updateTaskFields } from '../../lib/database';
import { cn } from '../../lib/utils';
import confetti from 'canvas-confetti';

interface DealTasksProps {
  dealId: string;
  stageHex: string;
}

export const DealTasks: React.FC<DealTasksProps> = ({ dealId, stageHex }) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!dealId) return;
    const fetchTasks = async () => {
      const data = await fetchTasksByDealId(dealId);
      const filtered = (data || []).filter((t: any) => t.status !== 'Cancelled');
      const statusOrder: Record<string, number> = { 'In Progress': 0, 'To Do': 1, 'Done': 2 };
      const sorted = filtered.sort((a: any, b: any) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99));
      setTasks(sorted);
      setLoading(false);
    };
    fetchTasks();
  }, [dealId]);

  const handleStatusChange = async (task: any, newStatus: string) => {
    const oldStatus = task.status;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    if (newStatus === 'Done' && oldStatus !== 'Done') {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
    try {
      await updateTaskFields(task.id, { status: newStatus });
    } catch (err) {
      console.error('Task update failed', err);
    }
  };

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'Done').length;
  const progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  if (loading) return <div className="py-8 text-center text-gray-400 text-caption">Loading tasks...</div>;
  if (tasks.length === 0) return <div className="py-8 text-center text-gray-400 text-caption italic">No tasks for this deal.</div>;

  return (
    <div className="space-y-4 py-1">
      {/* Progress Bar */}
      <div>
        <div className="flex justify-between text-micro font-semibold text-gray-500 mb-1">
          <span>{completedTasks} of {totalTasks} completed</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%`, backgroundColor: stageHex }}
          />
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-1">
        {tasks.map(task => (
          <div
            key={task.id}
            className="flex items-center justify-between px-3 py-2.5 bg-subtle hover:bg-gray-100 rounded-md border border-gray-100 transition-all group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className={cn(
                'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                task.status === 'Done'
                  ? 'bg-emerald-500 border-emerald-500'
                  : task.status === 'In Progress'
                  ? 'border-primary bg-primary/10'
                  : 'border-gray-300'
              )}>
                {task.status === 'Done' && <Check size={10} className="text-white" />}
              </div>
              <span className={cn(
                'text-sm font-medium transition-colors truncate',
                task.status === 'Done' ? 'text-gray-400 line-through' : 'text-gray-700'
              )}>
                {task.title}
              </span>
            </div>
            <select
              value={task.status}
              onChange={(e) => handleStatusChange(task, e.target.value)}
              className={cn(
                'text-micro font-bold px-2 py-1 rounded-md border-0 cursor-pointer outline-none ring-1 ring-inset transition-all flex-shrink-0',
                task.status === 'Done' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                task.status === 'In Progress' ? 'bg-primary-light text-primary ring-blue-200' :
                'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50'
              )}
            >
              <option value="To Do">To Do</option>
              <option value="In Progress">In Progress</option>
              <option value="Done">Done</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
};
