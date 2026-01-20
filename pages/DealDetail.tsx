import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Edit2, Calendar, DollarSign, ExternalLink, X, Check, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DEAL_STAGES, DEAL_TYPES } from '../constants';
import { updateAirtableRecord, updateAirtableTask } from '../lib/sync';
import confetti from 'canvas-confetti';
import { uploadFileAirtableFirst } from '../lib/uploadHandler';

// Data Types
interface DealDetailData {
    id: string;
    airtable_id: string; // Add this
    deal_name: string;
    deal_type?: string;
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
    files: Array<{ name: string; url: string; type: 'purchase' | 'deed' | 'plat' | 'other'; categoryKey?: string }>;
}

// STAGES removed in favor of constants.ts

import { DealChat } from '../components/DealChat';

export const DealDetail: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [deal, setDeal] = useState<DealDetailData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'details' | 'files' | 'chat'>('details');

    // Airtable Sync Helper
    const syncToAirtable = async (field: string, value: any) => {
        if (!deal?.airtable_id) return;

        try {
            const fieldMap: Record<string, string> = {
                'stage': 'Stage',
                'deal_type': 'Deal type',
                'purchase_price': 'Purchase Price',
                'expected_sales_price': 'Expected sales price',
                'contract_date': 'Contract Execution date',
                'close_date': 'Close date',
                'phone_number': 'Phone (from Contacts)',
                'notes': 'Notes',
            };

            const airtableField = fieldMap[field] || field;
            await updateAirtableRecord(deal.airtable_id, { [airtableField]: value });
            console.log(`Synced ${airtableField} to Airtable.`);

        } catch (airtableError) {
            console.warn('Airtable sync failed:', airtableError);
        }
    };

    // Detail Auto-Save Handler
    const handleFieldUpdate = async (field: keyof DealDetailData, value: any) => {
        if (!deal) return;

        // Optimistic update
        setDeal(prev => prev ? { ...prev, [field]: value } : null);

        try {
            const { error } = await supabase
                .from('deal_vault')
                .update({
                    [field === 'contract_date' ? 'contract_execution_date' : field]: value
                })
                .eq('id', deal.id);

            if (error) throw error;

            // Sync to Airtable
            await syncToAirtable(field, value);

        } catch (error) {
            console.error('Error auto-saving:', error);
        }
    };

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

            // 2. Aggregate Files
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
                                type: cat.type,
                                categoryKey: cat.key
                            });
                        }
                    });
                }
            });

            // 4. Transform to State
            setDeal({
                id: dealData.id,
                airtable_id: dealData.airtable_id, // Map it
                deal_name: dealData.deal_name || 'Unnamed Deal',
                deal_type: dealData.deal_type || 'Unclassified',
                stage: dealData.stage || 'New',
                county: dealData.county || '',
                state: dealData.state || '',
                purchase_price: dealData.purchase_price || 0,
                expected_sales_price: dealData.expected_sales_price || 0,
                contract_date: dealData.contract_execution_date || 'TBD',
                close_date: dealData.close_date || 'TBD',
                phone_number: dealData.phone_number || '',
                notes: dealData.notes || '',
                files: files
            });

        } catch (error) {
            console.error('Error fetching deal details:', error);
        } finally {
            setLoading(false);
        }
    };

    const FILE_CATEGORIES = [
        { key: 'purchase_agreement_files', label: 'Purchase Agreement', type: 'purchase' },
        { key: 'deed_files', label: 'Deed', type: 'deed' },
        { key: 'plat_files', label: 'Plat', type: 'plat' },
        { key: 'sale_contract_files', label: 'Sale Contract', type: 'other' },
        { key: 'soil_test_files', label: 'Soil Test', type: 'other' },
        { key: 'hud_files', label: 'HUD', type: 'other' },
        { key: 'funding_agreement_files', label: 'Funding Agreement', type: 'other' },
    ] as const;



    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, categoryKey: string) => {
        if (!event.target.files || event.target.files.length === 0 || !deal) return;

        const file = event.target.files[0];


        try {
            setLoading(true);

            if (deal.airtable_id) {
                // Use new Airtable-First Logic
                await uploadFileAirtableFirst(deal.airtable_id, file, categoryKey, (msg) => console.log(msg));

                // Refresh local state by fetching (or relying on result)
                fetchDealData(deal.id);
                alert('File uploaded via Airtable-First pipeline!');

            } else {
                // Fallback for non-synced deals (e.g. newly created locally)
                // Existing Supabase-only logic
                const filePath = `${deal.id}/${categoryKey}/${Date.now()}_${file.name}`;
                const { error: uploadError } = await supabase.storage
                    .from('transaction-docs')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('transaction-docs')
                    .getPublicUrl(filePath);

                const { data: currentData, error: fetchError } = await supabase
                    .from('deal_vault')
                    .select(categoryKey)
                    .eq('id', deal.id)
                    .single();

                if (fetchError) throw fetchError;

                const currentFiles = currentData[categoryKey] || [];
                const newFileObj = { name: file.name, url: publicUrl, uploaded_at: new Date().toISOString() };
                const updatedFiles = [...currentFiles, newFileObj];

                const { error: updateError } = await supabase
                    .from('deal_vault')
                    .update({ [categoryKey]: updatedFiles })
                    .eq('id', deal.id);

                if (updateError) throw updateError;

                setDeal(prev => {
                    if (!prev) return null;
                    const newFlatFile = { name: file.name, url: publicUrl, type: FILE_CATEGORIES.find(c => c.key === categoryKey)?.type || 'other' };
                    return { ...prev, files: [...prev.files, newFlatFile as any] };
                });
                alert('File uploaded to Supabase (Local Deal)!');
            }

        } catch (error: any) {
            console.error('Error uploading file:', error);
            alert(error.message || 'Failed to upload file.');
        } finally {
            setLoading(false);
        }
    };



    if (loading) return <div className="p-8 text-center text-gray-500">Loading deal details...</div>;
    if (!deal) return <div className="p-8 text-center text-red-500">Deal not found.</div>;

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex items-center gap-2 text-xs text-gray-400 font-medium mb-1">
                    <button onClick={() => navigate('/')} className="hover:text-gray-600">Deals</button>
                    <span>/</span>
                    <span className="text-gray-600 truncate max-w-[200px]">{deal.deal_name}</span>
                </div>

                <div className="flex items-start gap-4">
                    <button onClick={() => navigate(-1)} className="mt-1 p-2 hover:bg-gray-100 rounded-full transition-colors md:hidden">
                        <ArrowLeft size={20} className="text-gray-600" />
                    </button>
                    <div className="flex-1">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{deal.deal_name}</h1>
                            {/* Actions or Status - Could go here */}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-500">
                            <select
                                value={deal.deal_type}
                                onChange={(e) => handleFieldUpdate('deal_type', e.target.value)}
                                className="bg-transparent font-medium text-gray-700 hover:bg-gray-100 rounded px-2 py-1 border border-transparent hover:border-gray-200 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none cursor-pointer"
                            >
                                {DEAL_TYPES.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                            <span className="hidden md:inline">•</span>
                            <select
                                value={deal.stage}
                                onChange={(e) => handleFieldUpdate('stage', e.target.value)}
                                className="bg-blue-50 text-blue-700 text-xs font-semibold rounded-full px-3 py-1 border border-transparent hover:bg-blue-100 focus:ring-2 focus:ring-blue-500 transition-all outline-none cursor-pointer appearance-none"
                                style={{ textAlignLast: 'center' }}
                            >
                                {DEAL_STAGES.map(stage => (
                                    <option key={stage} value={stage}>{stage}</option>
                                ))}
                            </select>
                            <span className="hidden md:inline">•</span>
                            <span className="flex items-center gap-1">
                                📍 {deal.county}, {deal.state}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
                <div className="flex gap-8 min-w-max">
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
                        onClick={() => setActiveTab('chat')}
                        className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'chat' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Chat Assistant
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6 min-h-[400px] ${activeTab === 'chat' ? 'bg-gray-50 border-none shadow-none p-0' : ''}`}>
                {activeTab === 'details' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Financials</h3>
                            <div className="flex justify-between py-2 border-b border-gray-100 items-center">
                                <span className="text-gray-500 flex items-center gap-2 w-1/3"><DollarSign size={16} /> Purchase Price</span>
                                <input
                                    type="number"
                                    value={deal.purchase_price}
                                    onChange={e => setDeal({ ...deal, purchase_price: Number(e.target.value) })}
                                    onBlur={e => handleFieldUpdate('purchase_price', Number(e.target.value))}
                                    className="w-2/3 bg-transparent hover:bg-gray-50 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 text-right transition-colors"
                                />
                            </div>
                            <div className="flex justify-between py-2 border-b border-gray-100 items-center">
                                <span className="text-gray-500 flex items-center gap-2 w-1/3"><DollarSign size={16} /> Expected Sales</span>
                                <input
                                    type="number"
                                    value={deal.expected_sales_price}
                                    onChange={e => setDeal({ ...deal, expected_sales_price: Number(e.target.value) })}
                                    onBlur={e => handleFieldUpdate('expected_sales_price', Number(e.target.value))}
                                    className="w-2/3 bg-transparent hover:bg-gray-50 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 text-right transition-colors"
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Dates & Contacts</h3>
                            <div className="flex justify-between py-2 border-b border-gray-100 items-center">
                                <span className="text-gray-500 flex items-center gap-2 w-1/3"><Calendar size={16} /> Contract Date</span>
                                <input
                                    type="date"
                                    value={deal.contract_date === 'TBD' ? '' : deal.contract_date}
                                    onChange={e => setDeal({ ...deal, contract_date: e.target.value })}
                                    onBlur={e => handleFieldUpdate('contract_date', e.target.value)}
                                    className="w-2/3 bg-transparent hover:bg-gray-50 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 text-right transition-colors"
                                />
                            </div>
                            <div className="flex justify-between py-2 border-b border-gray-100 items-center">
                                <span className="text-gray-500 flex items-center gap-2 w-1/3"><Calendar size={16} /> Close Date</span>
                                <input
                                    type="date"
                                    value={deal.close_date === 'TBD' ? '' : deal.close_date}
                                    onChange={e => setDeal({ ...deal, close_date: e.target.value })}
                                    onBlur={e => handleFieldUpdate('close_date', e.target.value)}
                                    className="w-2/3 bg-transparent hover:bg-gray-50 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 text-right transition-colors"
                                />
                            </div>
                            <div className="flex justify-between py-2 border-b border-gray-100 items-center">
                                <span className="text-gray-500 flex items-center gap-2 w-1/3">📱 Phone</span>
                                <input
                                    type="text"
                                    value={deal.phone_number || ''}
                                    onChange={e => setDeal({ ...deal, phone_number: e.target.value })}
                                    onBlur={e => handleFieldUpdate('phone_number', e.target.value)}
                                    className="w-2/3 bg-transparent hover:bg-gray-50 focus:bg-white focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 text-right transition-colors"
                                />
                            </div>
                        </div>

                        <div className="col-span-2 mt-4">
                            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">Notes</h3>
                            <textarea
                                value={deal.notes || ''}
                                onChange={e => setDeal({ ...deal, notes: e.target.value })}
                                onBlur={e => handleFieldUpdate('notes', e.target.value)}
                                className="w-full bg-gray-50 hover:bg-white focus:bg-white focus:ring-1 focus:ring-blue-500 border border-transparent focus:border-blue-500 rounded-lg p-3 text-sm min-h-[100px] transition-all"
                                placeholder="Add notes here..."
                            />
                        </div>
                    </div>
                )}

                {activeTab === 'files' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {FILE_CATEGORIES.map(category => {
                            const categoryFiles = deal.files.filter(f => (f as any).categoryKey === category.key);

                            return (
                                <div key={category.key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col h-full hover:shadow-md transition-shadow">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                            {category.label}
                                            <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{categoryFiles.length}</span>
                                        </h3>
                                        <div className="relative">
                                            <input
                                                type="file"
                                                id={`upload-${category.key}`}
                                                className="hidden"
                                                onChange={(e) => handleFileUpload(e, category.key)}
                                            />
                                            <label
                                                htmlFor={`upload-${category.key}`}
                                                className="cursor-pointer p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Upload File"
                                            >
                                                <Plus size={18} />
                                            </label>
                                        </div>
                                    </div>

                                    <div className="flex-1 space-y-2 overflow-y-auto max-h-[300px] pr-1 scrollbar-thin">
                                        {categoryFiles.map((file, idx) => (
                                            <div key={idx} className="group flex items-center justify-between p-2.5 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-100 transition-colors">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="p-1.5 bg-white rounded border border-gray-200 text-blue-500">
                                                        <FileText size={16} />
                                                    </div>
                                                    <span className="text-sm text-gray-700 truncate" title={file.name}>{file.name}</span>
                                                </div>
                                                <a
                                                    href={file.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-blue-600 transition-all"
                                                >
                                                    <ExternalLink size={14} />
                                                </a>
                                            </div>
                                        ))}
                                        {categoryFiles.length === 0 && (
                                            <div className="h-24 flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-100 rounded-lg bg-gray-50/50">
                                                <span className="text-xs">No files</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {activeTab === 'chat' && (
                    <DealChat dealId={deal.id} dealName={deal.deal_name} />
                )}
            </div>

            {/* Linked Tasks Section */}
            <div className="bg-white rounded-xl shadow-soft border border-gray-100 p-6 mt-8">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Check size={20} className="text-blue-500" />
                    Tasks
                </h3>
                <DealTasksList dealAirtableId={deal.airtable_id} />
            </div>
        </div>
    );
};

// Sub-component for Tasks List to keep main component clean
const DealTasksList = ({ dealAirtableId }: { dealAirtableId: string }) => {
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!dealAirtableId) return;
        const fetchTasks = async () => {
            const { data } = await supabase
                .from('tasks_vault')
                .select('*')
                .eq('deal_airtable_id', dealAirtableId)
                .order('status', { ascending: false }) // To Do first typically? Or Done last.
                .order('created_at', { ascending: false });

            // Sort manually if needed: To Do at top
            const sorted = (data || []).sort((a, b) => (a.status === 'Done' ? 1 : -1));
            setTasks(sorted);
            setLoading(false);
        };
        fetchTasks();
    }, [dealAirtableId]);

    const toggleStatus = async (task: any) => {
        // Optimistic
        const newStatus = task.status === 'Done' ? 'To Do' : 'Done';
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));

        await supabase.from('tasks_vault').update({ status: newStatus }).eq('id', task.id);
    };

    if (loading) return <div className="p-4 text-center text-gray-400 text-sm">Loading tasks...</div>;
    if (tasks.length === 0) return <div className="p-4 text-center text-gray-400 text-sm italic">No tasks linked to this deal.</div>;

    return (
        <div className="space-y-2">
            {tasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-100 group">
                    <button
                        onClick={() => toggleStatus(task)}
                        className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${task.status === 'Done' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 hover:border-blue-500'}`}
                    >
                        {task.status === 'Done' && <Check size={12} />}
                    </button>
                    <span className={`text-sm font-medium ${task.status === 'Done' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                        {task.task_name}
                    </span>
                </div>
            ))}
        </div>
    );
};

