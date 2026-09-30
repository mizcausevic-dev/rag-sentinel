// Minimal Decision Card v0.1-v0.3 parser — extracts the bits rag-sentinel needs
// from a buyer-published AI Procurement Decision Card document. Spec:
// https://github.com/mizcausevic-dev/ai-procurement-decision-spec
//
// rag-sentinel does NOT validate the whole Decision Card schema here. The
// authoritative validator is the spec repo's CI + the (forthcoming v0.2.0)
// kg-validate-action. This parser just makes the data_vault_targets[] usable
// at runtime — the rest of the Decision Card is opaque to the vault path.

export interface ParsedVaultTarget {
  vendor: string;
  vaultId: string | null;
  vaultUrl: string | null;
  fieldsAuthorized: string[];
  revealRoles: string[];
  revealAuditUri: string | null;
  expiresAt: string | null;
}

export interface ParsedDecisionCard {
  decisionId: string;
  version: string;
  decisionStatus: string | null;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  vaultTargets: ParsedVaultTarget[];
}

export class InvalidDecisionCardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDecisionCardError';
  }
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidDecisionCardError(`${field} must be a non-empty string.`);
  }
  return value;
}

function asStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || v.length === 0)) {
    throw new InvalidDecisionCardError(`${field} must be an array of non-empty strings.`);
  }
  return value as string[];
}

export function parseDecisionCard(raw: unknown): ParsedDecisionCard {
  if (!raw || typeof raw !== 'object') {
    throw new InvalidDecisionCardError('Decision Card document must be a JSON object.');
  }
  const doc = raw as Record<string, unknown>;
  const version = asString(doc.decision_card_version, 'decision_card_version');
  if (version !== '0.1' && version !== '0.2' && version !== '0.3') {
    throw new InvalidDecisionCardError(`decision_card_version "${version}" is not supported. Expected "0.1", "0.2", or "0.3".`);
  }
  const decisionId = asString(doc.decision_id, 'decision_id');
  const decision = doc.decision && typeof doc.decision === 'object' ? doc.decision as Record<string, unknown> : {};
  const decisionStatus = typeof decision.status === 'string' ? decision.status : null;
  const effectiveFrom = typeof decision.effective_from === 'string' ? decision.effective_from : null;
  const effectiveUntil = typeof decision.effective_until === 'string' ? decision.effective_until : null;

  const rawTargets = doc.data_vault_targets;
  if (rawTargets === undefined) {
    return { decisionId, version, decisionStatus, effectiveFrom, effectiveUntil, vaultTargets: [] };
  }
  if (!Array.isArray(rawTargets)) {
    throw new InvalidDecisionCardError('data_vault_targets must be an array.');
  }

  const vaultTargets: ParsedVaultTarget[] = rawTargets.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new InvalidDecisionCardError(`data_vault_targets[${index}] must be an object.`);
    }
    const e = entry as Record<string, unknown>;
    return {
      vendor: asString(e.vendor, `data_vault_targets[${index}].vendor`),
      vaultId: typeof e.vault_id === 'string' ? e.vault_id : null,
      vaultUrl: typeof e.vault_url === 'string' ? e.vault_url : null,
      fieldsAuthorized: asStringArray(e.fields_authorized, `data_vault_targets[${index}].fields_authorized`),
      revealRoles: Array.isArray(e.reveal_roles) ? asStringArray(e.reveal_roles, `data_vault_targets[${index}].reveal_roles`) : [],
      revealAuditUri: typeof e.reveal_audit_uri === 'string' ? e.reveal_audit_uri : null,
      expiresAt: typeof e.expires_at === 'string' ? e.expires_at : null,
    };
  });

  return { decisionId, version, decisionStatus, effectiveFrom, effectiveUntil, vaultTargets };
}

export function decisionIsActive(parsed: ParsedDecisionCard, target: ParsedVaultTarget, now = new Date()): boolean {
  // Conditions cannot be evaluated from this caller-supplied preview payload.
  if (parsed.decisionStatus !== 'approved') return false;
  const dateBoundary = (value: string, endOfDay: boolean) => Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z` : value
  );
  const begins = parsed.effectiveFrom ? dateBoundary(parsed.effectiveFrom, false) : null;
  const ends = parsed.effectiveUntil ? dateBoundary(parsed.effectiveUntil, true) : null;
  const targetEnds = target.expiresAt ? Date.parse(target.expiresAt) : null;
  if ([begins, ends, targetEnds].some((value) => value !== null && !Number.isFinite(value))) return false;
  const current = now.getTime();
  return (begins === null || current >= begins) && (ends === null || current <= ends) && (targetEnds === null || current <= targetEnds);
}

/** Pick the vault target whose vendor matches a supported vault. */
export function selectVaultTarget(
  parsed: ParsedDecisionCard,
  vendor: string
): ParsedVaultTarget | null {
  return parsed.vaultTargets.find((t) => t.vendor === vendor) ?? null;
}
