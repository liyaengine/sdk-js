import type { HttpClient } from '../http.js';

/**
 * Knowledge gaps: the questions the assistant could not answer confidently. Mirrors `/v1/knowledge/gaps` (see openapi.yaml), served by the
 * same handlers as the dashboard's Gap queue. Secret API keys only.
 *
 * The loop this supports: `list()` the gaps, `draftArticle()` from a topic, have a person read the draft beside its sources, publish it with
 * `documents.push()`, then `checkCoverage()` to see whether the questions are now answered before you mark anything resolved.
 */

export interface KnowledgeGap {
  id: string;
  query: string;
  confidence_score: number | null;
  /** The topic the question was grouped under; null when it was not classified. */
  intent: string | null;
  ticket_id: string | null;
  resolved: boolean;
  created_at: string;
}

export interface KnowledgeGapList {
  total: number;
  /** Topics, busiest first, each with a few sample questions. Unclassified gaps are under "unclassified". */
  by_intent: Array<{ intent: string; count: number; queries: string[] }>;
  items: KnowledgeGap[];
  [key: string]: unknown;
}

export interface ListGapsInput {
  /** 7, 30 or 90. Default 30. */
  days?: 7 | 30 | 90;
  /** Closed gaps instead of open ones. */
  resolved?: boolean;
}

export interface GapDraftSource {
  id: string;
  kind: 'staff_reply' | 'document';
  label: string;
  excerpt: string;
}

/** A draft help article from open gaps (`gaps.draftArticle`). Nothing is saved or published. */
export interface GapArticleDraft {
  title: string;
  /** Every statement cites at least one source, and every number in it appears in a cited source. */
  statements: Array<{ text: string; sources: string[] }>;
  /** The statements as paragraphs with no citations, ready to edit and publish. */
  body_markdown: string;
  /** What the questions asked that no source answers. A person supplies these. */
  missing: string[];
  sources: GapDraftSource[];
  questions: string[];
  gap_ids: string[];
  /** Statements the model wrote that were dropped because no source supports them. */
  dropped_unsupported: number;
  /** `NO_SOURCES` when there was nothing on record to write from: no model was called. */
  reason: 'NO_SOURCES' | null;
  usage: { tokens: number; cost: number; served_by: 'platform' | 'byok' } | null;
}

export interface DraftArticleInput {
  /** Up to 25 gap ids. */
  gapIds?: string[];
  /** Or a topic (the `intent` of a gap); `null` for unclassified gaps. */
  intent?: string | null;
}

export interface GapCoverageResult {
  gapId: string;
  query: string;
  /** False when retrieval failed for this question: it is neither answered nor unanswered. */
  checked: boolean;
  answered: boolean;
  topSimilarity: number | null;
  topSource: string | null;
}

export interface GapCoverage {
  checked: number;
  answered: number;
  notChecked: number;
  /** The bar a passage must clear: the assistant's own. */
  minSimilarity: number;
  results: GapCoverageResult[];
}

interface WireCoverage {
  checked: number;
  answered: number;
  not_checked: number;
  min_similarity: number;
  results: Array<{ gap_id: string; query: string; checked: boolean; answered: boolean; top_similarity: number | null; top_source: string | null }>;
}

/** A draft is a model call and a coverage check runs a retrieval per question, so both wait longer than the default and are never retried. */
const LONG_MS = 120_000;

export class GapsResource {
  constructor(private readonly http: HttpClient) {}

  /** Open gaps (or closed, with `resolved: true`), with a per-topic summary. */
  list(input: ListGapsInput = {}): Promise<KnowledgeGapList> {
    const params = new URLSearchParams();
    if (input.days !== undefined) params.set('days', String(input.days));
    if (input.resolved !== undefined) params.set('resolved', String(input.resolved));
    const qs = params.toString();
    return this.http.get<KnowledgeGapList>(`/v1/knowledge/gaps${qs ? `?${qs}` : ''}`);
  }

  /**
   * Draft a help article from open gaps, written only from replies your own staff wrote in the same conversations and the nearest
   * documents retrieval found. Statements with no real source, or a number no source states, are dropped. Calls a model and is metered;
   * not retried, so a failure never bills twice. A person should read the draft beside `sources` before publishing: a statement can cite
   * a real source and still misread it. Throws 404 `GAPS_NOT_FOUND`, 429 `QUOTA_EXCEEDED` or 502 `DRAFT_UNAVAILABLE`.
   */
  async draftArticle(input: DraftArticleInput): Promise<GapArticleDraft> {
    const body: Record<string, unknown> = {};
    if (input.gapIds) body.gap_ids = input.gapIds;
    if (input.intent !== undefined) body.intent = input.intent;
    const { draft } = await this.http.postLongRunning<{ draft: GapArticleDraft }>('/v1/knowledge/gaps/draft-article', body, LONG_MS);
    return draft;
  }

  /**
   * Whether each question now finds an answer, using the assistant's own retrieval and relevance bar. Run it after publishing, so a gap is
   * closed because the knowledge base answers it. It does not read the passage, so it cannot tell one that answers from one that is only
   * about the topic.
   */
  async checkCoverage(gapIds: string[]): Promise<GapCoverage> {
    const { coverage } = await this.http.postLongRunning<{ coverage: WireCoverage }>('/v1/knowledge/gaps/check-coverage', { gap_ids: gapIds }, LONG_MS);
    return {
      checked: coverage.checked,
      answered: coverage.answered,
      notChecked: coverage.not_checked,
      minSimilarity: coverage.min_similarity,
      results: coverage.results.map(r => ({ gapId: r.gap_id, query: r.query, checked: r.checked, answered: r.answered, topSimilarity: r.top_similarity, topSource: r.top_source })),
    };
  }
}
