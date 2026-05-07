// Hallucination signal detection for RAG answers.
// Heuristic-based grounding analysis — checks citation coverage, source-claim
// alignment, ungrounded number/date generation, and refusal patterns.

export interface AnswerCitation {
  sourceId: string;
  quote: string;
}

export interface RetrievedSource {
  sourceId: string;
  text: string;
}

export interface AnswerPayload {
  answerText: string;
  citationsClaimed: AnswerCitation[];
  retrievedSources: RetrievedSource[];
  refusalReasons?: string[];
}

export interface HallucinationResult {
  groundingScore: number;
  citationCoverage: number; // % of substantive claims with attribution
  signals: string[];
  passedChecks: string[];
  unsupportedCitations: AnswerCitation[];
  recommendedNextAction: string;
}

const QUOTE_MATCH_PREFIX_LEN = 30;

export function evaluateAnswer(payload: AnswerPayload): HallucinationResult {
  const signals: string[] = [];
  const passedChecks: string[] = [];
  let groundingScore = 100;

  // Refusal handling — refusing because no relevant sources is a positive signal
  if (payload.refusalReasons && payload.refusalReasons.length > 0) {
    passedChecks.push(`Model refused with stated reasons: ${payload.refusalReasons.join(', ')}.`);
    return {
      groundingScore: 100,
      citationCoverage: 100,
      signals: [],
      passedChecks,
      unsupportedCitations: [],
      recommendedNextAction: 'Refusal is correctly grounded; no action required.',
    };
  }

  // Substantive claim count — sentences > 10 chars that aren't questions
  const sentences = payload.answerText
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  // Citation coverage
  const citationCount = payload.citationsClaimed?.length ?? 0;
  const citationCoverage = sentences.length === 0
    ? 100
    : Math.min(100, Math.round((citationCount / sentences.length) * 100));

  if (citationCoverage < 30) {
    signals.push(`Very low citation coverage: ${citationCoverage}% of claims attributed.`);
    groundingScore -= 35;
  } else if (citationCoverage < 60) {
    signals.push(`Moderate citation coverage: ${citationCoverage}% of claims attributed.`);
    groundingScore -= 15;
  } else {
    passedChecks.push(`Citation coverage ${citationCoverage}% above 60% threshold.`);
  }

  // Source-claim alignment — quoted snippets must actually appear in retrieved sources
  const unsupportedCitations: AnswerCitation[] = [];
  for (const citation of payload.citationsClaimed || []) {
    const source = payload.retrievedSources.find((s) => s.sourceId === citation.sourceId);
    if (!source) {
      unsupportedCitations.push(citation);
      continue;
    }
    const haystack = source.text.toLowerCase();
    const needle = citation.quote.toLowerCase().slice(0, QUOTE_MATCH_PREFIX_LEN);
    if (needle.length >= 10 && !haystack.includes(needle)) {
      unsupportedCitations.push(citation);
    }
  }
  if (unsupportedCitations.length > 0) {
    signals.push(`${unsupportedCitations.length} citation(s) reference content not in retrieved sources.`);
    groundingScore -= 30 * Math.min(unsupportedCitations.length, 3);
  } else if ((payload.citationsClaimed || []).length > 0) {
    passedChecks.push('All claimed citations match retrieved source text.');
  }

  // Ungrounded numbers/dates — specific years, percentages, dollar amounts not in any source
  const numericClaims = payload.answerText.match(/\b(?:19|20)\d{2}\b|\$[\d,]+(?:\.\d+)?[KMBkmb]?|\b\d+(?:\.\d+)?%/g) || [];
  const allSourceText = payload.retrievedSources.map((s) => s.text).join(' ').toLowerCase();
  const ungroundedNumerics = numericClaims.filter(
    (n) => !allSourceText.includes(n.toLowerCase())
  );
  if (ungroundedNumerics.length > 0) {
    signals.push(
      `${ungroundedNumerics.length} numeric/date claim(s) not present in retrieved sources: ${ungroundedNumerics.slice(0, 3).join(', ')}.`
    );
    groundingScore -= 10 * Math.min(ungroundedNumerics.length, 3);
  }

  // Empty retrieval but non-refusal answer — should have refused
  if (payload.retrievedSources.length === 0 && payload.answerText.length > 50) {
    signals.push('Answer generated despite empty retrieval set; high hallucination risk.');
    groundingScore -= 40;
  }

  groundingScore = Math.max(0, Math.min(100, groundingScore));

  let recommendedNextAction: string;
  if (groundingScore >= 80) {
    recommendedNextAction = 'Answer well-grounded; no remediation required.';
  } else if (groundingScore >= 55) {
    recommendedNextAction = 'Flag for human review; tighten citation requirement in prompt.';
  } else {
    recommendedNextAction = 'Block answer from production output; investigate retrieval quality and prompt grounding instructions.';
  }

  return {
    groundingScore,
    citationCoverage,
    signals,
    passedChecks,
    unsupportedCitations,
    recommendedNextAction,
  };
}
