import React from 'react';
import { cn } from '../../lib/utils';

const MAX_STAGES = 14;

export const CadenceStageIndicator: React.FC<{ stage: number | null; className?: string }> = ({ stage, className }) => {
  const current = stage ?? 0;
  const pct = Math.min((current / (MAX_STAGES - 1)) * 100, 100);

  const barColor =
    current <= 6 ? 'bg-blue-500' :
    current <= 10 ? 'bg-amber-500' :
    current <= 13 ? 'bg-orange-500' :
    'bg-gray-400';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-micro text-gray-500 font-medium tabular-nums whitespace-nowrap">
        {current + 1}/{MAX_STAGES}
      </span>
    </div>
  );
};
