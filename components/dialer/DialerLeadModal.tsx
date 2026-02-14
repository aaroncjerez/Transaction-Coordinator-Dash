import React, { useState, useEffect, useCallback } from 'react';
import { X, Phone, MapPin, Clock, Loader2, Copy, Check } from 'lucide-react';
import { CallCard } from './CallCard';
import { CadenceStageIndicator } from './CadenceStageIndicator';
import { SentimentBadge } from './SentimentBadge';
import { cn } from '../../lib/utils';
import { formatPhone } from '../../lib/utils/phone';
import {
  fetchDialerCallsForLead,
  fetchDialerLeadMemory,
} from '../../lib/database';

interface DialerLeadModalProps {
  phoneNormalized: string;
  onClose: () => void;
}

export const DialerLeadModal: React.FC<DialerLeadModalProps> = ({ phoneNormalized, onClose }) => {
  const [calls, setCalls] = useState<any[]>([]);
  const [memory, setMemory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [callData, memoryData] = await Promise.all([
        fetchDialerCallsForLead(phoneNormalized),
        fetchDialerLeadMemory(phoneNormalized),
      ]);
      setCalls(callData || []);
      setMemory(memoryData);
    } catch (err) {
      console.error('Error loading lead data:', err);
    } finally {
      setLoading(false);
    }
  }, [phoneNormalized]);

  useEffect(() => { loadData(); }, [loadData]);

  // Derive lead info from first call's leads_cache or memory
  const leadCache = calls[0]?.leads_cache;
  const leadName = leadCache
    ? [leadCache.first_name, leadCache.last_name].filter(Boolean).join(' ') || 'Unknown'
    : formatPhone(phoneNormalized);
  const leadLocation = leadCache
    ? [leadCache.county, leadCache.state].filter(Boolean).join(', ')
    : null;

  const copyPhone = () => {
    navigator.clipboard.writeText(phoneNormalized);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col animate-modal-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{leadName}</h2>
            <div className="flex items-center gap-3 mt-0.5">
              <button
                className="inline-flex items-center gap-1 text-caption text-gray-500 hover:text-gray-700 transition-colors"
                onClick={copyPhone}
              >
                <Phone size={12} />
                {formatPhone(phoneNormalized)}
                {copied ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
              </button>
              {leadLocation && (
                <span className="inline-flex items-center gap-1 text-caption text-gray-400">
                  <MapPin size={12} /> {leadLocation}
                </span>
              )}
            </div>
          </div>
          <button
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 size={24} className="animate-spin" />
            </div>
          ) : (
            <>
              {/* Lead details from cache */}
              {leadCache && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {leadCache.cadence_stage != null && (
                    <InfoCard label="Cadence Stage">
                      <CadenceStageIndicator stage={leadCache.cadence_stage} />
                    </InfoCard>
                  )}
                  {leadCache.rapport_level && (
                    <InfoCard label="Rapport">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded-full text-micro font-medium',
                        leadCache.rapport_level === 'hot' ? 'bg-orange-50 text-orange-700' :
                        leadCache.rapport_level === 'warm' ? 'bg-amber-50 text-amber-700' :
                        leadCache.rapport_level === 'warming' ? 'bg-yellow-50 text-yellow-700' :
                        'bg-gray-100 text-gray-500'
                      )}>
                        {leadCache.rapport_level}
                      </span>
                    </InfoCard>
                  )}
                  {leadCache.attempt_count != null && (
                    <InfoCard label="Call Attempts">
                      <span className="text-sm font-semibold text-gray-900">{leadCache.attempt_count}</span>
                    </InfoCard>
                  )}
                  {leadCache.market_value && (
                    <InfoCard label="Market Value">
                      <span className="text-sm font-semibold text-gray-900">
                        ${Number(leadCache.market_value).toLocaleString()}
                      </span>
                    </InfoCard>
                  )}
                </div>
              )}

              {/* Conversation Memory */}
              {memory && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-2">Conversation Memory</h3>
                  <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                    {memory.summary && (
                      <p className="text-caption text-gray-700">{memory.summary}</p>
                    )}
                    {memory.key_facts && memory.key_facts.length > 0 && (
                      <div>
                        <p className="text-micro text-gray-500 font-medium mb-1">Key Facts</p>
                        <ul className="space-y-0.5">
                          {memory.key_facts.map((fact: string, i: number) => (
                            <li key={i} className="text-caption text-gray-600 flex items-start gap-1.5">
                              <span className="text-gray-400 mt-0.5">-</span>
                              <span>{fact}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {memory.next_action_strategy && (
                      <div>
                        <p className="text-micro text-gray-500 font-medium mb-1">Next Action</p>
                        <p className="text-caption text-gray-700">{memory.next_action_strategy}</p>
                      </div>
                    )}
                    {memory.pricing_discussed && (
                      <div>
                        <p className="text-micro text-gray-500 font-medium mb-1">Pricing Discussed</p>
                        <p className="text-caption text-gray-700">{memory.pricing_discussed}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Call History */}
              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-2">
                  Call History
                  {calls.length > 0 && (
                    <span className="text-micro text-gray-400 font-normal ml-1.5">
                      ({calls.length} call{calls.length !== 1 ? 's' : ''})
                    </span>
                  )}
                </h3>
                {calls.length === 0 ? (
                  <p className="text-caption text-gray-400 py-4 text-center">No calls yet.</p>
                ) : (
                  <div className="space-y-2">
                    {calls.map((call: any) => (
                      <CallCard key={call.id} call={call} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const InfoCard: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="bg-gray-50 rounded-lg p-2.5">
    <p className="text-micro text-gray-500 mb-1">{label}</p>
    {children}
  </div>
);
