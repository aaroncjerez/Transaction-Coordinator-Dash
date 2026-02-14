import React from 'react';
import { SmilePlus, Meh, Frown, HelpCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

const config = {
  positive: { icon: SmilePlus, color: 'text-emerald-600 bg-emerald-50', label: 'Positive' },
  neutral: { icon: Meh, color: 'text-gray-500 bg-gray-100', label: 'Neutral' },
  negative: { icon: Frown, color: 'text-red-500 bg-red-50', label: 'Negative' },
  unknown: { icon: HelpCircle, color: 'text-gray-400 bg-gray-50', label: 'Unknown' },
} as const;

export const SentimentBadge: React.FC<{ sentiment: string | null; size?: 'sm' | 'md' }> = ({ sentiment, size = 'sm' }) => {
  const key = (sentiment as keyof typeof config) || 'unknown';
  const { icon: Icon, color, label } = config[key] || config.unknown;
  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-micro font-medium', color)}>
      <Icon size={iconSize} />
      {label}
    </span>
  );
};
