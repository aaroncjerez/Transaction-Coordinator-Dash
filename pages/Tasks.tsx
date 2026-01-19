import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Task } from '../types';
import { Plus, CheckCircle2, Circle, Clock, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/Button';

export const Tasks: React.FC = () => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');
    const [isCreating, setIsCreating] = useState(false);
    const [newTaskName, setNewTaskName] = useState('');

    const fetchTasks = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('tasks_vault')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setTasks(data || []);
        } catch (error) {
            console.error('Error fetching tasks:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, []);

    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTaskName.trim()) return;

        try {
            const { error } = await supabase
                .from('tasks_vault')
                .insert([{
                    task_name: newTaskName,
                    status: 'To Do',
                    airtable_id: `temp-${Date.now()}` // Temporary until Airtable sync
                }]);

            if (error) throw error;
            setNewTaskName('');
            setIsCreating(false);
            fetchTasks();
        } catch (error) {
            console.error('Error creating task:', error);
        }
    };

    const toggleTaskStatus = async (task: Task) => {
        const newStatus = task.status === 'Done' ? 'To Do' : 'Done';
        // Optimistic update
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));

        try {
            const { error } = await supabase
                .from('tasks_vault')
                .update({ status: newStatus })
                .eq('id', task.id);
            if (error) throw error;
        } catch (error) {
            console.error('Error updating task:', error);
            fetchTasks(); // Revert on error
        }
    };

    const filteredTasks = tasks.filter(t => {
        if (filter === 'done') return t.status === 'Done';
        if (filter === 'pending') return t.status !== 'Done';
        return true;
    });

    return (
        <div className="flex-1 overflow-y-auto bg-gray-50 h-full p-8">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
                        <p className="text-gray-500">Manage your to-dos across all deals</p>
                    </div>
                    <Button onClick={() => setIsCreating(true)}>
                        <Plus size={16} className="mr-2" />
                        Add Task
                    </Button>
                </div>

                {/* Create Task Inline Form */}
                {isCreating && (
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm animate-in slide-in-from-top-2">
                        <form onSubmit={handleCreateTask} className="flex gap-4">
                            <input
                                autoFocus
                                type="text"
                                value={newTaskName}
                                onChange={(e) => setNewTaskName(e.target.value)}
                                placeholder="What needs to be done?"
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className="flex gap-2">
                                <Button type="submit" variant="primary" size="sm">Save</Button>
                                <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreating(false)}>Cancel</Button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Filters */}
                <div className="flex gap-2 border-b border-gray-200 pb-1">
                    <button
                        onClick={() => setFilter('all')}
                        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${filter === 'all' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilter('pending')}
                        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${filter === 'pending' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Pending
                    </button>
                    <button
                        onClick={() => setFilter('done')}
                        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${filter === 'done' ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Completed
                    </button>
                </div>

                {/* Task List */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                    {loading ? (
                        <div className="p-8 flex justify-center text-gray-400">
                            <Loader2 className="animate-spin" />
                        </div>
                    ) : filteredTasks.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                                <CheckCircle2 className="text-gray-400" />
                            </div>
                            <h3 className="text-gray-900 font-medium">No tasks found</h3>
                            <p className="text-gray-500 text-sm mt-1">You're all caught up!</p>
                        </div>
                    ) : (
                        filteredTasks.map(task => (
                            <div key={task.id} className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors group">
                                <button
                                    onClick={() => toggleTaskStatus(task)}
                                    className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${task.status === 'Done'
                                            ? 'bg-emerald-500 border-emerald-500 text-white'
                                            : 'border-gray-300 text-transparent hover:border-blue-500'
                                        }`}
                                >
                                    <CheckCircle2 size={14} fill="currentColor" />
                                </button>

                                <div className="flex-1 min-w-0">
                                    <p className={`font-medium truncate transition-all ${task.status === 'Done' ? 'text-gray-400 line-through' : 'text-gray-900'
                                        }`}>
                                        {task.task_name}
                                    </p>
                                    {task.deal_id && (
                                        <div className="flex items-center gap-1 mt-1">
                                            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                                Linked Deal
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center gap-4 text-gray-400 text-sm">
                                    {task.status !== 'Done' && (
                                        <span className="hidden group-hover:flex items-center gap-1 text-orange-500 bg-orange-50 px-2 py-1 rounded-full text-xs font-medium">
                                            <Clock size={12} /> Pending
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

            </div>
        </div>
    );
};
