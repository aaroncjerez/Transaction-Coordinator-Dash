import { TeamMember } from './types.js';

export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'aaron',
    name: 'Aaron',
    role: 'closer',
    isActive: true,
    targets: {
      offersSent: 20,
      contractsSigned: 5,
    },
  },
  {
    id: 'john',
    name: 'John',
    role: 'cold_texter',
    isActive: true,
    targets: {
      textsSent: 12500,   // 50k texts/month ÷ 4 weeks = 12,500/week (sole texter)
      hotLeads: 5,        // 1 hot lead per day = 5/week
    },
  },
  {
    id: 'edward',
    name: 'Edward',
    role: 'lead_manager',
    isActive: true,
    targets: {
      offersSent: 20,     // Primary KPI: offers sent to sellers
    },
  },
];

export const TARGETS = {
  weeklyTexts: 12500,          // 50k texts/month ÷ 4 weeks
  weeklyHotLeadsText: 5,       // 1 hot lead/day = 5/week
  weeklyHotLeadsCall: 0,
  weeklyTotalHotLeads: 5,      // Text-only now (sole texter)
  weeklyOffersSent: 20,
  weeklyContractsSent: 1.3,
  weeklyContractsSigned: 5,
  weeklyDealsClosed: 0.91,
  weeklyRevenue: 22750,

  HALF_MILLION_CONTRACTS_SENT: 0.65,
  HALF_MILLION_DEALS_CLOSED: 0.455,

  // Yield: 1 gross lead per 600 texts = 1.67 gross leads per 1000 texts
  yield: 1.67,
  offerCoverage: 100,
  closeRate: 70,

  textQualificationRate: 30,
  callQualificationRate: 30,
  directMailQualificationRate: 50,
  offerToContractRate: 1.94,
  contractToCloseRate: 70,

  annualRevenue: 1000000,
  avgProfitPerDeal: 25000,
};

export const STATUS_THRESHOLDS = {
  yield: {
    green: 1.67,    // 1 gross lead per 600 texts
    yellow: 1.2,    // ~1 per 830 texts
  },
  offerCoverage: {
    green: 100,
    yellow: 80,
  },
  closeRate: {
    green: 70,
    yellow: 60,
  },
};

export function getStatus(
  value: number,
  greenThreshold: number,
  yellowThreshold: number,
  higherIsBetter: boolean = true
): 'green' | 'yellow' | 'red' {
  if (higherIsBetter) {
    if (value >= greenThreshold) return 'green';
    if (value >= yellowThreshold) return 'yellow';
    return 'red';
  } else {
    if (value <= greenThreshold) return 'green';
    if (value <= yellowThreshold) return 'yellow';
    return 'red';
  }
}
