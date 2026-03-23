import React from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface SparklinePoint {
  date: string;
  value: number;
}

interface MetricCard {
  label: string;
  value: string;
  sparkline?: SparklinePoint[];
  sparkColor?: string;
  delta?: { value: number; label: string };
  subtitle?: string;
}

interface Props {
  summary: {
    totalBalance: number;
    monthlyBurn: number;
    runway: number;
    last30DaysIn: number;
    last30DaysOut: number;
    transactionCount30d: number;
  };
  sparklines: {
    cash: SparklinePoint[];
    spend: SparklinePoint[];
    revenue: SparklinePoint[];
  };
  pipeline: {
    active: any[];
    closed: any[];
  };
  pipelineProfit: number;
}

const fmt = (n: number, compact = false) => {
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (compact && abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (compact && abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  if (compact && abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const Card: React.FC<{ card: MetricCard }> = ({ card }) => {
  const DeltaIcon = card.delta
    ? card.delta.value > 0 ? TrendingUp : card.delta.value < 0 ? TrendingDown : Minus
    : Minus;

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 flex flex-col justify-between min-h-[120px]">
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{card.label}</p>
        {card.delta && (
          <div className={`flex items-center gap-0.5 text-[10px] font-medium ${
            card.delta.value > 0 ? 'text-emerald-400' : card.delta.value < 0 ? 'text-red-400' : 'text-slate-500'
          }`}>
            <DeltaIcon size={10} />
            <span>{card.delta.label}</span>
          </div>
        )}
      </div>
      <p className="text-xl font-bold font-mono text-white mt-1">{card.value}</p>
      {card.subtitle && (
        <p className="text-[10px] text-slate-600 mt-0.5">{card.subtitle}</p>
      )}
      {card.sparkline && card.sparkline.length > 2 && (
        <div className="mt-2 h-[28px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={card.sparkline}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={card.sparkColor || '#6366f1'}
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export const FinancialInsightsGrid: React.FC<Props> = ({ summary, sparklines, pipeline, pipelineProfit }) => {
  const closedProfit = pipeline.closed.reduce((s: number, d: any) => s + (d.profit || 0), 0);
  const avgMargin = pipeline.closed.length > 0
    ? pipeline.closed.reduce((s: number, d: any) => {
        const m = d.buy_price > 0 ? (d.profit / d.buy_price) * 100 : 0;
        return s + m;
      }, 0) / pipeline.closed.length
    : 0;

  const cards: MetricCard[] = [
    {
      label: 'Cash & Investments',
      value: fmt(summary.totalBalance),
      sparkline: sparklines.cash,
      sparkColor: '#a78bfa',
    },
    {
      label: 'Monthly Spend',
      value: fmt(summary.monthlyBurn),
      sparkline: sparklines.spend,
      sparkColor: '#22c55e',
    },
    {
      label: 'Revenue (30d)',
      value: fmt(summary.last30DaysIn),
      sparkline: sparklines.revenue,
      sparkColor: '#6366f1',
    },
    {
      label: 'Pipeline Profit',
      value: fmt(pipelineProfit),
      subtitle: `${pipeline.active.length} active deals`,
    },
    {
      label: 'Net Burn MoM',
      value: `(${fmt(summary.last30DaysOut - summary.last30DaysIn)})`,
      subtitle: 'Expenses − Revenue',
    },
    {
      label: 'Runway',
      value: summary.runway >= 99 ? 'Infinite' : `${summary.runway.toFixed(1)} mo`,
      subtitle: 'At current burn rate',
    },
    {
      label: 'Realized Profit',
      value: fmt(closedProfit),
      subtitle: `${pipeline.closed.length} deals closed`,
    },
    {
      label: 'Avg Deal Margin',
      value: `${avgMargin.toFixed(1)}%`,
      subtitle: `Avg profit: ${fmt(pipeline.closed.length > 0 ? closedProfit / pipeline.closed.length : 0, true)}`,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map((card) => (
        <Card key={card.label} card={card} />
      ))}
    </div>
  );
};
