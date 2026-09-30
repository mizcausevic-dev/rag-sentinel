import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/index';
import { env } from '../src/config/env';
import { RealSkyyflowVault, realVaultFromEnv } from '../src/vault/real-vault';

const testApiKey = 'a'.repeat(32);
env.apiKey = testApiKey;

const decisionCard = {
  decision_card_version: '0.2',
  decision_id: 'DEMO-1',
  data_vault_targets: [{
    vendor: 'skyyflow',
    vault_id: 'v_test_001',
    fields_authorized: ['email'],
    reveal_roles: ['principal'],
  }],
};

test('API key gates API routes, while health remains public', async () => {
  const previous = env.apiKey;
  env.apiKey = 'a'.repeat(32);
  try {
    assert.equal((await request(app).get('/health')).status, 200);
    assert.equal((await request(app).get('/api/collections')).status, 401);
    assert.equal((await request(app).get('/api/collections').set('x-api-key', 'wrong')).status, 401);
    assert.equal((await request(app).get('/api/collections').set('x-api-key', env.apiKey)).status, 200);
  } finally {
    env.apiKey = previous;
  }
});

test('HTTP API does not grant arbitrary browser origins CORS access', async () => {
  const response = await request(app).get('/api/collections').set('x-api-key', testApiKey).set('Origin', 'https://untrusted.example.org');
  assert.equal(response.headers['access-control-allow-origin'], undefined);
});

test('API authorization runs before JSON body parsing', async () => {
  const invalid = await request(app)
    .post('/api/vault/preview')
    .set('Content-Type', 'application/json')
    .send('{');
  assert.equal(invalid.status, 401);
  const oversized = await request(app)
    .post('/api/vault/preview')
    .set('Content-Type', 'application/json')
    .send('x'.repeat(8 * 1024 * 1024 + 1));
  assert.equal(oversized.status, 401);
});

test('HTTP API fails closed if the key is not configured', async () => {
  const previous = env.apiKey;
  env.apiKey = '';
  try {
    assert.equal((await request(app).get('/api/collections')).status, 503);
  } finally {
    env.apiKey = previous;
  }
});

test('mock preview round-trip works locally and denies an unlisted role', async () => {
  const preview = await request(app).post('/api/vault/preview').set('x-api-key', testApiKey).send({
    decisionCard,
    chunks: [{ chunkId: 'c1', text: 'jane@example.com and pat@example.com' }],
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.chunks[0].substitutions.length, 2);
  assert.equal(preview.body.chunks[0].shouldBlock, false);
  const tokens = preview.body.chunks[0].substitutions.map(({ field, token }: { field: string; token: string }) => ({ field, token }));
  const denied = await request(app).post('/api/vault/detokenize-preview').set('x-api-key', testApiKey).send({ decisionCard, tokens, callerRoles: ['student'] });
  assert.equal(denied.status, 200);
  assert.ok(denied.body.items.every(({ value }: { value: string | null }) => value === null));
  const revealed = await request(app).post('/api/vault/detokenize-preview').set('x-api-key', testApiKey).send({ decisionCard, tokens, callerRoles: ['principal'] });
  assert.deepEqual(revealed.body.items.map(({ value }: { value: string }) => value).sort(), ['jane@example.com', 'pat@example.com']);
});

test('production mode refuses the mock vault preview', async () => {
  const previous = env.nodeEnv;
  env.nodeEnv = 'production';
  try {
    const response = await request(app).post('/api/vault/preview').set('x-api-key', testApiKey).send({
      decisionCard, chunks: [{ chunkId: 'c1', text: 'jane@example.com' }],
    });
    assert.equal(response.status, 503);
  } finally {
    env.nodeEnv = previous;
  }
});

test('real vault reveal endpoint fails closed before network access', async () => {
  const previous = {
    url: process.env.SKYYFLOW_VAULT_URL,
    token: process.env.SKYYFLOW_ACCESS_TOKEN,
    id: process.env.SKYYFLOW_VAULT_ID,
  };
  process.env.SKYYFLOW_VAULT_URL = 'https://vault.example.org/v1';
  process.env.SKYYFLOW_ACCESS_TOKEN = 'test-token-not-a-secret';
  process.env.SKYYFLOW_VAULT_ID = 'v_test_001';
  try {
    const response = await request(app).post('/api/vault/detokenize-preview').set('x-api-key', testApiKey).send({
      decisionCard, tokens: [{ field: 'email', token: 'skyy_demo' }], callerRoles: ['principal'],
    });
    assert.equal(response.status, 403);
  } finally {
    for (const [name, value] of Object.entries({
      SKYYFLOW_VAULT_URL: previous.url,
      SKYYFLOW_ACCESS_TOKEN: previous.token,
      SKYYFLOW_VAULT_ID: previous.id,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('incomplete real-vault configuration cannot silently fall back to mock', () => {
  assert.throws(() => realVaultFromEnv({ SKYYFLOW_VAULT_URL: 'https://vault.example.org' }));
});

test('real vault requests have a timeout and refuse redirects', async () => {
  const seen: RequestInit[] = [];
  const vault = new RealSkyyflowVault({
    baseUrl: 'https://vault.example.org/v1',
    accessToken: 'synthetic-test-token',
    vaultId: 'v_test_001',
    fetchImpl: (async (_url: unknown, init?: RequestInit) => {
      seen.push(init ?? {});
      return new Response(JSON.stringify({ items: [{ field: 'email', token: 'skyy_demo', value: 'jane@example.com', disposition: 'revealed' }] }), { headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
  });
  await vault.tokenize([{ field: 'email', value: 'jane@example.com' }]);
  await vault.detokenize([{ field: 'email', token: 'skyy_demo' }], { callerRoles: ['principal'], revealRoles: ['principal'] });
  assert.equal(seen.length, 2);
  assert.ok(seen.every((init) => init.redirect === 'error' && init.signal));
});
