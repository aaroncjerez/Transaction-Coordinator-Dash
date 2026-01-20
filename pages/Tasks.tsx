import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Task } from '../types';
import { Plus, CheckCircle2, Circle, Clock, Loader2, Briefcase, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';
import { Link } from 'react-router-dom';

export const Tasks: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [deals, setDeals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isCreating, setIsCreating] = useState<string | null>(null); // deal_id or 'global'
    const [newTaskName, setNewTaskName] = useState('');
    const [expandedDeals, setExpandedDeals] = useState<Set<string>>(new Set());

    const fetchData = async () => {
        try {
            setLoading(true);
            const [dealsRes, tasksRes] = await Promise.all([
                supabase.from('deal_vault').select('*'),
                supabase.from('tasks_vault').select('*').order('created_at', { ascending: false })
            ]);

            if (dealsRes.error) throw dealsRes.error;
            if (tasksRes.error) throw tasksRes.error;

            setDeals(dealsRes.data || []);
            setTasks(tasksRes.data || []);

            // Auto-expand deals with pending tasks
            const initialExpanded = new Set<string>();
            (dealsRes.data || []).forEach(d => {
                const hasPending = (tasksRes.data || []).some(t => t.deal_airtable_id === d.airtable_id && t.status !== 'Done');
                if (hasPending) initialExpanded.add(d.id);
            });
            setExpandedDeals(initialExpanded);

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleCreateTask = async (e: React.FormEvent, dealAirtableId?: string) => {
        e.preventDefault();
        if (!newTaskName.trim()) return;

        try {
            const payload: any = {
                task_name: newTaskName,
                status: 'To Do',
                airtable_id: `temp-${Date.now()}`
            };
            if (dealAirtableId) {
                payload.deal_airtable_id = dealAirtableId;
            }

            const { error } = await supabase
                .from('tasks_vault')
                .insert([payload]);

            if (error) throw error;
            setNewTaskName('');
            setIsCreating(null);

            // Refresh tasks only
            const { data } = await supabase.from('tasks_vault').select('*').order('created_at', { ascending: false });
            setTasks(data || []);
        } catch (error) {
            console.error('Error creating task:', error);
        }
    };

    const toggleTaskStatus = async (task: Task) => {
        const newStatus = task.status === 'Done' ? 'To Do' : 'Done';
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));

        try {
            const { error } = await supabase
                .from('tasks_vault')
                .update({ status: newStatus })
                .eq('id', task.id);
            if (error) throw error;
        } catch (error) {
            console.error('Error updating task:', error);
            fetchData();
        }
    };

    const toggleDealExpand = (dealId: string) => {
        const newSet = new Set(expandedDeals);
        if (newSet.has(dealId)) {
            newSet.delete(dealId);
        } else {
            newSet.add(dealId);
        }
        setExpandedDeals(newSet);
    };

    // Grouping Logic
    const dealsWithTasks = deals.map(deal => {
        const dealTasks = tasks.filter(t => t.deal_airtable_id === deal.airtable_id);
        // Sort tasks: To Do first
        dealTasks.sort((a, b) => (a.status === 'Done' ? 1 : -1));
        return { ...deal, tasks: dealTasks };
    }).sort((a, b) => { // Sort deals: those with tasks first? or by date?
        // Maybe sort active deals first
        const isA_Active = !['Closed', 'Dead', 'Cancelled'].includes(a.stage);
        const isB_Active = !['Closed', 'Dead', 'Cancelled'].includes(b.stage);
        if (isA_Active && !isB_Active) return -1;
        if (!isA_Active && isB_Active) return 1;
        return 0; // Keep DB order (created_at)
    });

    const unassignedTasks = tasks.filter(t => !t.deal_airtable_id || !deals.find(d => d.airtable_id === t.deal_airtable_id));

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50 h-full p-8">
            <div className="max-w-5xl mx-auto space-y-8">

                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Task Dashboard</h1>
                        <p className="text-gray-500">Track tasks by transaction</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center p-12"><Loader2 className="animate-spin text-gray-400" /></div>
                ) : (
                    <div className="space-y-6">

                        {/* Unassigned Tasks Section */}
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
                                        <TaskRow key={task.id} task={task} onToggle={() => toggleTaskStatus(task)} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Deal Lists */}
                        {dealsWithTasks.map(deal => (
                            <div key={deal.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all">
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
                                                <span className={cn(
                                                    "px-2 py-0.5 rounded-full font-medium",
                                                    deal.stage === 'Closed' ? "bg-green-100 text-green-700" :
                                                        deal.stage === 'Under Contract' ? "bg-blue-100 text-blue-700" :
                                                            "bg-gray-100 text-gray-700"
                                                )}>
                                                    {deal.stage || 'Lead'}
                                                </span>
                                                <span>•</span>
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
                                            onClick={(e) => { e.stopPropagation(); setIsCreating(deal.id === isCreating ? null : deal.airtable_id); setExpandedDeals(prev => new Set(prev).add(deal.id)); }}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Plus size={14} className="mr-1" /> Add Task
                                        </Button>
                                    </div>
                                </div>

                                {/* Task Section */}
                                {expandedDeals.has(deal.id) && (
                                    <div className="border-t border-gray-100 bg-gray-50/30">
                                        {isCreating === deal.airtable_id && (
                                            <div className="p-4 border-b border-gray-100 bg-white animate-in slide-in-from-top-1">
                                                <form onSubmit={(e) => handleCreateTask(e, deal.airtable_id)} className="flex gap-2">
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
                                                    <TaskRow key={task.id} task={task} onToggle={() => toggleTaskStatus(task)} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const TaskRow: React.FC<{ task: Task; onToggle: () => void }> = ({ task, onToggle }) => (
    <div className="p-3 pl-12 pr-4 flex items-center gap-3 hover:bg-white transition-colors group bg-white">
        <button
            onClick={onToggle}
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
        {task.status !== 'Done' && (
            <span className="text-xs text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                Pending
            </span>
        )}
    </div>
);
