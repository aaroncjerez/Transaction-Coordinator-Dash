import { motion } from 'framer-motion';
import { ProgressBar } from './ui/ProgressBar';
import { StatusBadge, CrushingItBadge } from './ui/StatusBadge';
import type { TeamScorecard as TeamScorecardType } from '../../lib/kpi/types';

interface TeamScorecardProps {
  scorecard: TeamScorecardType;
  index: number;
}

export function TeamScorecard({ scorecard, index }: TeamScorecardProps) {
  const { member, primaryMetric, secondaryMetric, funnelMetrics, status, isCrushingIt } = scorecard;

  const roleLabels = {
    cold_texter: 'Texter',
    cold_caller: 'Caller',
    closer: 'Closer',
    comper: 'Comper',
  };

  const colorClasses = {
    green: 'border-l-green-500 bg-green-50/50',
    yellow: 'border-l-yellow-500 bg-yellow-50/50',
    red: 'border-l-red-500 bg-red-50/50',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
      className={`border-l-4 rounded-r-lg p-4 ${colorClasses[status]}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold text-gray-900">{member.name}</h4>
          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
            {roleLabels[member.role]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} size="sm" />
          <CrushingItBadge show={isCrushingIt} />
        </div>
      </div>

      <ProgressBar
        current={primaryMetric.current}
        target={primaryMetric.target}
        label={primaryMetric.label}
        color={status}
        size="md"
      />

      {secondaryMetric && (
        <p className="text-sm text-gray-600 mt-2">
          → {secondaryMetric.value.toLocaleString()}{secondaryMetric.unit} {secondaryMetric.label}
        </p>
      )}

      {funnelMetrics && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="text-xs text-gray-500 mb-2">Conversion Funnel</div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-700">{funnelMetrics.stage1.value.toLocaleString()}</span>
              <span className="text-gray-400">→</span>
              <span className="font-semibold text-blue-600">{funnelMetrics.stage2.value}</span>
              <span className="text-gray-400">→</span>
              <span className="font-semibold text-green-600">{funnelMetrics.stage3.value}</span>
            </div>
            <div className="text-xs text-gray-500">
              {funnelMetrics.conversion2.toFixed(1)}% qual
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

interface TeamScorecardsGridProps {
  scorecards: TeamScorecardType[];
}

export function TeamScorecardsGrid({ scorecards }: TeamScorecardsGridProps) {
  // Sort scorecards: Red first, Yellow second, Green last (problem-focused display)
  const sortedScorecards = [...scorecards].sort((a, b) => {
    const statusOrder = { red: 0, yellow: 1, green: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Scorecard</h3>
      {sortedScorecards.map((scorecard, index) => (
        <TeamScorecard
          key={scorecard.member.id}
          scorecard={scorecard}
          index={index}
        />
      ))}
    </div>
  );
}
