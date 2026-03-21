import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, AlertCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { WoWAnalysis as WoWAnalysisType, WoWAlert } from '../../lib/kpi/types';

interface WoWAnalysisProps {
  analysis: WoWAnalysisType;
}

function AlertIcon({ severity }: { severity: WoWAlert['severity'] }) {
  switch (severity) {
    case 'critical':
      return <AlertCircle size={16} className="text-red-500 flex-shrink-0" />;
    case 'warning':
      return <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />;
    case 'positive':
      return <TrendingUp size={16} className="text-green-500 flex-shrink-0" />;
  }
}

function severityStyles(severity: WoWAlert['severity']) {
  switch (severity) {
    case 'critical':
      return {
        bg: 'bg-red-50',
        border: 'border-red-200',
        badge: 'bg-red-100 text-red-700',
        text: 'text-red-800',
      };
    case 'warning':
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        badge: 'bg-amber-100 text-amber-700',
        text: 'text-amber-800',
      };
    case 'positive':
      return {
        bg: 'bg-green-50',
        border: 'border-green-200',
        badge: 'bg-green-100 text-green-700',
        text: 'text-green-800',
      };
  }
}

function ChangeArrow({ change }: { change: number }) {
  if (change > 0) return <TrendingUp size={12} className="text-green-500" />;
  if (change < 0) return <TrendingDown size={12} className="text-red-500" />;
  return <Minus size={12} className="text-gray-400" />;
}

export function WoWAnalysis({ analysis }: WoWAnalysisProps) {
  const { alerts, summary } = analysis;

  const hasCritical = alerts.some(a => a.severity === 'critical');
  const hasWarning = alerts.some(a => a.severity === 'warning');

  const headerColor = hasCritical
    ? 'from-red-500 to-red-600'
    : hasWarning
      ? 'from-amber-500 to-amber-600'
      : 'from-green-500 to-green-600';

  const headerIcon = hasCritical
    ? <AlertCircle size={18} className="text-white" />
    : hasWarning
      ? <AlertTriangle size={18} className="text-white" />
      : <TrendingUp size={18} className="text-white" />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden"
    >
      {/* Header */}
      <div className={`bg-gradient-to-r ${headerColor} px-5 py-3 flex items-center gap-3`}>
        {headerIcon}
        <div>
          <h3 className="text-sm font-semibold text-white">Week-over-Week Analysis</h3>
          <p className="text-xs text-white/80">{summary}</p>
        </div>
      </div>

      {/* Alerts */}
      <div className="p-4">
        {alerts.length === 0 ? (
          <div className="text-center py-6 text-gray-500 text-sm">
            No major changes detected this week.
          </div>
        ) : (
          <div className="space-y-2.5">
            {alerts.map((alert, i) => {
              const styles = severityStyles(alert.severity);
              return (
                <motion.div
                  key={`${alert.metric}-${i}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 * i }}
                  className={`flex items-start gap-3 px-4 py-3 rounded-lg border ${styles.bg} ${styles.border}`}
                >
                  <AlertIcon severity={alert.severity} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${styles.text}`}>
                        {alert.message}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${styles.badge}`}>
                        {alert.owner}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-gray-500">
                        <ChangeArrow change={alert.changePercent} />
                        {alert.changePercent > 0 ? '+' : ''}{alert.changePercent}%
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
