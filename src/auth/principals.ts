import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const name = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const vaultField = z.enum(['email', 'phone', 'ssn', 'credit_card', 'iban']);
const keyFormat = /^[a-f0-9]{64}$/;
// API keys are generated from 32 random bytes, not user-chosen passwords.
// Keep decoded token bytes outside serializable principal records.
const principalKeys = new WeakMap<ApiPrincipal, Buffer>();
const principalSchema = z.object({
  id: name,
  tenantId: name,
  apiKey: z.string().regex(keyFormat, 'API key must be 64 lowercase hex characters generated from 32 random bytes.'),
  roles: z.array(name),
  vaultIds: z.array(z.string().min(1)),
  fieldsAuthorized: z.array(vaultField),
}).strict();

export interface ApiPrincipal {
  id: string;
  tenantId: string;
  roles: readonly string[];
  vaultIds: readonly string[];
  fieldsAuthorized: readonly string[];
}

export function isApiKeyFormat(key: string): boolean {
  return keyFormat.test(key);
}

function bindKey(principal: ApiPrincipal, key: string): ApiPrincipal {
  if (!isApiKeyFormat(key)) throw new Error('API key must be 64 lowercase hex characters generated from 32 random bytes.');
  principalKeys.set(principal, Buffer.from(key, 'hex'));
  return principal;
}

export function parsePrincipals(raw: string | undefined): ApiPrincipal[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('RAG_SENTINEL_PRINCIPALS_JSON must be a JSON array.');
  }
  const config = z.array(principalSchema).min(1).parse(parsed);
  const ids = new Set<string>();
  const keys = new Set<string>();
  const vaultOwners = new Map<string, string>();
  return config.map((entry) => {
    if (ids.has(entry.id)) throw new Error('Principal IDs must be unique.');
    ids.add(entry.id);
    if (keys.has(entry.apiKey)) throw new Error('Principal API keys must be unique.');
    keys.add(entry.apiKey);
    for (const vaultId of entry.vaultIds) {
      const owner = vaultOwners.get(vaultId);
      if (owner && owner !== entry.tenantId) throw new Error('A vault ID cannot belong to two tenants.');
      vaultOwners.set(vaultId, entry.tenantId);
    }
    return bindKey({
      id: entry.id,
      tenantId: entry.tenantId,
      roles: [...new Set(entry.roles)],
      vaultIds: [...new Set(entry.vaultIds)],
      fieldsAuthorized: [...new Set(entry.fieldsAuthorized)],
    }, entry.apiKey);
  });
}

export function demoPrincipal(apiKey: string): ApiPrincipal {
  return bindKey({
    id: 'local-demo',
    tenantId: 'local-demo',
    roles: ['vault-tokenize', 'demo-operator'],
    vaultIds: ['mock-vault-001'],
    fieldsAuthorized: ['email', 'phone', 'ssn', 'credit_card', 'iban'],
  }, apiKey);
}

export function findPrincipal(apiKey: string, principals: readonly ApiPrincipal[]): ApiPrincipal | null {
  if (!isApiKeyFormat(apiKey)) return null;
  const candidate = Buffer.from(apiKey, 'hex');
  try {
    let matched: ApiPrincipal | null = null;
    for (const principal of principals) {
      const expected = principalKeys.get(principal);
      if (expected && timingSafeEqual(candidate, expected)) matched = principal;
    }
    return matched;
  } finally {
    candidate.fill(0);
  }
}

export function authorizesVaultTarget(
  principal: ApiPrincipal,
  target: { vaultId: string | null; fieldsAuthorized: readonly string[] },
): boolean {
  return Boolean(target.vaultId && principal.vaultIds.includes(target.vaultId)) &&
    target.fieldsAuthorized.length > 0 &&
    target.fieldsAuthorized.every((field) => vaultField.safeParse(field).success && principal.fieldsAuthorized.includes(field));
}
