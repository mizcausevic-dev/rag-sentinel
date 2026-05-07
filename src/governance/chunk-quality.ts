// Chunk quality scoring for RAG indexing pipelines.
// Bad chunks lead to bad retrievals — this module scores chunks at index time
// to surface chunking-strategy problems before they hit production retrieval.

export interface Chunk {
  chunkId: string;
  collectionId: string;
  text: string;
  tokenCount: number;
  metadata: Record<string, unknown>;
  sourceUri: string;
  sourceLastUpdated: string;
}

export interface ChunkQualityResult {
  chunkId: string;
  score: number;
  issues: string[];
  passedChecks: string[];
}

const REQUIRED_METADATA = ['source', 'title', 'last_updated'];
const MIN_TOKENS = 100;
const MAX_TOKENS = 2000;
const IDEAL_MIN = 200;
const IDEAL_MAX = 1000;

export function scoreChunkQuality(chunk: Chunk): ChunkQualityResult {
  const issues: string[] = [];
  const passedChecks: string[] = [];
  let score = 100;

  // Token count posture
  if (chunk.tokenCount < MIN_TOKENS) {
    issues.push(`Chunk under ${MIN_TOKENS} tokens (${chunk.tokenCount}) — likely lacks retrievable context.`);
    score -= 20;
  } else if (chunk.tokenCount > MAX_TOKENS) {
    issues.push(`Chunk over ${MAX_TOKENS} tokens (${chunk.tokenCount}) — exceeds typical embedding model context.`);
    score -= 15;
  } else if (chunk.tokenCount < IDEAL_MIN) {
    issues.push(`Chunk under ideal range (${chunk.tokenCount} < ${IDEAL_MIN} tokens).`);
    score -= 5;
  } else if (chunk.tokenCount > IDEAL_MAX) {
    issues.push(`Chunk over ideal range (${chunk.tokenCount} > ${IDEAL_MAX} tokens).`);
    score -= 5;
  } else {
    passedChecks.push(`Token count ${chunk.tokenCount} within ideal range.`);
  }

  // Boundary respect — check that chunk doesn't start/end mid-sentence
  const trimmed = chunk.text.trim();
  const startsAtBoundary = /^[A-Z#\-*\d]|^["`']/.test(trimmed);
  const endsAtBoundary = /[.!?:](\s|$)|^#|\n$|[)`'"]\s*$/.test(trimmed);
  if (!startsAtBoundary) {
    issues.push('Chunk starts mid-sentence; may degrade retrieval relevance.');
    score -= 10;
  }
  if (!endsAtBoundary) {
    issues.push('Chunk ends mid-sentence; may truncate critical claims.');
    score -= 10;
  }
  if (startsAtBoundary && endsAtBoundary) {
    passedChecks.push('Chunk respects sentence boundaries.');
  }

  // Metadata completeness
  const missingMeta = REQUIRED_METADATA.filter((m) => !chunk.metadata[m]);
  if (missingMeta.length > 0) {
    issues.push(`Missing required metadata: ${missingMeta.join(', ')}.`);
    score -= missingMeta.length * 8;
  } else {
    passedChecks.push('All required metadata present.');
  }

  // Whitespace/empty content
  const visibleChars = trimmed.replace(/\s+/g, '').length;
  if (visibleChars < 50) {
    issues.push('Chunk contains minimal content; likely an indexing error.');
    score -= 30;
  }

  // Boilerplate detection — chunks dominated by repeated tokens
  const words = trimmed.toLowerCase().split(/\s+/);
  if (words.length > 20) {
    const uniqueRatio = new Set(words).size / words.length;
    if (uniqueRatio < 0.4) {
      issues.push('Chunk shows low lexical diversity; may be boilerplate or repeated content.');
      score -= 10;
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { chunkId: chunk.chunkId, score, issues, passedChecks };
}

export interface BatchQualityResult {
  totalChunks: number;
  averageScore: number;
  excellentCount: number; // score >= 90
  goodCount: number;      // 70-89
  marginalCount: number;  // 50-69
  poorCount: number;      // < 50
  topIssues: { issue: string; affectedChunks: number }[];
  perChunk: ChunkQualityResult[];
}

export function scoreChunkBatch(chunks: Chunk[]): BatchQualityResult {
  const perChunk = chunks.map(scoreChunkQuality);
  const averageScore = perChunk.length === 0
    ? 0
    : Math.round(perChunk.reduce((sum, r) => sum + r.score, 0) / perChunk.length);

  const excellentCount = perChunk.filter((r) => r.score >= 90).length;
  const goodCount = perChunk.filter((r) => r.score >= 70 && r.score < 90).length;
  const marginalCount = perChunk.filter((r) => r.score >= 50 && r.score < 70).length;
  const poorCount = perChunk.filter((r) => r.score < 50).length;

  // Aggregate top issues across the batch
  const issueCount = new Map<string, number>();
  for (const result of perChunk) {
    for (const issue of result.issues) {
      // Normalize by stripping numeric specifics for grouping
      const normalized = issue.replace(/\(\d+(?:\.\d+)?(?:\s*[<>]\s*\d+)?\s*\w*\)/g, '(...)');
      issueCount.set(normalized, (issueCount.get(normalized) || 0) + 1);
    }
  }
  const topIssues = Array.from(issueCount.entries())
    .map(([issue, affectedChunks]) => ({ issue, affectedChunks }))
    .sort((a, b) => b.affectedChunks - a.affectedChunks)
    .slice(0, 5);

  return { totalChunks: chunks.length, averageScore, excellentCount, goodCount, marginalCount, poorCount, topIssues, perChunk };
}
