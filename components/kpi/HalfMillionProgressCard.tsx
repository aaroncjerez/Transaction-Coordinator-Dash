import { motion } from 'framer-motion';
import { Target, FileText, Phone, Activity, Users, Gift, FileCheck, Handshake, DollarSign } from 'lucide-react';
import type { HalfMillionProgress } from '../../lib/kpi/types';
import { Card } from '../ui/Card';

interface HalfMillionProgressCardProps {
  progress: HalfMillionProgress;
  weekEnding: string;
}

interface SimpleMetricRowProps {
  icon: React.ReactNode;
  label: string;
  current: number;
  target: number;
  percent: number;
  unit?: string;
  decimals?: number;
}

function SimpleMetricRow({
  icon,
  label,
  current,
  target,
  percent,
  unit = '',
  decimals = 0
}: SimpleMetricRowProps) {
  const getColorClass = (pct: number) => {
    if (pct >= 100) return 'bg-green-100 text-green-700 border-green-300';
    if (pct >= 70) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
    return 'bg-red-100 text-red-700 border-red-300';
  };

  const formatNumber = (num: number, decs: number) => {
    if (decs > 0) return num.toFixed(decs);
    return num.toLocaleString();
  };

  return (
    <div className="grid grid-cols-12 gap-4 items-center py-3 border-b border-gray-200 last:border-0">
      {/* Metric Label */}
      <div className="col-span-3 flex items-center gap-2">
        {icon}
        <span className="font-medium text-gray-700 text-sm">{label}</span>
      </div>

      {/* Current Value */}
      <div className="col-span-3 text-center">
        <div className="text-2xl font-bold text-gray-900">
          {formatNumber(current, decimals)}{unit}
        </div>
      </div>

      {/* Target Value */}
      <div className="col-span-3 text-center">
        <div className="text-lg font-semibold text-teal-700">
          {formatNumber(target, decimals)}{unit}
        </div>
      </div>

      {/* Progress Badge */}
      <div className="col-span-3 text-center">
        <div className={`text-sm font-semibold px-3 py-1 rounded border inline-block ${getColorClass(percent)}`}>
          {Math.round(percent)}%
        </div>
      </div>
    </div>
  );
}

export function HalfMillionProgressCard({ progress, weekEnding }: HalfMillionProgressCardProps) {
  const { currentWeek, targets, progress: progressPercent, insights } = progress;

  const overallProgress = progressPercent?.profit ?? 0;
  const getOverallColor = () => {
    if (overallProgress >= 100) return 'text-green-600';
    if (overallProgress >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <Card className="p-6 border-2 border-teal-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-teal-500 rounded-lg">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">$500K Progress Tracker</h2>
              <p className="text-sm text-gray-600">
                Week ending {weekEnding} {'\u2022'} Half of 7-figure playbook targets
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-600">Overall Progress</div>
            <div className={`text-2xl font-bold ${getOverallColor()}`}>
              {Math.round(overallProgress)}%
            </div>
            <div className="text-xs text-gray-600">of profit target</div>
          </div>
        </div>

        {/* Column Headers */}
        <div className="grid grid-cols-12 gap-4 pb-2 border-b-2 border-gray-300 mb-2">
          <div className="col-span-3 text-xs font-semibold text-gray-600 uppercase">Metric</div>
          <div className="col-span-3 text-center text-xs font-semibold text-gray-600 uppercase">Current</div>
          <div className="col-span-3 text-center text-xs font-semibold text-gray-600 uppercase">$500K Target</div>
          <div className="col-span-3 text-center text-xs font-semibold text-gray-600 uppercase">Progress</div>
        </div>

        {/* Activity Metrics */}
        <div className="space-y-0 mb-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">Activity Volume</div>
          <SimpleMetricRow
            icon={<FileText className="w-5 h-5 text-blue-500" />}
            label="Texts"
            current={currentWeek.totalTexts}
            target={targets.texts}
            percent={progressPercent.texts}
          />
          <SimpleMetricRow
            icon={<Phone className="w-5 h-5 text-indigo-500" />}
            label="Calls"
            current={currentWeek.totalCalls}
            target={targets.calls}
            percent={progressPercent.calls}
          />
        </div>

        {/* Lead Generation */}
        <div className="space-y-0 mb-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">Lead Generation</div>
          <SimpleMetricRow
            icon={<Activity className="w-5 h-5 text-green-500" />}
            label="Gross Leads"
            current={currentWeek.grossLeads}
            target={targets.grossLeads}
            percent={progressPercent.grossLeads}
            decimals={1}
          />
          <SimpleMetricRow
            icon={<Users className="w-5 h-5 text-orange-500" />}
            label="Hot Leads"
            current={currentWeek.hotLeads}
            target={targets.hotLeads}
            percent={progressPercent.hotLeads}
          />
        </div>

        {/* Conversion Funnel */}
        <div className="space-y-0 mb-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">Conversion Funnel</div>
          <SimpleMetricRow
            icon={<Gift className="w-5 h-5 text-pink-500" />}
            label="Real Offers"
            current={currentWeek.realOffers}
            target={targets.realOffers}
            percent={progressPercent.realOffers}
          />
          <SimpleMetricRow
            icon={<FileCheck className="w-5 h-5 text-purple-500" />}
            label="Contracts Sent"
            current={currentWeek.contracts}
            target={targets.contracts}
            percent={progressPercent.contracts}
            decimals={2}
          />
          <SimpleMetricRow
            icon={<Handshake className="w-5 h-5 text-teal-500" />}
            label="Deals Closed"
            current={currentWeek.deals}
            target={targets.deals}
            percent={progressPercent.deals}
            decimals={2}
          />
        </div>

        {/* Financial */}
        <div className="space-y-0 mb-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-2">Financial</div>
          <SimpleMetricRow
            icon={<DollarSign className="w-5 h-5 text-green-600" />}
            label="Weekly Profit"
            current={currentWeek.profit}
            target={targets.profit}
            percent={progressPercent.profit}
            unit=""
            decimals={0}
          />
          {currentWeek.avgDealSize > 0 && (
            <div className="grid grid-cols-12 gap-4 items-center py-3 border-b border-gray-200 last:border-0">
              <div className="col-span-3 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-gray-400" />
                <span className="font-medium text-gray-700 text-sm">Avg Deal Size</span>
              </div>
              <div className="col-span-9">
                <div className="text-lg font-semibold text-gray-700">
                  ${Math.round(currentWeek.avgDealSize).toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Key Insights */}
        <div className="mt-6 pt-4 border-t-2 border-gray-300">
          <div className="text-sm font-semibold text-gray-700 mb-3">Key Insights</div>
          <div className="space-y-2">
            {(insights ?? []).map((insight, idx) => {
              const text = String(insight ?? '');
              return (
                <div key={idx} className="text-sm text-gray-700 flex items-start gap-2">
                  <span className="mt-0.5">{text.charAt(0)}</span>
                  <span>{text.slice(1)}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Targets Summary Box */}
        <div className="mt-6 bg-teal-50 border-2 border-teal-200 rounded-lg p-4">
          <div className="text-sm font-semibold text-teal-900 mb-2">Weekly $500K Targets</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-teal-800">
            <div>{'\uD83D\uDCE4'} {(targets?.texts ?? 0).toLocaleString()} texts/week</div>
            <div>{'\uD83D\uDCDE'} {(targets?.calls ?? 0).toLocaleString()} calls/week</div>
            <div>{'\uD83C\uDFAF'} {(targets?.grossLeads ?? 0).toFixed(1)} gross leads/week</div>
            <div>{'\uD83D\uDD25'} {targets?.hotLeads ?? 0} hot leads/week</div>
            <div>{'\uD83D\uDCDD'} {targets?.realOffers ?? 0} real offers/week</div>
            <div>{'\uD83D\uDCC4'} {(targets?.contracts ?? 0).toFixed(2)} contracts/week</div>
            <div>{'\uD83E\uDD1D'} {(targets?.deals ?? 0).toFixed(2)} deals/week</div>
            <div>{'\uD83D\uDCB0'} ${(targets?.profit ?? 0).toLocaleString()}/week</div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-600">
            <span className="font-semibold">$500K Target:</span> Exactly half of the 7-figure playbook targets. Progress shows current week actual performance vs these targets.
          </p>
        </div>
      </Card>
    </motion.div>
  );
}
