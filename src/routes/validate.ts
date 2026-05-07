import { Router } from 'express';
import { ChunkBatchSchema, FreshnessAuditSchema, DriftCheckSchema, AnswerEvaluationSchema, PiiScanSchema } from '../schemas/validation-schemas';
import { scoreChunkBatch } from '../governance/chunk-quality';
import { auditFreshness } from '../governance/freshness';
import { detectDrift } from '../governance/retrieval-drift';
import { evaluateAnswer } from '../governance/hallucination';
import { scanBatch } from '../governance/pii-scanner';

export const validateRouter = Router();

validateRouter.post('/chunks', (req, res) => {
  const parsed = ChunkBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });
    return;
  }
  res.json(scoreChunkBatch(parsed.data.chunks));
});

validateRouter.post('/freshness', (req, res) => {
  const parsed = FreshnessAuditSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });
    return;
  }
  res.json(auditFreshness(parsed.data.sources, parsed.data.collectionId ?? null));
});

validateRouter.post('/drift', (req, res) => {
  const parsed = DriftCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });
    return;
  }
  try {
    res.json(detectDrift(parsed.data.baseline, parsed.data.current));
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

validateRouter.post('/answer', (req, res) => {
  const parsed = AnswerEvaluationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });
    return;
  }
  res.json(evaluateAnswer(parsed.data));
});

validateRouter.post('/pii-scan', (req, res) => {
  const parsed = PiiScanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });
    return;
  }
  res.json(scanBatch(parsed.data.chunks));
});
