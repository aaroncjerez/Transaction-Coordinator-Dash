import React from 'react';
import { motion } from 'framer-motion';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Trophy, Target, Zap, TrendingUp, CheckCircle2 } from 'lucide-react';

interface AchievementBadgeProps {
  type: 'target' | 'record' | 'streak' | 'coverage' | 'excellence';
  title: string;
  description?: string;
  achieved?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function AchievementBadge({
  type,
  title,
  description,
  achieved = false,
  size = 'md',
}: AchievementBadgeProps) {
  const icons = {
    target: Target,
    record: Trophy,
    streak: Zap,
    coverage: TrendingUp,
    excellence: CheckCircle2,
  };

  const Icon = icons[type];

  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const badge = (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className={`
        ${sizeClasses[size]}
        rounded-full
        flex
        items-center
        justify-center
        ${achieved
          ? 'bg-green-100 text-green-600'
          : 'bg-neutral-100 text-neutral-400'
        }
        transition-all
        duration-200
      `}
    >
      <Icon className={iconSizes[size]} />
    </motion.div>
  );

  if (description) {
    return (
      <Tooltip.Provider>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            {badge}
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="bg-neutral-900 text-white px-3 py-2 rounded-lg text-sm max-w-xs shadow-lg"
              sideOffset={5}
            >
              <div className="font-semibold mb-1">{title}</div>
              <div className="text-neutral-300 text-xs">{description}</div>
              <Tooltip.Arrow className="fill-neutral-900" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    );
  }

  return badge;
}

export default AchievementBadge;
