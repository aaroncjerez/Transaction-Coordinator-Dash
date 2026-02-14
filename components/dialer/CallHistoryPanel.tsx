import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, PhoneOff } from 'lucide-react';
import { CallCard } from './CallCard';
import { fetchDialerCallHistory } from '../../lib/database';

interface CallHistoryPanelProps {
  searchQuery: string;
  onLeadClick: (phoneNormalized: string) => void;
}

export const CallHistoryPanel: React.FC<CallHistoryPanelProps> = ({ searchQuery, onLeadClick }) => {
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCalls = useCallback(async () => {
    try {
      const data = await fetchDialerCallHistory(100);
      setCalls(data);
    } catch (err) {
      console.error('Error loading call history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCalls(); }, [loadCalls]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return calls;
    const q = searchQuery.toLowerCase();
    return calls.filter((c: any) => {
      const name = c.leads_cache
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
        <PhoneOff size={32} className="mx-auto mb-3 text-gray-300" />
        <p className="text-sm text-gray-500">
          {calls.length === 0
            ? 'No call history yet. Launch a cadence to start calling.'
            : 'No matching calls.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {filtered.map((call: any) => (
        <CallCard key={call.id} call={call} onLeadClick={onLeadClick} />
      ))}
    </div>
  );
};
