import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Phone, PhoneCall, MapPin, Calendar, DollarSign, CheckSquare, Square } from 'lucide-react';
import { CadenceStageIndicator } from './CadenceStageIndicator';
import { BatchDialPanel } from './BatchDialPanel';
import { fetchLocalDialerCallQueue, dialerCallLead, onDialerCacheUpdated } from '../../lib/database';
import { formatPhone } from '../../lib/utils/phone';
import { useToast } from '../ui/Toast';
import { cn } from '../../lib/utils';

interface CallQueuePanelProps {
  searchQuery: string;
  onLeadClick: (lead: any) => void;
}

export const CallQueuePanel: React.FC<CallQueuePanelProps> = ({ searchQuery, onLeadClick }) => {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { showToast } = useToast();

  const loadQueue = useCallback(async () => {
    try {
      const data = await fetchLocalDialerCallQueue(200);
      setLeads(data || []);
    } catch (err) {
      console.error('Error loading call queue:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  useEffect(() => {
    onDialerCacheUpdated((data) => {
      if (data.type === 'queue') loadQueue();
    });
  }, [loadQueue]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return leads;
    const q = searchQuery.toLowerCase();
    return leads.filter((l: any) =>
      (l.first_name || '').toLowerCase().includes(q) ||
      (l.last_name || '').toLowerCase().includes(q) ||
      (l.county || '').toLowerCase().includes(q) ||
      (l.phone_normalized || '').includes(q)
    );
  }, [leads, searchQuery]);

  const handleCall = async (e: React.MouseEvent, lead: any) => {
    e.stopPropagation();
    const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
    setCallingLeadId(lead.id);
    try {
      await dialerCallLead(lead);
      showToast({ message: `Calling ${name}...`, type: 'success' });
      loadQueue();
    } catch (err: any) {
      showToast({ message: err.message || 'Call failed', type: 'error' });
    } finally {
      setCallingLeadId(null);
    }
  };

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectTop = (n: number) => {
    const ids = filtered.slice(0, n).map(l => l.id);
    setSelectedIds(new Set(ids));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-20">
        <Phone size={32} className="mx-auto mb-3 text-gray-300" />
        <p className="text-sm text-gray-500">
          {leads.length === 0
            ? 'No leads ready to call. Check cadence settings or import leads.'
            : 'No matching leads in queue.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Batch dial bar */}
      <BatchDialPanel
        selectedLeadIds={Array.from(selectedIds)}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Quick select controls */}
      <div className="flex items-center gap-3 text-micro text-gray-500">
        <span>{filtered.length} leads in queue</span>
        <span className="text-gray-300">|</span>
        <button onClick={() => selectTop(10)} className="hover:text-blue-600 transition-colors">Select top 10</button>
        <button onClick={() => selectTop(25)} className="hover:text-blue-600 transition-colors">Top 25</button>
        <button onClick={() => selectTop(50)} className="hover:text-blue-600 transition-colors">Top 50</button>
        {selectedIds.size > 0 && (
          <button onClick={() => setSelectedIds(new Set())} className="text-red-500 hover:text-red-600 transition-colors">
            Deselect all ({selectedIds.size})
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map((lead: any) => {
          const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
          const location = [lead.county, lead.state].filter(Boolean).join(', ');
          const hasOffer = lead.min_offer != null || lead.max_offer != null;
          const offerText = lead.min_offer != null && lead.max_offer != null
            ? `$${Number(lead.min_offer).toLocaleString()} – $${Number(lead.max_offer).toLocaleString()}`
            : lead.min_offer != null
              ? `$${Number(lead.min_offer).toLocaleString()}`
              : `$${Number(lead.max_offer).toLocaleString()}`;
          const isSelected = selectedIds.has(lead.id);

          return (
            <div
              key={lead.id}
              className={cn(
                'bg-white rounded-lg border shadow-xs p-3.5 cursor-pointer hover:shadow-sm transition-all',
                isSelected
                  ? 'border-blue-400 ring-1 ring-blue-200'
                  : 'border-gray-200 hover:border-blue-300'
              )}
              onClick={() => onLeadClick(lead)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={(e) => toggleSelect(e, lead.id)}
                    className="shrink-0 text-gray-400 hover:text-blue-500 transition-colors"
                  >
                    {isSelected
                      ? <CheckSquare size={14} className="text-blue-500" />
                      : <Square size={14} />}
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                    {location && (
                      <p className="text-micro text-gray-400 flex items-center gap-1 mt-0.5">
                        <MapPin size={10} /> {location}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {lead.rapport_level && (
                    <span className={cn(
                      'px-1.5 py-0.5 rounded-full text-micro font-medium',
                      lead.rapport_level === 'hot' ? 'bg-orange-50 text-orange-700' :
                      lead.rapport_level === 'warm' ? 'bg-amber-50 text-amber-700' :
                      lead.rapport_level === 'warming' ? 'bg-yellow-50 text-yellow-700' :
                      'bg-gray-100 text-gray-500'
                    )}>
                      {lead.rapport_level}
                    </span>
                  )}
                  <button
                    onClick={(e) => handleCall(e, lead)}
                    disabled={callingLeadId !== null}
                    className={cn(
                      'p-1.5 rounded-full transition-colors',
                      callingLeadId === lead.id
                        ? 'bg-green-100 text-green-500'
                        : callingLeadId !== null
                          ? 'text-gray-300 cursor-not-allowed'
                          : 'text-green-600 hover:bg-green-50 hover:text-green-700'
                    )}
                    title="Call now"
                  >
                    {callingLeadId === lead.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <PhoneCall size={14} />
                    )}
                  </button>
                </div>
              </div>

              <p className="text-caption text-gray-500 mb-2">{formatPhone(lead.phone_normalized)}</p>

              <CadenceStageIndicator stage={lead.cadence_stage} className="mb-2" />

              <div className="flex items-center justify-between text-micro text-gray-400">
                <span>Attempts: {lead.attempt_count || 0}</span>
                {lead.next_call_date && (
                  <span className="flex items-center gap-0.5">
                    <Calendar size={10} />
                    {new Date(lead.next_call_date).toLocaleDateString()}
                  </span>
                )}
              </div>

              {lead.market_value && (
                <p className="text-micro text-gray-400 mt-1">
                  Market: ${Number(lead.market_value).toLocaleString()}
                </p>
              )}

              {hasOffer && (
                <p className="text-micro text-green-600 mt-0.5 flex items-center gap-0.5">
                  <DollarSign size={10} />
                  Offer: {offerText}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
