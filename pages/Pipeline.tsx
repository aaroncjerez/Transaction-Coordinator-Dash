import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { RefreshCw, Plus, Filter, X, Search, LayoutGrid, List, CheckSquare, XSquare } from 'lucide-react';
import { Deal, Task, Deadline, FubSyncStatus, DealType } from '../types';
import { PIPELINE_STAGES, DEAL_TYPES, getStageColor } from '../constants';
import { cn } from '../lib/utils';
import {
  fetchAllDeals,
  fetchAllTasks,
  getAllDeadlines,
  getAllFubFileSyncStatuses,
  triggerFubPersonSync,
  onFubPersonSyncComplete,
  updateDealFields,
  updateTaskWithLog,
  checkStageChange,
  insertDeal,
  getSetting,
  setSetting,
} from '../lib/database';
import { TopBar } from '../components/TopBar';
import { KanbanColumn } from '../components/KanbanColumn';
import { KanbanCard } from '../components/KanbanCard';
import { SkeletonColumn } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { DealDrawer } from '../components/DealDrawer';
import { PipelineSummaryBar } from '../components/PipelineSummaryBar';
import { OnboardingEmptyState } from '../components/ui/EmptyState';
import { useOpenCommandPalette } from '../components/Layout';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useToast } from '../components/ui/Toast';
import { usePreferences } from '../contexts/PreferencesContext';

// ---- Stage Change Confirmation Dialog ----

interface StageDialogProps {
  isOpen: boolean;
  dealName: string;
  fromStage: string;
  toStage: string;
  incompleteTasks: { id: string; title: string; status: string }[];
  onConfirm: () => void;
  onCancel: () => void;
}

const StageChangeDialog: React.FC<StageDialogProps> = ({
  isOpen, dealName, fromStage, toStage, incompleteTasks, onConfirm, onCancel,
}) => {
  if (!isOpen) return null;
  const fromColor = getStageColor(fromStage);
  const toColor = getStageColor(toStage);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onCancel}>
      <div
        className="bg-white rounded-drawer shadow-lg max-w-md w-full mx-4 p-6"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Confirm stage change"
        aria-modal="true"
      >
        <h3 className="text-base font-semibold text-gray-900 mb-2">Move deal?</h3>
        <p className="text-sm text-gray-600 mb-3">
          <span className="font-medium">{dealName}</span> has {incompleteTasks.length} incomplete
          task{incompleteTasks.length !== 1 ? 's' : ''}:
        </p>
        <ul className="space-y-1 mb-4 max-h-40 overflow-y-auto">
          {incompleteTasks.map(t => (
            <li key={t.id} className="text-caption text-gray-500 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
              <span className="truncate">{t.title}</span>
              <span className="text-micro text-gray-400 ml-auto flex-shrink-0">{t.status}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 text-caption text-gray-500 mb-5">
          <span className={cn('px-2 py-0.5 rounded font-medium', fromColor.light, fromColor.lightText)}>{fromStage}</span>
          <span>→</span>
          <span className={cn('px-2 py-0.5 rounded font-medium', toColor.light, toColor.lightText)}>{toStage}</span>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={onConfirm}>Move anyway</Button>
        </div>
      </div>
    </div>
  );
};

// ---- Filter Types ----

type DeadlineFilter = 'all' | 'overdue' | 'upcoming' | 'none';
type SyncFilter = 'all' | 'synced' | 'error' | 'unlinked';

interface FilterPreset {
  name: string;
  dealType: DealType | 'all';
  deadline: DeadlineFilter;
  sync: SyncFilter;
}

const FILTER_PRESETS_KEY = 'pipeline_filter_presets';

// ---- Pipeline Page ----

export const Pipeline: React.FC = () => {
  const navigate = useNavigate();
  const openCommandPalette = useOpenCommandPalette();
  const { showToast } = useToast();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [syncStatuses, setSyncStatuses] = useState<Record<string, FubSyncStatus | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Filters
  const [dealTypeFilter, setDealTypeFilter] = useState<DealType | 'all'>('all');
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>('all');
  const [syncFilter, setSyncFilter] = useState<SyncFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { prefs, updatePref } = usePreferences();
  const isCompact = prefs.cardDensity === 'compact';
  const setIsCompact = (compact: boolean) => updatePref('cardDensity', compact ? 'compact' : 'expanded');

  // Filter Presets
  const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([]);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');

  useEffect(() => {
    getSetting(FILTER_PRESETS_KEY).then(raw => {
      if (raw) {
        try { setFilterPresets(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  const savePreset = async () => {
    if (!presetName.trim()) return;
    const preset: FilterPreset = {
      name: presetName.trim(),
      dealType: dealTypeFilter,
      deadline: deadlineFilter,
      sync: syncFilter,
    };
    const next = [...filterPresets, preset];
    setFilterPresets(next);
    await setSetting(FILTER_PRESETS_KEY, JSON.stringify(next));
    setPresetName('');
    setShowSavePreset(false);
    showToast({ message: `Filter "${preset.name}" saved`, type: 'success' });
  };

  const applyPreset = (preset: FilterPreset) => {
    setDealTypeFilter(preset.dealType);
    setDeadlineFilter(preset.deadline);
    setSyncFilter(preset.sync);
    setShowFilters(true);
  };

  const deletePreset = async (index: number) => {
    const next = filterPresets.filter((_, i) => i !== index);
    setFilterPresets(next);
    await setSetting(FILTER_PRESETS_KEY, JSON.stringify(next));
  };

  // Batch select mode
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set());

  const handleToggleSelect = (dealId: string) => {
    setSelectedDealIds(prev => {
      const next = new Set(prev);
      if (next.has(dealId)) next.delete(dealId);
      else next.add(dealId);
      return next;
    });
  };

  const handleExitSelectMode = () => {
    setIsSelectMode(false);
    setSelectedDealIds(new Set());
  };

  const handleBatchStageChange = async (targetStage: string) => {
    if (selectedDealIds.size === 0) return;
    let successCount = 0;
    for (const dealId of selectedDealIds) {
      try {
        await updateDealFields(dealId, { stage: targetStage });
        successCount++;
      } catch (err) {
        console.error(`Batch stage change failed for ${dealId}:`, err);
      }
    }
    showToast({ message: `${successCount} deal${successCount !== 1 ? 's' : ''} moved to ${targetStage}`, type: 'success' });
    handleExitSelectMode();
    await fetchData();
  };

  const handleBatchTypeChange = async (targetType: string) => {
    if (selectedDealIds.size === 0) return;
    let successCount = 0;
    for (const dealId of selectedDealIds) {
      try {
        await updateDealFields(dealId, { deal_type: targetType });
        successCount++;
      } catch (err) {
        console.error(`Batch type change failed for ${dealId}:`, err);
      }
    }
    showToast({ message: `${successCount} deal${successCount !== 1 ? 's' : ''} set to ${targetType}`, type: 'success' });
    handleExitSelectMode();
    await fetchData();
  };

  const handleBatchCancel = async () => {
    if (selectedDealIds.size === 0) return;
    let successCount = 0;
    for (const dealId of selectedDealIds) {
      try {
        await updateDealFields(dealId, { stage: 'Cancelled' });
        successCount++;
      } catch (err) {
        console.error(`Batch cancel failed for ${dealId}:`, err);
      }
    }
    showToast({ message: `${successCount} deal${successCount !== 1 ? 's' : ''} cancelled`, type: 'success' });
    handleExitSelectMode();
    await fetchData();
  };

  // Drag state
  const [activeDealId, setActiveDealId] = useState<string | null>(null);

  // Stage change confirmation
  const [stageDialog, setStageDialog] = useState<{
    dealId: string;
    dealName: string;
    fromStage: string;
    toStage: string;
    incompleteTasks: { id: string; title: string; status: string }[];
  } | null>(null);

  // DealDrawer selection
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);

  // Keyboard focus (visual ring, separate from drawer)
  const [focusedDealId, setFocusedDealId] = useState<string | null>(null);

  // DnD sensors — small activation distance to distinguish click from drag
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // ---- Data Fetching ----

  const fetchData = useCallback(async () => {
    try {
      const [fetchedDeals, fetchedTasks, fetchedDeadlines, fetchedSyncStatuses] = await Promise.all([
        fetchAllDeals(),
        fetchAllTasks(),
        getAllDeadlines(),
        getAllFubFileSyncStatuses(),
      ]);
      setDeals(fetchedDeals as Deal[]);
      setTasks(fetchedTasks as Task[]);
      setDeadlines(fetchedDeadlines as Deadline[]);

      // Build sync status map
      const statusMap: Record<string, FubSyncStatus | null> = {};
      (fetchedSyncStatuses as any[]).forEach(s => {
        statusMap[s.deal_id] = s.last_status || null;
      });
      setSyncStatuses(statusMap);
    } catch (err) {
      console.error('Pipeline: fetch error', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    onFubPersonSyncComplete(() => fetchData());
  }, [fetchData]);

  // ---- Derived Data ----

  const tasksByDeal = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach(t => {
      if (!map[t.deal_id]) map[t.deal_id] = [];
      map[t.deal_id].push(t);
    });
    return map;
  }, [tasks]);

  const deadlinesByDeal = useMemo(() => {
    const map: Record<string, Deadline[]> = {};
    deadlines.forEach(d => {
      if (!map[d.deal_id]) map[d.deal_id] = [];
      map[d.deal_id].push(d);
    });
    return map;
  }, [deadlines]);

  // Filtered deals
  const filteredDeals = useMemo(() => {
    return deals.filter(d => {
      // Exclude cancelled from pipeline
      if (d.stage === 'Cancelled') return false;

      // Deal type filter
      if (dealTypeFilter !== 'all' && d.deal_type !== dealTypeFilter) return false;

      // Deadline filter
      if (deadlineFilter !== 'all') {
        const dealDeadlines = deadlinesByDeal[d.id] || [];
        const now = Date.now();
        if (deadlineFilter === 'overdue') {
          const hasOverdue = dealDeadlines.some(dl => new Date(dl.due_date).getTime() < now && !dl.is_acknowledged);
          if (!hasOverdue) return false;
        } else if (deadlineFilter === 'upcoming') {
          const hasUpcoming = dealDeadlines.some(dl => {
            const daysUntil = (new Date(dl.due_date).getTime() - now) / 86400000;
            return daysUntil >= 0 && daysUntil <= 7 && !dl.is_acknowledged;
          });
          if (!hasUpcoming) return false;
        } else if (deadlineFilter === 'none') {
          if (dealDeadlines.length > 0) return false;
        }
      }

      // Sync filter
      if (syncFilter !== 'all') {
        const status = syncStatuses[d.id];
        if (syncFilter === 'synced' && status !== 'synced') return false;
        if (syncFilter === 'error' && status !== 'error') return false;
        if (syncFilter === 'unlinked' && d.fub_person_id) return false;
      }

      return true;
    });
  }, [deals, dealTypeFilter, deadlineFilter, syncFilter, deadlinesByDeal, syncStatuses]);

  // Compute dimmed deal IDs from search query (dim = visible but faded)
  const dimmedDealIds = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    const dimmed = new Set<string>();
    filteredDeals.forEach(d => {
      const match =
        d.deal_name?.toLowerCase().includes(q) ||
        d.county?.toLowerCase().includes(q) ||
        d.state?.toLowerCase().includes(q);
      if (!match) dimmed.add(d.id);
    });
    return dimmed;
  }, [filteredDeals, searchQuery]);

  // Group filtered deals by stage
  const dealsByStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    PIPELINE_STAGES.forEach(s => { map[s] = []; });
    filteredDeals.forEach(d => {
      if (map[d.stage]) map[d.stage].push(d);
    });
    return map;
  }, [filteredDeals]);

  const activeCount = deals.filter(d => d.stage !== 'Cancelled').length;
  const hasActiveFilters = dealTypeFilter !== 'all' || deadlineFilter !== 'all' || syncFilter !== 'all';

  // Flat ordered deal IDs for keyboard navigation (stage by stage, top to bottom)
  const orderedDealIds = useMemo(() => {
    const ids: string[] = [];
    PIPELINE_STAGES.forEach(stage => {
      (dealsByStage[stage] || []).forEach(d => ids.push(d.id));
    });
    return ids;
  }, [dealsByStage]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    enabled: !selectedDealId && !stageDialog && !activeDealId, // disable when drawer/dialog/drag open
    dealIds: orderedDealIds,
    focusedDealId,
    onFocusChange: setFocusedDealId,
    onOpenDeal: (dealId) => { setSelectedDealId(dealId); setFocusedDealId(null); },
    onNewDeal: () => handleNewDeal(),
  });

  // ---- Drag Handlers ----

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDealId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDealId(null);
    const { active, over } = event;
    if (!over) return;

    const dealId = active.id as string;
    const newStage = over.id as string;
    const deal = deals.find(d => d.id === dealId);
    if (!deal || deal.stage === newStage) return;

    // Check for incomplete tasks
    try {
      const result = await checkStageChange(dealId, newStage);
      if (!result.canProceed && result.incompleteTasks && result.incompleteTasks.length > 0) {
        // Show confirmation dialog
        setStageDialog({
          dealId,
          dealName: deal.deal_name,
          fromStage: deal.stage,
          toStage: newStage,
          incompleteTasks: result.incompleteTasks,
        });
        return;
      }
      // No blockers — proceed directly
      await executeStageChange(dealId, newStage);
    } catch (err) {
      console.error('Stage change check failed:', err);
      showToast({ message: 'Failed to move deal', type: 'error' });
    }
  };

  const executeStageChange = async (dealId: string, newStage: string) => {
    // Capture deal name before async ops (deals array may be stale after fetchData)
    const dealName = deals.find(d => d.id === dealId)?.deal_name ?? 'Deal';
    try {
      // updateDealFields already seeds tasks for the new stage in the backend handler
      const result = await updateDealFields(dealId, { stage: newStage });
      await fetchData();

      // Build toast with FUB sync status
      let fubNote = '';
      if (result.fubPush?.queued) {
        fubNote = result.fubPush.success ? ' · FUB ✓' : ' · FUB pending';
      }
      showToast({ message: `${dealName} → ${newStage}${fubNote}`, type: 'success' });
    } catch (err) {
      console.error('Stage change failed:', err);
      showToast({ message: 'Failed to update stage', type: 'error' });
    }
  };

  const handleDialogConfirm = async () => {
    if (!stageDialog) return;
    await executeStageChange(stageDialog.dealId, stageDialog.toStage);
    setStageDialog(null);
  };

  // ---- Sync ----

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await triggerFubPersonSync();
      await fetchData();
      if (result.newDeals > 0 || result.updatedDeals > 0) {
        showToast({ message: `Synced: ${result.newDeals} new, ${result.updatedDeals} updated`, type: 'success' });
      } else {
        showToast({ message: 'No changes from FUB', type: 'success' });
      }
    } catch {
      await fetchData();
      showToast({ message: 'FUB sync failed', type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  // ---- New Deal ----

  const handleNewDeal = async (stage?: string) => {
    try {
      const newDeal = await insertDeal({
        deal_name: 'New Deal',
        deal_type: 'Standard Flip',
        stage: stage || 'Purchase Agreement Signed',
      });
      await fetchData();
      // Open the new deal in the drawer
      if (newDeal?.id) {
        setSelectedDealId(newDeal.id);
      }
      showToast({ message: 'Deal created', type: 'success' });
    } catch (err) {
      console.error('Create deal failed:', err);
      showToast({ message: 'Failed to create deal', type: 'error' });
    }
  };

  // ---- Quick Actions ----

  const handleQuickCompleteTask = async (taskId: string) => {
    try {
      await updateTaskWithLog(taskId, { status: 'Done' });
      await fetchData();
      showToast({ message: 'Task completed', type: 'success' });
    } catch (err) {
      console.error('Quick task complete failed:', err);
      showToast({ message: 'Failed to complete task', type: 'error' });
    }
  };

  const handleQuickAdvanceStage = async (dealId: string) => {
    const deal = deals.find(d => d.id === dealId);
    if (!deal) return;
    const currentIdx = PIPELINE_STAGES.indexOf(deal.stage as any);
    if (currentIdx < 0 || currentIdx >= PIPELINE_STAGES.length - 1) return;
    const nextStage = PIPELINE_STAGES[currentIdx + 1];

    try {
      const result = await checkStageChange(dealId, nextStage);
      if (!result.canProceed && result.incompleteTasks && result.incompleteTasks.length > 0) {
        setStageDialog({
          dealId,
          dealName: deal.deal_name,
          fromStage: deal.stage,
          toStage: nextStage,
          incompleteTasks: result.incompleteTasks,
        });
        return;
      }
      await executeStageChange(dealId, nextStage);
    } catch (err) {
      console.error('Quick advance failed:', err);
      showToast({ message: 'Failed to advance stage', type: 'error' });
    }
  };

  // ---- Active drag overlay data ----

  const activeDeal = activeDealId ? deals.find(d => d.id === activeDealId) : null;
  const activeDealTasks = activeDealId ? tasksByDeal[activeDealId] || [] : [];
  const activeDealDeadlines = activeDealId ? deadlinesByDeal[activeDealId] || [] : [];

  const getNextTask = (tasks: Task[]): Task | undefined =>
    tasks
      .filter(t => t.status === 'To Do' || t.status === 'In Progress')
      .sort((a, b) => (a.task_order ?? 999) - (b.task_order ?? 999))[0];

  const getNearestDeadline = (deadlines: Deadline[]): Deadline | undefined => {
    if (!deadlines.length) return undefined;
    const now = Date.now();
    return deadlines
      .filter(d => !d.is_acknowledged)
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .find(d => new Date(d.due_date).getTime() - now < 7 * 86400000);
  };

  // ---- Filter chip component ----

  const FilterChip: React.FC<{ label: string; isActive: boolean; onClick: () => void }> = ({
    label, isActive, onClick,
  }) => (
    <button
      onClick={onClick}
      className={cn(
        'text-caption px-2.5 py-1 rounded-md font-medium transition-colors',
        isActive
          ? 'bg-primary text-white'
          : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      )}
    >
      {label}
    </button>
  );

  // ---- Render ----

  return (
    <div className="h-full flex flex-col">
      {/* Stage Change Dialog */}
      <StageChangeDialog
        isOpen={!!stageDialog}
        dealName={stageDialog?.dealName ?? ''}
        fromStage={stageDialog?.fromStage ?? ''}
        toStage={stageDialog?.toStage ?? ''}
        incompleteTasks={stageDialog?.incompleteTasks ?? []}
        onConfirm={handleDialogConfirm}
        onCancel={() => setStageDialog(null)}
      />

      {/* TopBar */}
      <TopBar
        title="Pipeline"
        subtitle={`${activeCount} active deal${activeCount !== 1 ? 's' : ''}`}
        onSearchClick={openCommandPalette}
        actions={
          <div className="flex items-center gap-2">
            {/* Select mode toggle */}
            <button
              onClick={() => isSelectMode ? handleExitSelectMode() : setIsSelectMode(true)}
              className={cn(
                'p-1.5 rounded transition-colors',
                isSelectMode
                  ? 'bg-primary text-white'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              )}
              title={isSelectMode ? 'Exit select mode' : 'Select multiple deals'}
            >
              {isSelectMode ? <XSquare size={14} /> : <CheckSquare size={14} />}
            </button>

            {/* Compact / Expanded toggle */}
            <div className="flex items-center bg-subtle rounded-md p-0.5">
              <button
                onClick={() => setIsCompact(false)}
                className={cn(
                  'p-1.5 rounded transition-colors',
                  !isCompact ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-400 hover:text-gray-600'
                )}
                title="Expanded cards"
              >
                <LayoutGrid size={14} />
              </button>
              <button
                onClick={() => setIsCompact(true)}
                className={cn(
                  'p-1.5 rounded transition-colors',
                  isCompact ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-400 hover:text-gray-600'
                )}
                title="Compact cards"
              >
                <List size={14} />
              </button>
            </div>
            <Button
              variant={showFilters ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(hasActiveFilters && !showFilters && 'border-primary text-primary')}
            >
              <Filter size={14} className="mr-1.5" />
              Filters
              {hasActiveFilters && (
                <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-primary" />
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing}>
              <RefreshCw size={14} className={cn('mr-1.5', isSyncing && 'animate-spin')} />
              Sync
            </Button>
            <Button size="sm" onClick={() => handleNewDeal()}>
              <Plus size={14} className="mr-1.5" />
              New Deal
            </Button>
          </div>
        }
      />

      {/* Summary Bar */}
      <PipelineSummaryBar
        deals={deals}
        tasks={tasks}
        deadlines={deadlines}
        onFilterOverdue={() => { setDeadlineFilter('overdue'); setShowFilters(true); }}
        onFilterStale={() => { /* stale filter visual only — no dedicated filter yet */ }}
      />

      {/* Search + Filter Bar */}
      {showFilters && (
        <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-4 flex-wrap animate-fade-in">
          {/* Inline search */}
          <div className="relative min-w-[160px] max-w-[220px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search deals..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 text-caption bg-subtle border border-gray-200 rounded-md focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
            />
          </div>

          <div className="w-px h-6 bg-gray-200" />
          {/* Deal Type */}
          <div className="flex items-center gap-1.5">
            <span className="text-micro text-gray-400 font-medium uppercase tracking-wide">Type</span>
            <FilterChip label="All" isActive={dealTypeFilter === 'all'} onClick={() => setDealTypeFilter('all')} />
            {DEAL_TYPES.map(dt => (
              <FilterChip key={dt} label={dt} isActive={dealTypeFilter === dt} onClick={() => setDealTypeFilter(dt)} />
            ))}
          </div>

          <div className="w-px h-6 bg-gray-200" />

          {/* Deadline */}
          <div className="flex items-center gap-1.5">
            <span className="text-micro text-gray-400 font-medium uppercase tracking-wide">Deadline</span>
            <FilterChip label="All" isActive={deadlineFilter === 'all'} onClick={() => setDeadlineFilter('all')} />
            <FilterChip label="Overdue" isActive={deadlineFilter === 'overdue'} onClick={() => setDeadlineFilter('overdue')} />
            <FilterChip label="≤7 days" isActive={deadlineFilter === 'upcoming'} onClick={() => setDeadlineFilter('upcoming')} />
            <FilterChip label="None" isActive={deadlineFilter === 'none'} onClick={() => setDeadlineFilter('none')} />
          </div>

          <div className="w-px h-6 bg-gray-200" />

          {/* Sync */}
          <div className="flex items-center gap-1.5">
            <span className="text-micro text-gray-400 font-medium uppercase tracking-wide">FUB</span>
            <FilterChip label="All" isActive={syncFilter === 'all'} onClick={() => setSyncFilter('all')} />
            <FilterChip label="Synced" isActive={syncFilter === 'synced'} onClick={() => setSyncFilter('synced')} />
            <FilterChip label="Error" isActive={syncFilter === 'error'} onClick={() => setSyncFilter('error')} />
            <FilterChip label="Unlinked" isActive={syncFilter === 'unlinked'} onClick={() => setSyncFilter('unlinked')} />
          </div>

          {/* Clear all filters + Save */}
          {hasActiveFilters && (
            <>
              <div className="w-px h-6 bg-gray-200" />
              <button
                onClick={() => {
                  setDealTypeFilter('all');
                  setDeadlineFilter('all');
                  setSyncFilter('all');
                }}
                className="text-caption text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
              >
                <X size={12} />
                Clear
              </button>
              {!showSavePreset ? (
                <button
                  onClick={() => setShowSavePreset(true)}
                  className="text-caption text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Save filter
                </button>
              ) : (
                <div className="flex items-center gap-1.5 animate-fade-in">
                  <input
                    type="text"
                    autoFocus
                    placeholder="Preset name..."
                    value={presetName}
                    onChange={e => setPresetName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') savePreset();
                      if (e.key === 'Escape') { setShowSavePreset(false); setPresetName(''); }
                    }}
                    className="w-28 px-2 py-0.5 text-caption bg-white border border-gray-200 rounded-md focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                  />
                  <button
                    onClick={savePreset}
                    disabled={!presetName.trim()}
                    className="text-caption text-primary hover:text-primary/80 font-medium transition-colors disabled:opacity-40"
                  >
                    Save
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Saved Filter Presets */}
      {filterPresets.length > 0 && (
        <div className="px-5 py-2 border-b border-gray-200 bg-white flex items-center gap-2 flex-wrap">
          <span className="text-micro text-gray-400 font-medium uppercase tracking-wide mr-1">Saved:</span>
          {filterPresets.map((preset, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 group"
            >
              <button
                onClick={() => applyPreset(preset)}
                className={cn(
                  'text-caption font-medium px-2.5 py-1 rounded-md border transition-colors',
                  dealTypeFilter === preset.dealType && deadlineFilter === preset.deadline && syncFilter === preset.sync
                    ? 'bg-primary-light text-primary border-primary/30'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:text-gray-900'
                )}
              >
                {preset.name}
              </button>
              <button
                onClick={() => deletePreset(i)}
                className="hidden group-hover:inline-flex text-gray-400 hover:text-red-500 transition-colors p-0.5"
                title="Delete preset"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="kanban-scroll flex-1 items-start p-4">
            {PIPELINE_STAGES.map(s => (
              <SkeletonColumn key={s} />
            ))}
          </div>
        ) : !isLoading && deals.filter(d => d.stage !== 'Cancelled').length === 0 ? (
          <OnboardingEmptyState
            onGoToSettings={() => navigate('/settings')}
            onSyncNow={handleSync}
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="kanban-scroll flex-1 items-start p-4">
              {PIPELINE_STAGES.map(stage => (
                <KanbanColumn
                  key={stage}
                  stage={stage}
                  deals={dealsByStage[stage] || []}
                  tasksByDeal={tasksByDeal}
                  deadlinesByDeal={deadlinesByDeal}
                  syncStatusByDeal={syncStatuses}
                  onCardClick={(dealId) => setSelectedDealId(dealId)}
                  onNewDeal={(s) => handleNewDeal(s)}
                  focusedDealId={focusedDealId}
                  compact={isCompact}
                  dimmedDealIds={dimmedDealIds}
                  onCompleteTask={handleQuickCompleteTask}
                  onAdvanceStage={handleQuickAdvanceStage}
                  isSelectMode={isSelectMode}
                  selectedDealIds={selectedDealIds}
                  onToggleSelect={handleToggleSelect}
                />
              ))}
            </div>

            {/* Drag Overlay — rendered outside columns for smooth animation */}
            <DragOverlay dropAnimation={null}>
              {activeDeal && (
                <div className="w-[260px] rotate-2 opacity-90 shadow-md">
                  <KanbanCard
                    deal={activeDeal}
                    nextTask={getNextTask(activeDealTasks)}
                    nearestDeadline={getNearestDeadline(activeDealDeadlines)}
                    syncStatus={syncStatuses[activeDeal.id] ?? null}
                    onClick={() => {}}
                  />
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Deal Drawer */}
      <DealDrawer
        dealId={selectedDealId}
        onClose={() => setSelectedDealId(null)}
        onDealUpdate={fetchData}
      />

      {/* Batch Action Bar */}
      {isSelectMode && selectedDealIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-gray-900 text-white rounded-xl shadow-lg px-5 py-3 flex items-center gap-4">
            <span className="text-caption font-semibold">
              {selectedDealIds.size} selected
            </span>
            <div className="w-px h-5 bg-gray-700" />
            <div className="flex items-center gap-1.5">
              <span className="text-micro text-gray-400 mr-1">Move to:</span>
              <select
                className="bg-gray-800 text-white text-caption rounded-md px-2 py-1 border border-gray-700 cursor-pointer outline-none focus:ring-2 focus:ring-primary/50"
                defaultValue=""
                onChange={e => { if (e.target.value) handleBatchStageChange(e.target.value); e.target.value = ''; }}
              >
                <option value="" disabled>Stage...</option>
                {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-micro text-gray-400 mr-1">Type:</span>
              <select
                className="bg-gray-800 text-white text-caption rounded-md px-2 py-1 border border-gray-700 cursor-pointer outline-none focus:ring-2 focus:ring-primary/50"
                defaultValue=""
                onChange={e => { if (e.target.value) handleBatchTypeChange(e.target.value); e.target.value = ''; }}
              >
                <option value="" disabled>Type...</option>
                {DEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="w-px h-5 bg-gray-700" />
            <button
              onClick={handleBatchCancel}
              className="text-caption font-medium text-red-400 hover:text-red-300 transition-colors"
            >
              Cancel Deals
            </button>
            <button
              onClick={handleExitSelectMode}
              className="text-caption font-medium text-gray-400 hover:text-white transition-colors ml-1"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
