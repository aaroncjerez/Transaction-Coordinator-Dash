import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, AlertTriangle, Brain } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import {
  fetchMercurySummary,
  fetchMercuryTransactions,
  fetchMercuryMonthlySpend,
  fetchMercuryCategoryBreakdown,
  fetchActiveDealPipeline,
  fetchMonthlyCashflow,
  syncMercuryNow,
  getCfoInsights,
} from '../lib/database';

import { CashPositionCards } from '../components/cfo/CashPositionCards';
import { TransactionsTable } from '../components/cfo/TransactionsTable';
import { BurnRateChart } from '../components/cfo/BurnRateChart';
import { PLSummary } from '../components/cfo/PLSummary';
import { AccountsList } from '../components/cfo/AccountsList';
import { CategoryBreakdown } from '../components/cfo/CategoryBreakdown';
import { PipelineProfits } from '../components/cfo/PipelineProfits';
import { MonthlyCashflow } from '../components/cfo/MonthlyCashflow';

export const CFO: React.FC = () => {
  const [summary, setSummary] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [monthlySpend, setMonthlySpend] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [pipeline, setPipeline] = useState<{ active: any[]; closed: any[] }>({ active: [], closed: [] });
  const [monthlyCashflow, setMonthlyCashflow] = useState<any[]>([]);
  const [pipelineProfit, setPipelineProfit] = useState(0);
  const [insights, setInsights] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInsightsLoading, setIsInsightsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [sum, txns, monthly, cats, deals, cashflow] = await Promise.all([
        fetchMercurySummary(),
        fetchMercuryTransactions({ days: 30, limit: 100 }),
        fetchMercuryMonthlySpend(6),
        fetchMercuryCategoryBreakdown(30),
        fetchActiveDealPipeline(),
        fetchMonthlyCashflow(),
      ]);

      setSummary(sum);
      setTransactions(txns);
      setMonthlySpend(monthly);
      setCategories(cats);
      setPipeline(deals || { active: [], closed: [] });
      setMonthlyCashflow(cashflow || []);

      const totalProfit = (deals?.active || []).reduce((s: number, d: any) => s + (d.profit || 0), 0);
      setPipelineProfit(totalProfit);
    } catch (err) {
      console.error('Error fetching CFO data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load financial data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await syncMercuryNow();
      if (result.error) {
        setError(result.error);
      } else {
        await fetchData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [fetchData]);

  const handleGenerateInsights = useCallback(async () => {
    if (!summary || !pipeline) return;
    setIsInsightsLoading(true);
    try {
      const activeDeals = pipeline.active || [];
      const closedDeals = pipeline.closed || [];
      const closedProfit = closedDeals.reduce((s: number, d: any) => s + (d.profit || 0), 0);
      const avgMargin = closedDeals.length > 0
        ? closedDeals.reduce((s: number, d: any) => {
            const m = d.buy_price > 0 ? (d.profit / d.buy_price) * 100 : 0;
            return s + m;
          }, 0) / closedDeals.length
        : 0;

      const stages: Record<string, number> = {};
      activeDeals.forEach((d: any) => { stages[d.stage] = (stages[d.stage] || 0) + 1; });

      const data = {
        cashPosition: summary.totalBalance,
        monthlyBurn: summary.monthlyBurn,
        runway: summary.runway,
        last30DaysIn: summary.last30DaysIn,
        last30DaysOut: summary.last30DaysOut,
        activeDeals: {
          count: activeDeals.length,
          stages,
          totalPipeline: activeDeals.reduce((s: number, d: any) => s + (d.buy_price || 0), 0),
          totalExpectedProfit: activeDeals.reduce((s: number, d: any) => s + (d.profit || 0), 0),
        },
        activeDealsList: activeDeals.map((d: any) => ({
          name: d.name, stage: d.stage, buyPrice: d.buy_price,
          profit: d.profit, closeDate: d.close_date,
        })),
        closedDeals: {
          count: closedDeals.length,
          totalProfit: closedProfit,
          avgProfit: closedDeals.length > 0 ? closedProfit / closedDeals.length : 0,
          avgMargin,
        },
        monthlyCashflow: monthlyCashflow.map((m: any) => ({
          month: m.month, income: m.income, expenses: m.expenses, net: m.net,
        })),
      };

      const result = await getCfoInsights(data);
      setInsights(result);
    } catch (err) {
      console.error('Error generating insights:', err);
    } finally {
      setIsInsightsLoading(false);
    }
  }, [summary, pipeline, monthlyCashflow]);

  const lastSyncText = summary?.lastSync
    ? (() => {
        const ago = Date.now() - new Date(summary.lastSync + 'Z').getTime();
        const mins = Math.floor(ago / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        return `${Math.floor(mins / 60)}h ago`;
      })()
    : null;

  const lowBalance = summary && summary.totalBalance < 5000;

  if (isLoading && !summary) {
    return (
      <>
        <TopBar title="CFO Dashboard" />
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-xl h-32 animate-pulse" />
            ))}
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="CFO Dashboard" />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Financial Overview</h2>
              <p className="text-xs text-slate-500">
                Jerez Land LLC &middot; Mercury + FUB
                {lastSyncText && <span> &middot; Synced {lastSyncText}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerateInsights}
                disabled={isInsightsLoading}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 rounded-lg text-violet-300 transition-colors disabled:opacity-50"
              >
                <Brain size={14} className={isInsightsLoading ? 'animate-pulse' : ''} />
                {isInsightsLoading ? 'Analyzing...' : 'AI Insights'}
              </button>
              <button
                onClick={handleSync}
                disabled={isSyncing}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-300 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                {isSyncing ? 'Syncing...' : 'Sync'}
              </button>
            </div>
          </div>

          {/* Alerts */}
          {lowBalance && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">
                Low balance: ${summary.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} — below $5,000
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>
          )}

          {/* AI Insights */}
          {insights && (
            <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Brain size={16} className="text-violet-400" />
                <h3 className="text-sm font-semibold text-violet-300">CFO Analysis</h3>
                <span className="text-[10px] text-slate-500 ml-auto">
                  {insights.generatedAt ? new Date(insights.generatedAt).toLocaleTimeString() : ''}
                </span>
              </div>
              <p className="text-sm text-slate-300">{insights.summary}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                {insights.insights?.map((ins: any, i: number) => (
                  <div key={i} className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs font-semibold text-white mb-1">{ins.title}</p>
                    <p className="text-xs text-slate-400">{ins.detail}</p>
                  </div>
                ))}
              </div>
              {insights.monthlyTrend && (
                <p className="text-xs text-slate-400 pt-2 border-t border-white/10">
                  <span className="font-semibold text-slate-300">Trend: </span>{insights.monthlyTrend}
                </p>
              )}
            </div>
          )}

          {/* Cash position cards */}
          {summary && (
            <CashPositionCards
              totalBalance={summary.totalBalance}
              monthlyBurn={summary.monthlyBurn}
              runway={summary.runway}
              pipelineProfit={pipelineProfit}
            />
          )}

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <BurnRateChart data={monthlySpend} />
            </div>
            <div className="space-y-4">
              {summary && (
                <PLSummary
                  last30DaysIn={summary.last30DaysIn}
                  last30DaysOut={summary.last30DaysOut}
                  transactionCount={summary.transactionCount30d}
                />
              )}
              <MonthlyCashflow data={monthlyCashflow} />
            </div>
          </div>

          {/* Pipeline */}
          <PipelineProfits active={pipeline.active} closed={pipeline.closed} />

          {/* Bottom row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <TransactionsTable transactions={transactions} />
            </div>
            <div className="space-y-4">
              {summary && <AccountsList accounts={summary.accounts} />}
              <CategoryBreakdown data={categories} />
            </div>
          </div>
        </div>
      </main>
    </>
  );
};
