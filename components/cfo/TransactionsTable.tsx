import React, { useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, Filter } from 'lucide-react';

interface Transaction {
  id: string;
  amount: number;
  counterparty_name: string | null;
  category: string;
  status: string;
  posted_at: string | null;
  created_at: string;
  kind: string;
  note: string | null;
}

interface Props {
  transactions: Transaction[];
}

const CATEGORY_COLORS: Record<string, string> = {
  revenue: 'bg-green-500/20 text-green-400',
  emd: 'bg-purple-500/20 text-purple-400',
  closing_cost: 'bg-blue-500/20 text-blue-400',
  funding_in: 'bg-emerald-500/20 text-emerald-400',
  funding_out: 'bg-amber-500/20 text-amber-400',
  payroll: 'bg-pink-500/20 text-pink-400',
  operating: 'bg-slate-500/20 text-slate-400',
  other: 'bg-slate-500/20 text-slate-400',
};

const CATEGORIES = ['all', 'revenue', 'emd', 'closing_cost', 'funding_in', 'funding_out', 'payroll', 'operating'];

export const TransactionsTable: React.FC<Props> = ({ transactions }) => {
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? transactions : transactions.filter(t => t.category === filter);

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Recent Transactions</h3>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-500" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-slate-300 focus:outline-none"
          >
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c === 'all' ? 'All' : c.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="max-h-[400px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#1a1a2e]">
            <tr className="text-xs text-slate-500 uppercase tracking-wider">
              <th className="text-left px-5 py-2.5">Date</th>
              <th className="text-left px-3 py-2.5">Counterparty</th>
              <th className="text-left px-3 py-2.5">Category</th>
              <th className="text-right px-5 py-2.5">Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-slate-500">No transactions</td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-5 py-2.5 text-slate-400 font-mono text-xs">
                    {formatDate(t.posted_at || t.created_at)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {t.amount > 0 ? (
                        <ArrowDownLeft size={14} className="text-green-400 flex-shrink-0" />
                      ) : (
                        <ArrowUpRight size={14} className="text-red-400 flex-shrink-0" />
                      )}
                      <span className="text-slate-200 truncate max-w-[200px]">
                        {t.counterparty_name || 'Unknown'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${CATEGORY_COLORS[t.category] || CATEGORY_COLORS.other}`}>
                      {(t.category || 'other').replace('_', ' ')}
                    </span>
                  </td>
                  <td className={`px-5 py-2.5 text-right font-mono font-semibold ${t.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {t.amount > 0 ? '+' : ''}{t.amount < 0 ? '-' : ''}${Math.abs(t.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
