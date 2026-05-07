import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreChunkQuality, scoreChunkBatch } from '../src/governance/chunk-quality';

const goodChunk = {
  chunkId: 'c1',
  collectionId: 'col_test',
  text: 'The Model Context Protocol is a standardized way for AI models to interact with external tools and data sources. Servers expose tools via JSON-RPC and clients invoke them on behalf of agents. This decoupling allows tool surfaces to evolve independently from model implementations.',
  tokenCount: 540,
  metadata: { source: 'docs.example.com/mcp', title: 'MCP Overview', last_updated: '2026-04-01' },
  sourceUri: 'docs.example.com/mcp',
  sourceLastUpdated: '2026-04-01',
};

test('scoreChunkQuality: well-formed chunk scores high', () => {
  const r = scoreChunkQuality(goodChunk);
  assert.ok(r.score >= 90, `expected >= 90, got ${r.score}`);
  assert.equal(r.issues.length, 0);
});

test('scoreChunkQuality: tiny chunk loses points', () => {
  const r = scoreChunkQuality({ ...goodChunk, text: 'Short.', tokenCount: 50 });
  assert.ok(r.score < 90);
  assert.ok(r.issues.some((i) => i.includes('100 tokens')));
});

test('scoreChunkQuality: oversized chunk loses points', () => {
  const r = scoreChunkQuality({ ...goodChunk, tokenCount: 2500 });
  assert.ok(r.score < 95);
  assert.ok(r.issues.some((i) => i.includes('2000 tokens')));
});

test('scoreChunkQuality: missing metadata flagged', () => {
  const r = scoreChunkQuality({ ...goodChunk, metadata: { source: 'x' } });
  assert.ok(r.issues.some((i) => i.includes('metadata')));
  assert.ok(r.score < 90);
});

test('scoreChunkQuality: mid-sentence start flagged', () => {
  const r = scoreChunkQuality({ ...goodChunk, text: 'and this continues from before. The rest of the text is normal and well-formed and continues for many tokens, providing reasonable context for retrieval purposes.' });
  assert.ok(r.issues.some((i) => i.includes('mid-sentence')));
});

test('scoreChunkBatch: counts categorize correctly', () => {
  const result = scoreChunkBatch([
    goodChunk,
    { ...goodChunk, chunkId: 'c2' },
    { ...goodChunk, chunkId: 'c3', text: 'short', tokenCount: 30, metadata: {} },
  ]);
  assert.equal(result.totalChunks, 3);
  assert.ok(result.excellentCount >= 2);
  assert.ok(result.poorCount >= 1);
});

test('scoreChunkBatch: top issues aggregated', () => {
  const tiny = { ...goodChunk, chunkId: 'c4', tokenCount: 30, text: 'short', metadata: {} };
  const result = scoreChunkBatch([tiny, { ...tiny, chunkId: 'c5' }, { ...tiny, chunkId: 'c6' }]);
  assert.ok(result.topIssues.length > 0);
  assert.ok(result.topIssues[0].affectedChunks >= 2);
});
