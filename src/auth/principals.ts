import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const name = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const vaultField = z.enum(['email', 'phone', 'ssn', 'credit_card', 'iban']);
const principalSchema = z.object({
  id: name,
  tenantId: name,
  apiKey: z.string().min(32),
  roles: z.array(name),
  vaultIds: z.array(z.string().min(1)),
  fieldsAuthorized: z.array(vaultField),
}).strict();

export interface ApiPrincipal {
  id: string;
  tenantId: string;
  keyHash: Buffer;
  roles: readonly string[];
  vaultIds: readonly string[];
  fieldsAuthorized: readonly string[];
}

function hashKey(key: string): Buffer {
  return createHash('sha256').update(key, 'utf8').digest();
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
    const keyHash = hashKey(entry.apiKey);
    const keyId = keyHash.toString('hex');
    if (keys.has(keyId)) throw new Error('Principal API keys must be unique.');
    keys.add(keyId);
    for (const vaultId of entry.vaultIds) {
      const owner = vaultOwners.get(vaultId);
      if (owner && owner !== entry.tenantId) throw new Error('A vault ID cannot belong to two tenants.');
      vaultOwners.set(vaultId, entry.tenantId);
    }
    return {
      id: entry.id,
      tenantId: entry.tenantId,
      keyHash,
      roles: [...new Set(entry.roles)],
      vaultIds: [...new Set(entry.vaultIds)],
      fieldsAuthorized: [...new Set(entry.fieldsAuthorized)],
    };
  });
}

export function demoPrincipal(apiKey: string): ApiPrincipal {
  return {
    id: 'local-demo',
    tenantId: 'local-demo',
    keyHash: hashKey(apiKey),
    roles: ['vault-tokenize', 'demo-operator'],
    vaultIds: ['mock-vault-001'],
    fieldsAuthorized: ['email', 'phone', 'ssn', 'credit_card', 'iban'],
  };
}

export function findPrincipal(apiKey: string, principals: readonly ApiPrincipal[]): ApiPrincipal | null {
  if (!apiKey) return null;
  const candidate = hashKey(apiKey);
  let matched: ApiPrincipal | null = null;
  for (const principal of principals) {
    if (timingSafeEqual(candidate, principal.keyHash)) matched = principal;
  }
  return matched;
}

export function authorizesVaultTarget(
  principal: ApiPrincipal,
  target: { vaultId: string | null; fieldsAuthorized: readonly string[] },
): boolean {
  return Boolean(target.vaultId && principal.vaultIds.includes(target.vaultId)) &&
    target.fieldsAuthorized.length > 0 &&
    target.fieldsAuthorized.every((field) => vaultField.safeParse(field).success && principal.fieldsAuthorized.includes(field));
}
