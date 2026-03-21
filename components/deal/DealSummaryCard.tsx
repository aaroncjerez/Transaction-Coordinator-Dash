import React, { useEffect, useState, useCallback } from 'react';
import { Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { getDealSummary, generateDealSummary } from '../../lib/database';

interface DealSummaryCardProps {
  dealId: string;
}

export const DealSummaryCard: React.FC<DealSummaryCardProps> = ({ dealId }) => {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const data = await getDealSummary(dealId);
      setSummary(data?.summary || null);
    } catch (e) {
      console.error('[DealSummaryCard] Failed to load summary:', e);
    }
  }, [dealId]);

  useEffect(() => {
    setLoading(true);
    loadSummary().finally(() => setLoading(false));
  }, [loadSummary]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateDealSummary(dealId);
      if (result.success && result.summary) {
        setSummary(result.summary);
      }
    } catch (e) {
      console.error('[DealSummaryCard] Generation failed:', e);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return null;

  // No summary yet — show generate button
  if (!summary) {
    return (
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="mt-2 flex items-center gap-1.5 text-micro text-gray-400 hover:text-primary transition-colors disabled:opacity-50"
      >
        {generating ? (
          <Loader2 size={11} className="animate-spin" />
        ) : (
          <Sparkles size={11} />
        )}
        {generating ? 'Generating summary...' : 'Generate AI summary'}
      </button>
    );
  }

  return (
    <div className="mt-2 bg-gradient-to-r from-blue-50/60 to-indigo-50/40 rounded-md border border-blue-100/60 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-micro text-gray-600 leading-relaxed">{summary}</p>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="p-1 text-gray-400 hover:text-primary rounded transition-colors disabled:opacity-50 flex-shrink-0 mt-0.5"
          title="Regenerate summary"
          aria-label="Regenerate AI summary"
        >
          {generating ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <RefreshCw size={11} />
          )}
        </button>
      </div>
    </div>
  );
};
