import React from 'react';
import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { AchievementBadge } from './ui/AchievementBadge';
import { Achievement } from '../../lib/kpi/achievements';

interface KpiHeaderProps {
  weekEnding: string;
  weekStarting: string;
  overallProgress: number;
  achievements: Achievement[];
}

export function KpiHeader({
  weekEnding,
  weekStarting,
  overallProgress,
  achievements,
}: KpiHeaderProps) {
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const achievedCount = achievements.filter(a => a.achieved).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass-card rounded-xl p-6 mb-6"
    >
      <div className="flex items-center justify-between">
        {/* Left: Greeting and Week Info */}
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 mb-1">
            {getGreeting()}, Aaron
          </h1>
          <p className="text-sm text-neutral-600">
            Week of {formatDate(weekStarting)} - {formatDate(weekEnding)}
          </p>
        </div>

        {/* Right: Progress and Achievements */}
        <div className="flex items-center gap-6">
          {/* Overall Progress */}
          <div className="flex flex-col items-end">
            <span className="text-sm text-neutral-600 mb-2">Overall Progress</span>
            <div className="flex items-center gap-2">
              <div className="w-32 h-2 bg-neutral-200 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-blue-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(overallProgress, 100)}%` }}
                  transition={{ duration: 1, ease: [0.4, 0, 0.2, 1] }}
                />
              </div>
              <span className="text-sm font-semibold text-neutral-900 min-w-[3ch]">
                {Math.round(overallProgress)}%
              </span>
            </div>
          </div>

          {/* Achievements */}
          {achievedCount > 0 && (
            <div className="relative">
              <button
                className="
                  w-10
                  h-10
                  rounded-full
                  bg-neutral-100
                  hover:bg-neutral-200
                  flex
                  items-center
                  justify-center
                  transition-colors
                  relative
                "
              >
                <Bell className="w-5 h-5 text-neutral-700" />
                {achievedCount > 0 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="
                      absolute
                      -top-1
                      -right-1
                      w-5
                      h-5
                      bg-green-500
                      rounded-full
                      flex
                      items-center
                      justify-center
                      text-white
                      text-xs
                      font-bold
                    "
                  >
                    {achievedCount}
                  </motion.div>
                )}
              </button>
            </div>
          )}

          {/* Achievement Badges (show first 3) */}
          {achievements.length > 0 && (
            <div className="flex gap-2">
              {achievements.slice(0, 3).map((achievement) => (
                <AchievementBadge
                  key={achievement.id}
                  type={achievement.type}
                  title={achievement.title}
                  description={achievement.description}
                  achieved={achievement.achieved}
                  size="md"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default KpiHeader;
