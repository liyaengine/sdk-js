import type { HttpClient } from '../http.js';
import type { AccessContext } from './run.js';

export type AgentStatus = 'draft' | 'active' | 'inactive' | 'error';

export interface EffectiveConfigValue<T> {
  value: T;
  source: 'agent' | 'platform_default' | 'provider_default';
}

export interface EffectiveAgentRuntimeConfig {
  contract_version: number;
  model: { name: EffectiveConfigValue<string>; temperature: EffectiveConfigValue<number | null> };
  behavior: {
    max_steps: EffectiveConfigValue<number>;
    max_cost_usd: EffectiveConfigValue<number>;
    max_output_tokens: EffectiveConfigValue<number>;
    max_seconds: EffectiveConfigValue<number>;
    max_tool_calls: EffectiveConfigValue<number>;
    parallel_tool_execution: EffectiveConfigValue<boolean>;
  };
  memory: { conversation_memory: EffectiveConfigValue<boolean> };
}

export interface Agent {
  id: string;
  tenant_id: string;
  agent_key: string;
  name: string;
  description: string | null;
  goal: string;
  system_instructions: string | null;
  model: string | null;
  temperature: number | null;
  status: AgentStatus;
  intent_ids: string[];
  workflow_ids: string[];
  action_ids: string[];
  knowledge_domain_keys: string[];
  tools_config: Record<string, unknown> | null;
  memory_config: Record<string, unknown> | null;
  behavior_config: Record<string, unknown> | null;
  guardrail_policy_id: string | null;
  created_at: string;
  updated_at: string;
  effective_runtime_config: EffectiveAgentRuntimeConfig;
}

export interface CreateAgentInput {
  agent_key: string;
  name: string;
  goal: string;
  description?: string;
  system_instructions?: string;
  model?: string;
  temperature?: number;
  intent_ids?: string[];
  workflow_ids?: string[];
  action_ids?: string[];
  knowledge_domain_keys?: string[];
  tools_config?: Record<string, unknown>;
  memory_config?: Record<string, unknown>;
  behavior_config?: Record<string, unknown>;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  goal?: string;
  system_instructions?: string;
  model?: string;
  temperature?: number;
  /** Setting 'active' directly is rejected (409 DEPLOY_REQUIRED) — use deploy() instead. */
  status?: Exclude<AgentStatus, 'active'>;
  intent_ids?: string[];
  workflow_ids?: string[];
  action_ids?: string[];
  knowledge_domain_keys?: string[];
  tools_config?: Record<string, unknown>;
  memory_config?: Record<string, unknown>;
  behavior_config?: Record<string, unknown>;
}

export interface AgentCatalogEntry {
  agent: string;
  displayName: string;
  description: string | null;
  goal: string;
  status: string;
  endpoint: string;
  method: string;
  inputSchema: Record<string, unknown>;
}

export interface RunAgentInput {
  input: { message: string; user_id?: string; [key: string]: unknown };
  session_id?: string;
  /** Retrieval access context for the end user this run acts for. See AccessContext. */
  access?: AccessContext;
}

export interface AgentRunResult {
  run_id: string;
  session_id: string;
  history_truncated: boolean;
  status: string;
  output: string;
  steps: number;
  total_cost: number;
  total_latency_ms: number | null;
}

/** One orchestration step (@liyaengine/core's AgentOrchestrator) — an `llm_call` turn or a `tool_execution`. */
export interface AgentStep {
  step_number: number;
  type: 'llm_call' | 'tool_execution';
  model?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_output?: unknown;
  tool_success?: boolean;
  input_tokens?: number;
  output_tokens?: number;
  cost?: number;
  served_by?: 'platform' | 'byok';
  latency_ms: number;
  timestamp: string;
  error?: string;
  error_code?: string;
}

/**
 * Step-level, not token-level: AgentOrchestrator has no streaming synthesis
 * call, so there's no token delta to emit — `step` fires in real time as
 * each llm_call/tool_execution happens, and `done` carries the complete,
 * already-generated final answer in one piece.
 */
export type AgentRunStreamEvent =
  | { type: 'step'; step: AgentStep }
  | ({ type: 'done' } & AgentRunResult)
  | { type: 'error'; code: string; message: string; status?: number };

export interface AgentRunSummary {
  id: string;
  session_id: string | null;
  status: string;
  trigger: string;
  started_at: string;
  completed_at: string | null;
  total_cost: number;
  total_latency_ms: number | null;
  total_input_tokens: number;
  total_output_tokens: number;
  step_count: number;
  input: Record<string, unknown>;
}

export interface AgentSession {
  id: string;
  session_id: string;
  status: string;
  trigger: string;
  turn_count: number;
  started_at: string;
  last_activity_at: string;
  completed_at: string | null;
  total_cost: number;
  total_latency_ms: number | null;
  total_input_tokens: number;
  total_output_tokens: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListOptions {
  page?: number;
  pageSize?: number;
  status?: string;
}

function toQuery(options: ListOptions & { session_id?: string } = {}): string {
  const params = new URLSearchParams();
  if (options.page !== undefined) params.set('page', String(options.page));
  if (options.pageSize !== undefined) params.set('pageSize', String(options.pageSize));
  if (options.status !== undefined) params.set('status', options.status);
  if (options.session_id !== undefined) params.set('session_id', options.session_id);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** One side of a version comparison in `agents.regressions`. */
export interface VersionSide {
  version: number;
  runs: number;
  failed: number;
  /** Percent of finished runs that ended in any status other than completed. */
  failureRate: number;
  firstRun: string;
  lastRun: string;
}

/** A roll-back proposal: the live version of an agent fails clearly more often than the version before it. A lead, never proof. */
export interface AgentRegression {
  id: string;
  agentId: string;
  agentKey: string;
  agentName: string;
  current: VersionSide;
  previous: VersionSide;
  gapPoints: number;
  /** Everything that differs between the two versions. Rolling back undoes all of it. */
  changes: Array<{ field: string; label: string; before: string; after: string }>;
  topFailure: { signature: string; runs: number } | null;
  /** True when staging the older version would replace an existing draft. */
  hasDraft: boolean;
  /** The existing restore call. On a live agent it only stages the older version as the draft; deploy to publish it. */
  restore: { method: 'POST'; path: string };
}

export interface AgentRegressions {
  windowDays: number;
  minVersionRuns: number;
  minGapPoints: number;
  regressions: AgentRegression[];
}

/** What happened to a staged roll-back after it was deployed, worked out from runs (`agents.regressionDecisions`). */
export interface RegressionOutcome {
  /** `not_deployed` until a later version has the restored settings, then `measuring`, and `measured` once that version has 20 runs. */
  state: 'not_deployed' | 'measuring' | 'measured';
  deployedVersion: number | null;
  runs: number;
  failed: number;
  failureRate: number | null;
  /** The rate the restored version had when the proposal was made. */
  rateBefore: number | null;
  /** The rate the replaced version had when the proposal was made. */
  rateReplaced: number | null;
}

/** A staged or dismissed roll-back proposal. */
export interface RegressionDecision {
  id: string;
  kind: string;
  fingerprint: string;
  /** What the proposal was about: an agent or a workflow. */
  resourceType: 'agent' | 'workflow';
  resourceId: string;
  resourceName: string;
  title: string;
  decision: 'staged' | 'dismissed' | 'snoozed';
  reason: string | null;
  /** The counts the person was shown, as they were then. */
  evidence: unknown;
  fromVersion: number | null;
  toVersion: number | null;
  decidedByLabel: string | null;
  decidedAt: string;
  /** For a snoozed decision: when the proposal comes back. Null otherwise. */
  snoozedUntil: string | null;
  outcome: RegressionOutcome | null;
}

/** A limit proposal: the live version of an agent keeps stopping at its step or tool-call limit. The proposal is to raise it by half, as a draft. */
export interface AgentLimitProposal {
  id: string;
  agentId: string;
  agentKey: string;
  agentName: string;
  limit: { kind: 'steps' | 'tool_calls'; label: string; /** The run status that means a run stopped at this limit. */ status: string; current: number; proposed: number };
  /** The live version the counts are for. */
  version: number;
  runs: number;
  stopped: number;
  stoppedRate: number;
  /** Of the most recent stopped runs read, how many ended by repeating one tool call with one input. */
  sampled: number;
  looping: number;
  hasDraft: boolean;
  /** What raising it costs, in words. */
  costNote: string;
}

/** An agent that was looked at and not proposed: a loop (more room would only let it loop longer), or already at the highest limit allowed. */
export interface AgentLimitNotProposed {
  agentId: string;
  agentName: string;
  limitKind: 'steps' | 'tool_calls';
  limitLabel: string;
  stopped: number;
  runs: number;
  reason: 'looping' | 'at_maximum';
  detail: string;
}

export interface AgentLimitProposals {
  windowDays: number;
  minStoppedRuns: number;
  minStoppedShare: number;
  proposals: AgentLimitProposal[];
  notProposed: AgentLimitNotProposed[];
}

/** @internal Shared by `agents.regressionDecisions` and `workflows.regressionDecisions`. */
export function mapRegressionDecision(r: Record<string, any>): RegressionDecision {
  return {
    id: r.id, kind: r.kind, fingerprint: r.fingerprint, resourceType: r.resource_type, resourceId: r.resource_id, resourceName: r.resource_name, title: r.title, decision: r.decision, reason: r.reason,
    evidence: r.evidence, fromVersion: r.from_version, toVersion: r.to_version, decidedByLabel: r.decided_by_label, decidedAt: r.decided_at,
    snoozedUntil: r.snoozed_until ?? null,
    outcome: r.outcome ? { state: r.outcome.state, deployedVersion: r.outcome.deployed_version, runs: r.outcome.runs, failed: r.outcome.failed, failureRate: r.outcome.failure_rate, rateBefore: r.outcome.rate_before, rateReplaced: r.outcome.rate_replaced } : null,
  };
}

/** @internal */
export function mapVersionSide(x: Record<string, any>): VersionSide {
  return { version: x.version, runs: x.runs, failed: x.failed, failureRate: x.failure_rate, firstRun: x.first_run, lastRun: x.last_run };
}

/**
 * Standalone Agents — composes Intents/Workflows/Tools/Knowledge as
 * capabilities. Mirrors the full /v1/agents surface (see openapi.yaml):
 * CRUD + deploy, plus run/run-history/sessions/transcript.
 */
export class AgentsResource {
  constructor(private readonly http: HttpClient) {}

  async list(): Promise<AgentCatalogEntry[]> {
    const { agents } = await this.http.get<{ agents: AgentCatalogEntry[]; total: number }>('/v1/agents');
    return agents;
  }

  /**
   * Agents whose live version fails clearly more often than the version before it, counted from runs. No model is called and nothing is
   * billed. Failure means the run stopped (a limit, an error, a block), not that an answer was wrong. Nothing is applied: `restore` names
   * the existing restore call, which stages the older version as the draft. `days` is 7 to 90 (default 30).
   */
  async regressions(input: { days?: number } = {}): Promise<AgentRegressions> {
    const d = await this.http.get<Record<string, any>>(`/v1/agents/regressions${input.days === undefined ? '' : `?days=${encodeURIComponent(String(input.days))}`}`);
    const side = (x: Record<string, any>): VersionSide => ({ version: x.version, runs: x.runs, failed: x.failed, failureRate: x.failure_rate, firstRun: x.first_run, lastRun: x.last_run });
    return {
      windowDays: d.window_days, minVersionRuns: d.min_version_runs, minGapPoints: d.min_gap_points,
      regressions: (d.regressions as Array<Record<string, any>>).map((r) => ({
        id: r.id, agentId: r.agent_id, agentKey: r.agent_key, agentName: r.agent_name, current: side(r.current), previous: side(r.previous),
        gapPoints: r.gap_points, changes: r.changes, topFailure: r.top_failure, hasDraft: r.has_draft, restore: r.restore,
      })),
    };
  }

  /**
   * Stage a roll-back proposal: the existing restore, so on a live agent the earlier version becomes the draft and nothing goes live until the
   * agent is deployed. Replaces an existing draft. Calls no model. Throws a 409 `PROPOSAL_NOT_OPEN` when the proposal is no longer open.
   * `recorded` is false if the restore worked but the decision could not be saved.
   */
  async stageRegression(id: string): Promise<{ stagedVersion: number; stagedAsDraft: boolean; decisionId: string | null; recorded: boolean }> {
    const d = await this.http.post<Record<string, any>>(`/v1/agents/regressions/${encodeURIComponent(id)}/stage`, {});
    return { stagedVersion: d.staged_version, stagedAsDraft: d.staged_as_draft, decisionId: d.decision_id, recorded: d.recorded };
  }

  /** Dismiss a roll-back proposal. It stays hidden while the two versions are unchanged. `reason` is optional, at most 500 characters. Changes no agent. */
  async dismissRegression(id: string, reason?: string): Promise<{ decisionId: string }> {
    const d = await this.http.post<Record<string, any>>(`/v1/agents/regressions/${encodeURIComponent(id)}/dismiss`, reason === undefined ? {} : { reason });
    return { decisionId: d.decision_id };
  }

  /** Roll-back proposals for agents and workflows that were staged or dismissed, newest first (`resourceType` says which). A staged one carries an `outcome` worked out from runs. `limit` is 1 to 200 (default 50). */
  async regressionDecisions(input: { limit?: number } = {}): Promise<RegressionDecision[]> {
    const d = await this.http.get<{ decisions: Array<Record<string, any>> }>(`/v1/agents/regressions/decided${input.limit === undefined ? '' : `?limit=${encodeURIComponent(String(input.limit))}`}`);
    return d.decisions.map(mapRegressionDecision);
  }

  /** Snooze a roll-back proposal for 7, 14 or 30 days. It comes back after that if it still qualifies. Changes nothing else. */
  async snoozeRegression(id: string, input: { days: 7 | 14 | 30; reason?: string }): Promise<{ decisionId: string; snoozedUntil: string }> {
    const d = await this.http.post<Record<string, any>>(`/v1/agents/regressions/${encodeURIComponent(id)}/snooze`, { days: input.days, ...(input.reason !== undefined ? { reason: input.reason } : {}) });
    return { decisionId: d.decision_id, snoozedUntil: d.snoozed_until };
  }

  /**
   * Agents whose live version keeps stopping at its step or tool-call limit, counted from runs. No model is called and nothing is billed.
   * A proposal raises the limit by half. An agent whose stopped runs mostly ended in a loop is not proposed (more room only lets it loop longer):
   * it is in `notProposed` with the reason, as is one already at the highest limit. Timeouts and cost limits are never proposed. `days` is 7 to 90 (default 30).
   */
  async limitProposals(input: { days?: number } = {}): Promise<AgentLimitProposals> {
    const d = await this.http.get<Record<string, any>>(`/v1/agents/limit-proposals${input.days === undefined ? '' : `?days=${encodeURIComponent(String(input.days))}`}`);
    return {
      windowDays: d.window_days, minStoppedRuns: d.min_stopped_runs, minStoppedShare: d.min_stopped_share,
      proposals: (d.proposals as Array<Record<string, any>>).map((p) => ({
        id: p.id, agentId: p.agent_id, agentKey: p.agent_key, agentName: p.agent_name, limit: p.limit, version: p.version, runs: p.runs, stopped: p.stopped,
        stoppedRate: p.stopped_rate, sampled: p.sampled, looping: p.looping, hasDraft: p.has_draft, costNote: p.cost_note,
      })),
      notProposed: (d.not_proposed as Array<Record<string, any>>).map((n) => ({
        agentId: n.agent_id, agentName: n.agent_name, limitKind: n.limit_kind, limitLabel: n.limit_label, stopped: n.stopped, runs: n.runs, reason: n.reason, detail: n.detail,
      })),
    };
  }

  /** Stage a limit proposal: the raised limit goes into the agent's draft (added to one that exists), and nothing goes live until the agent is deployed. Calls no model. Throws a 409 `PROPOSAL_NOT_OPEN` when it is no longer open. */
  async stageLimitProposal(id: string): Promise<{ limit: 'steps' | 'tool_calls'; proposed: number; stagedAsDraft: boolean; decisionId: string | null; recorded: boolean }> {
    const d = await this.http.post<Record<string, any>>(`/v1/agents/limit-proposals/${encodeURIComponent(id)}/stage`, {});
    return { limit: d.limit, proposed: d.proposed, stagedAsDraft: d.staged_as_draft, decisionId: d.decision_id, recorded: d.recorded };
  }

  /** Dismiss a limit proposal. It stays hidden while the agent's limit is unchanged. `reason` is optional, at most 500 characters. */
  async dismissLimitProposal(id: string, reason?: string): Promise<{ decisionId: string }> {
    const d = await this.http.post<Record<string, any>>(`/v1/agents/limit-proposals/${encodeURIComponent(id)}/dismiss`, reason === undefined ? {} : { reason });
    return { decisionId: d.decision_id };
  }

  /** Snooze a limit proposal for 7, 14 or 30 days. It comes back after that if it still qualifies. */
  async snoozeLimitProposal(id: string, input: { days: 7 | 14 | 30; reason?: string }): Promise<{ decisionId: string; snoozedUntil: string }> {
    const d = await this.http.post<Record<string, any>>(`/v1/agents/limit-proposals/${encodeURIComponent(id)}/snooze`, { days: input.days, ...(input.reason !== undefined ? { reason: input.reason } : {}) });
    return { decisionId: d.decision_id, snoozedUntil: d.snoozed_until };
  }

  async get(agentKey: string): Promise<Agent> {
    const { agent } = await this.http.get<{ agent: Agent }>(`/v1/agents/${encodeURIComponent(agentKey)}`);
    return agent;
  }

  async create(input: CreateAgentInput): Promise<Agent> {
    const { agent } = await this.http.post<{ agent: Agent }>('/v1/agents', input);
    return agent;
  }

  async update(agentKey: string, input: UpdateAgentInput): Promise<Agent> {
    const { agent } = await this.http.patch<{ agent: Agent }>(`/v1/agents/${encodeURIComponent(agentKey)}`, input);
    return agent;
  }

  async delete(agentKey: string): Promise<void> {
    await this.http.delete<void>(`/v1/agents/${encodeURIComponent(agentKey)}`);
  }

  /** Activates an agent for execution — a deliberate, separately audited transition distinct from update(). */
  async deploy(agentKey: string): Promise<Agent> {
    const { agent } = await this.http.post<{ agent: Agent }>(`/v1/agents/${encodeURIComponent(agentKey)}/deploy`);
    return agent;
  }

  async run(agentKey: string, input: RunAgentInput): Promise<AgentRunResult> {
    return this.http.post<AgentRunResult>(`/v1/agents/${encodeURIComponent(agentKey)}/run`, input);
  }

  /** Same input as run() — real-time step progress instead of a single awaited result. See AgentRunStreamEvent. */
  runStream(agentKey: string, input: RunAgentInput): AsyncGenerator<AgentRunStreamEvent, void, undefined> {
    return this.http.stream<AgentRunStreamEvent>(`/v1/agents/${encodeURIComponent(agentKey)}/run/stream`, input);
  }

  async listRuns(agentKey: string, options: ListOptions & { session_id?: string } = {}): Promise<{ runs: AgentRunSummary[]; pagination: Pagination }> {
    return this.http.get<{ runs: AgentRunSummary[]; pagination: Pagination }>(`/v1/agents/${encodeURIComponent(agentKey)}/runs${toQuery(options)}`);
  }

  async getRun(agentKey: string, runId: string): Promise<Record<string, unknown>> {
    const { run } = await this.http.get<{ run: Record<string, unknown> }>(`/v1/agents/${encodeURIComponent(agentKey)}/runs/${encodeURIComponent(runId)}`);
    return run;
  }

  async listSessions(agentKey: string, options: ListOptions = {}): Promise<{ sessions: AgentSession[]; pagination: Pagination }> {
    return this.http.get(`/v1/agents/${encodeURIComponent(agentKey)}/sessions${toQuery(options)}`);
  }

  async getTranscript(agentKey: string, sessionId: string): Promise<{ session: Record<string, unknown>; turns: Array<Record<string, unknown>> }> {
    return this.http.get(`/v1/agents/${encodeURIComponent(agentKey)}/sessions/${encodeURIComponent(sessionId)}/transcript`);
  }
}
