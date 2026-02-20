import React from 'react';
import {
  ThumbsUp, ThumbsDown, Minus, AlertTriangle, Flame, Lightbulb, ArrowRight, Shield,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import type { AICallReview } from '../../types';

interface SentimentSummaryCardProps {
  review: AICallReview | null;
  compact?: boolean;
}

export const SentimentSummaryCard: React.FC<SentimentSummaryCardProps> = ({ review, compact = false }) => {
  if (!review) {
    return (
      <div className="bg-gray-50 rounded-lg p-3 text-center">
        <span className="text-caption text-gray-400">No AI review yet</span>
      </div>
    );
  }

  const sentimentConfig = {
    positive: { icon: ThumbsUp, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', label: 'Positive' },
    neutral: { icon: Minus, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', label: 'Neutral' },
    negative: { icon: ThumbsDown, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Negative' },
  };

  const config = sentimentConfig[review.sentiment] || sentimentConfig.neutral;
  const SentimentIcon = config.icon;
  const qualityPercent = (review.call_quality_score / 10) * 100;

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2 rounded-md px-2 py-1', config.bg, 'border', config.border)}>
        <SentimentIcon size={12} className={config.color} />
        <span className={cn('text-micro font-medium', config.color)}>{config.label}</span>
        {review.dnc_detected && (
          <span className="flex items-center gap-0.5 text-micro font-medium text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
            <Shield size={10} /> DNC
          </span>
        )}
        {review.is_hot_lead && (
          <span className="flex items-center gap-0.5 text-micro font-medium text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
            <Flame size={10} /> Hot
          </span>
        )}
        <span className="text-micro text-gray-400 ml-auto tabular-nums">{review.call_quality_score}/10</span>
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border p-4', config.bg, config.border)}>
      {/* Header: sentiment + quality score */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <SentimentIcon size={16} className={config.color} />
          <span className={cn('text-sm font-semibold', config.color)}>{config.label} Sentiment</span>

          {review.dnc_detected && (
            <span className="flex items-center gap-1 text-micro font-semibold text-red-700 bg-red-100 border border-red-300 px-2 py-0.5 rounded-full">
              <Shield size={10} /> DNC Detected
            </span>
          )}
          {review.is_hot_lead && (
            <span className="flex items-center gap-1 text-micro font-semibold text-orange-700 bg-orange-100 border border-orange-300 px-2 py-0.5 rounded-full">
              <Flame size={10} /> Hot Lead
            </span>
          )}
        </div>

        {/* Quality circle */}
        <div className="relative w-10 h-10">
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="3"
            />
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke={review.call_quality_score >= 7 ? '#22c55e' : review.call_quality_score >= 4 ? '#eab308' : '#ef4444'}
              strokeWidth="3"
              strokeDasharray={`${qualityPercent}, 100`}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-micro font-bold text-gray-700">
            {review.call_quality_score}
          </span>
        </div>
      </div>

      {/* DNC evidence */}
      {review.dnc_detected && review.dnc_evidence && (
        <div className="bg-red-100 border border-red-300 rounded-md p-2 mb-3">
          <div className="flex items-start gap-1.5">
            <AlertTriangle size={12} className="text-red-600 mt-0.5 shrink-0" />
            <p className="text-micro text-red-800">{review.dnc_evidence}</p>
          </div>
        </div>
      )}

      {/* Hot lead reason */}
      {review.is_hot_lead && review.hot_lead_reason && (
        <div className="bg-orange-100 border border-orange-300 rounded-md p-2 mb-3">
          <div className="flex items-start gap-1.5">
            <Flame size={12} className="text-orange-600 mt-0.5 shrink-0" />
            <p className="text-micro text-orange-800">{review.hot_lead_reason}</p>
          </div>
        </div>
      )}

      {/* Key insights */}
      {review.key_insights && review.key_insights.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Lightbulb size={12} className="text-amber-500" />
            <span className="text-micro font-semibold text-gray-600 uppercase tracking-wider">Key Insights</span>
          </div>
          <ul className="space-y-1">
            {review.key_insights.map((insight, i) => (
              <li key={i} className="text-caption text-gray-700 pl-4 relative before:content-[''] before:absolute before:left-1 before:top-[7px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-gray-300">
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Next action */}
      {review.recommended_next_action && (
        <div className="bg-white/60 rounded-md p-2 border border-gray-200">
          <div className="flex items-start gap-1.5">
            <ArrowRight size={12} className="text-blue-500 mt-0.5 shrink-0" />
            <div>
              <span className="text-micro font-semibold text-gray-500 uppercase tracking-wider">Next Action</span>
              <p className="text-caption text-gray-800 mt-0.5">{review.recommended_next_action}</p>
            </div>
          </div>
        </div>
      )}

      {/* Flags */}
      {review.flags && review.flags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {review.flags.map((flag, i) => (
            <span key={i} className="text-micro bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">
              {flag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
