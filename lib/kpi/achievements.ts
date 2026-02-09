import { WeeklyAggregate, CalculatedMetrics } from './types.js';

export interface Achievement {
  id: string;
  type: 'target' | 'record' | 'streak' | 'coverage' | 'excellence';
  title: string;
  description: string;
  achieved: boolean;
  value?: number;
}

export function detectAchievements(
  currentWeek: WeeklyAggregate | null,
  previousWeek: WeeklyAggregate | null,
  metrics: CalculatedMetrics | null
): Achievement[] {
  if (!currentWeek || !metrics) {
    return [];
  }

  const achievements: Achievement[] = [];

  // Target Achievement: Hit weekly contracts target
  const contractsTarget = 5;
  if (currentWeek.totalContractsSigned >= contractsTarget) {
    achievements.push({
      id: 'contracts_target',
      type: 'target',
      title: 'Contracts Target',
      description: `Achieved ${contractsTarget} contracts this week`,
      achieved: true,
      value: currentWeek.totalContractsSigned,
    });
  }

  // Coverage Achievement: 100% offer coverage
  if (metrics.hotLeadToOfferRate >= 100) {
    achievements.push({
      id: 'full_coverage',
      type: 'coverage',
      title: 'Full Coverage',
      description: '100% of hot leads received offers',
      achieved: true,
      value: Math.round(metrics.hotLeadToOfferRate),
    });
  }

  // Excellence Achievement: All levers green
  const textYield = metrics.textYield;
  const offerCoverage = metrics.hotLeadToOfferRate;
  const closeRate = metrics.contractToCloseRate;

  const allLeversGreen =
    textYield >= 0.55 &&
    offerCoverage >= 100 &&
    closeRate >= 70;

  if (allLeversGreen) {
    achievements.push({
      id: 'all_levers_green',
      type: 'excellence',
      title: 'Peak Performance',
      description: 'All 3 levers hitting targets',
      achieved: true,
    });
  }

  // Record Achievement: Beat personal best
  if (previousWeek) {
    if (currentWeek.totalTexts > previousWeek.totalTexts) {
      achievements.push({
        id: 'text_record',
        type: 'record',
        title: 'Text Volume Record',
        description: `New personal best: ${currentWeek.totalTexts.toLocaleString()} texts`,
        achieved: true,
        value: currentWeek.totalTexts,
      });
    }

    if (currentWeek.totalHotLeads > previousWeek.totalHotLeads) {
      achievements.push({
        id: 'hot_leads_record',
        type: 'record',
        title: 'Hot Leads Record',
        description: `New personal best: ${currentWeek.totalHotLeads} hot leads`,
        achieved: true,
        value: currentWeek.totalHotLeads,
      });
    }
  }

  // Streak Achievement: 3+ weeks above target
  // Note: This would require historical data to calculate properly
  // For now, we'll just detect if current week is above target
  const weeklyProfitTarget = 9615; // $500K target
  if (currentWeek.totalContractsSigned >= contractsTarget) {
    achievements.push({
      id: 'weekly_streak',
      type: 'streak',
      title: 'On Track',
      description: 'Hitting targets this week',
      achieved: true,
    });
  }

  return achievements;
}

export function getAchievementCount(achievements: Achievement[]): number {
  return achievements.filter(a => a.achieved).length;
}

export default {
  detectAchievements,
  getAchievementCount,
};
