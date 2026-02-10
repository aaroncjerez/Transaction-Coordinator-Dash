import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Trash2, Bell, Plus, ChevronDown, ChevronRight, Calendar, User, Flag } from 'lucide-react';
import {
  fetchTasksByDealId,
  updateTaskWithLog,
  insertTask,
  createReminder,
  getRemindersByTask,
  deleteReminder,
} from '../../lib/database';
import { cn } from '../../lib/utils';
import { TaskReminder } from '../../types';
import confetti from 'canvas-confetti';
import type { UndoAction } from '../../hooks/useUndoStack';

interface DealTasksProps {
  dealId: string;
  stageHex: string;
  onUndoableAction?: (action: UndoAction) => void;
}

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;

const priorityColor: Record<string, string> = {
  Low: 'bg-gray-100 text-gray-600',
  Medium: 'bg-blue-50 text-blue-700',
  High: 'bg-orange-50 text-orange-700',
  Urgent: 'bg-red-50 text-red-700',
};

export const DealTasks: React.FC<DealTasksProps> = ({ dealId, stageHex, onUndoableAction }) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);

  // Reminder state per-task (only loaded when expanded)
  const [reminders, setReminders] = useState<Record<string, TaskReminder[]>>({});
  const [showCustomReminder, setShowCustomReminder] = useState<string | null>(null);
  const [customRemindAt, setCustomRemindAt] = useState('');

  const loadTasks = useCallback(async () => {
    const data = await fetchTasksByDealId(dealId);
    const filtered = (data || []).filter((t: any) => t.status !== 'Cancelled');
    const statusOrder: Record<string, number> = { 'In Progress': 0, 'To Do': 1, 'Done': 2 };
    const sorted = filtered.sort((a: any, b: any) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99));
    setTasks(sorted);
    setLoading(false);
  }, [dealId]);

  useEffect(() => {
    if (!dealId) return;
    loadTasks();
  }, [dealId, loadTasks]);

  // Load reminders when a task is expanded
  useEffect(() => {
    if (!expandedTaskId) return;
    getRemindersByTask(expandedTaskId).then(data => {
      setReminders(prev => ({ ...prev, [expandedTaskId]: (data || []) as TaskReminder[] }));
    });
  }, [expandedTaskId]);

  // ---- Handlers ----

  const handleStatusChange = async (task: any, newStatus: string) => {
    const oldStatus = task.status;
    if (newStatus === oldStatus) return;

    // Optimistic update
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));

    if (newStatus === 'Done' && oldStatus !== 'Done') {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }

    try {
      await updateTaskWithLog(task.id, { status: newStatus });
      onUndoableAction?.({
        type: 'task_status_change',
        label: `${task.title} → ${newStatus}`,
        timestamp: Date.now(),
        revert: async () => {
          await updateTaskWithLog(task.id, { status: oldStatus });
          await loadTasks();
        },
      });
    } catch (err) {
      console.error('Task update failed', err);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: oldStatus } : t));
    }
  };

  const handleDeleteTask = async (task: any) => {
    const prevStatus = task.status;
    setTasks(prev => prev.filter(t => t.id !== task.id));
    try {
      await updateTaskWithLog(task.id, { status: 'Cancelled' });
      onUndoableAction?.({
        type: 'task_status_change',
        label: `Deleted "${task.title}"`,
        timestamp: Date.now(),
        revert: async () => {
          await updateTaskWithLog(task.id, { status: prevStatus });
          await loadTasks();
        },
      });
    } catch (err) {
      console.error('Task delete failed', err);
      await loadTasks();
    }
  };

  const handleAddTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    setIsAdding(true);
    try {
      const newTask = await insertTask({ title, deal_id: dealId, status: 'To Do' });
      setNewTaskTitle('');
      await loadTasks();
      if (newTask?.id) {
        onUndoableAction?.({
          type: 'task_create',
          label: `Created "${title}"`,
          timestamp: Date.now(),
          revert: async () => {
            await updateTaskWithLog(newTask.id, { status: 'Cancelled' });
            await loadTasks();
          },
        });
      }
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setIsAdding(false);
      addInputRef.current?.focus();
    }
  };

  const handleFieldChange = async (taskId: string, field: string, value: any) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, [field]: value } : t));
    try {
      await updateTaskWithLog(taskId, { [field]: value });
    } catch (err) {
      console.error('Task field update failed:', err);
    }
  };

  // ---- Reminder Handlers ----

  const handleAddReminder = async (taskId: string, getDate: () => Date) => {
    try {
      await createReminder(taskId, getDate().toISOString());
      const updated = await getRemindersByTask(taskId);
      setReminders(prev => ({ ...prev, [taskId]: (updated || []) as TaskReminder[] }));
    } catch (err) {
      console.error('Failed to create reminder:', err);
    }
  };

  const handleDeleteReminder = async (taskId: string, reminderId: string) => {
    try {
      await deleteReminder(reminderId);
      setReminders(prev => ({
        ...prev,
        [taskId]: (prev[taskId] || []).filter(r => r.id !== reminderId),
      }));
    } catch (err) {
      console.error('Failed to delete reminder:', err);
    }
  };

  const handleCustomReminder = async (taskId: string) => {
    if (!customRemindAt) return;
    try {
      await createReminder(taskId, new Date(customRemindAt).toISOString());
      const updated = await getRemindersByTask(taskId);
      setReminders(prev => ({ ...prev, [taskId]: (updated || []) as TaskReminder[] }));
      setCustomRemindAt('');
      setShowCustomReminder(null);
    } catch (err) {
      console.error('Failed to create reminder:', err);
    }
  };

  // ---- Derived ----

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'Done').length;
  const progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

  if (loading) return <div className="py-8 text-center text-gray-400 text-caption">Loading tasks...</div>;

  return (
    <div className="space-y-4 py-1">
      {/* Progress Bar */}
      {totalTasks > 0 && (
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
      )}

      {/* Task List */}
      <div className="space-y-1">
        {tasks.filter(t => t.status !== 'Done').map(task => {
          const isExpanded = expandedTaskId === task.id;
          const taskReminders = (reminders[task.id] || []).filter(r => r.status === 'pending');

          return (
            <div key={task.id} className="rounded-md border border-gray-100 overflow-hidden transition-all">
              {/* Collapsed Row */}
              <div
                className={cn(
                  'flex items-center px-3 py-2.5 bg-subtle hover:bg-gray-100 transition-all group cursor-pointer',
                  isExpanded && 'bg-gray-100'
                )}
                onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
              >
                {/* Status dot */}
                <span className={cn(
                  'w-2 h-2 rounded-full flex-shrink-0 mr-2.5',
                  task.status === 'In Progress' ? 'bg-primary' : 'bg-gray-300'
                )} />

                {/* Title */}
                <span className="text-sm font-medium truncate flex-1 text-gray-700">
                  {task.title}
                </span>

                {/* Reminder indicator */}
                {taskReminders.length > 0 && (
                  <Bell size={12} className="text-amber-500 flex-shrink-0 mx-1" />
                )}

                {/* Status dropdown */}
                <select
                  value={task.status}
                  onChange={e => { e.stopPropagation(); handleStatusChange(task, e.target.value); }}
                  onClick={e => e.stopPropagation()}
                  className={cn(
                    'text-micro font-bold px-2 py-1 rounded-md border-0 cursor-pointer outline-none ring-1 ring-inset transition-all flex-shrink-0 ml-2',
                    task.status === 'In Progress' ? 'bg-primary-light text-primary ring-blue-200' :
                    'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50'
                  )}
                >
                  <option value="To Do">To Do</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Done">Done</option>
                </select>

                {/* Delete */}
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteTask(task); }}
                  className="opacity-0 group-hover:opacity-100 ml-1.5 p-1 text-gray-400 hover:text-red-500 rounded transition-all flex-shrink-0"
                  title="Remove task"
                >
                  <Trash2 size={12} />
                </button>

                {/* Expand chevron */}
                <ChevronDown
                  size={14}
                  className={cn(
                    'text-gray-400 transition-transform ml-1 flex-shrink-0',
                    isExpanded && 'rotate-180'
                  )}
                />
              </div>

              {/* Expanded Detail */}
              {isExpanded && (
                <div className="px-3 py-3 bg-white border-t border-gray-100 space-y-3 animate-fade-in">
                  {/* Priority + Due Date + Assignee Row */}
                  <div className="flex flex-wrap gap-2">
                    <div className="flex items-center gap-1.5">
                      <Flag size={12} className="text-gray-400" />
                      <select
                        value={task.priority || 'Medium'}
                        onChange={e => handleFieldChange(task.id, 'priority', e.target.value)}
                        className={cn(
                          'text-micro font-medium px-2 py-1 rounded-md border-0 cursor-pointer outline-none ring-1 ring-inset ring-gray-200',
                          priorityColor[task.priority || 'Medium']
                        )}
                      >
                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-gray-400" />
                      <input
                        type="date"
                        value={task.due_date || ''}
                        onChange={e => handleFieldChange(task.id, 'due_date', e.target.value || null)}
                        className="text-micro border border-gray-200 rounded-md px-2 py-1 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <User size={12} className="text-gray-400" />
                      <input
                        type="text"
                        value={task.assignee || ''}
                        onChange={e => setTasks(prev => prev.map(t => t.id === task.id ? { ...t, assignee: e.target.value } : t))}
                        onBlur={e => handleFieldChange(task.id, 'assignee', e.target.value || null)}
                        placeholder="Assignee"
                        className="text-micro border border-gray-200 rounded-md px-2 py-1 w-24 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* Notes */}
                  <textarea
                    value={task.notes || ''}
                    onChange={e => setTasks(prev => prev.map(t => t.id === task.id ? { ...t, notes: e.target.value } : t))}
                    onBlur={e => handleFieldChange(task.id, 'notes', e.target.value || null)}
                    placeholder="Add notes..."
                    rows={1}
                    className="w-full text-micro border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                  />

                  {/* Reminders */}
                  <div>
                    <label className="text-micro font-medium text-gray-500 mb-1.5 flex items-center gap-1">
                      <Bell size={11} /> Reminders
                    </label>

                    {/* Existing reminders */}
                    {taskReminders.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {taskReminders.map(r => (
                          <div key={r.id} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-md px-2.5 py-1.5">
                            <span className="text-micro text-amber-700">
                              {new Date(r.remind_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </span>
                            <button
                              onClick={() => handleDeleteReminder(task.id, r.id)}
                              className="p-0.5 hover:bg-amber-100 rounded text-amber-400 hover:text-red-500"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quick-pick buttons */}
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      <button
                        onClick={() => handleAddReminder(task.id, () => new Date(Date.now() + 60 * 60 * 1000))}
                        className="text-micro px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium"
                      >
                        1 hour
                      </button>
                      <button
                        onClick={() => handleAddReminder(task.id, () => new Date(Date.now() + 3 * 60 * 60 * 1000))}
                        className="text-micro px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium"
                      >
                        3 hours
                      </button>
                      <button
                        onClick={() => handleAddReminder(task.id, () => {
                          const d = new Date();
                          d.setDate(d.getDate() + 1);
                          d.setHours(9, 0, 0, 0);
                          return d;
                        })}
                        className="text-micro px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium"
                      >
                        Tomorrow 9am
                      </button>
                      <button
                        onClick={() => handleAddReminder(task.id, () => {
                          const d = new Date();
                          const daysUntilMon = ((8 - d.getDay()) % 7) || 7;
                          d.setDate(d.getDate() + daysUntilMon);
                          d.setHours(9, 0, 0, 0);
                          return d;
                        })}
                        className="text-micro px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium"
                      >
                        Next Monday
                      </button>
                    </div>

                    {/* Custom reminder */}
                    {showCustomReminder !== task.id ? (
                      <button
                        onClick={() => { setShowCustomReminder(task.id); setCustomRemindAt(''); }}
                        className="text-micro text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                      >
                        <Plus size={10} /> Custom time
                      </button>
                    ) : (
                      <div className="flex gap-1.5">
                        <input
                          type="datetime-local"
                          value={customRemindAt}
                          onChange={e => setCustomRemindAt(e.target.value)}
                          className="flex-1 text-micro border border-gray-200 rounded-md px-2 py-1 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <button
                          onClick={() => handleCustomReminder(task.id)}
                          disabled={!customRemindAt}
                          className="text-micro px-2 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => { setShowCustomReminder(null); setCustomRemindAt(''); }}
                          className="text-micro px-1.5 py-1 rounded-md text-gray-500 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Completed Tasks — collapsible */}
      {completedTasks > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-1.5 text-caption text-gray-500 hover:text-gray-700 transition-colors py-1"
          >
            <ChevronRight
              size={14}
              className={cn('transition-transform', showCompleted && 'rotate-90')}
            />
            <span className="font-medium">{completedTasks} completed task{completedTasks !== 1 ? 's' : ''}</span>
          </button>
          {showCompleted && (
            <div className="space-y-1 mt-1 animate-fade-in">
              {tasks.filter(t => t.status === 'Done').map(task => (
                <div key={task.id} className="rounded-md border border-gray-100 overflow-hidden">
                  <div
                    className="flex items-center px-3 py-2 bg-subtle hover:bg-gray-100 transition-all group cursor-pointer"
                    onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 mr-2.5" />
                    <span className="text-sm text-gray-400 line-through truncate flex-1">{task.title}</span>
                    <select
                      value={task.status}
                      onChange={e => { e.stopPropagation(); handleStatusChange(task, e.target.value); }}
                      onClick={e => e.stopPropagation()}
                      className="text-micro font-bold px-2 py-1 rounded-md border-0 cursor-pointer outline-none ring-1 ring-inset bg-emerald-50 text-emerald-700 ring-emerald-200 flex-shrink-0 ml-2 transition-all"
                    >
                      <option value="To Do">To Do</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Done">Done</option>
                    </select>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteTask(task); }}
                      className="opacity-0 group-hover:opacity-100 ml-1.5 p-1 text-gray-400 hover:text-red-500 rounded transition-all flex-shrink-0"
                      title="Remove task"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inline Add Task */}
      <div className="flex items-center gap-2">
        <Plus size={14} className="text-gray-400 flex-shrink-0" />
        <input
          ref={addInputRef}
          type="text"
          value={newTaskTitle}
          onChange={e => setNewTaskTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAddTask(); }}
          placeholder="Add a task..."
          disabled={isAdding}
          className="flex-1 text-sm bg-transparent outline-none placeholder-gray-400 text-gray-700 py-1"
        />
        {newTaskTitle.trim() && (
          <button
            onClick={handleAddTask}
            disabled={isAdding}
            className="text-micro font-medium text-primary hover:text-primary/80 px-2 py-0.5 rounded transition-colors disabled:opacity-50"
          >
            {isAdding ? 'Adding...' : 'Add'}
          </button>
        )}
      </div>

      {/* Empty state */}
      {tasks.length === 0 && !loading && (
        <p className="text-center text-gray-400 text-caption italic py-4">
          No tasks yet. Add one above.
        </p>
      )}
    </div>
  );
};
