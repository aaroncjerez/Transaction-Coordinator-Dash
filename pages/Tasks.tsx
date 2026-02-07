import React, { useEffect, useState } from 'react';
import { fetchAllDeals, fetchAllTasks, insertTask, updateTaskFields } from '../lib/database';
import { Task } from '../types';
import { Plus, CheckCircle2, Clock, Loader2, Briefcase, ChevronRight, Search, Filter, Flag } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';
import { Link } from 'react-router-dom';
import { TaskDetailPanel } from '../components/TaskDetailPanel';
import { getStageColor } from '../constants';

type StatusFilter = 'all' | 'To Do' | 'In Progress' | 'Done';
type PriorityFilter = 'all' | 'Urgent' | 'High' | 'Medium' | 'Low';
type SortBy = 'default' | 'due_date' | 'priority' | 'status';

export const Tasks: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [deals, setDeals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState<string | null>(null);
    const [newTaskName, setNewTaskName] = useState('');
    const [expandedDeals, setExpandedDeals] = useState<Set<string>>(new Set());

    // Filters
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<SortBy>('default');

    // Detail panel
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [dealsData, tasksData] = await Promise.all([
                fetchAllDeals(),
                fetchAllTasks()
            ]);

            setDeals(dealsData || []);
            setTasks(tasksData || []);

            const initialExpanded = new Set<string>();
            (dealsData || []).forEach(d => {
                const hasPending = (tasksData || []).some(t => t.deal_id === d.id && t.status !== 'Done');
                if (hasPending) initialExpanded.add(d.id);
            });
            setExpandedDeals(initialExpanded);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const handleCreateTask = async (e: React.FormEvent, dealId?: string) => {
        e.preventDefault();
        if (!newTaskName.trim()) return;

        try {
            const payload: any = {
                task_name: newTaskName,
                status: 'To Do',
            };
            if (dealId) payload.deal_id = dealId;

            await insertTask(payload);
            setNewTaskName('');
            setIsCreating(null);

            const data = await fetchAllTasks();
            setTasks(data || []);
        } catch (error) {
            console.error('Error creating task:', error);
        }
    };

    const toggleTaskStatus = async (task: Task) => {
        const newStatus = task.status === 'Done' ? 'To Do' : 'Done';
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));

        try {
            await updateTaskFields(task.id, { status: newStatus });
        } catch (error) {
            console.error('Error updating task:', error);
            fetchData();
        }
    };

    const toggleDealExpand = (dealId: string) => {
        const newSet = new Set(expandedDeals);
        if (newSet.has(dealId)) newSet.delete(dealId); else newSet.add(dealId);
        setExpandedDeals(newSet);
    };

    // Apply filters
    const filterTasks = (taskList: Task[]) => {
        let filtered = taskList;

        if (statusFilter !== 'all') {
            filtered = filtered.filter(t => t.status === statusFilter);
        }
        if (priorityFilter !== 'all') {
            filtered = filtered.filter(t => (t as any).priority === priorityFilter);
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(t => t.task_name.toLowerCase().includes(q));
        }

        // Sort
        const priorityOrder: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
        const statusOrder: Record<string, number> = { 'In Progress': 0, 'To Do': 1, 'Done': 2 };

        if (sortBy === 'priority') {
            filtered.sort((a, b) => (priorityOrder[(a as any).priority || 'Medium'] || 2) - (priorityOrder[(b as any).priority || 'Medium'] || 2));
        } else if (sortBy === 'due_date') {
            filtered.sort((a, b) => {
                const da = (a as any).due_date || '9999';
                const db = (b as any).due_date || '9999';
                return da.localeCompare(db);
            });
        } else if (sortBy === 'status') {
            filtered.sort((a, b) => (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99));
        } else {
            filtered.sort((a, b) => (a.status === 'Done' ? 1 : -1));
        }

        return filtered;
    };

    // Counts for filter badges
    const pendingCount = tasks.filter(t => t.status !== 'Done').length;
    const doneCount = tasks.filter(t => t.status === 'Done').length;

    const dealsWithTasks = deals.map(deal => {
        const dealTasks = filterTasks(tasks.filter(t => t.deal_id === deal.id));
        return { ...deal, tasks: dealTasks };
    }).sort((a, b) => {
        const isA_Active = !['Closed', 'Dead', 'Cancelled'].includes(a.stage);
        const isB_Active = !['Closed', 'Dead', 'Cancelled'].includes(b.stage);
        if (isA_Active && !isB_Active) return -1;
        if (!isA_Active && isB_Active) return 1;
        return 0;
    });

    const unassignedTasks = filterTasks(tasks.filter(t => !t.deal_id || !deals.find(d => d.id === t.deal_id)));

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50 h-full p-8">
            <div className="max-w-5xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Tasks</h1>
                        <p className="text-sm text-gray-500 mt-0.5">{pendingCount} pending · {doneCount} completed</p>
                    </div>
                </div>

                {/* Filter Bar */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 flex flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search tasks..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>

                    {/* Status Filter */}
                    <div className="flex items-center gap-1">
                        {(['all', 'To Do', 'In Progress', 'Done'] as StatusFilter[]).map(s => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={cn(
                                    "px-3 py-1.5 text-xs rounded-lg font-medium transition-colors",
                                    statusFilter === s
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                                )}
                            >
                                {s === 'all' ? 'All' : s}
                            </button>
                        ))}
                    </div>

                    {/* Priority Filter */}
                    <select
                        value={priorityFilter}
                        onChange={e => setPriorityFilter(e.target.value as PriorityFilter)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="all">All Priorities</option>
                        <option value="Urgent">Urgent</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                    </select>

                    {/* Sort */}
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value as SortBy)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-600 focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="default">Default Sort</option>
                        <option value="due_date">Due Date</option>
                        <option value="priority">Priority</option>
                        <option value="status">Status</option>
                    </select>
                </div>

                {loading ? (
                    <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-400" /></div>
                ) : (
                    <div className="space-y-6">
                        {/* Unassigned Tasks */}
                        {unassignedTasks.length > 0 && (
                            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                    <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                                        <Briefcase size={16} /> General Tasks
                                    </h3>
                                    <Button size="sm" variant="ghost" onClick={() => setIsCreating('global')}>
                                        <Plus size={14} className="mr-1" /> Add Task
                                    </Button>
                                </div>
                                {isCreating === 'global' && (
                                    <div className="p-4 border-b border-gray-100 bg-blue-50/30">
                                        <form onSubmit={(e) => handleCreateTask(e)} className="flex gap-2">
                                            <input autoFocus className="flex-1 border rounded px-3 py-1 text-sm outline-none ring-2 ring-blue-100"
                                                value={newTaskName} onChange={e => setNewTaskName(e.target.value)} placeholder="New global task..." />
                                            <Button size="sm" type="submit">Save</Button>
                                            <Button size="sm" variant="ghost" type="button" onClick={() => setIsCreating(null)}>Cancel</Button>
                                        </form>
                                    </div>
                                )}
                                <div className="divide-y divide-gray-100">
                                    {unassignedTasks.map(task => (
                                        <TaskRow key={task.id} task={task} onToggle={() => toggleTaskStatus(task)} onClick={() => setSelectedTaskId(task.id)} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Deal Lists */}
                        {dealsWithTasks.map(deal => {
                            const sc = getStageColor(deal.stage);
                            return (
                            <div key={deal.id} className={cn("bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all border-l-4", sc.border)}>
                                <div
                                    className="p-4 bg-white hover:bg-gray-50 transition-colors cursor-pointer flex items-center justify-between group"
                                    onClick={() => toggleDealExpand(deal.id)}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn("transition-transform duration-200", expandedDeals.has(deal.id) ? "rotate-90" : "")}>
                                            <ChevronRight size={18} className="text-gray-400" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-900">{deal.deal_name || "Untitled Deal"}</h3>
                                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                                <span className={cn("px-2 py-0.5 rounded-full font-medium", sc.light, sc.lightText)}>
                                                    {deal.stage || 'Lead'}
                                                </span>
                                                <span>&middot;</span>
                                                <Link to={`/deals/${deal.id}`} onClick={e => e.stopPropagation()} className="hover:text-blue-600 hover:underline">
                                                    View Deal
                                                </Link>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-sm text-gray-500 mr-2">
                                            {deal.tasks.filter((t: any) => t.status !== 'Done').length} pending
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={(e) => { e.stopPropagation(); setIsCreating(isCreating === deal.id ? null : deal.id); setExpandedDeals(prev => new Set(prev).add(deal.id)); }}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Plus size={14} className="mr-1" /> Add Task
                                        </Button>
                                    </div>
                                </div>

                                {expandedDeals.has(deal.id) && (
                                    <div className="border-t border-gray-100 bg-gray-50/30">
                                        {isCreating === deal.id && (
                                            <div className="p-4 border-b border-gray-100 bg-white animate-in slide-in-from-top-1">
                                                <form onSubmit={(e) => handleCreateTask(e, deal.id)} className="flex gap-2">
                                                    <input autoFocus className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                        value={newTaskName} onChange={e => setNewTaskName(e.target.value)} placeholder={`Add task for ${deal.deal_name}...`} />
                                                    <Button size="sm" type="submit">Add</Button>
                                                    <Button size="sm" variant="ghost" type="button" onClick={() => setIsCreating(null)}>Cancel</Button>
                                                </form>
                                            </div>
                                        )}

                                        {deal.tasks.length === 0 ? (
                                            <div className="p-6 text-center text-sm text-gray-400 italic">
                                                No tasks tracked for this deal yet.
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-gray-100 border-b border-gray-100">
                                                {deal.tasks.map((task: any) => (
                                                    <TaskRow key={task.id} task={task} onToggle={() => toggleTaskStatus(task)} onClick={() => setSelectedTaskId(task.id)} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Task Detail Panel */}
            <TaskDetailPanel
                taskId={selectedTaskId}
                onClose={() => setSelectedTaskId(null)}
                onUpdate={fetchData}
            />
        </div>
    );
};

const priorityColors: Record<string, string> = {
    Urgent: 'bg-red-100 text-red-700 border-red-200',
    High: 'bg-orange-100 text-orange-700 border-orange-200',
    Medium: 'bg-blue-50 text-blue-600 border-blue-200',
    Low: 'bg-gray-100 text-gray-500 border-gray-200',
};

const TaskRow: React.FC<{ task: Task; onToggle: () => void; onClick?: () => void }> = ({ task, onToggle, onClick }) => {
    const isOverdue = (task as any).due_date && new Date((task as any).due_date) < new Date() && task.status !== 'Done';

    return (
        <div
            className="p-3 pl-12 pr-4 flex items-center gap-3 hover:bg-white transition-colors group bg-white cursor-pointer"
            onClick={onClick}
        >
            <button
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                className={cn(
                    "flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-all",
                    task.status === 'Done' ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-300 hover:border-blue-500 text-transparent"
                )}
            >
                <CheckCircle2 size={12} fill="currentColor" />
            </button>
            <span className={cn(
                "flex-1 text-sm font-medium transition-colors",
                task.status === 'Done' ? "text-gray-400 line-through" : "text-gray-700"
            )}>
                {task.task_name}
            </span>

            {/* Priority Badge */}
            {(task as any).priority && (task as any).priority !== 'Medium' && (
                <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border", priorityColors[(task as any).priority] || '')}>
                    {(task as any).priority}
                </span>
            )}

            {/* Due Date */}
            {(task as any).due_date && task.status !== 'Done' && (
                <span className={cn(
                    "text-xs flex items-center gap-1",
                    isOverdue ? "text-red-600 font-medium" : "text-gray-400"
                )}>
                    <Clock size={10} />
                    {new Date((task as any).due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
            )}

            {task.status !== 'Done' && !(task as any).due_date && !(task as any).priority && (
                <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                    Pending
                </span>
            )}
        </div>
    );
};
