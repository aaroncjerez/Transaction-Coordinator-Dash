import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Edit2, Calendar, DollarSign, ExternalLink, X, Check, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DEAL_STAGES } from '../constants';

// Data Types
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
    files: Array<{ name: string; url: string; type: 'purchase' | 'deed' | 'plat' | 'other'; categoryKey?: string }>;
}

// STAGES removed in favor of constants.ts

export const DealDetail: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [deal, setDeal] = useState<DealDetailData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'details' | 'files'>('details');

    // Stage Editing State
    const [isEditingStage, setIsEditingStage] = useState(false);
    const [selectedStage, setSelectedStage] = useState('');
    const [updatingStage, setUpdatingStage] = useState(false);

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
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const dbField = field === 'contract_date' ? 'contract_execution_date' : field;
                await fetch(`${supabase.supabaseUrl}/functions/v1/update-airtable`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session?.access_token || ''}`,
                    },
                    body: JSON.stringify({ dealId: deal.id, field: dbField, value }),
                });
            } catch (airtableError) {
                console.warn('Airtable sync failed:', airtableError);
            }
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
        const filePath = `${deal.id}/${categoryKey}/${Date.now()}_${file.name}`;

        try {
            setLoading(true); // Re-use loading or create new state? Better create 'uploading' state if specific UI needed, but global loading is safe for now to prevent interactions.

            // 1. Upload to Storage
            const { error: uploadError } = await supabase.storage
                .from('deal_attachments') // Ensure this bucket exists!
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // 2. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('deal_attachments')
                .getPublicUrl(filePath);

            // 3. Update Database (deal_vault)
            // Need to fetch current array first? or append using Postgres function?
            // Easiest is to READ deals current data for this column, append, UPDATE.
            // But we have `deal.files` which is aggregated. We don't have the raw column data in state easily.
            // I'll fetch the specific column.

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

            // 4. Update Local State
            // We need to add to `deal.files` logic.
            // Currently `deal.files` is a flattened list.
            // I should construct the new flattened item.
            const category = FILE_CATEGORIES.find(c => c.key === categoryKey);
            const newFlatFile = {
                name: file.name,
                url: publicUrl,
                type: category?.type || 'other'
            };

            // Re-fetch deal data to be safe? Or update state.
            // Updating state is faster.
            setDeal(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    files: [...prev.files, newFlatFile as any]
                };
            });

            alert('File uploaded successfully!');

        } catch (error) {
            console.error('Error uploading file:', error);
            alert('Failed to upload file.');
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
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                        <span className="font-medium text-gray-700">{deal.deal_type}</span>
                        <span>•</span>
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-medium">{deal.stage}</span>
                        <span>•</span>
                        <span>{deal.county}, {deal.state}</span>
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
                                {DEAL_STAGES.map((stage) => (
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
                </div>
            </div>

            {/* Content */}
            <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-h-[400px] ${activeTab === 'assistant' ? 'bg-gray-50 border-none shadow-none p-0' : ''}`}>
                {activeTab === 'details' && (
                    <div className="grid grid-cols-2 gap-8">
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
            </div>
        </div>
    );
};

