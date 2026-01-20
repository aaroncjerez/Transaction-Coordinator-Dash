
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/Button';
import { supabase } from '../lib/supabase';
import { DEAL_TYPES } from '../constants';

interface CreateDealModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const CreateDealModal: React.FC<CreateDealModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        county: '',
        state: '',
        deal_type: 'Standard Flip',
        notes: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            if (!formData.county || !formData.state) {
                throw new Error("County and State are required");
            }

            // 1. Insert into Supabase (Optimistic)
            // We rely on background sync or manual sync eventually, but for now we look 'live'.
            // Note: We don't have an Airtable ID yet. Sync logic handles 'upsert' by airtable_id.
            // If we create here, we have no local airtable_id.
            // We might need to call 'createAirtableRecord' here if we want immediate sync?
            // For now, we just insert to Supabase to unblock the UI.

            const tempId = `temp-${Date.now()}`;
            const dealName = `${formData.county}, ${formData.state}`;

            const { error: sbError } = await supabase
                .from('deal_vault')
                .insert([{
                    deal_name: dealName,
                    county: formData.county,
                    state: formData.state,
                    deal_type: formData.deal_type,
                    notes: formData.notes,
                    stage: 'New',
                    airtable_id: tempId // Temporary
                }]);

            if (sbError) throw sbError;

            // TODO: Trigger backend sync or call client-side createAirtableRecord (not implemented fully in sync.ts for creation)

            onSuccess();
            onClose();
            setFormData({ county: '', state: '', deal_type: 'Standard Flip', notes: '' });


        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            <div
                className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all scale-100">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">Create New Deal</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-500 transition-colors p-1 rounded-md hover:bg-gray-100"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm border border-red-100">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">County</label>
                        <input
                            type="text"
                            autoFocus
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            placeholder="e.g. Harris"
                            value={formData.county}
                            onChange={e => setFormData({ ...formData, county: e.target.value })}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">State</label>
                        <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                            value={formData.state}
                            onChange={e => setFormData({ ...formData, state: e.target.value })}
                        >
                            <option value="">Select State</option>
                            <option value="TX">TX</option>
                            <option value="FL">FL</option>
                            <option value="CA">CA</option>
                            <option value="NY">NY</option>
                            <option value="OH">OH</option>
                            {/* Add more as needed */}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Type</label>
                        <select
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                            value={formData.deal_type}
                            onChange={e => setFormData({ ...formData, deal_type: e.target.value })}
                        >
                            {DEAL_TYPES.map((type) => (
                                <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">Notes</label>
                        <textarea
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            placeholder="Initial notes..."
                            value={formData.notes}
                            onChange={e => setFormData({ ...formData, notes: e.target.value })}
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <Button type="button" variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" isLoading={isSubmitting}>
                            Create Deal
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};
