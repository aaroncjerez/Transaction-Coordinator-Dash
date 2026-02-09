import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Avatar from '@radix-ui/react-avatar';
import { ChevronDown, ChevronUp, Award } from 'lucide-react';
import { AnimatedProgress } from './ui/AnimatedProgress';
import type { TeamScorecard } from '../../lib/kpi/types';

interface TeamPerformanceProps {
  teamScorecards: TeamScorecard[];
}

export function TeamPerformance({ teamScorecards }: TeamPerformanceProps) {
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  // Sort by status (red first for focus), then by progress
  const sortedTeam = [...teamScorecards].sort((a, b) => {
    const statusOrder: Record<string, number> = { red: 0, yellow: 1, green: 2 };
    const statusDiff = (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1);
    if (statusDiff !== 0) return statusDiff;
    const aProgress = (a.primaryMetric.current / a.primaryMetric.target) * 100;
    const bProgress = (b.primaryMetric.current / b.primaryMetric.target) * 100;
    return bProgress - aProgress;
  });

  const getStatusColor = (status: 'green' | 'yellow' | 'red') => {
    switch (status) {
      case 'green':
        return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', accent: 'bg-green-500' };
      case 'yellow':
        return { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-300', accent: 'bg-amber-500' };
      case 'red':
        return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', accent: 'bg-red-500' };
      default:
        return { bg: 'bg-neutral-100', text: 'text-neutral-700', border: 'border-neutral-300', accent: 'bg-neutral-500' };
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  return (
    <div className="glass-card rounded-xl p-6">
      <h3 className="text-xl font-bold text-neutral-900 mb-6">Team Performance</h3>

      <div className="space-y-3">
        {sortedTeam.map((scorecard, index) => {
          const isExpanded = expandedMember === scorecard.member.name;
          const colors = getStatusColor(scorecard.status);
          const progress = (scorecard.primaryMetric.current / scorecard.primaryMetric.target) * 100;

          return (
            <motion.div
              key={scorecard.member.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05, duration: 0.3 }}
              className={`
                relative
                rounded-lg
                border-2
                ${scorecard.isCrushingIt ? colors.border + ' shadow-md' : 'border-neutral-200'}
                overflow-hidden
                transition-all
              `}
            >
              {/* Accent bar */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${colors.accent}`} />

              {/* Main Content */}
              <button
                onClick={() => setExpandedMember(isExpanded ? null : scorecard.member.name)}
                className="w-full p-4 pl-5 flex items-center gap-4 hover:bg-neutral-50 transition-colors"
              >
                {/* Avatar */}
                <Avatar.Root className="flex-shrink-0 w-12 h-12">
                  <Avatar.Fallback
                    className={`
                      w-full
                      h-full
                      rounded-full
                      ${colors.bg}
                      ${colors.text}
                      font-semibold
                      flex
                      items-center
                      justify-center
                      text-sm
                    `}
                  >
                    {getInitials(scorecard.member.name)}
                  </Avatar.Fallback>
                </Avatar.Root>

                {/* Name and Role */}
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-neutral-900 truncate">
                      {scorecard.member.name}
                    </h4>
                    {scorecard.isCrushingIt && (
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        <Award className="w-3 h-3" />
                        Crushing It
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-neutral-600 capitalize">{scorecard.member.role.replace(/_/g, ' ')}</p>
                </div>

                {/* Primary Metric */}
                <div className="flex-shrink-0 text-right">
                  <div className="text-lg font-bold text-neutral-900">
                    {scorecard.primaryMetric.current.toLocaleString()}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {scorecard.primaryMetric.label}
                  </div>
                </div>

                {/* Progress Indicator */}
                <div className="flex-shrink-0 w-32">
                  <AnimatedProgress
                    value={scorecard.primaryMetric.current}
                    max={scorecard.primaryMetric.target}
                    height="sm"
                    color={scorecard.status === 'green' ? 'success' : scorecard.status === 'yellow' ? 'warning' : 'danger'}
                  />
                </div>

                {/* Expand Icon */}
                <div className="flex-shrink-0">
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-neutral-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-neutral-400" />
                  )}
                </div>
              </button>

              {/* Expanded Details */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-2 pl-5 border-t border-neutral-200 bg-neutral-50/50">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Secondary Metric */}
                        {scorecard.secondaryMetric && (
                          <div>
                            <div className="text-xs text-neutral-600 mb-1">
                              {scorecard.secondaryMetric.label}
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-2xl font-bold text-neutral-900">
                                {scorecard.secondaryMetric.value}
                              </span>
                              {scorecard.secondaryMetric.unit && (
                                <span className="text-sm text-neutral-500">
                                  {scorecard.secondaryMetric.unit}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Target Progress */}
                        <div>
                          <div className="text-xs text-neutral-600 mb-1">Target Progress</div>
                          <div className="text-2xl font-bold text-neutral-900">
                            {Math.round(progress)}%
                          </div>
                        </div>

                        {/* Additional Metrics if available */}
                        {scorecard.primaryMetric.target && (
                          <div className="col-span-2 pt-2">
                            <div className="text-xs text-neutral-600 mb-1">Weekly Target</div>
                            <div className="text-sm text-neutral-700">
                              {scorecard.primaryMetric.target.toLocaleString()} {scorecard.primaryMetric.label}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Team Total */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: sortedTeam.length * 0.05 + 0.2, duration: 0.4 }}
        className="mt-6 pt-6 border-t border-neutral-200"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-neutral-900">Team Total Progress</span>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-neutral-600">
                {sortedTeam.filter((m) => m.status === 'green').length} / {sortedTeam.length} on track
              </div>
            </div>
            <div className="w-32">
              <AnimatedProgress
                value={sortedTeam.filter((m) => m.status === 'green').length}
                max={sortedTeam.length}
                height="md"
                color="success"
              />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default TeamPerformance;
