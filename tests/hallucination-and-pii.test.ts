import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAnswer } from '../src/governance/hallucination';
import { scanChunk, scanBatch } from '../src/governance/pii-scanner';

// Hallucination tests

test('evaluateAnswer: well-cited answer scores high', () => {
  const r = evaluateAnswer({
    answerText: 'API key rotation in MCP requires re-issuing the key. Servers must invalidate old keys within 24 hours of rotation.',
    citationsClaimed: [
      { sourceId: 's1', quote: 'API key rotation in MCP requires re-issuing the key' },
      { sourceId: 's2', quote: 'Servers must invalidate old keys within 24 hours' },
    ],
    retrievedSources: [
      { sourceId: 's1', text: 'API key rotation in MCP requires re-issuing the key from the registry.' },
      { sourceId: 's2', text: 'Servers must invalidate old keys within 24 hours of rotation per policy.' },
    ],
  });
  assert.ok(r.groundingScore >= 80, `expected >= 80, got ${r.groundingScore}`);
  assert.equal(r.unsupportedCitations.length, 0);
});

test('evaluateAnswer: hallucinated citation is flagged', () => {
  const r = evaluateAnswer({
    answerText: 'The system uses Diffie-Hellman key exchange. This was confirmed in the 2024 audit.',
    citationsClaimed: [{ sourceId: 's1', quote: 'Diffie-Hellman key exchange used since 2019' }],
    retrievedSources: [{ sourceId: 's1', text: 'The cryptographic stack uses RSA-2048 for transport.' }],
  });
  assert.ok(r.groundingScore < 80);
  assert.equal(r.unsupportedCitations.length, 1);
});

test('evaluateAnswer: empty retrieval with non-empty answer flagged', () => {
  const r = evaluateAnswer({
    answerText: 'You can rotate keys by calling the rotate endpoint and waiting for confirmation.',
    citationsClaimed: [],
    retrievedSources: [],
  });
  assert.ok(r.groundingScore < 70);
  assert.ok(r.signals.some((s) => s.includes('empty retrieval')));
});

test('evaluateAnswer: explicit refusal scores perfect grounding', () => {
  const r = evaluateAnswer({
    answerText: 'I do not have enough information in retrieved sources to answer this question.',
    citationsClaimed: [],
    retrievedSources: [],
    refusalReasons: ['no relevant sources'],
  });
  assert.equal(r.groundingScore, 100);
});

test('evaluateAnswer: low citation coverage drops score', () => {
  const r = evaluateAnswer({
    answerText: 'The system supports OAuth. It also supports SAML. And it works with Azure AD. We added LDAP last year. Custom auth is also possible.',
    citationsClaimed: [{ sourceId: 's1', quote: 'OAuth' }],
    retrievedSources: [{ sourceId: 's1', text: 'The system supports OAuth as the primary auth method.' }],
  });
  assert.ok(r.citationCoverage < 50);
  assert.ok(r.signals.some((s) => s.toLowerCase().includes('citation coverage')));
});

// PII scanner tests

test('scanChunk: detects API key pattern', () => {
  const r = scanChunk('c1', 'Use sk-proj-AbCdEf1234567890XyZpQrStUvWxYz123456 to authenticate.');
  assert.ok(r.hits.length >= 1);
  assert.equal(r.shouldBlock, true);
  assert.equal(r.highestSeverity, 'critical');
});

test('scanChunk: detects SSN pattern', () => {
  const r = scanChunk('c2', 'Customer SSN on file: 123-45-6789.');
  assert.ok(r.hits.some((h) => h.patternName === 'ssn-us'));
  assert.equal(r.shouldBlock, true);
});

test('scanChunk: detects private key block', () => {
  const r = scanChunk('c3', 'Embedded credential: -----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...');
  assert.ok(r.hits.some((h) => h.patternName === 'private-key-block'));
  assert.equal(r.highestSeverity, 'critical');
});

test('scanChunk: clean content has no hits', () => {
  const r = scanChunk('c4', 'This documentation describes the architecture of the system without any sensitive data.');
  assert.equal(r.hits.length, 0);
  assert.equal(r.shouldBlock, false);
  assert.equal(r.highestSeverity, null);
});

test('scanChunk: redacts matched snippet', () => {
  const r = scanChunk('c5', 'Token: sk-proj-AbCdEf1234567890XyZpQrStUvWxYz123456 yes.');
  assert.ok(r.hits[0].matchedSnippet.includes('****'));
  // Original key should not appear in redacted output
  assert.ok(!r.hits[0].matchedSnippet.includes('AbCdEf1234567890XyZ'));
});

test('scanBatch: aggregates counts correctly', () => {
  const r = scanBatch([
    { chunkId: 'a', text: 'SSN: 999-88-7777' },
    { chunkId: 'b', text: 'AKIAIOSFODNN7EXAMPLE is the access key' },
    { chunkId: 'c', text: 'Just normal text here.' },
  ]);
  assert.equal(r.totalChunks, 3);
  assert.equal(r.flaggedChunks, 2);
  assert.equal(r.blockedChunks, 2);
});
