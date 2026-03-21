// Team member types
export type TeamRole = 'cold_texter' | 'cold_caller' | 'closer' | 'comper' | 'lead_manager';

export interface TeamMember {
  id: string;
  name: string;
  role: TeamRole;
  isActive: boolean;
  targets: {
    textsSent?: number;
    callsMade?: number;
    conversations?: number;  // Conversations (60s+) for cold callers
    hotLeads?: number;
    offersSent?: number;
    contractsSigned?: number;
  };
}

// Weekly KPI data per team member
export interface WeeklyKPI {
  id: string;
  weekEnding: string;
  teamMemberId: string;
  teamMemberName: string;
  textsSent: number;
  callsMade: number;
  totalLeadsText: number;
  totalLeadsCall: number;
  hotLeadsText: number;
  hotLeadsCall: number;
  offersSent: number;
  contractsSent: number;
  contractsSigned: number;
  conversations?: number;  // Cold call conversations (60s+)
  leadsPriced?: number;
  medianPricingSpeed?: number;
  avgPostCallTime?: number;  // Maria's avg post-call time in seconds
}

// Business-level metrics
export interface BusinessMetrics {
  id: string;
  weekEnding: string;
  dealsClosed: number;
  grossRevenue: number;
  totalProfit: number;
  marketingSpend: number;
  avgDaysToClose: number;
}

// Pricing record for speed calculation
export interface PricingRecord {
  id: string;
  pricingStatus: 'Pricing Needed' | 'Pricing Done' | string;
  pricingNeededDate?: string;
  pricingDoneDate?: string;
}

// Calculated metrics
export interface CalculatedMetrics {
  avgProfitPerDeal: number;
  offerToContractRate: number;
  contractToCloseRate: number;
  hotLeadToOfferRate: number;
  textQualificationRate: number;
  callQualificationRate: number;
  textYield: number;
  costPerHotLead: number;
  costPerContract: number;
  avgSpeedToPricing: number;
  medianSpeedToPricing?: number;
}

// Team aggregates for the week
export interface WeeklyAggregate {
  weekEnding: string;
  totalTexts: number;
  totalCalls: number;
  totalLeadsText: number;
  totalLeadsCall: number;
  totalHotLeadsText: number;
  totalHotLeadsCall: number;
  totalHotLeads: number;
  totalOffersSent: number;
  totalContractsSent: number;
  totalContractsSigned: number;
  byTeamMember: Record<string, WeeklyKPI>;
}

// Status for traffic lights
export type StatusColor = 'green' | 'yellow' | 'red';

// The 4 Levers
export interface FourLevers {
  yield: {
    value: number;
    target: number;
    status: StatusColor;
    action: string;
  };
  offerCoverage: {
    value: number;
    target: number;
    status: StatusColor;
    action: string;
  };
  closeRate: {
    value: number;
    target: number;
    status: StatusColor;
    action: string;
  };
}

// Bottleneck detection
export interface Bottleneck {
  lever: keyof FourLevers;
  title: string;
  currentValue: string;
  targetValue: string;
  impact: string;
  fix: string;
  owner: string;
}

// Team scorecard for display
export interface TeamScorecard {
  member: TeamMember;
  primaryMetric: {
    label: string;
    current: number;
    target: number;
    unit: string;
  };
  secondaryMetric?: {
    label: string;
    value: number;
    unit: string;
  };
  hotLeadsMetric?: {
    current: number;
    target: number;  // $500K pace target
  };
  postCallTimeMetric?: {
    value: number;      // seconds
    target: number;     // 60
    status: StatusColor;
  };
  funnelMetrics?: {
    stage1: { label: string; value: number };
    stage2: { label: string; value: number };
    stage3: { label: string; value: number };
    conversion1: number;
    conversion2: number;
  };
  status: StatusColor;
  isCrushingIt: boolean;
}

// Cost data
export interface CostData {
  month: string;
  coldCallEmployee: number;
  coldTextEmployee: number;
  coldCallDialer: number;
  coldTextSoftware: number;
  dataCost: number;
  coldCallTotal: number;
  coldTextTotal: number;
}

// 6-month averages
export interface SixMonthAverages {
  totalTexts: number;
  totalCalls: number;
  totalHotLeads: number;
  totalOffersSent: number;
  totalContractsSigned: number;
  textYield: number;
}

// CEO Brief types
export interface CEOPriority {
  title: string;       // Short headline — the change to make
  detail: string;      // 1-2 sentences: why it matters and what to do
}

export interface CEOBrief {
  priorities: CEOPriority[];
  summary: string;
  generatedAt: string;
}

// Scale Progress Tracker types
export interface CurrentRealityTargets {
  textVolume: number;
  callVolume: number;
  expectedGrossLeads: number;
  expectedGrossLeadsCall: number;
  expectedQualifiedLeads: number;
  expectedQualifiedLeadsCall: number;
  expectedContracts: number;
}

export interface SevenFigureGoals {
  textVolume: number;
  callVolume: number;
  grossLeads: number;
  qualifiedLeads: number;
  contracts: number;
}

export interface HalfMillionProgress {
  currentWeek: {
    totalTexts: number;
    totalCalls: number;
    grossLeads: number;
    hotLeads: number;
    hotLeadsText: number;
    hotLeadsCall: number;
    realOffers: number;
    contracts: number;
    deals: number;
    profit: number;
    avgDealSize: number;
  };
  targets: {
    texts: number;
    calls: number;
    grossLeads: number;
    hotLeads: number;
    realOffers: number;
    contracts: number;
    deals: number;
    profit: number;
  };
  progress: {
    texts: number;
    calls: number;
    grossLeads: number;
    hotLeads: number;
    realOffers: number;
    contracts: number;
    deals: number;
    profit: number;
  };
  insights: string[];
}

export interface ScaleProgress {
  currentReality: {
    targets: CurrentRealityTargets;
    actuals: {
      textVolume: number;
      callVolume: number;
      grossLeads: number;
      grossLeadsCall: number;
      qualifiedLeads: number;
      qualifiedLeadsCall: number;
      contracts: number;
    };
  };
  sevenFigureGoal: SevenFigureGoals;
  gaps: {
    textVolumeGap: number;
    callVolumeGap: number;
    qualifiedLeadsGap: number;
    contractsGap: number;
  };
  halfMillionProgress?: HalfMillionProgress;
}

// Week-over-week analysis
export interface WoWAlert {
  severity: 'critical' | 'warning' | 'positive';
  metric: string;
  message: string;
  currentValue: number;
  previousValue: number;
  changePercent: number;
  owner: string;
}

export interface WoWAnalysis {
  alerts: WoWAlert[];
  summary: string;
}

// Dashboard state
export interface DashboardState {
  currentWeek: WeeklyAggregate | null;
  previousWeek: WeeklyAggregate | null;
  businessMetrics: BusinessMetrics | null;
  calculatedMetrics: CalculatedMetrics | null;
  fourLevers: FourLevers | null;
  bottleneck: Bottleneck | null;
  ceoBrief: CEOBrief | null;
  scaleProgress: ScaleProgress | null;
  teamScorecards: TeamScorecard[];
  isWinning: boolean;
  wowAnalysis: WoWAnalysis | null;
  isLoading: boolean;
  error: string | null;
  sixMonthAverages?: SixMonthAverages | null;
}
