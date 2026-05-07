import { Router } from 'express';
import { collections, findCollection } from '../data/collections';
import { incidents } from '../data/incidents';
import { evaluateCollection, buildFleetPosture } from '../governance/posture';

export const collectionsRouter = Router();

collectionsRouter.get('/', (_req, res) => {
  res.json({ collections });
});

collectionsRouter.get('/:id', (req, res) => {
  const c = findCollection(req.params.id);
  if (!c) {
    res.status(404).json({ error: `Collection ${req.params.id} not found.` });
    return;
  }
  res.json(c);
});

collectionsRouter.get('/:id/posture', (req, res) => {
  const c = findCollection(req.params.id);
  if (!c) {
    res.status(404).json({ error: `Collection ${req.params.id} not found.` });
    return;
  }
  res.json(evaluateCollection(c));
});

export const incidentsRouter = Router();

incidentsRouter.get('/', (req, res) => {
  const { collectionId, severity, status, category } = req.query;
  let filtered = incidents;
  if (collectionId) filtered = filtered.filter((i) => i.collectionId === collectionId);
  if (severity) filtered = filtered.filter((i) => i.severity === severity);
  if (status) filtered = filtered.filter((i) => i.status === status);
  if (category) filtered = filtered.filter((i) => i.category === category);
  res.json({
    total: filtered.length,
    byStatus: {
      open: filtered.filter((i) => i.status === 'open').length,
      acknowledged: filtered.filter((i) => i.status === 'acknowledged').length,
      resolved: filtered.filter((i) => i.status === 'resolved').length,
    },
    incidents: filtered,
  });
});

export const dashboardRouter = Router();

dashboardRouter.get('/summary', (_req, res) => {
  const posture = buildFleetPosture(collections);
  const openIncidents = incidents.filter((i) => i.status !== 'resolved');
  const criticalIncidents = openIncidents.filter((i) => i.severity === 'critical');

  // Top-risk collections — worst 3 by composite
  const topRisks = [...posture.collections]
    .sort((a, b) => a.composite.overall - b.composite.overall)
    .slice(0, 3);

  res.json({
    generatedAt: new Date().toISOString(),
    headline: {
      totalCollections: posture.summary.totalCollections,
      productionAtRisk: posture.summary.productionAtRisk,
      averageComposite: posture.summary.averageComposite,
      openIncidents: openIncidents.length,
      criticalIncidents: criticalIncidents.length,
      totalChunksUnderManagement: posture.summary.totalChunksUnderManagement,
      totalPiiIncidents: posture.summary.totalPiiIncidents,
    },
    fleetSummary: posture.summary,
    topRisks,
    recentCriticalIncidents: criticalIncidents.slice(0, 5),
  });
});
