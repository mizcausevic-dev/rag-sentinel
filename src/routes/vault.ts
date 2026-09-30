// HTTP routes for the experimental Skyyflow-style vault integration:
//
//   GET  /vault/status         — surfaces whether a real or mock vault is wired
//   POST /vault/preview        — given a Decision Card v0.1-v0.3 document + sample
//                                chunks, returns the vaulted chunks + per-
//                                substitution audit so an operator can see
//                                exactly what would be tokenized before
//                                indexing real content
//   POST /vault/detokenize-preview — local mock round-trip using roles bound
//                                to the authenticated server-side principal

import { Router } from 'express';
import { MockSkyyflowVault } from '../vault/mock-vault';
import { realVaultFromEnv } from '../vault/real-vault';
import { decisionIsActive, parseDecisionCard, selectVaultTarget } from '../vault/decision-card';
import { vaultChunk } from '../governance/vault-chunk';
import type { SkyyflowVault } from '../vault/types';
import { env } from '../config/env';
import { authorizesVaultTarget, type ApiPrincipal } from '../auth/principals';

const VENDOR = 'skyyflow';
const mockVaults = new Map<string, MockSkyyflowVault>();

function mockVaultFor(principal: ApiPrincipal): MockSkyyflowVault {
  let vault = mockVaults.get(principal.tenantId);
  if (!vault) {
    vault = new MockSkyyflowVault('mock-vault-001');
    mockVaults.set(principal.tenantId, vault);
  }
  return vault;
}

// The deterministic mock is available only in explicit local demo mode.
function buildVault(principal: ApiPrincipal): { vault: SkyyflowVault; mode: 'real' | 'mock' } | { vault: null; mode: 'unconfigured' } {
  const real = realVaultFromEnv();
  if (real && env.localDemo) throw new Error('The local mock demo cannot connect to a real vault.');
  if (real) return { vault: real, mode: 'real' };
  if (env.localDemo) return { vault: mockVaultFor(principal), mode: 'mock' };
  return { vault: null, mode: 'unconfigured' };
}

export const vaultRouter = Router();

vaultRouter.get('/status', (_req, res) => {
  const principal = res.locals.principal as ApiPrincipal;
  const { mode, vault } = buildVault(principal);
  if (vault && !principal.vaultIds.includes(vault.vaultId)) {
    res.status(403).json({ error: 'The authenticated principal is not authorized for this vault.' });
    return;
  }
  res.json({
    vendor: VENDOR,
    mode,
    vaultId: vault?.vaultId ?? null,
    notes: mode === 'real'
      ? 'Real Skyyflow vault selected via SKYYFLOW_VAULT_URL.'
      : mode === 'mock' ? 'Synthetic local demo vault; never use real personal data.' : 'No real vault is configured.',
  });
});

vaultRouter.post('/preview', async (req, res) => {
  try {
    const principal = res.locals.principal as ApiPrincipal;
    const { decisionCard, chunks } = req.body ?? {};
    if (!decisionCard) {
      res.status(400).json({ error: 'Request body must include decisionCard (Decision Card v0.1-v0.3 document).' });
      return;
    }
    if (!Array.isArray(chunks) || chunks.length === 0) {
      res.status(400).json({ error: 'Request body must include chunks: [{ chunkId, text }] with at least one entry.' });
      return;
    }
    const parsed = parseDecisionCard(decisionCard);
    const target = selectVaultTarget(parsed, VENDOR);
    if (!target) {
      res.status(422).json({
        error: 'Decision Card does not declare a Skyyflow vault target.',
        decisionId: parsed.decisionId,
        availableVendors: parsed.vaultTargets.map((t) => t.vendor),
      });
      return;
    }
    if (!decisionIsActive(parsed, target)) {
      res.status(403).json({ error: 'The Decision Card does not declare an active approval for this vault target.' });
      return;
    }
    if (!principal.roles.includes('vault-tokenize') || !authorizesVaultTarget(principal, target)) {
      res.status(403).json({ error: 'The authenticated principal is not authorized for this vault and field set.' });
      return;
    }

    const { vault, mode } = buildVault(principal);
    if (!vault) {
      res.status(503).json({ error: 'A real vault is not configured for principal mode.' });
      return;
    }
    if (mode === 'mock' && env.nodeEnv === 'production') {
      res.status(503).json({ error: 'Vault preview requires a configured real vault in production.' });
      return;
    }
    if (mode === 'real' && target.vaultId !== vault.vaultId) {
      res.status(422).json({ error: 'Decision Card vault_id does not match the configured vault.' });
      return;
    }
    const results = [];
    for (const c of chunks) {
      if (!c || typeof c.chunkId !== 'string' || typeof c.text !== 'string') {
        res.status(400).json({ error: 'Each chunk must be { chunkId: string, text: string }.' });
        return;
      }
      results.push(await vaultChunk(c.chunkId, c.text, target, vault));
    }

    res.json({
      decisionId: parsed.decisionId,
      decisionCardVersion: parsed.version,
      vaultVendor: VENDOR,
      vaultMode: mode,
      vaultId: target.vaultId,
      fieldsAuthorized: target.fieldsAuthorized,
      revealRoles: target.revealRoles,
      revealAuditUri: target.revealAuditUri,
      chunks: results,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

vaultRouter.post('/detokenize-preview', async (req, res) => {
  try {
    const principal = res.locals.principal as ApiPrincipal;
    const { decisionCard, tokens } = req.body ?? {};
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'callerRoles')) {
      res.status(400).json({ error: 'callerRoles is not accepted; roles come from the authenticated principal.' });
      return;
    }
    if (!decisionCard) {
      res.status(400).json({ error: 'Request body must include decisionCard.' });
      return;
    }
    if (!Array.isArray(tokens) || tokens.length === 0) {
      res.status(400).json({ error: 'Request body must include tokens: [{ field, token }] with at least one entry.' });
      return;
    }
    const parsed = parseDecisionCard(decisionCard);
    const target = selectVaultTarget(parsed, VENDOR);
    if (!target) {
      res.status(422).json({ error: 'Decision Card does not declare a Skyyflow vault target.' });
      return;
    }
    if (!decisionIsActive(parsed, target)) {
      res.status(403).json({ error: 'The Decision Card does not declare an active approval for this vault target.' });
      return;
    }
    if (!authorizesVaultTarget(principal, target)) {
      res.status(403).json({ error: 'The authenticated principal is not authorized for this vault and field set.' });
      return;
    }

    const { vault, mode } = buildVault(principal);
    if (mode === 'real' || env.nodeEnv === 'production') {
      res.status(403).json({ error: 'Detokenization preview is limited to the local mock vault. Verified caller identity and role enforcement are required for real vault reveal.' });
      return;
    }
    if (!vault) {
      res.status(503).json({ error: 'A local mock vault is not configured.' });
      return;
    }
    const items = await vault.detokenize(tokens, {
      callerRoles: principal.roles,
      revealRoles: target.revealRoles,
    });

    res.json({
      decisionId: parsed.decisionId,
      vaultMode: mode,
      vaultId: target.vaultId,
      revealRoles: target.revealRoles,
      items,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
