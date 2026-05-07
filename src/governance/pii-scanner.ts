// PII and sensitive content scanner for RAG indexed content.
// Catches leakage of credentials, identity numbers, financial data, and private
// keys before they end up in retrieval results.

export type PiiSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface PiiPattern {
  name: string;
  severity: PiiSeverity;
  regex: RegExp;
  description: string;
}

const PATTERNS: PiiPattern[] = [
  { name: 'private-key-block', severity: 'critical', regex: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/i, description: 'Private key block detected.' },
  { name: 'api-key-prefix', severity: 'critical', regex: /\b(?:sk|pk|api|sk-proj|sk-live|sk-test)[-_][A-Za-z0-9]{20,}/i, description: 'API/secret key with conventional prefix detected.' },
  { name: 'aws-access-key', severity: 'critical', regex: /\bAKIA[0-9A-Z]{16}\b/, description: 'AWS access key ID pattern detected.' },
  { name: 'jwt-token', severity: 'high', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, description: 'JWT token pattern detected.' },
  { name: 'ssn-us', severity: 'high', regex: /\b\d{3}-\d{2}-\d{4}\b/, description: 'SSN-like pattern detected.' },
  { name: 'credit-card', severity: 'high', regex: /\b(?:\d{4}[- ]?){3}\d{4}\b/, description: 'Credit card number pattern detected.' },
  { name: 'iban', severity: 'high', regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{12,28}\b/, description: 'IBAN pattern detected.' },
  { name: 'us-phone', severity: 'low', regex: /\b\(\d{3}\)\s*\d{3}-\d{4}\b/, description: 'US phone number pattern detected.' },
  { name: 'email', severity: 'low', regex: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/, description: 'Email address detected.' },
];

export interface PiiHit {
  patternName: string;
  severity: PiiSeverity;
  description: string;
  matchedSnippet: string;
}

export interface PiiScanResult {
  chunkId: string;
  hits: PiiHit[];
  highestSeverity: PiiSeverity | null;
  shouldBlock: boolean;
}

const SNIPPET_LEN = 24;
const SEVERITY_RANK: Record<PiiSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function redact(snippet: string): string {
  if (snippet.length <= 6) return '****';
  const head = snippet.slice(0, 4);
  const tail = snippet.slice(-2);
  return `${head}****${tail}`;
}

export function scanChunk(chunkId: string, text: string): PiiScanResult {
  const hits: PiiHit[] = [];
  let highestSeverity: PiiSeverity | null = null;

  for (const p of PATTERNS) {
    const match = text.match(p.regex);
    if (match) {
      const matched = match[0];
      const snippet = matched.slice(0, SNIPPET_LEN);
      hits.push({
        patternName: p.name,
        severity: p.severity,
        description: p.description,
        matchedSnippet: redact(snippet),
      });
      if (highestSeverity === null || SEVERITY_RANK[p.severity] > SEVERITY_RANK[highestSeverity]) {
        highestSeverity = p.severity;
      }
    }
  }

  // Block decision — critical or high severity hits should not be served
  const shouldBlock = highestSeverity === 'critical' || highestSeverity === 'high';

  return { chunkId, hits, highestSeverity, shouldBlock };
}

export interface BatchPiiResult {
  totalChunks: number;
  flaggedChunks: number;
  blockedChunks: number;
  hitsBySeverity: Record<PiiSeverity, number>;
  hitsByPattern: Record<string, number>;
  perChunk: PiiScanResult[];
}

export function scanBatch(chunks: { chunkId: string; text: string }[]): BatchPiiResult {
  const perChunk = chunks.map((c) => scanChunk(c.chunkId, c.text));
  const hitsBySeverity: Record<PiiSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  const hitsByPattern: Record<string, number> = {};

  let flaggedChunks = 0;
  let blockedChunks = 0;
  for (const result of perChunk) {
    if (result.hits.length > 0) flaggedChunks++;
    if (result.shouldBlock) blockedChunks++;
    for (const hit of result.hits) {
      hitsBySeverity[hit.severity]++;
      hitsByPattern[hit.patternName] = (hitsByPattern[hit.patternName] || 0) + 1;
    }
  }

  return {
    totalChunks: chunks.length,
    flaggedChunks,
    blockedChunks,
    hitsBySeverity,
    hitsByPattern,
    perChunk,
  };
}
