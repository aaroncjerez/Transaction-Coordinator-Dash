import React, { useState } from 'react';
import { FileText, ChevronDown, ChevronUp, RefreshCw, Loader2, CheckCircle } from 'lucide-react';
import { Button } from './ui/Button';

interface PdfAnalysisCardProps {
  analysis: {
    file_name: string;
    category?: string;
    summary: string;
    key_findings: string[];
    page_count: number;
    analyzed_at: string;
  };
  onReanalyze?: () => void;
  isReanalyzing?: boolean;
}

export const PdfAnalysisCard: React.FC<PdfAnalysisCardProps> = ({ analysis, onReanalyze, isReanalyzing }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-blue-50 rounded border border-blue-100">
            <FileText size={14} className="text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{analysis.file_name}</p>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              {analysis.category && <span className="capitalize">{analysis.category.replace(/_/g, ' ')}</span>}
              <span>&middot;</span>
              <span>{analysis.page_count} pages</span>
              <span>&middot;</span>
              <CheckCircle size={10} className="text-emerald-500" />
              <span>Analyzed</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onReanalyze && (
            <button
              onClick={e => { e.stopPropagation(); onReanalyze(); }}
              disabled={isReanalyzing}
              className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              title="Re-analyze"
            >
              {isReanalyzing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>
          )}
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
          {/* Summary */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Summary</label>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{analysis.summary}</p>
          </div>

          {/* Key Findings */}
          {analysis.key_findings && analysis.key_findings.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Key Findings</label>
              <ul className="space-y-1">
                {analysis.key_findings.map((finding, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="text-blue-500 mt-0.5 flex-shrink-0">&bull;</span>
                    {finding}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-gray-400">Analyzed {new Date(analysis.analyzed_at).toLocaleString()}</p>
        </div>
      )}
    </div>
  );
};
