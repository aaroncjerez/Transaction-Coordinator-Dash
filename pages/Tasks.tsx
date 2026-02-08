import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  fetchAllDeals, fetchAllTasks, insertTask, updateTaskFields,
} from '../lib/database';
import { Deal, Task } from '../types';
import {
  Plus, CheckCircle2, Clock, Loader2, ChevronRight, Search,
  ListFilter, LayoutList, Layers, Check,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';
import { TopBar } from '../components/TopBar';
import { TaskDetailPanel } from '../components/TaskDetailPanel';
import { DealDrawer } from '../components/DealDrawer';
import { EmptyState } from '../components/ui/EmptyState';
import { getStageColor, PIPELINE_STAGES, STAGE_ORDER } from '../constants';
import { useOpenCommandPalette } from '../components/Layout';
import type { DealStage } from '../types';

type StatusFilter = 'all' | 'To Do' | 'In Progress' | 'Done';
type ViewMode = 'by-deal' | 'by-stage' | 'all';

export const Tasks: React.FC = () => {
  const openCommandPalette = useOpenCommandPalette();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState<string | null>(null);
  const [newTaskName, setNewTaskName] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  // Filters & view
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('by-deal');

  // Panels
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [dealsData, tasksData] = await Promise.all([
        fetchAllDeals(),
        fetchAllTasks(),
      ]);
      setDeals((dealsData || []) as Deal[]);
      setTasks((tasksData || []) as Task[]);

      // Auto-expand sections with pending tasks
      const expanded = new Set<string>();
      (dealsData || []).forEach((d: any) => {
        const hasPending = (tasksData || []).some((t: any) => t.deal_id === d.id && t.status !== 'Done');
        if (hasPending) expanded.add(d.id);
      });
      // Also expand stages with pending tasks
      PIPELINE_STAGES.forEach(stage => {
        const hasPending = (tasksData || []).some((t: any) => {
          const deal = (dealsData || []).find((d: any) => d.id === t.deal_id);
          return deal && deal.stage === stage && t.status !== 'Done';
        });
        if (hasPending) expanded.add(`stage-${stage}`);
      });
      setExpandedSections(expanded);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateTask = async (e: React.FormEvent, dealId?: string) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    try {
      await insertTask({ title: newTaskName, status: 'To Do', ...(dealId ? { deal_id: dealId } : {}) });
      setNewTaskName('');
      setIsCreating(null);
      const data = await fetchAllTasks();
      setTasks((data || []) as Task[]);
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  const toggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === 'Done' ? 'To Do' : 'Done';
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } as Task : t));
    try {
      await updateTaskFields(task.id, { status: newStatus });
    } catch (error) {
      console.error('Error updating task:', error);
      fetchData();
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ---- Filtered tasks ----
  const filteredTasks = useMemo(() => {
    let filtered = [...tasks];
    if (statusFilter !== 'all') {
      filtered = filtered.filter(t => t.status === statusFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(t => t.title.toLowerCase().includes(q));
    }
    return filtered;
  }, [tasks, statusFilter, searchQuery]);

  // Group by deal for "by-deal" view
  const dealsMap = useMemo(() => {
    const map = new Map<string, Deal>();
    deals.forEach(d => map.set(d.id, d));
    return map;
  }, [deals]);

  // Counts
  const pendingCount = tasks.filter(t => t.status !== 'Done').length;
  const doneCount = tasks.filter(t => t.status === 'Done').length;

  // ---- Status filter chip ----
  const FilterChip: React.FC<{ label: string; isActive: boolean; onClick: () => void; count?: number }> = ({
    label, isActive, onClick, count,
  }) => (
    <button
      onClick={onClick}
      className={cn(
        'text-caption px-2.5 py-1 rounded-md font-medium transition-colors flex items-center gap-1.5',
        isActive
          ? 'bg-primary text-white'
          : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      )}
    >
      {label}
      {count !== undefined && (
        <span className={cn(
          'text-micro px-1 rounded',
          isActive ? 'bg-white/20' : 'bg-gray-100 text-gray-400'
        )}>
          {count}
        </span>
      )}
    </button>
  );

  // ---- Task Row ----
  const TaskRow: React.FC<{ task: Task; showDealName?: boolean }> = ({ task, showDealName }) => {
    const deal = task.deal_id ? dealsMap.get(task.deal_id) : undefined;
    return (
      <div
        className="px-4 py-2.5 flex items-center gap-3 hover:bg-subtle transition-colors cursor-pointer group"
        onClick={() => setSelectedTaskId(task.id)}
      >
        <button
          onClick={(e) => { e.stopPropagation(); toggleTaskStatus(task); }}
          className={cn(
            'flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all',
            task.status === 'Done'
              ? 'bg-emerald-500 border-emerald-500'
              : task.status === 'In Progress'
              ? 'border-primary bg-primary/10'
              : 'border-gray-300 hover:border-primary'
          )}
        >
          {task.status === 'Done' && <Check size={9} className="text-white" />}
        </button>
        <span className={cn(
          'flex-1 text-sm font-medium transition-colors truncate',
          task.status === 'Done' ? 'text-gray-400 line-through' : 'text-gray-700'
        )}>
          {task.title}
        </span>
        {showDealName && deal && (
          <button
            onClick={(e) => { e.stopPropagation(); setSelectedDealId(deal.id); }}
            className="text-micro text-gray-400 hover:text-primary transition-colors flex-shrink-0"
          >
            {deal.deal_name}
          </button>
        )}
        {task.status !== 'Done' && task.status !== 'In Progress' && (
          <span className="text-micro text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {task.status}
          </span>
        )}
        {task.status === 'In Progress' && (
          <span className="text-micro text-primary bg-primary-light px-1.5 py-0.5 rounded flex-shrink-0">
            In Progress
          </span>
        )}
      </div>
    );
  };

  // ---- Render views ----

  const renderByDeal = () => {
    const dealGroups = deals
      .map(deal => ({
        deal,
        tasks: filteredTasks.filter(t => t.deal_id === deal.id),
      }))
      .filter(g => g.tasks.length > 0)
      .sort((a, b) => {
        // Sort by stage progression
        const stageA = STAGE_ORDER[a.deal.stage as DealStage] ?? 99;
        const stageB = STAGE_ORDER[b.deal.stage as DealStage] ?? 99;
        if (stageA !== stageB) return stageA - stageB;
        // Then by pending task count (more pending = higher)
        const pendingA = a.tasks.filter(t => t.status !== 'Done').length;
        const pendingB = b.tasks.filter(t => t.status !== 'Done').length;
        return pendingB - pendingA;
      });

    const unassigned = filteredTasks.filter(t => !t.deal_id || !dealsMap.has(t.deal_id));

    if (dealGroups.length === 0 && unassigned.length === 0) {
      return (
        <EmptyState
          icon={<CheckCircle2 size={24} />}
          title="No matching tasks"
          description={searchQuery ? `No tasks match "${searchQuery}"` : 'All caught up!'}
          className="py-16"
        />
      );
    }

    return (
      <div className="space-y-3">
        {unassigned.length > 0 && (
          <DealSection
            title="General Tasks"
            subtitle={`${unassigned.filter(t => t.status !== 'Done').length} pending`}
            isExpanded={expandedSections.has('unassigned')}
            onToggle={() => toggleSection('unassigned')}
            tasks={unassigned}
            TaskRow={TaskRow}
          />
        )}
        {dealGroups.map(({ deal, tasks: dealTasks }) => {
          const sc = getStageColor(deal.stage);
          const pending = dealTasks.filter(t => t.status !== 'Done').length;
          return (
            <DealSection
              key={deal.id}
              title={deal.deal_name}
              subtitle={`${pending} pending`}
              stageBadge={{ label: deal.stage, light: sc.light, lightText: sc.lightText }}
              isExpanded={expandedSections.has(deal.id)}
              onToggle={() => toggleSection(deal.id)}
              onOpenDeal={() => setSelectedDealId(deal.id)}
              tasks={dealTasks}
              dealId={deal.id}
              isCreating={isCreating}
              onStartCreate={() => { setIsCreating(deal.id); setExpandedSections(prev => new Set(prev).add(deal.id)); }}
              onCreateTask={handleCreateTask}
              newTaskName={newTaskName}
              setNewTaskName={setNewTaskName}
              onCancelCreate={() => setIsCreating(null)}
              TaskRow={TaskRow}
            />
          );
        })}
      </div>
    );
  };

  const renderByStage = () => {
    const stageGroups = PIPELINE_STAGES.map(stage => {
      const stageDeals = deals.filter(d => d.stage === stage);
      const stageTasks = filteredTasks.filter(t => {
        const deal = dealsMap.get(t.deal_id);
        return deal && deal.stage === stage;
      });
      return { stage, tasks: stageTasks, dealCount: stageDeals.length };
    }).filter(g => g.tasks.length > 0);

    if (stageGroups.length === 0) {
      return (
        <EmptyState
          icon={<CheckCircle2 size={24} />}
          title="No matching tasks"
          description={searchQuery ? `No tasks match "${searchQuery}"` : 'All caught up!'}
          className="py-16"
        />
      );
    }

    return (
      <div className="space-y-3">
        {stageGroups.map(({ stage, tasks: stageTasks }) => {
          const sc = getStageColor(stage);
          const pending = stageTasks.filter(t => t.status !== 'Done').length;
          return (
            <div key={stage} className="bg-white rounded-card border border-gray-200 overflow-hidden">
              <button
                onClick={() => toggleSection(`stage-${stage}`)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-subtle transition-colors"
              >
                <ChevronRight
                  size={14}
                  className={cn('text-gray-400 transition-transform', expandedSections.has(`stage-${stage}`) && 'rotate-90')}
                />
                <span className={cn('w-1.5 h-1.5 rounded-full', sc.bg)} />
                <span className="text-sm font-semibold text-gray-800 flex-1 text-left">{stage}</span>
                <span className="text-micro text-gray-400">{pending} pending</span>
                <span className="text-micro text-gray-300">{stageTasks.length} total</span>
              </button>
              {expandedSections.has(`stage-${stage}`) && (
                <div className="border-t border-gray-100">
                  {stageTasks.map(task => (
                    <TaskRow key={task.id} task={task} showDealName />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderAll = () => {
    // Flat sorted list: In Progress first, then To Do, then Done
    const statusOrder: Record<string, number> = { 'In Progress': 0, 'To Do': 1, 'Done': 2 };
    const sorted = [...filteredTasks].sort((a, b) =>
      (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99)
    );

    if (sorted.length === 0) {
      return (
        <EmptyState
          icon={<CheckCircle2 size={24} />}
          title="No matching tasks"
          description={searchQuery ? `No tasks match "${searchQuery}"` : 'All caught up!'}
          className="py-16"
        />
      );
    }

    return (
      <div className="bg-white rounded-card border border-gray-200 overflow-hidden divide-y divide-gray-100">
        {sorted.map(task => (
          <TaskRow key={task.id} task={task} showDealName />
        ))}
      </div>
    );
  };

  // ---- View toggle buttons ----
  const viewModes: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: 'by-deal', label: 'By Deal', icon: <LayoutList size={14} /> },
    { id: 'by-stage', label: 'By Stage', icon: <Layers size={14} /> },
    { id: 'all', label: 'All', icon: <ListFilter size={14} /> },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* TopBar */}
      <TopBar
        title="Tasks"
        subtitle={`${pendingCount} pending · ${doneCount} done`}
        onSearchClick={openCommandPalette}
        actions={
          <div className="flex items-center gap-1 bg-subtle rounded-md p-0.5">
            {viewModes.map(vm => (
              <button
                key={vm.id}
                onClick={() => setViewMode(vm.id)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 text-caption font-medium rounded transition-colors',
                  viewMode === vm.id
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-700'
                )}
              >
                {vm.icon}
                {vm.label}
              </button>
            ))}
          </div>
        }
      />

      {/* Filter Bar */}
      <div className="px-5 py-3 border-b border-gray-200 bg-white flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-[320px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Filter tasks..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-caption bg-subtle border border-gray-200 rounded-md focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
          />
        </div>

        <div className="w-px h-6 bg-gray-200" />

        {/* Status chips */}
        <FilterChip label="All" isActive={statusFilter === 'all'} onClick={() => setStatusFilter('all')} count={tasks.length} />
        <FilterChip label="To Do" isActive={statusFilter === 'To Do'} onClick={() => setStatusFilter('To Do')} count={tasks.filter(t => t.status === 'To Do').length} />
        <FilterChip label="In Progress" isActive={statusFilter === 'In Progress'} onClick={() => setStatusFilter('In Progress')} count={tasks.filter(t => t.status === 'In Progress').length} />
        <FilterChip label="Done" isActive={statusFilter === 'Done'} onClick={() => setStatusFilter('Done')} count={doneCount} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-4xl mx-auto px-5 py-5">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {viewMode === 'by-deal' && renderByDeal()}
              {viewMode === 'by-stage' && renderByStage()}
              {viewMode === 'all' && renderAll()}
            </>
          )}
        </div>
      </div>

      {/* Task Detail Panel */}
      <TaskDetailPanel
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        onUpdate={fetchData}
      />

      {/* Deal Drawer */}
      <DealDrawer
        dealId={selectedDealId}
        onClose={() => setSelectedDealId(null)}
        onDealUpdate={fetchData}
      />
    </div>
  );
};

// ---- Deal Section Component ----

interface DealSectionProps {
  title: string;
  subtitle: string;
  stageBadge?: { label: string; light: string; lightText: string };
  isExpanded: boolean;
  onToggle: () => void;
  onOpenDeal?: () => void;
  tasks: Task[];
  dealId?: string;
  isCreating?: string | null;
  onStartCreate?: () => void;
  onCreateTask?: (e: React.FormEvent, dealId?: string) => void;
  newTaskName?: string;
  setNewTaskName?: (v: string) => void;
  onCancelCreate?: () => void;
  TaskRow: React.FC<{ task: Task; showDealName?: boolean }>;
}

const DealSection: React.FC<DealSectionProps> = ({
  title, subtitle, stageBadge, isExpanded, onToggle, onOpenDeal,
  tasks, dealId, isCreating, onStartCreate, onCreateTask, newTaskName, setNewTaskName, onCancelCreate,
  TaskRow,
}) => (
  <div className="bg-white rounded-card border border-gray-200 overflow-hidden">
    <div className="px-4 py-3 flex items-center gap-3 hover:bg-subtle transition-colors">
      <button onClick={onToggle} className="flex items-center gap-2 flex-1 min-w-0">
        <ChevronRight
          size={14}
          className={cn('text-gray-400 transition-transform flex-shrink-0', isExpanded && 'rotate-90')}
        />
        <span className="text-sm font-semibold text-gray-800 truncate">{title}</span>
        {stageBadge && (
          <span className={cn('text-micro font-medium px-1.5 py-0.5 rounded flex-shrink-0', stageBadge.light, stageBadge.lightText)}>
            {stageBadge.label}
          </span>
        )}
        <span className="text-micro text-gray-400 flex-shrink-0">{subtitle}</span>
      </button>
      <div className="flex items-center gap-2 flex-shrink-0">
        {onOpenDeal && (
          <button
            onClick={onOpenDeal}
            className="text-micro text-gray-400 hover:text-primary transition-colors"
          >
            Open deal
          </button>
        )}
        {onStartCreate && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onStartCreate}
            className="opacity-0 group-hover:opacity-100 transition-opacity h-7"
          >
            <Plus size={12} className="mr-1" /> Add
          </Button>
        )}
      </div>
    </div>
    {isExpanded && (
      <div className="border-t border-gray-100">
        {isCreating === dealId && onCreateTask && (
          <div className="px-4 py-3 border-b border-gray-100 bg-subtle">
            <form onSubmit={(e) => onCreateTask(e, dealId)} className="flex gap-2">
              <input
                autoFocus
                className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-sm bg-white focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none"
                value={newTaskName}
                onChange={e => setNewTaskName?.(e.target.value)}
                placeholder={`Add task...`}
              />
              <Button size="sm" type="submit">Add</Button>
              <Button size="sm" variant="ghost" type="button" onClick={onCancelCreate}>Cancel</Button>
            </form>
          </div>
        )}
        {tasks.length === 0 ? (
          <div className="px-4 py-6 text-center text-caption text-gray-400 italic">
            No matching tasks
          </div>
        ) : (
          tasks.map(task => <TaskRow key={task.id} task={task} />)
        )}
      </div>
    )}
  </div>
);
