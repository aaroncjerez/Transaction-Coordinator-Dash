import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, TrendingUp, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, User } from 'lucide-react';
import type { CEOBrief } from '../../lib/kpi/types';
import { fetchKpiCeoBrief } from '../../lib/database';

interface InsightsPanelProps {
  ceoBrief: CEOBrief | null;
  isLoading?: boolean;
  onGenerate?: () => void;
}

export function InsightsPanel({ ceoBrief, isLoading = false, onGenerate }: InsightsPanelProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
            <Brain className="w-6 h-6 text-purple-600 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-neutral-900">AI Strategic Insights</h3>
            <p className="text-sm text-neutral-600">Analyzing your performance...</p>
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-shimmer h-16 bg-neutral-200 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!ceoBrief || !Array.isArray(ceoBrief.priorities) || ceoBrief.priorities.length === 0) {
    return (
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
            <Brain className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-neutral-900">AI Strategic Insights</h3>
            <p className="text-sm text-neutral-600">Get personalized priorities</p>
          </div>
        </div>
        {onGenerate && (
          <button
            onClick={onGenerate}
            className="
              w-full
              px-4
              py-3
              bg-purple-100
              text-purple-700
              rounded-lg
              font-medium
              hover:bg-purple-200
              transition-colors
            "
          >
            Generate Insights
          </button>
        )}
      </div>
    );
  }

  const getPriorityIcon = (index: number) => {
    if (index === 0) return <AlertTriangle className="w-5 h-5 text-red-600" />;
    if (index === 1) return <TrendingUp className="w-5 h-5 text-amber-600" />;
    return <CheckCircle2 className="w-5 h-5 text-green-600" />;
  };

  const getPriorityColor = (index: number) => {
    if (index === 0) return 'bg-red-50 border-red-200 text-red-700';
    if (index === 1) return 'bg-amber-50 border-amber-200 text-amber-700';
    return 'bg-green-50 border-green-200 text-green-700';
  };

  const getPriorityLabel = (index: number) => {
    if (index === 0) return 'HIGH';
    if (index === 1) return 'MEDIUM';
    return 'LOW';
  };

  return (
    <div className="glass-card rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center">
          <Brain className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-neutral-900">AI Strategic Insights</h3>
          <p className="text-sm text-neutral-600">Powered by Claude</p>
        </div>
      </div>

      {/* Summary */}
      {ceoBrief.summary && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6 p-4 bg-neutral-50 rounded-lg border border-neutral-200"
        >
          <p className="text-sm text-neutral-700 leading-relaxed">{ceoBrief.summary}</p>
        </motion.div>
      )}

      {/* Priorities */}
      <div className="space-y-3">
        {ceoBrief.priorities.map((priority, index) => {
          const isExpanded = expandedIndex === index;

          return (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.3 }}
              className={`
                border-2
                rounded-lg
                overflow-hidden
                transition-all
                ${getPriorityColor(index)}
              `}
            >
              {/* Priority Header */}
              <button
                onClick={() => setExpandedIndex(isExpanded ? null : index)}
                className="w-full p-4 flex items-start gap-3 hover:bg-white/50 transition-colors"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {getPriorityIcon(index)}
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-sm">{priority.focus}</h4>
                    <span className="text-xs px-2 py-0.5 bg-white rounded-full font-medium">
                      {getPriorityLabel(index)}
                    </span>
                  </div>
                  <p className="text-xs opacity-90">{priority.why}</p>
                </div>
                <div className="flex-shrink-0">
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5" />
                  ) : (
                    <ChevronDown className="w-5 h-5" />
                  )}
                </div>
              </button>

              {/* Expanded Content */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-2 border-t border-current/20">
                      {priority.action && (
                        <div className="mb-3">
                          <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
                            Action
                          </span>
                          <p className="text-sm mt-1">{priority.action}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        {priority.owner && (
                          <div>
                            <span className="text-xs font-semibold uppercase tracking-wide opacity-70 flex items-center gap-1">
                              <User className="w-3 h-3" />
                              Owner
                            </span>
                            <p className="text-sm mt-1 font-medium">{priority.owner}</p>
                          </div>
                        )}
                        {priority.impact && (
                          <div>
                            <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
                              Expected Impact
                            </span>
                            <p className="text-sm mt-1 font-medium">{priority.impact}</p>
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
    </div>
  );
}

export default InsightsPanel;
