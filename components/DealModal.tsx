import React, { useEffect, useState, useCallback, useRef } from 'react';
import { X, ExternalLink, CheckCircle2, Loader2 } from 'lucide-react';
import { Deadline } from '../types';
import { DealViewData, mapDealData } from '../lib/deal-utils';
import { fetchDealById, getDeadlinesByDeal, updateDealFields } from '../lib/database';
import { getStageColor } from '../constants';
import { cn } from '../lib/utils';
import { DealOverview } from './deal/DealOverview';
import { DealTasks } from './deal/DealTasks';
import { DealFilesAndActivity } from './deal/DealFilesAndActivity';
import { DealChat } from './DealChat';
import { SkeletonModal } from './ui/Skeleton';
import { SaveIndicator } from './ui/SaveIndicator';
import type { UndoAction } from '../hooks/useUndoStack';
import { useAutoSave } from '../hooks/useAutoSave';

type ModalTab = 'summary' | 'tasks' | 'files-activity' | 'chat';

interface DealModalProps {
  dealId: string | null;
  onClose: () => void;
  onDealUpdate?: () => void;
  onUndoableAction?: (action: UndoAction) => void;
}

/** Returns current modal size tier based on viewport width */
function useModalSize(): 'default' | 'wide' | 'xl' {
  const [size, setSize] = useState<'default' | 'wide' | 'xl'>(() => {
    if (typeof window === 'undefined') return 'default';
    if (window.innerWidth >= 1536) return 'xl';
    if (window.innerWidth >= 1280) return 'wide';
    return 'default';
  });

  useEffect(() => {
    const calc = () => {
      if (window.innerWidth >= 1536) setSize('xl');
      else if (window.innerWidth >= 1280) setSize('wide');
      else setSize('default');
    };
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  return size;
}

const modalSizeClass: Record<string, string> = {
  default: 'max-w-3xl',
  wide: 'max-w-5xl',
  xl: 'max-w-6xl',
};

export const DealModal: React.FC<DealModalProps> = ({ dealId, onClose, onDealUpdate, onUndoableAction }) => {
  const [deal, setDeal] = useState<DealViewData | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ModalTab>('summary');
  const [fubSyncStatus, setFubSyncStatus] = useState<'idle' | 'synced' | 'pending' | null>(null);
  const modalSize = useModalSize();
  const isTwoCol = modalSize !== 'default';
  const prevDealIdRef = useRef<string | null>(null);

  // Auto-save: debounced persistence for deal field edits
  const { queueSave, flush, status: saveStatus } = useAutoSave({
    saveFn: async (fields) => {
      if (!dealId) throw new Error('No deal ID');
      return updateDealFields(dealId, fields);
    },
    debounceMs: 800,
    maxRetries: 3,
    onSaved: async (result) => {
      try {
        await onDealUpdate?.();
      } catch (err) {
        console.error('[DealModal] Pipeline refresh after auto-save failed:', err);
      }
      if (result?.fubPush?.queued) {
        setFubSyncStatus(result.fubPush.success ? 'synced' : 'pending');
      }
    },
    onError: (error, failedFields) => {
      console.error('[DealModal] Auto-save failed after retries:', error, failedFields);
    },
  });

  // Flush pending saves when switching deals
  useEffect(() => {
    if (prevDealIdRef.current && prevDealIdRef.current !== dealId) {
      flush();
    }
    prevDealIdRef.current = dealId;
  }, [dealId, flush]);

  // Close handler: flush pending saves before closing
  const handleClose = useCallback(async () => {
    await flush();
    onClose();
  }, [flush, onClose]);

  const fetchDeal = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const [data, dlData] = await Promise.all([
        fetchDealById(id),
        getDeadlinesByDeal(id),
      ]);
      setDeadlines((dlData || []) as Deadline[]);
      if (!data) {
        setDeal(null);
        return;
      }
      setDeal(mapDealData(data));
    } catch (err) {
      console.error('Failed to fetch deal:', err);
      setDeal(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dealId) {
      fetchDeal(dealId);
      setActiveTab('summary');
    }
  }, [dealId, fetchDeal]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleClose]);

  // Auto-dismiss FUB sync indicator after 3s
  useEffect(() => {
    if (!fubSyncStatus || fubSyncStatus === 'idle') return;
    const t = setTimeout(() => setFubSyncStatus(null), 3000);
    return () => clearTimeout(t);
  }, [fubSyncStatus]);

  // Local-only: instant state update (no Pipeline refresh)
  const handleLocalChange = (field: string, value: any) => {
    setDeal(prev => prev ? { ...prev, [field]: value } : null);
  };

  // Called AFTER the DB write completes — now safe to refresh Pipeline
  const handlePersisted = async (fubPush?: { queued: boolean; success?: boolean; error?: string }) => {
    try {
      await onDealUpdate?.();
    } catch (err) {
      console.error('[DealModal] Pipeline refresh failed:', err);
    }
    if (fubPush?.queued) {
      setFubSyncStatus(fubPush.success ? 'synced' : 'pending');
    }
  };

  const isOpen = !!dealId;

  if (!isOpen) return null;

  const stageColor = deal ? getStageColor(deal.stage) : null;

  // In two-column mode, Summary + Tasks are shown inline; tabs only cover remaining views
  const tabs: { id: ModalTab; label: string }[] = isTwoCol
    ? [
        { id: 'files-activity', label: 'Files & Activity' },
        { id: 'chat', label: 'Chat' },
      ]
    : [
        { id: 'summary', label: 'Summary' },
        { id: 'tasks', label: 'Tasks' },
        { id: 'files-activity', label: 'Files & Activity' },
        { id: 'chat', label: 'Chat' },
      ];

  // In two-col mode, default to files-activity tab (since summary & tasks are always visible)
  const effectiveTab = isTwoCol && (activeTab === 'summary' || activeTab === 'tasks') ? null : activeTab;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 animate-fade-in"
        onClick={handleClose}
      />

      {/* Centered Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleClose}>
        <div
          className={cn(
            'bg-white rounded-drawer shadow-lg w-full flex flex-col animate-modal-scale-in max-h-[90vh]',
            modalSizeClass[modalSize],
          )}
          onClick={e => e.stopPropagation()}
          role="dialog"
          aria-label="Deal details"
          aria-modal="true"
        >
          {loading ? (
            <SkeletonModal />
          ) : !deal ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm py-20">
              Deal not found
            </div>
          ) : (
            <>
              {/* Header */}
              <div className={cn('border-b border-gray-200 px-5 pt-4 pb-3 flex-shrink-0')}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-gray-900 truncate leading-tight">
                      {deal.deal_name}
                    </h2>
                    {(deal.county || deal.state) && (
                      <p className="text-caption text-gray-500 mt-0.5">
                        {[deal.county, deal.state].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {deal.fub_person_id && (
                      <a
                        href={`https://jerezland.followupboss.com/2/people/view/${deal.fub_person_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary-light rounded transition-colors"
                        title="View in FUB"
                        aria-label="View in Follow Up Boss"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                    <button
                      onClick={handleClose}
                      className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                      aria-label="Close modal"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Stage badge + save/sync indicators */}
                <div className="flex items-center gap-2">
                  {stageColor && (
                    <span className={cn(
                      'inline-flex text-micro font-semibold px-2 py-0.5 rounded',
                      stageColor.light, stageColor.lightText
                    )}>
                      {deal.stage}
                    </span>
                  )}
                  <SaveIndicator status={saveStatus} />
                  {fubSyncStatus === 'synced' && (
                    <span className="inline-flex items-center gap-1 text-micro font-medium text-emerald-600 animate-fade-in">
                      <CheckCircle2 size={12} />
                      FUB synced
                    </span>
                  )}
                  {fubSyncStatus === 'pending' && (
                    <span className="inline-flex items-center gap-1 text-micro font-medium text-amber-600 animate-fade-in">
                      <Loader2 size={12} className="animate-spin" />
                      FUB pending
                    </span>
                  )}
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-3 -mb-3" role="tablist" aria-label="Deal sections">
                  {tabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      role="tab"
                      aria-selected={effectiveTab === tab.id}
                      className={cn(
                        'px-3 py-2 text-caption font-medium border-b-2 transition-colors',
                        effectiveTab === tab.id
                          ? 'border-primary text-primary'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Content */}
              {isTwoCol ? (
                /* Two-column layout (>=1280px) */
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                  {/* Top: Summary + Tasks side-by-side */}
                  <div className="flex-1 flex overflow-hidden min-h-0">
                    {/* Left column — Overview */}
                    <div className="w-[58%] overflow-y-auto scrollbar-thin px-5 py-4 border-r border-gray-100">
                      <DealOverview deal={deal} onDealChange={handleLocalChange} onDealPersisted={handlePersisted} queueSave={queueSave} deadlines={deadlines} />
                    </div>
                    {/* Right column — Tasks */}
                    <div className="w-[42%] overflow-y-auto scrollbar-thin px-4 py-4">
                      {stageColor && <DealTasks dealId={deal.id} stageHex={stageColor.hex} onUndoableAction={onUndoableAction} />}
                    </div>
                  </div>
                  {/* Bottom: tabbed content for Files & Activity / Chat */}
                  {effectiveTab && (
                    <div className="border-t border-gray-200 max-h-[40%] overflow-y-auto scrollbar-thin px-5 py-4">
                      {effectiveTab === 'files-activity' && (
                        <DealFilesAndActivity dealId={deal.id} fubPersonId={deal.fub_person_id} />
                      )}
                      {effectiveTab === 'chat' && (
                        <DealChat dealId={deal.id} dealName={deal.deal_name} />
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Single-column layout (<1280px) */
                <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">
                  {activeTab === 'summary' && (
                    <DealOverview deal={deal} onDealChange={handleLocalChange} onDealPersisted={handlePersisted} queueSave={queueSave} deadlines={deadlines} />
                  )}
                  {activeTab === 'tasks' && stageColor && (
                    <DealTasks dealId={deal.id} stageHex={stageColor.hex} onUndoableAction={onUndoableAction} />
                  )}
                  {activeTab === 'files-activity' && (
                    <DealFilesAndActivity dealId={deal.id} fubPersonId={deal.fub_person_id} />
                  )}
                  {activeTab === 'chat' && (
                    <DealChat dealId={deal.id} dealName={deal.deal_name} />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};
