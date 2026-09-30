// Tokenize-before-index primitive. The existing PII scanner finds raw PII in a
// chunk and currently BLOCKS those chunks from being indexed. With a vault in
// the loop, we tokenize matches instead — the chunk text gets rewritten with
// opaque tokens in place of raw PII, and the rewritten chunk is what flows
// into a vector store only after operator review. Heuristic matching can miss
// sensitive data, and this module does not persist or erase the original text.

import { scanChunk, type PiiHit } from './pii-scanner';
import type { ParsedVaultTarget } from '../vault/decision-card';
import type { SkyyflowVault } from '../vault/types';

export interface VaultedSubstitution {
  /** Pattern name from the PII scanner — 'email', 'us-phone', 'ssn-us', etc. */
  patternName: string;
  /** Token issued by the vault for this PII value. Persists alongside the chunk. */
  token: string;
  /** Decision Card field name this substitution was authorized under. */
  field: string;
}

export interface VaultChunkResult {
  chunkId: string;
  /** Candidate text after detected, authorized PII is tokenized; null when blocked. Requires review before indexing. */
  vaultedText: string | null;
  /** Per-substitution preview data. Persistence and audit controls are not implemented here. */
  substitutions: VaultedSubstitution[];
  /** PII patterns that fired but no field in the Decision Card matched — these still block. */
  unauthorizedHits: PiiHit[];
  /** True when any recognized sensitive value remains and the chunk must not be indexed. */
  shouldBlock: boolean;
}

/** Maps PII scanner pattern names to the canonical Decision Card field names. */
const PATTERN_TO_FIELD: Record<string, string> = {
  email: 'email',
  'us-phone': 'phone',
  'ssn-us': 'ssn',
  'credit-card': 'credit_card',
  iban: 'iban',
  // The next three are credentials, not PII — they should still block, never
  // tokenize. Listed here for completeness; they intentionally do not map.
  // 'private-key-block', 'api-key-prefix', 'aws-access-key', 'jwt-token'
};

function fieldsAuthorized(target: ParsedVaultTarget): Set<string> {
  return new Set(target.fieldsAuthorized);
}

export async function vaultChunk(
  chunkId: string,
  text: string,
  target: ParsedVaultTarget,
  vault: SkyyflowVault
): Promise<VaultChunkResult> {
  const scan = scanChunk(chunkId, text);
  const allowed = fieldsAuthorized(target);

  // Separate hits into (a) tokenize-able vs (b) still-block credentials/auth secrets.
  const tokenizable: { hit: PiiHit; field: string; raw: string }[] = [];
  const unauthorized: PiiHit[] = [];

  for (const hit of scan.hits) {
    const field = PATTERN_TO_FIELD[hit.patternName];
    if (!field || !allowed.has(field)) {
      unauthorized.push(hit);
      continue;
    }
    // Re-extract the raw match from the original text because the scanner
    // redacts in PiiHit.matchedSnippet for safety.
    // The scanner's regexes are case-insensitive in some cases; we re-run the
    // SAME pattern from the scanner's PATTERNS list. To keep this module
    // self-contained without re-importing PATTERNS, we use a per-pattern map.
    const matches = extractRawMatches(hit.patternName, text);
    if (matches.length > 0) {
      for (const raw of new Set(matches)) tokenizable.push({ hit, field, raw });
    } else {
      unauthorized.push(hit);
    }
  }

  // A rejected chunk has no indexable candidate. Avoid sending even its
  // authorized matches to a real vault when another recognized field blocks it.
  if (unauthorized.length > 0) {
    return { chunkId, vaultedText: null, substitutions: [], unauthorizedHits: unauthorized, shouldBlock: true };
  }

  if (tokenizable.length === 0) {
    const shouldBlock = unauthorized.length > 0 || scan.shouldBlock;
    return {
      chunkId,
      vaultedText: shouldBlock ? null : text,
      substitutions: [],
      unauthorizedHits: unauthorized,
      shouldBlock,
    };
  }

  const tokens = await vault.tokenize(
    tokenizable.map(({ field, raw }) => ({ field, value: raw }))
  );
  if (tokens.length !== tokenizable.length) {
    throw new Error('Vault returned a different number of tokens than requested.');
  }

  let vaultedText = text;
  const substitutions: VaultedSubstitution[] = [];
  for (let i = 0; i < tokenizable.length; i++) {
    const { hit, raw } = tokenizable[i];
    const { token, field } = tokens[i];
    if (field !== tokenizable[i].field || typeof token !== 'string' || token.length === 0) {
      throw new Error('Vault returned an invalid token response.');
    }
    vaultedText = vaultedText.split(raw).join(token);
    substitutions.push({ patternName: hit.patternName, token, field });
  }

  // Any recognized residual sensitive value blocks the candidate. A false
  // value does not prove that unrecognized sensitive content is absent.
  const residual = scanChunk(chunkId, vaultedText);
  const shouldBlock = unauthorized.length > 0 || residual.hits.length > 0;

  return {
    chunkId,
    vaultedText: shouldBlock ? null : vaultedText,
    substitutions,
    unauthorizedHits: unauthorized,
    shouldBlock,
  };
}

// Per-pattern raw extractor — same regexes as the scanner but without the
// redaction step. We keep this in vault-chunk so the scanner's redact-on-hit
// contract isn't broken.
function extractRawMatches(patternName: string, text: string): string[] {
  const re = RAW_PATTERNS[patternName];
  if (!re) return [];
  return [...text.matchAll(re)].map((m) => m[0]);
}

const RAW_PATTERNS: Record<string, RegExp> = {
  email: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g,
  'us-phone': /(?<!\w)\(\d{3}\)\s*\d{3}-\d{4}\b/g,
  'ssn-us': /\b\d{3}-\d{2}-\d{4}\b/g,
  'credit-card': /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
  iban: /\b[A-Z]{2}\d{2}[A-Z0-9]{12,28}\b/g,
};
