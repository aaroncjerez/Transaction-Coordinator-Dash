import React, { useState, useEffect, useCallback } from 'react';
import { Flame, ChevronDown, Phone, MapPin, Clock, Eye } from 'lucide-react';
import { fetchDialerHotLeads, fetchDialerLeadMemory, fetchDialerCallsForLead } from '../../lib/database';
import { SentimentBadge } from './SentimentBadge';
import { formatPhone } from '../../lib/utils/phone';
import { cn } from '../../lib/utils';

interface HotLeadsSectionProps {
  onLeadClick: (phoneNormalized: string) => void;
  onCallLead: (lead: any) => void;
}

export const HotLeadsSection: React.FC<HotLeadsSectionProps> = ({ onLeadClick, onCallLead }) => {
  const [leads, setLeads] = useState<any[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadHotLeads = useCallback(async () => {
    try {
      const data = await fetchDialerHotLeads();
      // Enrich with latest call info
      const enriched = await Promise.all((data || []).slice(0, 10).map(async (lead: any) => {
        try {
          const [calls, memory] = await Promise.all([
            fetchDialerCallsForLead(lead.phone_normalized),
            fetchDialerLeadMemory(lead.phone_normalized),
          ]);
          const lastCall = calls?.[0];
          return {
            ...lead,
            lastCall,
            memory,
            sentiment: lastCall?.sentiment || null,
            aiSummary: memory?.summary || lastCall?.summary || null,
            hotReason: lastCall?.custom_analysis?.hot_lead_reason || memory?.next_action_strategy || null,
          };
        } catch {
          return lead;
        }
      }));
      setLeads(enriched);
    } catch (err) {
      console.error('Error loading hot leads:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadHotLeads(); }, [loadHotLeads]);

  if (loading || leads.length === 0) return null;

  return (
    <div className="border border-orange-200 rounded-lg bg-orange-50/30 overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-orange-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Flame size={14} className="text-orange-500" />
          <span className="text-sm font-medium text-orange-800">Hot Leads</span>
          <span className="text-micro px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 tabular-nums">
            {leads.length}
          </span>
        </div>
        <ChevronDown size={14} className={cn('text-orange-400 transition-transform', !collapsed && 'rotate-180')} />
      </button>

      {!collapsed && (
        <div className="px-4 pb-3 space-y-2">
          {leads.map((lead) => {
            const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
            const location = [lead.county, lead.state].filter(Boolean).join(', ');
            const lastCallDate = lead.lastCall?.call_started_at
              ? new Date(lead.lastCall.call_started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              : null;
            const lastCallDuration = lead.lastCall?.duration_seconds
              ? `${Math.floor(lead.lastCall.duration_seconds / 60)}m ${lead.lastCall.duration_seconds % 60}s`
              : null;

            return (
              <div
                key={lead.id}
                className="bg-white rounded-lg border border-orange-100 p-3 flex items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900 truncate">{name}</span>
                    <SentimentBadge sentiment={lead.sentiment} />
                  </div>

                  <div className="flex items-center gap-3 text-micro text-gray-500 mb-1.5">
                    <span className="flex items-center gap-1 font-mono">
                      <Phone size={10} />
                      {formatPhone(lead.phone_normalized)}
                    </span>
                    {location && (
                      <span className="flex items-center gap-1">
                        <MapPin size={10} />
                        {location}
                      </span>
                    )}
                    {lastCallDate && (
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {lastCallDate}{lastCallDuration ? ` (${lastCallDuration})` : ''}
                      </span>
                    )}
                  </div>

                  {lead.aiSummary && (
                    <p className="text-micro text-gray-600 line-clamp-2">{lead.aiSummary}</p>
                  )}
                  {lead.hotReason && (
                    <p className="text-micro text-orange-600 mt-0.5">{lead.hotReason}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => onCallLead(lead)}
                    className="px-2.5 py-1.5 text-micro font-medium bg-emerald-500 text-white rounded-md hover:bg-emerald-600 transition-colors"
                  >
                    Call
                  </button>
                  <button
                    onClick={() => onLeadClick(lead.phone_normalized)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
                    title="View details"
                  >
                    <Eye size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
