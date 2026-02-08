import React, { useEffect, useState, useMemo } from 'react';
import { BarChart3, TrendingUp, DollarSign, CheckCircle2, Clock, AlertTriangle, Landmark } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { fetchAllDeals, fetchAllTasks, getAllDeadlines } from '../lib/database';
import { PIPELINE_STAGES, STAGE_COLORS, getStageColor } from '../constants';
import { cn } from '../lib/utils';
import type { DealStage } from '../types';

// ---- Types ----

interface DealRow {
  id: string;
  deal_name: string;
  stage: string;
  deal_type?: string;
  purchase_price: number;
  expected_sales_price: number;
  contract_execution_date?: string;
  close_date?: string;
  created_at?: string;
  updated_at?: string;
  // Fee fields (v13)
  transactional_funding_fee?: number;
  realtor_fee_amount?: number;
  improvement_costs?: number;
  misc_fees?: number;
  // JL share (v14)
  jl_share_amount?: number;
}

/** Sum all fee fields for a deal */
function getDealTotalFees(d: DealRow): number {
  return (d.transactional_funding_fee || 0) +
    (d.realtor_fee_amount || 0) +
    (d.improvement_costs || 0) +
    (d.misc_fees || 0);
}

interface TaskRow {
  id: string;
  deal_id: string;
  status: string;
  stage_trigger?: string;
}

interface DeadlineRow {
  id: string;
  deal_id: string;
  due_date: string;
  is_acknowledged: number;
  label: string;
}

// ---- Main Component ----

export const Analytics: React.FC = () => {
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [deadlines, setDeadlines] = useState<DeadlineRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [d, t, dl] = await Promise.all([
          fetchAllDeals(),
          fetchAllTasks(),
          getAllDeadlines(),
        ]);
        setDeals(d as DealRow[]);
        setTasks(t as TaskRow[]);
        setDeadlines(dl as DeadlineRow[]);
      } catch (err) {
        console.error('Analytics load failed:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const activeDeals = useMemo(() => deals.filter(d => d.stage !== 'Cancelled' && d.stage !== 'Sold'), [deals]);
  const soldDeals = useMemo(() => deals.filter(d => d.stage === 'Sold'), [deals]);

  // Pipeline funnel — count per stage
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    PIPELINE_STAGES.forEach(s => { counts[s] = 0; });
    deals.forEach(d => {
      if (counts[d.stage] !== undefined) counts[d.stage]++;
    });
    return counts;
  }, [deals]);

  const maxStageCount = useMemo(() => Math.max(1, ...Object.values(stageCounts)), [stageCounts]);

  // Financials
  const totalPipelineValue = useMemo(() => activeDeals.reduce((s, d) => s + (d.expected_sales_price || 0), 0), [activeDeals]);
  const totalPurchaseCost = useMemo(() => activeDeals.reduce((s, d) => s + (d.purchase_price || 0), 0), [activeDeals]);
  const totalActiveFees = useMemo(() => activeDeals.reduce((s, d) => s + getDealTotalFees(d), 0), [activeDeals]);
  const estimatedProfit = totalPipelineValue - totalPurchaseCost - totalActiveFees;
  const realizedProfit = useMemo(() => soldDeals.reduce((s, d) => {
    const spread = (d.expected_sales_price || 0) - (d.purchase_price || 0);
    return s + spread - getDealTotalFees(d);
  }, 0), [soldDeals]);
  const jlRealized = useMemo(() => soldDeals.reduce((s, d) => s + (d.jl_share_amount || 0), 0), [soldDeals]);

  // Task stats
  const taskStats = useMemo(() => {
    const done = tasks.filter(t => t.status === 'Done').length;
    const todo = tasks.filter(t => t.status === 'To Do').length;
    const inProgress = tasks.filter(t => t.status === 'In Progress').length;
    const skipped = tasks.filter(t => t.status === 'Skipped').length;
    const total = tasks.length;
    return { done, todo, inProgress, skipped, total, completionRate: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [tasks]);

  // Deal type breakdown
  const dealTypeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    activeDeals.forEach(d => {
      const type = d.deal_type || 'Unknown';
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [activeDeals]);

  // Overdue deadlines
  const now = Date.now();
  const overdueDeadlines = useMemo(() => {
    return deadlines.filter(d => !d.is_acknowledged && new Date(d.due_date).getTime() < now);
  }, [deadlines, now]);

  // Average time in pipeline
  const avgDaysInPipeline = useMemo(() => {
    if (activeDeals.length === 0) return 0;
    const totalDays = activeDeals.reduce((sum, d) => {
      const created = d.created_at ? new Date(d.created_at).getTime() : now;
      return sum + (now - created) / 86_400_000;
    }, 0);
    return Math.round(totalDays / activeDeals.length);
  }, [activeDeals, now]);

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <TopBar title="Analytics" subtitle="Pipeline insights" />
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <TopBar title="Analytics" subtitle="Pipeline insights" />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="max-w-5xl mx-auto px-5 py-5 space-y-5">

          {/* KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiCard icon={<DollarSign size={16} />} label="Pipeline Value" value={`$${totalPipelineValue.toLocaleString()}`} color="text-blue-600" bg="bg-blue-50" />
            <KpiCard icon={<TrendingUp size={16} />} label="Est. Gross Profit" value={`$${estimatedProfit.toLocaleString()}`} color="text-emerald-600" bg="bg-emerald-50" />
            <KpiCard icon={<CheckCircle2 size={16} />} label="Realized Gross Profit" value={`$${realizedProfit.toLocaleString()}`} sub={`${soldDeals.length} sold`} color="text-teal-600" bg="bg-teal-50" />
            <KpiCard icon={<Landmark size={16} />} label="JL Realized" value={`$${jlRealized.toLocaleString()}`} sub={`${soldDeals.length} sold`} color="text-blue-700" bg="bg-blue-50" />
            <KpiCard icon={<Clock size={16} />} label="Avg Days in Pipeline" value={`${avgDaysInPipeline}d`} sub={`${activeDeals.length} active`} color="text-amber-600" bg="bg-amber-50" />
          </div>

          {/* Pipeline Funnel */}
          <Card title="Pipeline Funnel" icon={<BarChart3 size={14} />}>
            <div className="space-y-2.5">
              {PIPELINE_STAGES.map(stage => {
                const count = stageCounts[stage] || 0;
                const pct = (count / maxStageCount) * 100;
                const sc = STAGE_COLORS[stage as DealStage];
                return (
                  <div key={stage} className="flex items-center gap-3">
                    <span className="w-[140px] text-caption text-gray-600 truncate flex-shrink-0">{stage}</span>
                    <div className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden relative">
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
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Task Completion */}
            <Card title="Task Completion" icon={<CheckCircle2 size={14} />}>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-bold text-gray-900">{taskStats.completionRate}%</span>
                  <span className="text-caption text-gray-500">{taskStats.done} of {taskStats.total} tasks done</span>
                </div>
                {/* Stacked bar */}
                <div className="h-4 bg-gray-100 rounded-full overflow-hidden flex">
                  {taskStats.total > 0 && (
                    <>
                      <div className="bg-emerald-500 transition-all" style={{ width: `${(taskStats.done / taskStats.total) * 100}%` }} />
                      <div className="bg-blue-400 transition-all" style={{ width: `${(taskStats.inProgress / taskStats.total) * 100}%` }} />
                      <div className="bg-amber-400 transition-all" style={{ width: `${(taskStats.todo / taskStats.total) * 100}%` }} />
                      <div className="bg-gray-300 transition-all" style={{ width: `${(taskStats.skipped / taskStats.total) * 100}%` }} />
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Done ({taskStats.done})</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-400" /> In Progress ({taskStats.inProgress})</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> To Do ({taskStats.todo})</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-300" /> Skipped ({taskStats.skipped})</span>
                </div>
              </div>
            </Card>

            {/* Deal Type Breakdown */}
            <Card title="Deal Types" icon={<BarChart3 size={14} />}>
              {dealTypeBreakdown.length === 0 ? (
                <p className="text-caption text-gray-400">No active deals</p>
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
            </Card>
          </div>

          {/* Financial Summary */}
          <Card title="Financial Summary" icon={<DollarSign size={14} />}>
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
                    <th className="text-right py-2 text-caption font-semibold text-blue-600">JL Share</th>
                  </tr>
                </thead>
                <tbody>
                  {PIPELINE_STAGES.map(stage => {
                    const stageDeals = deals.filter(d => d.stage === stage);
                    if (stageDeals.length === 0) return null;
                    const purchase = stageDeals.reduce((s, d) => s + (d.purchase_price || 0), 0);
                    const sale = stageDeals.reduce((s, d) => s + (d.expected_sales_price || 0), 0);
                    const fees = stageDeals.reduce((s, d) => s + getDealTotalFees(d), 0);
                    const jlShare = stageDeals.reduce((s, d) => s + (d.jl_share_amount || 0), 0);
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
                    const totalJlShare = allNonCancelled.reduce((s, d) => s + (d.jl_share_amount || 0), 0);
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
          </Card>

          {/* Overdue Deadlines */}
          {overdueDeadlines.length > 0 && (
            <Card title={`Overdue Deadlines (${overdueDeadlines.length})`} icon={<AlertTriangle size={14} />} titleColor="text-red-700">
              <div className="space-y-2">
                {overdueDeadlines.slice(0, 10).map(d => {
                  const deal = deals.find(dl => dl.id === d.deal_id);
                  const days = Math.abs(Math.ceil((new Date(d.due_date).getTime() - now) / 86_400_000));
                  return (
                    <div key={d.id} className="flex items-center gap-3 text-sm">
                      <span className="bg-red-50 text-red-700 text-micro font-semibold px-1.5 py-0.5 rounded flex-shrink-0">
                        {days}d overdue
                      </span>
                      <span className="text-gray-700 flex-1 truncate">{d.label}</span>
                      {deal && <span className="text-caption text-gray-400 flex-shrink-0">{deal.deal_name}</span>}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

        </div>
      </div>
    </div>
  );
};

// ---- Sub-components ----

const KpiCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
  bg: string;
}> = ({ icon, label, value, sub, color, bg }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-4">
    <div className="flex items-center gap-2 mb-2">
      <span className={cn('p-1.5 rounded-md', bg, color)}>{icon}</span>
      <span className="text-caption text-gray-500 font-medium">{label}</span>
    </div>
    <p className="text-xl font-bold text-gray-900">{value}</p>
    {sub && <p className="text-micro text-gray-400 mt-0.5">{sub}</p>}
  </div>
);

const Card: React.FC<{
  title: string;
  icon?: React.ReactNode;
  titleColor?: string;
  children: React.ReactNode;
}> = ({ title, icon, titleColor, children }) => (
  <div className="bg-white rounded-lg border border-gray-200 p-4">
    <div className="flex items-center gap-2 mb-3">
      {icon && <span className="text-gray-400">{icon}</span>}
      <h3 className={cn('text-sm font-semibold', titleColor || 'text-gray-900')}>{title}</h3>
    </div>
    {children}
  </div>
);
