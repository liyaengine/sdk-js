import type { HttpClient } from '../http.js';

/**
 * Per-stage enable/configure knobs for PII, content policy, schema/action
 * validation, hallucination check, and grounding. Every field is optional
 * and defaulted server-side — `{}` is a valid config. `blocked_topics` is
 * additive only: it can only ADD topics on top of the platform's hardcoded
 * universal floor (illegal activity, weapons, explicit content, injection
 * detection) — no policy on any plan can disable or override that floor.
 *
 * `content_policy.injection_detection` and the hallucination/grounding
 * check also gate whether the platform's ML classifier service runs (when
 * configured tenant-wide) — there's no separate "use ML" field; it's not a
 * per-policy setting.
 */
export interface GuardrailPolicyConfig {
  pre_llm?: {
    pii?: { enabled?: boolean; mode?: 'redact' | 'flag' | 'off'; entity_types?: string[] };
    content_policy?: {
      enabled?: boolean;
      injection_detection?: boolean;
      profanity_filter?: boolean;
      violence_filter?: boolean;
      blocked_topics?: string[];
    };
    input_max_length?: number;
  };
  post_llm?: {
    schema_validation?: { enabled?: boolean };
    action_validation?: { enabled?: boolean; allowed_actions?: string[] };
    hallucination_check?: { enabled?: boolean };
  };
}

export interface GuardrailPolicy {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  config: GuardrailPolicyConfig;
  created_at: string;
  updated_at: string;
  /** Only present on list() — attached-consumer count summed across domains/intents/agents/actions. */
  attached_count?: number;
}

export interface CreateGuardrailPolicyInput {
  name: string;
  description?: string;
  config?: GuardrailPolicyConfig;
  /** Demotes the tenant's current default policy in the same transaction. */
  is_default?: boolean;
}

export interface UpdateGuardrailPolicyInput {
  name?: string;
  description?: string | null;
  config?: GuardrailPolicyConfig;
  is_active?: boolean;
}

export type GuardrailConsumerType = 'domain' | 'intent' | 'agent' | 'action';

export interface GuardrailPolicyConnections {
  domains: Array<{ id: string; domain_key: string; display_name: string }>;
  intents: Array<{ id: string; domain_key: string; intent_key: string; display_name: string }>;
  agents: Array<{ id: string; name: string }>;
  actions: Array<{ id: string; name: string }>;
}

export interface GuardrailIssue {
  code: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  field?: string;
  action_taken: 'none' | 'modified' | 'blocked' | 'flagged';
  details?: Record<string, unknown>;
}

export interface TestGuardrailPolicyInput {
  /** Test a saved policy. Omit both this and `config` to test the tenant's default. */
  policy_id?: string;
  /** Test an unsaved draft — never persisted or attributed to a real policy row. */
  config?: GuardrailPolicyConfig;
  stage: 'pre_llm' | 'post_llm';
  content: string | Record<string, unknown>;
  /** post_llm only — without it, the hallucination/grounding check silently no-ops. */
  grounding_source_text?: string;
}

export interface TestGuardrailPolicyResult {
  passed: boolean;
  /** Present for stage: 'pre_llm' — content after any redaction. */
  content?: string;
  /** Present for stage: 'post_llm' — response after any stage modified it. */
  response?: string | Record<string, unknown>;
  issues: GuardrailIssue[];
  /** Present for pre_llm when passed is false — a user-safe message to show instead of calling an LLM. */
  fallback?: string;
  /** Present for post_llm — true when a stage suggests re-generating with stricter prompting. */
  shouldRetry?: boolean;
}

export interface GuardrailPolicyVersionSummary {
  id: string;
  version_number: number;
  changed_fields: Array<'name' | 'description' | 'config'>;
  change_type: 'create' | 'update' | 'restore';
  restored_from_version: number | null;
  created_by: string | null;
  actorName: string | null;
  created_at: string;
}

export interface GuardrailPolicyAnalytics {
  window_days: number;
  total_checks: number;
  blocked_checks: number;
  pass_rate: number | null;
  top_issue_codes: Array<{ code: string; count: number }>;
  trend: Array<{ date: string; total: number; blocked: number }>;
}

class GuardrailPolicyVersionsResource {
  constructor(private readonly http: HttpClient) {}

  /** Newest first, max 50. */
  async list(id: string): Promise<GuardrailPolicyVersionSummary[]> {
    const { versions } = await this.http.get<{ versions: GuardrailPolicyVersionSummary[] }>(
      `/v1/guardrail-policies/${encodeURIComponent(id)}/versions`,
    );
    return versions;
  }

  async get(id: string, versionNumber: number): Promise<GuardrailPolicyVersionSummary & Partial<GuardrailPolicy>> {
    const { version } = await this.http.get<{ version: GuardrailPolicyVersionSummary & Partial<GuardrailPolicy> }>(
      `/v1/guardrail-policies/${encodeURIComponent(id)}/versions/${versionNumber}`,
    );
    return version;
  }

  /** Writes the version's snapshot back onto the live policy. The restore itself is versioned too. */
  async restore(id: string, versionNumber: number): Promise<GuardrailPolicy> {
    const { policy } = await this.http.post<{ policy: GuardrailPolicy }>(
      `/v1/guardrail-policies/${encodeURIComponent(id)}/versions/${versionNumber}/restore`, {},
    );
    return policy;
  }
}

/**
 * Guardrail Policies — the tenant-configurable safety config that replaces
 * a single hardcoded, global pipeline every tenant used to share
 * identically. Attach a policy to a Domain, Intent, Agent, or Action; an
 * unattached consumer falls through to the tenant's `is_default` policy.
 * Every tenant always has exactly one default — creating or promoting a new
 * one demotes the previous, and the current default can't be deleted or
 * deactivated until another is promoted first.
 *
 * `attach()`/`detach()` are the ONLY way to set a consumer's
 * `guardrail_policy_id` — it is not writable via that consumer's own
 * create/update call (e.g. `agents.create()` has no `guardrail_policy_id`
 * field).
 */
export class GuardrailPoliciesResource {
  readonly versions: GuardrailPolicyVersionsResource;

  constructor(private readonly http: HttpClient) {
    this.versions = new GuardrailPolicyVersionsResource(http);
  }

  async list(): Promise<GuardrailPolicy[]> {
    const { policies } = await this.http.get<{ policies: GuardrailPolicy[] }>('/v1/guardrail-policies');
    return policies;
  }

  async get(id: string): Promise<GuardrailPolicy> {
    const { policy } = await this.http.get<{ policy: GuardrailPolicy }>(`/v1/guardrail-policies/${encodeURIComponent(id)}`);
    return policy;
  }

  async create(input: CreateGuardrailPolicyInput): Promise<GuardrailPolicy> {
    const { policy } = await this.http.post<{ policy: GuardrailPolicy }>('/v1/guardrail-policies', input);
    return policy;
  }

  async update(id: string, input: UpdateGuardrailPolicyInput): Promise<GuardrailPolicy> {
    const { policy } = await this.http.patch<{ policy: GuardrailPolicy }>(`/v1/guardrail-policies/${encodeURIComponent(id)}`, input);
    return policy;
  }

  /** Detaches from every consumer first, then deletes. The tenant default can't be deleted — promote a different policy first. */
  async delete(id: string): Promise<void> {
    await this.http.delete<void>(`/v1/guardrail-policies/${encodeURIComponent(id)}`);
  }

  /** Demotes the current default in the same transaction. An inactive policy can't be promoted — reactivate it first. */
  async setDefault(id: string): Promise<void> {
    await this.http.post<void>(`/v1/guardrail-policies/${encodeURIComponent(id)}/set-default`, {});
  }

  async attach(id: string, consumerType: GuardrailConsumerType, consumerId: string): Promise<void> {
    await this.http.post<void>(`/v1/guardrail-policies/${encodeURIComponent(id)}/attach`, {
      consumer_type: consumerType, consumer_id: consumerId,
    });
  }

  /** Only clears the consumer's guardrail_policy_id if it currently points at THIS policy — safe to call even if it's already unattached. */
  async detach(id: string, consumerType: GuardrailConsumerType, consumerId: string): Promise<void> {
    await this.http.post<void>(`/v1/guardrail-policies/${encodeURIComponent(id)}/detach`, {
      consumer_type: consumerType, consumer_id: consumerId,
    });
  }

  async connections(id: string): Promise<GuardrailPolicyConnections> {
    return this.http.get<GuardrailPolicyConnections>(`/v1/guardrail-policies/${encodeURIComponent(id)}/connections`);
  }

  /** Plain aggregation, computed on the fly — not a cached rollup. */
  async analytics(id: string, days?: number): Promise<GuardrailPolicyAnalytics> {
    const qs = days !== undefined ? `?days=${days}` : '';
    return this.http.get<GuardrailPolicyAnalytics>(`/v1/guardrail-policies/${encodeURIComponent(id)}/analytics${qs}`);
  }

  /**
   * Runs the real guardrail pipeline against `content` — the same stages a
   * live request would hit. Pass `config` to test an unsaved draft, or
   * `policy_id` to test a saved one; omit both to test the tenant's
   * current default.
   */
  async test(input: TestGuardrailPolicyInput): Promise<TestGuardrailPolicyResult> {
    return this.http.post<TestGuardrailPolicyResult>('/v1/guardrail-policies/test', input);
  }
}
