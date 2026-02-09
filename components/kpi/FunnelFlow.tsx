import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useCountUp } from '../../lib/kpi/hooks/useCountUp';

interface FunnelStage {
  label: string;
  value: number;
  target: number;
  color: 'blue' | 'indigo' | 'purple' | 'pink' | 'green';
}

interface FunnelFlowProps {
  stages: FunnelStage[];
}

export function FunnelFlow({ stages }: FunnelFlowProps) {
  const colorMap = {
    blue: {
      bg: 'bg-blue-100',
      text: 'text-blue-700',
      border: 'border-blue-200',
      gradient: 'from-blue-500 to-blue-600',
    },
    indigo: {
      bg: 'bg-indigo-100',
      text: 'text-indigo-700',
      border: 'border-indigo-200',
      gradient: 'from-indigo-500 to-indigo-600',
    },
    purple: {
      bg: 'bg-purple-100',
      text: 'text-purple-700',
      border: 'border-purple-200',
      gradient: 'from-purple-500 to-purple-600',
    },
    pink: {
      bg: 'bg-pink-100',
      text: 'text-pink-700',
      border: 'border-pink-200',
      gradient: 'from-pink-500 to-pink-600',
    },
    green: {
      bg: 'bg-green-100',
      text: 'text-green-700',
      border: 'border-green-200',
      gradient: 'from-green-500 to-green-600',
    },
  };

  return (
    <div className="glass-card rounded-xl p-6">
      <h3 className="text-xl font-bold text-neutral-900 mb-6">Conversion Funnel</h3>

      <div className="flex items-center justify-between gap-3">
        {stages.map((stage, index) => {
          const colors = colorMap[stage.color];
          const percentage = (stage.value / stage.target) * 100;
          const status =
            percentage >= 100 ? 'success' : percentage >= 70 ? 'warning' : 'danger';

          return (
            <React.Fragment key={stage.label}>
              {/* Funnel Stage */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1, duration: 0.4 }}
                className="flex-1"
              >
                <FunnelStageCard
                  label={stage.label}
                  value={stage.value}
                  target={stage.target}
                  percentage={percentage}
                  colors={colors}
                  delay={index * 0.1}
                />
              </motion.div>

              {/* Arrow Connector */}
              {index < stages.length - 1 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 + 0.2, duration: 0.3 }}
                  className="flex-shrink-0"
                >
                  <ArrowRight className="w-6 h-6 text-neutral-400" />
                </motion.div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Conversion Rates */}
      <div className="mt-6 pt-6 border-t border-neutral-200">
        <div className="flex items-center justify-between text-sm">
          {stages.slice(0, -1).map((stage, index) => {
            const nextStage = stages[index + 1];
            const conversionRate =
              stage.value > 0 ? (nextStage.value / stage.value) * 100 : 0;

            return (
              <div key={`conversion-${index}`} className="flex items-center gap-2">
                <span className="text-neutral-600">
                  {stage.label} → {nextStage.label}:
                </span>
                <span className="font-semibold text-neutral-900">
                  {conversionRate.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface FunnelStageCardProps {
  label: string;
  value: number;
  target: number;
  percentage: number;
  colors: {
    bg: string;
    text: string;
    border: string;
    gradient: string;
  };
  delay: number;
}

function FunnelStageCard({
  label,
  value,
  target,
  percentage,
  colors,
  delay,
}: FunnelStageCardProps) {
  const animatedValue = useCountUp(value, { duration: 1000, easing: 'easeOut' });

  const statusEmoji = percentage >= 100 ? '\u2713' : percentage >= 70 ? '\u25CB' : '!';

  return (
    <div
      className={`
        relative
        rounded-lg
        border-2
        ${colors.border}
        ${colors.bg}
        p-4
        hover:shadow-md
        transition-shadow
      `}
    >
      {/* Status indicator */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wide">
          {label}
        </span>
        <span className="text-sm">{statusEmoji}</span>
      </div>

      {/* Value */}
      <div className="mb-2">
        <motion.div
          className={`text-2xl font-bold ${colors.text}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: delay + 0.2 }}
        >
          {value < 1 && target < 1
            ? value.toFixed(2)
            : Math.round(value).toLocaleString()}
        </motion.div>
        <div className="text-xs text-neutral-600">
          {target < 1 ? (
            <>
              Target: {target.toFixed(2)}/week
              <span className="text-neutral-500"> ({(target * 4).toFixed(1)}/mo)</span>
            </>
          ) : (
            <>Target: {target.toLocaleString()}</>
          )}
        </div>
      </div>

      {/* Mini progress bar */}
      <div className="h-1.5 bg-white rounded-full overflow-hidden">
        <motion.div
          className={`h-full bg-gradient-to-r ${colors.gradient}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(percentage, 100)}%` }}
          transition={{ duration: 1, ease: [0.4, 0, 0.2, 1], delay: delay + 0.3 }}
        />
      </div>

      {/* Percentage */}
      <div className="mt-2 text-xs font-medium text-neutral-600">
        {Math.round(percentage)}%
      </div>
    </div>
  );
}

export default FunnelFlow;
