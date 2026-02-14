/**
 * Call Reviewer — Anthropic-powered transcript analysis
 *
 * Reviews call transcripts for:
 * - DNC violations (people who said "stop calling", "do not call", etc.)
 * - Sentiment analysis (positive/neutral/negative)
 * - Hot lead detection (interest signals, price negotiation, urgency)
 * - Call quality scoring
 *
 * Pattern: follows lead-analyzer.ts (same Anthropic SDK, retry logic, progress notifications)
 */

import type Database from 'better-sqlite3';
import { BrowserWindow } from 'electron';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseClient } from './supabase-client.js';
import {
  getUnreviewedCalls,
  updateCallReview,
  markLeadDNC,
  markLeadHot,
} from './dialer-queries.js';

// ── Constants ──

const REVIEW_SYSTEM_PROMPT = `You are an expert call review analyst for a real estate land acquisition company. You review AI-generated call transcripts between our AI agent "Sarah" and potential property sellers.

Your critical responsibilities:
1. **DNC DETECTION (HIGHEST PRIORITY)**: Identify ANY indication the person wants to stop receiving calls. This includes explicit requests ("stop calling", "don't call me", "take me off your list", "do not contact me") AND implicit signals (hostility, threats to report, repeated "not interested" statements).
2. **SENTIMENT ANALYSIS**: Assess overall seller sentiment toward our outreach.
3. **HOT LEAD DETECTION**: Identify sellers showing genuine interest — asking about pricing, timelines, process details, or expressing motivation to sell.
4. **CALL QUALITY**: Score the overall call effectiveness.

Be conservative with DNC detection — when in doubt, flag it. Missing a DNC request is far worse than a false positive.`;

// ── Types ──

interface AICallReviewResult {
  dnc_detected: boolean;
  dnc_evidence: string | null;
  sentiment: 'positive' | 'neutral' | 'negative';
  is_hot_lead: boolean;
  hot_lead_reason: string | null;
  call_quality_score: number;
  key_insights: string[];
  recommended_next_action: string;
  flags: string[];
}

interface ReviewBatchResult {
  success: boolean;
  reviewed: number;
  errors: number;
  dncDetected: number;
  hotLeadsFound: number;
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

function notifyRenderer(channel: string, data: any): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

function buildReviewPrompt(call: any): string {
  const phone = call.seller_phone_normalized || call.phone_normalized || 'Unknown';
  const status = call.call_status || 'unknown';
  const duration = call.duration_seconds ? `${call.duration_seconds}s` : 'unknown';
  const direction = call.call_direction || 'outbound';

  return `
Review this ${direction} call transcript.

CALL METADATA:
- Phone: ${phone}
- Status: ${status}
- Duration: ${duration}
- Direction: ${direction}
${call.summary ? `- Existing Summary: ${call.summary}` : ''}
${call.extracted_data ? `- Extracted Data: ${JSON.stringify(call.extracted_data)}` : ''}

TRANSCRIPT:
${call.transcript || 'No transcript available'}

ANALYSIS REQUIRED:
1. DNC Detection: Did the person say ANYTHING indicating they want to stop receiving calls?
2. Sentiment: Overall sentiment toward our outreach (positive/neutral/negative)
3. Hot Lead: Any genuine interest in selling their property?
4. Quality Score: 1-10 call effectiveness rating
5. Key Insights: Important information gathered
6. Next Action: What should we do next with this lead?

OUTPUT FORMAT (JSON ONLY):
{
  "dnc_detected": false,
  "dnc_evidence": null,
  "sentiment": "positive|neutral|negative",
  "is_hot_lead": false,
  "hot_lead_reason": null,
  "call_quality_score": 7,
  "key_insights": ["insight1", "insight2"],
  "recommended_next_action": "Specific next step",
  "flags": []
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
): Promise<AICallReviewResult> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        temperature: 0.2,
        system: REVIEW_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      let text = textBlock.text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) text = jsonMatch[0];

      return JSON.parse(text) as AICallReviewResult;
    } catch (error: any) {
      if ((error.status === 429 || error.message?.includes('rate_limit')) && attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt + 1) * 5000;
        console.warn(`[CallReviewer] Rate limited — retrying in ${waitMs / 1000}s (${attempt + 1}/${maxRetries})`);
        await delay(waitMs);
      } else {
        throw error;
      }
    }
  }
  throw new Error('Max retries exceeded for Claude API');
}

// ── Public API ──

/**
 * Review a single call transcript and update Supabase.
 */
export async function reviewCall(
  db: Database.Database,
  callId: string
): Promise<AICallReviewResult> {
  const supabase = getSupabaseClient(db);
  const anthropic = getAnthropicClient(db);

  // Fetch the call
  const { data: call, error } = await supabase
    .from('call_records')
    .select('*')
    .eq('id', callId)
    .single();

  if (error || !call) throw new Error(`Call not found: ${callId}`);
  if (!call.transcript) throw new Error(`Call ${callId} has no transcript`);

  const prompt = buildReviewPrompt(call);
  const review = await callClaudeWithRetry(anthropic, prompt);

  // Write review back to Supabase
  await updateCallReview(supabase, callId, review);

  // Handle DNC detection — auto-protect the lead
  if (review.dnc_detected) {
    const phone = call.seller_phone_normalized || call.phone_normalized;
    if (phone) {
      console.warn(`[CallReviewer] DNC DETECTED for ${phone}: ${review.dnc_evidence}`);
      try {
        await markLeadDNC(supabase, phone, `AI Review: ${review.dnc_evidence || 'DNC request detected in transcript'}`);
      } catch (err) {
        console.error(`[CallReviewer] Failed to mark DNC for ${phone}:`, err);
      }
    }
  }

  // Handle hot lead detection
  if (review.is_hot_lead) {
    const phone = call.seller_phone_normalized || call.phone_normalized;
    if (phone) {
      console.log(`[CallReviewer] HOT LEAD detected for ${phone}: ${review.hot_lead_reason}`);
      try {
        await markLeadHot(supabase, phone);
      } catch (err) {
        console.error(`[CallReviewer] Failed to mark hot lead for ${phone}:`, err);
      }
    }
  }

  return review;
}

/**
 * Review all un-reviewed calls with transcripts.
 * Called by dialer-sync.ts on a 60-second interval.
 */
export async function reviewRecentCalls(
  db: Database.Database,
  limit = 10
): Promise<ReviewBatchResult> {
  const supabase = getSupabaseClient(db);
  const anthropic = getAnthropicClient(db);

  const calls = await getUnreviewedCalls(supabase, limit);
  if (calls.length === 0) {
    return { success: true, reviewed: 0, errors: 0, dncDetected: 0, hotLeadsFound: 0 };
  }

  console.log(`[CallReviewer] Found ${calls.length} un-reviewed calls to process.`);

  let reviewed = 0;
  let errors = 0;
  let dncDetected = 0;
  let hotLeadsFound = 0;

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];

    notifyRenderer('dialer:review-progress', {
      current: i + 1,
      total: calls.length,
      callId: call.id,
    });

    try {
      if (!call.transcript) {
        console.log(`[CallReviewer] Skipping call ${call.id} — no transcript`);
        continue;
      }

      const prompt = buildReviewPrompt(call);
      const review = await callClaudeWithRetry(anthropic, prompt);

      await updateCallReview(supabase, call.id, review);
      reviewed++;

      // Handle DNC
      if (review.dnc_detected) {
        dncDetected++;
        const phone = call.seller_phone_normalized || call.phone_normalized;
        if (phone) {
          console.warn(`[CallReviewer] DNC DETECTED for ${phone}: ${review.dnc_evidence}`);
          try {
            await markLeadDNC(supabase, phone, `AI Review: ${review.dnc_evidence || 'DNC request detected'}`);
          } catch (err) {
            console.error(`[CallReviewer] Failed to mark DNC:`, err);
          }
        }
      }

      // Handle hot lead
      if (review.is_hot_lead) {
        hotLeadsFound++;
        const phone = call.seller_phone_normalized || call.phone_normalized;
        if (phone) {
          console.log(`[CallReviewer] HOT LEAD: ${phone} — ${review.hot_lead_reason}`);
          try {
            await markLeadHot(supabase, phone);
          } catch (err) {
            console.error(`[CallReviewer] Failed to mark hot lead:`, err);
          }
        }
      }

      console.log(`[CallReviewer] [${i + 1}/${calls.length}] Reviewed call ${call.id} — sentiment: ${review.sentiment}, DNC: ${review.dnc_detected}, hot: ${review.is_hot_lead}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[CallReviewer] Error reviewing call ${call.id}:`, msg);
      errors++;
    }

    // Rate limit: 2s between requests
    if (i < calls.length - 1) {
      await delay(2000);
    }
  }

  console.log(`[CallReviewer] Batch done. Reviewed: ${reviewed}, Errors: ${errors}, DNC: ${dncDetected}, Hot: ${hotLeadsFound}`);
  return { success: true, reviewed, errors, dncDetected, hotLeadsFound };
}
