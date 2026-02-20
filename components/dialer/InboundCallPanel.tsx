import React, { useState, useEffect, useCallback } from 'react';
import { PhoneIncoming, Loader2, User, MapPin, Clock } from 'lucide-react';
import { CallCard } from './CallCard';
import { fetchLocalDialerInboundCalls, onDialerCacheUpdated } from '../../lib/database';

interface InboundCallPanelProps {
  searchQuery: string;
  onLeadClick: (phoneNormalized: string) => void;
}

export const InboundCallPanel: React.FC<InboundCallPanelProps> = ({ searchQuery, onLeadClick }) => {
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCalls = useCallback(async () => {
    try {
      const data = await fetchLocalDialerInboundCalls(100);
      setCalls(data || []);
    } catch (err) {
      console.error('Error loading inbound calls:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCalls(); }, [loadCalls]);

  useEffect(() => {
    onDialerCacheUpdated((data) => {
      if (data.type === 'history') loadCalls();
    });
  }, [loadCalls]);

  const filtered = calls.filter(call => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = call.lead_first_name || call.lead_last_name
      ? `${call.lead_first_name || ''} ${call.lead_last_name || ''}`.toLowerCase()
      : '';
    const phone = (call.seller_phone_normalized || call.phone_normalized || '').toLowerCase();
    return name.includes(q) || phone.includes(q);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-16">
        <PhoneIncoming size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-caption text-gray-500">No inbound calls yet</p>
        <p className="text-micro text-gray-400 mt-1">Inbound calls will appear here automatically</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <PhoneIncoming size={14} className="text-green-600" />
        <span className="text-caption font-medium text-gray-700">{filtered.length} inbound call{filtered.length !== 1 ? 's' : ''}</span>
      </div>
      {filtered.map(call => (
        <CallCard key={call.id} call={call} onLeadClick={onLeadClick} />
      ))}
    </div>
  );
};
