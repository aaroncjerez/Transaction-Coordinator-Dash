import React from 'react';
import { motion } from 'framer-motion';

interface MetricCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  status?: 'success' | 'warning' | 'danger' | 'neutral';
  progress?: number;
  target?: number;
  children?: React.ReactNode;
  delay?: number;
}

export function MetricCard({
  title,
  value,
  subtitle,
  status = 'neutral',
  progress,
  target,
  children,
  delay = 0,
}: MetricCardProps) {
  const statusColors = {
    success: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-700',
      indicator: 'bg-green-500',
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-700',
      indicator: 'bg-amber-500',
    },
    danger: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      indicator: 'bg-red-500',
    },
    neutral: {
      bg: 'bg-neutral-50',
      border: 'border-neutral-200',
      text: 'text-neutral-700',
      indicator: 'bg-neutral-500',
    },
  };

  const colors = statusColors[status];
  const progressPercentage = progress && target ? (progress / target) * 100 : undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.4, 0, 0.2, 1] }}
      className={`
        relative
        rounded-xl
        border-2
        ${colors.border}
        ${colors.bg}
        p-6
        hover-lift
        overflow-hidden
      `}
    >
      {/* Status indicator */}
      <div className={`absolute top-0 left-0 w-1 h-full ${colors.indicator}`} />

      <div className="pl-2">
        <h4 className="text-sm font-semibold text-neutral-600 mb-2">{title}</h4>

        <div className="flex items-baseline gap-2 mb-2">
          <motion.span
            className={`text-3xl font-bold ${colors.text}`}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: delay + 0.1, duration: 0.3 }}
          >
            {value}
          </motion.span>

          {target && (
            <span className="text-sm text-neutral-500">/ {target}</span>
          )}
        </div>

        {subtitle && (
          <p className="text-xs text-neutral-600 mb-3">{subtitle}</p>
        )}

        {progressPercentage !== undefined && (
          <div className="mt-3">
            <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
              <motion.div
                className={colors.indicator}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(progressPercentage, 100)}%` }}
                transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
                style={{ height: '100%' }}
              />
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              {Math.round(progressPercentage)}% of target
            </p>
          </div>
        )}

        {children && (
          <div className="mt-4">
            {children}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default MetricCard;
