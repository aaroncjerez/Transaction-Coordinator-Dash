import React, { useState } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { ChevronDown, ChevronRight, Plus, AlertTriangle } from 'lucide-react';
import { Deal, Task, Deadline, FubSyncStatus } from '../types';
import { getStageColor } from '../constants';
import { cn } from '../lib/utils';
import { KanbanCard } from './KanbanCard';
import { EmptyState } from './ui/EmptyState';

interface KanbanColumnProps {
  stage: string;
  deals: Deal[];
  tasksByDeal: Record<string, Task[]>;
  deadlinesByDeal: Record<string, Deadline[]>;
  syncStatusByDeal: Record<string, FubSyncStatus | null>;
  onCardClick: (dealId: string) => void;
  onNewDeal?: (stage: string) => void;
  focusedDealId?: string | null;
  compact?: boolean;
  dimmedDealIds?: Set<string>;
  isSelectMode?: boolean;
  selectedDealIds?: Set<string>;
  onToggleSelect?: (dealId: string) => void;
}

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

// ---- Draggable Card Wrapper ----

interface DraggableCardWrapperProps {
  deal: Deal;
  nextTask?: Task;
  nearestDeadline?: Deadline;
  syncStatus: FubSyncStatus | null;
  onClick: () => void;
  isFocused?: boolean;
  compact?: boolean;
  isDimmed?: boolean;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (dealId: string) => void;
}

const DraggableCardWrapper: React.FC<DraggableCardWrapperProps> = ({
  deal, nextTask, nearestDeadline, syncStatus, onClick, isFocused, compact, isDimmed,
  isSelectMode, isSelected, onToggleSelect,
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
    data: { deal },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'cursor-grab active:cursor-grabbing touch-none',
        isDragging && 'opacity-30'
      )}
    >
      <KanbanCard
        deal={deal}
        nextTask={nextTask}
        nearestDeadline={nearestDeadline}
        syncStatus={syncStatus}
        onClick={onClick}
        isFocused={isFocused}
        compact={compact}
        isDimmed={isDimmed}
        isSelectMode={isSelectMode}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
      />
    </div>
  );
};

// ---- KanbanColumn ----

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  stage,
  deals,
  tasksByDeal,
  deadlinesByDeal,
  syncStatusByDeal,
  onCardClick,
  onNewDeal,
  focusedDealId,
  compact,
  dimmedDealIds,
  isSelectMode,
  selectedDealIds,
  onToggleSelect,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sc = getStageColor(stage);
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  // Count stale deals (>14 days in stage)
  const staleCount = deals.filter(d => {
    if (!d.updated_at) return false;
    return (Date.now() - new Date(d.updated_at).getTime()) > 14 * 86400000;
  }).length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'w-[280px] flex-shrink-0 flex flex-col max-h-full transition-colors duration-150',
        isOver && 'ring-2 ring-primary/30 ring-offset-2 ring-offset-background rounded-card'
      )}
    >
      {/* Column Header — thin colored top border, white bg */}
      <div className={cn('border-t-2 bg-white rounded-t-card border border-gray-200 px-3 py-2.5', sc.topBorder)}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label={isCollapsed ? `Expand ${stage}` : `Collapse ${stage}`}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>

          <h2 className="text-caption font-semibold text-gray-700 truncate flex-1">
            {stage}
          </h2>

          {/* Stale indicator */}
          {staleCount > 0 && !isCollapsed && (
            <span className="flex items-center gap-0.5 text-micro text-amber-600" title={`${staleCount} deal${staleCount > 1 ? 's' : ''} idle >14d`}>
              <AlertTriangle size={10} />
              {staleCount}
            </span>
          )}

          {/* Deal count badge */}
          <span className={cn(
            'text-micro font-bold min-w-[1.25rem] text-center rounded-full px-1.5 py-0.5',
            deals.length > 0
              ? cn(sc.light, sc.lightText)
              : 'bg-gray-100 text-gray-400'
          )}>
            {deals.length}
          </span>
        </div>
      </div>

      {/* Card List */}
      {!isCollapsed && (
        <div
          className={cn(
            'flex-1 overflow-y-auto scrollbar-thin rounded-b-card border border-t-0 border-gray-200 p-2 space-y-2',
            isOver ? 'bg-primary-light/50' : 'bg-subtle'
          )}
          role="region"
          aria-label={`${stage} deals`}
        >
          {deals.length === 0 ? (
            <EmptyState
              icon={<Plus size={20} />}
              title="No deals"
              description="Drag a deal here or create one"
              action={
                onNewDeal ? (
                  <button
                    onClick={() => onNewDeal(stage)}
                    className="text-caption text-primary hover:text-primary/80 font-medium transition-colors"
                  >
                    + Add deal
                  </button>
                ) : undefined
              }
              className="py-6"
            />
          ) : (
            deals.map(deal => {
              const tasks = tasksByDeal[deal.id] || [];
              const deadlines = deadlinesByDeal[deal.id] || [];
              return (
                <DraggableCardWrapper
                  key={deal.id}
                  deal={deal}
                  nextTask={getNextTask(tasks)}
                  nearestDeadline={getNearestDeadline(deadlines)}
                  syncStatus={syncStatusByDeal[deal.id] ?? null}
                  onClick={() => onCardClick(deal.id)}
                  isFocused={focusedDealId === deal.id}
                  compact={compact}
                  isDimmed={dimmedDealIds?.has(deal.id)}
                  isSelectMode={isSelectMode}
                  isSelected={selectedDealIds?.has(deal.id)}
                  onToggleSelect={onToggleSelect}
                />
              );
            })
          )}
        </div>
      )}

      {/* Collapsed placeholder */}
      {isCollapsed && (
        <div className="bg-subtle rounded-b-card border border-t-0 border-gray-200 px-3 py-2 text-center">
          <span className="text-micro text-gray-400">
            {deals.length} deal{deals.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
};
