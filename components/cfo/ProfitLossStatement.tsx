import React, { useState, useMemo } from 'react';

type ViewMode = 'compact' | 'summary' | 'detailed';

interface PLSubcategory {
  name: string;
  glCode: string;
  amounts: number[];
}

interface PLSection {
  name: string;
  key: string;
  subcategories: PLSubcategory[];
  totals: number[];
}

interface PLData {
  months: string[];
  sections: PLSection[];
  computed: {
    grossProfit: number[];
    operatingIncome: number[];
  };
}

interface Props {
  data: PLData | null;
  isLoading: boolean;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatMonth = (m: string) => {
  const [year, month] = m.split('-');
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
};

const fmtAccounting = (n: number): string => {
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  const formatted = `$${abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return n < 0 ? `(${formatted})` : formatted;
};

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'compact', label: 'Compact' },
  { key: 'summary', label: 'Summary' },
  { key: 'detailed', label: 'Detailed' },
];

export const ProfitLossStatement: React.FC<Props> = ({ data, isLoading }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleSection = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const rows = useMemo(() => {
    if (!data) return [];
    const result: Array<{
      type: 'section' | 'subcategory' | 'subtotal' | 'total';
      label: string;
      amounts: number[];
      indent: number;
      key: string;
      expandable?: boolean;
      bold?: boolean;
      borderTop?: boolean;
      borderDouble?: boolean;
    }> = [];

    for (const section of data.sections) {
      const isExpanded = expanded.has(section.key) || viewMode !== 'compact';

      result.push({
        type: 'section',
        label: section.name,
        amounts: section.totals,
        indent: 0,
        key: section.key,
        expandable: true,
        bold: true,
      });

      if (isExpanded && viewMode !== 'compact') {
        for (const sub of section.subcategories) {
          if (sub.amounts.every(a => a === 0)) continue;
          result.push({
            type: 'subcategory',
            label: viewMode === 'detailed' ? `${sub.glCode} ${sub.name}` : sub.name,
            amounts: sub.amounts,
            indent: 1,
            key: `${section.key}-${sub.name}`,
          });
        }
        if (section.subcategories.length > 1) {
          result.push({
            type: 'subtotal',
            label: `Total ${section.name.charAt(0) + section.name.slice(1).toLowerCase()}`,
            amounts: section.totals,
            indent: 1,
            key: `${section.key}-total`,
            bold: true,
            borderTop: true,
          });
        }
      }

      // Insert computed rows after COST OF REVENUE
      if (section.key === 'COST_OF_REVENUE') {
        result.push({
          type: 'subtotal',
          label: 'GROSS PROFIT',
          amounts: data.computed.grossProfit,
          indent: 0,
          key: 'gross-profit',
          bold: true,
          borderTop: true,
        });
      }
    }

    // Operating Income / Net Income
    result.push({
      type: 'total',
      label: 'NET INCOME',
      amounts: data.computed.operatingIncome,
      indent: 0,
      key: 'net-income',
      bold: true,
      borderDouble: true,
    });

    return result;
  }, [data, viewMode, expanded]);

  if (isLoading) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-6 bg-white/5 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.months.length === 0) {
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-8 text-center">
        <p className="text-slate-500 text-sm">No transaction data — sync Mercury first</p>
      </div>
    );
  }

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[#30363d] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Profit & Loss</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">Cash basis · {data.months.length} months</p>
        </div>
        <div className="flex items-center gap-1 bg-[#0d1117] rounded-md p-0.5">
          {VIEW_MODES.map(mode => (
            <button
              key={mode.key}
              onClick={() => setViewMode(mode.key)}
              className={`px-3 py-1 text-[11px] font-medium rounded transition-colors ${
                viewMode === mode.key
                  ? 'bg-[#30363d] text-white'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-slate-500 uppercase tracking-wider">
              <th className="text-left px-5 py-2.5 sticky left-0 bg-[#161b22] z-10 min-w-[200px]" />
              {data.months.map(m => (
                <th key={m} className="text-right px-4 py-2.5 min-w-[100px] font-medium">
                  {formatMonth(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.key}
                className={`
                  ${row.type === 'section' ? 'bg-white/[0.02]' : ''}
                  ${row.borderDouble ? 'border-t-2 border-[#30363d]' : ''}
                  ${row.borderTop ? 'border-t border-[#30363d]/60' : ''}
                  ${row.type !== 'section' ? 'border-t border-transparent' : ''}
                `}
              >
                <td
                  className={`px-5 py-2 sticky left-0 bg-[#161b22] z-10
                    ${row.indent === 1 ? 'pl-9' : ''}
                    ${row.indent === 2 ? 'pl-14' : ''}
                    ${row.bold ? 'font-semibold' : 'font-normal'}
                    ${row.type === 'section' ? 'text-[11px] uppercase tracking-wider text-slate-400 bg-white/[0.02]' : ''}
                    ${row.type === 'subtotal' ? 'text-xs text-slate-300' : ''}
                    ${row.type === 'total' ? 'text-xs text-white uppercase tracking-wider' : ''}
                    ${row.type === 'subcategory' ? 'text-xs text-slate-400' : ''}
                  `}
                >
                  <button
                    onClick={() => row.expandable ? toggleSection(row.key) : undefined}
                    className={`text-left ${row.expandable ? 'cursor-pointer hover:text-white' : 'cursor-default'}`}
                  >
                    {row.expandable && (
                      <span className="inline-block w-3 mr-1 text-slate-600 text-[10px]">
                        {expanded.has(row.key) || viewMode !== 'compact' ? '▾' : '▸'}
                      </span>
                    )}
                    {row.label}
                  </button>
                </td>
                {row.amounts.map((amount, i) => (
                  <td
                    key={`${row.key}-${data.months[i]}`}
                    className={`text-right px-4 py-2 font-mono text-xs
                      ${row.bold ? 'font-semibold' : 'font-normal'}
                      ${row.type === 'section' ? 'bg-white/[0.02]' : ''}
                      ${amount < 0 ? 'text-red-400' : amount > 0 ? 'text-slate-200' : 'text-slate-600'}
                      ${row.type === 'total' ? 'text-white font-bold' : ''}
                    `}
                  >
                    {amount === 0 ? '$0' : fmtAccounting(amount)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
