import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Target } from 'lucide-react';
import { ProgressRing } from '../ui/ProgressRing';
import { useCountUp } from '../../lib/kpi/hooks/useCountUp';

interface HeroKPIProps {
  current: number;
  target: number;
  label?: string;
  subtitle?: string;
}

export function HeroKPI({
  current,
  target,
  label = 'Contracts Signed',
  subtitle = 'This Week',
}: HeroKPIProps) {
  const animatedCurrent = useCountUp(current, { duration: 1500, easing: 'easeOut' });
  const percentage = (current / target) * 100;
  const gap = target - current;
  const isAchieved = current >= target;
  const exceeding = current > target;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className={`
        glass-card
        rounded-2xl
        p-8
        relative
        overflow-hidden
        ${isAchieved ? 'shadow-xl shadow-green-500/20' : ''}
      `}
    >
      {/* Background gradient for achieved state */}
      {isAchieved && (
        <div
          className="absolute inset-0 opacity-5"
          style={{
            background: 'radial-gradient(circle at top right, var(--color-success), transparent 70%)',
          }}
        />
      )}

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-8">
          {/* Left: Title and subtitle */}
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-1">
              The Number That Matters
            </h2>
            <p className="text-neutral-600">{subtitle}</p>
          </div>

          {/* Right: Status Badge */}
          {isAchieved && (
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
              className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full font-semibold text-sm"
            >
              <CheckCircle2 className="w-5 h-5" />
              Target Achieved
            </motion.div>
          )}
        </div>

        <div className="flex items-center gap-12">
          {/* Left: Progress Ring */}
          <div className="flex-shrink-0">
            <ProgressRing
              value={current}
              max={target}
              size={200}
              strokeWidth={12}
              color={isAchieved ? 'success' : percentage >= 70 ? 'primary' : 'warning'}
              showPercentage={false}
            />
          </div>

          {/* Middle: Main Display */}
          <div className="flex-1">
            <div className="mb-6">
              <div className="flex items-baseline gap-4">
                <motion.div
                  className="text-display-1"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                >
                  {animatedCurrent}
                </motion.div>
                <div className="text-4xl text-neutral-400 font-light">/</div>
                <div className="text-4xl text-neutral-600 font-bold">{target}</div>
              </div>
              <p className="text-lg text-neutral-600 mt-2">{label}</p>
            </div>

            {/* Progress Bar */}
            <div className="mb-6">
              <div className="h-3 bg-neutral-200 rounded-full overflow-hidden">
                <motion.div
                  className={`
                    h-full
                    rounded-full
                    ${isAchieved
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : percentage >= 70
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600'
                        : 'bg-gradient-to-r from-amber-500 to-orange-500'
                    }
                  `}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(percentage, 100)}%` }}
                  transition={{ duration: 1.5, ease: [0.4, 0, 0.2, 1] }}
                />
              </div>
            </div>

            {/* Gap Analysis */}
            <div className="flex items-center gap-6 text-sm">
              {gap > 0 ? (
                <>
                  <div className="flex items-center gap-2 text-amber-600">
                    <Target className="w-4 h-4" />
                    <span className="font-medium">
                      {gap} more to reach target
                    </span>
                  </div>
                </>
              ) : exceeding ? (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">
                    Exceeded target by {Math.abs(gap)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="font-medium">
                    Target achieved
                  </span>
                </div>
              )}

              <div className="text-neutral-500">
                {Math.round(percentage)}% complete
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default HeroKPI;
