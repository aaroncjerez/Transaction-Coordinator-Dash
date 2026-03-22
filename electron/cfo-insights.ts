/**
 * CFO Insights Generator — Electron Main Process
 *
 * Uses Anthropic SDK to generate CFO-level financial insights
 * from FUB deal pipeline + Mercury bank data.
 */

import Anthropic from '@anthropic-ai/sdk';

// ---- Types ----

export interface CFOInsight {
  title: string;
  detail: string;
}

export interface CFOInsightsResult {
  summary: string;
  insights: CFOInsight[];
  monthlyTrend: string;
  generatedAt: string;
}

export interface CFOInputData {
  // Mercury bank
  cashPosition: number;
  monthlyBurn: number;
  runway: number;
  last30DaysIn: number;
  last30DaysOut: number;

  // FUB active deals
  activeDeals: { count: number; stages: Record<string, number>; totalPipeline: number; totalExpectedProfit: number };
  activeDealsList: { name: string; stage: string; buyPrice: number; profit: number; closeDate: string | null }[];

  // FUB closed deals (historical)
  closedDeals: { count: number; totalProfit: number; avgProfit: number; avgMargin: number };

  // Monthly cashflow
  monthlyCashflow: { month: string; income: number; expenses: number; net: number }[];
}

// ---- Generator ----

export async function generateCFOInsights(
  data: CFOInputData,
  apiKey: string,
): Promise<CFOInsightsResult> {
  const client = new Anthropic({ apiKey });
  const prompt = buildCFOPrompt(data);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1200,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
    tools: [
      {
        name: 'provide_cfo_insights',
        description: 'Provide CFO financial insights for the land investment portfolio',
        input_schema: {
          type: 'object' as const,
          properties: {
            summary: {
              type: 'string',
              description: '2-3 sentence financial health overview — cash position, pipeline strength, burn rate assessment',
            },
            insights: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Short actionable headline (e.g. "Capital Locked in Slow Deals")' },
                  detail: { type: 'string', description: '1-2 sentences with specific dollar amounts and recommendations' },
                },
                required: ['title', 'detail'],
              },
              minItems: 3,
              maxItems: 5,
            },
            monthlyTrend: {
              type: 'string',
              description: '1-2 sentences about the month-over-month profit and cashflow trajectory',
            },
          },
          required: ['summary', 'insights', 'monthlyTrend'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'provide_cfo_insights' },
  });

  const toolUse = message.content.find(
    (block: any) => block.type === 'tool_use',
  );
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('No tool use found in Claude response');
  }

  const result = toolUse.input as {
    summary: string;
    insights: CFOInsight[];
    monthlyTrend: string;
  };

  return {
    ...result,
    generatedAt: new Date().toISOString(),
  };
}

// ---- Prompt Builder ----

function buildCFOPrompt(data: CFOInputData): string {
  const fmt = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${Math.round(v / 1_000).toLocaleString()}K`;
    return `$${v.toLocaleString()}`;
  };

  const stageLines = Object.entries(data.activeDeals.stages)
    .map(([stage, count]) => `  - ${stage}: ${count} deal${count !== 1 ? 's' : ''}`)
    .join('\n');

  const dealLines = data.activeDealsList
    .map(d => `  - ${d.name} (${d.stage}): Buy ${fmt(d.buyPrice)}, Profit ${fmt(d.profit)}${d.closeDate ? `, Close ${d.closeDate.slice(0, 10)}` : ''}`)
    .join('\n');

  const monthLines = data.monthlyCashflow.length > 0
    ? data.monthlyCashflow.map(m =>
        `  - ${m.month}: In ${fmt(m.income)}, Out ${fmt(m.expenses)}, Net ${m.net >= 0 ? '+' : ''}${fmt(m.net)}`
      ).join('\n')
    : '  No monthly data yet.';

  return `You are the CFO of Jerez Land LLC, a real estate company that buys vacant land at a discount and flips it for profit. Your business model:

- **Revenue comes from deal profits** — you buy land parcels (typically $15K-$100K), then resell or double-close at higher prices. Revenue is lumpy, not recurring.
- **Deal types**: Standard Flip (buy, hold, list with realtor, sell), Double Close (simultaneous buy-sell, fast but lower margin), Assignment (sell the contract), Subdivide (split into lots, highest margin but slowest).
- **Typical margins**: 15-50% on flips, 2-10% on double closes, 30-60% on subdivides.
- **Operating costs**: texting/calling software ($1-2K/mo), virtual assistants, CRM, title fees, earnest money deposits (EMD).
- **Capital cycle**: Cash goes out (purchase + closing costs) → deal sits in pipeline → cash comes back (sale proceeds). Velocity matters.

## BANK POSITION (Mercury)
Cash on hand: ${fmt(data.cashPosition)}
Monthly burn rate: ${fmt(data.monthlyBurn)}
Runway: ${data.runway >= 99 ? '99+ months' : `${data.runway.toFixed(1)} months`}
Last 30 days — Income: ${fmt(data.last30DaysIn)} | Expenses: ${fmt(data.last30DaysOut)} | Net: ${data.last30DaysIn - data.last30DaysOut >= 0 ? '+' : ''}${fmt(data.last30DaysIn - data.last30DaysOut)}

## ACTIVE DEAL PIPELINE (FUB)
Active deals: ${data.activeDeals.count}
Capital deployed in pipeline: ${fmt(data.activeDeals.totalPipeline)}
Total expected profit from active deals: ${fmt(data.activeDeals.totalExpectedProfit)}
${stageLines ? `Stage breakdown:\n${stageLines}` : ''}

Per-deal breakdown:
${dealLines || '  No active deals.'}

## HISTORICAL PERFORMANCE (Closed Deals)
Deals closed: ${data.closedDeals.count}
Total realized profit: ${fmt(data.closedDeals.totalProfit)}
Average profit per deal: ${fmt(data.closedDeals.avgProfit)}
Average margin: ${data.closedDeals.avgMargin.toFixed(1)}%

## MONTHLY CASHFLOW (Mercury)
${monthLines}

## YOUR ANALYSIS
Give me 3-5 actionable CFO insights. Think like a finance executive who owns the P&L for a land flipping operation. Focus on:

1. **Cash vs Pipeline**: Is too much capital locked up in slow-moving deals? What's the ratio of cash on hand to capital deployed?
2. **Deal velocity**: Are deals closing fast enough? Any deals past their projected close date that are tying up capital?
3. **Profit margins**: Are actual margins matching expectations? How does avg realized profit compare to what's projected in the pipeline?
4. **Burn rate warning**: At current burn rate, how long until you need a deal to close? Is the pipeline covering your overhead?
5. **Growth levers**: Based on historical performance, what's the highest-ROI move — more deals, bigger deals, faster closes, or cutting costs?

Rules:
- Reference specific dollar amounts from the data above
- Be direct — talk like a CFO who owns the P&L, not a consultant
- Flag any deal that looks like it's stuck or underperforming
- The summary should assess overall financial health in 2-3 sentences
- monthlyTrend should describe the trajectory and what it means for the next 90 days`;
}
