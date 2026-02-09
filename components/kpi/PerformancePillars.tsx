import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, TrendingUp, Trophy, X } from 'lucide-react';
import type { FourLevers, StatusColor } from '../../lib/kpi/types';

interface PerformancePillarsProps {
  fourLevers: FourLevers;
}

export function PerformancePillars({ fourLevers }: PerformancePillarsProps) {
  const [selectedLever, setSelectedLever] = useState<string | null>(null);

  const pillars = [
    {
      id: 'yield',
      label: 'Yield',
      icon: Target,
      lever: fourLevers.yield,
      description: 'Hot leads generated per 1,000 texts sent',
      color: 'blue',
    },
    {
      id: 'coverage',
      label: 'Coverage',
      icon: TrendingUp,
      lever: fourLevers.offerCoverage,
      description: 'Percentage of hot leads receiving offers',
      color: 'indigo',
    },
    {
      id: 'closeRate',
      label: 'Close Rate',
      icon: Trophy,
      lever: fourLevers.closeRate,
      description: 'Percentage of offers converting to deals',
      color: 'pink',
    },
  ];

  const getStatusColor = (status: StatusColor) => {
    switch (status) {
      case 'green':
        return { bg: 'bg-green-500', text: 'text-green-600', light: 'bg-green-100' };
      case 'yellow':
        return { bg: 'bg-amber-500', text: 'text-amber-600', light: 'bg-amber-100' };
      case 'red':
        return { bg: 'bg-red-500', text: 'text-red-600', light: 'bg-red-100' };
      default:
        return { bg: 'bg-neutral-500', text: 'text-neutral-600', light: 'bg-neutral-100' };
    }
  };

  return (
    <>
      <div className="glass-card rounded-xl p-6">
        <h3 className="text-xl font-bold text-neutral-900 mb-6">
          Performance Pillars
        </h3>

        <div className="grid grid-cols-3 gap-6">
          {pillars.map((pillar, index) => {
            const colors = getStatusColor(pillar.lever.status);
            const percentage = (pillar.lever.value / pillar.lever.target) * 100;
            const Icon = pillar.icon;

            return (
              <motion.button
                key={pillar.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.4 }}
                onClick={() => setSelectedLever(pillar.id)}
                className="
                  group
                  relative
                  flex
                  flex-col
                  items-center
                  p-4
                  rounded-lg
                  border-2
                  border-neutral-200
                  hover:border-neutral-300
                  hover:shadow-md
                  transition-all
                  cursor-pointer
                "
              >
                {/* Icon */}
                <div className={`w-12 h-12 rounded-full ${colors.light} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-6 h-6 ${colors.text}`} />
                </div>

                {/* Label */}
                <div className="text-sm font-semibold text-neutral-900 mb-2">
                  {pillar.label}
                </div>

                {/* Value */}
                <div className={`text-2xl font-bold ${colors.text} mb-2`}>
                  {pillar.lever.value.toFixed(1)}
                  {pillar.id === 'coverage' || pillar.id === 'closeRate' ? '%' : ''}
                </div>

                {/* Target */}
                <div className="text-xs text-neutral-500 mb-3">
                  Target: {pillar.lever.target}
                  {pillar.id === 'coverage' || pillar.id === 'closeRate' ? '%' : ''}
                </div>

                {/* Visual Pillar */}
                <div className="w-full h-24 bg-neutral-100 rounded-md overflow-hidden relative">
                  <motion.div
                    className={`absolute bottom-0 left-0 right-0 ${colors.bg} rounded-t-md`}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.min(percentage, 100)}%` }}
                    transition={{ duration: 1, ease: [0.4, 0, 0.2, 1], delay: index * 0.1 + 0.3 }}
                  />
                  {/* Target line */}
                  <div className="absolute left-0 right-0 h-0.5 bg-neutral-400 top-0" />
                </div>

                {/* Percentage */}
                <div className="mt-2 text-xs font-semibold text-neutral-700">
                  {Math.round(percentage)}%
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedLever && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedLever(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="glass-card rounded-2xl p-8 max-w-lg w-full relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setSelectedLever(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-neutral-600" />
              </button>

              {(() => {
                const pillar = pillars.find((p) => p.id === selectedLever);
                if (!pillar) return null;

                const colors = getStatusColor(pillar.lever.status);
                const Icon = pillar.icon;

                return (
                  <>
                    <div className="flex items-center gap-4 mb-6">
                      <div className={`w-16 h-16 rounded-full ${colors.light} flex items-center justify-center`}>
                        <Icon className={`w-8 h-8 ${colors.text}`} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-neutral-900">
                          {pillar.label}
                        </h3>
                        <p className="text-sm text-neutral-600">
                          {pillar.description}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm text-neutral-600">Current</span>
                        <span className={`text-3xl font-bold ${colors.text}`}>
                          {pillar.lever.value.toFixed(1)}
                          {pillar.id === 'coverage' || pillar.id === 'closeRate' ? '%' : ''}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between">
                        <span className="text-sm text-neutral-600">Target</span>
                        <span className="text-2xl font-semibold text-neutral-900">
                          {pillar.lever.target}
                          {pillar.id === 'coverage' || pillar.id === 'closeRate' ? '%' : ''}
                        </span>
                      </div>

                      <div className="pt-4 border-t border-neutral-200">
                        <div className={`px-4 py-3 rounded-lg ${colors.light}`}>
                          <h4 className="text-sm font-semibold text-neutral-900 mb-2">
                            Action Item
                          </h4>
                          <p className={`text-sm ${colors.text}`}>
                            {pillar.lever.action}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4">
                        <span className="text-sm font-medium text-neutral-600">Status</span>
                        <span
                          className={`
                            px-3
                            py-1
                            rounded-full
                            text-sm
                            font-semibold
                            ${colors.light}
                            ${colors.text}
                          `}
                        >
                          {pillar.lever.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default PerformancePillars;
