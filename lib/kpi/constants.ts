import { TeamMember } from './types';

export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'john',
    name: 'John',
    role: 'cold_texter',
    isActive: true,
    targets: {
      textsSent: 15000,
      hotLeads: 11,
    },
  },
  {
    id: 'edward',
    name: 'Edward',
    role: 'cold_texter',
    isActive: true,
    targets: {
      textsSent: 15000,
      hotLeads: 11,
    },
  },
  {
    id: 'maria',
    name: 'Maria',
    role: 'cold_caller',
    isActive: true,
    targets: {
      callsMade: 500,
      hotLeads: 10,
    },
  },
  {
    id: 'justine',
    name: 'Justine',
    role: 'comper',
    isActive: false,
    targets: {},
  },
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
];

export const TARGETS = {
  weeklyTexts: 46900,
  weeklyHotLeadsText: 22,
  weeklyHotLeadsCall: 8,
  weeklyTotalHotLeads: 20,
  weeklyOffersSent: 20,
  weeklyContractsSent: 1.3,
  weeklyContractsSigned: 5,
  weeklyDealsClosed: 0.91,
  weeklyRevenue: 22750,

  HALF_MILLION_CONTRACTS_SENT: 0.65,
  HALF_MILLION_DEALS_CLOSED: 0.455,

  yield: 0.55,
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
    green: 0.55,
    yellow: 0.45,
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
