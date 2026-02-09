import { motion } from 'framer-motion';
import { Target, Activity, FileText, Users, FileCheck, Phone } from 'lucide-react';
import type { ScaleProgress } from '../../lib/kpi/types';
import { Card } from '../ui/Card';
import { getGoalPercentage, getScaleProgressStatus } from '../../lib/kpi/scale-calculations';

interface ScaleProgressCardProps {
  scaleProgress: ScaleProgress;
}

interface MetricRowProps {
  icon: React.ReactNode;
  label: string;
  currentActual: number;
  currentTarget: number;
  goalTarget: number;
  unit?: string;
}

function MetricRow({ icon, label, currentActual, currentTarget, goalTarget, unit = '' }: MetricRowProps) {
  const currentPerformance = currentTarget > 0 ? Math.round((currentActual / currentTarget) * 100) : 0;
  const goalPercentage = getGoalPercentage(currentActual, goalTarget);
  const status = getScaleProgressStatus(goalPercentage);

  const statusColors = {
    green: 'bg-green-100 text-green-700 border-green-300',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    red: 'bg-red-100 text-red-700 border-red-300',
  };

  return (
    <div className="grid grid-cols-12 gap-4 items-center py-3 border-b border-gray-200 last:border-0">
      {/* Metric Label */}
      <div className="col-span-3 flex items-center gap-2">
        {icon}
        <span className="font-medium text-gray-700 text-sm">{label}</span>
      </div>

      {/* Current Reality */}
      <div className="col-span-4 bg-blue-50 rounded-lg p-3">
        <div className="text-xs text-gray-600 mb-1">Current Week Reality</div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900">
            {currentActual.toLocaleString()}{unit}
          </span>
          <span className="text-sm text-gray-500">
            / {currentTarget.toLocaleString()}{unit}
          </span>
        </div>
        <div className="text-xs text-gray-600 mt-1">
          {currentPerformance}% of expected
        </div>
      </div>

      {/* 7-Figure Goal */}
      <div className="col-span-4 bg-purple-50 rounded-lg p-3">
        <div className="text-xs text-gray-600 mb-1">7-Figure Goal</div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900">
            {goalTarget.toLocaleString()}{unit}
          </span>
        </div>
        <div className={`text-xs mt-1 px-2 py-0.5 rounded border inline-block ${statusColors[status]}`}>
          {goalPercentage}% achieved
        </div>
      </div>

      {/* Gap */}
      <div className="col-span-1 text-right">
        <div className="text-sm font-medium text-gray-700">
          {goalTarget > currentActual ? `+${(goalTarget - currentActual).toLocaleString()}${unit}` : '\u2713'}
        </div>
      </div>
    </div>
  );
}

export function ScaleProgressCard({ scaleProgress }: ScaleProgressCardProps) {
  const { currentReality, sevenFigureGoal, gaps } = scaleProgress;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500 rounded-lg">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Scale Progress Tracker</h2>
              <p className="text-sm text-gray-600">
                Current performance vs $1M revenue goal
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-600">Gap to 7-Figure Goal</div>
            <div className="text-2xl font-bold text-purple-600">
              +{gaps.textVolumeGap.toLocaleString()} texts
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="space-y-0">
          <MetricRow
            icon={<FileText className="w-5 h-5 text-blue-500" />}
            label="Text Volume"
            currentActual={currentReality.actuals.textVolume}
            currentTarget={currentReality.targets.textVolume}
            goalTarget={sevenFigureGoal.textVolume}
          />

          <MetricRow
            icon={<Phone className="w-5 h-5 text-indigo-500" />}
            label="Call Volume"
            currentActual={currentReality.actuals.callVolume}
            currentTarget={currentReality.targets.callVolume}
            goalTarget={sevenFigureGoal.callVolume}
          />

          <MetricRow
            icon={<Activity className="w-5 h-5 text-green-500" />}
            label="Gross Leads"
            currentActual={currentReality.actuals.grossLeads + currentReality.actuals.grossLeadsCall}
            currentTarget={currentReality.targets.expectedGrossLeads + currentReality.targets.expectedGrossLeadsCall}
            goalTarget={sevenFigureGoal.grossLeads}
          />

          <MetricRow
            icon={<Users className="w-5 h-5 text-orange-500" />}
            label="Qualified Leads"
            currentActual={currentReality.actuals.qualifiedLeads + currentReality.actuals.qualifiedLeadsCall}
            currentTarget={currentReality.targets.expectedQualifiedLeads + currentReality.targets.expectedQualifiedLeadsCall}
            goalTarget={sevenFigureGoal.qualifiedLeads}
          />

          <MetricRow
            icon={<FileCheck className="w-5 h-5 text-purple-500" />}
            label="Contracts Signed"
            currentActual={currentReality.actuals.contracts}
            currentTarget={currentReality.targets.expectedContracts}
            goalTarget={sevenFigureGoal.contracts}
          />
        </div>

        {/* Footer Note */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-600">
            <span className="font-semibold">Current Week Reality:</span> Expected performance based on {currentReality.actuals.textVolume.toLocaleString()} texts and {currentReality.actuals.callVolume.toLocaleString()} calls sent using playbook conversion rates.
            <br />
            <span className="font-semibold">7-Figure Goal:</span> Weekly targets needed to reach $1M annual revenue (from playbook).
          </p>
        </div>
      </Card>
    </motion.div>
  );
}
