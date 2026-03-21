import React from 'react';
import {
  FileText, RefreshCw, Loader2, CheckCircle, Calendar, Tag,
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface DocumentAnalysisCardProps {
  analysis: {
    file_name: string;
    category?: string;
    summary: string;
    key_findings: string | string[];
    page_count: number;
    analyzed_at: string;
    doc_type?: string;
    doc_date?: string;
  };
  onReanalyze?: () => void;
  isReanalyzing?: boolean;
  compact?: boolean;
}

const DOC_TYPE_COLORS: Record<string, string> = {
  Contract: 'bg-blue-50 text-blue-700 border-blue-200',
  Addendum: 'bg-amber-50 text-amber-700 border-amber-200',
  Amendment: 'bg-amber-50 text-amber-700 border-amber-200',
  'Title Report': 'bg-green-50 text-green-700 border-green-200',
  Survey: 'bg-teal-50 text-teal-700 border-teal-200',
  Deed: 'bg-purple-50 text-purple-700 border-purple-200',
  'Closing Disclosure': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Inspection Report': 'bg-orange-50 text-orange-700 border-orange-200',
  Appraisal: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  Insurance: 'bg-rose-50 text-rose-700 border-rose-200',
  HOA: 'bg-pink-50 text-pink-700 border-pink-200',
  'Loan Estimate': 'bg-violet-50 text-violet-700 border-violet-200',
  Disclosure: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Earnest Money': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Tax Record': 'bg-slate-50 text-slate-700 border-slate-200',
  'Plat Map': 'bg-lime-50 text-lime-700 border-lime-200',
  Environmental: 'bg-green-50 text-green-700 border-green-200',
  Other: 'bg-gray-50 text-gray-600 border-gray-200',
};

function getDocTypeColor(docType: string): string {
  return DOC_TYPE_COLORS[docType] || DOC_TYPE_COLORS.Other;
}

function parseFindings(findings: string | string[]): string[] {
  if (Array.isArray(findings)) return findings;
  try { return JSON.parse(findings); } catch { return []; }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export const DocumentAnalysisCard: React.FC<DocumentAnalysisCardProps> = ({
  analysis, onReanalyze, isReanalyzing, compact,
}) => {
  const findings = parseFindings(analysis.key_findings);

  if (compact) {
    return (
      <div className="bg-white rounded border border-gray-100 px-2.5 py-2 space-y-1.5">
        <div className="flex items-center gap-2">
          {analysis.doc_type && (
            <span className={cn('text-micro px-1.5 py-0.5 rounded border font-medium', getDocTypeColor(analysis.doc_type))}>
              {analysis.doc_type}
            </span>
          )}
          <span className="text-micro text-gray-400">{analysis.page_count}p</span>
          {onReanalyze && (
            <button
              onClick={(e) => { e.stopPropagation(); onReanalyze(); }}
              disabled={isReanalyzing}
              className="ml-auto p-0.5 text-gray-400 hover:text-primary transition-colors disabled:opacity-50"
              title="Re-analyze"
            >
              {isReanalyzing ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
            </button>
          )}
        </div>
        <p className="text-micro text-gray-600 line-clamp-2 leading-relaxed">{analysis.summary}</p>
        {findings.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {findings.slice(0, 3).map((f, i) => (
              <span key={i} className="text-micro bg-gray-50 text-gray-600 px-1.5 py-0.5 rounded border border-gray-100 line-clamp-1 max-w-[200px]">
                {f}
              </span>
            ))}
            {findings.length > 3 && (
              <span className="text-micro text-gray-400">+{findings.length - 3} more</span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 bg-blue-50 rounded border border-blue-100 flex-shrink-0">
            <FileText size={12} className="text-blue-600" />
          </div>
          <span className="text-caption font-medium text-gray-700 truncate">{analysis.file_name}</span>
          {analysis.doc_type && (
            <span className={cn('text-micro px-1.5 py-0.5 rounded border font-medium flex-shrink-0', getDocTypeColor(analysis.doc_type))}>
              {analysis.doc_type}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-micro text-gray-400">
            <span>{analysis.page_count}p</span>
            {analysis.doc_date && (
              <>
                <span>&middot;</span>
                <Calendar size={10} />
                <span>{formatDate(analysis.doc_date)}</span>
              </>
            )}
            <span>&middot;</span>
            <CheckCircle size={10} className="text-emerald-500" />
          </div>
          {onReanalyze && (
            <button
              onClick={(e) => { e.stopPropagation(); onReanalyze(); }}
              disabled={isReanalyzing}
              className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
              title="Re-analyze"
            >
              {isReanalyzing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 space-y-2.5">
        {/* Summary — always visible */}
        <p className="text-caption text-gray-700 leading-relaxed">{analysis.summary}</p>

        {/* Key Findings as chips */}
        {findings.length > 0 && (
          <div>
            <div className="flex items-center gap-1 mb-1.5">
              <Tag size={10} className="text-gray-400" />
              <span className="text-micro font-medium text-gray-500">Key Findings</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {findings.map((finding, i) => (
                <span
                  key={i}
                  className="inline-flex text-micro bg-blue-50/70 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100"
                  title={finding}
                >
                  <span className="line-clamp-1">{finding}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Analyzed timestamp */}
        <p className="text-micro text-gray-400">
          Analyzed {new Date(analysis.analyzed_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
};
