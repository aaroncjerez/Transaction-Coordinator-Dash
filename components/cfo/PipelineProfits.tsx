import React from 'react';
import { TrendingUp } from 'lucide-react';

interface Deal {
  id: number;
  name: string;
  stage: string;
  buy_price: number;
  profit: number;
  close_date: string | null;
  exit_strategy: string;
}

interface Props {
  active: Deal[];
  closed: Deal[];
}

const STAGE_COLORS: Record<string, string> = {
  'Pending Sale': 'bg-green-500/20 text-green-400',
  'Listed': 'bg-blue-500/20 text-blue-400',
  'Purchase Closed': 'bg-emerald-500/20 text-emerald-400',
  'Purchase Pending': 'bg-violet-500/20 text-violet-400',
  'Hold': 'bg-amber-500/20 text-amber-400',
  'Purchase Contract': 'bg-yellow-500/20 text-yellow-400',
};

const fmt = (n: number) => {
  if (!n) return '—';
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const PipelineProfits: React.FC<Props> = ({ active, closed }) => {
  const totalPipeline = active.reduce((s, d) => s + (d.buy_price || 0), 0);
  const totalProfit = active.reduce((s, d) => s + (d.profit || 0), 0);
  const closedProfit = closed.reduce((s, d) => s + (d.profit || 0), 0);
  const avgClosedProfit = closed.length > 0 ? closedProfit / closed.length : 0;

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-[#30363d]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Deal Pipeline</h3>
          </div>
          <span className="text-xs text-slate-500">{active.length} active · {closed.length} closed</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Capital Out</p>
            <p className="text-sm font-semibold text-red-400 font-mono">{fmt(totalPipeline)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Pipeline Profit</p>
            <p className="text-sm font-bold text-emerald-400 font-mono">{fmt(totalProfit)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Realized</p>
            <p className="text-sm font-semibold text-green-400 font-mono">{fmt(closedProfit)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Avg/Deal</p>
            <p className="text-sm font-semibold text-white font-mono">{fmt(avgClosedProfit)}</p>
          </div>
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#161b22]">
            <tr className="text-[10px] text-slate-500 uppercase tracking-wider">
              <th className="text-left px-5 py-2">Deal</th>
              <th className="text-left px-3 py-2">Stage</th>
              <th className="text-right px-3 py-2">Buy</th>
              <th className="text-right px-3 py-2">Profit</th>
              <th className="text-right px-5 py-2">Close</th>
            </tr>
          </thead>
          <tbody>
            {active.map((d) => (
              <tr key={d.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                <td className="px-5 py-2.5">
                  <p className="text-slate-200 text-xs font-medium">{d.name}</p>
                  {d.exit_strategy && (
                    <p className="text-[10px] text-slate-500">{d.exit_strategy}</p>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded whitespace-nowrap ${STAGE_COLORS[d.stage] || 'bg-slate-500/20 text-slate-400'}`}>
                    {d.stage}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-400">
                  {fmt(d.buy_price)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`font-mono text-xs font-semibold ${d.profit > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {d.profit > 0 ? fmt(d.profit) : '—'}
                  </span>
                </td>
                <td className="px-5 py-2.5 text-right text-xs text-slate-500 font-mono">
                  {fmtDate(d.close_date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
