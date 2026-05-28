import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockSkyyflowVault } from '../src/vault/mock-vault';
import { parseDecisionCard, selectVaultTarget, InvalidDecisionCardError } from '../src/vault/decision-card';
import { vaultChunk } from '../src/governance/vault-chunk';

const SAMPLE_DECISION_CARD = {
  decision_card_version: '0.2',
  decision_id: 'TEST-DEC-001',
  issued_at: '2026-05-28T18:00:00Z',
  buyer: { name: 'Test District', type: 'school-district' },
  decision: { status: 'approved-with-conditions' },
  subject: { vendor_name: 'TestVendor' },
  rationale: 'unit test fixture',
  data_vault_targets: [
    {
      vendor: 'skyyflow',
      vault_id: 'v_test_001',
      vault_url: 'https://test.vault.skyyflowapis.example/',
      fields_authorized: ['email', 'phone', 'ssn', 'credit_card', 'iban'],
      reveal_roles: ['compliance-officer', 'principal'],
      reveal_audit_uri: 'https://test.example/audit',
    },
  ],
};

test('parseDecisionCard: extracts vault targets from v0.2 document', () => {
  const parsed = parseDecisionCard(SAMPLE_DECISION_CARD);
  assert.equal(parsed.decisionId, 'TEST-DEC-001');
  assert.equal(parsed.version, '0.2');
  assert.equal(parsed.vaultTargets.length, 1);
  assert.equal(parsed.vaultTargets[0].vendor, 'skyyflow');
  assert.deepEqual(parsed.vaultTargets[0].fieldsAuthorized, ['email', 'phone', 'ssn', 'credit_card', 'iban']);
  assert.deepEqual(parsed.vaultTargets[0].revealRoles, ['compliance-officer', 'principal']);
});

test('parseDecisionCard: v0.1 document without data_vault_targets returns empty list', () => {
  const parsed = parseDecisionCard({
    decision_card_version: '0.1',
    decision_id: 'TEST-DEC-002',
    issued_at: '2026-05-28T18:00:00Z',
    buyer: { name: 'X', type: 'organization' },
    decision: { status: 'approved' },
    subject: { vendor_name: 'Y' },
    rationale: 'x',
  });
  assert.equal(parsed.version, '0.1');
  assert.equal(parsed.vaultTargets.length, 0);
});

test('parseDecisionCard: rejects unknown version', () => {
  assert.throws(
    () => parseDecisionCard({ decision_card_version: '0.99', decision_id: 'X' }),
    InvalidDecisionCardError
  );
});

test('selectVaultTarget: returns the skyyflow target', () => {
  const parsed = parseDecisionCard(SAMPLE_DECISION_CARD);
  const target = selectVaultTarget(parsed, 'skyyflow');
  assert.ok(target);
  assert.equal(target!.vendor, 'skyyflow');
});

test('selectVaultTarget: returns null when vendor is absent', () => {
  const parsed = parseDecisionCard(SAMPLE_DECISION_CARD);
  assert.equal(selectVaultTarget(parsed, 'piiano'), null);
});

test('MockSkyyflowVault: tokenize then detokenize with authorized role round-trips', async () => {
  const vault = new MockSkyyflowVault();
  const [t] = await vault.tokenize([{ field: 'email', value: 'jane@example.com' }]);
  assert.ok(t.token.startsWith('skyy_'));
  const [d] = await vault.detokenize([t], {
    callerRoles: ['principal'],
    revealRoles: ['principal', 'compliance-officer'],
  });
  assert.equal(d.disposition, 'revealed');
  assert.equal(d.value, 'jane@example.com');
});

test('MockSkyyflowVault: detokenize without an authorized role is denied', async () => {
  const vault = new MockSkyyflowVault();
  const [t] = await vault.tokenize([{ field: 'email', value: 'jane@example.com' }]);
  const [d] = await vault.detokenize([t], {
    callerRoles: ['student'],
    revealRoles: ['principal'],
  });
  assert.equal(d.disposition, 'denied-not-authorized');
  assert.equal(d.value, null);
});

test('MockSkyyflowVault: detokenizing an unknown token is denied without leaking', async () => {
  const vault = new MockSkyyflowVault();
  const [d] = await vault.detokenize(
    [{ field: 'email', token: 'skyy_nonexistent' }],
    { callerRoles: ['principal'], revealRoles: ['principal'] }
  );
  assert.equal(d.disposition, 'denied-no-such-token');
  assert.equal(d.value, null);
});

test('vaultChunk: replaces email and SSN PII with tokens, leaves text otherwise intact', async () => {
  const vault = new MockSkyyflowVault();
  const target = selectVaultTarget(parseDecisionCard(SAMPLE_DECISION_CARD), 'skyyflow')!;
  const r = await vaultChunk(
    'chunk-1',
    'Parent contact: jane@example.com, SSN on file 123-45-6789, for after-hours support.',
    target,
    vault
  );
  assert.ok(!r.vaultedText.includes('jane@example.com'));
  assert.ok(!r.vaultedText.includes('123-45-6789'));
  assert.ok(r.vaultedText.startsWith('Parent contact: skyy_'));
  assert.ok(r.vaultedText.includes('for after-hours support'));
  assert.equal(r.substitutions.length, 2);
  const fields = r.substitutions.map((s) => s.field).sort();
  assert.deepEqual(fields, ['email', 'ssn']);
  assert.equal(r.shouldBlock, false);
});

test('vaultChunk: leaves credentials (api keys) unauthorized + still blocks', async () => {
  const vault = new MockSkyyflowVault();
  const target = selectVaultTarget(parseDecisionCard(SAMPLE_DECISION_CARD), 'skyyflow')!;
  const r = await vaultChunk(
    'chunk-2',
    'Sample doc embedding sk-proj-AbCdEf1234567890XyZpQrStUvWxYz123456 should not be indexed.',
    target,
    vault
  );
  // No PII fields authorized for api-key-prefix — chunk still blocks.
  assert.equal(r.substitutions.length, 0);
  assert.equal(r.shouldBlock, true);
  assert.ok(r.unauthorizedHits.some((h) => h.patternName === 'api-key-prefix'));
});

test('vaultChunk: clean text passes through with zero substitutions', async () => {
  const vault = new MockSkyyflowVault();
  const target = selectVaultTarget(parseDecisionCard(SAMPLE_DECISION_CARD), 'skyyflow')!;
  const r = await vaultChunk(
    'chunk-3',
    'This is a chunk with no sensitive data at all.',
    target,
    vault
  );
  assert.equal(r.substitutions.length, 0);
  assert.equal(r.vaultedText, 'This is a chunk with no sensitive data at all.');
  assert.equal(r.shouldBlock, false);
});

test('vaultChunk: same input is tokenized deterministically (same token across calls)', async () => {
  const vault = new MockSkyyflowVault();
  const target = selectVaultTarget(parseDecisionCard(SAMPLE_DECISION_CARD), 'skyyflow')!;
  const a = await vaultChunk('c-a', 'Contact: jane@example.com', target, vault);
  const b = await vaultChunk('c-b', 'Contact: jane@example.com', target, vault);
  assert.equal(a.substitutions[0].token, b.substitutions[0].token);
});
