import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/index';
import { env } from '../src/config/env';
import { authorizesVaultTarget, findPrincipal, parsePrincipals } from '../src/auth/principals';
import { decisionIsActive, parseDecisionCard, selectVaultTarget } from '../src/vault/decision-card';

const keyA = Buffer.alloc(32, 0x11).toString('hex');
const keyB = Buffer.alloc(32, 0x22).toString('hex');
const keyC = Buffer.alloc(32, 0x33).toString('hex');
const config = [
  { id: 'alice', tenantId: 'tenant-a', apiKey: keyA, roles: ['vault-tokenize', 'reviewer'], vaultIds: ['vault-a'], fieldsAuthorized: ['email'] },
  { id: 'bob', tenantId: 'tenant-b', apiKey: keyB, roles: ['vault-tokenize'], vaultIds: ['vault-b'], fieldsAuthorized: ['email'] },
];

test('principal keys bind server-side tenant, vault, role, and field policy', () => {
  const principals = parsePrincipals(JSON.stringify(config));
  assert.equal(findPrincipal(keyA, principals)?.tenantId, 'tenant-a');
  assert.equal(findPrincipal(keyB, principals)?.tenantId, 'tenant-b');
  assert.equal(findPrincipal('wrong', principals), null);
  assert.equal(authorizesVaultTarget(principals[0]!, { vaultId: 'vault-a', fieldsAuthorized: ['email'] }), true);
  assert.equal(authorizesVaultTarget(principals[1]!, { vaultId: 'vault-a', fieldsAuthorized: ['email'] }), false);
  assert.equal(authorizesVaultTarget(principals[0]!, { vaultId: 'vault-a', fieldsAuthorized: ['ssn'] }), false);
  assert.equal(authorizesVaultTarget(principals[0]!, { vaultId: 'vault-a', fieldsAuthorized: ['student.email'] }), false);
  assert.throws(() => parsePrincipals(JSON.stringify([{ ...config[0], fieldsAuthorized: ['student.email'] }])), /Invalid option|invalid_enum_value/i);
  assert.equal(JSON.stringify(principals).includes(keyA), false);
});

test('principal config refuses duplicate keys and cross-tenant vault ownership', () => {
  assert.throws(() => parsePrincipals(JSON.stringify([{ ...config[0], apiKey: 'short' }])), /64 lowercase hex/i);
  assert.throws(() => parsePrincipals(JSON.stringify([{ ...config[0], apiKey: 'z'.repeat(64) }])), /64 lowercase hex/i);
  assert.throws(() => parsePrincipals(JSON.stringify([config[0], { ...config[1], apiKey: keyA }])), /API keys must be unique/);
  assert.throws(() => parsePrincipals(JSON.stringify([config[0], { ...config[1], vaultIds: ['vault-a'] }])), /cannot belong to two tenants/);
});

test('latest Decision Card v0.3 vault target is inactive when rejected or expired', () => {
  const raw = {
    decision_card_version: '0.3', decision_id: 'DEC-1',
    decision: { status: 'approved', effective_from: '2026-01-01', effective_until: '2026-12-31' },
    data_vault_targets: [{ vendor: 'skyyflow', vault_id: 'vault-a', fields_authorized: ['email'], expires_at: '2026-12-01T00:00:00Z' }],
  };
  const card = parseDecisionCard(raw);
  const target = selectVaultTarget(card, 'skyyflow')!;
  assert.equal(decisionIsActive(card, target, new Date('2026-09-29T00:00:00Z')), true);
  assert.equal(decisionIsActive(card, target, new Date('2027-01-01T00:00:00Z')), false);
  assert.equal(decisionIsActive(parseDecisionCard({ ...raw, decision: { status: 'rejected' } }), target), false);
  assert.equal(decisionIsActive(parseDecisionCard({ ...raw, decision: { status: 'approved-with-conditions' } }), target), false);
});

test('HTTP principal cannot authorize another tenant by supplying its vault target or roles', async () => {
  const previous = { principals: env.principals, localDemo: env.localDemo, apiKey: env.apiKey };
  env.principals = parsePrincipals(JSON.stringify([
    ...config,
    { id: 'reviewer-only', tenantId: 'tenant-a', apiKey: keyC, roles: ['reviewer'], vaultIds: ['vault-a'], fieldsAuthorized: ['email'] },
  ]));
  env.localDemo = false;
  env.apiKey = '';
  try {
    const decisionCard = {
      decision_card_version: '0.3', decision_id: 'DEC-1', decision: { status: 'approved' },
      data_vault_targets: [{ vendor: 'skyyflow', vault_id: 'vault-a', fields_authorized: ['email'], reveal_roles: ['reviewer'] }],
    };
    const body = { decisionCard, chunks: [{ chunkId: 'c1', text: 'synthetic@example.org' }], callerRoles: ['reviewer'], tenantId: 'tenant-a' };
    const denied = await request(app).post('/api/vault/preview').set('x-api-key', keyB).send(body);
    assert.equal(denied.status, 403);
    const noRole = await request(app).post('/api/vault/preview').set('x-api-key', keyC).send(body);
    assert.equal(noRole.status, 403);
    const owner = await request(app).post('/api/vault/preview').set('x-api-key', keyA).send(body);
    assert.equal(owner.status, 503); // Authorized principal, but no real provider is configured.
  } finally {
    env.principals = previous.principals;
    env.localDemo = previous.localDemo;
    env.apiKey = previous.apiKey;
  }
});

test('vault status does not disclose another tenant\'s configured vault ID', async () => {
  const previousPrincipals = env.principals;
  const previousVault = {
    url: process.env.SKYYFLOW_VAULT_URL,
    token: process.env.SKYYFLOW_ACCESS_TOKEN,
    id: process.env.SKYYFLOW_VAULT_ID,
  };
  env.principals = parsePrincipals(JSON.stringify(config));
  process.env.SKYYFLOW_VAULT_URL = 'https://vault.example.org/v1';
  process.env.SKYYFLOW_ACCESS_TOKEN = 'synthetic-test-token';
  process.env.SKYYFLOW_VAULT_ID = 'vault-a';
  try {
    const denied = await request(app).get('/api/vault/status').set('x-api-key', keyB);
    assert.equal(denied.status, 403);
    assert.equal(JSON.stringify(denied.body).includes('vault-a'), false);
    const allowed = await request(app).get('/api/vault/status').set('x-api-key', keyA);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.vaultId, 'vault-a');
  } finally {
    env.principals = previousPrincipals;
    for (const [name, value] of Object.entries({
      SKYYFLOW_VAULT_URL: previousVault.url,
      SKYYFLOW_ACCESS_TOKEN: previousVault.token,
      SKYYFLOW_VAULT_ID: previousVault.id,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('vault preview rejects every malformed or oversized chunk before calling the provider', async () => {
  const previousPrincipals = env.principals;
  const previousLocalDemo = env.localDemo;
  const previousKey = env.apiKey;
  const previousFetch = globalThis.fetch;
  const previousVault = {
    url: process.env.SKYYFLOW_VAULT_URL,
    token: process.env.SKYYFLOW_ACCESS_TOKEN,
    id: process.env.SKYYFLOW_VAULT_ID,
  };
  let providerCalls = 0;
  globalThis.fetch = (async () => { providerCalls++; throw new Error('unexpected provider call'); }) as typeof fetch;
  env.principals = parsePrincipals(JSON.stringify(config));
  env.localDemo = false;
  env.apiKey = '';
  process.env.SKYYFLOW_VAULT_URL = 'https://vault.example.org/v1';
  process.env.SKYYFLOW_ACCESS_TOKEN = 'synthetic-test-token';
  process.env.SKYYFLOW_VAULT_ID = 'vault-a';
  try {
    const decisionCard = {
      decision_card_version: '0.3', decision_id: 'DEC-1', decision: { status: 'approved' },
      data_vault_targets: [{ vendor: 'skyyflow', vault_id: 'vault-a', fields_authorized: ['email'] }],
    };
    const valid = { chunkId: 'c1', text: 'synthetic@example.org' };
    for (const chunks of [
      [valid, { chunkId: 'c2', text: 42 }],
      Array.from({ length: 51 }, (_, index) => ({ chunkId: `c${index}`, text: 'synthetic text' })),
      [{ chunkId: 'large', text: 'x'.repeat(65_537) }],
    ]) {
      const response = await request(app).post('/api/vault/preview').set('x-api-key', keyA).send({ decisionCard, chunks });
      assert.equal(response.status, 400);
      assert.equal(providerCalls, 0);
    }
    const providerFailure = await request(app).post('/api/vault/preview').set('x-api-key', keyA).send({ decisionCard, chunks: [valid] });
    assert.equal(providerFailure.status, 502);
    assert.equal(providerFailure.body.error, 'Vault preview failed.');
    assert.equal(providerCalls, 1);
    assert.equal(JSON.stringify(providerFailure.body).includes('unexpected provider call'), false);
  } finally {
    globalThis.fetch = previousFetch;
    env.principals = previousPrincipals;
    env.localDemo = previousLocalDemo;
    env.apiKey = previousKey;
    for (const [name, value] of Object.entries({
      SKYYFLOW_VAULT_URL: previousVault.url,
      SKYYFLOW_ACCESS_TOKEN: previousVault.token,
      SKYYFLOW_VAULT_ID: previousVault.id,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
