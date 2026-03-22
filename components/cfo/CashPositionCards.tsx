import React from 'react';
import { DollarSign, TrendingDown, TrendingUp, Clock } from 'lucide-react';

interface Props {
  totalBalance: number;
  monthlyBurn: number;
  runway: number;
  pipelineProfit?: number;
}

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K`
  : `$${n.toFixed(2)}`;

export const CashPositionCards: React.FC<Props> = ({ totalBalance, monthlyBurn, runway, pipelineProfit }) => {
  const cards = [
    {
      label: 'Cash Position',
      value: fmt(totalBalance),
      icon: DollarSign,
      color: totalBalance > 5000 ? 'text-green-400' : 'text-red-400',
      bg: totalBalance > 5000 ? 'bg-green-500/10' : 'bg-red-500/10',
    },
    {
      label: 'Pipeline Profit',
      value: pipelineProfit != null && pipelineProfit > 0 ? fmt(pipelineProfit) : '—',
      icon: TrendingUp,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Monthly Burn',
      value: fmt(monthlyBurn),
      icon: TrendingDown,
      color: 'text-orange-400',
      bg: 'bg-orange-500/10',
    },
    {
      label: 'Runway',
      value: runway >= 99 ? '99+ mo' : `${runway.toFixed(1)} mo`,
      icon: Clock,
      color: runway > 6 ? 'text-blue-400' : runway > 3 ? 'text-yellow-400' : 'text-red-400',
      bg: runway > 6 ? 'bg-blue-500/10' : runway > 3 ? 'bg-yellow-500/10' : 'bg-red-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-white/5 border border-white/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{c.label}</span>
            <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
              <c.icon size={16} className={c.color} />
            </div>
          </div>
          <p className={`text-2xl font-bold ${c.color}`}>{c.value}</p>
        </div>
      ))}
    </div>
  );
};
