import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, PhoneOff, FileText, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { CallCard } from './CallCard';
import { fetchDialerCallHistoryPaginated, onDialerCacheUpdated } from '../../lib/database';
import { exportCallHistoryCsv } from '../../lib/csv-export';
import { cn } from '../../lib/utils';

interface CallHistoryPanelProps {
  searchQuery: string;
  onLeadClick: (phoneNormalized: string) => void;
}

type DirectionFilter = 'all' | 'outbound' | 'inbound';
type SentimentFilter = 'all' | 'positive' | 'neutral' | 'negative';

const PAGE_SIZE = 50;

export const CallHistoryPanel: React.FC<CallHistoryPanelProps> = ({ searchQuery, onLeadClick }) => {
  const [calls, setCalls] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('all');
  const [searchTranscripts, setSearchTranscripts] = useState(false);

  const loadCalls = useCallback(async () => {
    try {
      const filters: any = {};
      if (directionFilter !== 'all') filters.direction = directionFilter;
      if (sentimentFilter !== 'all') filters.sentiment = sentimentFilter;
      const data = await fetchDialerCallHistoryPaginated(
        PAGE_SIZE,
        page * PAGE_SIZE,
        Object.keys(filters).length > 0 ? filters : undefined
      );
      setCalls(data.calls || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('Error loading call history:', err);
    } finally {
      setLoading(false);
    }
  }, [directionFilter, sentimentFilter, page]);

  useEffect(() => { loadCalls(); }, [loadCalls]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [directionFilter, sentimentFilter]);

  useEffect(() => {
    const unsub = onDialerCacheUpdated((data) => {
      if (data.type === 'history') loadCalls();
    });
    return () => unsub();
  }, [loadCalls]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return calls;
    const q = searchQuery.toLowerCase();
    return calls.filter((c: any) => {
      const name = (c.lead_first_name || c.lead_last_name)
        ? `${c.lead_first_name || ''} ${c.lead_last_name || ''}`
        : c.leads_cache
          ? [c.leads_cache.first_name, c.leads_cache.last_name].filter(Boolean).join(' ')
          : '';
      const matchesBasic = (
        name.toLowerCase().includes(q) ||
        (c.seller_phone_normalized || '').includes(q) ||
        (c.phone_normalized || '').includes(q) ||
        (c.summary || '').toLowerCase().includes(q)
      );
      if (matchesBasic) return true;
      if (searchTranscripts && (c.transcript || '').toLowerCase().includes(q)) return true;
      return false;
    });
  }, [calls, searchQuery, searchTranscripts]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const directionOptions: { key: DirectionFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'outbound', label: 'Outbound' },
    { key: 'inbound', label: 'Inbound' },
  ];

  const sentimentOptions: { key: SentimentFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'positive', label: 'Positive' },
    { key: 'neutral', label: 'Neutral' },
    { key: 'negative', label: 'Negative' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter pills */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-micro text-gray-400 mr-1">Direction:</span>
          {directionOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setDirectionFilter(opt.key)}
              className={cn(
                'px-2 py-1 text-micro rounded-md transition-colors',
                directionFilter === opt.key
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-micro text-gray-400 mr-1">Sentiment:</span>
          {sentimentOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setSentimentFilter(opt.key)}
              className={cn(
                'px-2 py-1 text-micro rounded-md transition-colors',
                sentimentFilter === opt.key
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSearchTranscripts(!searchTranscripts)}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-1 text-micro rounded-md transition-colors',
            searchTranscripts
              ? 'bg-blue-600 text-white'
              : 'text-gray-500 hover:bg-gray-100'
          )}
        >
          <FileText size={11} />
          Search transcripts
        </button>
        <span className="text-micro text-gray-400 ml-auto tabular-nums flex items-center gap-2">
          {total} total call{total !== 1 ? 's' : ''}
          {calls.length > 0 && (
            <button
              onClick={() => exportCallHistoryCsv(calls)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Export current page as CSV"
            >
              <Download size={11} />
            </button>
          )}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <PhoneOff size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">
            {calls.length === 0
              ? 'No call history yet. Launch a cadence to start calling.'
              : 'No matching calls.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((call: any) => (
            <CallCard key={call.id} call={call} onLeadClick={onLeadClick} showSummaryFirst />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-2.5 py-1.5 text-micro font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={12} /> Prev
          </button>
          <span className="text-micro text-gray-500 tabular-nums">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1 px-2.5 py-1.5 text-micro font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
};
