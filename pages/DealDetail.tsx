import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Calendar, DollarSign, ExternalLink, Check, Plus, Sparkles, Loader2, Cloud, Monitor, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { fetchDealById, updateDealFields, fetchTasksByDeal, updateTaskFields, analyzePdf, getPdfAnalysesByDeal, listFiles, getFubFileSyncStatus, triggerFubFileSync } from '../lib/database';
import { DEAL_STAGES, DEAL_TYPES, FILE_CATEGORIES } from '../constants';
import { updateAirtableRecord, updateAirtableTask } from '../lib/sync';
import confetti from 'canvas-confetti';
import { uploadFileLocal } from '../lib/uploadHandler';
import { PdfAnalysisCard } from '../components/PdfAnalysisCard';
import { DealAnalyzer } from '../components/DealAnalyzer';

// Data Types
interface FileItem {
    id: string;
    name: string;
    url: string;
    categoryKey: string;
    source?: 'local' | 'fub';
    fub_attachment_id?: string;
}

interface DealDetailData {
    id: string;
    airtable_id: string;
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
    fub_person_id?: string;
    files: FileItem[];
}

import { DealChat } from '../components/DealChat';

export const DealDetail: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [deal, setDeal] = useState<DealDetailData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'details' | 'files' | 'analysis' | 'chat'>('details');

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
            await updateDealFields(deal.id, {
                [field === 'contract_date' ? 'contract_execution_date' : field]: value
            });

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
            const dealData = await fetchDealById(dealId);
            if (!dealData) throw new Error('Deal not found');

            // 2. Load files from files table
            const fileRecords = await listFiles(dealId);
            const files: FileItem[] = (fileRecords || []).map((f: any) => ({
                id: f.id,
                name: f.file_name,
                url: f.file_path ? `file://${f.file_path}` : '',
                categoryKey: f.category || 'other',
                source: f.source || 'local',
                fub_attachment_id: f.fub_attachment_id,
            }));

            // 3. Transform to State
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
                fub_person_id: dealData.fub_person_id || undefined,
                files: files
            });

        } catch (error) {
            console.error('Error fetching deal details:', error);
        } finally {
            setLoading(false);
        }
    };


    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, categoryKey: string) => {
        if (!event.target.files || event.target.files.length === 0 || !deal) return;

        const file = event.target.files[0];


        try {
            setLoading(true);

            await uploadFileLocal(deal.id, file, categoryKey, (msg) => console.log(msg));
            fetchDealData(deal.id);

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
                        onClick={() => setActiveTab('analysis')}
                        className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${activeTab === 'analysis' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        <Sparkles size={14} /> Analysis
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
                    <FilesTab dealId={deal.id} files={deal.files} categories={FILE_CATEGORIES} onUpload={handleFileUpload} fubPersonId={deal.fub_person_id} />
                )}

                {activeTab === 'analysis' && (
                    <DealAnalyzer dealId={deal.id} />
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

// Sub-component for Files tab with PDF analysis + FUB sync
const FilesTab: React.FC<{
    dealId: string;
    files: FileItem[];
    categories: typeof FILE_CATEGORIES;
    onUpload: (event: React.ChangeEvent<HTMLInputElement>, categoryKey: string) => void;
    fubPersonId?: string;
}> = ({ dealId, files, categories, onUpload, fubPersonId }) => {
    const [analyses, setAnalyses] = useState<Record<string, any>>({});
    const [analyzing, setAnalyzing] = useState<string | null>(null);
    const [fubSyncStatus, setFubSyncStatus] = useState<any>(null);
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        loadAnalyses();
        if (fubPersonId) loadFubSyncStatus();
    }, [dealId, fubPersonId]);

    const loadAnalyses = async () => {
        const data = await getPdfAnalysesByDeal(dealId);
        const map: Record<string, any> = {};
        (data || []).forEach((a: any) => { map[a.file_path] = a; });
        setAnalyses(map);
    };

    const loadFubSyncStatus = async () => {
        try {
            const status = await getFubFileSyncStatus(dealId);
            setFubSyncStatus(status);
        } catch (e) {
            console.warn('Failed to load FUB sync status:', e);
        }
    };

    const handleFubSync = async () => {
        setSyncing(true);
        try {
            await triggerFubFileSync(dealId);
            await loadFubSyncStatus();
        } catch (e) {
            console.error('FUB sync failed:', e);
        } finally {
            setSyncing(false);
        }
    };

    const handleAnalyze = async (file: FileItem) => {
        const filePath = file.url.replace('file://', '');
        if (!filePath || !file.name.toLowerCase().endsWith('.pdf')) {
            alert('Only local PDF files can be analyzed.');
            return;
        }

        setAnalyzing(filePath);
        try {
            await analyzePdf(dealId, filePath, file.name, file.categoryKey || 'other');
            await loadAnalyses();
        } catch (e: any) {
            console.error('PDF analysis failed:', e);
            alert(e.message || 'Analysis failed');
        } finally {
            setAnalyzing(null);
        }
    };

    return (
        <div className="space-y-4">
            {/* FUB Sync Status Banner */}
            {fubPersonId && (
                <div className="flex items-center justify-between bg-gray-50 rounded-lg border border-gray-200 px-4 py-3">
                    <div className="flex items-center gap-3">
                        <Cloud size={16} className="text-blue-500" />
                        <div>
                            <span className="text-sm font-medium text-gray-700">FUB File Sync</span>
                            {fubSyncStatus ? (
                                <span className="ml-2">
                                    {fubSyncStatus.last_status === 'synced' && (
                                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                            <CheckCircle size={12} /> Synced ({fubSyncStatus.local_file_count} local, {fubSyncStatus.fub_file_count} FUB)
                                        </span>
                                    )}
                                    {fubSyncStatus.last_status === 'mismatch' && (
                                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                                            <AlertTriangle size={12} /> Mismatch ({fubSyncStatus.local_file_count} local, {fubSyncStatus.fub_file_count} FUB)
                                        </span>
                                    )}
                                    {fubSyncStatus.last_status === 'error' && (
                                        <span className="inline-flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                            Error
                                        </span>
                                    )}
                                    {fubSyncStatus.last_status === 'pending' && (
                                        <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                                            Pending
                                        </span>
                                    )}
                                    {fubSyncStatus.last_status === 'syncing' && (
                                        <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                            <Loader2 size={12} className="animate-spin" /> Syncing...
                                        </span>
                                    )}
                                </span>
                            ) : (
                                <span className="ml-2 text-xs text-gray-400">Not synced yet</span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={handleFubSync}
                        disabled={syncing}
                        className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
                    >
                        {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Sync Now
                    </button>
                </div>
            )}

            {/* File Categories Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {categories.map(category => {
                    const categoryFiles = files.filter(f => f.categoryKey === category.key);

                    return (
                        <div key={category.key} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col h-full hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                    {category.label}
                                    <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded-full">{categoryFiles.length}</span>
                                </h3>
                                <div className="relative">
                                    <input type="file" id={`upload-${category.key}`} className="hidden" onChange={(e) => onUpload(e, category.key)} />
                                    <label htmlFor={`upload-${category.key}`} className="cursor-pointer p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Upload File">
                                        <Plus size={18} />
                                    </label>
                                </div>
                            </div>

                            <div className="flex-1 space-y-2 overflow-y-auto max-h-[400px] pr-1 scrollbar-thin">
                                {categoryFiles.map((file) => {
                                    const filePath = file.url.replace('file://', '');
                                    const isPdf = file.name.toLowerCase().endsWith('.pdf');
                                    const analysis = analyses[filePath];
                                    const isAnalyzing = analyzing === filePath;

                                    return (
                                        <div key={file.id} className="space-y-1">
                                            <div className="group flex items-center justify-between p-2.5 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-100 transition-colors">
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className="p-1.5 bg-white rounded border border-gray-200 text-blue-500">
                                                        <FileText size={16} />
                                                    </div>
                                                    <span className="text-sm text-gray-700 truncate" title={file.name}>{file.name}</span>
                                                    {/* Source badge */}
                                                    {file.source === 'fub' && (
                                                        <span title="Synced from FUB" className="flex-shrink-0">
                                                            <Cloud size={12} className="text-blue-400" />
                                                        </span>
                                                    )}
                                                    {file.source === 'local' && file.fub_attachment_id && (
                                                        <span title="Linked to FUB" className="flex-shrink-0">
                                                            <CheckCircle size={12} className="text-emerald-400" />
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {isPdf && !analysis && (
                                                        <button
                                                            onClick={() => handleAnalyze(file)}
                                                            disabled={isAnalyzing}
                                                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
                                                            title="Analyze PDF"
                                                        >
                                                            {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                                        </button>
                                                    )}
                                                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-blue-600 transition-all">
                                                        <ExternalLink size={14} />
                                                    </a>
                                                </div>
                                            </div>
                                            {analysis && (
                                                <PdfAnalysisCard
                                                    analysis={analysis}
                                                    onReanalyze={() => handleAnalyze(file)}
                                                    isReanalyzing={isAnalyzing}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
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
            const data = await fetchTasksByDeal(dealAirtableId);

            // Filter out Cancelled, Sort: In Progress -> To Do -> Done
            const filtered = (data || []).filter(t => t.status !== 'Cancelled');
            const statusOrder: Record<string, number> = { 'In Progress': 0, 'To Do': 1, 'Done': 2 };
            const sorted = filtered.sort((a, b) => {
                const sA = statusOrder[a.status] ?? 99;
                const sB = statusOrder[b.status] ?? 99;
                return sA - sB;
            });

            setTasks(sorted);
            setLoading(false);
        };
        fetchTasks();
    }, [dealAirtableId]);

    const handleStatusChange = async (task: any, newStatus: string) => {
        // Optimistic Update
        const oldStatus = task.status;
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));

        // Gamification: Confetti if Done
        if (newStatus === 'Done' && oldStatus !== 'Done') {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
        }

        try {
            // 1. Update local SQLite
            await updateTaskFields(task.id, { status: newStatus });

            // 2. Update Airtable (if airtable_id exists on task)
            if (task.airtable_id && !task.airtable_id.startsWith('temp')) {
                await updateAirtableTask(task.airtable_id, { "Status": newStatus });
            }
        } catch (err) {
            console.error("Task update failed", err);
            // Revert on error?
        }
    };

    // Progress Calculation
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'Done').length;
    const progress = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

    if (loading) return <div className="p-4 text-center text-gray-400 text-sm">Loading tasks...</div>;
    if (tasks.length === 0) return <div className="p-4 text-center text-gray-400 text-sm italic">No tasks active.</div>;

    return (
        <div className="space-y-4">
            {/* Progress Bar */}
            <div className="mb-4">
                <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1">
                    <span>Progress</span>
                    <span>{progress}%</span>
                </div>
                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-blue-500 transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Task List */}
            <div className="space-y-2">
                {tasks.map(task => (
                    <div key={task.id} className="flex items-center justify-between p-3 bg-white hover:bg-gray-50 rounded-xl border border-gray-100 shadow-sm transition-all group">
                        <span className={`text-sm font-medium transition-colors ${task.status === 'Done' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                            {task.task_name}
                        </span>

                        <select
                            value={task.status}
                            onChange={(e) => handleStatusChange(task, e.target.value)}
                            className={`text-xs font-bold px-2 py-1 rounded-md border-0 cursor-pointer outline-none ring-1 ring-inset transition-all
                                ${task.status === 'Done' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' :
                                    task.status === 'In Progress' ? 'bg-blue-50 text-blue-700 ring-blue-200' :
                                        'bg-gray-100 text-gray-600 ring-gray-200 hover:bg-gray-200'}`}
                        >
                            <option value="To Do">To Do</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Done">Done</option>
                            <option value="Cancelled">Cancelled</option>
                        </select>
                    </div>
                ))}
            </div>
        </div>
    );
};
