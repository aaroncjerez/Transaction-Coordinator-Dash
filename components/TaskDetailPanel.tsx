import React, { useEffect, useState } from 'react';
import { X, Clock, User, Flag, FileText, ChevronDown, ChevronUp, Bell, Trash2, Plus } from 'lucide-react';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { fetchTaskById, updateTaskWithLog, getTaskActivity, createReminder, getRemindersByTask, deleteReminder } from '../lib/database';
import { cn } from '../lib/utils';
import { TaskReminder } from '../types';

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
  const [reminders, setReminders] = useState<TaskReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showActivity, setShowActivity] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [customRemindAt, setCustomRemindAt] = useState('');

  useEffect(() => {
    if (!taskId) return;
    loadTask(taskId);
  }, [taskId]);

  const loadTask = async (id: string) => {
    setLoading(true);
    const [taskData, activityData, reminderData] = await Promise.all([
      fetchTaskById(id),
      getTaskActivity(id),
      getRemindersByTask(id),
    ]);
    setTask(taskData);
    setActivity(activityData || []);
    setReminders((reminderData || []) as TaskReminder[]);
    setLoading(false);
  };

  const handleAddReminder = async (getDate: () => Date) => {
    if (!task) return;
    try {
      await createReminder(task.id, getDate().toISOString());
      const updated = await getRemindersByTask(task.id);
      setReminders((updated || []) as TaskReminder[]);
    } catch (err) {
      console.error('Failed to create reminder:', err);
    }
  };

  const handleDeleteReminder = async (id: string) => {
    try {
      await deleteReminder(id);
      setReminders(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('Failed to delete reminder:', err);
    }
  };

  const handleCustomReminder = async () => {
    if (!customRemindAt || !task) return;
    try {
      await createReminder(task.id, new Date(customRemindAt).toISOString());
      const updated = await getRemindersByTask(task.id);
      setReminders((updated || []) as TaskReminder[]);
      setCustomRemindAt('');
      setShowReminderPicker(false);
    } catch (err) {
      console.error('Failed to create reminder:', err);
    }
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
      <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto animate-in slide-in-from-right" role="dialog" aria-label="Task details" aria-modal="true">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900">Task Details</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-md" aria-label="Close task details">
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
              value={task.title || ''}
              onChange={e => setTask({ ...task, title: e.target.value })}
              onBlur={e => handleFieldChange('title', e.target.value)}
              className="w-full text-xl font-bold text-gray-900 bg-transparent border-0 focus:ring-0 p-0 outline-none"
            />

            {/* Status + Priority Row */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-caption font-medium text-gray-500 mb-1 block">Status</label>
                <select
                  value={task.status || 'To Do'}
                  onChange={e => handleFieldChange('status', e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-caption font-medium text-gray-500 mb-1 block">Priority</label>
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
              <label className="text-caption font-medium text-gray-500 mb-1 flex items-center gap-1">
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
              <label className="text-caption font-medium text-gray-500 mb-1 flex items-center gap-1">
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
              <label className="text-caption font-medium text-gray-500 mb-1 flex items-center gap-1">
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
              <label className="text-caption font-medium text-gray-500 mb-1 block">Notes</label>
              <textarea
                value={task.notes || ''}
                onChange={e => setTask({ ...task, notes: e.target.value })}
                onBlur={e => handleFieldChange('notes', e.target.value || null)}
                placeholder="Quick notes..."
                rows={2}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
              />
            </div>

            {/* Reminders */}
            <div>
              <label className="text-caption font-medium text-gray-500 mb-2 flex items-center gap-1">
                <Bell size={12} /> Reminders
              </label>

              {/* Existing reminders */}
              {reminders.filter(r => r.status === 'pending').length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {reminders.filter(r => r.status === 'pending').map(r => (
                    <div key={r.id} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      <span className="text-xs text-amber-700">
                        {new Date(r.remind_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <button
                        onClick={() => handleDeleteReminder(r.id)}
                        className="p-0.5 hover:bg-amber-100 rounded text-amber-400 hover:text-red-500"
                        aria-label="Delete reminder"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick pick buttons */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                <button
                  onClick={() => handleAddReminder(() => new Date(Date.now() + 60 * 60 * 1000))}
                  className="text-xs px-2.5 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium"
                >
                  1 hour
                </button>
                <button
                  onClick={() => handleAddReminder(() => new Date(Date.now() + 3 * 60 * 60 * 1000))}
                  className="text-xs px-2.5 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium"
                >
                  3 hours
                </button>
                <button
                  onClick={() => handleAddReminder(() => {
                    const d = new Date();
                    d.setDate(d.getDate() + 1);
                    d.setHours(9, 0, 0, 0);
                    return d;
                  })}
                  className="text-xs px-2.5 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium"
                >
                  Tomorrow 9am
                </button>
                <button
                  onClick={() => handleAddReminder(() => {
                    const d = new Date();
                    const daysUntilMon = ((8 - d.getDay()) % 7) || 7;
                    d.setDate(d.getDate() + daysUntilMon);
                    d.setHours(9, 0, 0, 0);
                    return d;
                  })}
                  className="text-xs px-2.5 py-1 rounded-md bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium"
                >
                  Next Monday 9am
                </button>
              </div>

              {/* Custom reminder */}
              {!showReminderPicker ? (
                <button
                  onClick={() => setShowReminderPicker(true)}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Plus size={12} /> Custom time
                </button>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="datetime-local"
                    value={customRemindAt}
                    onChange={e => setCustomRemindAt(e.target.value)}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                  <button
                    onClick={handleCustomReminder}
                    disabled={!customRemindAt}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setShowReminderPicker(false); setCustomRemindAt(''); }}
                    className="text-xs px-2 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Linked Deal */}
            {task.deal && (
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <label className="text-caption font-medium text-gray-500 mb-1 block">Linked Deal</label>
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
