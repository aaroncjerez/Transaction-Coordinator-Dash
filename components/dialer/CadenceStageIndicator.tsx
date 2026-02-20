import React from 'react';
import { cn } from '../../lib/utils';
import { CADENCE_DAY_SEQUENCE, CADENCE_TOTAL_STAGES } from '../../types';

export const CadenceStageIndicator: React.FC<{ stage: number | null; className?: string }> = ({ stage, className }) => {
  const current = stage ?? 0;
  const pct = Math.min((current / CADENCE_TOTAL_STAGES) * 100, 100);

  const barColor =
    current <= 4 ? 'bg-green-500' :
    current <= 8 ? 'bg-blue-500' :
    current <= 11 ? 'bg-amber-500' :
    'bg-orange-500';

  // Show the current cadence day
  const dayLabel = current > 0 && current <= CADENCE_DAY_SEQUENCE.length
    ? `Day ${CADENCE_DAY_SEQUENCE[current - 1]}`
    : null;

  return (
    <div className={cn('flex items-center gap-2', className)} title={dayLabel ? `${dayLabel} of cadence` : undefined}>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-micro text-gray-500 font-medium tabular-nums whitespace-nowrap">
        {current}/{CADENCE_TOTAL_STAGES}
        {dayLabel && <span className="text-gray-400 ml-1">({dayLabel})</span>}
      </span>
    </div>
  );
};
