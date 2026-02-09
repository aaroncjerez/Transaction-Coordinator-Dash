import type { WeeklyAggregate, ScaleProgress, HalfMillionProgress, BusinessMetrics } from './types';

// Playbook constants from user-provided "Channel playbook 2 - Cold texting" screenshot
const PLAYBOOK_CONSTANTS = {
  // 7-figure targets - directly from playbook screenshot
  monthlyTexts: 187600,          // "Outbound texts/month" from screenshot
  weeklyTexts: 46900,            // "Outbound texts needed/week" from screenshot
  weeklyGrossLeads: 67,          // "Gross leads needed/week" from screenshot (combined text + call)
  weeklyQualifiedLeads: 20,      // "Qualified leads needed/week" from screenshot (Qualified = Hot Leads)

  // Text conversion rates - from playbook screenshot and existing dashboard
  textsPerGrossLead: 700,        // "1 gross lead per 700 outbound texts" from screenshot
  qualificationRate: 0.30,       // "Qualified rate: 30.0% of gross leads" from screenshot

  // Cold call conversion rates - based on Maria's target (500 calls → 10 hot leads)
  callsPerGrossLead: 33,         // 1 gross lead per 33 calls (500 calls ÷ 15 gross leads)
  weeklyCallVolume: 500,         // Maria's target (7-figure baseline)
  weeklyGrossLeadsCall: 15,      // 500 calls ÷ 33 calls/lead ≈ 15 gross leads
  weeklyQualifiedLeadsCall: 10,  // Target: 10 hot leads from calls (higher than 15 × 0.30)

  // Target rates - CORRECTED to match 7-figure profit table
  offerCoverageRate: 1.00,       // 100% offer coverage (20 qualified → 20 offers)
  offerToContractRate: 0.065,    // 6.5% "Better" tier: offers → contracts sent
  contractToCloseRate: 0.70,     // 70%: contracts sent → closed deals
};

// $500K targets (exactly half of 7-figure playbook from PLAYBOOK_CONSTANTS)
export const HALF_MILLION_TARGETS = {
  annualProfit: 500000,
  weeklyProfit: 9615, // $500k ÷ 52 weeks

  // Activity (half of 7-figure from PLAYBOOK_CONSTANTS)
  weeklyTexts: 23450, // Half of PLAYBOOK_CONSTANTS.weeklyTexts (46,900)
  weeklyCalls: 250, // Half of PLAYBOOK_CONSTANTS.weeklyCallVolume (500)

  // Leads (half of 7-figure from PLAYBOOK_CONSTANTS)
  weeklyGrossLeads: 33.5, // Half of PLAYBOOK_CONSTANTS.weeklyGrossLeads (67)
  weeklyGrossLeadsText: 26, // Estimated: ~52 gross from texts ÷ 2
  weeklyGrossLeadsCall: 7.5, // Half of PLAYBOOK_CONSTANTS.weeklyGrossLeadsCall (15)
  weeklyHotLeads: 10, // Half of PLAYBOOK_CONSTANTS.weeklyQualifiedLeads (20)
  weeklyHotLeadsText: 5, // Estimated: ~10 hot from texts ÷ 2
  weeklyHotLeadsCall: 5, // Half of PLAYBOOK_CONSTANTS.weeklyQualifiedLeadsCall (10)

  // Conversion (half of 7-figure, calculated from playbook rates)
  weeklyRealOffers: 10, // Half of 20 (20 qualified × 100% coverage)
  weeklyContracts: 0.65, // Half of 1.3 (20 offers × 6.5% rate)
  weeklyDeals: 0.455, // Half of 0.91 (1.3 contracts × 70% close rate)

  // Monthly equivalents
  monthlyTexts: 101617,
  monthlyCalls: 1083,
  monthlyGrossLeads: 145,
  monthlyHotLeads: 43,
  monthlyRealOffers: 43,
  monthlyContracts: 2.8,
  monthlyDeals: 1.97,
  monthlyProfit: 41635,
} as const;

/**
 * Calculate scale progress comparing current reality vs 7-figure goals
 */
export function calculateScaleProgress(
  currentWeek: WeeklyAggregate | null,
  businessMetrics: BusinessMetrics | null = null
): ScaleProgress | null {
  if (!currentWeek) return null;

  // Actual performance this week
  const actualTexts = currentWeek.totalTexts;
  const actualCalls = currentWeek.totalCalls;
  const actualGrossLeadsText = currentWeek.totalLeadsText;
  const actualGrossLeadsCall = currentWeek.totalLeadsCall;
  const actualQualifiedLeadsText = currentWeek.totalHotLeadsText;
  const actualQualifiedLeadsCall = currentWeek.totalHotLeadsCall;
  const actualContracts = currentWeek.totalContractsSigned;

  // Current Reality Targets (based on actual volume sent)
  // Text channel
  const expectedGrossLeads = actualTexts / PLAYBOOK_CONSTANTS.textsPerGrossLead;
  const expectedQualifiedLeads = expectedGrossLeads * PLAYBOOK_CONSTANTS.qualificationRate;

  // Call channel
  const expectedGrossLeadsCall = actualCalls / PLAYBOOK_CONSTANTS.callsPerGrossLead;
  const expectedQualifiedLeadsCall = expectedGrossLeadsCall * PLAYBOOK_CONSTANTS.qualificationRate;

  // Expected contracts based on qualified leads from BOTH channels and TWO-STEP conversion
  const totalExpectedQualified = expectedQualifiedLeads + expectedQualifiedLeadsCall;
  // Step 1: Qualified → Offers (100% coverage)
  const expectedOffers = totalExpectedQualified * PLAYBOOK_CONSTANTS.offerCoverageRate;
  // Step 2: Offers → Contracts sent (6.5% "Better" tier)
  const expectedContractsSent = expectedOffers * PLAYBOOK_CONSTANTS.offerToContractRate;
  // Step 3: Contracts sent → Deals closed (70%)
  const expectedDealsClosed = expectedContractsSent * PLAYBOOK_CONSTANTS.contractToCloseRate;

  // 7-Figure Goal Targets (from playbook) - "Better" performance tier
  // 20 qualified leads × 100% = 20 offers
  const goalOffers = PLAYBOOK_CONSTANTS.weeklyQualifiedLeads * PLAYBOOK_CONSTANTS.offerCoverageRate;
  // 20 offers × 6.5% = 1.3 contracts sent
  const goalContractsSent = goalOffers * PLAYBOOK_CONSTANTS.offerToContractRate;
  // 1.3 contracts × 70% = 0.91 deals closed
  const goalDealsClosed = goalContractsSent * PLAYBOOK_CONSTANTS.contractToCloseRate;

  // Calculate $500K progress if business metrics available
  const halfMillionProgress = calculateHalfMillionProgress(currentWeek, businessMetrics);

  return {
    currentReality: {
      targets: {
        textVolume: actualTexts,
        callVolume: actualCalls,
        expectedGrossLeads: Math.round(expectedGrossLeads),
        expectedGrossLeadsCall: Math.round(expectedGrossLeadsCall),
        expectedQualifiedLeads: Math.round(expectedQualifiedLeads),
        expectedQualifiedLeadsCall: Math.round(expectedQualifiedLeadsCall),
        expectedContracts: parseFloat(expectedContractsSent.toFixed(1)), // Show decimals (e.g., 0.8)
      },
      actuals: {
        textVolume: actualTexts,
        callVolume: actualCalls,
        grossLeads: actualGrossLeadsText,
        grossLeadsCall: actualGrossLeadsCall,
        qualifiedLeads: actualQualifiedLeadsText,
        qualifiedLeadsCall: actualQualifiedLeadsCall,
        contracts: actualContracts,
      },
    },
    sevenFigureGoal: {
      textVolume: PLAYBOOK_CONSTANTS.weeklyTexts,
      callVolume: PLAYBOOK_CONSTANTS.weeklyCallVolume,
      grossLeads: PLAYBOOK_CONSTANTS.weeklyGrossLeads,
      qualifiedLeads: PLAYBOOK_CONSTANTS.weeklyQualifiedLeads,
      contracts: 1.3, // 1.3 contracts sent/week ("Better" tier)
    },
    gaps: {
      textVolumeGap: PLAYBOOK_CONSTANTS.weeklyTexts - actualTexts,
      callVolumeGap: PLAYBOOK_CONSTANTS.weeklyCallVolume - actualCalls,
      qualifiedLeadsGap: PLAYBOOK_CONSTANTS.weeklyQualifiedLeads - (actualQualifiedLeadsText + actualQualifiedLeadsCall),
      contractsGap: goalContractsSent - actualContracts,
    },
    halfMillionProgress,
  };
}

/**
 * Get percentage of 7-figure goal achieved for a metric
 */
export function getGoalPercentage(actual: number, goal: number): number {
  if (goal === 0) return 0;
  return Math.round((actual / goal) * 100);
}

/**
 * Get color status for scale progress metric
 */
export function getScaleProgressStatus(percentage: number): 'green' | 'yellow' | 'red' {
  if (percentage >= 100) return 'green';
  if (percentage >= 50) return 'yellow';
  return 'red';
}

/**
 * Generate insights for $500K progress tracker based on actual performance
 */
function generateHalfMillionInsights(
  progress: HalfMillionProgress['progress'],
  current: {
    totalTexts: number;
    totalCalls: number;
    grossLeads: number;
    hotLeads: number;
    realOffers: number;
    contracts: number;
    deals: number;
    profit: number;
    avgDealSize: number;
  }
): string[] {
  const insights: string[] = [];

  // Overall profit progress
  if (progress.profit >= 100) {
    insights.push('✓ On pace for $500K! (' + progress.profit.toFixed(0) + '% of weekly target)');
  } else if (progress.profit >= 70) {
    insights.push('⚠ At ' + progress.profit.toFixed(0) + '% of $500K pace (close!)');
  } else if (progress.profit > 0) {
    insights.push('⚠ At ' + progress.profit.toFixed(0) + '% of $500K pace (need +' + (100 - progress.profit).toFixed(0) + '%)');
  } else {
    insights.push('❌ No profit this week (need $' + HALF_MILLION_TARGETS.weeklyProfit.toLocaleString() + ')');
  }

  // Activity volume
  const textsGap = HALF_MILLION_TARGETS.weeklyTexts - current.totalTexts;
  if (progress.texts >= 100) {
    insights.push('✓ Text volume: ' + progress.texts.toFixed(0) + '% of target');
  } else if (progress.texts >= 70) {
    insights.push('⚠ Text volume: ' + progress.texts.toFixed(0) + '% (need +' + textsGap.toLocaleString() + ' texts)');
  } else {
    insights.push('❌ Text volume: ' + progress.texts.toFixed(0) + '% (need +' + textsGap.toLocaleString() + ' texts)');
  }

  // Call volume (usually exceeds target)
  if (progress.calls >= 100) {
    insights.push('✓ Call volume: ' + progress.calls.toFixed(0) + '% of target (crushing it!)');
  }

  // Lead generation
  if (progress.hotLeads >= 100) {
    insights.push('✓ Hot leads: ' + progress.hotLeads.toFixed(0) + '% of target (' + current.hotLeads + ' this week)');
  } else if (progress.hotLeads >= 70) {
    const gap = HALF_MILLION_TARGETS.weeklyHotLeads - current.hotLeads;
    insights.push('⚠ Hot leads: ' + progress.hotLeads.toFixed(0) + '% (need +' + gap.toFixed(1) + ' more)');
  } else {
    const gap = HALF_MILLION_TARGETS.weeklyHotLeads - current.hotLeads;
    insights.push('❌ Hot leads: ' + progress.hotLeads.toFixed(0) + '% (need +' + gap.toFixed(1) + ' more)');
  }

  // Real offers (critical metric)
  if (progress.realOffers >= 100) {
    insights.push('✓ Real offers: ' + progress.realOffers.toFixed(0) + '% of target');
  } else if (progress.realOffers >= 70) {
    const gap = HALF_MILLION_TARGETS.weeklyRealOffers - current.realOffers;
    insights.push('⚠ Real offers: ' + progress.realOffers.toFixed(0) + '% (need +' + gap.toFixed(1) + ' more)');
  } else {
    const gap = HALF_MILLION_TARGETS.weeklyRealOffers - current.realOffers;
    insights.push('❌ Real offers: Only ' + current.realOffers + ' sent (need ' + gap.toFixed(1) + ' more)');
  }

  // Deals
  if (current.deals >= HALF_MILLION_TARGETS.weeklyDeals) {
    insights.push('✓ Deals closed: ' + current.deals + ' (on pace!)');
  } else if (current.deals > 0) {
    insights.push('⚠ Deals: ' + current.deals + ' closed (target: ' + HALF_MILLION_TARGETS.weeklyDeals.toFixed(2) + ')');
  } else {
    insights.push('⚠ No deals closed yet (need ' + HALF_MILLION_TARGETS.weeklyDeals.toFixed(2) + '/week avg)');
  }

  // Average deal size (if deals exist)
  if (current.deals > 0 && current.avgDealSize > 0) {
    insights.push('💰 Avg deal size: $' + Math.round(current.avgDealSize).toLocaleString());
  }

  return insights;
}

/**
 * Calculate $500K progress tracker data (half of 7-figure playbook targets)
 */
export function calculateHalfMillionProgress(
  weekData: WeeklyAggregate,
  businessMetrics: BusinessMetrics | null
): HalfMillionProgress {
  // Extract current week data using confirmed Airtable field names
  const totalTexts = weekData.totalTexts; // From "Total Texts Sent" or sum
  const totalCalls = weekData.totalCalls; // Sum of Edward + Maria
  const grossLeads = weekData.totalLeadsText + weekData.totalLeadsCall; // From "Total Leads" or sum
  const hotLeads = weekData.totalHotLeads; // From "Total Hot Leads (FUB)"
  const hotLeadsText = weekData.totalHotLeadsText;
  const hotLeadsCall = weekData.totalHotLeadsCall;

  // CRITICAL: Use "Aaron Real Offers Shared" NOT "Total Offers Sent"
  const realOffers = weekData.byTeamMember['aaron']?.offersSent || 0;

  const contracts = weekData.totalContractsSent; // From "Contracts Sent (PandaDoc)"
  const deals = weekData.totalContractsSigned; // From "Contracts Sent to Title"
  const profit = businessMetrics?.grossRevenue || 0; // From "Realized Gross Profit Generated"

  // Calculate average deal size
  const avgDealSize = deals > 0 ? profit / deals : 0;

  // Calculate progress vs $500K targets (half of 7-figure)
  const progress = {
    texts: (totalTexts / HALF_MILLION_TARGETS.weeklyTexts) * 100,
    calls: (totalCalls / HALF_MILLION_TARGETS.weeklyCalls) * 100,
    grossLeads: (grossLeads / HALF_MILLION_TARGETS.weeklyGrossLeads) * 100,
    hotLeads: (hotLeads / HALF_MILLION_TARGETS.weeklyHotLeads) * 100,
    realOffers: (realOffers / HALF_MILLION_TARGETS.weeklyRealOffers) * 100,
    contracts: (contracts / HALF_MILLION_TARGETS.weeklyContracts) * 100,
    deals: (deals / HALF_MILLION_TARGETS.weeklyDeals) * 100,
    profit: (profit / HALF_MILLION_TARGETS.weeklyProfit) * 100,
  };

  // Generate insights based on progress
  const insights = generateHalfMillionInsights(progress, {
    totalTexts,
    totalCalls,
    grossLeads,
    hotLeads,
    realOffers,
    contracts,
    deals,
    profit,
    avgDealSize,
  });

  return {
    currentWeek: {
      totalTexts,
      totalCalls,
      grossLeads,
      hotLeads,
      hotLeadsText,
      hotLeadsCall,
      realOffers,
      contracts,
      deals,
      profit,
      avgDealSize,
    },
    targets: {
      texts: HALF_MILLION_TARGETS.weeklyTexts,
      calls: HALF_MILLION_TARGETS.weeklyCalls,
      grossLeads: HALF_MILLION_TARGETS.weeklyGrossLeads,
      hotLeads: HALF_MILLION_TARGETS.weeklyHotLeads,
      realOffers: HALF_MILLION_TARGETS.weeklyRealOffers,
      contracts: HALF_MILLION_TARGETS.weeklyContracts,
      deals: HALF_MILLION_TARGETS.weeklyDeals,
      profit: HALF_MILLION_TARGETS.weeklyProfit,
    },
    progress,
    insights,
  };
}
