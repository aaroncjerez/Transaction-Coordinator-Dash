import { motion } from 'framer-motion';

interface ProgressBarProps {
  current: number;
  target: number;
  label?: string;
  showValues?: boolean;
  size?: 'sm' | 'md' | 'lg';
  color?: 'green' | 'yellow' | 'red' | 'blue' | 'auto';
  animate?: boolean;
}

export function ProgressBar({
  current,
  target,
  label,
  showValues = true,
  size = 'md',
  color = 'auto',
  animate = true,
}: ProgressBarProps) {
  const percentage = Math.min((current / target) * 100, 100);

  // Auto-determine color based on progress
  const getAutoColor = () => {
    if (percentage >= 100) return 'green';
    if (percentage >= 75) return 'blue';
    if (percentage >= 50) return 'yellow';
    return 'red';
  };

  const actualColor = color === 'auto' ? getAutoColor() : color;

  const colorClasses = {
    green: 'bg-gradient-to-r from-green-400 to-green-500',
    yellow: 'bg-gradient-to-r from-yellow-400 to-yellow-500',
    red: 'bg-gradient-to-r from-red-400 to-red-500',
    blue: 'bg-gradient-to-r from-blue-400 to-blue-500',
  };

  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
  };

  return (
    <div className="w-full">
      {(label || showValues) && (
        <div className="flex items-center justify-between mb-1">
          {label && (
            <span className="text-sm font-medium text-gray-700">{label}</span>
          )}
          {showValues && (
            <span className="text-sm text-gray-500">
              {current.toLocaleString()} / {target.toLocaleString()}
            </span>
          )}
        </div>
      )}
      <div className={`w-full bg-gray-100 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        {animate ? (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`h-full rounded-full ${colorClasses[actualColor]}`}
          />
        ) : (
          <div
            className={`h-full rounded-full ${colorClasses[actualColor]}`}
            style={{ width: `${percentage}%` }}
          />
        )}
      </div>
    </div>
  );
}

// Circular progress for compact displays
interface CircularProgressProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  color?: 'green' | 'yellow' | 'red' | 'blue';
  showValue?: boolean;
}

export function CircularProgress({
  value,
  max,
  size = 60,
  strokeWidth = 6,
  color = 'blue',
  showValue = true,
}: CircularProgressProps) {
  const percentage = Math.min((value / max) * 100, 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  const colorValues = {
    green: '#22c55e',
    yellow: '#eab308',
    red: '#ef4444',
    blue: '#3b82f6',
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colorValues[color]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          style={{
            strokeDasharray: circumference,
          }}
        />
      </svg>
      {showValue && (
        <span className="absolute text-sm font-semibold text-gray-700">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
}
