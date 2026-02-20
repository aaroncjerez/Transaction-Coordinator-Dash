import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, PhoneOff } from 'lucide-react';
import { CallCard } from './CallCard';
import { fetchLocalDialerCallHistory, onDialerCacheUpdated } from '../../lib/database';
import { cn } from '../../lib/utils';

interface CallHistoryPanelProps {
  searchQuery: string;
  onLeadClick: (phoneNormalized: string) => void;
}

type DirectionFilter = 'all' | 'outbound' | 'inbound';
type SentimentFilter = 'all' | 'positive' | 'neutral' | 'negative';

export const CallHistoryPanel: React.FC<CallHistoryPanelProps> = ({ searchQuery, onLeadClick }) => {
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('all');

  const loadCalls = useCallback(async () => {
    try {
      const filters: any = {};
      if (directionFilter !== 'all') filters.direction = directionFilter;
      if (sentimentFilter !== 'all') filters.sentiment = sentimentFilter;
      const data = await fetchLocalDialerCallHistory(200, Object.keys(filters).length > 0 ? filters : undefined);
      setCalls(data || []);
    } catch (err) {
      console.error('Error loading call history:', err);
    } finally {
      setLoading(false);
    }
  }, [directionFilter, sentimentFilter]);

  useEffect(() => { loadCalls(); }, [loadCalls]);

  useEffect(() => {
    onDialerCacheUpdated((data) => {
      if (data.type === 'history') loadCalls();
    });
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
      return (
        name.toLowerCase().includes(q) ||
        (c.seller_phone_normalized || '').includes(q) ||
        (c.phone_normalized || '').includes(q) ||
        (c.summary || '').toLowerCase().includes(q)
      );
    });
  }, [calls, searchQuery]);

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
      <div className="flex items-center gap-4">
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
            <CallCard key={call.id} call={call} onLeadClick={onLeadClick} />
          ))}
        </div>
      )}
    </div>
  );
};
