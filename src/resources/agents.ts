import type { HttpClient } from '../http.js';

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
