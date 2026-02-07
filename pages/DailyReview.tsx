import React, { useEffect, useState } from 'react';
import { fetchDailyLeads, updateLeadCompleted } from '../lib/database';
import { Loader2, CheckCircle, AlertCircle, MessageSquare, Eye } from 'lucide-react';
import { LeadDetailModal } from '../components/LeadDetailModal';

interface DailyLead {
    id: number;
    fub_id: number;
    name: string;
    stage: string;
    score: number;
    summary: string;
    rationale: string;
    recommended_follow_up: string;
    action_required: boolean;
    is_completed: boolean;
}

type ViewFilter = 'all' | 'pending' | 'completed';

export const DailyReview: React.FC = () => {
    const [leads, setLeads] = useState<DailyLead[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLead, setSelectedLead] = useState<DailyLead | null>(null);
    const [viewFilter, setViewFilter] = useState<ViewFilter>('pending');

    useEffect(() => {
        fetchLeads();
    }, []);

    async function fetchLeads() {
        setLoading(true);
        const data = await fetchDailyLeads();
        if (data) setLeads(data);
        setLoading(false);
    }

    async function toggleComplete(id: number, current: boolean) {
        try {
            await updateLeadCompleted(id, !current);
            setLeads(leads.map(l => l.id === id ? { ...l, is_completed: !current } : l));
        } catch (err) {
            console.error('Error toggling lead:', err);
        }
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const filteredLeads = leads.filter(lead => {
        if (viewFilter === 'pending') return !lead.is_completed;
        if (viewFilter === 'completed') return lead.is_completed;
        return true;
    });

    const pendingCount = leads.filter(l => !l.is_completed).length;
    const completedCount = leads.filter(l => l.is_completed).length;

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="flex justify-between items-center px-4 md:px-0">
                <div>
                    <h1 className="text-2xl font-bold">Daily Lead Review</h1>
                    <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full font-medium">{pendingCount} pending</span>
                        <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">{completedCount} done</span>
                    </div>
                </div>
                <button onClick={fetchLeads} className="text-sm text-blue-600 hover:underline">Refresh</button>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 px-4 md:px-0">
                {(['pending', 'all', 'completed'] as ViewFilter[]).map(f => (
                    <button
                        key={f}
                        onClick={() => setViewFilter(f)}
                        className={`px-4 py-2 text-xs rounded-lg font-medium transition-colors capitalize ${
                            viewFilter === f
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                        }`}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {/* Lead Cards */}
            <div className="space-y-4 px-4 md:px-0">
                {filteredLeads.map(lead => (
                    <div
                        key={lead.id}
                        className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${
                            lead.is_completed
                                ? 'opacity-50 grayscale bg-gray-50 border-gray-200'
                                : lead.action_required
                                    ? 'border-red-200 bg-red-50/50'
                                    : 'border-gray-200 bg-white'
                        }`}
                        onClick={() => setSelectedLead(lead)}
                    >
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                                {/* Score Circle */}
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 flex-shrink-0 ${
                                    lead.score >= 8 ? 'text-red-600 bg-red-50 border-red-200'
                                    : lead.score >= 5 ? 'text-orange-600 bg-orange-50 border-orange-200'
                                    : 'text-gray-600 bg-gray-50 border-gray-200'
                                }`}>
                                    {lead.score}
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900">{lead.name}</h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-xs text-gray-500">{lead.stage}</span>
                                        {lead.action_required && !lead.is_completed && (
                                            <span className="text-xs text-red-600 font-bold flex items-center">
                                                <AlertCircle size={10} className="mr-0.5" /> Action Required
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <Eye size={16} className="text-gray-300 mt-1" />
                        </div>

                        {!lead.is_completed && (
                            <>
                                <p className="text-gray-700 mt-3 text-sm line-clamp-2">{lead.summary}</p>

                                {lead.recommended_follow_up && (
                                    <div className="mt-3 bg-blue-50 p-3 rounded-lg text-sm text-blue-900 border border-blue-100">
                                        <div className="flex gap-2">
                                            <MessageSquare size={14} className="mt-0.5 flex-shrink-0 text-blue-500" />
                                            <div className="flex-1">
                                                <span className="font-semibold block text-[10px] uppercase text-blue-600 mb-0.5">Draft Message</span>
                                                <span className="line-clamp-2">"{lead.recommended_follow_up}"</span>
                                            </div>
                                        </div>
                                        <div className="mt-2 flex justify-end gap-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); copyToClipboard(lead.recommended_follow_up); }}
                                                className="text-xs bg-white border border-blue-200 px-2 py-1 rounded text-blue-600 hover:bg-blue-50 font-medium"
                                            >
                                                Copy
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="mt-4 flex justify-end">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); toggleComplete(lead.id, lead.is_completed); }}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-black transition-colors text-sm font-medium"
                                    >
                                        <CheckCircle size={14} />
                                        Mark as Done
                                    </button>
                                </div>
                            </>
                        )}

                        {lead.is_completed && (
                            <div className="mt-2 flex justify-between items-center text-sm text-green-700 bg-green-50 p-2 rounded-lg">
                                <span className="flex items-center gap-2"><CheckCircle size={14} /> Completed</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleComplete(lead.id, lead.is_completed); }}
                                    className="text-xs text-gray-500 underline"
                                >
                                    Undo
                                </button>
                            </div>
                        )}
                    </div>
                ))}

                {filteredLeads.length === 0 && (
                    <div className="text-center text-gray-500 mt-10">
                        {viewFilter === 'pending' ? 'All leads reviewed!' :
                         viewFilter === 'completed' ? 'No completed leads yet.' :
                         'No leads to review today.'}
                    </div>
                )}
            </div>

            {/* Lead Detail Modal */}
            <LeadDetailModal
                lead={selectedLead}
                onClose={() => setSelectedLead(null)}
                onToggleComplete={toggleComplete}
            />
        </div>
    );
};
