import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface CategoryData {
  category: string;
  count: number;
  total_out: number;
  total_in: number;
}

interface Props {
  data: CategoryData[];
}

const COLORS: Record<string, string> = {
  revenue: '#22c55e',
  emd: '#a855f7',
  closing_cost: '#3b82f6',
  funding_in: '#10b981',
  funding_out: '#f59e0b',
  payroll: '#ec4899',
  operating: '#64748b',
  other: '#475569',
};

const formatLabel = (s: string) => s.replace(/_/g, ' ');

export const CategoryBreakdown: React.FC<Props> = ({ data }) => {
  const chartData = data
    .filter(d => d.total_out > 0 || d.total_in > 0)
    .map(d => ({
      name: formatLabel(d.category),
      Spent: d.total_out,
      Received: d.total_in,
      color: COLORS[d.category] || COLORS.other,
    }));

  if (chartData.length === 0) {
    return null;
  }

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
      <h3 className="text-sm font-semibold text-white mb-4">Spending by Category (30d)</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} layout="vertical">
          <XAxis
            type="number"
            tick={{ fill: '#64748b', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={90}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e1e3a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]}
          />
          <Bar dataKey="Spent" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} fillOpacity={0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
