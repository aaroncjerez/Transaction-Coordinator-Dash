import React, { useState, useEffect, useCallback } from 'react';
import { fetchDialerDailyStats, fetchDialerTodayCallCount } from '../../lib/database';

export const StatsSummaryStrip: React.FC = () => {
  const [todayCalls, setTodayCalls] = useState(0);
  const [connected, setConnected] = useState(0);
  const [connectRate, setConnectRate] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [count, stats] = await Promise.all([
        fetchDialerTodayCallCount(),
        fetchDialerDailyStats(1),
      ]);
      setTodayCalls(count);
      const today = stats?.[0];
      if (today) {
        setConnected(today.successful_calls || 0);
        setConnectRate(today.connect_rate ?? null);
      }
    } catch (err) {
      console.error('Error loading stats strip:', err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const items = [
    { label: 'Today', value: todayCalls },
    { label: 'Connected', value: connected },
    { label: 'Rate', value: connectRate != null ? `${connectRate}%` : '—' },
  ];

  return (
    <div className="flex items-center gap-4">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="text-micro text-gray-400">{item.label}</span>
          <span className="text-caption font-semibold text-gray-700 tabular-nums">{item.value}</span>
        </div>
      ))}
    </div>
  );
};
