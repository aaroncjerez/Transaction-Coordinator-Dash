import React, { useEffect, useState, useCallback } from 'react';
import { X, ExternalLink, CheckCircle2, Loader2 } from 'lucide-react';
import { Deadline } from '../types';
import { DealViewData, mapDealData } from '../lib/deal-utils';
import { fetchDealById, getDeadlinesByDeal } from '../lib/database';
import { getStageColor } from '../constants';
import { cn } from '../lib/utils';
import { DealOverview } from './deal/DealOverview';
import { DealTasks } from './deal/DealTasks';
import { DealFilesAndActivity } from './deal/DealFilesAndActivity';
import { DealChat } from './DealChat';
import { SkeletonDrawer } from './ui/Skeleton';

type DrawerTab = 'summary' | 'tasks' | 'files-activity' | 'chat';

interface DealDrawerProps {
  dealId: string | null;
  onClose: () => void;
  onDealUpdate?: () => void;
}

/** Returns current drawer size tier based on viewport width */
function useDrawerSize(): 'default' | 'wide' | 'xl' {
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

const drawerWidthClass: Record<string, string> = {
  default: 'w-drawer',
  wide: 'w-drawer-wide',
  xl: 'w-drawer-xl',
};

export const DealDrawer: React.FC<DealDrawerProps> = ({ dealId, onClose, onDealUpdate }) => {
  const [deal, setDeal] = useState<DealViewData | null>(null);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DrawerTab>('summary');
  const [fubSyncStatus, setFubSyncStatus] = useState<'idle' | 'synced' | 'pending' | null>(null);
  const drawerSize = useDrawerSize();
  const isTwoCol = drawerSize === 'xl';

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
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Auto-dismiss FUB sync indicator after 3s
  useEffect(() => {
    if (!fubSyncStatus || fubSyncStatus === 'idle') return;
    const t = setTimeout(() => setFubSyncStatus(null), 3000);
    return () => clearTimeout(t);
  }, [fubSyncStatus]);

  // Local-only: instant drawer state update (no Pipeline refresh)
  const handleLocalChange = (field: string, value: any) => {
    setDeal(prev => prev ? { ...prev, [field]: value } : null);
  };

  // Called AFTER the DB write completes — now safe to refresh Pipeline
  const handlePersisted = async (fubPush?: { queued: boolean; success?: boolean; error?: string }) => {
    try {
      await onDealUpdate?.();
    } catch (err) {
      console.error('[DealDrawer] Pipeline refresh failed:', err);
    }
    // Show FUB sync indicator
    if (fubPush?.queued) {
      setFubSyncStatus(fubPush.success ? 'synced' : 'pending');
    }
  };

  const isOpen = !!dealId;

  if (!isOpen) return null;

  const stageColor = deal ? getStageColor(deal.stage) : null;

  // In two-column mode, Summary + Tasks are shown inline; tabs only cover remaining views
  const tabs: { id: DrawerTab; label: string }[] = isTwoCol
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
        className="fixed inset-0 bg-black/20 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full max-w-[90vw] bg-white shadow-lg z-50 flex flex-col animate-slide-in-right transition-[width] duration-200',
          drawerWidthClass[drawerSize],
        )}
        role="dialog"
        aria-label="Deal details"
        aria-modal="true"
      >
        {loading ? (
          <SkeletonDrawer />
        ) : !deal ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
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
                    onClick={onClose}
                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                    aria-label="Close drawer"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Stage badge + FUB sync indicator */}
              <div className="flex items-center gap-2">
                {stageColor && (
                  <span className={cn(
                    'inline-flex text-micro font-semibold px-2 py-0.5 rounded',
                    stageColor.light, stageColor.lightText
                  )}>
                    {deal.stage}
                  </span>
                )}
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

              {/* Tabs — shown for non-inlined views */}
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
              /* ═══ Two-column layout (≥1536px) ═══ */
              <div className="flex-1 overflow-hidden flex flex-col">
                {/* Top: Summary + Tasks side-by-side */}
                <div className="flex-1 flex overflow-hidden min-h-0">
                  {/* Left column — Overview */}
                  <div className="w-[58%] overflow-y-auto scrollbar-thin px-5 py-4 border-r border-gray-100">
                    <DealOverview deal={deal} onDealChange={handleLocalChange} onDealPersisted={handlePersisted} deadlines={deadlines} />
                  </div>
                  {/* Right column — Tasks */}
                  <div className="w-[42%] overflow-y-auto scrollbar-thin px-4 py-4">
                    {stageColor && <DealTasks dealId={deal.id} stageHex={stageColor.hex} />}
                  </div>
                </div>
                {/* Bottom: tabbed content for Files & Activity / Chat (when a tab is selected) */}
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
              /* ═══ Single-column layout (default / wide) ═══ */
              <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">
                {activeTab === 'summary' && (
                  <DealOverview deal={deal} onDealChange={handleLocalChange} onDealPersisted={handlePersisted} deadlines={deadlines} />
                )}
                {activeTab === 'tasks' && stageColor && (
                  <DealTasks dealId={deal.id} stageHex={stageColor.hex} />
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
    </>
  );
};
