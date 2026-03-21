import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Minimize2, Loader2,
} from 'lucide-react';
import { readPdfFile } from '../../lib/database';

// Set up the PDF.js worker from CDN
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  filePath: string;
  fileName: string;
  onBack: () => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({ filePath, fileName, onBack }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [error, setError] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load PDF data via IPC (file:// URLs don't work in pdf.js workers)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfData(null);
    setPageNumber(1);
    setNumPages(0);

    readPdfFile(filePath).then((result) => {
      if (cancelled) return;
      if (result.error || !result.data) {
        setError(result.error || 'Failed to read PDF file');
      } else {
        setPdfData(result.data);
      }
      setLoading(false);
    }).catch((e) => {
      if (cancelled) return;
      setError(e.message || 'Failed to read PDF file');
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [filePath]);

  const onDocumentLoadSuccess = useCallback(({ numPages: total }: { numPages: number }) => {
    setNumPages(total);
    setPageNumber(1);
    setError(null);
  }, []);

  const onDocumentLoadError = useCallback((err: Error) => {
    console.error('[PdfViewer] Load error:', err);
    setError(err.message || 'Failed to load PDF');
  }, []);

  const goToPrevPage = () => setPageNumber(p => Math.max(1, p - 1));
  const goToNextPage = () => setPageNumber(p => Math.min(numPages, p + 1));
  const zoomIn = () => setScale(s => Math.min(3, s + 0.25));
  const zoomOut = () => setScale(s => Math.max(0.5, s - 0.25));
  const fitWidth = () => setScale(1.0);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-caption text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <span className="text-gray-300">|</span>
          <span className="text-caption font-medium text-gray-700 truncate max-w-[200px]" title={fileName}>
            {fileName}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Page nav */}
          <button onClick={goToPrevPage} disabled={pageNumber <= 1}
            className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-30 transition-colors">
            <ChevronLeft size={16} />
          </button>
          <span className="text-micro text-gray-500 min-w-[60px] text-center">
            {pageNumber} / {numPages}
          </span>
          <button onClick={goToNextPage} disabled={pageNumber >= numPages}
            className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-30 transition-colors">
            <ChevronRight size={16} />
          </button>

          <span className="text-gray-200 mx-1">|</span>

          {/* Zoom */}
          <button onClick={zoomOut} disabled={scale <= 0.5}
            className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-30 transition-colors">
            <ZoomOut size={14} />
          </button>
          <span className="text-micro text-gray-500 min-w-[40px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button onClick={zoomIn} disabled={scale >= 3}
            className="p-1 text-gray-500 hover:text-gray-700 disabled:opacity-30 transition-colors">
            <ZoomIn size={14} />
          </button>
          <button onClick={fitWidth}
            className="p-1 text-gray-500 hover:text-gray-700 transition-colors" title="Fit width">
            <Minimize2 size={14} />
          </button>
        </div>
      </div>

      {/* PDF Content */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-gray-100 flex justify-center p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">
            <Loader2 size={16} className="animate-spin mr-2" /> Loading PDF...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-sm text-red-500">
            Failed to load PDF: {error}
          </div>
        ) : pdfData ? (
          <Document
            file={pdfData}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center h-32 text-sm text-gray-400">
                <Loader2 size={16} className="animate-spin mr-2" /> Rendering PDF...
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="shadow-lg"
            />
          </Document>
        ) : null}
      </div>
    </div>
  );
};
