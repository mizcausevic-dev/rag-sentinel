// Skyyflow vault interface — vendor-neutral token vault for PII fields detected
// by the rag-sentinel PII scanner. Implementations: MockVault (opt-in,
// in-memory, deterministic — for tests and local demos), RealVault (HTTP
// adapter to a hosted Skyyflow vault, env-gated on SKYYFLOW_VAULT_URL).
//
// Both implementations satisfy the same Decision-Card-driven contract:
// (a) tokenize() replaces raw PII values with opaque tokens before they leave
//     the rag-sentinel process; tokens are what gets persisted in the vector
//     store. No vector-store persistence is implemented here.
// (b) detokenize() compares server-authenticated principal roles with the
//     reveal_roles list declared in the active Decision Card target. The HTTP
//     boundary rejects real-vault reveal until identity and provider policy
//     can be independently verified.

export interface TokenizeRequest {
  /** Logical field name as it appears in the Decision Card fields_authorized list. */
  field: string;
  /** Raw PII value. Callers must apply their own retention and secure-handling policy. */
  value: string;
}

export interface TokenizeResponse {
  field: string;
  /** Opaque token. Implementation-defined shape; treat as a string identifier. */
  token: string;
}

export interface DetokenizeRequest {
  field: string;
  token: string;
}

export interface DetokenizeResponse {
  field: string;
  token: string;
  /** Raw PII value, OR null if the caller's roles did not authorize reveal. */
  value: string | null;
  /** Per-token disposition for the auditor. */
  disposition: 'revealed' | 'denied-not-authorized' | 'denied-no-such-token';
}

export interface SkyyflowVault {
  /** Provider tag — surfaces in audit-stream events; must match vendor enum from the Decision Card. */
  readonly vendor: string;
  /** Vault identifier — surfaces in audit-stream events; matches vault_id from the Decision Card. */
  readonly vaultId: string;
  tokenize(requests: TokenizeRequest[]): Promise<TokenizeResponse[]>;
  detokenize(
    requests: DetokenizeRequest[],
    options: { callerRoles: readonly string[]; revealRoles: readonly string[] }
  ): Promise<DetokenizeResponse[]>;
}
