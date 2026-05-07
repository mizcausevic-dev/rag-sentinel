// Composite posture scoring per RAG collection — rolls all five governance
// areas (chunk quality, freshness, drift, hallucination, PII) into a single
// operator-friendly score with override logic for critical signals.

import type { RagCollection } from '../data/collections';

export type CollectionPostureStatus = 'production-ready' | 'review' | 'degraded' | 'blocked';

export interface CollectionPosture {
  collectionId: string;
  name: string;
  domain: string;
  owner: string;
  ownerTeam: string;
  environment: string;
  composite: {
    overall: number;
    chunkQuality: number;
    freshness: number;
    retrievalDrift: number;
    hallucination: number;
    sensitiveContent: number;
  };
  status: CollectionPostureStatus;
  signals: {
    orphanedChunks: number;
    piiIncidents: number;
    citationCoverage: number;
    staleRatio: number;
    contradictionRate: number;
  };
  recommendedNextAction: string;
}

const WEIGHTS = {
  sensitiveContent: 0.25,
  hallucination: 0.25,
  freshness: 0.20,
  chunkQuality: 0.15,
  retrievalDrift: 0.15,
};

export function evaluateCollection(collection: RagCollection): CollectionPosture {
  const m = collection.metrics;
  const overall = Math.round(
    m.sensitiveContentScore * WEIGHTS.sensitiveContent +
    m.hallucinationScore * WEIGHTS.hallucination +
    m.freshnessScore * WEIGHTS.freshness +
    m.chunkQualityScore * WEIGHTS.chunkQuality +
    m.retrievalDriftScore * WEIGHTS.retrievalDrift
  );

  const signals = {
    orphanedChunks: m.orphanedChunks,
    piiIncidents: m.piiIncidents,
    citationCoverage: m.citationCoverage,
    staleRatio: m.staleRatio,
    contradictionRate: m.contradictionRate,
  };

  // Override logic — single critical signal forces blocked status regardless of composite
  const hasPiiCrisis = m.piiIncidents >= 20 || m.sensitiveContentScore < 60;
  const hasFreshnessCrisis = m.staleRatio >= 0.5;
  const hasHallucinationCrisis = m.hallucinationScore < 60 || m.citationCoverage < 50;

  let status: CollectionPostureStatus;
  let recommendedNextAction: string;

  if (hasPiiCrisis) {
    status = 'blocked';
    recommendedNextAction = 'Block from production retrieval; engage security team for chunk-level redaction sweep.';
  } else if (collection.environment === 'production' && (hasFreshnessCrisis || hasHallucinationCrisis)) {
    status = 'blocked';
    recommendedNextAction = hasFreshnessCrisis
      ? 'Block from production until staleness remediated; freshness score below tolerance for live answers.'
      : 'Block from production until citation coverage and grounding are improved.';
  } else if (overall >= 85) {
    status = 'production-ready';
    recommendedNextAction = 'Continue scheduled audits at default cadence.';
  } else if (overall >= 70) {
    status = 'review';
    recommendedNextAction = 'Open weekly review with content owners; monitor trend.';
  } else {
    status = 'degraded';
    recommendedNextAction = 'Open incident with content owner; remediation review within 7 days.';
  }

  return {
    collectionId: collection.collectionId,
    name: collection.name,
    domain: collection.domain,
    owner: collection.owner,
    ownerTeam: collection.ownerTeam,
    environment: collection.environment,
    composite: {
      overall,
      chunkQuality: m.chunkQualityScore,
      freshness: m.freshnessScore,
      retrievalDrift: m.retrievalDriftScore,
      hallucination: m.hallucinationScore,
      sensitiveContent: m.sensitiveContentScore,
    },
    status,
    signals,
    recommendedNextAction,
  };
}

export interface FleetPostureSummary {
  totalCollections: number;
  productionReady: number;
  review: number;
  degraded: number;
  blocked: number;
  averageComposite: number;
  productionAtRisk: number;
  totalChunksUnderManagement: number;
  totalPiiIncidents: number;
}

export function buildFleetPosture(collections: RagCollection[]): {
  summary: FleetPostureSummary;
  collections: CollectionPosture[];
} {
  const evaluated = collections.map(evaluateCollection);

  const productionReady = evaluated.filter((c) => c.status === 'production-ready').length;
  const review = evaluated.filter((c) => c.status === 'review').length;
  const degraded = evaluated.filter((c) => c.status === 'degraded').length;
  const blocked = evaluated.filter((c) => c.status === 'blocked').length;

  const averageComposite = evaluated.length === 0
    ? 0
    : Math.round(evaluated.reduce((s, c) => s + c.composite.overall, 0) / evaluated.length);

  const productionAtRisk = evaluated.filter(
    (c) => c.environment === 'production' && (c.status === 'degraded' || c.status === 'blocked')
  ).length;

  const totalChunksUnderManagement = collections.reduce((s, c) => s + c.totalChunks, 0);
  const totalPiiIncidents = collections.reduce((s, c) => s + c.metrics.piiIncidents, 0);

  return {
    summary: {
      totalCollections: evaluated.length,
      productionReady,
      review,
      degraded,
      blocked,
      averageComposite,
      productionAtRisk,
      totalChunksUnderManagement,
      totalPiiIncidents,
    },
    collections: evaluated,
  };
}
