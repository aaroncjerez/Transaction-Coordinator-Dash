import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, TrendingUp, Clock, DollarSign, FileText, BarChart3 } from 'lucide-react';
import { Button } from './ui/Button';
import { analyzeDeal, getDealAnalysis } from '../lib/database';
import { formatTimeAgo } from '../lib/utils';

interface DealAnalyzerProps {
  dealId: string;
}

interface Analysis {
  overview: string;
  risk_score: number;
  risk_factors: string[];
  timeline_analysis: string;
  financial_analysis: string;
  task_status: string;
  document_review: string;
  market_context: string;
  recommendations: string[];
}

export const DealAnalyzer: React.FC<DealAnalyzerProps> = ({ dealId }) => {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview', 'recommendations']));

  useEffect(() => {
    loadCached();
  }, [dealId]);

  const loadCached = async () => {
    try {
      const cached = await getDealAnalysis(dealId);
      if (cached) {
        setAnalysis(cached.analysis);
        setAnalyzedAt(cached.analyzed_at);
      }
    } catch (e) {
      console.error('Failed to load cached analysis:', e);
    } finally {
      setInitialLoad(false);
    }
  };

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const result = await analyzeDeal(dealId);
      setAnalysis(result);
      setAnalyzedAt(new Date().toISOString());
    } catch (e: any) {
      console.error('Analysis failed:', e);
      alert(e.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const riskColor = (score: number) => {
    if (score >= 70) return { bg: 'bg-red-500', text: 'text-red-700', label: 'High Risk', border: 'border-red-200', light: 'bg-red-50' };
    if (score >= 40) return { bg: 'bg-orange-500', text: 'text-orange-700', label: 'Medium Risk', border: 'border-orange-200', light: 'bg-orange-50' };
    return { bg: 'bg-emerald-500', text: 'text-emerald-700', label: 'Low Risk', border: 'border-emerald-200', light: 'bg-emerald-50' };
  };

  if (initialLoad) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  // No analysis yet
  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="p-4 bg-blue-50 rounded-full">
          <Sparkles size={32} className="text-blue-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">AI Deal Analysis</h3>
        <p className="text-sm text-gray-500 text-center max-w-sm">
          Get a comprehensive analysis of this deal including risk assessment, timeline review, and actionable recommendations.
        </p>
        <Button onClick={runAnalysis} isLoading={loading} className="mt-2">
          <Sparkles size={16} className="mr-2" />
          Analyze Deal
        </Button>
      </div>
    );
  }

  const risk = riskColor(analysis.risk_score);

  const sections = [
    { key: 'overview', label: 'Overview', icon: FileText, content: analysis.overview },
    { key: 'timeline', label: 'Timeline', icon: Clock, content: analysis.timeline_analysis },
    { key: 'financial', label: 'Financial', icon: DollarSign, content: analysis.financial_analysis },
    { key: 'tasks', label: 'Task Status', icon: CheckCircle, content: analysis.task_status },
    { key: 'documents', label: 'Documents', icon: FileText, content: analysis.document_review },
    { key: 'market', label: 'Market Context', icon: BarChart3, content: analysis.market_context },
  ];

  return (
    <div className="space-y-6">
      {/* Header + Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-blue-600" />
          <h3 className="font-semibold text-gray-900">AI Analysis</h3>
          {analyzedAt && (
            <span className="text-xs text-gray-400 ml-2">
              {formatTimeAgo(analyzedAt)}
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={runAnalysis} isLoading={loading}>
          <RefreshCw size={14} className="mr-1" /> Re-analyze
        </Button>
      </div>

      {/* Risk Score */}
      <div className={`rounded-xl p-4 border ${risk.border} ${risk.light}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className={risk.text} />
            <span className={`font-semibold text-sm ${risk.text}`}>{risk.label}</span>
          </div>
          <span className={`text-2xl font-bold ${risk.text}`}>{analysis.risk_score}</span>
        </div>
        <div className="h-2.5 w-full bg-white/60 rounded-full overflow-hidden">
          <div
            className={`h-full ${risk.bg} rounded-full transition-all duration-700`}
            style={{ width: `${analysis.risk_score}%` }}
          />
        </div>
        {analysis.risk_factors && analysis.risk_factors.length > 0 && (
          <div className="mt-3 space-y-1">
            {analysis.risk_factors.map((factor, i) => (
              <p key={i} className={`text-xs ${risk.text} flex gap-1.5`}>
                <span className="mt-0.5">&bull;</span> {factor}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Collapsible Sections */}
      <div className="space-y-2">
        {sections.map(({ key, label, icon: Icon, content }) => (
          <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection(key)}
              className="w-full px-4 py-3 flex items-center justify-between bg-white hover:bg-gray-50 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Icon size={14} className="text-gray-400" /> {label}
              </span>
              {expandedSections.has(key) ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
            </button>
            {expandedSections.has(key) && (
              <div className="px-4 pb-3 pt-1 border-t border-gray-100">
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{content}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Recommendations */}
      {analysis.recommendations && analysis.recommendations.length > 0 && (
        <div className="border border-blue-200 rounded-xl overflow-hidden">
          <button
            onClick={() => toggleSection('recommendations')}
            className="w-full px-4 py-3 flex items-center justify-between bg-blue-50 hover:bg-blue-100 transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-blue-700">
              <TrendingUp size={14} /> Recommendations ({analysis.recommendations.length})
            </span>
            {expandedSections.has('recommendations') ? <ChevronUp size={16} className="text-blue-400" /> : <ChevronDown size={16} className="text-blue-400" />}
          </button>
          {expandedSections.has('recommendations') && (
            <div className="p-4 space-y-2 bg-white">
              {analysis.recommendations.map((rec, i) => (
                <div key={i} className="flex gap-3 items-start p-2 bg-gray-50 rounded-lg">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-gray-700">{rec}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
