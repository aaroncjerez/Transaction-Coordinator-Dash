import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Clock, CheckSquare, TrendingUp, DollarSign,
  ArrowRight, Calendar, LayoutGrid, Plus,
} from 'lucide-react';
import { Deal, Task, Deadline, DealStage } from '../types';
import { PIPELINE_STAGES, getStageColor } from '../constants';
import { cn } from '../lib/utils';
import { fetchAllDeals, fetchAllTasks, getAllDeadlines } from '../lib/database';
import { TopBar } from '../components/TopBar';
import { Button } from '../components/ui/Button';
import { CreateTaskModal } from '../components/CreateTaskModal';
import { useOpenCommandPalette } from '../components/Layout';
import { usePreferences } from '../contexts/PreferencesContext';

// ---- Helpers ----

const formatCurrency = (value: number): string => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${value.toLocaleString()}`;
};

const daysUntil = (dateStr: string): number =>
  Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);

const daysSince = (dateStr: string): number =>
  Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);

const formatShortDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

// ---- Dashboard Page ----

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const openCommandPalette = useOpenCommandPalette();
  const { prefs } = usePreferences();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateTask, setShowCreateTask] = useState(false);

  const refreshData = async () => {
    const [d, t, dl] = await Promise.all([fetchAllDeals(), fetchAllTasks(), getAllDeadlines()]);
    setDeals(d as Deal[]);
    setTasks(t as Task[]);
    setDeadlines(dl as Deadline[]);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [d, t, dl] = await Promise.all([fetchAllDeals(), fetchAllTasks(), getAllDeadlines()]);
        setDeals(d as Deal[]);
        setTasks(t as Task[]);
        setDeadlines(dl as Deadline[]);
      } catch (err) {
        console.error('Dashboard: fetch error', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // ---- Derived data ----

  const activeDeals = useMemo(() => deals.filter(d => d.stage !== 'Cancelled' && d.stage !== 'Sold'), [deals]);

  // Overdue deadlines (past due, not acknowledged)
  const overdueDeadlines = useMemo(() =>
    deadlines.filter(d => !d.is_acknowledged && new Date(d.due_date).getTime() < Date.now())
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()),
    [deadlines]
  );

  // Upcoming deadlines (within lead-time days, not overdue, not acknowledged)
  const upcomingDeadlines = useMemo(() =>
    deadlines.filter(d => {
      if (d.is_acknowledged) return false;
      const days = daysUntil(d.due_date);
      return days >= 0 && days <= prefs.deadlineAlertLeadDays;
    }).sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()),
    [deadlines, prefs.deadlineAlertLeadDays]
  );

  // In-progress tasks (not done, not skipped)
  const pendingTasks = useMemo(() =>
    tasks.filter(t => t.status === 'To Do' || t.status === 'In Progress')
      .sort((a, b) => {
        // High/Urgent priority first, then by order
        const priorityOrder: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };
        const ap = priorityOrder[(a as any).priority || 'Medium'] ?? 2;
        const bp = priorityOrder[(b as any).priority || 'Medium'] ?? 2;
        if (ap !== bp) return ap - bp;
        return (a.task_order ?? 999) - (b.task_order ?? 999);
      }),
    [tasks]
  );

  // Stale deals (> threshold days in same stage with no updates)
  const staleDeals = useMemo(() =>
    activeDeals.filter(d => d.updated_at && daysSince(d.updated_at) > prefs.staleDealThresholdDays)
      .sort((a, b) => daysSince(b.updated_at!) - daysSince(a.updated_at!)),
    [activeDeals, prefs.staleDealThresholdDays]
  );

  // Deals approaching close date (within 14 days)
  const approachingClose = useMemo(() =>
    activeDeals.filter(d => {
      if (!d.expected_close_date) return false;
      const days = daysUntil(d.expected_close_date);
      return days >= 0 && days <= 14;
    }).sort((a, b) => daysUntil(a.expected_close_date!) - daysUntil(b.expected_close_date!)),
    [activeDeals]
  );

  // Stage counts (active deals only)
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    PIPELINE_STAGES.forEach(s => { counts[s] = 0; });
    activeDeals.forEach(d => {
      if (counts[d.stage] !== undefined) counts[d.stage]++;
    });
    return counts;
  }, [activeDeals]);

  // Task breakdown
  const taskBreakdown = useMemo(() => {
    let todo = 0, inProgress = 0, done = 0;
    tasks.forEach(t => {
      if (t.status === 'To Do') todo++;
      else if (t.status === 'In Progress') inProgress++;
      else if (t.status === 'Done') done++;
    });
    return { todo, inProgress, done, total: tasks.length };
  }, [tasks]);

  // Financials
  const totalPipeline = useMemo(() =>
    activeDeals.reduce((sum, d) => sum + (d.purchase_price || 0), 0), [activeDeals]);
  const totalProfit = useMemo(() =>
    activeDeals.reduce((sum, d) => {
      const profit = (d.expected_sales_price || 0) - (d.purchase_price || 0);
      return sum + (profit > 0 ? profit : 0);
    }, 0), [activeDeals]);

  // Deal name lookup helper
  const dealNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    deals.forEach(d => { map[d.id] = d.deal_name; });
    return map;
  }, [deals]);

  const needsAttentionCount = overdueDeadlines.length + staleDeals.length;
  const comingUpCount = upcomingDeadlines.length + approachingClose.length;

  // ---- Render ----

  if (isLoading) {
    return (
      <div className="h-full flex flex-col min-h-0">
        <TopBar title="Dashboard" subtitle="Loading..." onSearchClick={openCommandPalette} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <TopBar
        title="Dashboard"
        subtitle={`${activeDeals.length} active deal${activeDeals.length !== 1 ? 's' : ''}`}
        onSearchClick={openCommandPalette}
        actions={
          <Button size="sm" variant="outline" onClick={() => setShowCreateTask(true)}>
            <Plus size={14} className="mr-1.5" /> Add Task
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-5xl mx-auto px-5 py-6 space-y-6">

          {/* ---- Quick Stats Row ---- */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={<LayoutGrid size={16} />} label="Active Deals" value={String(activeDeals.length)} />
            <StatCard icon={<DollarSign size={16} />} label="Pipeline Value" value={formatCurrency(totalPipeline)} />
            <StatCard icon={<TrendingUp size={16} />} label="Est. Profit" value={formatCurrency(totalProfit)} valueClass="text-emerald-600" />
            <StatCard icon={<CheckSquare size={16} />} label="Pending Tasks" value={String(pendingTasks.length)} />
          </div>

          {/* ---- Stage Distribution ---- */}
          <div className="bg-white rounded-card border border-gray-200 shadow-xs p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Deals by Stage</h3>
            <div className="flex flex-wrap gap-2">
              {PIPELINE_STAGES.map(stage => {
                const count = stageCounts[stage] || 0;
                if (count === 0) return null;
                const sc = getStageColor(stage);
                return (
                  <button
                    key={stage}
                    onClick={() => navigate('/pipeline')}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-caption font-medium transition-colors',
                      sc.light, sc.lightText, 'hover:opacity-80'
                    )}
                  >
                    {stage}
                    <span className="font-bold">{count}</span>
                  </button>
                );
              })}
              {activeDeals.length === 0 && (
                <span className="text-caption text-gray-400 italic">No active deals</span>
              )}
            </div>
          </div>

          {/* ---- Task Breakdown ---- */}
          <div className="bg-white rounded-card border border-gray-200 shadow-xs p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Task Progress</h3>
              <button
                onClick={() => navigate('/tasks')}
                className="text-caption text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight size={12} />
              </button>
            </div>
            {taskBreakdown.total === 0 ? (
              <p className="text-caption text-gray-400 italic">No tasks yet</p>
            ) : (
              <>
                {/* Progress bar */}
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${taskBreakdown.total > 0 ? (taskBreakdown.done / taskBreakdown.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex gap-4 text-caption">
                  <span className="text-gray-500">To Do <span className="font-semibold text-gray-800">{taskBreakdown.todo}</span></span>
                  <span className="text-gray-500">In Progress <span className="font-semibold text-blue-600">{taskBreakdown.inProgress}</span></span>
                  <span className="text-gray-500">Done <span className="font-semibold text-emerald-600">{taskBreakdown.done}</span></span>
                </div>
              </>
            )}
          </div>

          {/* ---- Needs Attention ---- */}
          {needsAttentionCount > 0 && (
            <SectionCard
              title="Needs Attention"
              count={needsAttentionCount}
              icon={<AlertTriangle size={16} className="text-red-500" />}
              accentClass="border-l-red-500"
            >
              {overdueDeadlines.map(d => (
                <AttentionRow
                  key={d.id}
                  icon={<AlertTriangle size={13} className="text-red-500" />}
                  label={d.label}
                  sublabel={dealNameMap[d.deal_id] || 'Unknown deal'}
                  badge={`${Math.abs(daysUntil(d.due_date))}d overdue`}
                  badgeClass="bg-red-50 text-red-700"
                  onClick={() => navigate(`/deals/${d.deal_id}`)}
                />
              ))}
              {staleDeals.map(d => (
                <AttentionRow
                  key={d.id}
                  icon={<Clock size={13} className="text-amber-500" />}
                  label={d.deal_name}
                  sublabel={d.stage}
                  badge={`${daysSince(d.updated_at!)}d stale`}
                  badgeClass="bg-amber-50 text-amber-700"
                  onClick={() => navigate(`/deals/${d.id}`)}
                />
              ))}
            </SectionCard>
          )}

          {/* ---- Coming Up ---- */}
          {comingUpCount > 0 && (
            <SectionCard
              title="Coming Up"
              count={comingUpCount}
              icon={<Calendar size={16} className="text-blue-500" />}
              accentClass="border-l-blue-500"
            >
              {upcomingDeadlines.map(d => {
                const days = daysUntil(d.due_date);
                return (
                  <AttentionRow
                    key={d.id}
                    icon={<Clock size={13} className="text-blue-500" />}
                    label={d.label}
                    sublabel={dealNameMap[d.deal_id] || 'Unknown deal'}
                    badge={days === 0 ? 'Today' : `${days}d`}
                    badgeClass="bg-blue-50 text-blue-700"
                    onClick={() => navigate(`/deals/${d.deal_id}`)}
                  />
                );
              })}
              {approachingClose.map(d => (
                <AttentionRow
                  key={d.id}
                  icon={<Calendar size={13} className="text-indigo-500" />}
                  label={d.deal_name}
                  sublabel={`Close: ${formatShortDate(d.expected_close_date!)}`}
                  badge={`${daysUntil(d.expected_close_date!)}d`}
                  badgeClass="bg-indigo-50 text-indigo-700"
                  onClick={() => navigate(`/deals/${d.id}`)}
                />
              ))}
            </SectionCard>
          )}

          {/* ---- All Clear Message ---- */}
          {needsAttentionCount === 0 && comingUpCount === 0 && activeDeals.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-card p-6 text-center">
              <CheckSquare size={24} className="text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-emerald-800">All clear</p>
              <p className="text-caption text-emerald-600">No overdue deadlines or upcoming items that need attention.</p>
            </div>
          )}
        </div>
      </div>

      {showCreateTask && (
        <CreateTaskModal
          deals={deals}
          onClose={() => setShowCreateTask(false)}
          onCreated={() => { setShowCreateTask(false); refreshData(); }}
        />
      )}
    </div>
  );
};

// ---- Sub-components ----

const StatCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClass?: string;
}> = ({ icon, label, value, valueClass }) => (
  <div className="bg-white rounded-card border border-gray-200 shadow-xs p-4">
    <div className="flex items-center gap-2 mb-1">
      <span className="text-gray-400">{icon}</span>
      <span className="text-caption text-gray-500 font-medium">{label}</span>
    </div>
    <p className={cn('text-xl font-bold text-gray-900', valueClass)}>{value}</p>
  </div>
);

const SectionCard: React.FC<{
  title: string;
  count: number;
  icon: React.ReactNode;
  accentClass: string;
  children: React.ReactNode;
}> = ({ title, count, icon, accentClass, children }) => (
  <div className={cn('bg-white rounded-card border border-gray-200 shadow-xs border-l-4 overflow-hidden', accentClass)}>
    <div className="flex items-center gap-2 px-4 pt-4 pb-2">
      {icon}
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <span className="text-caption text-gray-400 font-medium">({count})</span>
    </div>
    <div className="divide-y divide-gray-100">
      {children}
    </div>
  </div>
);

const AttentionRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  sublabel: string;
  badge: string;
  badgeClass: string;
  onClick: () => void;
}> = ({ icon, label, sublabel, badge, badgeClass, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
  >
    <span className="flex-shrink-0">{icon}</span>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
      <p className="text-caption text-gray-400 truncate">{sublabel}</p>
    </div>
    <span className={cn('text-micro font-semibold px-2 py-0.5 rounded-full flex-shrink-0', badgeClass)}>
      {badge}
    </span>
    <ArrowRight size={14} className="text-gray-300 flex-shrink-0" />
  </button>
);
