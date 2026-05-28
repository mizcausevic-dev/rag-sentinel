// HTTP route for the Skyyflow vault integration. Two endpoints:
//
//   GET  /vault/status         — surfaces whether a real or mock vault is wired
//   POST /vault/preview        — given a Decision Card v0.2 document + sample
//                                chunks, returns the vaulted chunks + per-
//                                substitution audit so an operator can see
//                                exactly what would be tokenized before
//                                indexing real content
//   POST /vault/detokenize-preview — round-trip preview that calls detokenize
//                                with a supplied callerRoles list, returning
//                                per-token disposition

import { Router } from 'express';
import { MockSkyyflowVault } from '../vault/mock-vault';
import { realVaultFromEnv } from '../vault/real-vault';
import { parseDecisionCard, selectVaultTarget } from '../vault/decision-card';
import { vaultChunk } from '../governance/vault-chunk';
import type { SkyyflowVault } from '../vault/types';

const VENDOR = 'skyyflow';

// Pick the real vault if env wired; otherwise the deterministic mock.
function buildVault(): { vault: SkyyflowVault; mode: 'real' | 'mock' } {
  const real = realVaultFromEnv();
  if (real) return { vault: real, mode: 'real' };
  return { vault: new MockSkyyflowVault(), mode: 'mock' };
}

export const vaultRouter = Router();

vaultRouter.get('/status', (_req, res) => {
  const { mode, vault } = buildVault();
  res.json({
    vendor: VENDOR,
    mode,
    vaultId: vault.vaultId,
    notes: mode === 'real'
      ? 'Real Skyyflow vault selected via SKYYFLOW_VAULT_URL.'
      : 'Mock vault — deterministic in-memory tokenization. Set SKYYFLOW_VAULT_URL + SKYYFLOW_ACCESS_TOKEN + SKYYFLOW_VAULT_ID to switch to the real vault.',
  });
});

vaultRouter.post('/preview', async (req, res) => {
  try {
    const { decisionCard, chunks } = req.body ?? {};
    if (!decisionCard) {
      res.status(400).json({ error: 'Request body must include decisionCard (Decision Card v0.2 document).' });
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

    const { vault, mode } = buildVault();
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
    const { decisionCard, tokens, callerRoles } = req.body ?? {};
    if (!decisionCard) {
      res.status(400).json({ error: 'Request body must include decisionCard.' });
      return;
    }
    if (!Array.isArray(tokens) || tokens.length === 0) {
      res.status(400).json({ error: 'Request body must include tokens: [{ field, token }] with at least one entry.' });
      return;
    }
    if (!Array.isArray(callerRoles)) {
      res.status(400).json({ error: 'Request body must include callerRoles: string[].' });
      return;
    }
    const parsed = parseDecisionCard(decisionCard);
    const target = selectVaultTarget(parsed, VENDOR);
    if (!target) {
      res.status(422).json({ error: 'Decision Card does not declare a Skyyflow vault target.' });
      return;
    }

    const { vault, mode } = buildVault();
    const items = await vault.detokenize(tokens, {
      callerRoles,
      revealRoles: target.revealRoles,
    });

    res.json({
      decisionId: parsed.decisionId,
      vaultMode: mode,
      vaultId: target.vaultId,
      revealRoles: target.revealRoles,
      callerRoles,
      items,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});
