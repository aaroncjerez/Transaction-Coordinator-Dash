import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface MonthData {
  month: string;
  income: number;
  expenses: number;
  net: number;
  count?: number;
}

interface Props {
  data: MonthData[];
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmt = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(Math.abs(n) / 1_000).toFixed(1)}K`;
  return `$${Math.abs(n).toFixed(0)}`;
};

const formatMonth = (m: string) => {
  const [year, month] = m.split('-');
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
};

export const MonthlyCashflow: React.FC<Props> = ({ data }) => {
  const [selectedIdx, setSelectedIdx] = useState(data.length - 1);

  if (data.length === 0) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-2">Monthly Cashflow</h3>
        <p className="text-slate-500 text-sm text-center py-6">No data — sync Mercury first</p>
      </div>
    );
  }

  const selected = data[selectedIdx];
  const canPrev = selectedIdx > 0;
  const canNext = selectedIdx < data.length - 1;

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      {/* Month selector */}
      <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-blue-400" />
          <h3 className="text-sm font-semibold text-white">Monthly Cashflow</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => canPrev && setSelectedIdx(selectedIdx - 1)}
            disabled={!canPrev}
            className="p-1 rounded hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            <ChevronLeft size={16} className="text-slate-400" />
          </button>
          <span className="text-sm font-medium text-white min-w-[80px] text-center">
            {formatMonth(selected.month)}
          </span>
          <button
            onClick={() => canNext && setSelectedIdx(selectedIdx + 1)}
            disabled={!canNext}
            className="p-1 rounded hover:bg-white/10 disabled:opacity-30 transition-colors"
          >
            <ChevronRight size={16} className="text-slate-400" />
          </button>
        </div>
      </div>

      {/* Month detail */}
      <div className="p-5 space-y-3">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Money In</p>
            <p className="text-lg font-bold text-green-400 font-mono">{fmt(selected.income)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Money Out</p>
            <p className="text-lg font-bold text-red-400 font-mono">{fmt(selected.expenses)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Net</p>
            <p className={`text-lg font-bold font-mono ${selected.net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {selected.net >= 0 ? '+' : '-'}{fmt(selected.net)}
            </p>
          </div>
        </div>

        {/* Mini month timeline */}
        <div className="pt-2 border-t border-white/10">
          <div className="flex gap-1">
            {data.map((m, i) => {
              const isSelected = i === selectedIdx;
              const barHeight = Math.max(4, Math.min(32, Math.abs(m.net) / (Math.max(...data.map(d => Math.abs(d.net))) || 1) * 32));
              return (
                <button
                  key={m.month}
                  onClick={() => setSelectedIdx(i)}
                  className={`flex-1 flex flex-col items-center gap-1 py-1 rounded transition-colors ${isSelected ? 'bg-white/10' : 'hover:bg-white/5'}`}
                >
                  <div
                    className={`w-full rounded-sm ${m.net >= 0 ? 'bg-green-500/40' : 'bg-red-500/40'} ${isSelected ? '!bg-blue-500/60' : ''}`}
                    style={{ height: `${barHeight}px` }}
                  />
                  <span className={`text-[9px] ${isSelected ? 'text-white font-semibold' : 'text-slate-600'}`}>
                    {MONTH_NAMES[parseInt(m.month.split('-')[1], 10) - 1]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
