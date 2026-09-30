import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../src/index';
import { env } from '../src/config/env';
import { RealSkyyflowVault, realVaultFromEnv } from '../src/vault/real-vault';
import { parsePrincipals } from '../src/auth/principals';
import { assertRuntimeConfig } from '../src/config/env';

const testApiKey = Buffer.alloc(32, 0x44).toString('hex'); // Synthetic test-only token.
env.apiKey = testApiKey;
env.localDemo = true;

const decisionCard = {
  decision_card_version: '0.2',
  decision_id: 'DEMO-1',
  data_vault_targets: [{
    vendor: 'skyyflow',
    vault_id: 'mock-vault-001',
    fields_authorized: ['email'],
    reveal_roles: ['demo-operator'],
  }],
  decision: { status: 'approved' },
};

test('API key gates API routes, while health remains public', async () => {
  const previous = env.apiKey;
  env.apiKey = testApiKey;
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
  try {
    const oversized = await request(app)
      .post('/api/vault/preview')
      .set('Content-Type', 'application/json')
      .send('x'.repeat(8 * 1024 * 1024 + 1));
    assert.equal(oversized.status, 401);
  } catch (error) {
    // The server may close the connection before an unauthenticated client
    // finishes sending the body; no parser error or route response is exposed.
    assert.equal((error as NodeJS.ErrnoException).code, 'ECONNRESET');
  }
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

test('local demo cannot start in production or with real vault configuration', () => {
  const previousEnv = env.nodeEnv;
  env.nodeEnv = 'production';
  try {
    assert.throws(() => assertRuntimeConfig(), /loopback-only/);
  } finally {
    env.nodeEnv = previousEnv;
  }
  const previousUrl = process.env.SKYYFLOW_VAULT_URL;
  process.env.SKYYFLOW_VAULT_URL = 'https://vault.example.org/v1';
  try {
    assert.throws(() => assertRuntimeConfig(), /cannot connect to a real vault/);
  } finally {
    if (previousUrl === undefined) delete process.env.SKYYFLOW_VAULT_URL;
    else process.env.SKYYFLOW_VAULT_URL = previousUrl;
  }
});

test('startup rejects an unconfigured API', () => {
  const previous = { apiKey: env.apiKey, localDemo: env.localDemo, principals: env.principals };
  env.apiKey = '';
  env.localDemo = false;
  env.principals = [];
  try {
    assert.throws(() => assertRuntimeConfig(), /Configure RAG_SENTINEL_PRINCIPALS_JSON/);
  } finally {
    env.apiKey = previous.apiKey;
    env.localDemo = previous.localDemo;
    env.principals = previous.principals;
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
  const denied = await request(app).post('/api/vault/detokenize-preview').set('x-api-key', testApiKey).send({ decisionCard, tokens, callerRoles: ['demo-operator'] });
  assert.equal(denied.status, 400);
  const wrongField = await request(app).post('/api/vault/detokenize-preview').set('x-api-key', testApiKey).send({ decisionCard, tokens: [{ field: 'ssn', token: tokens[0].token }] });
  assert.equal(wrongField.status, 403);
  const tooMany = await request(app).post('/api/vault/detokenize-preview').set('x-api-key', testApiKey).send({ decisionCard, tokens: Array.from({ length: 101 }, () => tokens[0]) });
  assert.equal(tooMany.status, 400);
  const revealed = await request(app).post('/api/vault/detokenize-preview').set('x-api-key', testApiKey).send({ decisionCard, tokens });
  assert.deepEqual(revealed.body.items.map(({ value }: { value: string }) => value).sort(), ['jane@example.com', 'pat@example.com']);
});

test('blocked vault preview withholds candidate text from the HTTP response', async () => {
  const response = await request(app).post('/api/vault/preview').set('x-api-key', testApiKey).send({
    decisionCard,
    chunks: [{ chunkId: 'c-blocked', text: 'Phone (202) 555-0100 is outside the card field set.' }],
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.chunks[0].shouldBlock, true);
  assert.equal(response.body.chunks[0].vaultedText, null);
  assert.equal(JSON.stringify(response.body).includes('(202) 555-0100'), false);
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
  const previousPrincipals = env.principals;
  const previousLocalDemo = env.localDemo;
  const previous = {
    url: process.env.SKYYFLOW_VAULT_URL,
    token: process.env.SKYYFLOW_ACCESS_TOKEN,
    id: process.env.SKYYFLOW_VAULT_ID,
  };
  process.env.SKYYFLOW_VAULT_URL = 'https://vault.example.org/v1';
  process.env.SKYYFLOW_ACCESS_TOKEN = 'test-token-not-a-secret';
  process.env.SKYYFLOW_VAULT_ID = 'v_test_001';
  env.localDemo = false;
  env.principals = parsePrincipals(JSON.stringify([{ id: 'reviewer', tenantId: 'tenant-a', apiKey: testApiKey, roles: ['principal'], vaultIds: ['v_test_001'], fieldsAuthorized: ['email'] }]));
  try {
    const realDecisionCard = { ...decisionCard, data_vault_targets: [{ ...decisionCard.data_vault_targets[0], vault_id: 'v_test_001' }] };
    const response = await request(app).post('/api/vault/detokenize-preview').set('x-api-key', testApiKey).send({
      decisionCard: realDecisionCard, tokens: [{ field: 'email', token: 'skyy_demo' }],
    });
    assert.equal(response.status, 403);
  } finally {
    env.principals = previousPrincipals;
    env.localDemo = previousLocalDemo;
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

test('vault route returns 429 with retry guidance after its per-IP quota', async () => {
  let limited: Awaited<ReturnType<ReturnType<typeof request>['get']>> | undefined;
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await request(app).get('/api/vault/status').set('x-api-key', testApiKey);
    if (response.status === 429) {
      limited = response;
      break;
    }
  }
  assert.ok(limited, 'expected the vault quota to reject a burst');
  assert.equal(limited.body.error, 'Vault request rate limit exceeded.');
  assert.ok(limited.headers['retry-after']);
});

test('unauthenticated API attempts are limited before key lookup and ignore spoofed proxy IPs', async () => {
  let limited: Awaited<ReturnType<ReturnType<typeof request>['get']>> | undefined;
  for (let attempt = 0; attempt < 41; attempt++) {
    const response = await request(app).get('/api/collections')
      .set('x-api-key', 'wrong')
      .set('X-Forwarded-For', `198.51.100.${(attempt % 200) + 1}`);
    if (response.status === 429) {
      limited = response;
      break;
    }
    assert.equal(response.status, 401);
  }
  assert.ok(limited, 'expected the pre-auth quota to reject a burst despite spoofed headers');
  assert.equal(limited.body.error, 'API request rate limit exceeded.');
});
