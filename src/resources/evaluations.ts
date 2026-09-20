import type { HttpClient } from '../http.js';

export interface EvalDataset {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  /** Present only on datasets.get() — the single-dataset fetch. list()/create() return a lighter shape. */
  cases?: EvalCase[];
}

export interface EvalCase {
  id: string;
  tenant_id: string;
  /** Null for an ephemeral case created inline by a run submission. */
  dataset_id: string | null;
  input: unknown;
  message: string | null;
  expected_output: unknown;
  notes: string | null;
  created_at: string;
}

export interface CreateEvalDatasetInput {
  name: string;
  description?: string;
  cases?: Array<{ input: Record<string, unknown>; message?: string; expected_output?: unknown; notes?: string }>;
}

export interface UpdateEvalDatasetInput {
  name?: string;
  description?: string | null;
}

export interface CreatedEvalDataset {
  id: string;
  name: string;
  description: string | null;
  case_count: number;
  created_at: string;
}

export interface CreateEvalCaseInput {
  input: Record<string, unknown>;
  message?: string | null;
  expected_output?: unknown;
  notes?: string | null;
}

export interface UpdateEvalCaseInput {
  input?: Record<string, unknown>;
  message?: string | null;
  expected_output?: unknown;
  notes?: string | null;
}

export interface EvalDatasetTemplate {
  id: string;
  name: string;
  description: string | null;
  case_count: number;
  example_cases: Array<{ input: unknown; message: string | null }>;
}

/** A suite binds a Dataset to one specific (domain_key, intent_key); at most one custom scorer, either kind. */
export interface EvalSuite {
  id: string;
  tenant_id: string;
  name: string;
  domain_key: string;
  intent_key: string;
  dataset_id: string;
  custom_scorer_expression: string | null;
  custom_scorer_label: string | null;
  custom_scorer_webhook_url: string | null;
  /** The webhook secret itself is never returned after initial submission — only whether one is set. */
  custom_scorer_webhook_secret_set: boolean;
  baseline_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateEvalSuiteInput {
  name: string;
  domain_key: string;
  intent_key: string;
  dataset_id: string;
  custom_scorer_expression?: string;
  custom_scorer_label?: string;
  custom_scorer_webhook_url?: string;
  /** Write-only — never returned; only custom_scorer_webhook_secret_set comes back. */
  custom_scorer_webhook_secret?: string;
}

export interface UpdateEvalSuiteInput {
  name?: string;
  dataset_id?: string;
  custom_scorer_expression?: string | null;
  custom_scorer_label?: string | null;
  custom_scorer_webhook_url?: string | null;
  custom_scorer_webhook_secret?: string | null;
}

export type EvalExecutionMode = 'liya_intent' | 'external_output';
export type EvalRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Always async — creation endpoints return this in 'pending' status; poll runs.get() for progress/results. */
export interface EvalRun {
  id: string;
  tenant_id: string;
  /** Null for an execution_mode 'external_output' run — no suite/domain/intent is involved. */
  suite_id: string | null;
  domain_key: string | null;
  intent_key: string | null;
  execution_mode: EvalExecutionMode;
  triggered_by: 'dashboard' | 'api';
  status: EvalRunStatus;
  stage: string | null;
  progress: number;
  mean_score: number | null;
  dimension_scores: Record<string, number> | null;
  cases_total: number;
  cases_passed: number;
  started_at: string;
  completed_at: string | null;
  error: string | null;
  judge_total_cost_usd: number | null;
  judge_model: string | null;
  judge_calls: number | null;
  judge_failures: number | null;
  judge_cap_reached: boolean;
  model_override: string | null;
}

export interface EvalRunDetail {
  id: string;
  status: EvalRunStatus;
  stage: string | null;
  progress: number;
  mean_score: number | null;
  dimension_scores: Record<string, number> | null;
  cases_total: number;
  cases_passed: number;
  started_at: string;
  completed_at: string | null;
  error: string | null;
  results: Array<{
    case_id: string;
    passed: boolean;
    scores: unknown[];
    latency_ms: number | null;
    error: string | null;
  }>;
}

export interface SubmitEvalRunInput {
  /** When set, every case must include case_id instead of input/expected_output — those are pulled from the stored case. */
  dataset_id?: string;
  cases: Array<{
    case_id?: string;
    input?: Record<string, unknown>;
    message?: string;
    expected_output?: unknown;
    output: string;
  }>;
  custom_scorer_expression?: string;
  custom_scorer_webhook_url?: string;
  custom_scorer_webhook_secret?: string;
}

export interface RunComparison {
  comparison: {
    run_a: Record<string, unknown>;
    run_b: Record<string, unknown>;
    score_delta: Record<string, unknown>;
    winner: string | null;
    summary: string;
  };
  run_a: Record<string, unknown>;
  run_b: Record<string, unknown>;
}

export interface PairwiseRunComparison {
  comparison: { cases_compared: number; total_cost_usd: number; unmatched_cases: number };
  run_a: Record<string, unknown>;
  run_b: Record<string, unknown>;
}

export interface EvalReview {
  id: string;
  tenant_id: string;
  run_result_id: string;
  reviewer_id: string;
  verdict: 'agree' | 'override' | 'flag';
  /** 1-5. Only meaningful when verdict is 'override'. */
  corrected_score: number | null;
  note: string | null;
  created_at: string;
}

export interface CreateEvalReviewInput {
  verdict: 'agree' | 'override' | 'flag';
  /** Required when verdict is 'override'. */
  corrected_score?: number;
  note?: string;
}

export interface ScoreEvalInput {
  input: Record<string, unknown>;
  output: string;
  expected_output?: unknown;
  message?: string;
  custom_scorer_expression?: string;
}

export interface ScoreEvalResult {
  passed: boolean;
  /** Mean of the judge's 1-5 dimension scores; null if no judge dimension was scored. */
  score: number | null;
  checks: Array<{ check_type: string; passed: boolean; judge_score?: number; judge_rationale?: string }>;
}

class EvalDatasetTemplatesResource {
  constructor(private readonly http: HttpClient) {}

  async list(): Promise<EvalDatasetTemplate[]> {
    const { templates } = await this.http.get<{ templates: EvalDatasetTemplate[] }>('/v1/evals/datasets/templates');
    return templates;
  }

  async clone(id: string): Promise<EvalDataset> {
    const { dataset } = await this.http.post<{ dataset: EvalDataset }>(`/v1/evals/datasets/templates/${encodeURIComponent(id)}/clone`);
    return dataset;
  }
}

class EvalDatasetsResource {
  readonly templates: EvalDatasetTemplatesResource;

  constructor(private readonly http: HttpClient) {
    this.templates = new EvalDatasetTemplatesResource(http);
  }

  async list(): Promise<EvalDataset[]> {
    const { datasets } = await this.http.get<{ datasets: EvalDataset[] }>('/v1/evals/datasets');
    return datasets;
  }

  async get(id: string): Promise<EvalDataset> {
    const { dataset } = await this.http.get<{ dataset: EvalDataset }>(`/v1/evals/datasets/${encodeURIComponent(id)}`);
    return dataset;
  }

  /** Response shape here is narrower than EvalDataset (no updated_at, no cases array — just a case_count). */
  async create(input: CreateEvalDatasetInput): Promise<CreatedEvalDataset> {
    return this.http.post<CreatedEvalDataset>('/v1/evals/datasets', input);
  }

  async update(id: string, input: UpdateEvalDatasetInput): Promise<EvalDataset> {
    const { dataset } = await this.http.patch<{ dataset: EvalDataset }>(`/v1/evals/datasets/${encodeURIComponent(id)}`, input);
    return dataset;
  }

  async delete(id: string): Promise<void> {
    await this.http.delete<void>(`/v1/evals/datasets/${encodeURIComponent(id)}`);
  }

  /** Plain JSON body, not multipart — you already have structured data if you're calling the API directly. */
  async importCases(id: string, cases: CreateEvalCaseInput[]): Promise<number> {
    const { imported } = await this.http.post<{ imported: number }>(`/v1/evals/datasets/${encodeURIComponent(id)}/import`, { cases });
    return imported;
  }
}

class EvalCasesResource {
  constructor(private readonly http: HttpClient) {}

  async create(datasetId: string, input: CreateEvalCaseInput): Promise<EvalCase> {
    const { case: evalCase } = await this.http.post<{ case: EvalCase }>(`/v1/evals/datasets/${encodeURIComponent(datasetId)}/cases`, input);
    return evalCase;
  }

  async update(caseId: string, input: UpdateEvalCaseInput): Promise<EvalCase> {
    const { case: evalCase } = await this.http.patch<{ case: EvalCase }>(`/v1/evals/cases/${encodeURIComponent(caseId)}`, input);
    return evalCase;
  }

  async delete(caseId: string): Promise<void> {
    await this.http.delete<void>(`/v1/evals/cases/${encodeURIComponent(caseId)}`);
  }
}

class EvalSuitesResource {
  constructor(private readonly http: HttpClient) {}

  async list(filter: { domain_key?: string; intent_key?: string } = {}): Promise<EvalSuite[]> {
    const params = new URLSearchParams();
    if (filter.domain_key) params.set('domain_key', filter.domain_key);
    if (filter.intent_key) params.set('intent_key', filter.intent_key);
    const qs = params.toString();
    const { suites } = await this.http.get<{ suites: EvalSuite[] }>(`/v1/evals/suites${qs ? `?${qs}` : ''}`);
    return suites;
  }

  async create(input: CreateEvalSuiteInput): Promise<EvalSuite> {
    const { suite } = await this.http.post<{ suite: EvalSuite }>('/v1/evals/suites', input);
    return suite;
  }

  async update(id: string, input: UpdateEvalSuiteInput): Promise<EvalSuite> {
    const { suite } = await this.http.patch<{ suite: EvalSuite }>(`/v1/evals/suites/${encodeURIComponent(id)}`, input);
    return suite;
  }

  async delete(id: string): Promise<void> {
    await this.http.delete<void>(`/v1/evals/suites/${encodeURIComponent(id)}`);
  }

  /** Every later completed run of this suite is auto-compared against whichever run is pinned here (see runs.get()'s baseline_comparison). Pass null to clear. */
  async setBaseline(id: string, runId: string | null): Promise<EvalSuite> {
    const { suite } = await this.http.patch<{ suite: EvalSuite }>(`/v1/evals/suites/${encodeURIComponent(id)}/baseline`, { run_id: runId });
    return suite;
  }

  /**
   * Calls the suite's real intent for every case in its dataset and scores
   * each response — the API-key counterpart to the dashboard's "run a
   * suite" button. Returns immediately with a 'pending' run; poll
   * runs.get(). Budget-gated against the tenant's monthly Evals quota.
   */
  async run(id: string, model?: string): Promise<EvalRun> {
    const { run } = await this.http.post<{ run: EvalRun }>(`/v1/evals/suites/${encodeURIComponent(id)}/run`, model !== undefined ? { model } : undefined);
    return run;
  }

  async listRuns(id: string): Promise<EvalRun[]> {
    const { runs } = await this.http.get<{ runs: EvalRun[] }>(`/v1/evals/suites/${encodeURIComponent(id)}/runs`);
    return runs;
  }

  /** Creates two ordinary runs against different force_model overrides — compare them afterward via runs.compare()/comparePairwise(). */
  async compareModels(id: string, modelA: string, modelB: string): Promise<{ run_a: EvalRun; run_b: EvalRun }> {
    return this.http.post<{ run_a: EvalRun; run_b: EvalRun }>(`/v1/evals/suites/${encodeURIComponent(id)}/compare-models`, { model_a: modelA, model_b: modelB });
  }
}

class EvalReviewsResource {
  constructor(private readonly http: HttpClient) {}

  async create(resultId: string, input: CreateEvalReviewInput): Promise<EvalReview> {
    const { review } = await this.http.post<{ review: EvalReview }>(`/v1/evals/results/${encodeURIComponent(resultId)}/reviews`, input);
    return review;
  }

  async delete(id: string): Promise<void> {
    await this.http.delete<void>(`/v1/evals/reviews/${encodeURIComponent(id)}`);
  }
}

class EvalRunsResource {
  constructor(private readonly http: HttpClient) {}

  async list(filter: { suite_id?: string } = {}): Promise<EvalRun[]> {
    const params = new URLSearchParams();
    if (filter.suite_id) params.set('suite_id', filter.suite_id);
    const qs = params.toString();
    const { runs } = await this.http.get<{ runs: EvalRun[] }>(`/v1/evals/runs${qs ? `?${qs}` : ''}`);
    return runs;
  }

  /**
   * Submit a batch of already-generated (input, output) pairs for async
   * scoring — no domain/intent/engine.execute() involved, the runner just
   * scores what you already produced. Returns immediately with a run id;
   * poll get(). Capped at 100 cases per request.
   */
  async submit(input: SubmitEvalRunInput): Promise<{ run_id: string }> {
    return this.http.post<{ run_id: string }>('/v1/evals/runs', input);
  }

  async get(id: string): Promise<EvalRunDetail> {
    return this.http.get<EvalRunDetail>(`/v1/evals/runs/${encodeURIComponent(id)}`);
  }

  /** Cooperative — the worker checks before its next case and stops there; the case in progress isn't scored. */
  async cancel(id: string): Promise<EvalRun> {
    const { run } = await this.http.post<{ run: EvalRun }>(`/v1/evals/runs/${encodeURIComponent(id)}/cancel`);
    return run;
  }

  /**
   * Only a 'failed' run can be resumed. Already-scored cases are skipped —
   * this continues from where the run stopped rather than re-billing every
   * case. Works for both execution modes.
   */
  async resume(id: string): Promise<EvalRun> {
    const { run } = await this.http.post<{ run: EvalRun }>(`/v1/evals/runs/${encodeURIComponent(id)}/resume`);
    return run;
  }

  /** Statistical comparison (pass rate, mean score, cost/latency deltas, significance test) — a lightweight alternative to comparePairwise(). */
  async compare(id: string, against: string): Promise<RunComparison> {
    return this.http.get<RunComparison>(`/v1/evals/runs/${encodeURIComponent(id)}/compare?against=${encodeURIComponent(against)}`);
  }

  /** Real LLM judge calls, cost-incurring — picks a winner (a/b/tie) per shared case directly, rather than comparing independent scores. Both runs must share the same intent_key. */
  async comparePairwise(id: string, against: string): Promise<PairwiseRunComparison> {
    return this.http.post<PairwiseRunComparison>(`/v1/evals/runs/${encodeURIComponent(id)}/compare-pairwise`, { against });
  }
}

/**
 * Evaluation Studio — Datasets/Cases/Suites/Runs/Reviews, plus standalone
 * scoring (score()). Mirrors the full /v1/evals surface (see openapi.yaml).
 * A Suite binds a Dataset to one intent; suites.run() calls that intent for
 * real and scores what it produces, while runs.submit()/score() score a
 * response you already generated yourself.
 */
export class EvaluationsResource {
  readonly datasets: EvalDatasetsResource;
  readonly cases: EvalCasesResource;
  readonly suites: EvalSuitesResource;
  readonly runs: EvalRunsResource;
  readonly reviews: EvalReviewsResource;

  constructor(private readonly http: HttpClient) {
    this.datasets = new EvalDatasetsResource(http);
    this.cases = new EvalCasesResource(http);
    this.suites = new EvalSuitesResource(http);
    this.runs = new EvalRunsResource(http);
    this.reviews = new EvalReviewsResource(http);
  }

  /** Score one (input, output) pair synchronously — no domain, intent, or dataset required. */
  async score(input: ScoreEvalInput): Promise<ScoreEvalResult> {
    return this.http.post<ScoreEvalResult>('/v1/evals/score', input);
  }
}
