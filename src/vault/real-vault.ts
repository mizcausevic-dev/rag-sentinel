// HTTP adapter for a real Skyyflow vault. Selected when SKYYFLOW_VAULT_URL is
// set in the environment; otherwise rag-sentinel falls back to MockSkyyflowVault.
//
// The shape below targets the Skyyflow-style tokenize/detokenize REST API —
// bearer-auth, JSON in/out, /v1/tokenize and /v1/detokenize endpoints. The
// adapter is intentionally minimal: rag-sentinel does not own the vault's
// auth, residency, or key material — it only owns the contract on this
// process's side.

import type {
  DetokenizeRequest,
  DetokenizeResponse,
  SkyyflowVault,
  TokenizeRequest,
  TokenizeResponse,
} from './types';

export interface RealVaultOptions {
  /** Base URL, e.g. https://acme.vault.skyyflowapis.example/v1 */
  baseUrl: string;
  /** OAuth/bearer token. Caller is responsible for refresh. */
  accessToken: string;
  /** Vault identifier — surfaces in audit-stream events, must match the Decision Card's vault_id. */
  vaultId: string;
  /** Override the global fetch (testing seam). */
  fetchImpl?: typeof fetch;
}

export class RealSkyyflowVault implements SkyyflowVault {
  readonly vendor = 'skyyflow' as const;
  readonly vaultId: string;
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RealVaultOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.accessToken = options.accessToken;
    this.vaultId = options.vaultId;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async tokenize(requests: TokenizeRequest[]): Promise<TokenizeResponse[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/tokenize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ vaultId: this.vaultId, items: requests }),
    });
    if (!res.ok) {
      throw new Error(`Skyyflow tokenize failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { items: TokenizeResponse[] };
    return data.items;
  }

  async detokenize(
    requests: DetokenizeRequest[],
    options: { callerRoles: readonly string[]; revealRoles: readonly string[] }
  ): Promise<DetokenizeResponse[]> {
    // Authorization happens here, on the rag-sentinel side, before we make the
    // call. If the caller is not authorized we shortcut to denied responses
    // without ever asking the vault to reveal — defense in depth with the
    // vault's own RBAC.
    const authorized = options.revealRoles.some((r) => options.callerRoles.includes(r));
    if (!authorized) {
      return requests.map(({ field, token }) => ({
        field,
        token,
        value: null,
        disposition: 'denied-not-authorized' as const,
      }));
    }

    const res = await this.fetchImpl(`${this.baseUrl}/detokenize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vaultId: this.vaultId,
        items: requests,
        callerRoles: options.callerRoles,
      }),
    });
    if (!res.ok) {
      throw new Error(`Skyyflow detokenize failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { items: DetokenizeResponse[] };
    return data.items;
  }
}

/** Returns a real vault if SKYYFLOW_VAULT_URL + SKYYFLOW_ACCESS_TOKEN are set, otherwise null. */
export function realVaultFromEnv(env: NodeJS.ProcessEnv = process.env): RealSkyyflowVault | null {
  const baseUrl = env.SKYYFLOW_VAULT_URL;
  const accessToken = env.SKYYFLOW_ACCESS_TOKEN;
  const vaultId = env.SKYYFLOW_VAULT_ID;
  if (!baseUrl || !accessToken || !vaultId) {
    return null;
  }
  return new RealSkyyflowVault({ baseUrl, accessToken, vaultId });
}
