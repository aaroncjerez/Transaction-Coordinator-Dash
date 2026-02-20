import React, { useEffect, useState } from 'react';
import {
  FileText, Plus, ExternalLink, Cloud, CheckCircle, AlertTriangle,
  Loader2, RefreshCw, Sparkles,
} from 'lucide-react';
import { listFiles, analyzePdf, getPdfAnalysesByDeal, getFubFileSyncStatus, triggerFubFileSync } from '../../lib/database';
import { FILE_CATEGORIES } from '../../constants';
import { cn } from '../../lib/utils';
import { uploadFileLocal } from '../../lib/uploadHandler';
import { PdfAnalysisCard } from '../PdfAnalysisCard';

interface DealFilesProps {
  dealId: string;
  fubPersonId?: string;
}

interface FileItem {
  id: string;
  name: string;
  url: string;
  categoryKey: string;
  source?: 'local' | 'fub';
  fub_attachment_id?: string;
}

export const DealFiles: React.FC<DealFilesProps> = ({ dealId, fubPersonId }) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, any>>({});
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [fubSyncStatus, setFubSyncStatus] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const fileRecords = await listFiles(dealId);
      const mapped: FileItem[] = (fileRecords || []).map((f: any) => ({
        id: f.id,
        name: f.file_name,
        url: f.file_path ? `file://${f.file_path}` : '',
        categoryKey: f.category || 'other',
        source: f.source || 'local',
        fub_attachment_id: f.fub_attachment_id,
      }));
      setFiles(mapped);

      const analysisData = await getPdfAnalysesByDeal(dealId);
      const map: Record<string, any> = {};
      (analysisData || []).forEach((a: any) => { map[a.file_path] = a; });
      setAnalyses(map);

      if (fubPersonId) {
        try {
          const status = await getFubFileSyncStatus(dealId);
          setFubSyncStatus(status);
        } catch (e) {
          console.warn('Failed to load FUB sync status:', e);
        }
      }
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dealId) fetchData();
  }, [dealId]);

  const handleFubSync = async () => {
    setSyncing(true);
    try {
      await triggerFubFileSync(dealId);
      await fetchData();
    } catch (e) {
      console.error('FUB sync failed:', e);
    } finally {
      setSyncing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, categoryKey: string) => {
    if (!event.target.files || event.target.files.length === 0) return;
    const file = event.target.files[0];
    try {
      const result = await uploadFileLocal(dealId, file, categoryKey, (msg) => console.log(msg));
      await fetchData();

      // Auto-analyze PDFs on upload
      if (file.name.toLowerCase().endsWith('.pdf') && result?.file_path) {
        handleAnalyze({
          id: result.id,
          name: result.file_name,
          url: `file://${result.file_path}`,
          categoryKey: result.category || categoryKey,
          source: 'local',
        });
      }
    } catch (error: any) {
      console.error('Error uploading file:', error);
      alert(error.message || 'Failed to upload file.');
    }
  };

  const handleAnalyze = async (file: FileItem) => {
    const filePath = file.url.replace('file://', '');
    if (!filePath || !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Only local PDF files can be analyzed.');
      return;
    }
    setAnalyzing(filePath);
    try {
      await analyzePdf(dealId, filePath, file.name, file.categoryKey || 'other');
      await fetchData();
    } catch (e: any) {
      console.error('PDF analysis failed:', e);
      alert(e.message || 'Analysis failed');
    } finally {
      setAnalyzing(null);
    }
  };

  if (loading) return <div className="py-8 text-center text-gray-400 text-caption">Loading files...</div>;

  return (
    <div className="space-y-4 py-1">
      {/* FUB Sync Banner */}
      {fubPersonId && (
        <div className="flex items-center justify-between bg-subtle rounded-md border border-gray-200 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <Cloud size={14} className="text-primary" />
            <span className="text-caption font-medium text-gray-700">FUB Files</span>
            {fubSyncStatus ? (
              <span>
                {fubSyncStatus.last_status === 'synced' && (
                  <span className="inline-flex items-center gap-1 text-micro text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                    <CheckCircle size={10} /> Synced
                  </span>
                )}
                {fubSyncStatus.last_status === 'mismatch' && (
                  <span className="inline-flex items-center gap-1 text-micro text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                    <AlertTriangle size={10} /> Mismatch
                  </span>
                )}
                {fubSyncStatus.last_status === 'error' && (
                  <span className="text-micro text-red-600 bg-red-50 px-1.5 py-0.5 rounded">Error</span>
                )}
                {(fubSyncStatus.last_status === 'pending' || fubSyncStatus.last_status === 'syncing') && (
                  <span className="inline-flex items-center gap-1 text-micro text-primary bg-primary-light px-1.5 py-0.5 rounded">
                    <Loader2 size={10} className="animate-spin" /> Syncing
                  </span>
                )}
              </span>
            ) : (
              <span className="text-micro text-gray-400">Not synced</span>
            )}
          </div>
          <button
            onClick={handleFubSync}
            disabled={syncing}
            className="flex items-center gap-1 text-micro font-medium text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
          >
            {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Sync
          </button>
        </div>
      )}

      {/* File Categories */}
      <div className="space-y-3">
        {FILE_CATEGORIES.map(category => {
          const categoryFiles = files.filter(f => f.categoryKey === category.key);
          return (
            <div key={category.key} className="bg-subtle rounded-md border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-caption font-semibold text-gray-700 flex items-center gap-1.5">
                  {category.label}
                  <span className="bg-gray-200 text-gray-500 text-micro px-1.5 py-0.5 rounded-full">
                    {categoryFiles.length}
                  </span>
                </h3>
                <div className="relative">
                  <input
                    type="file"
                    id={`drawer-upload-${category.key}`}
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, category.key)}
                  />
                  <label
                    htmlFor={`drawer-upload-${category.key}`}
                    className="cursor-pointer p-1 text-primary hover:bg-primary-light rounded transition-colors"
                    title="Upload File"
                    aria-label={`Upload file to ${category.label}`}
                  >
                    <Plus size={14} />
                  </label>
                </div>
              </div>
              <div className="space-y-1 max-h-[200px] overflow-y-auto scrollbar-thin">
                {categoryFiles.map((file) => {
                  const filePath = file.url.replace('file://', '');
                  const isPdf = file.name.toLowerCase().endsWith('.pdf');
                  const analysis = analyses[filePath];
                  const isAnalyzing = analyzing === filePath;
                  return (
                    <div key={file.id} className="space-y-1">
                      <div className="group flex items-center justify-between p-2 bg-white rounded border border-gray-100 transition-colors hover:border-gray-200">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileText size={12} className="text-primary flex-shrink-0" />
                          <span className="text-micro text-gray-700 truncate" title={file.name}>{file.name}</span>
                          {file.source === 'fub' && <Cloud size={9} className="text-blue-400 flex-shrink-0" />}
                        </div>
                        <div className="flex items-center gap-0.5">
                          {isPdf && !analysis && (
                            <button
                              onClick={() => handleAnalyze(file)}
                              disabled={isAnalyzing}
                              className="p-1 text-primary hover:bg-primary-light rounded transition-colors disabled:opacity-50"
                              title="Analyze PDF"
                              aria-label="Analyze PDF"
                            >
                              {isAnalyzing ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                            </button>
                          )}
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-primary transition-all"
                            aria-label={`Open ${file.name}`}
                          >
                            <ExternalLink size={11} />
                          </a>
                        </div>
                      </div>
                      {analysis && <PdfAnalysisCard analysis={analysis} onReanalyze={() => handleAnalyze(file)} isReanalyzing={isAnalyzing} />}
                    </div>
                  );
                })}
                {categoryFiles.length === 0 && (
                  <div className="h-10 flex items-center justify-center text-gray-400 border border-dashed border-gray-200 rounded text-micro">
                    No files
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
