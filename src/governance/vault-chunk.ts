// Tokenize-before-index primitive. The existing PII scanner finds raw PII in a
// chunk and currently BLOCKS those chunks from being indexed. With a vault in
// the loop, we tokenize matches instead — the chunk text gets rewritten with
// opaque tokens in place of raw PII, and the rewritten chunk is what flows
// into the vector store. The embedding stays semantically valid; the vendor
// (or attacker who reads the vector store) never sees raw PII.

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
  /** Original text with PII matches replaced by their tokens. Safe to embed and persist. */
  vaultedText: string;
  /** Per-substitution audit trail. Persist alongside the chunk so detokenize can replay it. */
  substitutions: VaultedSubstitution[];
  /** PII patterns that fired but no field in the Decision Card matched — these still block. */
  unauthorizedHits: PiiHit[];
  /** True when the chunk had unauthorized critical/high PII and should still NOT be indexed. */
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
  return new Set(target.fieldsAuthorized.map((f) => f.split('.').pop() ?? f));
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
    const raw = extractRawMatch(hit.patternName, text);
    if (raw) {
      tokenizable.push({ hit, field, raw });
    } else {
      unauthorized.push(hit);
    }
  }

  if (tokenizable.length === 0) {
    return {
      chunkId,
      vaultedText: text,
      substitutions: [],
      unauthorizedHits: unauthorized,
      shouldBlock: unauthorized.length > 0 && scan.shouldBlock,
    };
  }

  const tokens = await vault.tokenize(
    tokenizable.map(({ field, raw }) => ({ field, value: raw }))
  );

  let vaultedText = text;
  const substitutions: VaultedSubstitution[] = [];
  for (let i = 0; i < tokenizable.length; i++) {
    const { hit, raw } = tokenizable[i];
    const { token, field } = tokens[i];
    vaultedText = vaultedText.split(raw).join(token);
    substitutions.push({ patternName: hit.patternName, token, field });
  }

  // After tokenization, ANY remaining hits are unauthorized + still credentials/auth.
  // If those are critical/high we still block; if only tokenizable PII existed, the
  // chunk is now safe to index.
  const shouldBlock = unauthorized.some((h) => h.severity === 'critical' || h.severity === 'high');

  return {
    chunkId,
    vaultedText,
    substitutions,
    unauthorizedHits: unauthorized,
    shouldBlock,
  };
}

// Per-pattern raw extractor — same regexes as the scanner but without the
// redaction step. We keep this in vault-chunk so the scanner's redact-on-hit
// contract isn't broken.
function extractRawMatch(patternName: string, text: string): string | null {
  const re = RAW_PATTERNS[patternName];
  if (!re) return null;
  const m = text.match(re);
  return m ? m[0] : null;
}

const RAW_PATTERNS: Record<string, RegExp> = {
  email: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/,
  'us-phone': /\b\(\d{3}\)\s*\d{3}-\d{4}\b/,
  'ssn-us': /\b\d{3}-\d{2}-\d{4}\b/,
  'credit-card': /\b(?:\d{4}[- ]?){3}\d{4}\b/,
  iban: /\b[A-Z]{2}\d{2}[A-Z0-9]{12,28}\b/,
};
