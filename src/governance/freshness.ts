// Source freshness audit — stale RAG content is the silent killer of enterprise
// retrieval systems. This module tracks staleness distribution across a collection
// and produces audit-grade reporting for content owners.

export interface FreshnessSource {
  sourceId: string;
  collectionId: string;
  lastUpdated: string; // ISO timestamp
}

export type FreshnessBucket = 'fresh' | 'aging' | 'stale' | 'ancient';

export interface FreshnessResult {
  collectionId: string | null;
  totalSources: number;
  freshnessScore: number; // 0-100 weighted score
  buckets: Record<FreshnessBucket, number>;
  staleRatio: number;
  oldestDays: number;
  averageAgeDays: number;
  recommendedNextAction: string;
}

// Bucket boundaries (days since last update)
const BUCKETS: Array<{ bucket: FreshnessBucket; maxDays: number; weight: number }> = [
  { bucket: 'fresh', maxDays: 30, weight: 100 },
  { bucket: 'aging', maxDays: 90, weight: 75 },
  { bucket: 'stale', maxDays: 365, weight: 30 },
  { bucket: 'ancient', maxDays: Infinity, weight: 0 },
];

function bucketFor(days: number): { bucket: FreshnessBucket; weight: number } {
  for (const b of BUCKETS) {
    if (days <= b.maxDays) return { bucket: b.bucket, weight: b.weight };
  }
  return { bucket: 'ancient', weight: 0 };
}

export function auditFreshness(
  sources: FreshnessSource[],
  collectionId: string | null = null,
  referenceTime: number = Date.now()
): FreshnessResult {
  if (sources.length === 0) {
    return {
      collectionId,
      totalSources: 0,
      freshnessScore: 100,
      buckets: { fresh: 0, aging: 0, stale: 0, ancient: 0 },
      staleRatio: 0,
      oldestDays: 0,
      averageAgeDays: 0,
      recommendedNextAction: 'No sources to audit.',
    };
  }

  const buckets: Record<FreshnessBucket, number> = { fresh: 0, aging: 0, stale: 0, ancient: 0 };
  let weightedSum = 0;
  let totalAgeDays = 0;
  let oldestDays = 0;

  for (const src of sources) {
    const updated = new Date(src.lastUpdated).getTime();
    const ageDays = Math.max(0, Math.floor((referenceTime - updated) / (24 * 3600 * 1000)));
    totalAgeDays += ageDays;
    if (ageDays > oldestDays) oldestDays = ageDays;
    const { bucket, weight } = bucketFor(ageDays);
    buckets[bucket]++;
    weightedSum += weight;
  }

  const freshnessScore = Math.round(weightedSum / sources.length);
  const staleRatio = (buckets.stale + buckets.ancient) / sources.length;
  const averageAgeDays = Math.round(totalAgeDays / sources.length);

  let recommendedNextAction: string;
  if (freshnessScore >= 85) {
    recommendedNextAction = 'Freshness posture acceptable; continue scheduled refresh cadence.';
  } else if (freshnessScore >= 65) {
    recommendedNextAction = `Schedule reindex of aging content; ${buckets.aging + buckets.stale} sources need attention.`;
  } else if (freshnessScore >= 40) {
    recommendedNextAction = `Material staleness detected (staleRatio=${(staleRatio * 100).toFixed(0)}%); engage content owners for refresh sprint.`;
  } else {
    recommendedNextAction = `Critical staleness; collection should be flagged unsafe for production retrieval until refreshed.`;
  }

  return {
    collectionId,
    totalSources: sources.length,
    freshnessScore,
    buckets,
    staleRatio,
    oldestDays,
    averageAgeDays,
    recommendedNextAction,
  };
}
