/**
 * Lead Analyzer — FUB fetch + Claude AI analysis pipeline
 *
 * Fetches leads from Follow Up Boss by stage, retrieves their interaction
 * history (notes, calls, texts), runs Claude analysis for discount likelihood
 * scoring, and stores results in the local `daily_leads` SQLite table.
 */

import type Database from 'better-sqlite3';
import { BrowserWindow } from 'electron';
import Anthropic from '@anthropic-ai/sdk';
import {
  getFubConfig,
  fetchPeopleByStages,
  fetchPersonNotes,
  fetchPersonCalls,
  fetchPersonTexts,
  type FubConfig,
  type FubPerson,
  type FubNote,
  type FubCall,
  type FubTextMessage,
} from './fub-client.js';

// ── Safe console wrappers (EPIPE when stdout not connected) ──

function safeLog(...args: any[]) {
  try { console.log(...args); } catch { /* EPIPE — stdout closed */ }
}
function safeWarn(...args: any[]) {
  try { console.warn(...args); } catch { /* EPIPE */ }
}
function safeError(...args: any[]) {
  try { console.error(...args); } catch { /* EPIPE */ }
}

// ── Constants ──

const LEAD_FUB_STAGES = ['nurture', 'hot lead', 'lead', 'purchase agreement sent'];

const ANALYSIS_SYSTEM_PROMPT = `You are an experienced land flipper and real estate investor analyzing potential leads to identify properties you can acquire at below-market prices. Focus on:

1. DISCOUNT SELLING INDICATORS: Financial distress, life changes, property issues, urgency
2. NEGOTIATION POSITIONING: Seller sophistication, emotional state, price flexibility
3. DEAL VIABILITY: Probability of accepting 60-80% of market value

Provide structured, evidence-based analysis with specific quotes from conversations.`;

// ── Types ──

interface AIAnalysisResult {
  score: number;
  summary: string;
  recommendedFollowUp: string;
  actionRequired: boolean;
  rationale: string;
  discountLikelihood: number;
  motivationFactors: Array<{
    factor: string;
    confidence: string;
    evidence: string;
  }>;
  negotiationStrategy: {
    approach: string;
    keyPoints: string[];
    priceRange: string;
    timeline: string;
  };
}

interface AnalyzeAllResult {
  success: boolean;
  analyzed: number;
  errors: number;
  total: number;
}

// ── Helpers ──

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getAnthropicClient(db: Database.Database): Anthropic {
  const setting = db.prepare(
    "SELECT value FROM settings WHERE key = 'anthropic_api_key'"
  ).get() as any;
  const apiKey = setting?.value || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY — set it in Settings.');
  return new Anthropic({ apiKey });
}

function getAccountName(db: Database.Database): string {
  const setting = db.prepare(
    "SELECT value FROM settings WHERE key = 'fub_account_name'"
  ).get() as any;
  return setting?.value || process.env.FUB_ACCOUNT_NAME || 'jerezland';
}

/**
 * Build a history string from FUB notes, calls, and texts.
 */
function buildHistoryText(
  notes: FubNote[],
  calls: FubCall[],
  texts: FubTextMessage[]
): string {
  const interactions: Array<{ type: string; body: string; created: string }> = [];

  for (const n of notes) {
    interactions.push({ type: 'NOTE', body: n.body || '', created: n.created || '' });
  }
  for (const c of calls) {
    interactions.push({ type: 'CALL', body: c.note || 'No notes', created: c.created || '' });
  }
  for (const t of texts) {
    interactions.push({ type: 'TEXT', body: t.message || '', created: t.created || '' });
  }

  interactions.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  return interactions.map(i => `[${i.created}] ${i.type}: ${i.body}`).join('\n');
}

/**
 * Build the analysis prompt for a single lead.
 */
function buildAnalysisPrompt(
  person: FubPerson,
  historyText: string,
  accountName: string
): string {
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Unknown';
  const phone = person.phones?.[0]?.value || 'N/A';
  const email = person.emails?.[0]?.value || 'N/A';

  return `
Analyze this real estate seller lead for potential discount purchase opportunity.

LEAD PROFILE:
- Name: ${name}
- Current Stage: ${person.stage || 'Unknown'}
- Source: ${(person as any).source || 'Unknown'}
- Contact: ${phone} | ${email}

CONVERSATION HISTORY (Most Recent First):
${historyText || 'No conversation history available'}

YOUR TASK:
As a land flipper/real estate investor, identify signals indicating willingness to sell at a discount (60-90% of market value). Analyze:
1. Motivation factors (financial distress, divorce, inheritance, relocation, property condition, urgency)
2. Negotiation positioning (sophistication, emotional state, price flexibility)
3. Deal viability (probability of accepting below-market offer)

Provide specific evidence from conversations.

OUTPUT FORMAT (JSON ONLY):
{
    "score": 1-10,
    "summary": "Brief overview of lead status",
    "recommendedFollowUp": "Specific text message to send",
    "actionRequired": true/false,
    "rationale": "Detailed reasoning for assessment",
    "discountLikelihood": 1-10,
    "motivationFactors": [
        {
            "factor": "financial_distress|divorce|inheritance|relocation|property_condition|urgency|other",
            "confidence": "high|medium|low",
            "evidence": "Specific quote from conversation"
        }
    ],
    "negotiationStrategy": {
        "approach": "empathetic|business-like|solution-focused|opportunistic",
        "keyPoints": ["Key point 1", "Key point 2"],
        "priceRange": "60-70%|70-80%|80-90%|market_value",
        "timeline": "immediate|1-2_weeks|1_month|flexible"
    }
}
`;
}

/**
 * Call Claude with retry on rate-limit.
 */
async function callClaudeWithRetry(
  anthropic: Anthropic,
  prompt: string,
  maxRetries = 5
): Promise<AIAnalysisResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        temperature: 0.3,
        system: ANALYSIS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      // Parse JSON — handle potential markdown code fences
      let text = textBlock.text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) text = jsonMatch[0];

      return JSON.parse(text) as AIAnalysisResult;
    } catch (error: any) {
      if ((error.status === 429 || error.message?.includes('rate_limit')) && attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt + 1) * 5000;
        safeWarn(`[LeadAnalyzer] Rate limited — retrying in ${waitMs / 1000}s (${attempt + 1}/${maxRetries})`);
        await delay(waitMs);
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries exceeded for Claude API');
}

/**
 * Upsert a lead analysis result into the daily_leads table.
 */
function upsertLead(
  db: Database.Database,
  fubId: number,
  person: FubPerson,
  analysis: AIAnalysisResult,
  accountName: string
): void {
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Unknown';
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO daily_leads (
      fub_id, name, stage, source, score, summary, rationale,
      recommended_follow_up, action_required, is_completed,
      last_analyzed_at, last_communication, fub_link,
      phone, email, discount_likelihood,
      motivation_factors, negotiation_strategy, updated_at
    ) VALUES (
      @fub_id, @name, @stage, @source, @score, @summary, @rationale,
      @recommended_follow_up, @action_required, 0,
      @last_analyzed_at, @last_communication, @fub_link,
      @phone, @email, @discount_likelihood,
      @motivation_factors, @negotiation_strategy, @updated_at
    )
    ON CONFLICT(fub_id) DO UPDATE SET
      name = @name,
      stage = @stage,
      source = @source,
      score = @score,
      summary = @summary,
      rationale = @rationale,
      recommended_follow_up = @recommended_follow_up,
      action_required = @action_required,
      last_analyzed_at = @last_analyzed_at,
      last_communication = @last_communication,
      fub_link = @fub_link,
      phone = @phone,
      email = @email,
      discount_likelihood = @discount_likelihood,
      motivation_factors = @motivation_factors,
      negotiation_strategy = @negotiation_strategy,
      updated_at = @updated_at
  `).run({
    fub_id: fubId,
    name,
    stage: person.stage || null,
    source: (person as any).source || null,
    score: analysis.score || 0,
    summary: analysis.summary || '',
    rationale: analysis.rationale || '',
    recommended_follow_up: analysis.recommendedFollowUp || '',
    action_required: analysis.actionRequired ? 1 : 0,
    last_analyzed_at: now,
    last_communication: (person as any).lastCommunication || (person as any).updated || null,
    fub_link: `https://${accountName}.followupboss.com/2/people/view/${fubId}`,
    phone: person.phones?.[0]?.value || null,
    email: person.emails?.[0]?.value || null,
    discount_likelihood: analysis.discountLikelihood || null,
    motivation_factors: analysis.motivationFactors ? JSON.stringify(analysis.motivationFactors) : null,
    negotiation_strategy: analysis.negotiationStrategy ? JSON.stringify(analysis.negotiationStrategy) : null,
    updated_at: now,
  });
}

// ── Public API ──

/**
 * Analyze all leads from FUB matching LEAD_FUB_STAGES.
 * Fetches people, retrieves history, runs Claude, upserts to daily_leads.
 */
function notifyRenderer(channel: string, data: any): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

export async function analyzeAllLeads(
  db: Database.Database,
): Promise<AnalyzeAllResult> {
  const config = getFubConfig(db);
  if (!config) throw new Error('FUB API not configured — set API key in Settings.');

  const anthropic = getAnthropicClient(db);
  const accountName = getAccountName(db);

  safeLog('[LeadAnalyzer] Fetching leads from FUB...');
  const people = await fetchPeopleByStages(config, LEAD_FUB_STAGES);
  safeLog(`[LeadAnalyzer] Found ${people.length} leads to analyze.`);

  let analyzed = 0;
  let errors = 0;

  for (let i = 0; i < people.length; i++) {
    const person = people[i];
    const name = [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Unknown';

    // Send progress to renderer
    notifyRenderer('leads:analysis-progress', {
      current: i + 1,
      total: people.length,
      name,
    });

    try {
      safeLog(`[LeadAnalyzer] [${i + 1}/${people.length}] Analyzing ${name}...`);

      // Fetch history in parallel
      const [notes, calls, texts] = await Promise.all([
        fetchPersonNotes(config, person.id),
        fetchPersonCalls(config, person.id),
        fetchPersonTexts(config, person.id),
      ]);

      const historyText = buildHistoryText(notes, calls, texts);
      const prompt = buildAnalysisPrompt(person, historyText, accountName);
      const analysis = await callClaudeWithRetry(anthropic, prompt);

      upsertLead(db, person.id, person, analysis, accountName);
      analyzed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      safeError(`[LeadAnalyzer] Error analyzing ${name}:`, msg);
      errors++;
    }

    // Rate limit: 2s between requests
    if (i < people.length - 1) {
      await delay(2000);
    }
  }

  safeLog(`[LeadAnalyzer] Done. Analyzed: ${analyzed}, Errors: ${errors}, Total: ${people.length}`);
  return { success: true, analyzed, errors, total: people.length };
}

/**
 * Re-analyze a single lead by its daily_leads table id.
 */
export async function analyzeSingleLead(
  db: Database.Database,
  leadId: number
): Promise<any> {
  const row = db.prepare('SELECT * FROM daily_leads WHERE id = ?').get(leadId) as any;
  if (!row) throw new Error(`Lead not found: ${leadId}`);

  const config = getFubConfig(db);
  if (!config) throw new Error('FUB API not configured — set API key in Settings.');

  const anthropic = getAnthropicClient(db);
  const accountName = getAccountName(db);

  // Fetch fresh data from FUB
  const [notes, calls, texts] = await Promise.all([
    fetchPersonNotes(config, row.fub_id),
    fetchPersonCalls(config, row.fub_id),
    fetchPersonTexts(config, row.fub_id),
  ]);

  // We need the person object — construct from what we have + FUB data
  const { fetchPerson } = await import('./fub-client.js');
  const person = await fetchPerson(config, row.fub_id);
  if (!person) throw new Error(`FUB person not found: ${row.fub_id}`);

  const historyText = buildHistoryText(notes, calls, texts);
  const prompt = buildAnalysisPrompt(person, historyText, accountName);
  const analysis = await callClaudeWithRetry(anthropic, prompt);

  upsertLead(db, row.fub_id, person, analysis, accountName);

  // Return updated row
  const updated = db.prepare('SELECT * FROM daily_leads WHERE id = ?').get(leadId) as any;
  return {
    ...updated,
    action_required: !!updated.action_required,
    is_completed: !!updated.is_completed,
    motivation_factors: updated.motivation_factors ? JSON.parse(updated.motivation_factors) : null,
    negotiation_strategy: updated.negotiation_strategy ? JSON.parse(updated.negotiation_strategy) : null,
  };
}
