import React from 'react';
import { FileText, Calendar } from 'lucide-react';
import { cn } from '../../lib/utils';

interface TimelineDoc {
  file_name: string;
  file_path: string;
  doc_type?: string;
  doc_date?: string;
  analyzed_at?: string;
  summary?: string;
}

interface DocumentTimelineProps {
  documents: TimelineDoc[];
  onSelectDocument?: (filePath: string) => void;
  selectedFilePath?: string;
}

const DOC_TYPE_DOT: Record<string, string> = {
  Contract: 'bg-blue-500',
  Addendum: 'bg-amber-500',
  Amendment: 'bg-amber-500',
  'Title Report': 'bg-green-500',
  Survey: 'bg-teal-500',
  Deed: 'bg-purple-500',
  'Closing Disclosure': 'bg-indigo-500',
  'Inspection Report': 'bg-orange-500',
  Appraisal: 'bg-cyan-500',
  Insurance: 'bg-rose-500',
  HOA: 'bg-pink-500',
  'Loan Estimate': 'bg-violet-500',
  Disclosure: 'bg-yellow-500',
  'Earnest Money': 'bg-emerald-500',
  'Tax Record': 'bg-slate-500',
  'Plat Map': 'bg-lime-500',
  Environmental: 'bg-green-600',
  Other: 'bg-gray-400',
};

function getDotColor(docType?: string): string {
  if (!docType) return DOC_TYPE_DOT.Other;
  return DOC_TYPE_DOT[docType] || DOC_TYPE_DOT.Other;
}

function getDocDate(doc: TimelineDoc): string | null {
  if (doc.doc_date && /^\d{4}-\d{2}-\d{2}$/.test(doc.doc_date)) return doc.doc_date;
  if (doc.analyzed_at) {
    try {
      const d = new Date(doc.analyzed_at);
      return d.toISOString().slice(0, 10);
    } catch { /* fall through */ }
  }
  return null;
}

function formatShortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export const DocumentTimeline: React.FC<DocumentTimelineProps> = ({
  documents, onSelectDocument, selectedFilePath,
}) => {
  // Sort by date (earliest first), undated at end
  const sorted = [...documents].sort((a, b) => {
    const dateA = getDocDate(a);
    const dateB = getDocDate(b);
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return dateA.localeCompare(dateB);
  });

  if (sorted.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center gap-1.5 mb-2.5">
        <Calendar size={12} className="text-gray-400" />
        <h3 className="text-caption font-semibold text-gray-700">Document Timeline</h3>
        <span className="text-micro text-gray-400 ml-auto">{sorted.length} docs</span>
      </div>

      {/* Horizontal scrollable timeline */}
      <div className="relative overflow-x-auto pb-1">
        <div className="flex items-start gap-0 min-w-min">
          {sorted.map((doc, i) => {
            const date = getDocDate(doc);
            const isSelected = doc.file_path === selectedFilePath;
            return (
              <div key={doc.file_path} className="flex items-start">
                {/* Timeline node */}
                <button
                  onClick={() => onSelectDocument?.(doc.file_path)}
                  className={cn(
                    'flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-md transition-colors min-w-[80px] max-w-[100px]',
                    isSelected ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-gray-50'
                  )}
                  title={`${doc.file_name}${date ? ` (${date})` : ''}`}
                >
                  {/* Dot */}
                  <div className={cn('w-3 h-3 rounded-full border-2 border-white shadow-sm flex-shrink-0', getDotColor(doc.doc_type))} />
                  {/* Date */}
                  <span className="text-micro text-gray-400 whitespace-nowrap">
                    {date ? formatShortDate(date) : 'No date'}
                  </span>
                  {/* Doc type */}
                  <span className={cn(
                    'text-micro font-medium truncate w-full text-center',
                    isSelected ? 'text-primary' : 'text-gray-600'
                  )}>
                    {doc.doc_type || 'Doc'}
                  </span>
                  {/* File name */}
                  <span className="text-micro text-gray-400 truncate w-full text-center" title={doc.file_name}>
                    {doc.file_name.replace(/\.pdf$/i, '').slice(0, 12)}
                  </span>
                </button>

                {/* Connector line (not after last) */}
                {i < sorted.length - 1 && (
                  <div className="flex items-center self-center mt-1">
                    <div className="w-4 h-px bg-gray-200" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
