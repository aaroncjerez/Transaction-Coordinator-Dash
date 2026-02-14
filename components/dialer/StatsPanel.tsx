import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, BarChart3 } from 'lucide-react';
import { fetchDialerDailyStats, fetchDialerHotLeads } from '../../lib/database';
import { cn } from '../../lib/utils';

export const StatsPanel: React.FC = () => {
  const [stats, setStats] = useState<any[]>([]);
  const [hotLeads, setHotLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [dailyStats, hot] = await Promise.all([
        fetchDialerDailyStats(14),
        fetchDialerHotLeads(),
      ]);
      setStats(dailyStats);
      setHotLeads(hot);
    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 size={24} className="animate-spin" />
      </div>
    );
  }

  // Summary from today's stats (first entry)
  const today = stats[0];
  const totals = stats.reduce(
    (acc, s) => ({
      calls: acc.calls + (s.total_calls || 0),
      connected: acc.connected + (s.successful_calls || 0),
      voicemail: acc.voicemail + (s.voicemails || 0),
      positive: acc.positive + (s.positive_calls || 0),
    }),
    { calls: 0, connected: 0, voicemail: 0, positive: 0 }
  );

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Today's Calls" value={today?.total_calls || 0} />
        <StatCard label="Connected" value={today?.successful_calls || 0} accent="emerald" />
        <StatCard label="Voicemails" value={today?.voicemails || 0} accent="amber" />
        <StatCard label="Hot Leads" value={hotLeads.length} accent="orange" />
      </div>

      {/* 14-day Summary */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="14-Day Calls" value={totals.calls} />
        <StatCard label="14-Day Connected" value={totals.connected} accent="emerald" />
        <StatCard label="14-Day Voicemails" value={totals.voicemail} accent="amber" />
        <StatCard label="14-Day Positive" value={totals.positive} accent="orange" />
      </div>

      {/* Daily breakdown table */}
      {stats.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
            <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <BarChart3 size={14} /> Daily Breakdown
            </p>
          </div>
          <table className="w-full text-caption">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-3 py-2 text-micro font-medium text-gray-500">Date</th>
                <th className="text-right px-3 py-2 text-micro font-medium text-gray-500">Total</th>
                <th className="text-right px-3 py-2 text-micro font-medium text-gray-500">Connected</th>
                <th className="text-right px-3 py-2 text-micro font-medium text-gray-500">VM</th>
                <th className="text-right px-3 py-2 text-micro font-medium text-gray-500">No Answer</th>
                <th className="text-right px-3 py-2 text-micro font-medium text-gray-500">Positive</th>
                <th className="text-right px-3 py-2 text-micro font-medium text-gray-500">Avg Duration</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((day: any) => (
                <tr key={day.call_date} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700">
                    {new Date(day.call_date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </td>
                  <td className="text-right px-3 py-2 font-medium text-gray-900">{day.total_calls}</td>
                  <td className="text-right px-3 py-2 text-emerald-600">{day.successful_calls}</td>
                  <td className="text-right px-3 py-2 text-amber-600">{day.voicemails}</td>
                  <td className="text-right px-3 py-2 text-gray-500">{day.no_answers}</td>
                  <td className="text-right px-3 py-2 text-orange-600">{day.positive_calls}</td>
                  <td className="text-right px-3 py-2 text-gray-500">
                    {day.avg_call_duration ? `${Math.round(day.avg_call_duration)}s` : '\u2014'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Hot Leads List */}
      {hotLeads.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-xs overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 bg-orange-50">
            <p className="text-sm font-medium text-orange-700">Hot Leads ({hotLeads.length})</p>
          </div>
          <div className="divide-y divide-gray-100">
            {hotLeads.map((lead: any) => (
              <div key={lead.id} className="px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {[lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown'}
                  </p>
                  <p className="text-micro text-gray-400">
                    {[lead.county, lead.state].filter(Boolean).join(', ')}
                    {lead.total_calls > 0 && ` \u2022 ${lead.total_calls} calls`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {lead.next_action_strategy && (
                    <span className="text-micro text-gray-500 max-w-[200px] truncate">{lead.next_action_strategy}</span>
                  )}
                  <span className={cn(
                    'px-1.5 py-0.5 rounded-full text-micro font-bold',
                    lead.heat_level >= 4 ? 'bg-red-100 text-red-700' :
                    lead.heat_level >= 3 ? 'bg-orange-100 text-orange-700' :
                    'bg-amber-100 text-amber-700'
                  )}>
                    {lead.heat_level}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const StatCard: React.FC<{ label: string; value: number; accent?: 'emerald' | 'amber' | 'orange' }> = ({ label, value, accent }) => (
  <div className="bg-white rounded-lg border border-gray-200 shadow-xs p-3.5">
    <p className="text-micro text-gray-500 font-medium">{label}</p>
    <p className={cn(
      'text-2xl font-bold mt-0.5',
      accent === 'emerald' ? 'text-emerald-600' :
      accent === 'amber' ? 'text-amber-600' :
      accent === 'orange' ? 'text-orange-600' :
      'text-gray-900'
    )}>
      {value}
    </p>
  </div>
);
