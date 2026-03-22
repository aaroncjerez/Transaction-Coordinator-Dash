import React from 'react';
import { TrendingUp, ArrowRight } from 'lucide-react';

interface Deal {
  id: string;
  name: string;
  stage: string;
  sell_price: number;
  buy_price: number;
  county: string;
  state: string;
  acreage: string;
  deal_type: string;
  funder: string;
  realtor_opinion: number;
}

interface Props {
  deals: Deal[];
}

const STAGE_COLORS: Record<string, string> = {
  'Sale Escrow': 'bg-green-500/20 text-green-400',
  'Listed For Sale': 'bg-blue-500/20 text-blue-400',
  'Send To Escrow': 'bg-emerald-500/20 text-emerald-400',
  'Purchase Agreement Sent': 'bg-violet-500/20 text-violet-400',
  'Purchase Escrow': 'bg-amber-500/20 text-amber-400',
  'Due Diligence': 'bg-yellow-500/20 text-yellow-400',
};

const STAGE_SHORT: Record<string, string> = {
  'Sale Escrow': 'Sale Escrow',
  'Listed For Sale': 'Listed',
  'Send To Escrow': 'To Escrow',
  'Purchase Agreement Sent': 'PA Sent',
  'Purchase Escrow': 'Buy Escrow',
  'Due Diligence': 'Due Diligence',
};

const fmt = (n: number) => {
  if (!n || n === 0) return '—';
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};

export const PipelineProfits: React.FC<Props> = ({ deals }) => {
  const totalBuy = deals.reduce((s, d) => s + (d.buy_price || 0), 0);
  const totalSell = deals.reduce((s, d) => s + (d.sell_price || 0), 0);
  const totalProfit = deals.reduce((s, d) => {
    const sell = d.sell_price || d.realtor_opinion || 0;
    const buy = d.buy_price || 0;
    return (sell && buy) ? s + (sell - buy) : s;
  }, 0);

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      {/* Summary header */}
      <div className="px-5 py-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">Incoming Profits</h3>
          </div>
          <span className="text-xs text-slate-500">{deals.length} active deals</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Capital Deployed</p>
            <p className="text-sm font-semibold text-red-400 font-mono">{fmt(totalBuy)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Expected Revenue</p>
            <p className="text-sm font-semibold text-green-400 font-mono">{fmt(totalSell)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">Projected Profit</p>
            <p className="text-sm font-bold text-emerald-400 font-mono">{fmt(totalProfit)}</p>
          </div>
        </div>
      </div>

      {/* Deal table */}
      <div className="max-h-[400px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#1a1a2e]">
            <tr className="text-[10px] text-slate-500 uppercase tracking-wider">
              <th className="text-left px-5 py-2">Seller</th>
              <th className="text-left px-3 py-2">Stage</th>
              <th className="text-right px-3 py-2">Buy</th>
              <th className="text-center px-1 py-2"></th>
              <th className="text-right px-3 py-2">Sell</th>
              <th className="text-right px-5 py-2">Profit</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => {
              const sell = d.sell_price || d.realtor_opinion || 0;
              const profit = (sell && d.buy_price) ? sell - d.buy_price : null;
              const location = [d.county, d.state].filter(Boolean).join(', ');

              return (
                <tr key={d.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-5 py-2.5">
                    <p className="text-slate-200 text-xs font-medium">{d.name}</p>
                    {location && (
                      <p className="text-[10px] text-slate-500">
                        {location}
                        {d.acreage ? ` · ${d.acreage} ac` : ''}
                        {d.deal_type ? ` · ${d.deal_type}` : ''}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded whitespace-nowrap ${STAGE_COLORS[d.stage] || 'bg-slate-500/20 text-slate-400'}`}>
                      {STAGE_SHORT[d.stage] || d.stage}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-400">
                    {fmt(d.buy_price)}
                  </td>
                  <td className="px-1 py-2.5 text-center">
                    <ArrowRight size={10} className="text-slate-600 inline" />
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs text-green-400">
                    {fmt(sell)}
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    {profit !== null ? (
                      <span className={`font-mono text-xs font-semibold ${profit > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {fmt(profit)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500">TBD</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
