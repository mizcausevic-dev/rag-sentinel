// Retrieval drift detection — same query returning different results over time
// is one of the strongest signals that a RAG system is silently degrading.
// This module compares retrieval snapshots to surface drift before users notice.

export interface RetrievalResult {
  chunkId: string;
  score: number;
  rank: number;
}

export interface RetrievalSnapshot {
  query: string;
  timestamp: string;
  collectionId: string;
  embeddingModel: string;
  results: RetrievalResult[];
}

export type DriftLevel = 'minimal' | 'moderate' | 'significant' | 'severe';

export interface DriftResult {
  query: string;
  baselineTimestamp: string;
  currentTimestamp: string;
  topKOverlap: number; // 0-1
  rankCorrelation: number; // -1 to 1
  newResults: string[]; // chunk IDs in current but not baseline
  droppedResults: string[]; // chunk IDs in baseline but not current
  driftScore: number; // 0-100, higher = more stable
  driftLevel: DriftLevel;
  modelChanged: boolean;
  rationale: string;
}

const TOP_K = 10;

export function detectDrift(baseline: RetrievalSnapshot, current: RetrievalSnapshot): DriftResult {
  if (baseline.query !== current.query) {
    throw new Error('Cannot detect drift across different queries.');
  }

  const k = Math.min(baseline.results.length, current.results.length, TOP_K);
  const baselineTopK = baseline.results.slice(0, k).map((r) => r.chunkId);
  const currentTopK = current.results.slice(0, k).map((r) => r.chunkId);
  const baselineSet = new Set(baselineTopK);
  const currentSet = new Set(currentTopK);

  const overlap = baselineTopK.filter((id) => currentSet.has(id)).length;
  const topKOverlap = k === 0 ? 1 : overlap / k;

  // Rank correlation — for each chunk in both sets, how much did rank change?
  const sharedChunks = baselineTopK.filter((id) => currentSet.has(id));
  let rankCorrelation = 1;
  if (sharedChunks.length >= 2) {
    let sumSquaredDiffs = 0;
    for (const id of sharedChunks) {
      const baselineRank = baselineTopK.indexOf(id);
      const currentRank = currentTopK.indexOf(id);
      sumSquaredDiffs += Math.pow(baselineRank - currentRank, 2);
    }
    const n = sharedChunks.length;
    // Simplified Spearman: 1 - (6 * sum_d^2) / (n^3 - n)
    const denom = n * (n * n - 1);
    rankCorrelation = denom === 0 ? 1 : 1 - (6 * sumSquaredDiffs) / denom;
  } else if (sharedChunks.length === 1) {
    const id = sharedChunks[0];
    const baselineRank = baselineTopK.indexOf(id);
    const currentRank = currentTopK.indexOf(id);
    rankCorrelation = baselineRank === currentRank ? 1 : 0;
  } else {
    rankCorrelation = 0;
  }

  const newResults = currentTopK.filter((id) => !baselineSet.has(id));
  const droppedResults = baselineTopK.filter((id) => !currentSet.has(id));

  // Drift score blends overlap and rank correlation
  const driftScore = Math.round((topKOverlap * 0.6 + Math.max(0, rankCorrelation) * 0.4) * 100);

  let driftLevel: DriftLevel;
  if (driftScore >= 80) driftLevel = 'minimal';
  else if (driftScore >= 60) driftLevel = 'moderate';
  else if (driftScore >= 30) driftLevel = 'significant';
  else driftLevel = 'severe';

  const modelChanged = baseline.embeddingModel !== current.embeddingModel;

  let rationale: string;
  if (modelChanged) {
    rationale = `Embedding model changed (${baseline.embeddingModel} -> ${current.embeddingModel}); drift expected, validate before promoting.`;
  } else if (driftLevel === 'severe') {
    rationale = `Top-${k} overlap dropped to ${(topKOverlap * 100).toFixed(0)}% with same model. Investigate index corruption or content changes.`;
  } else if (driftLevel === 'significant') {
    rationale = `Top-${k} overlap ${(topKOverlap * 100).toFixed(0)}%; ${droppedResults.length} chunk(s) dropped from results.`;
  } else if (driftLevel === 'moderate') {
    rationale = `Moderate drift; rank changes within tolerance but worth monitoring.`;
  } else {
    rationale = `Retrieval is stable (overlap ${(topKOverlap * 100).toFixed(0)}%).`;
  }

  return {
    query: baseline.query,
    baselineTimestamp: baseline.timestamp,
    currentTimestamp: current.timestamp,
    topKOverlap,
    rankCorrelation: Math.round(rankCorrelation * 100) / 100,
    newResults,
    droppedResults,
    driftScore,
    driftLevel,
    modelChanged,
    rationale,
  };
}
