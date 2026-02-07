import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, DollarSign, Clock, CheckCircle2, Circle } from 'lucide-react';
import { Deal, Task } from '../types';
import { PIPELINE_STAGES, getStageColor } from '../constants';
import { cn } from '../lib/utils';
import { fetchAllDeals, fetchAllTasks, triggerFubPersonSync, onFubPersonSyncComplete } from '../lib/database';
import { Button } from '../components/ui/Button';

// ---- Kanban Card ----

interface KanbanCardProps {
  deal: Deal;
  nextTask?: Task;
  onClick: () => void;
}

const KanbanCard: React.FC<KanbanCardProps> = ({ deal, nextTask, onClick }) => {
  const stageColor = getStageColor(deal.stage);
  const daysInStage = deal.updated_at
    ? Math.floor((Date.now() - new Date(deal.updated_at).getTime()) / 86400000)
    : 0;

  const formatPrice = (price: number) => {
    if (!price) return '—';
    if (price >= 1000000) return `$${(price / 1000000).toFixed(1)}M`;
    if (price >= 1000) return `$${(price / 1000).toFixed(0)}K`;
    return `$${price.toLocaleString()}`;
  };

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-lg shadow-kanban hover:shadow-card-hover transition-all duration-200 p-3.5 group border border-gray-100 hover:border-gray-200"
    >
      {/* Deal name */}
      <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
        {deal.deal_name}
      </h3>

      {/* Deal type badge */}
      <span className="inline-block mt-1 text-[10px] font-medium text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
        {deal.deal_type}
      </span>

      {/* Next task */}
      <div className="mt-2.5 flex items-start gap-1.5">
        {nextTask ? (
          <>
            <Circle className="h-3 w-3 text-orange-400 mt-0.5 flex-shrink-0" />
            <span className="text-xs text-gray-600 line-clamp-1">{nextTask.title}</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 flex-shrink-0" />
            <span className="text-xs text-emerald-600 font-medium">All tasks done</span>
          </>
        )}
      </div>

      {/* Footer: price + days badge */}
      <div className="mt-3 flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <DollarSign className="h-3 w-3" />
          {formatPrice(deal.purchase_price)}
        </span>
        <span className={cn(
          'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
          stageColor.light, stageColor.lightText
        )}>
          <Clock className="h-2.5 w-2.5 inline mr-0.5 -mt-px" />
          {daysInStage}d
        </span>
      </div>
    </button>
  );
};

// ---- Kanban Column ----

interface KanbanColumnProps {
  stage: string;
  deals: Deal[];
  tasksByDeal: Record<string, Task[]>;
  onCardClick: (dealId: string) => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({ stage, deals, tasksByDeal, onCardClick }) => {
  const stageColor = getStageColor(stage);

  return (
    <div className="w-72 flex-shrink-0 flex flex-col max-h-full">
      {/* Column header with gradient bar */}
      <div className={cn('rounded-t-lg bg-gradient-to-r p-3', stageColor.gradient)}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white truncate">{stage}</h2>
          <span className="text-xs font-bold text-white/80 bg-white/20 rounded-full px-2 py-0.5 min-w-[1.5rem] text-center">
            {deals.length}
          </span>
        </div>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-y-auto scrollbar-thin bg-gray-50/50 rounded-b-lg border border-t-0 border-gray-200 p-2 space-y-2">
        {deals.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-400">
            No deals
          </div>
        ) : (
          deals.map(deal => {
            const tasks = tasksByDeal[deal.id] || [];
            const nextTask = tasks
              .filter(t => t.status === 'To Do' || t.status === 'In Progress')
              .sort((a, b) => (a.task_order ?? 999) - (b.task_order ?? 999))[0];
            return (
              <KanbanCard
                key={deal.id}
                deal={deal}
                nextTask={nextTask}
                onClick={() => onCardClick(deal.id)}
              />
            );
          })
        )}
      </div>
    </div>
  );
};

// ---- Pipeline Page ----

export const Pipeline: React.FC = () => {
  const navigate = useNavigate();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [fetchedDeals, fetchedTasks] = await Promise.all([fetchAllDeals(), fetchAllTasks()]);
      setDeals(fetchedDeals as Deal[]);
      setTasks(fetchedTasks as Task[]);
    } catch (err) {
      console.error('Pipeline: fetch error', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const cleanup = onFubPersonSyncComplete(() => fetchData());
    return cleanup;
  }, [fetchData]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await triggerFubPersonSync();
      await fetchData();
      if (result.newDeals > 0 || result.updatedDeals > 0) {
        setToast({ message: `Synced: ${result.newDeals} new, ${result.updatedDeals} updated`, type: 'success' });
      } else {
        setToast({ message: 'No changes from FUB', type: 'success' });
      }
    } catch {
      await fetchData();
      setToast({ message: 'FUB sync failed', type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  // Group tasks by deal_id
  const tasksByDeal = useMemo(() => {
    const map: Record<string, Task[]> = {};
    tasks.forEach(t => {
      if (!map[t.deal_id]) map[t.deal_id] = [];
      map[t.deal_id].push(t);
    });
    return map;
  }, [tasks]);

  // Group deals by stage (pipeline only — excludes Cancelled)
  const dealsByStage = useMemo(() => {
    const map: Record<string, Deal[]> = {};
    PIPELINE_STAGES.forEach(s => { map[s] = []; });
    deals.forEach(d => {
      if (map[d.stage]) map[d.stage].push(d);
    });
    return map;
  }, [deals]);

  const activeCount = deals.filter(d => d.stage !== 'Cancelled').length;

  return (
    <div className="h-full flex flex-col">
      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium z-50',
          toast.type === 'success' ? 'bg-white border-emerald-200 text-emerald-700' : 'bg-white border-red-200 text-red-700'
        )}>
          <div className="flex items-center gap-2">
            <div className={cn('w-2 h-2 rounded-full', toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500')} />
            {toast.message}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">{activeCount} active deal{activeCount !== 1 ? 's' : ''}</p>
        </div>
        <Button variant="outline" onClick={handleSync} disabled={isSyncing} className="bg-white border-gray-200 self-start">
          <RefreshCw className={cn('h-4 w-4 mr-2 text-gray-600', isSyncing && 'animate-spin')} />
          Sync from FUB
        </Button>
      </div>

      {/* Kanban Board */}
      {isLoading ? (
        <div className="kanban-scroll gap-4 flex-1">
          {PIPELINE_STAGES.map(s => (
            <div key={s} className="w-72 flex-shrink-0">
              <div className="h-12 bg-gray-200 rounded-t-lg animate-pulse" />
              <div className="h-96 bg-gray-100 rounded-b-lg animate-pulse mt-0" />
            </div>
          ))}
        </div>
      ) : (
        <div className="kanban-scroll gap-4 flex-1 items-start">
          {PIPELINE_STAGES.map(stage => (
            <KanbanColumn
              key={stage}
              stage={stage}
              deals={dealsByStage[stage] || []}
              tasksByDeal={tasksByDeal}
              onCardClick={(dealId) => navigate(`/deals/${dealId}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
