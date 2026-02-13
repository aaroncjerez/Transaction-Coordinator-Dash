import React, { useState } from 'react';
import { ExternalLink, Copy, Check, Plus, CircleCheck, Undo2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { DailyLead } from '../../types';

interface LeadCardProps {
  lead: DailyLead;
  onClick: () => void;
  onMarkContacted: (id: number) => void;
  onUnmarkContacted: (id: number) => void;
  onAddToToday?: (id: number) => void;
  isContactedToday: boolean;
  isInTodaysActions: boolean;
  activeTab: string;
  showPriority?: boolean;
}

function getDiscountColor(score: number | undefined) {
  if (!score) return { bg: 'bg-gray-100', text: 'text-gray-600' };
  if (score >= 8) return { bg: 'bg-emerald-100', text: 'text-emerald-700' };
  if (score >= 5) return { bg: 'bg-amber-100', text: 'text-amber-700' };
  return { bg: 'bg-gray-100', text: 'text-gray-600' };
}

function getContactTag(lastCommunication: string | undefined) {
  if (!lastCommunication) {
    return { label: 'Never Contacted', color: 'bg-red-50 text-red-600' };
  }
  const daysSince = Math.floor(
    (Date.now() - new Date(lastCommunication).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSince < 1) return { label: 'Today', color: 'bg-emerald-50 text-emerald-600' };
  if (daysSince < 7) return { label: `${daysSince}d ago`, color: 'bg-gray-100 text-gray-600' };
  if (daysSince < 14) return { label: `${daysSince}d ago`, color: 'bg-amber-50 text-amber-600' };
  return { label: `${daysSince}d ago`, color: 'bg-red-50 text-red-600' };
}

export const LeadCard: React.FC<LeadCardProps> = ({
  lead,
  onClick,
  onMarkContacted,
  onUnmarkContacted,
  onAddToToday,
  isContactedToday,
  isInTodaysActions,
  activeTab,
  showPriority,
}) => {
  const [copied, setCopied] = useState(false);
  const discountColor = getDiscountColor(lead.discount_likelihood);
  const contactTag = getContactTag(lead.last_communication);

  const isNew = lead.created_at
    ? (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60) <= 48
    : false;
  const isPulsing = lead.created_at
    ? (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60) <= 24
    : false;
  const isAsap = lead.negotiation_strategy?.timeline === 'immediate';

  const copyFollowUp = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (lead.recommended_follow_up) {
      navigator.clipboard.writeText(lead.recommended_follow_up);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className={cn(
        'bg-white rounded-lg border shadow-sm hover:shadow-md transition-shadow p-4 cursor-pointer',
        isContactedToday ? 'border-emerald-200 bg-emerald-50/30' : 'border-gray-200'
      )}
      onClick={onClick}
    >
      {/* Header: name + badges */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {isNew && (
            <span
              className={cn(
                'text-micro font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded shrink-0',
                isPulsing && 'animate-pulse'
              )}
            >
              NEW
            </span>
          )}
          <h3 className="text-sm font-semibold text-gray-900 truncate">{lead.name}</h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {showPriority && lead._priorityScore != null && (
            <span className="text-micro font-medium text-gray-400">{lead._priorityScore}</span>
          )}
          {isAsap && (
            <span className="text-micro font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
              ASAP
            </span>
          )}
          <span
            className={cn(
              'text-micro font-bold px-1.5 py-0.5 rounded tabular-nums',
              discountColor.bg,
              discountColor.text
            )}
          >
            {lead.discount_likelihood || 0}/10
          </span>
        </div>
      </div>

      {/* Meta tags */}
      <div className="flex flex-wrap gap-1 mb-2">
        {lead.stage && (
          <span className="text-micro text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">
            {lead.stage}
          </span>
        )}
        {lead.source && (
          <span className="text-micro text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">
            {lead.source}
          </span>
        )}
        {lead.phone && (
          <span className="text-micro text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">
            {lead.phone}
          </span>
        )}
        <span className={cn('text-micro px-1.5 py-0.5 rounded', contactTag.color)}>
          {contactTag.label}
        </span>
      </div>

      {/* FUB link */}
      {lead.fub_link && (
        <a
          href={lead.fub_link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-micro text-blue-600 hover:text-blue-800 mb-2"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={11} />
          Open in FUB
        </a>
      )}

      {/* Summary */}
      {lead.summary && (
        <p className="text-caption text-gray-600 line-clamp-2 mb-2">{lead.summary}</p>
      )}

      {/* Recommended follow-up */}
      {lead.recommended_follow_up && (
        <div className="mb-3">
          <p className="text-micro font-medium text-gray-500 mb-0.5">Follow-up</p>
          <div className="flex items-start gap-2">
            <p className="text-caption text-gray-700 italic line-clamp-2 flex-1">
              "{lead.recommended_follow_up}"
            </p>
            <button
              className="shrink-0 text-micro text-gray-400 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition-colors"
              onClick={copyFollowUp}
              title="Copy to clipboard"
            >
              {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        {activeTab === 'all' && !isInTodaysActions && !isContactedToday && onAddToToday && (
          <button
            className="flex items-center gap-1 text-micro font-medium text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
            onClick={(e) => { e.stopPropagation(); onAddToToday(lead.id); }}
          >
            <Plus size={12} /> Add to Today
          </button>
        )}
        <div className="flex-1" />
        {isContactedToday ? (
          <button
            className="flex items-center gap-1 text-micro font-medium text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            onClick={(e) => { e.stopPropagation(); onUnmarkContacted(lead.id); }}
          >
            <Undo2 size={12} /> Undo
          </button>
        ) : (
          <button
            className="flex items-center gap-1 text-micro font-medium text-emerald-600 hover:text-emerald-800 px-2 py-1 rounded hover:bg-emerald-50 transition-colors"
            onClick={(e) => { e.stopPropagation(); onMarkContacted(lead.id); }}
          >
            <CircleCheck size={12} /> Mark Done
          </button>
        )}
      </div>
    </div>
  );
};
