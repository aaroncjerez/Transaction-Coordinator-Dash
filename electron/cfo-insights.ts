/**
 * CFO Insights Generator — Electron Main Process
 *
 * Uses Anthropic SDK to generate CFO-level financial insights
 * from deal portfolio data. Returns structured insights via tool_use.
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

export interface MonthlyProfitEntry {
  month: string;
  label: string;
  dealCount: number;
  realizedGrossProfit: number;
  myShare: number;
}

export interface CFOInputData {
  activeDeals: { count: number; stages: Record<string, number> };
  totalPipelineValue: number;
  myProjectedProfit: number;
  myRealizedProfit: number;
  totalRealizedGross: number;
  monthlyProfits: MonthlyProfitEntry[];
  trailingAverage: number;
  overdueDeadlineCount: number;
  staleDealsCount: number;
  pendingTaskCount: number;
  soldDealCount: number;
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
    max_tokens: 1000,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
    tools: [
      {
        name: 'provide_cfo_insights',
        description: 'Provide CFO financial insights for the real estate land portfolio',
        input_schema: {
          type: 'object' as const,
          properties: {
            summary: {
              type: 'string',
              description: '2-3 sentence financial health overview of the portfolio',
            },
            insights: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Short actionable headline' },
                  detail: { type: 'string', description: '1-2 sentences with specific numbers and recommendations' },
                },
                required: ['title', 'detail'],
              },
              minItems: 3,
              maxItems: 5,
            },
            monthlyTrend: {
              type: 'string',
              description: '1-2 sentences about the month-over-month profit trend and what it means',
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
  const {
    activeDeals,
    totalPipelineValue,
    myProjectedProfit,
    myRealizedProfit,
    totalRealizedGross,
    monthlyProfits,
    trailingAverage,
    overdueDeadlineCount,
    staleDealsCount,
    pendingTaskCount,
    soldDealCount,
  } = data;

  // Stage breakdown
  const stageLines = Object.entries(activeDeals.stages)
    .map(([stage, count]) => `  - ${stage}: ${count}`)
    .join('\n');

  // Monthly profit history
  const monthLines = monthlyProfits.length > 0
    ? monthlyProfits.map(m =>
        `  - ${m.label}: ${m.dealCount} deal${m.dealCount !== 1 ? 's' : ''}, Gross Profit: $${m.realizedGrossProfit.toLocaleString()}, My Share: $${m.myShare.toLocaleString()}`
      ).join('\n')
    : '  No sold deals yet.';

  const formatCurrency = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
    return `$${v.toLocaleString()}`;
  };

  return `You are the CFO of Jerez Land, a real estate investment company that buys and flips vacant land. You're reviewing the financial health of the portfolio. Think like a numbers-driven finance executive who owns the P&L and cares about cash flow, profit margins, and capital allocation.

## PORTFOLIO SNAPSHOT
Active Deals: ${activeDeals.count}
${stageLines ? `Stage Breakdown:\n${stageLines}` : ''}
Pipeline Value (total purchase cost of active deals): ${formatCurrency(totalPipelineValue)}
My Projected Profit (JL Share of active deals): ${formatCurrency(myProjectedProfit)}
My Realized Profit (JL Share of sold deals): ${formatCurrency(myRealizedProfit)}
Total Realized Gross Profit (all sold deals): ${formatCurrency(totalRealizedGross)}
Total Sold Deals: ${soldDealCount}

## MONTHLY PROFIT HISTORY (My Share)
${monthLines}
Trailing 6-Month Average (My Share): ${formatCurrency(trailingAverage)}/month

## OPERATIONAL HEALTH
Overdue Deadlines: ${overdueDeadlineCount}
Stale Deals (no activity >14 days): ${staleDealsCount}
Pending Tasks: ${pendingTaskCount}

## INSTRUCTIONS
Give me 3-5 actionable financial insights as my CFO. Focus on:
- Cash flow trajectory: is monthly realized profit trending up, down, or flat?
- Capital efficiency: how much capital is tied up in pipeline vs returned from sales?
- Profit margins: is my projected share realistic based on what we've actually realized?
- Red flags: stale deals eating holding costs, overdue items blocking closings, bottlenecks
- Growth: what should we do to increase monthly profit?

Rules:
- Reference specific numbers from above — no vague advice
- Be direct and talk like a CFO who owns the P&L, not a consultant
- The summary should assess overall financial health in 2-3 sentences
- monthlyTrend should describe what the month-over-month numbers tell you
- Each insight needs a short title and 1-2 sentences with specific recommendations`;
}
