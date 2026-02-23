import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2, Phone, PhoneCall, MapPin, Calendar, DollarSign,
  CheckSquare, Square, LayoutGrid, List, ChevronDown, ChevronRight,
  Clock, ArrowUpDown, Filter,
} from 'lucide-react';
import { CadenceStageIndicator } from './CadenceStageIndicator';
import { BatchDialPanel } from './BatchDialPanel';
import {
  fetchLocalDialerCallQueue,
  dialerCallLead,
  onDialerCacheUpdated,
  fetchDialerCallbacksDue,
} from '../../lib/database';
import { formatPhone } from '../../lib/utils/phone';
import { useToast } from '../ui/Toast';
import { cn } from '../../lib/utils';

// ── Sort / Filter types ──

type SortKey = 'priority' | 'rapport' | 'market_value' | 'next_call' | 'attempts' | 'name';
type FilterKey = 'callbacks' | 'hot_warm' | 'has_value';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'priority', label: 'Priority' },
  { key: 'rapport', label: 'Rapport Level' },
  { key: 'market_value', label: 'Market Value' },
  { key: 'next_call', label: 'Next Call Date' },
  { key: 'attempts', label: 'Fewest Attempts' },
  { key: 'name', label: 'Name A–Z' },
];

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'callbacks', label: 'Callbacks Due' },
  { key: 'hot_warm', label: 'Hot / Warm' },
  { key: 'has_value', label: 'Has Value' },
];

const RAPPORT_RANK: Record<string, number> = { hot: 4, warm: 3, warming: 2, cold: 1 };

function rapportBorderColor(level?: string): string {
  switch (level) {
    case 'hot': return 'border-l-orange-500';
    case 'warm': return 'border-l-amber-400';
    case 'warming': return 'border-l-yellow-400';
    default: return 'border-l-gray-200';
  }
}

// ── Component ──

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

  // Sort / filter / view state
  const [sortBy, setSortBy] = useState<SortKey>('priority');
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Callbacks banner
  const [callbacks, setCallbacks] = useState<any[]>([]);
  const [callbacksExpanded, setCallbacksExpanded] = useState(false);

  const loadQueue = useCallback(async () => {
    try {
      const [data, cbs] = await Promise.all([
        fetchLocalDialerCallQueue(200),
        fetchDialerCallbacksDue(),
      ]);
      setLeads(data || []);
      setCallbacks(cbs || []);
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

    // 2. Filters
    if (activeFilters.has('callbacks')) {
      result = result.filter((l: any) => l.callback_requested === 1 && l.callback_datetime);
    }
    if (activeFilters.has('hot_warm')) {
      result = result.filter((l: any) => ['hot', 'warm', 'warming'].includes(l.rapport_level));
    }
    if (activeFilters.has('has_value')) {
      result = result.filter((l: any) => l.market_value != null && Number(l.market_value) > 0);
    }

    // 3. Sort
    result.sort((a: any, b: any) => {
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
  }, [leads, searchQuery, activeFilters, sortBy]);

  // ── Handlers ──

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
    const ids = processed.slice(0, n).map(l => l.id);
    setSelectedIds(new Set(ids));
  };

  const toggleFilter = (key: FilterKey) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Loading / empty states ──

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
    <div className="space-y-3">
      {/* Batch dial bar */}
      <BatchDialPanel
        selectedLeadIds={Array.from(selectedIds)}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Callbacks Due Banner */}
      {callbacks.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setCallbacksExpanded(!callbacksExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 hover:bg-amber-100/50 transition-colors"
          >
            <span className="flex items-center gap-1.5 text-caption font-medium text-amber-800">
              <Clock size={13} />
              {callbacks.length} Callback{callbacks.length !== 1 ? 's' : ''} Due
            </span>
            {callbacksExpanded
              ? <ChevronDown size={14} className="text-amber-600" />
              : <ChevronRight size={14} className="text-amber-600" />}
          </button>
          {callbacksExpanded && (
            <div className="border-t border-amber-200 divide-y divide-amber-100">
              {callbacks.slice(0, 10).map((cb: any) => {
                const cbName = [cb.first_name, cb.last_name].filter(Boolean).join(' ') || 'Unknown';
                return (
                  <div key={cb.id} className="px-3 py-2 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-caption font-medium text-gray-900 truncate">{cbName}</p>
                      <p className="text-micro text-gray-500">
                        {cb.callback_datetime && new Date(cb.callback_datetime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {cb.rapport_level && (
                        <span className={cn(
                          'px-1.5 py-0.5 rounded-full text-micro font-medium',
                          cb.rapport_level === 'hot' ? 'bg-orange-50 text-orange-700' :
                          cb.rapport_level === 'warm' ? 'bg-amber-50 text-amber-700' :
                          'bg-gray-100 text-gray-500'
                        )}>
                          {cb.rapport_level}
                        </span>
                      )}
                      <button
                        onClick={(e) => handleCall(e, cb)}
                        disabled={callingLeadId !== null}
                        className="p-1 rounded-full text-green-600 hover:bg-green-50 transition-colors"
                        title="Call now"
                      >
                        <PhoneCall size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sort / Filter / View bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sort dropdown */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown size={12} className="text-gray-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="text-micro bg-white border border-gray-200 rounded-md px-2 py-1 pr-6 focus:outline-none focus:ring-1 focus:ring-blue-300 text-gray-700 cursor-pointer"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>

          <span className="text-gray-300">|</span>

          {/* Filter chips */}
          <div className="flex items-center gap-1.5">
            <Filter size={12} className="text-gray-400" />
            {FILTER_OPTIONS.map(f => (
              <button
                key={f.key}
                onClick={() => toggleFilter(f.key)}
                className={cn(
                  'px-2 py-0.5 rounded-full text-micro font-medium transition-colors',
                  activeFilters.has(f.key)
                    ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                )}
              >
                {f.label}
              </button>
            ))}
            {activeFilters.size > 0 && (
              <button
                onClick={() => setActiveFilters(new Set())}
                className="text-micro text-red-500 hover:text-red-600 ml-1"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* View toggle + count */}
        <div className="flex items-center gap-2">
          <span className="text-micro text-gray-500">{processed.length} leads</span>
          <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('cards')}
              className={cn(
                'p-1.5 transition-colors',
                viewMode === 'cards' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              )}
              title="Card view"
            >
              <LayoutGrid size={13} />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'p-1.5 transition-colors',
                viewMode === 'table' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              )}
              title="Table view"
            >
              <List size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Quick select controls */}
      <div className="flex items-center gap-3 text-micro text-gray-500">
        <button onClick={() => selectTop(10)} className="hover:text-blue-600 transition-colors">Select top 10</button>
        <button onClick={() => selectTop(25)} className="hover:text-blue-600 transition-colors">Top 25</button>
        <button onClick={() => selectTop(50)} className="hover:text-blue-600 transition-colors">Top 50</button>
        {selectedIds.size > 0 && (
          <button onClick={() => setSelectedIds(new Set())} className="text-red-500 hover:text-red-600 transition-colors">
            Deselect all ({selectedIds.size})
          </button>
        )}
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
                        setSelectedIds(new Set());
                      } else {
                        setSelectedIds(new Set(processed.map(l => l.id)));
                      }
                    }}
                    className="text-gray-400 hover:text-blue-500"
                  >
                    {selectedIds.size === processed.length && processed.length > 0
                      ? <CheckSquare size={13} className="text-blue-500" />
                      : <Square size={13} />}
                  </button>
                </th>
                <SortableHeader label="Name" sortKey="name" currentSort={sortBy} onSort={setSortBy} />
                <th className="text-left px-2 py-2 text-micro font-medium text-gray-500">Phone</th>
                <th className="text-left px-2 py-2 text-micro font-medium text-gray-500">Location</th>
                <SortableHeader label="Rapport" sortKey="rapport" currentSort={sortBy} onSort={setSortBy} />
                <SortableHeader label="Priority" sortKey="priority" currentSort={sortBy} onSort={setSortBy} align="right" />
                <th className="text-center px-2 py-2 text-micro font-medium text-gray-500">Cadence</th>
                <SortableHeader label="Attempts" sortKey="attempts" currentSort={sortBy} onSort={setSortBy} align="right" />
                <SortableHeader label="Next Call" sortKey="next_call" currentSort={sortBy} onSort={setSortBy} />
                <SortableHeader label="Market Val" sortKey="market_value" currentSort={sortBy} onSort={setSortBy} align="right" />
                <th className="w-10 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {processed.map((lead: any) => {
                const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
                const location = [lead.county, lead.state].filter(Boolean).join(', ');
                const isSelected = selectedIds.has(lead.id);

                return (
                  <tr
                    key={lead.id}
                    className={cn(
                      'border-b border-gray-50 last:border-0 cursor-pointer transition-colors',
                      isSelected ? 'bg-blue-50/50' : 'hover:bg-gray-50'
                    )}
                    onClick={() => onLeadClick(lead)}
                  >
                    <td className="px-2 py-1.5">
                      <button onClick={(e) => toggleSelect(e, lead.id)} className="text-gray-400 hover:text-blue-500">
                        {isSelected
                          ? <CheckSquare size={13} className="text-blue-500" />
                          : <Square size={13} />}
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className="text-sm font-medium text-gray-900 truncate block max-w-[140px]">{name}</span>
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
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">
                      {lead.priority_score > 0 ? lead.priority_score : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-center text-gray-500 tabular-nums">
                      {lead.cadence_stage != null ? `${lead.cadence_stage}/14` : '—'}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">
                      {lead.attempt_count || 0}
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
                      <button
                        onClick={(e) => handleCall(e, lead)}
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CARD VIEW ── */}
      {viewMode === 'cards' && processed.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {processed.map((lead: any) => {
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
                  'bg-white rounded-lg border border-l-[3px] shadow-xs p-3.5 cursor-pointer hover:shadow-sm transition-all',
                  rapportBorderColor(lead.rapport_level),
                  isSelected
                    ? 'border-t-blue-400 border-r-blue-400 border-b-blue-400 ring-1 ring-blue-200'
                    : 'border-t-gray-200 border-r-gray-200 border-b-gray-200 hover:border-t-blue-300 hover:border-r-blue-300 hover:border-b-blue-300'
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
                    {lead.priority_score > 0 && (
                      <span
                        className="text-micro text-gray-400 tabular-nums"
                        title={lead.priority_reason || `Priority: ${lead.priority_score}`}
                      >
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

                {/* Callback indicator */}
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
          })}
        </div>
      )}
    </div>
  );
};

// ── Sortable table header helper ──

const SortableHeader: React.FC<{
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right' | 'center';
}> = ({ label, sortKey, currentSort, onSort, align = 'left' }) => (
  <th
    className={cn(
      'px-2 py-2 text-micro font-medium cursor-pointer hover:text-gray-700 transition-colors select-none',
      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
      currentSort === sortKey ? 'text-blue-600' : 'text-gray-500'
    )}
    onClick={() => onSort(sortKey)}
  >
    {label}
    {currentSort === sortKey && <span className="ml-0.5 text-blue-400">*</span>}
  </th>
);
