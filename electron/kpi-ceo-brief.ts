/**
 * KPI CEO Brief Generator — Electron Main Process
 *
 * Uses Anthropic SDK to generate a concise CEO-level weekly brief
 * from dashboard state. Returns 3 top priorities with 1-2 sentence reasoning.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { DashboardState, CEOBrief } from '../lib/kpi/types.js';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateCEOBrief(
  dashboardState: DashboardState,
): Promise<CEOBrief> {
  const prompt = buildAnalysisPrompt(dashboardState);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 800,
    temperature: 0.3,
    messages: [{ role: 'user', content: prompt }],
    tools: [
      {
        name: 'provide_ceo_brief',
        description: 'Provide the CEO weekly brief with top 3 priorities',
        input_schema: {
          type: 'object' as const,
          properties: {
            summary: {
              type: 'string',
              description: '1-2 sentences: how did the week go and what is the main takeaway',
            },
            priorities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Short headline — the change to make' },
                  detail: { type: 'string', description: '1-2 sentences: why this matters and what to do about it this week' },
                },
                required: ['title', 'detail'],
              },
              minItems: 3,
              maxItems: 3,
            },
          },
          required: ['summary', 'priorities'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'provide_ceo_brief' },
  });

  const toolUse = message.content.find(
    (block: any) => block.type === 'tool_use',
  );
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('No tool use found in Claude response');
  }

  const briefData = toolUse.input as {
    summary: string;
    priorities: { title: string; detail: string }[];
  };

  return {
    priorities: briefData.priorities,
    summary: briefData.summary,
    generatedAt: new Date().toISOString(),
  };
}

function buildAnalysisPrompt(state: DashboardState): string {
  const {
    currentWeek,
    previousWeek,
    calculatedMetrics,
    fourLevers,
    sixMonthAverages,
    teamScorecards,
  } = state;

  if (!currentWeek) {
    throw new Error('No current week data available');
  }

  // Week-over-week trends
  let trendsSection = 'No previous week data available.';
  if (previousWeek) {
    trendsSection = `Week-over-Week:
- Hot Leads: ${currentWeek.totalHotLeads} vs ${previousWeek.totalHotLeads} last week (${getChangeText(currentWeek.totalHotLeads, previousWeek.totalHotLeads)})
- Offers: ${currentWeek.byTeamMember.aaron?.offersSent || 0} vs ${previousWeek.byTeamMember.aaron?.offersSent || 0} (${getChangeText(currentWeek.byTeamMember.aaron?.offersSent || 0, previousWeek.byTeamMember.aaron?.offersSent || 0)})
- Contracts Signed: ${currentWeek.totalContractsSigned} vs ${previousWeek.totalContractsSigned} (${getChangeText(currentWeek.totalContractsSigned, previousWeek.totalContractsSigned)})`;
  }

  // 6-month context
  let sixMonthSection = '';
  if (sixMonthAverages) {
    sixMonthSection = `6-Month Averages:
- Hot Leads: ${sixMonthAverages.totalHotLeads?.toFixed(1) || 'N/A'}/week
- Offers: ${sixMonthAverages.totalOffersSent?.toFixed(1) || 'N/A'}/week
- Contracts: ${sixMonthAverages.totalContractsSigned?.toFixed(1) || 'N/A'}/week`;
  }

  // Team scorecards
  const teamSection = teamScorecards
    ?.map(
      (sc) =>
        `- ${sc.member.name} (${sc.member.role.replace(/_/g, ' ')}): ${sc.status.toUpperCase()} — ${sc.primaryMetric.current}/${sc.primaryMetric.target} ${sc.primaryMetric.label}`,
    )
    .join('\n') || 'No team data';

  return `You are the CEO of Jerez Land, a real estate investment company that buys land. You're reviewing your weekly KPI dashboard. Think like an owner who cares about one thing: closing more profitable deals.

## YOUR NUMBERS THIS WEEK (ending ${currentWeek.weekEnding})

Texts Sent: ${currentWeek.totalTexts.toLocaleString()} (target: 40,000)
Hot Leads: ${currentWeek.totalHotLeads} (target: 30)
Aaron's Real Offers: ${currentWeek.byTeamMember.aaron?.offersSent || 0} (target: 20)
Contracts Sent: ${currentWeek.totalContractsSent}
Contracts Signed: ${currentWeek.totalContractsSigned} (target: 5)

3 Levers:
- Yield: ${fourLevers?.yield.value ?? 'N/A'} (${fourLevers?.yield.status ?? 'unknown'}) — target: 0.55 hot leads per 1k texts
- Offer Coverage: ${fourLevers?.offerCoverage.value ?? 'N/A'}% (${fourLevers?.offerCoverage.status ?? 'unknown'}) — target: 100%
- Close Rate: ${fourLevers?.closeRate.value ?? 'N/A'}% (${fourLevers?.closeRate.status ?? 'unknown'}) — target: 70%

Conversion Rates:
- Text Yield: ${calculatedMetrics?.textYield.toFixed(2) ?? 'N/A'} hot leads per 1k texts
- Offer to Contract: ${calculatedMetrics?.offerToContractRate.toFixed(1) ?? 'N/A'}%
- Close Rate: ${calculatedMetrics?.contractToCloseRate.toFixed(1) ?? 'N/A'}%

${trendsSection}

${sixMonthSection}

## TEAM THIS WEEK
${teamSection}

## YOUR PIPELINE
Texts → Leads → Hot Leads → Offers → Contracts → Deals → Profit
Every bottleneck upstream kills revenue downstream. Find the constraint and fix it.

## INSTRUCTIONS
You're talking to yourself as the CEO. Give me the 3 most important things I need to change or focus on this week to grow revenue.

Rules:
- Each priority: a short title and 1-2 sentences explaining why it matters and what to do
- Reference actual numbers from above — no vague advice
- Think highest-level: what moves the needle on deals and profit?
- Be blunt. If something is broken, say it. If something is working, don't waste a slot on it.
- No corporate jargon. Talk like an owner, not a consultant.
- The summary should be 1-2 sentences: how did the week go, what's the main takeaway?`;
}

function getChangeText(current: number, previous: number): string {
  const change = current - previous;
  const pct = previous > 0 ? ((change / previous) * 100).toFixed(0) : '0';
  return change > 0 ? `+${change} (+${pct}%)` : `${change} (${pct}%)`;
}
