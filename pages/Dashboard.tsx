import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Clock, CheckSquare, TrendingUp, DollarSign,
  ArrowRight, Calendar, LayoutGrid, Loader2, Sparkles, BarChart3,
} from 'lucide-react';
import { Deal, Task, Deadline } from '../types';
import type { DealStage } from '../types';
import { PIPELINE_STAGES, STAGE_COLORS, getStageColor } from '../constants';
import { cn } from '../lib/utils';
import { fetchAllDeals, fetchAllTasks, getAllDeadlines, getCfoInsights } from '../lib/database';
import { TopBar } from '../components/TopBar';
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

/** Sum all fee fields for a deal */
function getDealTotalFees(d: Deal): number {
  return (d.transactional_funding_fee || 0) +
    (d.realtor_fee_amount || 0) +
    (d.improvement_costs || 0) +
    (d.misc_fees || 0);
}


// ---- Dashboard Page ----

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const openCommandPalette = useOpenCommandPalette();
  const { prefs } = usePreferences();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cfoInsights, setCfoInsights] = useState<{
    summary: string;
    insights: { title: string; detail: string }[];
    monthlyTrend: string;
    generatedAt: string;
  } | null>(null);
  const [cfoLoading, setCfoLoading] = useState(false);
  const [cfoError, setCfoError] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<'thisYear' | 'allTime'>('thisYear');
  const currentYear = new Date().getFullYear();

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
  const soldDeals = useMemo(() => deals.filter(d => d.stage === 'Sold'), [deals]);

  // Year-filtered sold deals for realized metrics (use close_date only — no updated_at fallback)
  const filteredSoldDeals = useMemo(() => {
    if (yearFilter === 'allTime') return soldDeals;
    return soldDeals.filter(d => {
      if (!d.close_date || d.close_date === 'TBD') return false;
      return new Date(d.close_date).getFullYear() === currentYear;
    });
  }, [soldDeals, yearFilter, currentYear]);

  // Sold deals missing close_date or realized_gross_profit
  const incompleteSoldDeals = useMemo(() =>
    soldDeals.filter(d => !d.close_date || d.close_date === 'TBD' || !d.realized_gross_profit),
    [soldDeals]
  );

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

  // Task breakdown (with skipped)
  const taskBreakdown = useMemo(() => {
    let todo = 0, inProgress = 0, done = 0, skipped = 0;
    tasks.forEach(t => {
      if (t.status === 'To Do') todo++;
      else if (t.status === 'In Progress') inProgress++;
      else if (t.status === 'Done') done++;
      else if (t.status === 'Skipped') skipped++;
    });
    const total = tasks.length;
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
    return { todo, inProgress, done, skipped, total, completionRate };
  }, [tasks]);

  // Financials
  const totalPipeline = useMemo(() =>
    activeDeals.reduce((sum, d) => sum + (d.purchase_price || 0), 0), [activeDeals]);

  // My realized profit across active deals (from FUB deal commission sync)
  const myProjectedProfit = useMemo(() =>
    activeDeals.reduce((sum, d) => sum + (d.realized_gross_profit || 0), 0), [activeDeals]);

  // My Profit = realized_gross_profit for sold deals (filtered by year)
  const myProfit = useMemo(() =>
    filteredSoldDeals.reduce((sum, d) => sum + (d.realized_gross_profit || 0), 0), [filteredSoldDeals]);

  // Deal type breakdown
  const dealTypeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    activeDeals.forEach(d => {
      const type = d.deal_type || 'Unknown';
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [activeDeals]);

  // Average days in pipeline
  const now = Date.now();
  const avgDaysInPipeline = useMemo(() => {
    if (activeDeals.length === 0) return 0;
    const totalDays = activeDeals.reduce((sum, d) => {
      const created = d.created_at ? new Date(d.created_at).getTime() : now;
      return sum + (now - created) / 86_400_000;
    }, 0);
    return Math.round(totalDays / activeDeals.length);
  }, [activeDeals, now]);

  // Month-to-month profit (My Share) grouped by close_date
  interface MonthlyProfit {
    month: string;
    label: string;
    dealCount: number;
    realizedGrossProfit: number;
    myShare: number;
  }

  const monthlyProfits = useMemo((): MonthlyProfit[] => {
    const byMonth: Record<string, MonthlyProfit> = {};
    filteredSoldDeals.forEach(d => {
      const dateStr = d.close_date || d.updated_at || d.created_at;
      if (!dateStr || dateStr === 'TBD') return;
      const dt = new Date(dateStr);
      if (isNaN(dt.getTime())) return;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[key]) {
        byMonth[key] = {
          month: key,
          label: dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          dealCount: 0,
          realizedGrossProfit: 0,
          myShare: 0,
        };
      }
      byMonth[key].dealCount++;
      byMonth[key].realizedGrossProfit += d.realized_gross_profit || 0;
      byMonth[key].myShare += d.realized_gross_profit || 0;
    });
    return Object.values(byMonth).sort((a, b) => b.month.localeCompare(a.month));
  }, [filteredSoldDeals]);

  const trailingAverage = useMemo(() => {
    const recent = monthlyProfits.slice(0, 6);
    if (recent.length === 0) return 0;
    return recent.reduce((s, m) => s + m.myShare, 0) / recent.length;
  }, [monthlyProfits]);

  // Deal name lookup helper
  const dealNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    deals.forEach(d => { map[d.id] = d.deal_name; });
    return map;
  }, [deals]);

  const needsAttentionCount = overdueDeadlines.length + staleDeals.length;
  const comingUpCount = upcomingDeadlines.length + approachingClose.length;

  // Pipeline funnel max for bar widths
  const maxStageCount = useMemo(() => Math.max(1, ...Object.values(stageCounts)), [stageCounts]);

  // ---- CFO Insights handler ----
  const handleGetCfoInsights = async () => {
    setCfoLoading(true);
    setCfoError(null);
    try {
      const stageBreakdown: Record<string, number> = {};
      activeDeals.forEach(d => {
        stageBreakdown[d.stage] = (stageBreakdown[d.stage] || 0) + 1;
      });
      const result = await getCfoInsights({
        activeDeals: { count: activeDeals.length, stages: stageBreakdown },
        totalPipelineValue: totalPipeline,
        myProjectedProfit,
        myRealizedProfit: myProfit,
        totalRealizedGross: myProfit,
        monthlyProfits,
        trailingAverage,
        overdueDeadlineCount: overdueDeadlines.length,
        staleDealsCount: staleDeals.length,
        pendingTaskCount: pendingTasks.length,
        soldDealCount: filteredSoldDeals.length,
      });
      setCfoInsights(result);
    } catch (err: any) {
      setCfoError(err?.message || 'Failed to get CFO insights');
    } finally {
      setCfoLoading(false);
    }
  };

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
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-5xl mx-auto px-5 py-6 space-y-6">

          {/* ---- Active Pipeline Stats ---- */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Active Pipeline</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard icon={<LayoutGrid size={16} />} label="Active Deals" value={String(activeDeals.length)} />
              <StatCard icon={<DollarSign size={16} />} label="Pipeline Value" value={formatCurrency(totalPipeline)} />
              <StatCard icon={<TrendingUp size={16} />} label="My Projected" value={formatCurrency(myProjectedProfit)} valueClass="text-emerald-600" />
            </div>
          </div>

          {/* ---- Realized Stats (with year toggle) ---- */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Realized</h3>
              <div className="flex bg-gray-100 rounded-md p-0.5">
                <button
                  className={cn('px-2.5 py-1 text-micro font-medium rounded transition-colors',
                    yearFilter === 'thisYear' ? 'bg-white shadow-xs text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  )}
                  onClick={() => setYearFilter('thisYear')}
                >
                  {currentYear}
                </button>
                <button
                  className={cn('px-2.5 py-1 text-micro font-medium rounded transition-colors',
                    yearFilter === 'allTime' ? 'bg-white shadow-xs text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  )}
                  onClick={() => setYearFilter('allTime')}
                >
                  All Time
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatCard icon={<DollarSign size={16} />} label="My Profit" value={formatCurrency(myProfit)} valueClass="text-emerald-700 font-bold" />
              <StatCard icon={<LayoutGrid size={16} />} label="Sold Deals" value={String(filteredSoldDeals.length)} />
            </div>
            {incompleteSoldDeals.length > 0 && (
              <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-caption text-amber-700">
                  {incompleteSoldDeals.length} sold deal{incompleteSoldDeals.length !== 1 ? 's' : ''} missing close date or profit:{' '}
                  {incompleteSoldDeals.map((d, i) => (
                    <span key={d.id}>
                      {i > 0 && ', '}
                      <button className="underline hover:text-amber-900" onClick={() => navigate(`/pipeline?deal=${d.id}`)}>{d.deal_name}</button>
                      <span className="text-amber-500 text-micro ml-0.5">
                        ({[!d.close_date || d.close_date === 'TBD' ? 'no date' : null, !d.realized_gross_profit ? 'no profit' : null].filter(Boolean).join(', ')})
                      </span>
                    </span>
                  ))}
                </p>
              </div>
            )}
          </div>

          {/* ---- Stage Distribution + Deal Types ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Deals by Stage */}
            <div className="bg-white rounded-card border border-gray-200 shadow-xs p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-gray-400"><BarChart3 size={14} /></span>
                <h3 className="text-sm font-semibold text-gray-900">Pipeline Funnel</h3>
              </div>
              <div className="space-y-2">
                {PIPELINE_STAGES.map(stage => {
                  const count = stageCounts[stage] || 0;
                  const pct = (count / maxStageCount) * 100;
                  const sc = STAGE_COLORS[stage as DealStage];
                  return (
                    <button
                      key={stage}
                      onClick={() => navigate('/pipeline')}
                      className="w-full flex items-center gap-3 hover:opacity-80 transition-opacity"
                    >
                      <span className="w-[120px] text-caption text-gray-600 truncate flex-shrink-0 text-left">{stage}</span>
                      <div className="flex-1 h-5 bg-gray-100 rounded-md overflow-hidden relative">
                        <div
                          className="h-full rounded-md transition-all duration-500"
                          style={{ width: `${Math.max(pct, count > 0 ? 4 : 0)}%`, backgroundColor: sc?.hex || '#94a3b8' }}
                        />
                        {count > 0 && (
                          <span className="absolute inset-y-0 left-2 flex items-center text-micro font-bold text-white mix-blend-difference">
                            {count}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Deal Types */}
            <div className="bg-white rounded-card border border-gray-200 shadow-xs p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-gray-400"><BarChart3 size={14} /></span>
                <h3 className="text-sm font-semibold text-gray-900">Deal Types</h3>
              </div>
              {dealTypeBreakdown.length === 0 ? (
                <p className="text-caption text-gray-400 italic">No active deals</p>
              ) : (
                <div className="space-y-2.5">
                  {dealTypeBreakdown.map(([type, count]) => {
                    const pct = (count / activeDeals.length) * 100;
                    return (
                      <div key={type}>
                        <div className="flex justify-between text-caption mb-1">
                          <span className="font-medium text-gray-700">{type}</span>
                          <span className="text-gray-500">{count} ({Math.round(pct)}%)</span>
                        </div>
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ---- Task Progress (with Skipped) ---- */}
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
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl font-bold text-gray-900">{taskBreakdown.completionRate}%</span>
                  <span className="text-caption text-gray-500">{taskBreakdown.done} of {taskBreakdown.total} tasks done</span>
                </div>
                {/* Stacked progress bar */}
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex mb-3">
                  <div className="bg-emerald-500 transition-all" style={{ width: `${(taskBreakdown.done / taskBreakdown.total) * 100}%` }} />
                  <div className="bg-blue-400 transition-all" style={{ width: `${(taskBreakdown.inProgress / taskBreakdown.total) * 100}%` }} />
                  <div className="bg-amber-400 transition-all" style={{ width: `${(taskBreakdown.todo / taskBreakdown.total) * 100}%` }} />
                  <div className="bg-gray-300 transition-all" style={{ width: `${(taskBreakdown.skipped / taskBreakdown.total) * 100}%` }} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Done ({taskBreakdown.done})</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-400" /> In Progress ({taskBreakdown.inProgress})</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> To Do ({taskBreakdown.todo})</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-300" /> Skipped ({taskBreakdown.skipped})</span>
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

          {/* ---- Financial Summary Table ---- */}
          <div className="bg-white rounded-card border border-gray-200 shadow-xs p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-gray-400"><DollarSign size={14} /></span>
              <h3 className="text-sm font-semibold text-gray-900">Financial Summary</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 text-caption font-semibold text-gray-500">Stage</th>
                    <th className="text-right py-2 text-caption font-semibold text-gray-500">Deals</th>
                    <th className="text-right py-2 text-caption font-semibold text-gray-500">Purchase</th>
                    <th className="text-right py-2 text-caption font-semibold text-gray-500">Sale</th>
                    <th className="text-right py-2 text-caption font-semibold text-gray-500">Spread</th>
                    <th className="text-right py-2 text-caption font-semibold text-gray-500">Fees</th>
                    <th className="text-right py-2 text-caption font-semibold text-gray-500">Net Profit</th>
                    <th className="text-right py-2 text-caption font-semibold text-blue-600">My Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {PIPELINE_STAGES.map(stage => {
                    const stageDeals = deals.filter(d => d.stage === stage);
                    if (stageDeals.length === 0) return null;
                    const purchase = stageDeals.reduce((s, d) => s + (d.purchase_price || 0), 0);
                    const sale = stageDeals.reduce((s, d) => s + (d.expected_sales_price || 0), 0);
                    const fees = stageDeals.reduce((s, d) => s + getDealTotalFees(d), 0);
                    const jlShare = stageDeals.reduce((s, d) => s + (d.realized_gross_profit || 0), 0);
                    const spread = sale - purchase;
                    const netProfit = spread - fees;
                    const sc = getStageColor(stage);
                    return (
                      <tr key={stage} className="border-b border-gray-100 hover:bg-subtle transition-colors">
                        <td className="py-2 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sc.hex }} />
                          <span className="text-gray-700">{stage}</span>
                        </td>
                        <td className="py-2 text-right text-gray-600">{stageDeals.length}</td>
                        <td className="py-2 text-right text-gray-600">${purchase.toLocaleString()}</td>
                        <td className="py-2 text-right text-gray-600">${sale.toLocaleString()}</td>
                        <td className={cn('py-2 text-right font-medium', spread > 0 ? 'text-emerald-600' : spread < 0 ? 'text-red-600' : 'text-gray-500')}>
                          ${spread.toLocaleString()}
                        </td>
                        <td className="py-2 text-right text-gray-500">{fees > 0 ? `−$${fees.toLocaleString()}` : '—'}</td>
                        <td className={cn('py-2 text-right font-medium', netProfit > 0 ? 'text-emerald-600' : netProfit < 0 ? 'text-red-600' : 'text-gray-500')}>
                          ${netProfit.toLocaleString()}
                        </td>
                        <td className={cn('py-2 text-right font-semibold', jlShare > 0 ? 'text-blue-700' : 'text-gray-400')}>
                          {jlShare > 0 ? `$${jlShare.toLocaleString()}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  {(() => {
                    const allNonCancelled = deals.filter(d => d.stage !== 'Cancelled');
                    const totalPurchase = allNonCancelled.reduce((s, d) => s + (d.purchase_price || 0), 0);
                    const totalSale = allNonCancelled.reduce((s, d) => s + (d.expected_sales_price || 0), 0);
                    const totalFees = allNonCancelled.reduce((s, d) => s + getDealTotalFees(d), 0);
                    const totalJlShare = allNonCancelled.reduce((s, d) => s + (d.realized_gross_profit || 0), 0);
                    const totalSpread = totalSale - totalPurchase;
                    const totalNet = totalSpread - totalFees;
                    return (
                      <tr className="border-t-2 border-gray-200 font-semibold">
                        <td className="py-2 text-gray-900">Total</td>
                        <td className="py-2 text-right text-gray-900">{allNonCancelled.length}</td>
                        <td className="py-2 text-right text-gray-900">${totalPurchase.toLocaleString()}</td>
                        <td className="py-2 text-right text-gray-900">${totalSale.toLocaleString()}</td>
                        <td className={cn('py-2 text-right', totalSpread > 0 ? 'text-emerald-600' : 'text-red-600')}>
                          ${totalSpread.toLocaleString()}
                        </td>
                        <td className="py-2 text-right text-gray-500">{totalFees > 0 ? `−$${totalFees.toLocaleString()}` : '—'}</td>
                        <td className={cn('py-2 text-right', totalNet > 0 ? 'text-emerald-600' : 'text-red-600')}>
                          ${totalNet.toLocaleString()}
                        </td>
                        <td className={cn('py-2 text-right', totalJlShare > 0 ? 'text-blue-700' : 'text-gray-400')}>
                          {totalJlShare > 0 ? `$${totalJlShare.toLocaleString()}` : '—'}
                        </td>
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
          </div>

          {/* ---- Operational Metrics Row ---- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-card border border-gray-200 shadow-xs p-4 text-center">
              <p className="text-micro text-gray-400 font-medium uppercase tracking-wide mb-1">Avg Days in Pipeline</p>
              <p className="text-xl font-bold text-amber-600">{avgDaysInPipeline}d</p>
              <p className="text-micro text-gray-400">{activeDeals.length} active</p>
            </div>
            <div className="bg-white rounded-card border border-gray-200 shadow-xs p-4 text-center">
              <p className="text-micro text-gray-400 font-medium uppercase tracking-wide mb-1">Task Completion</p>
              <p className="text-xl font-bold text-emerald-600">{taskBreakdown.completionRate}%</p>
              <p className="text-micro text-gray-400">{taskBreakdown.done} of {taskBreakdown.total}</p>
            </div>
          </div>

          {/* ---- Month-to-Month Profit ---- */}
          {monthlyProfits.length > 0 && (
            <div className="bg-white rounded-card border border-gray-200 shadow-xs p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-900">Monthly Profit</h3>
                <span className="text-caption text-gray-500">
                  Avg: <span className="font-semibold text-emerald-600">{formatCurrency(trailingAverage)}</span>/mo
                </span>
              </div>
              <div className="space-y-2">
                {(() => {
                  const display = monthlyProfits.slice(0, 6);
                  const maxShare = Math.max(1, ...display.map(x => x.myShare));
                  return display.map(m => (
                    <div key={m.month} className="flex items-center gap-3">
                      <span className="text-caption text-gray-500 w-16 flex-shrink-0">{m.label}</span>
                      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${maxShare > 0 ? (m.myShare / maxShare) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-caption font-semibold text-gray-800 w-16 text-right">
                        {formatCurrency(m.myShare)}
                      </span>
                      <span className="text-micro text-gray-400 w-14 text-right">
                        {m.dealCount} deal{m.dealCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}

          {/* ---- AI CFO Insights ---- */}
          <div className="bg-white rounded-card border border-gray-200 shadow-xs p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-500" />
                <h3 className="text-sm font-semibold text-gray-900">AI CFO Insights</h3>
              </div>
              <button
                onClick={handleGetCfoInsights}
                disabled={cfoLoading}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-caption font-medium transition-colors',
                  cfoLoading
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100',
                )}
              >
                {cfoLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                {cfoLoading ? 'Analyzing...' : cfoInsights ? 'Refresh' : 'Get CFO Insights'}
              </button>
            </div>

            {cfoError && (
              <p className="text-caption text-red-500 mb-2">{cfoError}</p>
            )}

            {cfoInsights && (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">{cfoInsights.summary}</p>
                <div className="space-y-2">
                  {cfoInsights.insights.map((insight, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-caption font-bold text-amber-600 flex-shrink-0">{i + 1}.</span>
                      <div>
                        <p className="text-caption font-semibold text-gray-900">{insight.title}</p>
                        <p className="text-caption text-gray-600">{insight.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-caption text-gray-500 italic">{cfoInsights.monthlyTrend}</p>
                <p className="text-micro text-gray-300">
                  Generated {new Date(cfoInsights.generatedAt).toLocaleString()}
                </p>
              </div>
            )}

            {!cfoInsights && !cfoLoading && !cfoError && (
              <p className="text-caption text-gray-400 italic">
                Click the button above to generate CFO-level financial insights for your portfolio.
              </p>
            )}
          </div>

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
