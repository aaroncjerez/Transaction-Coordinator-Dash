/**
 * KPI CEO Brief Generator — Electron Main Process
 *
 * Source: dashboard/src/lib/ai/claude-client.ts
 *
 * Adapted for Electron main process (Node.js).
 * Uses Anthropic SDK to generate structured CEO briefs from dashboard state.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { DashboardState, CEOBrief } from '../lib/kpi/types';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateCEOBrief(
  dashboardState: DashboardState,
): Promise<CEOBrief> {
  // Build comprehensive data summary for Claude
  const prompt = buildAnalysisPrompt(dashboardState);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1500,
    temperature: 0.3, // Lower temp for consistent business advice
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    // Use tool calling to ensure structured JSON response
    tools: [
      {
        name: 'provide_ceo_brief',
        description: 'Provide strategic CEO brief with priorities',
        input_schema: {
          type: 'object' as const,
          properties: {
            priorities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  focus: { type: 'string' },
                  why: { type: 'string' },
                  action: { type: 'string' },
                  owner: { type: 'string' },
                  impact: { type: 'string' },
                },
                required: ['focus', 'why', 'action', 'owner', 'impact'],
              },
              minItems: 2,
              maxItems: 3,
            },
            summary: { type: 'string' },
          },
          required: ['priorities', 'summary'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'provide_ceo_brief' },
  });

  // Extract structured data from tool call
  const toolUse = message.content.find(
    (block: any) => block.type === 'tool_use',
  );
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('No tool use found in Claude response');
  }

  const briefData = toolUse.input as {
    priorities: any[];
    summary: string;
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
    businessMetrics,
  } = state;

  if (!currentWeek) {
    throw new Error('No current week data available');
  }

  return `You are a CEO advisor for a land acquisition business. Analyze the KPI data and provide strategic guidance.

## BUSINESS MODEL
- Cold texters (John, Edward) generate leads via SMS
- Cold caller (Maria) converts leads to hot leads
- Comper (Justine) prices deals quickly
- Closer (Aaron) sends offers, gets contracts signed
- Goal: 5 contracts signed/week → $1M annual revenue

## CURRENT WEEK (ending ${currentWeek.weekEnding})
**Volumes:**
- Texts: ${currentWeek.totalTexts} (target: 40,000)
- Hot Leads: ${currentWeek.totalHotLeads} (target: 30)
- Aaron's Offers: ${currentWeek.byTeamMember.aaron?.offersSent || 0} (target: 20)
- Contracts Sent: ${currentWeek.totalContractsSent}
- Contracts Signed: ${currentWeek.totalContractsSigned} (target: 5)

**The 3 Levers:**
- Yield: ${fourLevers?.yield.value || 'N/A'} (${fourLevers?.yield.status || 'unknown'}) - target: ${fourLevers?.yield.target || 0.55}
- Offer Coverage: ${fourLevers?.offerCoverage.value || 'N/A'}% (${fourLevers?.offerCoverage.status || 'unknown'}) - target: ${fourLevers?.offerCoverage.target || 75}%
- Close Rate: ${fourLevers?.closeRate.value || 'N/A'}% (${fourLevers?.closeRate.status || 'unknown'}) - target: ${fourLevers?.closeRate.target || 70}%

**Conversion Rates:**
- Text Yield: ${calculatedMetrics?.textYield.toFixed(2) || 'N/A'} hot leads per 1k texts
- Offer to Contract: ${calculatedMetrics?.offerToContractRate.toFixed(1) || 'N/A'}%
- Close Rate: ${calculatedMetrics?.contractToCloseRate.toFixed(1) || 'N/A'}%

## WEEK-OVER-WEEK TRENDS
${
  previousWeek
    ? `
- Hot Leads: ${currentWeek.totalHotLeads} vs ${previousWeek.totalHotLeads} (${getChangeText(currentWeek.totalHotLeads, previousWeek.totalHotLeads)})
- Offers: ${currentWeek.byTeamMember.aaron?.offersSent || 0} vs ${previousWeek.byTeamMember.aaron?.offersSent || 0} (${getChangeText(currentWeek.byTeamMember.aaron?.offersSent || 0, previousWeek.byTeamMember.aaron?.offersSent || 0)})
- Contracts Signed: ${currentWeek.totalContractsSigned} vs ${previousWeek.totalContractsSigned} (${getChangeText(currentWeek.totalContractsSigned, previousWeek.totalContractsSigned)})
`
    : 'No previous week data available'
}

## 6-MONTH CONTEXT
${
  sixMonthAverages
    ? `
- Avg Hot Leads: ${sixMonthAverages.totalHotLeads?.toFixed(1) || 'N/A'}
- Avg Offers: ${sixMonthAverages.totalOffersSent?.toFixed(1) || 'N/A'}
- Avg Contracts: ${sixMonthAverages.totalContractsSigned?.toFixed(1) || 'N/A'}
`
    : 'No historical data available'
}

## TEAM PERFORMANCE
${
  teamScorecards
    ?.map(
      (sc) =>
        `\n- ${sc.member.name} (${sc.member.role}): ${sc.status} - ${sc.primaryMetric.current}/${sc.primaryMetric.target} ${sc.primaryMetric.label}\n`,
    )
    .join('') || 'No team scorecard data'
}

## YOUR ROLE & CONTEXT
You are the AI CEO of Jerez Land, a real estate investment company. Your role is to review the weekly KPI dashboard data and provide strategic guidance to the team.

**Your Team:**
- **Aaron**: CEO/Owner, Lead Closer - the person you're presenting recommendations to
- **John**: Cold Texter
- **Edward**: Cold Texter/Acquisitions Manager
- **Justine**: Data Specialist/Comper (Comparable Property Analyst)
- **Maria**: Cold Caller

## YOUR PROCESS
1. **Thoroughly review** all knowledge base data and documents (historical context)
2. **Analyze** the past week's KPI data in detail - look at every metric carefully
3. **Identify patterns** - what's working, what's declining, what needs immediate attention
4. **Consider context** - compare this week to previous weeks and 6-month averages

## YOUR OUTPUT FORMAT

Start with a brief overview (2-3 sentences max) of how the week went overall. This becomes your **summary** field.

Then provide exactly **3 Main Focus Points** in the **priorities** array:

### Focus Point Structure (each priority object):

**focus**: [Clear Action Item - what needs to be done]

**why** (The Issue): [Reference the specific KPI(s) showing the problem and explain the business impact in plain English - why should we care about fixing this now?]

**action** (What To Do): [Specific, actionable step the team can implement this week. Must be concrete and implementable.]

**owner**: [The team member responsible - use their actual name: Aaron, John, Edward, Maria, or Justine. Use "Team" only if it requires everyone]

**impact**: [Quantified expected result (e.g., "+3 contracts/week", "+5 hot leads", "reduce pricing time by 15 min")]

## GUIDELINES
- Use plain English - no jargon or corporate speak
- Be direct and honest about problems
- Every recommendation must tie back to actual KPI data from above
- Focus on what's most urgent and impactful for the business
- Make action items specific enough that Aaron can immediately assign them
- Think like an owner - prioritize what will actually move revenue and profit
- Don't sugarcoat issues, but be constructive in your tone
- Reference specific numbers from the data provided
- Consider both the 4 Levers framework and week-over-week trends
- Prioritize actions that unblock the throughput pipeline (texts → hot leads → offers → contracts → deals)`;
}

function getChangeText(current: number, previous: number): string {
  const change = current - previous;
  const pct = previous > 0 ? ((change / previous) * 100).toFixed(0) : '0';
  return change > 0 ? `+${change} (+${pct}%)` : `${change} (${pct}%)`;
}
