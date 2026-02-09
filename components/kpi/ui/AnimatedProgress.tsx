import React from 'react';
import { motion } from 'framer-motion';

interface AnimatedProgressProps {
  value: number;
  max?: number;
  height?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'success' | 'warning' | 'danger';
  showLabel?: boolean;
  label?: string;
  animated?: boolean;
}

export function AnimatedProgress({
  value,
  max = 100,
  height = 'md',
  color = 'primary',
  showLabel = false,
  label,
  animated = true,
}: AnimatedProgressProps) {
  const percentage = Math.min((value / max) * 100, 100);

  const heightClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  const colorClasses = {
    primary: 'bg-blue-500',
    success: 'bg-green-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
  };

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between items-center mb-2">
          {label && <span className="text-sm font-medium text-neutral-700">{label}</span>}
          <span className="text-sm font-semibold text-neutral-900">
            {Math.round(percentage)}%
          </span>
        </div>
      )}

      <div className={`w-full ${heightClasses[height]} bg-neutral-200 rounded-full overflow-hidden`}>
        <motion.div
          className={`${heightClasses[height]} ${colorClasses[color]} rounded-full`}
          initial={animated ? { width: 0 } : { width: `${percentage}%` }}
          animate={{ width: `${percentage}%` }}
          transition={{
            duration: 1,
            ease: [0.4, 0, 0.2, 1],
          }}
        />
      </div>
    </div>
  );
}

export default AnimatedProgress;
