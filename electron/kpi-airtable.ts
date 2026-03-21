/**
 * KPI Airtable Data Layer — Electron Main Process
 *
 * Combined from:
 *   dashboard/src/lib/airtable/client.ts   (Airtable SDK init)
 *   dashboard/src/lib/airtable/queries.ts  (all query functions)
 *
 * Adapted for Electron main process (Node.js, CommonJS-compatible).
 */

import Airtable from 'airtable';
import type {
  WeeklyKPI,
  BusinessMetrics,
  PricingRecord,
  WeeklyAggregate,
} from '../lib/kpi/types.js';

// ---------------------------------------------------------------------------
// Airtable client initialisation (was client.ts)
// Lazy init — env vars read at call time so dotenv has loaded first.
// ---------------------------------------------------------------------------

let _base: ReturnType<InstanceType<typeof Airtable>['base']> | null = null;

function getBase() {
  if (_base) return _base;
  const apiKey = process.env.AIRTABLE_PAT;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) {
    console.warn('[KPI-Airtable] AIRTABLE_PAT or AIRTABLE_BASE_ID missing');
    return null;
  }
  _base = new Airtable({ apiKey, requestTimeout: 30000 }).base(baseId);
  return _base;
}

function getTable(name: string) {
  const b = getBase();
  return b ? b(name) : null;
}

export const tables = {
  get weeklyKpi() { return getTable('Weekly KPI'); },
  get dailyKpi() { return getTable('Daily KPI'); },
  get businessMetrics() { return getTable('Business Metrics'); },
  get landPricing() { return getTable('Land Pricing'); },
  get teamMembers() { return getTable('Team'); },
};

// ---------------------------------------------------------------------------
// Interfaces (from queries.ts)
// ---------------------------------------------------------------------------

// Extended interface for raw Airtable record with all fields
interface AirtableWeeklyRecord {
  id: string;
  // Date fields
  'Week End Date'?: string;
  'Week Start Date'?: string;
  // John's metrics
  'Total Texts Sent - John'?: number;
  'John Total Leads'?: number;
  'John Hot Leads'?: number;
  'John Offers Shared'?: number;
  // Edward's metrics
  'Total Texts Sent - Edward'?: number;
  'Edward Total Leads'?: number;
  'Edward Hot Leads'?: number;
  'Edward Offers Shared'?: number;
  'Edward Logged Calls'?: number;
  // Maria's metrics
  'Maria Logged Calls'?: number;
  'Maria Cold Call Conversations'?: number;  // Conversations (60s+)
  'Maria Total Leads'?: number;
  'Maria Hot Leads'?: number;
  'Maria Offers Shared'?: number;
  'Maria Avg Post Call Time'?: number;
  // Justine's metrics
  'Total Texts Sent - Justine'?: number;
  'Justine Total Leads'?: number;
  'Justine Hot Leads'?: number;
  'Justine Offers Shared'?: number;
  'Justine Total leads priced'?: number;
  'Justine Median Pricing Speed'?: number;
  // Aaron's metrics
  'Aaron Real Offers Shared'?: number;
  // Team totals from Airtable (use these instead of summing)
  'Total Texts Sent'?: number; // Combined total texts (if exists in Airtable)
  'Total Leads'?: number; // Combined gross leads (if exists in Airtable)
  'Total Cold Call Conversations'?: number; // Total calls made (confirmed field name)
  'Actual Total Cold Text Leads'?: number;
  'Total Cold Call Leads'?: number;
  'Actual Total Hot Cold Text Leads'?: number;
  'Actual Total Hot Cold Call Leads'?: number;
  'Total Hot Leads (FUB)'?: number;
  'Total Offers Sent'?: number;
  'Contracts Sent (PandaDoc)'?: number;
  'Contracts Signed'?: number;
  'Contracts Sent to Title'?: number; // Deals closed (user confirmed field name)
  // Revenue
  'Pipeline Profit Generated'?: number;
  'Realized Gross Profit Generated'?: number;
}

// Result includes both individual KPIs and team totals
interface ParsedWeekData {
  kpis: WeeklyKPI[];
  totals: {
    totalCalls: number;
    totalLeads: number; // Gross leads from Airtable "Total Leads" column
    totalHotLeads: number;
    totalOffersSent: number;
    totalContractsSent: number;
    totalContractsSigned: number;
    realizedProfit: number;
    pipelineProfit: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Get the most recent week ending date (Saturday)
export function getCurrentWeekEnding(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
  const saturday = new Date(now);
  saturday.setDate(now.getDate() + daysUntilSaturday);
  return saturday.toISOString().split('T')[0];
}

// Get previous week ending
export function getPreviousWeekEnding(currentWeekEnding: string): string {
  const current = new Date(currentWeekEnding);
  current.setDate(current.getDate() - 7);
  return current.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Record parser
// ---------------------------------------------------------------------------

// Parse Airtable record format to WeeklyKPI array and totals
function parseAirtableWeekRecord(record: AirtableWeeklyRecord): ParsedWeekData {
  const weekEnding = record['Week End Date'] || '';

  const teamMembers = [
    {
      id: 'aaron',
      name: 'Aaron',
      textsSent: 0,
      callsMade: 0,
      totalLeadsText: 0,
      totalLeadsCall: 0,
      hotLeadsText: 0,
      hotLeadsCall: 0,
      offersSent: record['Aaron Real Offers Shared'] || 0,
      contractsSent: record['Contracts Signed'] || 0,
      contractsSigned: record['Contracts Sent to Title'] || 0,
    },
    {
      id: 'john',
      name: 'John',
      textsSent: record['Total Texts Sent - John'] || 0,
      callsMade: 0,
      totalLeadsText: record['John Total Leads'] || 0,
      totalLeadsCall: 0,
      hotLeadsText: record['John Hot Leads'] || 0,
      hotLeadsCall: 0,
      offersSent: record['John Offers Shared'] || 0,
      contractsSent: 0,
      contractsSigned: 0,
    },
    {
      id: 'edward',
      name: 'Edward',
      textsSent: 0,
      callsMade: 0,
      totalLeadsText: 0,
      totalLeadsCall: 0,
      hotLeadsText: record['Edward Hot Leads'] || 0,
      hotLeadsCall: 0,
      offersSent: record['Edward Offers Shared'] || 0,
      contractsSent: 0,
      contractsSigned: 0,
    },
  ];

  const kpis = teamMembers.map((member, index) => ({
    id: `${record.id || index}-${member.id}`,
    weekEnding,
    teamMemberId: member.id,
    teamMemberName: member.name,
    textsSent: member.textsSent,
    callsMade: member.callsMade,
    conversations: (member as any).conversations,
    totalLeadsText: member.totalLeadsText,
    totalLeadsCall: member.totalLeadsCall,
    hotLeadsText: member.hotLeadsText,
    hotLeadsCall: member.hotLeadsCall,
    offersSent: member.offersSent,
    contractsSent: member.contractsSent,
    contractsSigned: member.contractsSigned,
    leadsPriced: (member as any).leadsPriced,
    medianPricingSpeed: (member as any).medianPricingSpeed,
    avgPostCallTime: (member as any).avgPostCallTime,
  }));

  // Use Airtable's calculated totals (they may differ from sum of individuals)
  const totals = {
    totalCalls: record['Total Cold Call Conversations'] || 0,
    totalLeads: record['Total Leads'] || 0, // Gross leads from Airtable
    totalHotLeads: record['Total Hot Leads (FUB)'] || 0,
    totalOffersSent: record['Aaron Real Offers Shared'] || 0, // CRITICAL: Aaron's real offers only (not team total)
    totalContractsSent: record['Contracts Signed'] || 0, // When seller SIGNS contract (target: 0.65/week)
    // User confirmed: "Contracts Sent to Title" = deals closed
    totalContractsSigned: record['Contracts Sent to Title'] || 0, // When deal CLOSES (target: 0.455/week - 70% of signed)
    realizedProfit: record['Realized Gross Profit Generated'] || 0,
    pipelineProfit: record['Pipeline Profit Generated'] || 0,
  };

  return { kpis, totals };
}

// ---------------------------------------------------------------------------
// Module-level state — stores totals from parsing for use in aggregation
// ---------------------------------------------------------------------------

let currentWeekTotals: ParsedWeekData['totals'] | null = null;
let previousWeekTotals: ParsedWeekData['totals'] | null = null;

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

// Fetch weekly KPI data — gets the most recent week by default
export async function fetchWeeklyKPIs(weekEnding?: string): Promise<WeeklyKPI[]> {
  if (!tables.weeklyKpi) {
    throw new Error(
      'Airtable not configured. Please check AIRTABLE_PAT and AIRTABLE_BASE_ID.',
    );
  }

  try {
    const filterFormula = weekEnding
      ? `{Week End Date} = '${weekEnding}'`
      : '';

    const records = await tables.weeklyKpi
      .select({
        filterByFormula: filterFormula,
        sort: [{ field: 'Week End Date', direction: 'desc' }],
        maxRecords: 1,
      })
      .firstPage();

    if (records.length === 0) {
      throw new Error('No weekly KPI records found in Airtable.');
    }

    const record = records[0];
    const fields = record.fields as unknown as AirtableWeeklyRecord;
    fields.id = record.id;

    console.log('Fetched live data from Airtable for week:', fields['Week End Date']);

    const parsed = parseAirtableWeekRecord(fields);
    currentWeekTotals = parsed.totals;

    return parsed.kpis;
  } catch (error) {
    console.error('Error fetching weekly KPIs from Airtable:', error);
    throw error;
  }
}

// Fetch previous week's KPI data
export async function fetchPreviousWeekKPIs(
  currentWeekEnding: string,
): Promise<WeeklyKPI[]> {
  if (!tables.weeklyKpi) {
    throw new Error('Airtable not configured.');
  }

  try {
    const records = await tables.weeklyKpi
      .select({
        sort: [{ field: 'Week End Date', direction: 'desc' }],
        maxRecords: 2,
      })
      .firstPage();

    if (records.length < 2) {
      console.log('Only one week of data available.');
      return [];
    }

    const record = records[1];
    const fields = record.fields as unknown as AirtableWeeklyRecord;
    fields.id = record.id;

    console.log(
      'Fetched previous week data from Airtable for week:',
      fields['Week End Date'],
    );

    const parsed = parseAirtableWeekRecord(fields);
    previousWeekTotals = parsed.totals;

    return parsed.kpis;
  } catch (error) {
    console.error('Error fetching previous week KPIs:', error);
    throw error;
  }
}

// Fetch business metrics from Weekly KPI table (revenue data is there)
export async function fetchBusinessMetrics(
  weekEnding?: string,
): Promise<BusinessMetrics | null> {
  // Use the totals we already fetched
  if (currentWeekTotals) {
    return {
      id: 'from-weekly-kpi',
      weekEnding: weekEnding || '',
      dealsClosed: 0,
      grossRevenue: currentWeekTotals.realizedProfit,
      totalProfit: currentWeekTotals.pipelineProfit,
      marketingSpend: 4500,
      avgDaysToClose: 45,
    };
  }
  return null;
}

// Fetch pricing records for speed calculation
export async function fetchPricingRecords(): Promise<PricingRecord[]> {
  // TODO: Update when Land Pricing table has proper timestamp fields
  return [];
}

// Calculate average speed to pricing in minutes
export function calculateAvgSpeedToPricing(records: PricingRecord[]): number {
  const validRecords = records.filter(
    (r) => r.pricingNeededDate && r.pricingDoneDate,
  );

  if (validRecords.length === 0) return 25; // Default estimate

  const totalMinutes = validRecords.reduce((sum, record) => {
    const needed = new Date(record.pricingNeededDate!);
    const done = new Date(record.pricingDoneDate!);
    const diffMs = done.getTime() - needed.getTime();
    const diffMinutes = diffMs / (1000 * 60);
    return sum + Math.max(0, diffMinutes);
  }, 0);

  return Math.round(totalMinutes / validRecords.length);
}

// Aggregate weekly KPIs — uses Airtable totals where available
export function aggregateWeeklyKPIs(
  kpis: WeeklyKPI[],
  totals?: ParsedWeekData['totals'] | null,
): WeeklyAggregate {
  const weekEnding = kpis[0]?.weekEnding || getCurrentWeekEnding();

  // Sum individual metrics
  let totalTexts = 0;
  let totalCalls = 0;
  let totalLeadsText = 0;
  let totalLeadsCall = 0;
  let totalHotLeadsText = 0;
  let totalHotLeadsCall = 0;
  let summedOffers = 0;
  let summedContractsSent = 0;
  let summedContractsSigned = 0;
  const byTeamMember: Record<string, WeeklyKPI> = {};

  let aaronOffersSent = 0; // ONLY Aaron's offers (not total team offers)

  for (const kpi of kpis) {
    totalTexts += kpi.textsSent;
    totalCalls += kpi.callsMade;
    totalLeadsText += kpi.totalLeadsText;
    totalLeadsCall += kpi.totalLeadsCall;
    totalHotLeadsText += kpi.hotLeadsText;
    totalHotLeadsCall += kpi.hotLeadsCall;
    summedOffers += kpi.offersSent;
    summedContractsSent += kpi.contractsSent;
    summedContractsSigned += kpi.contractsSigned;

    // Track Aaron's offers separately (Real Offers metric)
    if (kpi.teamMemberId === 'aaron') {
      aaronOffersSent = kpi.offersSent;
    }

    byTeamMember[kpi.teamMemberName.toLowerCase()] = kpi;
  }

  // Use Airtable totals if available, otherwise fall back to summed values
  const useTotals = totals;

  return {
    weekEnding,
    totalTexts,
    // Use Airtable's "Total Cold Call Conversations" field
    totalCalls: useTotals?.totalCalls ?? totalCalls,
    totalLeadsText,
    totalLeadsCall,
    totalHotLeadsText,
    totalHotLeadsCall,
    // Use Airtable's "Total Hot Leads (FUB)" field
    totalHotLeads:
      useTotals?.totalHotLeads ?? totalHotLeadsText + totalHotLeadsCall,
    // CRITICAL: Use Aaron's Real Offers from Airtable (not team total!)
    totalOffersSent: useTotals?.totalOffersSent ?? aaronOffersSent,
    // CRITICAL: Use "Contracts Signed" from Airtable (when seller signs, 0.65/week target)
    totalContractsSent: useTotals?.totalContractsSent ?? summedContractsSent,
    // CRITICAL: Use "Contracts Sent to Title" from Airtable (when deal closes, 0.455/week target)
    totalContractsSigned:
      useTotals?.totalContractsSigned ?? summedContractsSigned,
    byTeamMember,
  };
}

// Export functions to get totals for aggregation
export function getCurrentWeekTotals() {
  return currentWeekTotals;
}

export function getPreviousWeekTotals() {
  return previousWeekTotals;
}

// Fetch YTD revenue from Weekly KPI table
export async function fetchYTDRevenue(): Promise<number> {
  if (!tables.weeklyKpi) {
    throw new Error('Airtable not configured.');
  }

  try {
    const currentYear = new Date().getFullYear();
    const startOfYear = `${currentYear}-01-01`;

    const records = await tables.weeklyKpi
      .select({
        filterByFormula: `{Week End Date} >= '${startOfYear}'`,
        sort: [{ field: 'Week End Date', direction: 'desc' }],
      })
      .all();

    const ytdRevenue = records.reduce((sum: number, record: any) => {
      const realized =
        (record.get('Realized Gross Profit Generated') as number) || 0;
      return sum + realized;
    }, 0);

    console.log(`YTD Revenue (${currentYear}):`, ytdRevenue);
    return ytdRevenue;
  } catch (error) {
    console.error('Error fetching YTD revenue:', error);
    throw error;
  }
}

// Fetch historical data for 6-month averages
export async function fetchHistoricalKPIs(
  months: number = 6,
): Promise<WeeklyAggregate[]> {
  if (!tables.weeklyKpi) {
    throw new Error('Airtable not configured.');
  }

  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - months);
    const startDate = sixMonthsAgo.toISOString().split('T')[0];

    const records = await tables.weeklyKpi
      .select({
        filterByFormula: `{Week End Date} >= '${startDate}'`,
        sort: [{ field: 'Week End Date', direction: 'desc' }],
      })
      .all();

    return records.map((record: any) => {
      const fields = record.fields as unknown as AirtableWeeklyRecord;
      fields.id = record.id;
      const parsed = parseAirtableWeekRecord(fields);
      return aggregateWeeklyKPIs(parsed.kpis, parsed.totals);
    });
  } catch (error) {
    console.error('Error fetching historical KPIs:', error);
    throw error;
  }
}

// Calculate 6-month averages from historical data
export function calculate6MonthAverages(
  historicalData: WeeklyAggregate[],
): {
  totalTexts: number;
  totalCalls: number;
  totalHotLeads: number;
  totalOffersSent: number;
  totalContractsSigned: number;
  textYield: number;
} {
  if (historicalData.length === 0) {
    return {
      totalTexts: 0,
      totalCalls: 0,
      totalHotLeads: 0,
      totalOffersSent: 0,
      totalContractsSigned: 0,
      textYield: 0,
    };
  }

  const totals = historicalData.reduce(
    (acc, week) => ({
      totalTexts: acc.totalTexts + week.totalTexts,
      totalCalls: acc.totalCalls + week.totalCalls,
      totalHotLeads: acc.totalHotLeads + week.totalHotLeads,
      totalOffersSent: acc.totalOffersSent + week.totalOffersSent,
      totalContractsSigned:
        acc.totalContractsSigned + week.totalContractsSigned,
      totalHotLeadsText: acc.totalHotLeadsText + week.totalHotLeadsText,
    }),
    {
      totalTexts: 0,
      totalCalls: 0,
      totalHotLeads: 0,
      totalOffersSent: 0,
      totalContractsSigned: 0,
      totalHotLeadsText: 0,
    },
  );

  const weeks = historicalData.length;
  const avgTexts = totals.totalTexts / weeks;
  const avgHotLeadsText = totals.totalHotLeadsText / weeks;

  return {
    totalTexts: Math.round(avgTexts),
    totalCalls: Math.round(totals.totalCalls / weeks),
    totalHotLeads: Math.round(totals.totalHotLeads / weeks),
    totalOffersSent: Math.round(totals.totalOffersSent / weeks),
    totalContractsSigned:
      Math.round((totals.totalContractsSigned / weeks) * 10) / 10,
    textYield:
      avgTexts > 0 ? (avgHotLeadsText / avgTexts) * 1000 : 0,
  };
}
