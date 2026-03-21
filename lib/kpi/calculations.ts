import type {
  WeeklyAggregate,
  BusinessMetrics,
  CalculatedMetrics,
  FourLevers,
  Bottleneck,
  TeamScorecard,
  StatusColor,
  WoWAnalysis,
  WoWAlert,
} from './types.js';
import { TEAM_MEMBERS, TARGETS, STATUS_THRESHOLDS, getStatus } from './constants.js';

// Calculate all derived metrics
export function calculateMetrics(
  aggregate: WeeklyAggregate | null,
  businessMetrics: BusinessMetrics | null,
  avgSpeedToPricing: number,
  aaronOffers: number = 0
): CalculatedMetrics | null {
  if (!aggregate) return null;

  const metrics: CalculatedMetrics = {
    avgProfitPerDeal: 0,
    contractToCloseRate: 0,
    offerToContractRate: 0,
    hotLeadToOfferRate: 0,
    textQualificationRate: 0,
    callQualificationRate: 0,
    textYield: 0,
    costPerHotLead: 0,
    costPerContract: 0,
    avgSpeedToPricing: avgSpeedToPricing,
  };

  // Avg profit per deal
  if (businessMetrics && businessMetrics.dealsClosed > 0) {
    metrics.avgProfitPerDeal = businessMetrics.totalProfit / businessMetrics.dealsClosed;
  }

  // Lead to contract rate - Total Leads (gross) → Contracts Signed (target: ~1.94% for $500K: 0.65 ÷ 33.5 = 1.94%)
  const grossLeads = aggregate.totalLeadsText + aggregate.totalLeadsCall;
  if (grossLeads > 0 && aggregate.totalContractsSent > 0) {
    metrics.offerToContractRate = (aggregate.totalContractsSent / grossLeads) * 100;
  }

  // Contract to close rate - Contracts Signed → Deals Closed (target: 70% - some naturally fall out)
  if (aggregate.totalContractsSent > 0 && aggregate.totalContractsSigned > 0) {
    metrics.contractToCloseRate = (aggregate.totalContractsSigned / aggregate.totalContractsSent) * 100;
  }

  // Hot lead to offer rate (offer coverage) - uses Aaron's real offers
  if (aggregate.totalHotLeads > 0 && aaronOffers > 0) {
    metrics.hotLeadToOfferRate = (aaronOffers / aggregate.totalHotLeads) * 100;
  }

  // Text qualification rate
  if (aggregate.totalLeadsText > 0) {
    metrics.textQualificationRate = (aggregate.totalHotLeadsText / aggregate.totalLeadsText) * 100;
  }

  // Call qualification rate
  if (aggregate.totalLeadsCall > 0) {
    metrics.callQualificationRate = (aggregate.totalHotLeadsCall / aggregate.totalLeadsCall) * 100;
  }

  // Text yield (hot leads per 1000 texts)
  if (aggregate.totalTexts > 0) {
    metrics.textYield = (aggregate.totalHotLeadsText / aggregate.totalTexts) * 1000;
  }

  // Cost metrics
  if (businessMetrics && aggregate.totalHotLeads > 0) {
    metrics.costPerHotLead = businessMetrics.marketingSpend / aggregate.totalHotLeads;
  }

  if (businessMetrics && aggregate.totalContractsSigned > 0) {
    metrics.costPerContract = businessMetrics.marketingSpend / aggregate.totalContractsSigned;
  }

  // Median speed to pricing (from Justine's data)
  metrics.medianSpeedToPricing = aggregate.byTeamMember['justine']?.medianPricingSpeed || 0;

  return metrics;
}

// Calculate the 4 levers
export function calculateFourLevers(
  metrics: CalculatedMetrics | null,
  aggregate: WeeklyAggregate | null
): FourLevers | null {
  if (!metrics) return null;

  // Yield
  const yieldValue = metrics.textYield;
  const yieldStatus = getStatus(
    yieldValue,
    STATUS_THRESHOLDS.yield.green,
    STATUS_THRESHOLDS.yield.yellow,
    true
  );

  // Offer Coverage
  const coverageValue = metrics.hotLeadToOfferRate;
  const coverageStatus = getStatus(
    coverageValue,
    STATUS_THRESHOLDS.offerCoverage.green,
    STATUS_THRESHOLDS.offerCoverage.yellow,
    true
  );

  // Close Rate
  const closeValue = metrics.contractToCloseRate || 70; // Default if no data
  const closeStatus = getStatus(
    closeValue,
    STATUS_THRESHOLDS.closeRate.green,
    STATUS_THRESHOLDS.closeRate.yellow,
    true
  );

  return {
    yield: {
      value: Math.round(yieldValue * 100) / 100,
      target: TARGETS.yield,
      status: yieldStatus,
      action: yieldStatus === 'green'
        ? 'Great yield! Maintain list quality.'
        : 'Cut bottom 3 performing counties from list. Review data quality.',
    },
    offerCoverage: {
      value: Math.round(coverageValue),
      target: TARGETS.offerCoverage,
      status: coverageStatus,
      action: coverageStatus === 'green'
        ? 'Good coverage! Every hot lead is getting attention.'
        : 'Every hot lead gets offer same day. Aaron - clear offer backlog.',
    },
    closeRate: {
      value: Math.round(closeValue),
      target: TARGETS.closeRate,
      status: closeStatus,
      action: closeStatus === 'green'
        ? 'Strong close rate! Maintain contract quality standards.'
        : 'Review contract quality. Check: access, ownership, exit path, margin.',
    },
  };
}

// Detect the main bottleneck
export function detectBottleneck(levers: FourLevers | null): Bottleneck | null {
  if (!levers) return null;

  // Priority order: coverage → yield → close rate
  const priorityOrder: (keyof FourLevers)[] = [
    'offerCoverage',
    'yield',
    'closeRate',
  ];

  for (const key of priorityOrder) {
    if (levers[key].status === 'red') {
      return createBottleneck(key, levers);
    }
  }

  // Check for yellow status
  for (const key of priorityOrder) {
    if (levers[key].status === 'yellow') {
      return createBottleneck(key, levers);
    }
  }

  return null; // All green!
}

function createBottleneck(
  lever: keyof FourLevers,
  levers: FourLevers
): Bottleneck {
  const data = levers[lever];
  const units = {
    yield: '',
    offerCoverage: '%',
    closeRate: '%',
  };

  const titles = {
    yield: 'Text Yield Below Target',
    offerCoverage: 'Offer Coverage Below Target',
    closeRate: 'Close Rate Below Target',
  };

  const impacts = {
    yield: 'Low yield means fewer hot leads from your texting volume.',
    offerCoverage: 'Hot leads not getting offers means missed opportunities.',
    closeRate: 'Low close rate indicates contract quality issues.',
  };

  const fixes = {
    yield: 'Cut lowest-performing lists. Review data quality and messaging.',
    offerCoverage: 'Aaron - send offers to all hot leads by end of day.',
    closeRate: 'Review pre-contract checklist: access, ownership, exit path, margin.',
  };

  const owners = {
    yield: 'John & Edward',
    offerCoverage: 'Aaron',
    closeRate: 'Aaron',
  };

  return {
    lever,
    title: titles[lever],
    currentValue: `${data.value}${units[lever]}`,
    targetValue: `${data.target}${units[lever]}`,
    impact: impacts[lever],
    fix: fixes[lever],
    owner: owners[lever],
  };
}

// Build team scorecards
export function buildTeamScorecards(
  aggregate: WeeklyAggregate | null,
  metrics: CalculatedMetrics | null
): TeamScorecard[] {
  if (!aggregate) return [];

  return TEAM_MEMBERS.filter((m) => m.isActive).map((member) => {
    const kpi = aggregate.byTeamMember[member.name.toLowerCase()];

    let primaryMetric: TeamScorecard['primaryMetric'] = { label: '', current: 0, target: 0, unit: '' };
    let secondaryMetric: TeamScorecard['secondaryMetric'] = { label: '', value: 0, unit: '' };
    let hotLeadsMetric: TeamScorecard['hotLeadsMetric'];
    let postCallTimeMetric: TeamScorecard['postCallTimeMetric'];
    let funnelMetrics: TeamScorecard['funnelMetrics'];
    let status: StatusColor = 'yellow';
    let isCrushingIt = false;

    switch (member.role) {
      case 'cold_texter':
        const texts = kpi?.textsSent || 0;
        const textTarget = member.targets.textsSent || 15000;
        const totalLeads = kpi?.totalLeadsText || 0;
        const hotLeads = kpi?.hotLeadsText || 0;

        // Calculate conversion rates
        const leadsPerText = texts > 0 ? (totalLeads / texts) * 100 : 0; // % conversion
        const qualificationRate = totalLeads > 0 ? (hotLeads / totalLeads) * 100 : 0; // % qualified

        primaryMetric = {
          label: 'texts',
          current: texts,
          target: textTarget,
          unit: 'texts',
        };

        secondaryMetric = {
          label: 'qualification rate',
          value: qualificationRate,
          unit: '%',
        };

        // Funnel metrics for display
        funnelMetrics = {
          stage1: { label: 'Texts', value: texts },
          stage2: { label: 'Leads', value: totalLeads },
          stage3: { label: 'Hot', value: hotLeads },
          conversion1: leadsPerText,
          conversion2: qualificationRate,
        };

        // Hot leads: 1/day = 5/week
        hotLeadsMetric = {
          current: hotLeads,
          target: 5,
        };

        // Status based on CONVERSION RATES, not volume
        // Good conversion: ≥0.15% text-to-lead AND ≥25% qualification
        const goodTextToLead = leadsPerText >= 0.15; // ~1 lead per 667 texts
        const goodQualification = qualificationRate >= 25;

        if (goodTextToLead && goodQualification) {
          status = 'green';
          isCrushingIt = leadsPerText >= 0.2 && qualificationRate >= 30; // Exceptional
        } else if (goodTextToLead || qualificationRate >= 20) {
          status = 'yellow';
        } else {
          status = 'red';
        }
        break;

      case 'closer':
        const offers = kpi?.offersSent || 0;
        const offerTarget = member.targets.offersSent || 20;
        const contracts = kpi?.contractsSigned || 0;

        primaryMetric = {
          label: 'offers sent',
          current: offers,
          target: offerTarget,
          unit: 'offers',
        };
        secondaryMetric = {
          label: 'contracts signed',
          value: contracts,
          unit: '',
        };

        if (offers >= offerTarget) {
          status = 'green';
        } else if (offers >= offerTarget * 0.6) {
          status = 'yellow';
        } else {
          status = 'red';
        }
        break;

      case 'lead_manager':
        const edOffers = kpi?.offersSent || 0;
        const edOfferTarget = member.targets.offersSent || 20;

        primaryMetric = {
          label: 'offers sent',
          current: edOffers,
          target: edOfferTarget,
          unit: 'offers',
        };
        secondaryMetric = {
          label: 'hot leads worked',
          value: (kpi?.hotLeadsText || 0) + (kpi?.hotLeadsCall || 0),
          unit: '',
        };

        if (edOffers >= edOfferTarget) {
          status = 'green';
          isCrushingIt = edOffers >= edOfferTarget * 1.2;
        } else if (edOffers >= edOfferTarget * 0.6) {
          status = 'yellow';
        } else {
          status = 'red';
        }
        break;

    }

    return {
      member,
      primaryMetric,
      secondaryMetric,
      hotLeadsMetric,
      postCallTimeMetric,
      funnelMetrics,
      status,
      isCrushingIt,
    };
  });
}

// Determine if team is winning
export function isTeamWinning(aggregate: WeeklyAggregate | null): boolean {
  if (!aggregate) return false;
  return aggregate.totalContractsSigned >= TARGETS.weeklyContractsSigned * 0.8;
}

// Week-over-week analysis — detect major front-end issues
export function analyzeWeekOverWeek(
  current: WeeklyAggregate | null,
  previous: WeeklyAggregate | null,
): WoWAnalysis | null {
  if (!current || !previous) return null;

  const alerts: WoWAlert[] = [];

  function pctChange(curr: number, prev: number): number {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return ((curr - prev) / prev) * 100;
  }

  function check(
    metric: string,
    curr: number,
    prev: number,
    owner: string,
    opts: {
      criticalDropPct?: number;
      warningDropPct?: number;
      positiveLiftPct?: number;
      higherIsBetter?: boolean;
    } = {},
  ) {
    const {
      criticalDropPct = -40,
      warningDropPct = -20,
      positiveLiftPct = 30,
      higherIsBetter = true,
    } = opts;
    const change = pctChange(curr, prev);
    const direction = higherIsBetter ? 1 : -1;
    const adjustedChange = change * direction;

    if (adjustedChange <= criticalDropPct) {
      alerts.push({
        severity: 'critical',
        metric,
        message: `${metric} dropped ${Math.abs(Math.round(change))}% WoW (${prev.toLocaleString()} → ${curr.toLocaleString()})`,
        currentValue: curr,
        previousValue: prev,
        changePercent: Math.round(change),
        owner,
      });
    } else if (adjustedChange <= warningDropPct) {
      alerts.push({
        severity: 'warning',
        metric,
        message: `${metric} down ${Math.abs(Math.round(change))}% WoW (${prev.toLocaleString()} → ${curr.toLocaleString()})`,
        currentValue: curr,
        previousValue: prev,
        changePercent: Math.round(change),
        owner,
      });
    } else if (adjustedChange >= positiveLiftPct && curr > 0) {
      alerts.push({
        severity: 'positive',
        metric,
        message: `${metric} up ${Math.round(change)}% WoW (${prev.toLocaleString()} → ${curr.toLocaleString()})`,
        currentValue: curr,
        previousValue: prev,
        changePercent: Math.round(change),
        owner,
      });
    }
  }

  // --- Top-of-funnel: Text volume ---
  check('Text Volume', current.totalTexts, previous.totalTexts, 'John');

  // --- Gross Lead Yield (goal: 1 per 600 texts = 1.67 per 1000) ---
  const currGrossLeads = current.totalLeadsText + current.totalLeadsCall;
  const prevGrossLeads = previous.totalLeadsText + previous.totalLeadsCall;
  const currYield = current.totalTexts > 0 ? (currGrossLeads / current.totalTexts) * 1000 : 0;
  const prevYield = previous.totalTexts > 0 ? (prevGrossLeads / previous.totalTexts) * 1000 : 0;
  if (prevYield > 0) {
    check('Gross Lead Yield', Math.round(currYield * 100) / 100, Math.round(prevYield * 100) / 100, 'John',
      { criticalDropPct: -30, warningDropPct: -15 });
  }
  // Absolute yield alert: if yield drops below 1 per 1000 (half the goal)
  if (currYield > 0 && currYield < 1.0 && current.totalTexts >= 3000) {
    alerts.push({
      severity: 'critical',
      metric: 'Gross Lead Yield',
      message: `Yield critically low at ${(currYield).toFixed(2)}/1000 texts (goal: 1.67). Check list quality.`,
      currentValue: currYield,
      previousValue: prevYield,
      changePercent: prevYield > 0 ? Math.round(pctChange(currYield, prevYield)) : 0,
      owner: 'John',
    });
  }

  // --- Hot Leads (goal: 1/day = 5/week) ---
  check('Hot Leads', current.totalHotLeads, previous.totalHotLeads, 'John');

  // --- Edward (lead manager) offers ---
  const edCurr = current.byTeamMember['edward'];
  const edPrev = previous.byTeamMember['edward'];
  if (edCurr && edPrev) {
    check('Edward Offers', edCurr.offersSent, edPrev.offersSent, 'Edward');
  }

  // --- Real Offers (Aaron) ---
  check('Real Offers Sent', current.totalOffersSent, previous.totalOffersSent, 'Aaron');

  // --- Contracts Sent ---
  check('Contracts Sent', current.totalContractsSent, previous.totalContractsSent, 'Aaron',
    { criticalDropPct: -50, warningDropPct: -25 });

  // --- Deals Closed ---
  check('Deals Closed', current.totalContractsSigned, previous.totalContractsSigned, 'Aaron',
    { criticalDropPct: -50, warningDropPct: -25 });

  // Sort: critical first, then warning, then positive
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, positive: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Build summary
  const critCount = alerts.filter(a => a.severity === 'critical').length;
  const warnCount = alerts.filter(a => a.severity === 'warning').length;
  const posCount = alerts.filter(a => a.severity === 'positive').length;

  let summary: string;
  if (critCount > 0) {
    summary = `${critCount} critical issue${critCount > 1 ? 's' : ''} detected. Immediate attention needed.`;
  } else if (warnCount > 0) {
    summary = `${warnCount} metric${warnCount > 1 ? 's' : ''} trending down. Monitor closely.`;
  } else if (posCount > 0) {
    summary = `Strong week — ${posCount} metric${posCount > 1 ? 's' : ''} improving.`;
  } else {
    summary = 'Holding steady — no major changes week-over-week.';
  }

  return { alerts, summary };
}
