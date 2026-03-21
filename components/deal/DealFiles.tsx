import React, { useEffect, useState, useRef } from 'react';
import {
  FileText, ExternalLink, Cloud,
  Loader2, Sparkles, Upload, Eye,
} from 'lucide-react';
import { listFiles, analyzePdf, getPdfAnalysesByDeal } from '../../lib/database';
import { cn } from '../../lib/utils';
import { uploadFileLocal } from '../../lib/uploadHandler';
import { DocumentAnalysisCard } from './DocumentAnalysisCard';
import { DocumentTimeline } from './DocumentTimeline';
import { PdfViewer } from './PdfViewer';

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

export const DealFiles: React.FC<DealFilesProps> = ({ dealId }) => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, any>>({});
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload progress
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  // PDF viewer state
  const [viewingFile, setViewingFile] = useState<FileItem | null>(null);

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
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dealId) fetchData();
  }, [dealId]);

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

  // --- Multi-file upload ---

  const handleMultiUpload = async (fileList: File[]) => {
    setUploading(true);
    setUploadProgress({ current: 0, total: fileList.length });
    const uploaded: { result: any; file: File }[] = [];
    for (let i = 0; i < fileList.length; i++) {
      setUploadProgress({ current: i + 1, total: fileList.length });
      try {
        const result = await uploadFileLocal(dealId, fileList[i], 'other');
        uploaded.push({ result, file: fileList[i] });
      } catch (err: any) {
        console.error(`Failed to upload ${fileList[i].name}:`, err);
      }
    }
    await fetchData();
    setUploading(false);
    setUploadProgress(null);

    // Auto-analyze PDFs
    for (const { result, file } of uploaded) {
      if (file.name.toLowerCase().endsWith('.pdf') && result?.file_path) {
        handleAnalyze({
          id: result.id,
          name: result.file_name,
          url: `file://${result.file_path}`,
          categoryKey: result.category || 'other',
          source: 'local',
        });
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    handleMultiUpload(Array.from(e.target.files));
    e.target.value = '';
  };

  // --- Drag-and-drop handlers ---

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items?.length) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      await handleMultiUpload(droppedFiles);
    }
  };

  if (loading) return <div className="py-8 text-center text-gray-400 text-caption">Loading files...</div>;

  // PDF Viewer overlay
  if (viewingFile) {
    const filePath = viewingFile.url.replace('file://', '');
    const analysis = analyses[filePath];
    const isAnalyzing = analyzing === filePath;
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <PdfViewer
          filePath={filePath}
          fileName={viewingFile.name}
          onBack={() => setViewingFile(null)}
        />
        {analysis && (
          <div className="border-t border-gray-200 px-3 py-2 bg-white flex-shrink-0">
            <DocumentAnalysisCard analysis={analysis} onReanalyze={() => handleAnalyze(viewingFile)} isReanalyzing={isAnalyzing} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="space-y-2"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Document Timeline */}
      {Object.keys(analyses).length >= 2 && (
        <DocumentTimeline
          documents={Object.values(analyses)}
          onSelectDocument={(fp) => {
            const file = files.find(f => f.url.replace('file://', '') === fp);
            if (file) setViewingFile(file);
          }}
        />
      )}

      {/* Drop Zone — compact inline */}
      <div
        className={cn(
          'relative border border-dashed rounded-md px-3 py-2 transition-colors cursor-pointer flex items-center gap-2',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-gray-200 hover:border-gray-300 bg-subtle'
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />
        <Upload size={14} className={cn('flex-shrink-0', isDragging ? 'text-primary' : 'text-gray-400')} />
        <span className="text-caption text-gray-500">
          {isDragging ? 'Drop files here' : 'Drop files or click to browse'}
        </span>
      </div>

      {/* Upload Progress */}
      {uploading && uploadProgress && (
        <div className="flex items-center gap-2 px-1">
          <Loader2 size={12} className="animate-spin text-primary" />
          <span className="text-micro text-gray-500">
            Uploading {uploadProgress.current} of {uploadProgress.total}...
          </span>
          <div className="flex-1 bg-gray-100 rounded-full h-1 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* File List */}
      <div className="space-y-1">
        {files.length === 0 && !uploading && (
          <p className="text-center text-gray-400 text-caption py-3">No files yet</p>
        )}
        {files.map((file) => {
          const filePath = file.url.replace('file://', '');
          const isPdf = file.name.toLowerCase().endsWith('.pdf');
          const analysis = analyses[filePath];
          const isAnalyzing = analyzing === filePath;
          return (
            <div key={file.id} className="space-y-1">
              <div
                className={cn(
                  "group flex items-center justify-between p-2 bg-white rounded border border-gray-100 transition-colors hover:border-gray-200",
                  isPdf && "cursor-pointer"
                )}
                onClick={() => isPdf && filePath ? setViewingFile(file) : undefined}
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <FileText size={12} className="text-primary flex-shrink-0" />
                  <span className="text-micro text-gray-700 truncate" title={file.name}>{file.name}</span>
                  {file.source === 'fub' && <Cloud size={9} className="text-blue-400 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-0.5">
                  {isPdf && filePath && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setViewingFile(file); }}
                      className="p-1 text-gray-400 hover:text-primary hover:bg-primary-light rounded transition-colors"
                      title="View PDF"
                      aria-label="View PDF inline"
                    >
                      <Eye size={11} />
                    </button>
                  )}
                  {isPdf && !analysis && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleAnalyze(file); }}
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
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Open ${file.name}`}
                  >
                    <ExternalLink size={11} />
                  </a>
                </div>
              </div>
              {analysis && <DocumentAnalysisCard analysis={analysis} onReanalyze={() => handleAnalyze(file)} isReanalyzing={isAnalyzing} compact />}
            </div>
          );
        })}
      </div>
    </div>
  );
};
