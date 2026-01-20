import React, { useState, useEffect } from 'react';
import { FileText, MessageSquare, CheckCircle, ChevronDown, Paperclip, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { DEAL_STAGES } from '../constants';

interface DealOverviewCardProps {
    deal: any;
    onStageUpdate: (dealId: string, newStage: string) => void;
}

const ATTACHMENT_FIELDS = [
    { key: 'purchase_agreement_files', label: 'Purchase Agreement' },
    { key: 'deed_files', label: 'Deed' },
    { key: 'sale_contract_files', label: 'Sale Contract' },
    { key: 'hud_files', label: 'HUD' }
];



export const DealOverviewCard: React.FC<DealOverviewCardProps> = ({ deal, onStageUpdate }) => {
    const [tasks, setTasks] = useState<any[]>([]);
    const [loadingTasks, setLoadingTasks] = useState(true);
    const [isUpdatingStage, setIsUpdatingStage] = useState(false);

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

    const handleStageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newStage = e.target.value;
        setIsUpdatingStage(true);
        try {
            await onStageUpdate(deal.id, newStage);
        } finally {
            setIsUpdatingStage(false);
        }
    };

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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-4">

            {/* Header: Name & Type */}
            <div className="flex justify-between items-start">
                <div>
                    <h3 className="font-bold text-gray-900 line-clamp-1 text-lg">{dealName}</h3>
                    <p className="text-sm text-gray-500 font-medium mt-0.5">
                        {deal.deal_type || 'Unclassified Type'}
                    </p>
                </div>
                <Link to={`/deals/${deal.id}`} className="text-gray-400 hover:text-blue-600 transition-colors">
                    <ArrowUpRightIcon />
                </Link>
            </div>

            {/* Stage Selector */}
            <div className="relative">
                <select
                    value={deal.stage || 'Lead'}
                    onChange={handleStageChange}
                    disabled={isUpdatingStage}
                    className="w-full appearance-none bg-blue-50/50 border border-blue-100 text-blue-700 text-sm font-medium py-2 px-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50"
                >
                    {DEAL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-2.5 text-blue-400 pointer-events-none" size={16} />
                {isUpdatingStage && <Loader2 className="absolute right-8 top-2.5 animate-spin text-blue-600" size={16} />}
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
        </div>
    );
};

const ArrowUpRightIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 17L17 7" /><path d="M7 7h10v10" />
    </svg>
);
