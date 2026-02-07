import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/Button';
import { insertDeal } from '../lib/database';
import { DEAL_TYPES, DEAL_STAGES } from '../constants';

interface CreateDealModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateDealModal: React.FC<CreateDealModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    county: '',
    state: '',
    deal_type: DEAL_TYPES[0],
    stage: DEAL_STAGES[0],
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
        throw new Error('County and State are required');
      }

      // Local-first: Insert into local SQLite
      // The IPC handler will:
      // 1. Insert the deal
      // 2. Seed initial tasks via rule engine
      // 3. Log to audit_log
      const dealName = `${formData.county}, ${formData.state}`;

      await insertDeal({
        deal_name: dealName,
        last_name: '',
        county: formData.county,
        state: formData.state,
        deal_type: formData.deal_type,
        stage: formData.stage,
        notes: formData.notes,
        purchase_price: 0,
        expected_sales_price: 0,
      });

      // Sync to Airtable will happen via background sync runner

      onSuccess();
      onClose();
      setFormData({
        county: '',
        state: '',
        deal_type: DEAL_TYPES[0],
        stage: DEAL_STAGES[0],
        notes: ''
      });

    } catch (err) {
      console.error('Creation failed:', err);
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

          <div className="grid grid-cols-2 gap-4">
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
                <option value="TN">TN</option>
                <option value="AL">AL</option>
                <option value="GA">GA</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Stage</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white"
                value={formData.stage}
                onChange={e => setFormData({ ...formData, stage: e.target.value })}
              >
                {DEAL_STAGES.map((stage) => (
                  <option key={stage} value={stage}>{stage}</option>
                ))}
              </select>
            </div>
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
