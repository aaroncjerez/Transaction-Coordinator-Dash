import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2, Phone, PhoneCall, MapPin, Calendar, DollarSign,
  CheckSquare, Square, LayoutGrid, List, Clock, RefreshCw, Filter, Download, MoreVertical, Ban, Tag, X,
} from 'lucide-react';
import { CadenceStageIndicator } from './CadenceStageIndicator';
import { SentimentBadge } from './SentimentBadge';
import { AIReviewBadge } from './AIReviewBadge';
import {
  fetchLocalDialerCallQueue,
  fetchLeadsByList,
  dialerCallLead,
  onDialerCacheUpdated,
  addDialerManualDNC,
  setDialerLeadOutcome,
  setDialerLeadCallback,
} from '../../lib/database';
import { formatPhone } from '../../lib/utils/phone';
import { exportQueueCsv } from '../../lib/csv-export';
import { useToast } from '../ui/Toast';
import { cn } from '../../lib/utils';
import type { SortKey } from './FilterSidebar';

// ── Constants ──

const RAPPORT_RANK: Record<string, number> = { hot: 4, warm: 3, warming: 2, cold: 1 };

function parseReviewJson(lead: any): { dnc_detected?: boolean; is_hot_lead?: boolean } | null {
  if (!lead.last_review_json) return null;
  try { return JSON.parse(lead.last_review_json); } catch { return null; }
}

function rapportBorderColor(level?: string): string {
  switch (level) {
    case 'hot': return 'border-l-orange-500';
    case 'warm': return 'border-l-amber-400';
    case 'warming': return 'border-l-yellow-400';
    default: return 'border-l-gray-200';
  }
}

// Status color coding for call outcomes
function callStatusIndicator(lead: any): { color: string; label: string } {
  const status = lead.last_call_status || lead.call_status;
  if (!status) return { color: 'bg-gray-300', label: 'Ready' };
  switch (status) {
    case 'dial_requested':
    case 'queued':
      return { color: 'bg-blue-500', label: 'Requested' };
    case 'in_progress':
    case 'ringing':
      return { color: 'bg-yellow-400', label: 'In Progress' };
    case 'completed':
    case 'connected':
      return { color: 'bg-green-500', label: 'Connected' };
    case 'no_answer':
    case 'voicemail':
    case 'busy':
      return { color: 'bg-orange-400', label: 'No Answer' };
    case 'failed':
    case 'declined':
    case 'error':
      return { color: 'bg-red-500', label: 'Failed' };
    default:
      return { color: 'bg-gray-300', label: 'Ready' };
  }
}

// ── Lead Action Menu ──

const OUTCOME_OPTIONS = [
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'wrong_number', label: 'Wrong Number' },
  { value: 'no_answer_final', label: 'No Answer (Final)' },
  { value: 'deal', label: 'Deal' },
  { value: 'other', label: 'Other' },
];

const LeadActionMenu: React.FC<{
  lead: any;
  onDone: () => void;
  showToast: (opts: { message: string; type: string }) => void;
}> = ({ lead, onDone, showToast }) => {
  const [open, setOpen] = useState(false);
  const [showOutcomes, setShowOutcomes] = useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowOutcomes(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleDNC = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await addDialerManualDNC(lead.phone_normalized, 'Queue action menu');
      showToast({ message: `${lead.first_name || 'Lead'} added to DNC`, type: 'success' });
      onDone();
    } catch (err: any) {
      showToast({ message: err.message || 'Failed to add DNC', type: 'error' });
    }
    setOpen(false);
  };

  const handleOutcome = async (e: React.MouseEvent, outcome: string) => {
    e.stopPropagation();
    try {
      await setDialerLeadOutcome(lead.phone_normalized, outcome);
      showToast({ message: `Outcome set: ${outcome.replace(/_/g, ' ')}`, type: 'success' });
      onDone();
    } catch (err: any) {
      showToast({ message: err.message || 'Failed to set outcome', type: 'error' });
    }
    setOpen(false);
    setShowOutcomes(false);
  };

  const handleCallback = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    try {
      await setDialerLeadCallback(lead.phone_normalized, tomorrow.toISOString());
      showToast({ message: `Callback set for tomorrow 10am`, type: 'success' });
      onDone();
    } catch (err: any) {
      showToast({ message: err.message || 'Failed to set callback', type: 'error' });
    }
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); setShowOutcomes(false); }}
        className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        title="Actions"
      >
        <MoreVertical size={13} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 py-1 w-44">
          <button onClick={handleDNC} className="w-full flex items-center gap-2 px-3 py-1.5 text-micro text-red-600 hover:bg-red-50 transition-colors text-left">
            <Ban size={12} /> Add to DNC
          </button>
          <button onClick={(e) => { e.stopPropagation(); setShowOutcomes(!showOutcomes); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-micro text-gray-700 hover:bg-gray-50 transition-colors text-left">
            <Tag size={12} /> Set Outcome
          </button>
          {showOutcomes && (
            <div className="border-t border-gray-100 py-1">
              {OUTCOME_OPTIONS.map(o => (
                <button key={o.value} onClick={(e) => handleOutcome(e, o.value)} className="w-full px-6 py-1 text-micro text-gray-600 hover:bg-gray-50 transition-colors text-left">
                  {o.label}
                </button>
              ))}
            </div>
          )}
          <button onClick={handleCallback} className="w-full flex items-center gap-2 px-3 py-1.5 text-micro text-gray-700 hover:bg-gray-50 transition-colors text-left">
            <Clock size={12} /> Callback Tomorrow
          </button>
        </div>
      )}
    </div>
  );
};

// ── Component ──

interface CallQueuePanelProps {
  searchQuery: string;
  onLeadClick: (lead: any) => void;
  listIds?: string[];
  browseMode?: boolean;
  selectedLeadPhone?: string | null;
  fromNumber?: string;

  // Parent-controlled filter/sort state
  selectedState: string;
  selectedCounty: string;
  sortBy: SortKey;
  marketValueMin?: number | null;
  marketValueMax?: number | null;

  // Selection (lifted to parent)
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;

  // Notify parent of derived geo options + lead count
  onLeadsLoaded?: (leads: any[]) => void;
}

export const CallQueuePanel: React.FC<CallQueuePanelProps> = ({
  searchQuery, onLeadClick, listIds, browseMode, selectedLeadPhone, fromNumber,
  selectedState, selectedCounty, sortBy, marketValueMin, marketValueMax,
  selectedIds, onSelectedIdsChange, onLeadsLoaded,
}) => {
  const [leads, setLeads] = useState<any[]>([]);
  const [filteredOutCount, setFilteredOutCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [callingLeadId, setCallingLeadId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [showGuardInfo, setShowGuardInfo] = useState(false);
  const { showToast } = useToast();

  const loadQueue = useCallback(async () => {
    try {
      const listFilter = listIds && listIds.length > 0 ? listIds : undefined;
      const data = browseMode && listFilter
        ? await fetchLeadsByList(listFilter, 500)
        : await fetchLocalDialerCallQueue(200, listFilter);
      // Filter out non-dialable leads by default (core fix for preventing duplicate dialing)
      const allLeads = data || [];
      const dialable = allLeads.filter((l: any) => l.is_dialable !== 0);
      const blocked = allLeads.length - dialable.length;
      setFilteredOutCount(blocked);
      setLeads(dialable);
      onLeadsLoaded?.(dialable);
    } catch (err) {
      console.error('Error loading call queue:', err);
    } finally {
      setLoading(false);
    }
  }, [listIds, browseMode, onLeadsLoaded]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  useEffect(() => {
    const unsub = onDialerCacheUpdated((data) => {
      if (data.type === 'queue') loadQueue();
    });
    return () => unsub();
  }, [loadQueue]);

  // ── Filter + Sort pipeline ──

  const processed = useMemo(() => {
    let result = [...leads];

    // 1. Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l: any) =>
        (l.first_name || '').toLowerCase().includes(q) ||
        (l.last_name || '').toLowerCase().includes(q) ||
        (l.county || '').toLowerCase().includes(q) ||
        (l.phone_normalized || '').includes(q)
      );
    }

    // 2. Geo filters
    if (selectedState) {
      result = result.filter((l: any) => (l.state || '').trim() === selectedState);
    }
    if (selectedCounty) {
      result = result.filter((l: any) => (l.county || '').trim() === selectedCounty);
    }

    // 3. Market value range filter
    if (marketValueMin != null) {
      result = result.filter((l: any) => l.market_value != null && Number(l.market_value) >= marketValueMin);
    }
    if (marketValueMax != null) {
      result = result.filter((l: any) => l.market_value != null && Number(l.market_value) <= marketValueMax);
    }

    // 4. Sort — callbacks due float to top
    const now = Date.now();
    result.sort((a: any, b: any) => {
      const aCallbackDue = a.callback_datetime && new Date(a.callback_datetime).getTime() <= now ? 1 : 0;
      const bCallbackDue = b.callback_datetime && new Date(b.callback_datetime).getTime() <= now ? 1 : 0;
      if (aCallbackDue !== bCallbackDue) return bCallbackDue - aCallbackDue;

      switch (sortBy) {
        case 'priority':
          return (b.priority_score || 0) - (a.priority_score || 0);
        case 'rapport':
          return (RAPPORT_RANK[b.rapport_level] || 0) - (RAPPORT_RANK[a.rapport_level] || 0);
        case 'market_value': {
          const av = a.market_value != null ? Number(a.market_value) : -1;
          const bv = b.market_value != null ? Number(b.market_value) : -1;
          return bv - av;
        }
        case 'next_call': {
          const at = a.next_call_date ? new Date(a.next_call_date).getTime() : Infinity;
          const bt = b.next_call_date ? new Date(b.next_call_date).getTime() : Infinity;
          return at - bt;
        }
        case 'attempts':
          return (a.attempt_count || 0) - (b.attempt_count || 0);
        case 'name': {
          const an = `${a.last_name || ''} ${a.first_name || ''}`.trim().toLowerCase();
          const bn = `${b.last_name || ''} ${b.first_name || ''}`.trim().toLowerCase();
          return an.localeCompare(bn);
        }
        default:
          return 0;
      }
    });

    return result;
  }, [leads, searchQuery, selectedState, selectedCounty, sortBy, marketValueMin, marketValueMax]);

  // ── Handlers ──

  const handleCall = async (e: React.MouseEvent, lead: any) => {
    e.stopPropagation();
    const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
    setCallingLeadId(lead.id);
    try {
      const leadWithNumber = fromNumber ? { ...lead, from_number: fromNumber } : lead;
      await dialerCallLead(leadWithNumber);
      showToast({ message: `Calling ${name}...`, type: 'success' });
      onSelectedIdsChange((() => { const next = new Set(selectedIds); next.delete(lead.id); return next; })());
      await loadQueue();
    } catch (err: any) {
      showToast({ message: err.message || 'Call failed', type: 'error' });
    } finally {
      setCallingLeadId(null);
    }
  };

  const toggleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  };

  const selectTop = (n: number) => {
    const ids = processed.slice(0, n).map(l => l.id);
    onSelectedIdsChange(new Set(ids));
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadQueue();
      showToast({ message: 'Queue refreshed', type: 'success' });
    } finally {
      setRefreshing(false);
    }
  };

  // ── Loading / empty ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="text-center py-20">
        <Phone size={32} className="mx-auto mb-3 text-gray-300" />
        <p className="text-sm text-gray-500">
          No leads ready to call. Check cadence settings or import leads.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Compact toolbar: quick-select + view toggle + count */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3 text-micro text-gray-500">
          <button onClick={() => selectTop(10)} className="hover:text-blue-600 transition-colors">Top 10</button>
          <button onClick={() => selectTop(25)} className="hover:text-blue-600 transition-colors">Top 25</button>
          <button onClick={() => selectTop(50)} className="hover:text-blue-600 transition-colors">Top 50</button>
          <button onClick={() => selectTop(100)} className="hover:text-blue-600 transition-colors">Top 100</button>
          <button onClick={() => selectTop(processed.length)} className="hover:text-blue-600 font-medium transition-colors">All ({processed.length})</button>
          {selectedIds.size > 0 && (
            <button onClick={() => onSelectedIdsChange(new Set())} className="text-red-500 hover:text-red-600 transition-colors">
              Deselect ({selectedIds.size})
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 px-2 py-1 text-micro font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50"
            title="Refresh queue"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {processed.length > 0 && (
            <button
              onClick={() => exportQueueCsv(processed)}
              className="flex items-center gap-1 px-2 py-1 text-micro font-medium text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              title="Export queue as CSV"
            >
              <Download size={12} />
            </button>
          )}
          <span className="text-micro text-gray-400 tabular-nums">{processed.length} leads</span>
          {filteredOutCount > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowGuardInfo(!showGuardInfo)}
                className="text-micro text-amber-500 hover:text-amber-600 transition-colors"
                title="Why are some leads hidden?"
              >
                +{filteredOutCount} blocked
              </button>
              {showGuardInfo && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-3 w-64">
                  <p className="text-caption font-semibold text-gray-800 mb-1.5">Why {filteredOutCount} leads are hidden</p>
                  <ul className="text-micro text-gray-600 space-y-1">
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-500 mt-0.5">•</span>
                      <span>Called within the last 24 hours</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-500 mt-0.5">•</span>
                      <span>Had a real conversation (30s+ call)</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-500 mt-0.5">•</span>
                      <span>On the DNC list</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="text-amber-500 mt-0.5">•</span>
                      <span>Cadence not yet due</span>
                    </li>
                  </ul>
                  <p className="text-micro text-gray-400 mt-2">These leads will reappear when eligible.</p>
                </div>
              )}
            </div>
          )}
          <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('cards')}
              className={cn(
                'p-1.5 transition-colors',
                viewMode === 'cards' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              )}
              title="Card view"
            >
              <LayoutGrid size={12} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'p-1.5 transition-colors',
                viewMode === 'table' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              )}
              title="Table view"
            >
              <List size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Empty after filter */}
      {processed.length === 0 && (
        <div className="text-center py-12">
          <Filter size={24} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-500">No leads match current filters.</p>
        </div>
      )}

      {/* ── TABLE VIEW ── */}
      {viewMode === 'table' && processed.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
          <table className="w-full text-caption">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                <th className="w-8 px-2 py-2">
                  <button
                    onClick={() => {
                      if (selectedIds.size === processed.length) {
                        onSelectedIdsChange(new Set());
                      } else {
                        onSelectedIdsChange(new Set(processed.map(l => l.id)));
                      }
                    }}
                    className="text-gray-400 hover:text-blue-500"
                  >
                    {selectedIds.size === processed.length && processed.length > 0
                      ? <CheckSquare size={13} className="text-blue-500" />
                      : <Square size={13} />}
                  </button>
                </th>
                <th className="text-left px-2 py-2 text-micro font-medium text-gray-500">Name</th>
                <th className="text-left px-2 py-2 text-micro font-medium text-gray-500">Phone</th>
                <th className="text-left px-2 py-2 text-micro font-medium text-gray-500">Location</th>
                <th className="text-left px-2 py-2 text-micro font-medium text-gray-500">Rapport</th>
                <th className="text-left px-2 py-2 text-micro font-medium text-gray-500">Intel</th>
                <th className="text-right px-2 py-2 text-micro font-medium text-gray-500">Priority</th>
                <th className="text-center px-2 py-2 text-micro font-medium text-gray-500">Cadence</th>
                <th className="text-right px-2 py-2 text-micro font-medium text-gray-500">Attempts</th>
                <th className="text-left px-2 py-2 text-micro font-medium text-gray-500">Last #</th>
                <th className="text-left px-2 py-2 text-micro font-medium text-gray-500">Next Call</th>
                <th className="text-right px-2 py-2 text-micro font-medium text-gray-500">Market Val</th>
                <th className="w-10 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {processed.map((lead: any) => (
                <TableRow
                  key={lead.id}
                  lead={lead}
                  isSelected={selectedIds.has(lead.id)}
                  callingLeadId={callingLeadId}
                  onLeadClick={onLeadClick}
                  onToggleSelect={toggleSelect}
                  onCall={handleCall}
                  isViewing={selectedLeadPhone === lead.phone_normalized}
                  onActionDone={loadQueue}
                  showToast={showToast}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CARD VIEW ── */}
      {viewMode === 'cards' && processed.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {processed.map((lead: any) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              isSelected={selectedIds.has(lead.id)}
              callingLeadId={callingLeadId}
              onLeadClick={onLeadClick}
              onToggleSelect={toggleSelect}
              onCall={handleCall}
              isViewing={selectedLeadPhone === lead.phone_normalized}
              onActionDone={loadQueue}
              showToast={showToast}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Table row sub-component ──

const TableRow: React.FC<{
  lead: any;
  isSelected: boolean;
  callingLeadId: string | null;
  onLeadClick: (lead: any) => void;
  onToggleSelect: (e: React.MouseEvent, id: string) => void;
  onCall: (e: React.MouseEvent, lead: any) => void;
  isViewing?: boolean;
  onActionDone: () => void;
  showToast: (opts: { message: string; type: string }) => void;
}> = ({ lead, isSelected, callingLeadId, onLeadClick, onToggleSelect, onCall, isViewing, onActionDone, showToast }) => {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
  const location = [lead.county, lead.state].filter(Boolean).join(', ');
  const status = callStatusIndicator(lead);

  return (
    <tr
      className={cn(
        'border-b border-gray-50 last:border-0 cursor-pointer transition-colors',
        isViewing
          ? 'bg-blue-50 border-l-2 border-l-blue-500'
          : isSelected ? 'bg-blue-50/50' : 'hover:bg-gray-50'
      )}
      onClick={() => onLeadClick(lead)}
    >
      <td className="px-2 py-1.5">
        <button onClick={(e) => onToggleSelect(e, lead.id)} className="text-gray-400 hover:text-blue-500">
          {isSelected
            ? <CheckSquare size={13} className="text-blue-500" />
            : <Square size={13} />}
        </button>
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', status.color)} aria-hidden="true" />
          <span className="text-sm font-medium text-gray-900 truncate max-w-[140px]">{name}</span>
          {status.label !== 'Ready' && (
            <span className="text-micro text-gray-400 flex-shrink-0">{status.label}</span>
          )}
        </div>
      </td>
      <td className="px-2 py-1.5 text-gray-500 tabular-nums">{formatPhone(lead.phone_normalized)}</td>
      <td className="px-2 py-1.5 text-gray-500 truncate max-w-[120px]">{location || '—'}</td>
      <td className="px-2 py-1.5">
        {lead.rapport_level ? (
          <span className={cn(
            'px-1.5 py-0.5 rounded-full text-micro font-medium',
            lead.rapport_level === 'hot' ? 'bg-orange-50 text-orange-700' :
            lead.rapport_level === 'warm' ? 'bg-amber-50 text-amber-700' :
            lead.rapport_level === 'warming' ? 'bg-yellow-50 text-yellow-700' :
            'bg-gray-100 text-gray-500'
          )}>
            {lead.rapport_level}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          {lead.last_sentiment && <SentimentBadge sentiment={lead.last_sentiment} size="sm" />}
          <AIReviewBadge review={parseReviewJson(lead)} />
        </div>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">
        {lead.priority_score > 0 ? lead.priority_score : '—'}
      </td>
      <td className="px-2 py-1.5 text-center text-gray-500 tabular-nums">
        {lead.cadence_stage != null ? `${lead.cadence_stage}/14` : '—'}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">
        {lead.total_call_attempts || lead.attempt_count || 0}
      </td>
      <td className="px-2 py-1.5 text-gray-400 text-micro tabular-nums truncate max-w-[90px]" title={lead.last_called_by || ''}>
        {lead.last_called_by ? lead.last_called_by.replace('+1', '').replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3') : '—'}
      </td>
      <td className="px-2 py-1.5 text-gray-500">
        {lead.next_call_date
          ? new Date(lead.next_call_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : '—'}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">
        {lead.market_value ? `$${Number(lead.market_value).toLocaleString()}` : '—'}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => onCall(e, lead)}
            disabled={callingLeadId !== null}
            className={cn(
              'p-1 rounded-full transition-colors',
              callingLeadId === lead.id
                ? 'bg-green-100 text-green-500'
                : callingLeadId !== null
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'text-green-600 hover:bg-green-50'
            )}
            title="Call now"
          >
            {callingLeadId === lead.id
              ? <Loader2 size={13} className="animate-spin" />
              : <PhoneCall size={13} />}
          </button>
          <LeadActionMenu lead={lead} onDone={onActionDone} showToast={showToast} />
        </div>
      </td>
    </tr>
  );
};

// ── Card sub-component ──

const LeadCard: React.FC<{
  lead: any;
  isSelected: boolean;
  callingLeadId: string | null;
  onLeadClick: (lead: any) => void;
  onToggleSelect: (e: React.MouseEvent, id: string) => void;
  onCall: (e: React.MouseEvent, lead: any) => void;
  isViewing?: boolean;
  onActionDone: () => void;
  showToast: (opts: { message: string; type: string }) => void;
}> = ({ lead, isSelected, callingLeadId, onLeadClick, onToggleSelect, onCall, isViewing, onActionDone, showToast }) => {
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
  const location = [lead.county, lead.state].filter(Boolean).join(', ');
  const status = callStatusIndicator(lead);
  const hasOffer = lead.min_offer != null || lead.max_offer != null;
  const offerText = lead.min_offer != null && lead.max_offer != null
    ? `$${Number(lead.min_offer).toLocaleString()} – $${Number(lead.max_offer).toLocaleString()}`
    : lead.min_offer != null
      ? `$${Number(lead.min_offer).toLocaleString()}`
      : `$${Number(lead.max_offer).toLocaleString()}`;

  return (
    <div
      className={cn(
        'bg-white rounded-lg border border-l-[3px] shadow-xs p-3.5 cursor-pointer hover:shadow-sm transition-all',
        rapportBorderColor(lead.rapport_level),
        isViewing
          ? 'border-t-blue-500 border-r-blue-500 border-b-blue-500 ring-2 ring-blue-300 bg-blue-50/40 shadow-sm'
          : isSelected
            ? 'border-t-blue-400 border-r-blue-400 border-b-blue-400 ring-1 ring-blue-200'
            : 'border-t-gray-200 border-r-gray-200 border-b-gray-200 hover:border-t-blue-300 hover:border-r-blue-300 hover:border-b-blue-300'
      )}
      onClick={() => onLeadClick(lead)}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={(e) => onToggleSelect(e, lead.id)}
            className="shrink-0 text-gray-400 hover:text-blue-500 transition-colors"
          >
            {isSelected
              ? <CheckSquare size={14} className="text-blue-500" />
              : <Square size={14} />}
          </button>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', status.color)} aria-hidden="true" />
              {name}
              {status.label !== 'Ready' && (
                <span className="text-micro text-gray-400 font-normal flex-shrink-0">{status.label}</span>
              )}
            </p>
            {location && (
              <p className="text-micro text-gray-400 flex items-center gap-1 mt-0.5">
                <MapPin size={10} /> {location}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {lead.priority_score > 0 && (
            <span className="text-micro text-gray-400 tabular-nums" title={lead.priority_reason || `Priority: ${lead.priority_score}`}>
              P:{lead.priority_score}
            </span>
          )}
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
          <AIReviewBadge review={parseReviewJson(lead)} />
          <button
            onClick={(e) => onCall(e, lead)}
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
          <LeadActionMenu lead={lead} onDone={onActionDone} showToast={showToast} />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <p className="text-caption text-gray-500">{formatPhone(lead.phone_normalized)}</p>
        {lead.last_sentiment && <SentimentBadge sentiment={lead.last_sentiment} size="sm" />}
      </div>

      <CadenceStageIndicator stage={lead.cadence_stage} className="mb-2" />

      <div className="flex items-center justify-between text-micro text-gray-400">
        <span>Attempts: {lead.total_call_attempts || lead.attempt_count || 0}</span>
        {lead.last_called_by && (
          <span className="text-gray-300" title={`Last called from ${lead.last_called_by}`}>
            Last: {lead.last_called_by.replace('+1', '').slice(-4)}
          </span>
        )}
        {lead.next_call_date && (
          <span className="flex items-center gap-0.5">
            <Calendar size={10} />
            {new Date(lead.next_call_date).toLocaleDateString()}
          </span>
        )}
      </div>

      {lead.callback_datetime && (
        <p className="text-micro text-amber-600 mt-1 flex items-center gap-1">
          <Clock size={10} />
          Callback: {new Date(lead.callback_datetime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
      )}

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
};
