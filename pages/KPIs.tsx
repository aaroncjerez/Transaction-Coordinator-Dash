import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { TopBar } from '../components/TopBar';
import { fetchKpiDashboardData } from '../lib/database';
import { detectAchievements } from '../lib/kpi/achievements';
import { TARGETS } from '../lib/kpi/constants';
import type { DashboardState } from '../lib/kpi/types';

import { KpiHeader } from '../components/kpi/KpiHeader';
import { HeroKPI } from '../components/kpi/HeroKPI';
import { FunnelFlow } from '../components/kpi/FunnelFlow';
import { GoalsDashboard } from '../components/kpi/GoalsDashboard';
import { PerformancePillars } from '../components/kpi/PerformancePillars';
import { InsightsPanel } from '../components/kpi/InsightsPanel';
import { TeamPerformance } from '../components/kpi/TeamPerformance';
import { KpiLoadingSkeleton } from '../components/kpi/KpiLoadingSkeleton';
import { KpiErrorState } from '../components/kpi/KpiErrorState';

export const KPIs: React.FC = () => {
  const [dashboardData, setDashboardData] = useState<DashboardState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await fetchKpiDashboardData();

      if (data.error) {
        throw new Error(data.error);
      }

      if (data.currentWeek) {
        setDashboardData(data);
      } else {
        throw new Error('No data returned from Airtable');
      }
    } catch (err) {
      console.error('Error fetching KPI data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load KPI data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate achievements
  const achievements = dashboardData?.currentWeek && dashboardData?.calculatedMetrics
    ? detectAchievements(
        dashboardData.currentWeek,
        dashboardData.previousWeek,
        dashboardData.calculatedMetrics
      )
    : [];

  // Calculate overall progress
  const overallProgress = dashboardData?.currentWeek
    ? (dashboardData.currentWeek.totalContractsSigned / TARGETS.weeklyContractsSigned) * 100
    : 0;

  // Prepare funnel stages
  const funnelStages = dashboardData?.currentWeek
    ? [
        {
          label: 'Texts',
          value: dashboardData.currentWeek.totalTexts,
          target: TARGETS.weeklyTexts / 2,
          color: 'blue' as const,
        },
        {
          label: 'Hot Leads',
          value: dashboardData.currentWeek.totalHotLeads,
          target: TARGETS.weeklyTotalHotLeads / 2,
          color: 'indigo' as const,
        },
        {
          label: 'Real Offers',
          value: dashboardData.currentWeek.totalOffersSent,
          target: TARGETS.weeklyOffersSent / 2,
          color: 'purple' as const,
        },
        {
          label: 'Contracts Signed',
          value: dashboardData.currentWeek.totalContractsSent,
          target: TARGETS.HALF_MILLION_CONTRACTS_SENT,
          color: 'pink' as const,
        },
        {
          label: 'Deals Closed',
          value: dashboardData.currentWeek.totalContractsSigned,
          target: TARGETS.HALF_MILLION_DEALS_CLOSED,
          color: 'green' as const,
        },
      ]
    : [];

  return (
    <>
      <TopBar
        title="KPIs"
        subtitle="Weekly team performance"
        actions={
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-caption text-gray-600 bg-white rounded-md border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {isLoading ? (
            <div className="space-y-6">
              <KpiLoadingSkeleton variant="card" />
              <KpiLoadingSkeleton variant="stat" count={3} />
            </div>
          ) : error ? (
            <KpiErrorState
              title="Error Loading KPIs"
              message={error}
              onRetry={fetchData}
            />
          ) : dashboardData && dashboardData.currentWeek ? (
            <div className="space-y-6">
              {/* Header */}
              <KpiHeader
                weekEnding={dashboardData.currentWeek.weekEnding}
                weekStarting={dashboardData.currentWeek.weekEnding}
                overallProgress={overallProgress}
                achievements={achievements}
              />

              {/* Hero KPI */}
              <HeroKPI
                current={dashboardData.currentWeek.totalOffersSent}
                target={10}
                label="Real Offers Shared"
                subtitle="Leading indicator - Aaron's unique offers sent"
              />

              {/* Funnel Flow */}
              <FunnelFlow stages={funnelStages} />

              {/* $500K Goals Dashboard */}
              {dashboardData.scaleProgress?.halfMillionProgress && (
                <GoalsDashboard halfMillionProgress={dashboardData.scaleProgress.halfMillionProgress} />
              )}

              {/* Performance Pillars */}
              {dashboardData.fourLevers && (
                <PerformancePillars fourLevers={dashboardData.fourLevers} />
              )}

              {/* Insights Panel */}
              <InsightsPanel ceoBrief={dashboardData.ceoBrief} />

              {/* Team Performance */}
              {dashboardData.teamScorecards && dashboardData.teamScorecards.length > 0 && (
                <TeamPerformance teamScorecards={dashboardData.teamScorecards} />
              )}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
};
