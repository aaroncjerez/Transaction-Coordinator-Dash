import React, { useState, useEffect } from 'react';
import { X, Copy, Check, RefreshCw, ExternalLink, Phone, Mail } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { DailyLead, MotivationFactor, NegotiationStrategy } from '../../types';
import { refreshLeadAnalysis } from '../../lib/database';

interface LeadModalProps {
  lead: DailyLead;
  onClose: () => void;
  onLeadUpdate: (lead: DailyLead) => void;
  onMarkContacted: (id: number) => void;
  onUnmarkContacted: (id: number) => void;
  isContactedToday: boolean;
}

function getDiscountColor(score: number) {
  if (score >= 8) return 'bg-emerald-500';
  if (score >= 5) return 'bg-amber-500';
  return 'bg-gray-400';
}

function getDiscountLabel(score: number) {
  if (score >= 8) return 'Very Likely to Accept Discount';
  if (score >= 5) return 'Moderately Likely';
  return 'Less Likely';
}

function formatFactorName(factor: string): string {
  const labels: Record<string, string> = {
    financial_distress: 'Financial Distress',
    divorce: 'Divorce / Separation',
    inheritance: 'Inheritance',
    relocation: 'Relocation',
    property_condition: 'Property Condition',
    urgency: 'Urgency',
    other: 'Other',
  };
  return labels[factor] || factor;
}

function formatApproach(approach: string): string {
  const labels: Record<string, string> = {
    empathetic: 'Empathetic',
    'business-like': 'Business-Like',
    'solution-focused': 'Solution-Focused',
    opportunistic: 'Opportunistic',
  };
  return labels[approach] || approach;
}

function formatTimeline(timeline: string): string {
  const labels: Record<string, string> = {
    immediate: 'Immediate',
    '1-2_weeks': '1-2 Weeks',
    '1_month': '1 Month',
    flexible: 'Flexible',
  };
  return labels[timeline] || timeline;
}

export const LeadModal: React.FC<LeadModalProps> = ({
  lead: initialLead,
  onClose,
  onLeadUpdate,
  onMarkContacted,
  onUnmarkContacted,
  isContactedToday,
}) => {
  const [lead, setLead] = useState(initialLead);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { setLead(initialLead); }, [initialLead]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await refreshLeadAnalysis(lead.id);
      if (result.success && result.lead) {
        setLead(result.lead);
        onLeadUpdate(result.lead);
      }
    } catch (err) {
      console.error('Error refreshing analysis:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const copyFollowUp = () => {
    if (lead.recommended_follow_up) {
      navigator.clipboard.writeText(lead.recommended_follow_up);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const discountScore = lead.discount_likelihood || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] flex flex-col animate-modal-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{lead.name}</h2>
            {lead.stage && (
              <p className="text-caption text-gray-500">{lead.stage}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {discountScore > 0 && (
              <span
                className={cn(
                  'text-sm font-bold text-white px-2 py-0.5 rounded',
                  getDiscountColor(discountScore)
                )}
              >
                {discountScore}/10
              </span>
            )}
            {isContactedToday ? (
              <button
                className="text-caption font-medium text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
                onClick={() => onUnmarkContacted(lead.id)}
              >
                Done (Undo)
              </button>
            ) : (
              <button
                className="text-caption font-medium text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md transition-colors"
                onClick={() => onMarkContacted(lead.id)}
              >
                Mark Done
              </button>
            )}
            <button
              className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Contact info */}
          {(lead.phone || lead.email || lead.fub_link) && (
            <div className="flex flex-wrap gap-3">
              {lead.phone && (
                <span className="inline-flex items-center gap-1.5 text-caption text-gray-600">
                  <Phone size={13} /> {lead.phone}
                </span>
              )}
              {lead.email && (
                <span className="inline-flex items-center gap-1.5 text-caption text-gray-600">
                  <Mail size={13} /> {lead.email}
                </span>
              )}
              {lead.fub_link && (
                <a
                  href={lead.fub_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-caption text-blue-600 hover:text-blue-800"
                >
                  <ExternalLink size={13} /> Open in FUB
                </a>
              )}
            </div>
          )}

          {/* Summary */}
          {lead.summary && (
            <Section title="Summary">
              <p className="text-sm text-gray-700">{lead.summary}</p>
            </Section>
          )}

          {/* Recommended follow-up */}
          {lead.recommended_follow_up && (
            <Section title="Recommended Follow-up">
              <div className="bg-gray-50 rounded-lg p-3 relative">
                <p className="text-sm text-gray-700 italic pr-8">"{lead.recommended_follow_up}"</p>
                <button
                  className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 transition-colors"
                  onClick={copyFollowUp}
                  title="Copy message"
                >
                  {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                </button>
              </div>
            </Section>
          )}

          {/* Discount Likelihood */}
          {discountScore > 0 && (
            <Section title="Discount Likelihood">
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', getDiscountColor(discountScore))}
                    style={{ width: `${discountScore * 10}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-700 tabular-nums w-10">
                  {discountScore}/10
                </span>
              </div>
              <p className="text-caption text-gray-500 mt-1">{getDiscountLabel(discountScore)}</p>
            </Section>
          )}

          {/* Motivation Factors */}
          {lead.motivation_factors && lead.motivation_factors.length > 0 && (
            <Section title="Motivation Factors">
              <ul className="space-y-2">
                {lead.motivation_factors.map((factor: MotivationFactor, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-800">
                          {formatFactorName(factor.factor)}
                        </span>
                        <span
                          className={cn(
                            'text-micro font-medium px-1.5 py-0.5 rounded',
                            factor.confidence === 'high' && 'bg-emerald-50 text-emerald-700',
                            factor.confidence === 'medium' && 'bg-amber-50 text-amber-700',
                            factor.confidence === 'low' && 'bg-gray-100 text-gray-500'
                          )}
                        >
                          {factor.confidence}
                        </span>
                      </div>
                      {factor.evidence && (
                        <p className="text-caption text-gray-500 italic mt-0.5">"{factor.evidence}"</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Negotiation Strategy */}
          {lead.negotiation_strategy && (
            <Section title="Negotiation Strategy">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <StrategyItem label="Approach" value={formatApproach(lead.negotiation_strategy.approach)} />
                <StrategyItem label="Target Price" value={lead.negotiation_strategy.priceRange} />
                <StrategyItem label="Timeline" value={formatTimeline(lead.negotiation_strategy.timeline)} />
              </div>
              {lead.negotiation_strategy.keyPoints && lead.negotiation_strategy.keyPoints.length > 0 && (
                <div>
                  <p className="text-micro font-medium text-gray-500 mb-1">Key Points</p>
                  <ul className="space-y-1">
                    {lead.negotiation_strategy.keyPoints.map((point: string, i: number) => (
                      <li key={i} className="text-caption text-gray-700 flex items-start gap-1.5">
                        <span className="text-gray-400 mt-0.5">-</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {/* Rationale */}
          {lead.rationale && (
            <Section title="Rationale">
              <p className="text-sm text-gray-600">{lead.rationale}</p>
            </Section>
          )}

          {/* Refresh */}
          <div className="flex items-center gap-3 pt-2">
            <button
              className={cn(
                'inline-flex items-center gap-1.5 text-caption font-medium px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors',
                refreshing && 'opacity-60 cursor-not-allowed'
              )}
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Analyzing...' : 'Refresh Analysis'}
            </button>
            {lead.last_analyzed_at && (
              <span className="text-micro text-gray-400">
                Last analyzed: {new Date(lead.last_analyzed_at).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Sub-components ──

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <h3 className="text-sm font-semibold text-gray-800 mb-2">{title}</h3>
    {children}
  </div>
);

const StrategyItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-gray-50 rounded-lg p-2.5">
    <p className="text-micro text-gray-500 mb-0.5">{label}</p>
    <p className="text-sm font-medium text-gray-800">{value}</p>
  </div>
);
