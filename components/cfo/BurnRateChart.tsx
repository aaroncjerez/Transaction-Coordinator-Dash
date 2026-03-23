import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface MonthData {
  month: string;
  income: number;
  expenses: number;
}

interface Props {
  data: MonthData[];
}

const formatMonth = (m: string) => {
  const [year, month] = m.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return names[parseInt(month, 10) - 1] || m;
};

const formatK = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`;

export const BurnRateChart: React.FC<Props> = ({ data }) => {
  const chartData = data.map(d => ({
    name: formatMonth(d.month),
    Income: d.income,
    Expenses: d.expenses,
  }));

  if (chartData.length === 0) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
        <h3 className="text-sm font-semibold text-white mb-4">Monthly Cash Flow</h3>
        <p className="text-slate-500 text-sm text-center py-8">No data yet — sync transactions first</p>
      </div>
    );
  }

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-5">
      <h3 className="text-sm font-semibold text-white mb-4">Monthly Cash Flow</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatK} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1e1e3a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#94a3b8' }}
            formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]}
          />
          <Area type="monotone" dataKey="Income" stroke="#22c55e" fill="url(#incomeGrad)" strokeWidth={2} />
          <Area type="monotone" dataKey="Expenses" stroke="#ef4444" fill="url(#expenseGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
