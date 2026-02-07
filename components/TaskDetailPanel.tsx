import React, { useEffect, useState } from 'react';
import { X, Clock, User, Flag, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { fetchTaskById, updateTaskWithLog, getTaskActivity } from '../lib/database';
import { cn } from '../lib/utils';

interface TaskDetailPanelProps {
  taskId: string | null;
  onClose: () => void;
  onUpdate: () => void;
}

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;
const STATUSES = ['To Do', 'In Progress', 'Done', 'Cancelled'] as const;

export const TaskDetailPanel: React.FC<TaskDetailPanelProps> = ({ taskId, onClose, onUpdate }) => {
  const [task, setTask] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showActivity, setShowActivity] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    loadTask(taskId);
  }, [taskId]);

  const loadTask = async (id: string) => {
    setLoading(true);
    const [taskData, activityData] = await Promise.all([
      fetchTaskById(id),
      getTaskActivity(id),
    ]);
    setTask(taskData);
    setActivity(activityData || []);
    setLoading(false);
  };

  const handleFieldChange = async (field: string, value: any) => {
    if (!task) return;
    setTask((prev: any) => ({ ...prev, [field]: value }));
    await updateTaskWithLog(task.id, { [field]: value });
    const newActivity = await getTaskActivity(task.id);
    setActivity(newActivity || []);
    onUpdate();
  };

  if (!taskId) return null;

  const priorityColor: Record<string, string> = {
    Low: 'bg-gray-100 text-gray-600',
    Medium: 'bg-blue-100 text-blue-700',
    High: 'bg-orange-100 text-orange-700',
    Urgent: 'bg-red-100 text-red-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900">Task Details</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-md">
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : task ? (
          <div className="p-6 space-y-6">
            {/* Task Name */}
            <input
              type="text"
              value={task.task_name || ''}
              onChange={e => setTask({ ...task, task_name: e.target.value })}
              onBlur={e => handleFieldChange('task_name', e.target.value)}
              className="w-full text-xl font-bold text-gray-900 bg-transparent border-0 focus:ring-0 p-0 outline-none"
            />

            {/* Status + Priority Row */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Status</label>
                <select
                  value={task.status || 'To Do'}
                  onChange={e => handleFieldChange('status', e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Priority</label>
                <select
                  value={task.priority || 'Medium'}
                  onChange={e => handleFieldChange('priority', e.target.value)}
                  className={cn(
                    "w-full text-sm border rounded-lg px-3 py-2 font-medium focus:ring-2 focus:ring-blue-500 outline-none",
                    priorityColor[task.priority || 'Medium']
                  )}
                >
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* Due Date */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                <Clock size={12} /> Due Date
              </label>
              <input
                type="date"
                value={task.due_date || ''}
                onChange={e => handleFieldChange('due_date', e.target.value || null)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Assignee */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                <User size={12} /> Assignee
              </label>
              <input
                type="text"
                value={task.assignee || ''}
                onChange={e => setTask({ ...task, assignee: e.target.value })}
                onBlur={e => handleFieldChange('assignee', e.target.value || null)}
                placeholder="Unassigned"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                <FileText size={12} /> Description
              </label>
              <textarea
                value={task.description || ''}
                onChange={e => setTask({ ...task, description: e.target.value })}
                onBlur={e => handleFieldChange('description', e.target.value || null)}
                placeholder="Add a description..."
                rows={4}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Notes</label>
              <textarea
                value={task.notes || ''}
                onChange={e => setTask({ ...task, notes: e.target.value })}
                onBlur={e => handleFieldChange('notes', e.target.value || null)}
                placeholder="Quick notes..."
                rows={2}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
            </div>

            {/* Linked Deal */}
            {task.deal && (
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <label className="text-xs font-medium text-gray-500 mb-1 block">Linked Deal</label>
                <p className="text-sm font-semibold text-gray-900">{task.deal.deal_name}</p>
                <p className="text-xs text-gray-500">{task.deal.stage} &middot; {task.deal.county}, {task.deal.state}</p>
              </div>
            )}

            {/* Completed At */}
            {task.completed_at && (
              <div className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 border border-emerald-100">
                Completed: {new Date(task.completed_at).toLocaleString()}
              </div>
            )}

            {/* Activity Log */}
            <div className="border-t border-gray-200 pt-4">
              <button
                onClick={() => setShowActivity(!showActivity)}
                className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 w-full"
              >
                {showActivity ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                Activity Log ({activity.length})
              </button>

              {showActivity && (
                <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
                  {activity.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No activity yet</p>
                  ) : (
                    activity.map((entry: any) => (
                      <div key={entry.id} className="flex gap-2 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-300 mt-1.5 flex-shrink-0" />
                        <div>
                          <span className="font-medium text-gray-700">{entry.action.replace(/_/g, ' ')}</span>
                          {entry.details && (
                            <span className="text-gray-400 ml-1">
                              {(() => {
                                try {
                                  const d = JSON.parse(entry.details);
                                  return `${d.old} → ${d.new}`;
                                } catch { return entry.details; }
                              })()}
                            </span>
                          )}
                          <span className="text-gray-300 ml-2">{new Date(entry.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">Task not found</div>
        )}
      </div>
    </div>
  );
};
