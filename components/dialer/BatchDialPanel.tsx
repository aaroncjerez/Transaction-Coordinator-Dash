import React, { useState, useEffect } from 'react';
import { Phone, Pause, Play, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { startBatchDial, onBatchDialProgress, pauseBatchDial, resumeBatchDial } from '../../lib/database';
import { useToast } from '../ui/Toast';
import type { BatchDialProgress, BatchDialResult } from '../../types';

interface BatchDialPanelProps {
  selectedLeadIds: string[];
  onClear: () => void;
  /** When true, start dialing immediately on mount without waiting for button click */
  autoStart?: boolean;
  /** Override from_number for outbound calls */
  fromNumber?: string;
}

export const BatchDialPanel: React.FC<BatchDialPanelProps> = ({ selectedLeadIds, onClear, autoStart, fromNumber }) => {
  const { showToast } = useToast();
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState<BatchDialProgress | null>(null);
  const [result, setResult] = useState<BatchDialResult | null>(null);

  useEffect(() => {
    const unsub = onBatchDialProgress((data) => {
      setProgress(data);
      if (data.status === 'paused') {
        setPaused(true);
      } else if (data.status === 'running') {
        setPaused(false);
      }
      if (data.status === 'completed' || data.status === 'failed') {
        setRunning(false);
        setPaused(false);
      }
    });
    return () => unsub();
  }, []);

  // Auto-start dialing on mount when autoStart is true
  useEffect(() => {
    if (autoStart && selectedLeadIds.length > 0 && !running && !result) {
      handleStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const handleStart = async () => {
    if (selectedLeadIds.length === 0) {
      showToast({ message: 'No leads selected', type: 'error' });
      return;
    }
    setRunning(true);
    setResult(null);
    setProgress(null);
    setPaused(false);

    try {
      const res = await startBatchDial(selectedLeadIds, fromNumber);
      setResult(res);
      showToast({
        message: `Batch complete: ${res.dialed} dialed, ${res.connected} connected`,
        type: 'success',
      });
    } catch (err: any) {
      showToast({ message: err.message || 'Batch dial failed', type: 'error' });
    } finally {
      setRunning(false);
      setPaused(false);
    }
  };

  const handlePause = async () => {
    await pauseBatchDial();
    setPaused(true);
  };

  const handleResume = async () => {
    await resumeBatchDial();
    setPaused(false);
  };

  if (selectedLeadIds.length === 0 && !running && !result) return null;

  const pct = progress
    ? Math.round((progress.dialedCount / progress.totalLeads) * 100)
    : 0;

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Phone size={16} className="text-blue-600" />
          <span className="text-sm font-semibold text-gray-800">Batch Auto-Dial</span>
        </div>

        <div className="flex items-center gap-2">
          {!running && !result && (
            <>
              <span className="text-caption text-gray-600">
                {selectedLeadIds.length} lead{selectedLeadIds.length !== 1 ? 's' : ''} selected
              </span>
              <button
                onClick={handleStart}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-caption font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                <Play size={12} />
                Start Dialing
              </button>
              <button
                onClick={onClear}
                className="px-2 py-1.5 text-caption text-gray-500 hover:text-gray-700 transition-colors"
              >
                Clear
              </button>
            </>
          )}

          {running && (
            <div className="flex items-center gap-2">
              {paused ? (
                <button
                  onClick={handleResume}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-caption font-medium rounded-md hover:bg-emerald-700 transition-colors"
                >
                  <Play size={12} /> Resume
                </button>
              ) : (
                <button
                  onClick={handlePause}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-caption font-medium rounded-md hover:bg-amber-600 transition-colors"
                >
                  <Pause size={12} /> Pause
                </button>
              )}
              <span className={`text-caption font-medium flex items-center gap-1.5 ${paused ? 'text-amber-600' : 'text-blue-600'}`}>
                {paused ? (
                  <><Pause size={12} /> Paused</>
                ) : (
                  <><Loader2 size={12} className="animate-spin" /> Dialing...</>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {(running || progress) && progress && (
        <div className="space-y-2">
          <div className="bg-blue-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${paused ? 'bg-amber-400' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-micro text-gray-600">
            <span>
              {paused
                ? 'Campaign paused — click Resume to continue'
                : progress.currentLeadName
                  ? `Calling ${progress.currentLeadName}...`
                  : `Batch ${progress.currentBatch}/${progress.totalBatches}`}
            </span>
            <span className="tabular-nums">{progress.dialedCount}/{progress.totalLeads} ({pct}%)</span>
          </div>
          {((progress.skippedGuard ?? 0) > 0 || progress.skippedDnc > 0) && (
            <span className="text-micro text-amber-600">
              <AlertTriangle size={10} className="inline mr-1" />
              {(progress.skippedGuard ?? 0) > 0
                ? `${progress.skippedGuard} blocked by guard${progress.skippedDnc > 0 ? ` (${progress.skippedDnc} DNC)` : ''}`
                : `${progress.skippedDnc} skipped (DNC)`}
            </span>
          )}
        </div>
      )}

      {/* Result summary */}
      {result && !running && (
        <div className="grid grid-cols-4 gap-3 mt-2">
          <div className="text-center">
            <div className="text-lg font-bold text-gray-900">{result.dialed}</div>
            <div className="text-micro text-gray-500">Dialed</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">{result.connected}</div>
            <div className="text-micro text-gray-500">Connected</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-amber-600">{result.skippedGuard ?? result.skippedDnc}</div>
            <div className="text-micro text-gray-500">{result.skippedGuard != null ? 'Guarded' : 'DNC Skip'}</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-600">{result.failed}</div>
            <div className="text-micro text-gray-500">Failed</div>
          </div>
        </div>
      )}
    </div>
  );
};
