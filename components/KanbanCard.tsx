import React, { useRef, useEffect } from 'react';
import { Circle, CheckCircle2, Clock, DollarSign, AlertTriangle, ArrowRight, ChevronRight } from 'lucide-react';
import { Deal, Task, Deadline, FubSyncStatus } from '../types';
import { getStageColor } from '../constants';
import { cn } from '../lib/utils';

interface KanbanCardProps {
  deal: Deal;
  nextTask?: Task;
  nearestDeadline?: Deadline;
  syncStatus?: FubSyncStatus | null;
  onClick: () => void;
  isFocused?: boolean;
  compact?: boolean;
  isDimmed?: boolean;
  onCompleteTask?: (taskId: string) => void;
  onAdvanceStage?: (dealId: string) => void;
  isSelectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (dealId: string) => void;
}

const formatPrice = (price: number): string => {
  if (price == null || price === 0) return '—';
  if (price >= 1000000) return `$${(price / 1000000).toFixed(1)}M`;
  if (price >= 1000) return `$${(price / 1000).toFixed(0)}K`;
  return `$${price.toLocaleString()}`;
};

const formatProfit = (purchase: number, sale: number): string | null => {
  if (purchase == null || sale == null || sale <= purchase) return null;
  const profit = sale - purchase;
  if (profit <= 0) return null;
  return formatPrice(profit);
};

const getDeadlineBadge = (deadline: Deadline): { label: string; color: string } | null => {
  const daysUntil = Math.ceil((new Date(deadline.due_date).getTime() - Date.now()) / 86400000);
  if (daysUntil > 7) return null;
  const label = `${deadline.label} ${daysUntil <= 0 ? 'overdue' : `${daysUntil}d`}`;
  const color = daysUntil <= 1 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200';
  return { label, color };
};

const getSyncDot = (status: FubSyncStatus | null | undefined, hasFub: boolean): { color: string; title: string } => {
  // Show error/mismatch even if fub_person_id is missing (edge case: sync record exists but link cleared)
  if (status === 'error') return { color: 'bg-red-500', title: 'Sync error' };
  if (status === 'mismatch') return { color: 'bg-amber-500', title: 'Mismatch' };
  if (!hasFub) return { color: 'bg-gray-300', title: 'No FUB link' };
  switch (status) {
    case 'synced': return { color: 'bg-emerald-500', title: 'Synced' };
    case 'syncing': case 'pending': return { color: 'bg-amber-500', title: 'Syncing...' };
    default: return { color: 'bg-gray-400', title: 'Pending' };
  }
};

export const KanbanCard: React.FC<KanbanCardProps> = ({
  deal, nextTask, nearestDeadline, syncStatus, onClick, isFocused, compact, isDimmed,
  onCompleteTask, onAdvanceStage, isSelectMode, isSelected, onToggleSelect,
}) => {
  const cardRef = useRef<HTMLButtonElement>(null);

  // Scroll focused card into view
  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      cardRef.current.focus();
    }
  }, [isFocused]);

  const sc = getStageColor(deal.stage);
  const closeDate = deal.close_date && deal.close_date !== 'TBD' ? deal.close_date : null;
  const daysSinceClose = closeDate
    ? Math.floor((Date.now() - new Date(closeDate).getTime()) / 86400000)
    : null;
  const profit = formatProfit(deal.purchase_price, deal.expected_sales_price);
  const deadlineBadge = nearestDeadline ? getDeadlineBadge(nearestDeadline) : null;
  const syncDot = getSyncDot(syncStatus, !!deal.fub_person_id);

  // Compact urgency: pick the single most urgent signal to show
  const compactUrgency = (() => {
    if (!compact) return null;
    if (deadlineBadge) return { type: 'deadline' as const, ...deadlineBadge };
    if (nextTask) return { type: 'task' as const, label: nextTask.title };
    if (daysSinceClose !== null && daysSinceClose > 14) return { type: 'stale' as const, label: `${daysSinceClose}d idle` };
    return null;
  })();

  const handleClick = () => {
    if (isSelectMode && onToggleSelect) {
      onToggleSelect(deal.id);
    } else {
      onClick();
    }
  };

  return (
    <button
      ref={cardRef}
      onClick={handleClick}
      className={cn(
        'w-full text-left bg-white rounded-card border shadow-xs',
        'hover:shadow-sm transition-all duration-150 p-3 group',
        'focus-visible:outline-none focus-visible:shadow-focus',
        isFocused && 'shadow-focus border-primary/30',
        isDimmed && 'opacity-40',
        isSelected
          ? 'border-primary bg-primary-light/30'
          : 'border-gray-200 hover:border-gray-300',
      )}
    >
      {/* Row 1: Name + sync dot + quick actions on hover */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isSelectMode && (
            <span className={cn(
              'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
              isSelected
                ? 'bg-primary border-primary'
                : 'border-gray-300 group-hover:border-gray-400'
            )}>
              {isSelected && (
                <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white fill-current">
                  <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          )}
          <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-primary transition-colors leading-5">
            {deal.deal_name}
          </h3>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Quick actions — visible on hover only */}
          {(onCompleteTask || onAdvanceStage) && (
            <div className="hidden group-hover:flex items-center gap-0.5 mr-1">
              {nextTask && onCompleteTask && (
                <button
                  onClick={e => { e.stopPropagation(); onCompleteTask(nextTask.id); }}
                  className="p-1 rounded hover:bg-emerald-50 text-gray-400 hover:text-emerald-600 transition-colors"
                  title={`Complete: ${nextTask.title}`}
                >
                  <CheckCircle2 size={14} />
                </button>
              )}
              {onAdvanceStage && deal.stage !== 'Sold' && deal.stage !== 'Cancelled' && (
                <button
                  onClick={e => { e.stopPropagation(); onAdvanceStage(deal.id); }}
                  className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                  title="Advance to next stage"
                >
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          )}
          <span className={cn('w-2 h-2 rounded-full mt-1.5', syncDot.color)} title={syncDot.title} />
        </div>
      </div>

      {/* Row 2: Deal type chip + compact urgency OR full subtitle */}
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className="text-micro font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
          {deal.deal_type}
        </span>
        {compact && compactUrgency?.type === 'deadline' && (
          <span className={cn('text-micro font-medium px-1.5 py-0.5 rounded border', compactUrgency.color)}>
            <AlertTriangle className="inline h-2.5 w-2.5 mr-0.5 -mt-px" />
            {compactUrgency.label}
          </span>
        )}
        {compact && compactUrgency?.type === 'task' && (
          <span className="text-micro text-gray-500 truncate flex-1">
            <Circle className="inline h-2.5 w-2.5 text-amber-400 mr-0.5 -mt-px" />
            {compactUrgency.label}
          </span>
        )}
        {compact && compactUrgency?.type === 'stale' && (
          <span className="text-micro text-amber-600 font-medium">
            <Clock className="inline h-2.5 w-2.5 mr-0.5 -mt-px" />
            {compactUrgency.label}
          </span>
        )}
        {!compact && daysSinceClose !== null && (
          <span className={cn('text-micro font-semibold px-1.5 py-0.5 rounded', sc.light, sc.lightText)}>
            <Clock className="inline h-2.5 w-2.5 mr-0.5 -mt-px" />
            {daysSinceClose}d
          </span>
        )}
      </div>

      {/* Expanded-only rows */}
      {!compact && (
        <>
          {/* Subtitle */}
          {(deal.county || deal.state) && (
            <p className="text-caption text-gray-500 truncate mt-1">
              {[deal.county, deal.state].filter(Boolean).join(', ')}
            </p>
          )}

          {/* Next task */}
          <div className="mt-2 flex items-start gap-1.5">
            {nextTask ? (
              <>
                <Circle className="h-3 w-3 text-amber-400 mt-0.5 flex-shrink-0" />
                <span className="text-caption text-gray-600 line-clamp-1">{nextTask.title}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                <span className="text-caption text-emerald-600 font-medium">All tasks done</span>
              </>
            )}
          </div>

          {/* Money line */}
          <div className="mt-2 flex items-center gap-1 text-caption text-gray-500">
            <DollarSign className="h-3 w-3 flex-shrink-0" />
            <span>{formatPrice(deal.purchase_price)}</span>
            {profit && (
              <>
                <ArrowRight className="h-2.5 w-2.5 text-gray-300" />
                <span className="text-emerald-600 font-medium">{profit} profit</span>
              </>
            )}
          </div>

          {/* Deadline badge */}
          {deadlineBadge && (
            <div className={cn('mt-2 inline-flex items-center gap-1 text-micro font-medium px-1.5 py-0.5 rounded border', deadlineBadge.color)}>
              <AlertTriangle className="h-2.5 w-2.5" />
              {deadlineBadge.label}
            </div>
          )}
        </>
      )}
    </button>
  );
};
