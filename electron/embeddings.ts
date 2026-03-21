/**
 * Voyage AI Embedding Generation + Cosine Similarity Search
 *
 * Uses Voyage AI `voyage-3-lite` (512 dimensions) for semantic search.
 * Falls back to keyword search if no Voyage API key is configured.
 */

import Database from 'better-sqlite3';

let VoyageAIClient: any = null;

async function getVoyageClient(apiKey: string) {
  if (!VoyageAIClient) {
    const voyageModule = await import('voyageai');
    VoyageAIClient = voyageModule.VoyageAIClient;
  }
  return new VoyageAIClient({ apiKey });
}

/**
 * Generate embeddings for an array of text chunks via Voyage AI.
 * Returns array of float arrays (one per chunk), or null on failure.
 */
export async function generateEmbeddings(
  texts: string[],
  apiKey: string,
): Promise<number[][] | null> {
  if (!apiKey || texts.length === 0) return null;

  try {
    const client = await getVoyageClient(apiKey);
    const result = await client.embed({
      input: texts,
      model: 'voyage-3-lite',
      inputType: 'document',
    });

    if (result?.data && Array.isArray(result.data)) {
      return result.data.map((item: any) => item.embedding);
    }
    return null;
  } catch (e) {
    console.error('[Embeddings] Voyage AI error:', e);
    return null;
  }
}

/**
 * Generate embedding for a single query string.
 */
export async function generateQueryEmbedding(
  query: string,
  apiKey: string,
): Promise<number[] | null> {
  if (!apiKey) return null;

  try {
    const client = await getVoyageClient(apiKey);
    const result = await client.embed({
      input: [query],
      model: 'voyage-3-lite',
      inputType: 'query',
    });

    if (result?.data?.[0]?.embedding) {
      return result.data[0].embedding;
    }
    return null;
  } catch (e) {
    console.error('[Embeddings] Query embedding error:', e);
    return null;
  }
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Semantic search: find top N chunks most similar to the query.
 * Falls back to null if no embeddings exist.
 */
export async function semanticSearch(
  db: Database.Database,
  dealId: string,
  query: string,
  apiKey: string,
  topN: number = 5,
): Promise<Array<{ content: string; chunk_index: number; file_name: string | null; similarity: number }> | null> {
  // Get query embedding
  const queryEmbedding = await generateQueryEmbedding(query, apiKey);
  if (!queryEmbedding) return null;

  // Load all chunks with embeddings for this deal
  const chunks = db.prepare(`
    SELECT k.content, k.chunk_index, k.embedding, k.file_id, f.file_name
    FROM kb_chunks k
    LEFT JOIN files f ON k.file_id = f.id
    WHERE k.deal_id = ? AND k.embedding IS NOT NULL
  `).all(dealId) as any[];

  if (chunks.length === 0) return null;

  // Compute similarities
  const scored = chunks.map(chunk => {
    let embedding: number[];
    try {
      embedding = JSON.parse(chunk.embedding);
    } catch {
      return null;
    }
    if (!Array.isArray(embedding) || embedding.length === 0) return null;

    return {
      content: chunk.content,
      chunk_index: chunk.chunk_index,
      file_name: chunk.file_name,
      similarity: cosineSimilarity(queryEmbedding, embedding),
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  // Sort by similarity descending, return top N
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topN);
}

/**
 * Embed chunks for a deal after PDF analysis.
 * Batches up to 20 at a time (Voyage AI supports batching).
 */
export async function embedChunksForDeal(
  db: Database.Database,
  dealId: string,
  apiKey: string,
): Promise<{ embedded: number; errors: number }> {
  if (!apiKey) return { embedded: 0, errors: 0 };

  const chunks = db.prepare(
    'SELECT id, content FROM kb_chunks WHERE deal_id = ? AND embedding IS NULL'
  ).all(dealId) as Array<{ id: string; content: string }>;

  if (chunks.length === 0) return { embedded: 0, errors: 0 };

  let embedded = 0;
  let errors = 0;
  const batchSize = 20;

  const updateStmt = db.prepare('UPDATE kb_chunks SET embedding = ? WHERE id = ?');

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map(c => c.content);

    const embeddings = await generateEmbeddings(texts, apiKey);
    if (!embeddings) {
      errors += batch.length;
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      if (embeddings[j]) {
        updateStmt.run(JSON.stringify(embeddings[j]), batch[j].id);
        embedded++;
      } else {
        errors++;
      }
    }
  }

  console.log(`[Embeddings] Deal ${dealId}: embedded ${embedded} chunks, ${errors} errors`);
  return { embedded, errors };
}

/**
 * Backfill embeddings for ALL chunks that have no embedding.
 * Reports progress via callback.
 */
export async function backfillAllEmbeddings(
  db: Database.Database,
  apiKey: string,
  onProgress?: (data: { current: number; total: number }) => void,
): Promise<{ embedded: number; errors: number; total: number }> {
  if (!apiKey) return { embedded: 0, errors: 0, total: 0 };

  const chunks = db.prepare(
    'SELECT id, content FROM kb_chunks WHERE embedding IS NULL'
  ).all() as Array<{ id: string; content: string }>;

  const total = chunks.length;
  if (total === 0) return { embedded: 0, errors: 0, total: 0 };

  let embedded = 0;
  let errors = 0;
  const batchSize = 20;

  const updateStmt = db.prepare('UPDATE kb_chunks SET embedding = ? WHERE id = ?');

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map(c => c.content);

    const embeddings = await generateEmbeddings(texts, apiKey);
    if (!embeddings) {
      errors += batch.length;
    } else {
      for (let j = 0; j < batch.length; j++) {
        if (embeddings[j]) {
          updateStmt.run(JSON.stringify(embeddings[j]), batch[j].id);
          embedded++;
        } else {
          errors++;
        }
      }
    }

    onProgress?.({ current: Math.min(i + batchSize, total), total });
  }

  console.log(`[Embeddings] Backfill complete: ${embedded}/${total} embedded, ${errors} errors`);
  return { embedded, errors, total };
}
