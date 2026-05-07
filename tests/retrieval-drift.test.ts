import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDrift } from '../src/governance/retrieval-drift';

const baselineSnapshot = (results: string[]) => ({
  query: 'how do I rotate API keys',
  timestamp: '2026-04-01T00:00:00Z',
  collectionId: 'col_test',
  embeddingModel: 'text-embedding-3-large',
  results: results.map((id, i) => ({ chunkId: id, score: 0.9 - i * 0.05, rank: i })),
});

const currentSnapshot = (results: string[], modelChanged = false) => ({
  query: 'how do I rotate API keys',
  timestamp: '2026-05-01T00:00:00Z',
  collectionId: 'col_test',
  embeddingModel: modelChanged ? 'voyage-3' : 'text-embedding-3-large',
  results: results.map((id, i) => ({ chunkId: id, score: 0.9 - i * 0.05, rank: i })),
});

test('detectDrift: identical results = minimal drift', () => {
  const ids = ['c1', 'c2', 'c3', 'c4', 'c5'];
  const r = detectDrift(baselineSnapshot(ids), currentSnapshot(ids));
  assert.equal(r.driftLevel, 'minimal');
  assert.equal(r.topKOverlap, 1);
});

test('detectDrift: completely different results = severe drift', () => {
  const r = detectDrift(
    baselineSnapshot(['c1', 'c2', 'c3', 'c4', 'c5']),
    currentSnapshot(['c10', 'c11', 'c12', 'c13', 'c14'])
  );
  assert.equal(r.driftLevel, 'severe');
  assert.equal(r.topKOverlap, 0);
  assert.equal(r.newResults.length, 5);
  assert.equal(r.droppedResults.length, 5);
});

test('detectDrift: rank shuffle preserves overlap but lowers correlation', () => {
  const r = detectDrift(
    baselineSnapshot(['c1', 'c2', 'c3', 'c4', 'c5']),
    currentSnapshot(['c5', 'c4', 'c3', 'c2', 'c1'])
  );
  assert.equal(r.topKOverlap, 1);
  assert.ok(r.rankCorrelation < 0);
});

test('detectDrift: model change is flagged', () => {
  const r = detectDrift(
    baselineSnapshot(['c1', 'c2', 'c3']),
    currentSnapshot(['c1', 'c2', 'c3'], true)
  );
  assert.equal(r.modelChanged, true);
  assert.ok(r.rationale.toLowerCase().includes('model'));
});

test('detectDrift: throws on different queries', () => {
  const a = baselineSnapshot(['c1']);
  const b = currentSnapshot(['c1']);
  b.query = 'different query';
  assert.throws(() => detectDrift(a, b), /different queries/i);
});
