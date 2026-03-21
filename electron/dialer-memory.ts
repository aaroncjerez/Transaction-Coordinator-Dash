/**
 * Dialer Memory — Local RAG pipeline for conversation memory
 *
 * Chunks call transcripts, embeds them via Voyage AI, stores in SQLite,
 * and builds per-lead conversation memory profiles using Claude.
 *
 * Reuses existing embeddings.ts (Voyage AI) and chunker.ts.
 */

import type Database from 'better-sqlite3';
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import {
  generateEmbeddings,
  generateQueryEmbedding,
  cosineSimilarity,
} from './embeddings.js';
import { chunkTextParagraphAware } from './chunker.js';

// ── Helpers ──

function getSetting(db: Database.Database, key: string, envFallback?: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
  return (row?.value?.trim() || (envFallback ? process.env[envFallback] : '') || '').trim();
}

// ══════════════════════════════════════════════════════
// TRANSCRIPT CHUNKING + EMBEDDING
// ══════════════════════════════════════════════════════

/**
 * Chunk and embed a single call's transcript.
 * Inserts chunks into dialer_transcript_chunks with embeddings.
 */
export async function chunkAndEmbedTranscript(
  db: Database.Database,
  callId: string,
  voyageApiKey?: string,
): Promise<{ chunked: number; embedded: number; errors: number }> {
  const apiKey = voyageApiKey || getSetting(db, 'voyage_api_key', 'VOYAGE_API_KEY');

  // Fetch call transcript
  const call = db.prepare(
    'SELECT id, transcript, phone_normalized, seller_phone_normalized, lead_id FROM dialer_call_records WHERE id = ?'
  ).get(callId) as any;

  if (!call?.transcript) {
    return { chunked: 0, embedded: 0, errors: 0 };
  }

  // Check if already chunked
  const existingCount = (db.prepare(
    'SELECT COUNT(*) as cnt FROM dialer_transcript_chunks WHERE call_id = ?'
  ).get(callId) as any)?.cnt || 0;

  if (existingCount > 0) {
    return { chunked: existingCount, embedded: existingCount, errors: 0 };
  }

  const phoneNormalized = call.seller_phone_normalized || call.phone_normalized || '';
  const leadId = call.lead_id || null;

  // Chunk the transcript
  const chunks = chunkTextParagraphAware(call.transcript);
  if (chunks.length === 0) {
    return { chunked: 0, embedded: 0, errors: 0 };
  }

  // Generate embeddings (batch, up to 20 at a time)
  let embeddings: number[][] | null = null;
  if (apiKey) {
    const texts = chunks.map(c => c.content);
    embeddings = await generateEmbeddings(texts, apiKey);
  }

  // Insert chunks into SQLite
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO dialer_transcript_chunks
      (id, call_id, phone_normalized, lead_id, content, chunk_index, token_count, embedding)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let embedded = 0;
  const tx = db.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = crypto.randomUUID();
      const embedding = embeddings?.[i] ? JSON.stringify(embeddings[i]) : null;
      if (embedding) embedded++;

      insertStmt.run(
        chunkId,
        callId,
        phoneNormalized,
        leadId,
        chunks[i].content,
        chunks[i].index,
        chunks[i].tokenCount,
        embedding,
      );
    }
  });
  tx();

  console.log(`[DialerMemory] Chunked call ${callId}: ${chunks.length} chunks, ${embedded} embedded`);
  return { chunked: chunks.length, embedded, errors: chunks.length - embedded };
}

/**
 * Backfill transcript embeddings for all calls that have transcripts
 * but no corresponding chunks in dialer_transcript_chunks.
 */
export async function backfillTranscriptEmbeddings(
  db: Database.Database,
  voyageApiKey?: string,
  onProgress?: (data: { current: number; total: number; embedded: number }) => void,
): Promise<{ total: number; chunked: number; embedded: number; errors: number }> {
  const apiKey = voyageApiKey || getSetting(db, 'voyage_api_key', 'VOYAGE_API_KEY');
  if (!apiKey) {
    console.log('[DialerMemory] No Voyage API key, skipping backfill');
    return { total: 0, chunked: 0, embedded: 0, errors: 0 };
  }

  // Find calls with transcripts that have no chunks
  const calls = db.prepare(`
    SELECT cr.id FROM dialer_call_records cr
    WHERE cr.transcript IS NOT NULL AND cr.transcript != ''
      AND cr.id NOT IN (SELECT DISTINCT call_id FROM dialer_transcript_chunks)
    ORDER BY cr.call_started_at DESC
  `).all() as any[];

  const total = calls.length;
  if (total === 0) return { total: 0, chunked: 0, embedded: 0, errors: 0 };

  console.log(`[DialerMemory] Backfilling ${total} call transcripts...`);

  let totalChunked = 0;
  let totalEmbedded = 0;
  let totalErrors = 0;

  for (let i = 0; i < calls.length; i++) {
    try {
      const result = await chunkAndEmbedTranscript(db, calls[i].id, apiKey);
      totalChunked += result.chunked;
      totalEmbedded += result.embedded;
      totalErrors += result.errors;
    } catch (err) {
      totalErrors++;
      console.error(`[DialerMemory] Backfill error for call ${calls[i].id}:`, err instanceof Error ? err.message : err);
    }

    onProgress?.({ current: i + 1, total, embedded: totalEmbedded });
  }

  console.log(`[DialerMemory] Backfill complete: ${totalChunked} chunks, ${totalEmbedded} embedded, ${totalErrors} errors`);
  return { total, chunked: totalChunked, embedded: totalEmbedded, errors: totalErrors };
}

// ══════════════════════════════════════════════════════
// SEMANTIC SEARCH ACROSS TRANSCRIPTS
// ══════════════════════════════════════════════════════

/**
 * Search all transcript chunks by semantic similarity.
 * Optionally filter by phone_normalized for lead-specific search.
 */
export async function searchTranscripts(
  db: Database.Database,
  query: string,
  voyageApiKey?: string,
  options?: {
    phoneNormalized?: string;
    topN?: number;
  },
): Promise<Array<{
  content: string;
  call_id: string;
  phone_normalized: string;
  chunk_index: number;
  similarity: number;
  call_started_at?: string;
  lead_name?: string;
}>> {
  const apiKey = voyageApiKey || getSetting(db, 'voyage_api_key', 'VOYAGE_API_KEY');
  const topN = options?.topN || 10;

  // Get query embedding
  const queryEmbedding = apiKey ? await generateQueryEmbedding(query, apiKey) : null;

  // Load chunks (optionally filtered by phone)
  let sql = `
    SELECT tc.content, tc.call_id, tc.phone_normalized, tc.chunk_index, tc.embedding,
           cr.call_started_at, cr.lead_first_name, cr.lead_last_name
    FROM dialer_transcript_chunks tc
    LEFT JOIN dialer_call_records cr ON tc.call_id = cr.id
  `;
  const params: any[] = [];

  if (options?.phoneNormalized) {
    sql += ' WHERE tc.phone_normalized = ?';
    params.push(options.phoneNormalized);
  }

  const chunks = db.prepare(sql).all(...params) as any[];

  if (chunks.length === 0) return [];

  // If we have embeddings, do semantic search
  if (queryEmbedding) {
    const scored = chunks.map(chunk => {
      if (!chunk.embedding) return null;
      let embedding: number[];
      try {
        embedding = JSON.parse(chunk.embedding);
      } catch {
        return null;
      }
      if (!Array.isArray(embedding) || embedding.length === 0) return null;

      return {
        content: chunk.content,
        call_id: chunk.call_id,
        phone_normalized: chunk.phone_normalized,
        chunk_index: chunk.chunk_index,
        similarity: cosineSimilarity(queryEmbedding, embedding),
        call_started_at: chunk.call_started_at,
        lead_name: [chunk.lead_first_name, chunk.lead_last_name].filter(Boolean).join(' ') || undefined,
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topN);
  }

  // Fallback: keyword search
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const keywordResults = chunks
    .filter(chunk => {
      const lower = chunk.content.toLowerCase();
      return queryWords.some(w => lower.includes(w));
    })
    .map(chunk => ({
      content: chunk.content,
      call_id: chunk.call_id,
      phone_normalized: chunk.phone_normalized,
      chunk_index: chunk.chunk_index,
      similarity: 0.5, // keyword match placeholder score
      call_started_at: chunk.call_started_at,
      lead_name: [chunk.lead_first_name, chunk.lead_last_name].filter(Boolean).join(' ') || undefined,
    }))
    .slice(0, topN);

  return keywordResults;
}

// ══════════════════════════════════════════════════════
// CONVERSATION MEMORY — Per-lead profiles via Claude
// ══════════════════════════════════════════════════════

const MEMORY_SYSTEM_PROMPT = `You are a conversation memory manager for a real estate land acquisition company. You summarize call transcripts into a persistent lead profile that our AI calling agent can reference before the next call.

Your output must be JSON with these fields:
{
  "summary": "2-3 paragraph narrative of all interactions with this seller, most recent first",
  "key_facts": ["fact1", "fact2", ...],
  "seller_sentiment": "positive|neutral|negative|hostile"
}

Key facts should include:
- Property details mentioned (acreage, location, value expectations)
- Seller's situation (motivation to sell, timeline, concerns)
- Price discussions (asking price, our offers, counter-offers)
- Personal details mentioned (family, health, travel plans)
- Objections raised and how they were addressed
- Any commitments made (callbacks, sending documents, etc.)
- DNC signals or complaints

Be concise but comprehensive. The AI agent will use this to personalize the next call.`;

/**
 * Update or create conversation memory for a lead.
 * Aggregates all call transcripts + existing memory into an updated profile.
 */
export async function updateLeadMemory(
  db: Database.Database,
  phoneNormalized: string,
  anthropicApiKey?: string,
): Promise<{ updated: boolean; error?: string }> {
  const apiKey = anthropicApiKey || getSetting(db, 'anthropic_api_key', 'ANTHROPIC_API_KEY');
  if (!apiKey) {
    return { updated: false, error: 'No Anthropic API key configured' };
  }

  // Fetch all calls for this lead (most recent first)
  const calls = db.prepare(`
    SELECT id, call_direction, call_started_at, duration_seconds, transcript, summary, sentiment, custom_analysis
    FROM dialer_call_records
    WHERE (seller_phone_normalized = ? OR phone_normalized = ?)
      AND transcript IS NOT NULL AND transcript != ''
    ORDER BY call_started_at DESC
    LIMIT 20
  `).all(phoneNormalized, phoneNormalized) as any[];

  if (calls.length === 0) {
    return { updated: false, error: 'No calls with transcripts found' };
  }

  // Fetch existing memory
  const existingMemory = db.prepare(
    'SELECT summary, key_facts FROM dialer_conversation_memory WHERE phone_normalized = ?'
  ).get(phoneNormalized) as any;

  // Fetch lead context
  const lead = db.prepare(
    'SELECT first_name, last_name, county, state, parcel_acres, market_value FROM dialer_leads_cache WHERE phone_normalized = ? LIMIT 1'
  ).get(phoneNormalized) as any;

  // Build prompt
  const callSummaries = calls.map((c, i) => {
    let analysis = '';
    if (c.custom_analysis) {
      try {
        const parsed = typeof c.custom_analysis === 'string' ? JSON.parse(c.custom_analysis) : c.custom_analysis;
        analysis = parsed.key_insights ? `\nInsights: ${parsed.key_insights.join(', ')}` : '';
      } catch { /* ignore */ }
    }

    return `--- Call ${i + 1} (${c.call_direction}, ${c.call_started_at}, ${c.duration_seconds}s, sentiment: ${c.sentiment || 'unknown'}) ---
${c.transcript}
${c.summary ? `Summary: ${c.summary}` : ''}${analysis}`;
  }).join('\n\n');

  const prompt = `
${lead ? `LEAD: ${lead.first_name || ''} ${lead.last_name || ''} — ${lead.county || ''}, ${lead.state || ''} — ${lead.parcel_acres || '?'} acres — Market value: $${lead.market_value || '?'}` : ''}

${existingMemory?.summary ? `EXISTING MEMORY:\n${existingMemory.summary}\n\nExisting facts: ${existingMemory.key_facts || '[]'}` : 'No existing memory — this is the first profile build.'}

CALL TRANSCRIPTS (${calls.length} calls, most recent first):
${callSummaries}

Generate an updated conversation memory profile. Include ALL information from existing memory plus any new details from the transcripts.`;

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      temperature: 0.2,
      system: MEMORY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return { updated: false, error: 'No text in Claude response' };
    }

    let text = textBlock.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) text = jsonMatch[0];

    const memory = JSON.parse(text) as {
      summary: string;
      key_facts: string[];
      seller_sentiment: string;
    };

    // Upsert into dialer_conversation_memory
    const leadId = lead ? db.prepare(
      'SELECT id FROM dialer_leads_cache WHERE phone_normalized = ? LIMIT 1'
    ).get(phoneNormalized) as any : null;

    db.prepare(`
      INSERT INTO dialer_conversation_memory (id, phone_normalized, lead_id, summary, key_facts, seller_sentiment, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(phone_normalized) DO UPDATE SET
        summary = excluded.summary,
        key_facts = excluded.key_facts,
        seller_sentiment = excluded.seller_sentiment,
        last_updated = datetime('now')
    `).run(
      crypto.randomUUID(),
      phoneNormalized,
      leadId?.id || null,
      memory.summary,
      JSON.stringify(memory.key_facts),
      memory.seller_sentiment,
    );

    console.log(`[DialerMemory] Updated memory for ${phoneNormalized}: ${memory.key_facts.length} facts, sentiment: ${memory.seller_sentiment}`);
    return { updated: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[DialerMemory] Memory update error for ${phoneNormalized}:`, msg);
    return { updated: false, error: msg };
  }
}

/**
 * Get pre-call context for a lead — instant local read, no API calls.
 * Returns the conversation memory summary + key facts for Retell agent injection.
 */
export function getPreCallContext(
  db: Database.Database,
  phoneNormalized: string,
): {
  hasMemory: boolean;
  summary: string | null;
  keyFacts: string[];
  sentiment: string | null;
  totalCalls: number;
  lastCallDate: string | null;
} {
  const memory = db.prepare(
    'SELECT summary, key_facts, seller_sentiment FROM dialer_conversation_memory WHERE phone_normalized = ?'
  ).get(phoneNormalized) as any;

  const callStats = db.prepare(`
    SELECT COUNT(*) as total_calls, MAX(call_started_at) as last_call
    FROM dialer_call_records
    WHERE seller_phone_normalized = ? OR phone_normalized = ?
  `).get(phoneNormalized, phoneNormalized) as any;

  let keyFacts: string[] = [];
  if (memory?.key_facts) {
    try {
      keyFacts = typeof memory.key_facts === 'string' ? JSON.parse(memory.key_facts) : memory.key_facts;
    } catch { /* ignore */ }
  }

  return {
    hasMemory: !!memory,
    summary: memory?.summary || null,
    keyFacts,
    sentiment: memory?.seller_sentiment || null,
    totalCalls: callStats?.total_calls || 0,
    lastCallDate: callStats?.last_call || null,
  };
}
