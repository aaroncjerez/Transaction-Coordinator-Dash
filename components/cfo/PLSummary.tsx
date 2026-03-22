import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface Props {
  last30DaysIn: number;
  last30DaysOut: number;
  transactionCount: number;
}

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K`
  : `$${n.toFixed(2)}`;

export const PLSummary: React.FC<Props> = ({ last30DaysIn, last30DaysOut, transactionCount }) => {
  const net = last30DaysIn - last30DaysOut;
  const isPositive = net >= 0;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-4">Last 30 Days P&L</h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowDownRight size={14} className="text-green-400" />
            <span className="text-sm text-slate-400">Income</span>
          </div>
          <span className="text-sm font-semibold text-green-400 font-mono">{fmt(last30DaysIn)}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowUpRight size={14} className="text-red-400" />
            <span className="text-sm text-slate-400">Expenses</span>
          </div>
          <span className="text-sm font-semibold text-red-400 font-mono">{fmt(last30DaysOut)}</span>
        </div>
        <div className="border-t border-white/10 pt-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Net</span>
          <span className={`text-sm font-bold font-mono ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
            {isPositive ? '+' : '-'}{fmt(Math.abs(net))}
          </span>
        </div>
        <p className="text-xs text-slate-500 pt-1">{transactionCount} transactions</p>
      </div>
    </div>
  );
};
