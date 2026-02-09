import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import type { Bottleneck } from '../../lib/kpi/types';

interface BottleneckAlertProps {
  bottleneck: Bottleneck | null;
}

export function BottleneckAlert({ bottleneck }: BottleneckAlertProps) {
  if (!bottleneck?.title) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-green-50 border border-green-200 rounded-lg p-4"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{'\uD83C\uDF89'}</span>
          <div>
            <h4 className="font-semibold text-green-800">All Systems Go!</h4>
            <p className="text-sm text-green-600">
              No critical bottlenecks this week. Keep up the momentum!
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-red-50 border-2 border-red-200 rounded-lg p-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="font-bold text-red-800 text-lg">
            THIS WEEK&apos;S BOTTLENECK: {bottleneck.title ?? ''}
          </h4>
          <div className="mt-2 space-y-1 text-sm text-red-700">
            <p>
              <span className="font-medium">Current:</span> {bottleneck.currentValue ?? 'N/A'}{' '}
              <span className="text-red-500">{'\u2192'}</span>{' '}
              <span className="font-medium">Target:</span> {bottleneck.targetValue ?? 'N/A'}
            </p>
            <p className="text-red-600">{bottleneck.impact ?? ''}</p>
          </div>
          <div className="mt-3 bg-red-100 rounded-md p-3">
            <p className="text-red-800 font-semibold">
              FIX: {bottleneck.fix ?? ''}
            </p>
            <p className="text-sm text-red-600 mt-1">
              Owner: {bottleneck.owner ?? 'Team'}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
