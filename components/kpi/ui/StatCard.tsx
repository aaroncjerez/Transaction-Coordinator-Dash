import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number | string;
  previousValue?: number;
  format?: 'number' | 'currency' | 'percentage';
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: number;
  sparklineData?: number[];
  delay?: number;
}

export function StatCard({
  title,
  value,
  previousValue,
  format = 'number',
  icon,
  trend,
  trendValue,
  sparklineData,
  delay = 0,
}: StatCardProps) {
  // Calculate trend automatically if previousValue provided
  const calculatedTrend = trend || (
    previousValue !== undefined && typeof value === 'number'
      ? value > previousValue ? 'up' : value < previousValue ? 'down' : 'neutral'
      : undefined
  );

  const calculatedTrendValue = trendValue !== undefined
    ? trendValue
    : previousValue !== undefined && typeof value === 'number'
      ? Math.round(((value - previousValue) / previousValue) * 100)
      : undefined;

  const trendIcon = calculatedTrend === 'up'
    ? <TrendingUp className="w-4 h-4" />
    : calculatedTrend === 'down'
      ? <TrendingDown className="w-4 h-4" />
      : <Minus className="w-4 h-4" />;

  const trendColor = calculatedTrend === 'up'
    ? 'text-green-600'
    : calculatedTrend === 'down'
      ? 'text-red-600'
      : 'text-neutral-500';

  const formattedValue = typeof value === 'number'
    ? format === 'currency'
      ? `$${value.toLocaleString()}`
      : format === 'percentage'
        ? `${value}%`
        : value.toLocaleString()
    : value;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.4, 0, 0.2, 1] }}
      className="glass-card rounded-xl p-6 hover-lift"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <p className="text-sm text-neutral-600 font-medium mb-1">{title}</p>
          <div className="flex items-baseline gap-2">
            <motion.h3
              className="text-display-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: delay + 0.2, duration: 0.3 }}
            >
              {formattedValue}
            </motion.h3>
          </div>
        </div>

        {icon && (
          <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
            {icon}
          </div>
        )}
      </div>

      {(calculatedTrend || sparklineData) && (
        <div className="flex items-center justify-between">
          {calculatedTrend && (
            <div className={`flex items-center gap-1 text-sm font-medium ${trendColor}`}>
              {trendIcon}
              {calculatedTrendValue !== undefined && (
                <span>{Math.abs(calculatedTrendValue)}%</span>
              )}
            </div>
          )}

          {sparklineData && sparklineData.length > 0 && (
            <div className="flex-1 max-w-[120px] h-8">
              <svg
                viewBox={`0 0 ${sparklineData.length * 10} 30`}
                className="w-full h-full"
                preserveAspectRatio="none"
              >
                <polyline
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth="2"
                  points={sparklineData
                    .map((val, i) => {
                      const x = i * 10;
                      const y = 30 - (val / Math.max(...sparklineData)) * 30;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                />
              </svg>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

export default StatCard;
