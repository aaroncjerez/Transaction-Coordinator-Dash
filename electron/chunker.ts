/**
 * Paragraph-Aware Text Chunker
 *
 * Splits text into chunks of ~800-1200 tokens with ~100 token overlap.
 * Preserves paragraph boundaries and section headers.
 * Estimates token count as ~4 chars per token (conservative for English).
 */

const CHARS_PER_TOKEN = 4;
const TARGET_CHUNK_SIZE = 1000; // tokens
const MIN_CHUNK_SIZE = 600; // tokens
const MAX_CHUNK_SIZE = 1400; // tokens
const OVERLAP_SIZE = 100; // tokens

interface Chunk {
  content: string;
  index: number;
  tokenCount: number;
}

/**
 * Estimate token count from character count.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Split text into paragraphs, preserving section headers.
 */
function splitIntoParagraphs(text: string): string[] {
  // Split on double newlines (paragraph breaks)
  const rawParagraphs = text.split(/\n\s*\n/);

  // Filter out empty paragraphs and trim
  return rawParagraphs
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Detect if a line is a section header.
 */
function isSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  // All caps, short lines, numbered sections, lines ending with ':'
  return (
    (trimmed === trimmed.toUpperCase() && trimmed.length < 100 && trimmed.length > 2) ||
    /^\d+[\.\)]\s+/.test(trimmed) ||
    /^(SECTION|ARTICLE|PART|CHAPTER)\s+/i.test(trimmed) ||
    (trimmed.endsWith(':') && trimmed.length < 80)
  );
}

/**
 * Find the last section header that appeared before a given paragraph index.
 */
function findLastHeader(paragraphs: string[], beforeIndex: number): string | null {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    const lines = paragraphs[i].split('\n');
    if (lines.length === 1 && isSectionHeader(lines[0])) {
      return lines[0].trim();
    }
    // Check first line of paragraph
    if (isSectionHeader(lines[0])) {
      return lines[0].trim();
    }
  }
  return null;
}

/**
 * Paragraph-aware text chunking.
 *
 * @param text - The full text to chunk
 * @returns Array of chunks with content, index, and token count
 */
export function chunkTextParagraphAware(text: string): Chunk[] {
  const paragraphs = splitIntoParagraphs(text);
  const chunks: Chunk[] = [];

  let currentChunkParagraphs: string[] = [];
  let currentTokenCount = 0;
  let chunkIndex = 0;
  let lastHeader: string | null = null;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const paraTokens = estimateTokens(para);

    // Track section headers
    if (para.split('\n').length === 1 && isSectionHeader(para)) {
      lastHeader = para;
    }

    // If a single paragraph exceeds max chunk size, split it by sentences
    if (paraTokens > MAX_CHUNK_SIZE) {
      // Flush current chunk first
      if (currentChunkParagraphs.length > 0) {
        const content = currentChunkParagraphs.join('\n\n');
        chunks.push({ content, index: chunkIndex++, tokenCount: estimateTokens(content) });
        currentChunkParagraphs = [];
        currentTokenCount = 0;
      }

      // Split long paragraph by sentences
      const sentences = para.split(/(?<=[.!?])\s+/);
      let sentenceBuffer: string[] = [];
      let sentenceTokens = 0;

      for (const sentence of sentences) {
        const sTokens = estimateTokens(sentence);
        if (sentenceTokens + sTokens > TARGET_CHUNK_SIZE && sentenceBuffer.length > 0) {
          let content = sentenceBuffer.join(' ');
          if (lastHeader) content = `[${lastHeader}]\n\n${content}`;
          chunks.push({ content, index: chunkIndex++, tokenCount: estimateTokens(content) });
          sentenceBuffer = [];
          sentenceTokens = 0;
        }
        sentenceBuffer.push(sentence);
        sentenceTokens += sTokens;
      }

      if (sentenceBuffer.length > 0) {
        let content = sentenceBuffer.join(' ');
        if (lastHeader) content = `[${lastHeader}]\n\n${content}`;
        chunks.push({ content, index: chunkIndex++, tokenCount: estimateTokens(content) });
      }

      continue;
    }

    // Would adding this paragraph exceed the target?
    if (currentTokenCount + paraTokens > TARGET_CHUNK_SIZE && currentChunkParagraphs.length > 0) {
      // Flush current chunk
      let content = currentChunkParagraphs.join('\n\n');
      chunks.push({ content, index: chunkIndex++, tokenCount: estimateTokens(content) });

      // Start new chunk with overlap (carry last paragraph forward)
      const lastPara = currentChunkParagraphs[currentChunkParagraphs.length - 1];
      const overlapTokens = estimateTokens(lastPara);

      currentChunkParagraphs = [];
      currentTokenCount = 0;

      // Add section header context if available
      if (lastHeader && !para.includes(lastHeader)) {
        // Don't add header as a paragraph, just prepend to the context
      }

      // Add overlap if it's not too large
      if (overlapTokens <= OVERLAP_SIZE * 2) {
        currentChunkParagraphs.push(lastPara);
        currentTokenCount += overlapTokens;
      }
    }

    currentChunkParagraphs.push(para);
    currentTokenCount += paraTokens;
  }

  // Flush remaining
  if (currentChunkParagraphs.length > 0) {
    const content = currentChunkParagraphs.join('\n\n');
    chunks.push({ content, index: chunkIndex++, tokenCount: estimateTokens(content) });
  }

  // Merge very small trailing chunks
  if (chunks.length > 1) {
    const lastChunk = chunks[chunks.length - 1];
    if (lastChunk.tokenCount < MIN_CHUNK_SIZE) {
      const prevChunk = chunks[chunks.length - 2];
      prevChunk.content += '\n\n' + lastChunk.content;
      prevChunk.tokenCount = estimateTokens(prevChunk.content);
      chunks.pop();
    }
  }

  return chunks;
}

/**
 * Simple fallback chunker (character-based with overlap).
 * Used when paragraph-aware chunking isn't suitable.
 */
export function chunkTextSimple(text: string, chunkSize = 2000, overlap = 200): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end).trim());
    start += chunkSize - overlap;
  }
  return chunks.filter(c => c.length > 0);
}
