import React, { useState } from 'react';
import { PhoneIncoming, PhoneOutgoing, Clock, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { SentimentBadge } from './SentimentBadge';
import { AIReviewBadge } from './AIReviewBadge';
import { cn } from '../../lib/utils';
import { formatPhone } from '../../lib/utils/phone';
import type { DialerCallRecord } from '../../types';

interface CallCardProps {
  call: DialerCallRecord;
  onLeadClick?: (phoneNormalized: string) => void;
}

const statusColors: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700',
  voicemail: 'bg-yellow-50 text-yellow-700',
  no_answer: 'bg-gray-100 text-gray-600',
  busy: 'bg-orange-50 text-orange-700',
  failed: 'bg-red-50 text-red-700',
  declined: 'bg-red-50 text-red-600',
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export const CallCard: React.FC<CallCardProps> = ({ call, onLeadClick }) => {
  const [expanded, setExpanded] = useState(false);

  const leadName = call.leads_cache
    ? [call.leads_cache.first_name, call.leads_cache.last_name].filter(Boolean).join(' ') || 'Unknown'
    : formatPhone(call.seller_phone_normalized || call.phone_normalized);

  const leadLocation = call.leads_cache
    ? [call.leads_cache.county, call.leads_cache.state].filter(Boolean).join(', ')
    : null;

  const DirectionIcon = call.call_direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;

  const aiReview = call.custom_analysis?.dnc_detected !== undefined ? call.custom_analysis : null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <DirectionIcon
          size={14}
          className={cn(
            call.call_direction === 'inbound' ? 'text-blue-500' : 'text-gray-400'
          )}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              className="text-sm font-medium text-gray-900 hover:text-primary truncate"
              onClick={(e) => {
                e.stopPropagation();
                onLeadClick?.(call.seller_phone_normalized || call.phone_normalized);
              }}
            >
              {leadName}
            </button>
            {leadLocation && (
              <span className="text-micro text-gray-400 truncate">{leadLocation}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-micro text-gray-400">
              {formatTime(call.call_started_at)}
            </span>
            <span className="flex items-center gap-0.5 text-micro text-gray-400">
              <Clock size={10} />
              {formatDuration(call.duration_seconds)}
            </span>
          </div>
        </div>

        {/* Badges */}
        <div className="flex items-center gap-1.5">
          <AIReviewBadge review={aiReview} />
          <SentimentBadge sentiment={call.sentiment} />
          {call.call_status && (
            <span className={cn(
              'px-1.5 py-0.5 rounded-full text-micro font-medium',
              statusColors[call.call_status] || 'bg-gray-100 text-gray-600'
            )}>
              {call.call_status.replace('_', ' ')}
            </span>
          )}
        </div>

        {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 p-3 space-y-3">
          {call.summary && (
            <div>
              <p className="text-micro text-gray-500 font-medium mb-1">Summary</p>
              <p className="text-caption text-gray-700">{call.summary}</p>
            </div>
          )}

          {aiReview?.key_insights && aiReview.key_insights.length > 0 && (
            <div>
              <p className="text-micro text-gray-500 font-medium mb-1">AI Insights</p>
              <ul className="list-disc list-inside text-caption text-gray-600 space-y-0.5">
                {aiReview.key_insights.map((insight: string, i: number) => (
                  <li key={i}>{insight}</li>
                ))}
              </ul>
            </div>
          )}

          {aiReview?.recommended_next_action && (
            <div>
              <p className="text-micro text-gray-500 font-medium mb-1">Recommended Action</p>
              <p className="text-caption text-gray-700">{aiReview.recommended_next_action}</p>
            </div>
          )}

          {call.transcript && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-micro text-gray-500 font-medium">Transcript</p>
                <button
                  className="text-micro text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
                  onClick={() => navigator.clipboard.writeText(call.transcript || '')}
                >
                  <Copy size={10} /> Copy
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto bg-gray-50 rounded-md p-2.5 text-caption text-gray-600 leading-relaxed whitespace-pre-wrap">
                {call.transcript}
              </div>
            </div>
          )}

          {call.cost_cents != null && (
            <p className="text-micro text-gray-400">
              Cost: ${(call.cost_cents / 100).toFixed(2)}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
