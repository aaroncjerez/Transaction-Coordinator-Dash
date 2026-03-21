import React, { useState, useEffect, useCallback } from 'react';
import {
  Flame, Clock, MapPin, ArrowUpDown, List, ChevronDown,
  PhoneCall, X, DollarSign,
} from 'lucide-react';
import { fetchDialerHotLeads, fetchDialerCallbacksDue, fetchDialerLists } from '../../lib/database';
import { formatPhone } from '../../lib/utils/phone';
import { cn } from '../../lib/utils';

// ── Types ──

export type SortKey = 'priority' | 'rapport' | 'market_value' | 'next_call' | 'attempts' | 'name';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'priority', label: 'Priority' },
  { key: 'rapport', label: 'Rapport Level' },
  { key: 'market_value', label: 'Market Value' },
  { key: 'next_call', label: 'Next Call Date' },
  { key: 'attempts', label: 'Fewest Attempts' },
  { key: 'name', label: 'Name A–Z' },
];

// ── Props ──

interface FilterSidebarProps {
  // Geo filters
  selectedState: string;
  onStateChange: (state: string) => void;
  selectedCounty: string;
  onCountyChange: (county: string) => void;
  stateOptions: { value: string; label: string }[];
  countyOptions: { value: string; label: string }[];

  // Sort & filter
  sortBy: SortKey;
  onSortChange: (key: SortKey) => void;
  // Market value range
  marketValueMin: number | null;
  onMarketValueMinChange: (val: number | null) => void;
  marketValueMax: number | null;
  onMarketValueMaxChange: (val: number | null) => void;

  // Lists
  selectedListIds: string[];
  onListSelectionChange: (listIds: string[]) => void;

  // Lead actions
  onLeadClick: (phoneNormalized: string) => void;
  onCallLead: (lead: any) => void;
  callingLeadId: string | null;
}

// ── Component ──

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  selectedState, onStateChange, selectedCounty, onCountyChange,
  stateOptions, countyOptions,
  sortBy, onSortChange,
  marketValueMin, onMarketValueMinChange, marketValueMax, onMarketValueMaxChange,
  selectedListIds, onListSelectionChange,
  onLeadClick, onCallLead, callingLeadId,
}) => {
  const [hotLeads, setHotLeads] = useState<any[]>([]);
  const [hotCollapsed, setHotCollapsed] = useState(false);
  const [callbacks, setCallbacks] = useState<any[]>([]);
  const [cbCollapsed, setCbCollapsed] = useState(false);
  const [lists, setLists] = useState<any[]>([]);

  // Load sidebar data
  const loadData = useCallback(async () => {
    try {
      const [hot, cbs, ls] = await Promise.all([
        fetchDialerHotLeads(),
        fetchDialerCallbacksDue(),
        fetchDialerLists(),
      ]);
      setHotLeads((hot || []).slice(0, 10));
      setCallbacks(cbs || []);
      setLists(ls || []);
    } catch (err) {
      console.error('Error loading sidebar data:', err);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleList = (listId: string) => {
    if (selectedListIds.includes(listId)) {
      onListSelectionChange(selectedListIds.filter(id => id !== listId));
    } else {
      onListSelectionChange([...selectedListIds, listId]);
    }
  };

  const allListsSelected = selectedListIds.length === 0;

  return (
    <div className="w-56 flex-shrink-0 border-r border-gray-200 bg-gray-50/50 overflow-y-auto">
      <div className="p-3 space-y-4">

        {/* ── Hot Leads ── */}
        {hotLeads.length > 0 && (
          <section>
            <button
              onClick={() => setHotCollapsed(!hotCollapsed)}
              className="w-full flex items-center justify-between mb-1.5"
            >
              <span className="flex items-center gap-1.5 text-micro font-semibold text-orange-700 uppercase tracking-wide">
                <Flame size={12} className="text-orange-500" />
                Hot Leads
                <span className="px-1 py-0.5 rounded-full bg-orange-100 text-orange-600 text-[10px] tabular-nums">
                  {hotLeads.length}
                </span>
              </span>
              <ChevronDown size={12} className={cn('text-orange-400 transition-transform', !hotCollapsed && 'rotate-180')} />
            </button>
            {!hotCollapsed && (
              <div className="space-y-1">
                {hotLeads.map((lead) => {
                  const name = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';
                  return (
                    <div
                      key={lead.id}
                      className="flex items-center justify-between px-2 py-1.5 rounded-md bg-white border border-orange-100 hover:border-orange-200 transition-colors"
                    >
                      <button
                        onClick={() => onLeadClick(lead.phone_normalized)}
                        className="text-micro font-medium text-gray-800 truncate text-left flex-1 min-w-0"
                        title={`${name} — ${formatPhone(lead.phone_normalized)}`}
                      >
                        {name}
                      </button>
                      <button
                        onClick={() => onCallLead(lead)}
                        disabled={callingLeadId !== null}
                        className="ml-1.5 p-1 rounded-full text-emerald-600 hover:bg-emerald-50 transition-colors flex-shrink-0"
                        title="Call now"
                      >
                        <PhoneCall size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ── Callbacks Due ── */}
        {callbacks.length > 0 && (
          <section>
            <button
              onClick={() => setCbCollapsed(!cbCollapsed)}
              className="w-full flex items-center justify-between mb-1.5"
            >
              <span className="flex items-center gap-1.5 text-micro font-semibold text-amber-700 uppercase tracking-wide">
                <Clock size={12} className="text-amber-500" />
                Callbacks
                <span className="px-1 py-0.5 rounded-full bg-amber-100 text-amber-600 text-[10px] tabular-nums">
                  {callbacks.length}
                </span>
              </span>
              <ChevronDown size={12} className={cn('text-amber-400 transition-transform', !cbCollapsed && 'rotate-180')} />
            </button>
            {!cbCollapsed && (
              <div className="space-y-1">
                {callbacks.slice(0, 8).map((cb) => {
                  const name = [cb.first_name, cb.last_name].filter(Boolean).join(' ') || 'Unknown';
                  const time = cb.callback_datetime
                    ? new Date(cb.callback_datetime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                    : '';
                  return (
                    <div
                      key={cb.id}
                      className="flex items-center justify-between px-2 py-1.5 rounded-md bg-white border border-amber-100 hover:border-amber-200 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => onLeadClick(cb.phone_normalized)}
                          className="text-micro font-medium text-gray-800 truncate block text-left w-full"
                          title={name}
                        >
                          {name}
                        </button>
                        <span className="text-[10px] text-amber-600">{time}</span>
                      </div>
                      <button
                        onClick={() => onCallLead(cb)}
                        disabled={callingLeadId !== null}
                        className="ml-1.5 p-1 rounded-full text-emerald-600 hover:bg-emerald-50 transition-colors flex-shrink-0"
                        title="Call now"
                      >
                        <PhoneCall size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <hr className="border-gray-200" />

        {/* ── Lists ── */}
        {lists.length > 0 && (
          <section>
            <span className="flex items-center gap-1.5 text-micro font-semibold text-gray-500 uppercase tracking-wide mb-2">
              <List size={12} />
              Lists
            </span>
            <div className="space-y-1">
              <button
                onClick={() => onListSelectionChange([])}
                className={cn(
                  'w-full text-left px-2 py-1.5 rounded-md text-micro font-medium transition-colors',
                  allListsSelected
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                )}
              >
                All Leads
              </button>
              {lists.map((list: any) => {
                const selected = selectedListIds.includes(list.id);
                const count = list.actual_lead_count || list.lead_count;
                return (
                  <button
                    key={list.id}
                    onClick={() => toggleList(list.id)}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded-md text-micro font-medium transition-colors flex items-center justify-between',
                      selected
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    )}
                  >
                    <span className="truncate">{list.name}</span>
                    <span className={cn('tabular-nums text-[10px]', selected ? 'text-blue-200' : 'text-gray-400')}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <hr className="border-gray-200" />

        {/* ── Geo Filters ── */}
        <section>
          <span className="flex items-center gap-1.5 text-micro font-semibold text-gray-500 uppercase tracking-wide mb-2">
            <MapPin size={12} />
            Location
          </span>
          <div className="space-y-1.5">
            <select
              value={selectedState}
              onChange={(e) => onStateChange(e.target.value)}
              className="w-full text-micro bg-white border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 text-gray-700 cursor-pointer"
            >
              <option value="">All States</option>
              {stateOptions.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select
              value={selectedCounty}
              onChange={(e) => onCountyChange(e.target.value)}
              className="w-full text-micro bg-white border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 text-gray-700 cursor-pointer"
            >
              <option value="">All Counties</option>
              {countyOptions.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            {(selectedState || selectedCounty) && (
              <button
                onClick={() => { onStateChange(''); onCountyChange(''); }}
                className="flex items-center gap-0.5 text-micro text-red-500 hover:text-red-600"
              >
                <X size={10} /> Clear location
              </button>
            )}
          </div>
        </section>

        <hr className="border-gray-200" />

        {/* ── Market Value Range ── */}
        <section>
          <span className="flex items-center gap-1.5 text-micro font-semibold text-gray-500 uppercase tracking-wide mb-2">
            <DollarSign size={12} />
            Market Value
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              placeholder="Min"
              value={marketValueMin ?? ''}
              onChange={(e) => onMarketValueMinChange(e.target.value ? Number(e.target.value) : null)}
              className="w-full text-micro bg-white border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 text-gray-700 tabular-nums"
            />
            <span className="text-micro text-gray-400">–</span>
            <input
              type="number"
              placeholder="Max"
              value={marketValueMax ?? ''}
              onChange={(e) => onMarketValueMaxChange(e.target.value ? Number(e.target.value) : null)}
              className="w-full text-micro bg-white border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 text-gray-700 tabular-nums"
            />
          </div>
          {(marketValueMin !== null || marketValueMax !== null) && (
            <button
              onClick={() => { onMarketValueMinChange(null); onMarketValueMaxChange(null); }}
              className="flex items-center gap-0.5 text-micro text-red-500 hover:text-red-600 mt-1"
            >
              <X size={10} /> Clear value filter
            </button>
          )}
        </section>

        <hr className="border-gray-200" />

        {/* ── Sort ── */}
        <section>
          <span className="flex items-center gap-1.5 text-micro font-semibold text-gray-500 uppercase tracking-wide mb-2">
            <ArrowUpDown size={12} />
            Sort By
          </span>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
            className="w-full text-micro bg-white border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 text-gray-700 cursor-pointer"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </section>

      </div>
    </div>
  );
};
