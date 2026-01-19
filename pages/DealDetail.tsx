import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Edit2, Calendar, DollarSign, ExternalLink, X, Check, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DealChat } from '../components/DealChat';

// Data Types
interface FUBEvent {
    type: 'text' | 'note' | 'call';
    content: string;
    created_at: string;
}

interface DealDetailData {
    id: string;
    deal_name: string;
    stage: string;
    county: string;
    state: string;
    purchase_price: number;
    expected_sales_price: number;
    contract_date: string;
    close_date: string;
    phone_number: string;
    notes: string;
    // File Vault
    files: Array<{ name: string; url: string; type: 'purchase' | 'deed' | 'plat' | 'other' }>;
    // FUB Timeline
    fub_history: FUBEvent[];
}

const STAGES = [
    'New',
    'Follow Up',
    'Under Contract',
    'Inspection Period',
    'Awaiting Closing',
    'Closed',
    'Dead',
    'Cancelled'
];

export const DealDetail: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [deal, setDeal] = useState<DealDetailData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'details' | 'files' | 'fub' | 'assistant'>('details');

    // Stage Editing State
    const [isEditingStage, setIsEditingStage] = useState(false);
    const [selectedStage, setSelectedStage] = useState('');
    const [updatingStage, setUpdatingStage] = useState(false);

    useEffect(() => {
        if (id) {
            fetchDealData(id);
        }
    }, [id]);

    const fetchDealData = async (dealId: string) => {
        try {
            setLoading(true);

            // 1. Fetch Deal Details
            const { data: dealData, error: dealError } = await supabase
                .from('deal_vault')
                .select('*')
                .eq('id', dealId)
                .single();

            if (dealError) throw dealError;
            if (!dealData) throw new Error('Deal not found');

            // 2. Fetch FUB History (if phone number exists)
            let fubHistory: FUBEvent[] = [];
            if (dealData.phone_number) {
                const { data: fubData, error: fubError } = await supabase
                    .from('fub_cache')
                    .select('history_json')
                    .eq('phone_number', dealData.phone_number)
                    .maybeSingle();

                if (!fubError && fubData && fubData.history_json) {
                    // Assuming history_json is an array of events matches our interface or needs mapping
                    // The schema comment said "Stores list of last 10 events/texts"
                    // We'll cast it for now, but in a real app might need validation
                    fubHistory = fubData.history_json as FUBEvent[];
                }
            }

            // 3. Aggregate Files
            const files: DealDetailData['files'] = [];
            const fileCategories = [
                { key: 'purchase_agreement_files', type: 'purchase' },
                { key: 'deed_files', type: 'deed' },
                { key: 'plat_files', type: 'plat' },
                { key: 'sale_contract_files', type: 'other' },
                { key: 'soil_test_files', type: 'other' },
                { key: 'hud_files', type: 'other' },
                { key: 'funding_agreement_files', type: 'other' },
            ] as const;

            fileCategories.forEach(cat => {
                const catFiles = dealData[cat.key];
                if (Array.isArray(catFiles)) {
                    catFiles.forEach((f: any) => {
                        if (f && f.url) {
                            files.push({
                                name: f.filename || f.name || 'Unnamed File',
                                url: f.url,
                                type: cat.type
                            });
                        }
                    });
                }
            });

            // 4. Transform to State
            setDeal({
                id: dealData.id,
                deal_name: dealData.deal_type || 'Unnamed Deal',
                stage: dealData.stage || 'New',
                county: dealData.county || '',
                state: dealData.state || '',
                purchase_price: dealData.purchase_price || 0,
                expected_sales_price: dealData.expected_sales_price || 0,
                contract_date: dealData.contract_execution_date || 'TBD',
                close_date: dealData.close_date || 'TBD',
                phone_number: dealData.phone_number || '',
                notes: dealData.notes || '',
                files: files,
                fub_history: fubHistory
            });

        } catch (error) {
            console.error('Error fetching deal details:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStage = async () => {
        if (!deal || !selectedStage) return;

        try {
            setUpdatingStage(true);
            const { error } = await supabase
                .from('deal_vault')
                .update({ stage: selectedStage })
                .eq('id', deal.id);

            if (error) throw error;

            // Optimistic update
            setDeal(prev => prev ? { ...prev, stage: selectedStage } : null);
            setIsEditingStage(false);
        } catch (error) {
            console.error('Error updating stage:', error);
            alert('Failed to update stage. Please try again.');
        } finally {
            setUpdatingStage(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading deal details...</div>;
    if (!deal) return <div className="p-8 text-center text-red-500">Deal not found.</div>;

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <ArrowLeft size={20} className="text-gray-600" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">{deal.deal_name}</h1>
                    <div className="flex items-center gap-3 mt-1">
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-medium">{deal.stage}</span>
                        <span className="text-sm text-gray-500">{deal.county}, {deal.state}</span>
                    </div>
                </div>
                <div className="ml-auto flex gap-2">
                    <button
                        onClick={() => {
                            setSelectedStage(deal.stage);
                            setIsEditingStage(true);
                        }}
                        className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
                    >
                        <Edit2 size={16} /> Edit Stage
                    </button>
                </div>
            </div>

            {/* Stage Edit Modal */}
            {isEditingStage && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-96 max-w-full">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Update Stage</h3>
                            <button onClick={() => setIsEditingStage(false)} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-700">Select New Stage</label>
                            <div className="grid grid-cols-1 gap-2">
                                {STAGES.map((stage) => (
                                    <button
                                        key={stage}
                                        onClick={() => setSelectedStage(stage)}
                                        className={`px-4 py-2 text-left rounded-md text-sm transition-colors ${selectedStage === stage
                                            ? 'bg-blue-50 text-blue-700 font-medium border border-blue-200'
                                            : 'hover:bg-gray-50 text-gray-700 border border-transparent'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            {stage}
                                            {selectedStage === stage && <Check size={16} />}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={() => setIsEditingStage(false)}
                                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdateStage}
                                disabled={updatingStage}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                            >
                                {updatingStage ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="border-b border-gray-200">
                <div className="flex gap-6">
                    <button
                        onClick={() => setActiveTab('details')}
                        className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'details' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Details
                    </button>
                    <button
                        onClick={() => setActiveTab('files')}
                        className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'files' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        File Vault
                    </button>
                    <button
                        onClick={() => setActiveTab('fub')}
                        className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'fub' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        FUB Timeline
                    </button>
                    <button
                        onClick={() => setActiveTab('assistant')}
                        className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'assistant' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        <div className="flex items-center gap-2">
                            <Sparkles size={16} />
                            Assistant
                        </div>
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-h-[400px] ${activeTab === 'assistant' ? 'bg-gray-50 border-none shadow-none p-0' : ''}`}>
                {activeTab === 'details' && (
                    <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Financials</h3>
                            <div className="flex justify-between py-2 border-b border-gray-100">
                                <span className="text-gray-500 flex items-center gap-2"><DollarSign size={16} /> Purchase Price</span>
                                <span className="font-medium">${deal.purchase_price.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-gray-100">
                                <span className="text-gray-500 flex items-center gap-2"><DollarSign size={16} /> Expected Sales</span>
                                <span className="font-medium">${deal.expected_sales_price.toLocaleString()}</span>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Dates & Contacts</h3>
                            <div className="flex justify-between py-2 border-b border-gray-100">
                                <span className="text-gray-500 flex items-center gap-2"><Calendar size={16} /> Contract Date</span>
                                <span className="font-medium">{deal.contract_date}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-gray-100">
                                <span className="text-gray-500 flex items-center gap-2"><Calendar size={16} /> Close Date</span>
                                <span className="font-medium">{deal.close_date}</span>
                            </div>
                            <div className="flex justify-between py-2 border-b border-gray-100">
                                <span className="text-gray-500 flex items-center gap-2">📱 Phone</span>
                                <span className="font-medium">{deal.phone_number}</span>
                            </div>
                        </div>

                        <div className="col-span-2 mt-4">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">Notes</h3>
                            <p className="text-gray-600 bg-gray-50 p-4 rounded-lg text-sm leading-relaxed">
                                {deal.notes || 'No notes available.'}
                            </p>
                        </div>
                    </div>
                )}

                {activeTab === 'files' && (
                    <div className="space-y-4">
                        {deal.files.map((file, idx) => (
                            <div key={idx} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 group">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                                        <FileText size={20} />
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">{file.name}</p>
                                        <p className="text-xs text-gray-500 capitalize">{file.type}</p>
                                    </div>
                                </div>
                                <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    View <ExternalLink size={14} />
                                </a>
                            </div>
                        ))}
                        {deal.files.length === 0 && <p className="text-gray-500 italic">No files attached.</p>}
                    </div>
                )}

                {activeTab === 'fub' && (
                    <div className="relative border-l-2 border-gray-200 ml-3 space-y-8 pl-8 py-2">
                        {deal.fub_history.map((event, idx) => (
                            <div key={idx} className="relative">
                                <div className="absolute -left-[41px] top-1 h-6 w-6 rounded-full bg-white border-2 border-blue-500 flex items-center justify-center">
                                    <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                                </div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold uppercase text-gray-500">{event.type}</span>
                                    <span className="text-xs text-gray-400">• {new Date(event.created_at).toLocaleString()}</span>
                                </div>
                                <p className="text-gray-800 text-base">{event.content}</p>
                            </div>
                        ))}
                        {deal.fub_history.length === 0 && <p className="text-gray-500 italic">No history found.</p>}
                    </div>
                )}

                {activeTab === 'assistant' && (
                    <DealChat dealId={deal.id} dealName={deal.deal_name} />
                )}
            </div>

        </div>
    );
};

