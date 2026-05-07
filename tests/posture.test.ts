import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCollection, buildFleetPosture } from '../src/governance/posture';
import { collections } from '../src/data/collections';

test('evaluateCollection: secops runbooks production-ready', () => {
  const c = collections.find((c) => c.collectionId === 'col_security_runbooks')!;
  const r = evaluateCollection(c);
  assert.equal(r.status, 'production-ready');
  assert.ok(r.composite.overall >= 85);
});

test('evaluateCollection: legacy wiki blocked due to PII crisis', () => {
  const c = collections.find((c) => c.collectionId === 'col_legacy_wiki')!;
  const r = evaluateCollection(c);
  assert.equal(r.status, 'blocked');
  // Should be blocked regardless of composite, due to override logic
  assert.ok(r.recommendedNextAction.toLowerCase().includes('block'));
});

test('evaluateCollection: composite stays in 0-100 range', () => {
  for (const c of collections) {
    const r = evaluateCollection(c);
    assert.ok(r.composite.overall >= 0 && r.composite.overall <= 100, `${c.collectionId}: ${r.composite.overall}`);
  }
});

test('buildFleetPosture: status counts sum to total', () => {
  const r = buildFleetPosture(collections);
  const sum = r.summary.productionReady + r.summary.review + r.summary.degraded + r.summary.blocked;
  assert.equal(sum, r.summary.totalCollections);
});

test('buildFleetPosture: production-at-risk identifies blocked production', () => {
  const r = buildFleetPosture(collections);
  // legacy_wiki is production + blocked
  assert.ok(r.summary.productionAtRisk >= 1);
});

test('buildFleetPosture: total chunks under management is sum across collections', () => {
  const r = buildFleetPosture(collections);
  const expected = collections.reduce((s, c) => s + c.totalChunks, 0);
  assert.equal(r.summary.totalChunksUnderManagement, expected);
});

test('buildFleetPosture: PII incidents totaled across fleet', () => {
  const r = buildFleetPosture(collections);
  const expected = collections.reduce((s, c) => s + c.metrics.piiIncidents, 0);
  assert.equal(r.summary.totalPiiIncidents, expected);
});
