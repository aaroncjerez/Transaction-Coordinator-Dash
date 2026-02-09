import React from 'react';
import { motion } from 'framer-motion';
import { MetricCard } from '../ui/MetricCard';
import type { HalfMillionProgress } from '../../lib/kpi/types';

interface GoalsDashboardProps {
  halfMillionProgress: HalfMillionProgress;
}

export function GoalsDashboard({ halfMillionProgress }: GoalsDashboardProps) {
  const { currentWeek, targets, progress, insights } = halfMillionProgress;

  const goalCards = [
    {
      title: 'Text Volume',
      value: (currentWeek?.totalTexts ?? 0).toLocaleString(),
      target: (targets?.texts ?? 0).toLocaleString(),
      progress: currentWeek?.totalTexts ?? 0,
      targetNum: targets?.texts ?? 0,
      progressPercent: progress?.texts ?? 0,
    },
    {
      title: 'Call Volume',
      value: (currentWeek?.totalCalls ?? 0).toLocaleString(),
      target: (targets?.calls ?? 0).toLocaleString(),
      progress: currentWeek?.totalCalls ?? 0,
      targetNum: targets?.calls ?? 0,
      progressPercent: progress?.calls ?? 0,
    },
    {
      title: 'Hot Leads',
      value: (currentWeek?.hotLeads ?? 0).toLocaleString(),
      target: (targets?.hotLeads ?? 0).toLocaleString(),
      progress: currentWeek?.hotLeads ?? 0,
      targetNum: targets?.hotLeads ?? 0,
      progressPercent: progress?.hotLeads ?? 0,
    },
    {
      title: 'Real Offers',
      value: (currentWeek?.realOffers ?? 0).toLocaleString(),
      target: (targets?.realOffers ?? 0).toLocaleString(),
      progress: currentWeek?.realOffers ?? 0,
      targetNum: targets?.realOffers ?? 0,
      progressPercent: progress?.realOffers ?? 0,
    },
    {
      title: 'Contracts',
      value: (currentWeek?.contracts ?? 0).toFixed(1),
      target: (targets?.contracts ?? 0).toFixed(1),
      progress: currentWeek?.contracts ?? 0,
      targetNum: targets?.contracts ?? 0,
      progressPercent: progress?.contracts ?? 0,
    },
    {
      title: 'Deals Closed',
      value: (currentWeek?.deals ?? 0).toFixed(1),
      target: (targets?.deals ?? 0).toFixed(1),
      progress: currentWeek?.deals ?? 0,
      targetNum: targets?.deals ?? 0,
      progressPercent: progress?.deals ?? 0,
    },
  ];

  const getStatus = (percent: number) => {
    if (percent >= 100) return 'success';
    if (percent >= 70) return 'warning';
    return 'danger';
  };

  return (
    <div className="glass-card rounded-xl p-6">
      <div className="mb-6">
        <h3 className="text-xl font-bold text-neutral-900 mb-1">
          $500K Progress Tracker
        </h3>
        <p className="text-sm text-neutral-600">
          Weekly goals toward $500K annual gross profit target
        </p>
      </div>

      {/* Goal Cards Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {goalCards.map((card, index) => (
          <MetricCard
            key={card.title}
            title={card.title}
            value={card.value}
            target={card.targetNum}
            progress={card.progress}
            status={getStatus(card.progressPercent)}
            subtitle={`Target: ${card.target}`}
            delay={index * 0.05}
          />
        ))}
      </div>

      {/* Key Insights */}
      {insights && insights.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
          className="pt-6 border-t border-neutral-200"
        >
          <h4 className="text-sm font-semibold text-neutral-900 mb-3">
            Key Insights
          </h4>
          <div className="space-y-2">
            {insights.slice(0, 4).map((insight, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + index * 0.1, duration: 0.3 }}
                className="flex items-start gap-2 text-xs text-neutral-700"
              >
                <span className="flex-shrink-0 mt-0.5">{'\u2022'}</span>
                <span>{insight}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Profit Progress */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.4 }}
        className="mt-6 pt-6 border-t border-neutral-200"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-neutral-900">
            Weekly Profit Progress
          </span>
          <span className="text-sm text-neutral-600">
            ${(currentWeek?.profit ?? 0).toLocaleString()} / ${(targets?.profit ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="h-3 bg-neutral-200 rounded-full overflow-hidden">
          <motion.div
            className={`
              h-full
              rounded-full
              ${(progress?.profit ?? 0) >= 100
                ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                : (progress?.profit ?? 0) >= 70
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500'
              }
            `}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(progress?.profit ?? 0, 100)}%` }}
            transition={{ duration: 1.5, ease: [0.4, 0, 0.2, 1] }}
          />
        </div>
        <div className="mt-2 text-xs text-neutral-600">
          {Math.round(progress?.profit ?? 0)}% of weekly profit target
        </div>
      </motion.div>
    </div>
  );
}

export default GoalsDashboard;
