import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import {
  fetchMercurySummary,
  fetchMercuryTransactions,
  fetchMercuryMonthlySpend,
  fetchMercuryCategoryBreakdown,
  fetchActiveDealPipeline,
  syncMercuryNow,
} from '../lib/database';

import { CashPositionCards } from '../components/cfo/CashPositionCards';
import { TransactionsTable } from '../components/cfo/TransactionsTable';
import { BurnRateChart } from '../components/cfo/BurnRateChart';
import { PLSummary } from '../components/cfo/PLSummary';
import { AccountsList } from '../components/cfo/AccountsList';
import { CategoryBreakdown } from '../components/cfo/CategoryBreakdown';
import { PipelineProfits } from '../components/cfo/PipelineProfits';

export const CFO: React.FC = () => {
  const [summary, setSummary] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [monthlySpend, setMonthlySpend] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [pipeline, setPipeline] = useState<any[]>([]);
  const [pipelineProfit, setPipelineProfit] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [sum, txns, monthly, cats, deals] = await Promise.all([
        fetchMercurySummary(),
        fetchMercuryTransactions({ days: 30, limit: 100 }),
        fetchMercuryMonthlySpend(6),
        fetchMercuryCategoryBreakdown(30),
        fetchActiveDealPipeline(),
      ]);

      setPipeline(deals || []);
      // Calculate total projected profit from pipeline
      const totalProfit = (deals || []).reduce((s: number, d: any) => {
        const sell = d.sell_price || d.realtor_opinion || 0;
        const buy = d.buy_price || 0;
        return (sell && buy) ? s + (sell - buy) : s;
      }, 0);
      setPipelineProfit(totalProfit);

      setSummary(sum);
      setTransactions(txns);
      setMonthlySpend(monthly);
      setCategories(cats);
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

  const lastSyncText = summary?.lastSync
    ? (() => {
        const ago = Date.now() - new Date(summary.lastSync + 'Z').getTime();
        const mins = Math.floor(ago / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        return `${Math.floor(mins / 60)}h ago`;
      })()
    : null;

  const lowBalance = summary && summary.totalBalance < (parseFloat(process.env.MERCURY_LOW_BALANCE_THRESHOLD || '5000'));

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
          {/* Header with sync */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Financial Overview</h2>
              <p className="text-xs text-slate-500">
                Jerez Land LLC &middot; Mercury Bank
                {lastSyncText && <span> &middot; Synced {lastSyncText}</span>}
              </p>
            </div>
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-slate-300 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>

          {/* Low balance alert */}
          {lowBalance && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
              <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">
                Low balance alert: ${summary.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} — below ${(parseFloat(process.env.MERCURY_LOW_BALANCE_THRESHOLD || '5000')).toLocaleString()} threshold
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-300">
              {error}
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
            <div>
              {summary && (
                <PLSummary
                  last30DaysIn={summary.last30DaysIn}
                  last30DaysOut={summary.last30DaysOut}
                  transactionCount={summary.transactionCount30d}
                />
              )}
            </div>
          </div>

          {/* Pipeline profits */}
          {pipeline.length > 0 && (
            <PipelineProfits deals={pipeline} />
          )}

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
