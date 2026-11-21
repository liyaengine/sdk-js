import type { HttpClient } from '../http.js';

/**
 * Execution traces — read-only. Mirrors `/v1/traces` (see openapi.yaml), served by the same handlers as the
 * dashboard's Trace Explorer, so a filter or field that works there works here. Secret API keys only: a trace
 * holds prompts and responses, so a public embed token is refused. Comments, bookmarks and replay stay in the
 * dashboard.
 */

export type TraceKind = 'request' | 'agent' | 'workflow';
export type TraceIssueCategory = 'safety' | 'validation' | 'grounding' | 'other';
export type TraceSortKey = 'time' | 'latency' | 'ttft' | 'cost';
export type TraceContentAccess = 'full' | 'restricted_by_role' | 'not_stored';

export interface TraceParentRef {
  kind: string;
  runId: string;
  name: string | null;
}

/** One row of `traces.list()`. Agent and workflow rows carry the same fields, with the request-only ones null. */
export interface TraceSummary {
  kind: TraceKind;
  /** For a request, the `message_id` that `run()` returned. */
  traceId: string;
  name: string | null;
  /** The run's status for an agent or workflow trace; null for a request. */
  status: string | null;
  /** The agent or workflow run that made this call, when it was made as part of one. */
  parent: TraceParentRef | null;
  sessionId: string | null;
  requestId: string | null;
  userId: string | null;
  intent: string | null;
  domain: string | null;
  modelUsed: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  /** Decimal string in USD, e.g. "0.002100". */
  costUsd: string | null;
  latencyMs: number | null;
  ttftMs: number | null;
  flagged: boolean;
  flagReason: string | null;
  piiDetected: boolean;
  issueCategories: TraceIssueCategory[];
  captureMode: 'full' | 'minimal';
  commentCount: number;
  qaScore: number | null;
  qaBreakdown: Record<string, unknown> | null;
  timestamp: string;
}

export interface ListTracesInput {
  /** 1-100, default 25. */
  limit?: number;
  offset?: number;
  domain?: string;
  intent?: string;
  flagged?: boolean;
  /** Only calls with a guardrail issue of this kind. */
  issue?: TraceIssueCategory;
  /** ISO 8601 timestamps, or Dates. */
  from?: string | Date;
  to?: string | Date;
  userId?: string;
  sessionId?: string;
  model?: string;
  minLatencyMs?: number;
  fromCache?: boolean;
  capture?: 'full' | 'minimal';
  /** Free-text search. */
  q?: string;
  sort?: TraceSortKey;
  order?: 'asc' | 'desc';
  /** `'traces'`: one row per request, agent run or workflow run. Narrow with `kind`; add `nested` to list what runs started. */
  scope?: 'traces';
  kind?: TraceKind;
  nested?: boolean;
}

export interface TracesPage {
  traces: TraceSummary[];
  pagination: { total: number; limit: number; offset: number };
  sort: { key: TraceSortKey; dir: 'asc' | 'desc' };
}

export interface TraceIssue {
  [key: string]: unknown;
}

export interface TraceRetrievedChunk {
  sourceId: string;
  sourceType: string;
  score: number;
  /** Null when the key may not see content, or the call was captured minimally. */
  snippet: string | null;
}

/** The full trace of one request (`traces.get`), or of an agent or workflow run (`traces.getRun`). */
export interface Trace {
  kind?: 'agent_run' | 'workflow_run';
  traceId: string;
  sessionId: string;
  requestId: string | null;
  userId: string | null;
  domain: string | null;
  /** What this caller may see of request and response text. Secret keys read with full access. */
  contentAccess: TraceContentAccess;
  captureMode: 'full' | 'minimal';
  intent: string | null;
  intentConfidence: number | null;
  userRequest: string | null;
  content: string | null;
  contentHash: string | null;
  structuredOutput: unknown;
  modelUsed: string | null;
  modelVersion: string | null;
  systemPromptHash: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: string | null;
  latencyMs: number | null;
  ttftMs: number | null;
  flagged: boolean;
  flagReason: string | null;
  issues: TraceIssue[];
  piiDetected: boolean;
  piiRedacted?: boolean;
  fromCache: boolean;
  qaScore: number | null;
  qaBreakdown: Record<string, unknown> | null;
  /** Agent reasoning and tool-call steps, for an agent-mode call. */
  agenticSteps?: Array<Record<string, unknown>>;
  /** Every retrieved chunk with its source and similarity score. */
  retrievedContext?: TraceRetrievedChunk[];
  /** What was searched and how: method, top-k, threshold, whether a boost or fallback fired. */
  retrievalMeta?: Record<string, unknown> | null;
  /** The trace as a tree of steps with timing, as the Trace Explorer shows it. */
  observations?: Array<Record<string, unknown>>;
  billing?: Record<string, unknown> | null;
  session?: Record<string, unknown> | null;
  timestamp: string | null;
}

/** The same filters as `traces.list()`, except paging and sorting. Defaults to the last 30 days. */
export type TraceStatsInput = Omit<ListTracesInput, 'limit' | 'offset' | 'sort' | 'order'>;

export interface TraceLatency {
  avg: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

export interface TraceStats {
  window: { from: string; to: string };
  total: number;
  flagged: number;
  /** Present with `scope: 'traces'`. */
  byKind?: { request: number; agent: number; workflow: number };
  failedRuns?: number;
  totalTokens?: number;
  piiDetected: number;
  fromCache: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: string;
  latencyMs: TraceLatency;
  ttftMs: { p50: number | null; p95: number | null };
  qaScore: { avg: number | null; scored: number };
  issuesByCategory: Record<TraceIssueCategory, number>;
  byIntent: Array<{
    intent: string;
    domain: string | null;
    total: number;
    flagged: number;
    piiDetected: number;
    costUsd: string;
    latencyMs: { p50: number | null; p95: number | null };
    qaScore: number | null;
  }>;
}

/** A dataset that tests the same intent as the trace, with the suites that run it. */
export interface TraceCaseDraftDataset {
  id: string;
  name: string;
  suites: Array<{ id: string; name: string }>;
}

/** A group of runs or requests that stopped for the same reason (`traces.failureClusters`). */
export interface FailureCluster {
  id: string;
  /** `run`: an agent or workflow run ended failed. `tool`: a tool call in an agent run failed. `step`: a step in a workflow run failed with an error. `request`: a call to an intent failed. */
  kind: 'run' | 'tool' | 'step' | 'request';
  /** What failed: an agent, a workflow, or an intent (`domain/intent`). */
  resourceKind: 'agent' | 'workflow' | 'intent';
  resourceId: string;
  resourceName: string;
  /** How the run stopped ("Stopped at the step limit"), what an error said, or the tool or step that failed. */
  title: string;
  /** For a tool group where the tool is one of the workspace's actions, that action's id; otherwise null. */
  toolId: string | null;
  /** The error text (numbers and ids folded) or error code the runs share. */
  signature: string;
  runs: number;
  runsPreviousWindow: number;
  /** Runs of this group that ended failed. For a tool or step group this is often far below `runs`: the agent or workflow recovers from a failed call or step. */
  runsEndedFailed: number;
  firstSeen: string;
  lastSeen: string;
  /** Failures per day across the window, oldest first. */
  daily: number[];
  /** A fixed rule on the status or error text. `rule` says which one fired. A label, not a diagnosis. */
  cause: { kind: 'limit' | 'guardrail' | 'model' | 'tool' | 'step' | 'request' | 'unclassified'; label: string; rule: string };
  /** True at 10 or more runs: enough evidence for a fix to be proposed. */
  proposalReady: boolean;
  /** Versions of the agent, workflow or intent, and approved releases, that lined up in time with the group, each described by what it changed. Leads, never proof of cause. */
  changes: Array<{ at: string; kind: 'version' | 'release'; label: string; by: string | null; beforeFirstFailure: boolean }>;
  /** Newest first. An agent or workflow run id (open it with `traces.getRun`), or a request id. */
  exampleRunIds: string[];
}

export interface FailureSourceTotals { total: number; failed: number }
export interface FailureClusters {
  windowDays: number;
  /** Agent runs, workflow runs and requests together. See `bySource` for each. */
  runsTotal: number;
  runsFailed: number;
  failureRate: number | null;
  bySource: { agent: FailureSourceTotals; workflow: FailureSourceTotals; request: FailureSourceTotals };
  truncated: boolean;
  minClusterRuns: number;
  proposalMinRuns: number;
  clusters: FailureCluster[];
}

/** A redacted draft evaluation case from a request trace (`traces.caseDraft`). */
export interface TraceCaseDraft {
  traceId: string;
  domainKey: string;
  intentKey: string;
  /** What the user said, with personal details removed. */
  message: string | null;
  /** Always empty: a request trace does not keep the intent's input fields. */
  input: Record<string, unknown>;
  inputAvailable: false;
  /** What the intent answered, redacted. Context for the expected output, never a suggestion for it. */
  observedOutput: string | null;
  expectedOutput: null;
  notes: string;
  alreadyRedacted: boolean;
  datasets: TraceCaseDraftDataset[];
}

interface WireTraceCaseDraft {
  trace_id: string;
  domain_key: string;
  intent_key: string;
  message: string | null;
  input: Record<string, unknown>;
  input_available: false;
  observed_output: string | null;
  expected_output: null;
  notes: string;
  already_redacted: boolean;
  datasets: TraceCaseDraftDataset[];
}

function toQuery(input: Record<string, unknown> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    params.set(key, value instanceof Date ? value.toISOString() : String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export class TracesResource {
  constructor(private readonly http: HttpClient) {}

  /** A page of traces, newest first by default, with the pagination and sort that were applied. */
  list(input: ListTracesInput = {}): Promise<TracesPage> {
    return this.http
      .getEnvelope<{ data: { traces: TraceSummary[] }; pagination: TracesPage['pagination']; sort: TracesPage['sort'] }>(`/v1/traces${toQuery({ ...input })}`)
      .then(body => ({ traces: body.data.traces, pagination: body.pagination, sort: body.sort }));
  }

  /** The full trace for one request. The id is the `message_id` that `run()` returned. */
  async get(traceId: string): Promise<Trace> {
    const { trace } = await this.http.get<{ trace: Trace }>(`/v1/traces/${encodeURIComponent(traceId)}`);
    return trace;
  }

  /**
   * A redacted draft evaluation case built from a request trace, plus the datasets that test the same intent. Nothing is saved:
   * once a person has written the expected output, create the case with `evaluations`. The intent's structured input is not kept
   * on a trace, so `input` is empty and `inputAvailable` is false; `observedOutput` is context, never a suggested expected output.
   * Throws a 409 `TRACE_CONTENT_NOT_STORED` when the workspace keeps no trace text and a 422 `TRACE_NOT_EVALUABLE` for a built-in intent.
   */
  async caseDraft(traceId: string): Promise<TraceCaseDraft> {
    const { draft } = await this.http.get<{ draft: WireTraceCaseDraft }>(`/v1/traces/${encodeURIComponent(traceId)}/eval-case-draft`);
    return {
      traceId: draft.trace_id,
      domainKey: draft.domain_key,
      intentKey: draft.intent_key,
      message: draft.message,
      input: draft.input,
      inputAvailable: draft.input_available,
      observedOutput: draft.observed_output,
      expectedOutput: draft.expected_output,
      notes: draft.notes,
      alreadyRedacted: draft.already_redacted,
      datasets: draft.datasets,
    };
  }

  /**
   * Agent runs that stopped for the same reason, grouped by counting. No model is called and nothing is billed. Status is reliability,
   * not quality: a run that finished with a wrong answer is not a failure here. `days` is 1 to 30 (default 7).
   */
  async failureClusters(input: { days?: number } = {}): Promise<FailureClusters> {
    const d = await this.http.get<Record<string, any>>(`/v1/traces/failure-clusters${toQuery({ ...input })}`);
    return {
      windowDays: d.window_days, runsTotal: d.runs_total, runsFailed: d.runs_failed, failureRate: d.failure_rate, truncated: d.truncated,
      bySource: d.by_source,
      minClusterRuns: d.min_cluster_runs, proposalMinRuns: d.proposal_min_runs,
      clusters: (d.clusters as Array<Record<string, any>>).map((c) => ({
        id: c.id, kind: c.kind, resourceKind: c.resource_kind, resourceId: c.resource_id, resourceName: c.resource_name, title: c.title, toolId: c.tool_id ?? null, signature: c.signature,
        runs: c.runs, runsPreviousWindow: c.runs_previous_window, runsEndedFailed: c.runs_ended_failed,
        firstSeen: c.first_seen, lastSeen: c.last_seen, daily: c.daily, cause: c.cause, proposalReady: c.proposal_ready,
        changes: (c.changes as Array<Record<string, any>>).map((x) => ({ at: x.at, kind: x.kind, label: x.label, by: x.by, beforeFirstFailure: x.before_first_failure })),
        exampleRunIds: c.example_run_ids,
      })),
    };
  }

  /** The trace of an agent or workflow run: its steps as nested observations, with the model and tool calls each made. */
  async getRun(kind: 'agent' | 'workflow', runId: string): Promise<Trace> {
    const { trace } = await this.http.get<{ trace: Trace }>(`/v1/traces/runs/${kind}/${encodeURIComponent(runId)}`);
    return trace;
  }

  /** Totals for every trace matching the filters (not just a page): counts, tokens, cost, latency percentiles, quality score, issues and a per-intent breakdown. */
  stats(input: TraceStatsInput = {}): Promise<TraceStats> {
    return this.http.get<TraceStats>(`/v1/traces/stats${toQuery({ ...input })}`);
  }
}
