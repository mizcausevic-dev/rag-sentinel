// In-memory deterministic Skyyflow vault for tests, screenshots, and demos.
// Tokens are produced by sha256(vaultId|field|value) and stored in a Map; the
// reverse direction reads the Map. Calls round-trip cleanly within a single
// process. Not persisted, not network-visible.

import { createHash } from 'node:crypto';
import type {
  DetokenizeRequest,
  DetokenizeResponse,
  SkyyflowVault,
  TokenizeRequest,
  TokenizeResponse,
} from './types';

export class MockSkyyflowVault implements SkyyflowVault {
  readonly vendor = 'skyyflow' as const;
  readonly vaultId: string;
  private readonly store = new Map<string, { field: string; value: string }>();

  constructor(vaultId = 'mock-vault-001') {
    this.vaultId = vaultId;
  }

  async tokenize(requests: TokenizeRequest[]): Promise<TokenizeResponse[]> {
    return requests.map(({ field, value }) => {
      const hash = createHash('sha256').update(`${this.vaultId}|${field}|${value}`).digest('hex');
      const token = `skyy_${hash.slice(0, 16)}`;
      this.store.set(token, { field, value });
      return { field, token };
    });
  }

  async detokenize(
    requests: DetokenizeRequest[],
    options: { callerRoles: readonly string[]; revealRoles: readonly string[] }
  ): Promise<DetokenizeResponse[]> {
    const authorized = options.revealRoles.some((r) => options.callerRoles.includes(r));
    return requests.map(({ field, token }) => {
      const entry = this.store.get(token);
      if (!entry) {
        return { field, token, value: null, disposition: 'denied-no-such-token' };
      }
      if (!authorized) {
        return { field, token, value: null, disposition: 'denied-not-authorized' };
      }
      return { field, token, value: entry.value, disposition: 'revealed' };
    });
  }

  /** Test-only — number of tokens stored. */
  size(): number {
    return this.store.size;
  }
}
