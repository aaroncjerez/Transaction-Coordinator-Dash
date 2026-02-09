import React from 'react';
import { motion } from 'framer-motion';
import { Brain, RefreshCw } from 'lucide-react';
import type { CEOBrief } from '../../lib/kpi/types';

interface InsightsPanelProps {
  ceoBrief: CEOBrief | null;
  isLoading?: boolean;
  onGenerate?: () => void;
}

export function InsightsPanel({ ceoBrief, isLoading = false, onGenerate }: InsightsPanelProps) {
  const hasBrief = ceoBrief && Array.isArray(ceoBrief.priorities) && ceoBrief.priorities.length > 0;

  return (
    <div className="glass-card rounded-xl p-6">
      {/* Header — always shown */}
      <div className="flex items-center gap-3 mb-6">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${hasBrief ? 'bg-gradient-to-br from-purple-500 to-purple-600' : 'bg-purple-100'}`}>
          <Brain className={`w-6 h-6 ${hasBrief ? 'text-white' : 'text-purple-600'} ${isLoading ? 'animate-pulse' : ''}`} />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-neutral-900">AI Strategic Insights</h3>
          <p className="text-sm text-neutral-600">
            {isLoading ? 'Analyzing your performance...' : hasBrief ? 'CEO Weekly Brief — Powered by Claude' : 'Get personalized priorities'}
          </p>
        </div>
        {onGenerate && (
          <button
            onClick={onGenerate}
            disabled={isLoading}
            className="
              flex items-center gap-1.5
              px-3 py-1.5
              text-sm font-medium
              text-purple-700
              bg-purple-100
              rounded-lg
              hover:bg-purple-200
              transition-colors
              disabled:opacity-50
              disabled:cursor-not-allowed
            "
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {hasBrief ? 'Regenerate' : 'Generate'}
          </button>
        )}
      </div>

      {/* Loading shimmer */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-shimmer h-16 bg-neutral-200 rounded-lg" />
          ))}
        </div>
      )}

      {/* Brief content */}
      {!isLoading && hasBrief && (
        <>
          {/* Summary */}
          {ceoBrief.summary && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-6 p-4 bg-neutral-50 rounded-lg border border-neutral-200"
            >
              <p className="text-sm text-neutral-800 leading-relaxed font-medium">{ceoBrief.summary}</p>
            </motion.div>
          )}

          {/* Priorities — flat numbered list */}
          <div className="space-y-4">
            {ceoBrief.priorities.map((priority, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
                className="flex gap-4"
              >
                {/* Number */}
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-bold text-sm flex items-center justify-center mt-0.5">
                  {index + 1}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-neutral-900 text-sm leading-snug">
                    {priority.title}
                  </h4>
                  <p className="text-sm text-neutral-600 mt-1 leading-relaxed">
                    {priority.detail}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default InsightsPanel;
