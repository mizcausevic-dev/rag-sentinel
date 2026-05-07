export type IncidentCategory =
  | 'chunk-quality'
  | 'freshness'
  | 'retrieval-drift'
  | 'hallucination'
  | 'pii-leak'
  | 'orphaned-chunks';

export type IncidentSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface RagIncident {
  incidentId: string;
  collectionId: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  message: string;
  detectedAt: string;
  status: 'open' | 'acknowledged' | 'resolved';
  assignedTo: string;
}

export const incidents: RagIncident[] = [
  {
    incidentId: 'rag_inc_001',
    collectionId: 'col_legacy_wiki',
    category: 'freshness',
    severity: 'high',
    message: 'Stale ratio at 62%; 312 orphaned chunks; collection unsafe for production retrieval.',
    detectedAt: '2026-05-07T08:00:00Z',
    status: 'open',
    assignedTo: 'platform-ops',
  },
  {
    incidentId: 'rag_inc_002',
    collectionId: 'col_legacy_wiki',
    category: 'pii-leak',
    severity: 'critical',
    message: '28 chunks contain credit-card or SSN-like patterns; chunks must be redacted before serving.',
    detectedAt: '2026-05-07T07:30:00Z',
    status: 'open',
    assignedTo: 'platform-ops',
  },
  {
    incidentId: 'rag_inc_003',
    collectionId: 'col_engineering_docs',
    category: 'pii-leak',
    severity: 'high',
    message: '12 chunks contain API key patterns; remove credentials from indexed documentation.',
    detectedAt: '2026-05-06T15:20:00Z',
    status: 'acknowledged',
    assignedTo: 'devx',
  },
  {
    incidentId: 'rag_inc_004',
    collectionId: 'col_legacy_wiki',
    category: 'hallucination',
    severity: 'high',
    message: 'Citation coverage 44% across 4200 queries; answers regularly cite content not in retrieval.',
    detectedAt: '2026-05-05T11:00:00Z',
    status: 'open',
    assignedTo: 'platform-ops',
  },
  {
    incidentId: 'rag_inc_005',
    collectionId: 'col_finance_reports',
    category: 'pii-leak',
    severity: 'medium',
    message: '8 chunks contain phone or email patterns; review before promoting to production.',
    detectedAt: '2026-05-06T09:45:00Z',
    status: 'acknowledged',
    assignedTo: 'finance-eng',
  },
  {
    incidentId: 'rag_inc_006',
    collectionId: 'col_engineering_docs',
    category: 'orphaned-chunks',
    severity: 'medium',
    message: '45 chunks reference deleted source documents; queue reindex.',
    detectedAt: '2026-05-04T14:00:00Z',
    status: 'acknowledged',
    assignedTo: 'devx',
  },
  {
    incidentId: 'rag_inc_007',
    collectionId: 'col_support_kb',
    category: 'retrieval-drift',
    severity: 'low',
    message: 'Top-K overlap dropped from 92% to 86% over 30 days; trend monitoring active.',
    detectedAt: '2026-05-02T18:00:00Z',
    status: 'resolved',
    assignedTo: 'support-eng',
  },
  {
    incidentId: 'rag_inc_008',
    collectionId: 'col_legacy_wiki',
    category: 'chunk-quality',
    severity: 'medium',
    message: 'Average chunk score 52/100; fixed-512 chunking respects boundaries on only 58% of chunks.',
    detectedAt: '2026-05-01T10:00:00Z',
    status: 'open',
    assignedTo: 'platform-ops',
  },
];
