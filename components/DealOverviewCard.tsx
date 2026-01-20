import React, { useState, useEffect } from 'react';
import { FileText, MessageSquare, CheckCircle, ChevronDown, Paperclip, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { DEAL_STAGES } from '../constants';

interface DealOverviewCardProps {
    deal: any;
    onStageUpdate: (dealId: string, newStage: string) => void;
    onDelete?: (dealId: string) => void;
}

const ATTACHMENT_FIELDS = [
    { key: 'purchase_agreement_files', label: 'Purchase Agreement' },
    { key: 'deed_files', label: 'Deed' },
    { key: 'sale_contract_files', label: 'Sale Contract' },
    { key: 'hud_files', label: 'HUD' }
];



export const DealOverviewCard: React.FC<DealOverviewCardProps> = ({ deal, onStageUpdate, onDelete }) => {
    const [tasks, setTasks] = useState<any[]>([]);
    const [loadingTasks, setLoadingTasks] = useState(true);

    // Fetch Linked Tasks
    useEffect(() => {
        const fetchTasks = async () => {
            if (!deal.airtable_id) return;
            const { data } = await supabase
                .from('tasks_vault')
                .select('*')
                .eq('deal_airtable_id', deal.airtable_id)
                .neq('status', 'Done')
                .limit(3);
            setTasks(data || []);
            setLoadingTasks(false);
        };
        fetchTasks();
    }, [deal.airtable_id]);


    const handleCompleteTask = async (taskId: string) => {
        // Optimistic update
        setTasks(prev => prev.filter(t => t.id !== taskId));
        await supabase.from('tasks_vault').update({ status: 'Done' }).eq('id', taskId);
    };

    // Calculate file counts
    const fileCount = ATTACHMENT_FIELDS.reduce((acc, field) => {
        return acc + (deal[field.key] ? JSON.parse(JSON.stringify(deal[field.key])).length : 0);
    }, 0);

    const dealName = deal.deal_name || 'Untitled Deal';

    return (
        <div className="bg-white rounded-2xl shadow-soft hover:shadow-card transition-all duration-300 p-6 flex flex-col gap-5 border border-transparent hover:border-gray-100">

            {/* Header: Name & Type */}
            <div>
                <h3 className="font-bold text-gray-900 line-clamp-1 text-lg">{dealName}</h3>
                <p className="text-sm text-gray-500 font-medium mt-0.5">
                    {deal.deal_type || 'Unclassified Type'}
                </p>
            </div>
            <div className="flex items-center gap-1">
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        if (confirm('Are you sure you want to delete this deal? This cannot be undone.')) {
                            onDelete && onDelete(deal.id);
                        }
                    }}
                    className="text-gray-300 hover:text-red-500 transition-colors p-1"
                    title="Delete Deal"
                >
                    <Trash2 size={16} />
                </button>
                <Link to={`/deals/${deal.id}`} className="text-gray-400 hover:text-blue-600 transition-colors p-1">
                    <ArrowUpRightIcon />
                </Link>
            </div>


            {/* Stage Badge */}
            <div className="relative">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {deal.stage || 'Unknown'}
                </span>
            </div>

            {/* Quick Tasks */}
            <div className="flex-1">
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Pending Tasks</h4>
                <div className="space-y-2 min-h-[80px]">
                    {loadingTasks ? (
                        <div className="space-y-2">
                            <div className="h-6 bg-gray-100 rounded animate-pulse w-3/4"></div>
                            <div className="h-6 bg-gray-100 rounded animate-pulse w-1/2"></div>
                        </div>
                    ) : tasks.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">No pending tasks.</p>
                    ) : (
                        tasks.map(task => (
                            <div key={task.id} className="flex items-start gap-2 group">
                                <button
                                    onClick={() => handleCompleteTask(task.id)}
                                    className="mt-0.5 text-gray-300 hover:text-emerald-500 transition-colors"
                                >
                                    <CheckCircle size={14} />
                                </button>
                                <span className="text-sm text-gray-700 line-clamp-1 group-hover:text-gray-900">{task.task_name}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Footer: Files & Chat */}
            <div className="flex items-center justify-between border-t border-gray-100 pt-3 mt-auto">
                <div className="flex items-center gap-1 text-gray-500 text-xs">
                    <Paperclip size={14} />
                    <span>{fileCount} Files</span>
                </div>
            </div>
        </div >
    );
};

const ArrowUpRightIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 17L17 7" /><path d="M7 7h10v10" />
    </svg>
);
