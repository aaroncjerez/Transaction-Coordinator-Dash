import React from 'react';
import { X, AlertCircle, CheckCircle, MessageSquare, Phone, Mail, MapPin } from 'lucide-react';
import { Button } from './ui/Button';

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

interface LeadDetailModalProps {
  lead: DailyLead | null;
  onClose: () => void;
  onToggleComplete: (id: number, current: boolean) => void;
}

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({ lead, onClose, onToggleComplete }) => {
  if (!lead) return null;

  const scoreColor = lead.score >= 8 ? 'text-red-600 bg-red-50 border-red-200'
    : lead.score >= 5 ? 'text-orange-600 bg-orange-50 border-orange-200'
    : 'text-gray-600 bg-gray-50 border-gray-200';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold border-2 ${scoreColor}`}>
              {lead.score}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{lead.name}</h2>
              <span className="text-sm text-gray-500">{lead.stage}</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-md transition-colors">
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            {lead.is_completed ? (
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
                <CheckCircle size={14} /> Completed
              </span>
            ) : lead.action_required ? (
              <span className="flex items-center gap-1.5 text-sm font-medium text-red-700 bg-red-50 px-3 py-1.5 rounded-full border border-red-200">
                <AlertCircle size={14} /> Action Required
              </span>
            ) : (
              <span className="text-sm text-gray-500 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200">
                Pending Review
              </span>
            )}
          </div>

          {/* Score Visualization */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Priority Score</label>
            <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  lead.score >= 8 ? 'bg-red-500' : lead.score >= 5 ? 'bg-orange-500' : 'bg-blue-500'
                }`}
                style={{ width: `${lead.score * 10}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">{lead.score}/10</p>
          </div>

          {/* Summary */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Summary</label>
            <p className="text-sm text-gray-800 leading-relaxed">{lead.summary}</p>
          </div>

          {/* Rationale */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Rationale</label>
            <p className="text-sm text-gray-600 italic leading-relaxed">{lead.rationale}</p>
          </div>

          {/* Recommended Follow-Up */}
          {lead.recommended_follow_up && (
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare size={14} className="text-blue-600" />
                <label className="text-xs font-semibold text-blue-700 uppercase">Recommended Message</label>
              </div>
              <p className="text-sm text-blue-900 leading-relaxed">"{lead.recommended_follow_up}"</p>
              <div className="mt-3 flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(lead.recommended_follow_up)}
                  className="text-blue-600 border-blue-200 hover:bg-blue-100"
                >
                  Copy Text
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button
            variant={lead.is_completed ? 'secondary' : 'primary'}
            onClick={() => { onToggleComplete(lead.id, lead.is_completed); onClose(); }}
          >
            {lead.is_completed ? 'Undo Complete' : 'Mark as Done'}
          </Button>
        </div>
      </div>
    </div>
  );
};
