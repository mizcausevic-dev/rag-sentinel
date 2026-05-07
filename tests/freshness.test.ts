import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditFreshness } from '../src/governance/freshness';

const NOW = new Date('2026-05-07T00:00:00Z').getTime();

function daysAgo(d: number): string {
  return new Date(NOW - d * 24 * 3600 * 1000).toISOString();
}

test('auditFreshness: all-fresh sources score 100', () => {
  const sources = [
    { sourceId: 's1', collectionId: 'c', lastUpdated: daysAgo(5) },
    { sourceId: 's2', collectionId: 'c', lastUpdated: daysAgo(15) },
    { sourceId: 's3', collectionId: 'c', lastUpdated: daysAgo(28) },
  ];
  const r = auditFreshness(sources, 'c', NOW);
  assert.equal(r.freshnessScore, 100);
  assert.equal(r.buckets.fresh, 3);
  assert.equal(r.staleRatio, 0);
});

test('auditFreshness: mostly-ancient sources flag critical action', () => {
  const sources = Array.from({ length: 10 }, (_, i) => ({
    sourceId: `s${i}`,
    collectionId: 'c',
    lastUpdated: daysAgo(800),
  }));
  const r = auditFreshness(sources, 'c', NOW);
  assert.equal(r.freshnessScore, 0);
  assert.equal(r.buckets.ancient, 10);
  assert.ok(r.recommendedNextAction.toLowerCase().includes('critical'));
});

test('auditFreshness: bucket boundaries respected', () => {
  const sources = [
    { sourceId: 's1', collectionId: 'c', lastUpdated: daysAgo(15) }, // fresh
    { sourceId: 's2', collectionId: 'c', lastUpdated: daysAgo(60) }, // aging
    { sourceId: 's3', collectionId: 'c', lastUpdated: daysAgo(200) }, // stale
    { sourceId: 's4', collectionId: 'c', lastUpdated: daysAgo(500) }, // ancient
  ];
  const r = auditFreshness(sources, 'c', NOW);
  assert.equal(r.buckets.fresh, 1);
  assert.equal(r.buckets.aging, 1);
  assert.equal(r.buckets.stale, 1);
  assert.equal(r.buckets.ancient, 1);
});

test('auditFreshness: empty sources returns safe defaults', () => {
  const r = auditFreshness([], 'c', NOW);
  assert.equal(r.totalSources, 0);
  assert.equal(r.freshnessScore, 100);
});

test('auditFreshness: oldestDays reflects worst source', () => {
  const sources = [
    { sourceId: 's1', collectionId: 'c', lastUpdated: daysAgo(5) },
    { sourceId: 's2', collectionId: 'c', lastUpdated: daysAgo(900) },
  ];
  const r = auditFreshness(sources, 'c', NOW);
  assert.ok(r.oldestDays >= 899);
});
