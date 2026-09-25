import type { HttpClient } from '../http.js';
import type { RunIntentInput, RunIntentResult, RunStreamEvent } from './run.js';
import { translateRunInput } from './run.js';

/**
 * A Prompt Studio library source, pinned to one exact, immutable, content-
 * hashed version — deliberately rejects mutable aliases like "latest" or
 * "production". Pass this instead of inline `system_prompt`/`prompt_template`
 * text to bind to a tenant's versioned prompt library. Setting a binding
 * server-side materializes its content into the legacy text field for
 * backward-compatible runtime execution; editing the text field directly
 * without touching the binding detaches it (see `create`/`update` docs
 * below).
 */
export type PromptBinding =
  | { kind: 'inline'; content: string }
  | { kind: 'library_version'; prompt_id: string; version_id: string; content_hash: string };

/**
 * Raw LiyaCustomDomain row — v1 create/update only accept the fields listed
 * on CreateDomainInput/UpdateDomainInput below, but reads return every
 * column, including some only the dashboard can currently write:
 * `guardrail_policy_id`, `tools_config`, `default_top_k`,
 * `default_similarity_threshold`. Those are typed loosely here (or omitted)
 * since this door can't set them yet.
 */
export interface Domain {
  id: string;
  tenant_id: string;
  domain_key: string;
  display_name: string;
  description: string | null;
  icon: string;
  color: string;
  system_prompt: string | null;
  prompt_binding: PromptBinding | null;
  context_enrichment_webhook_url: string | null;
  retrieval_scope: 'domain_only' | 'domain_plus_global' | 'global_only' | null;
  /** Workflow/visibility label — independent of is_active, doesn't gate execution. */
  status: 'draft' | 'active' | 'archived';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  /** Present on get()/list() only when a domain has intents/source types — not on create(). */
  intents?: Intent[];
  source_types?: DomainSource[];
}

export interface CreateDomainInput {
  domain_key: string;
  display_name: string;
  description?: string;
  icon?: string;
  color?: string;
  /** Ignored if prompt_binding is also set — the binding's resolved content wins. */
  system_prompt?: string;
  prompt_binding?: PromptBinding | null;
  context_enrichment_webhook_url?: string;
  status?: 'draft' | 'active' | 'archived';
}

export interface UpdateDomainInput {
  display_name?: string;
  description?: string;
  icon?: string;
  color?: string;
  /**
   * Editing this directly, without also passing prompt_binding, detaches
   * any existing library binding on this domain — the server always
   * materializes an inline text edit as a standalone value.
   */
  system_prompt?: string;
  /** Pass null to explicitly detach an existing binding and keep the current text as-is. */
  prompt_binding?: PromptBinding | null;
  retrieval_scope?: 'domain_only' | 'domain_plus_global' | 'global_only';
  context_enrichment_webhook_url?: string;
  status?: 'draft' | 'active' | 'archived';
}

/**
 * Raw LiyaCustomIntent row. `guardrail_policy_id` is a real column but
 * dashboard-only to write today — not yet on CreateIntentInput/UpdateIntentInput.
 */
export interface Intent {
  id: string;
  tenant_id: string;
  domain_key: string;
  intent_key: string;
  display_name: string;
  description: string | null;
  prompt_template: string;
  prompt_binding: PromptBinding | null;
  output_schema: Record<string, unknown> | null;
  input_schema: Record<string, unknown> | null;
  guardrails_config: Record<string, unknown> | null;
  agent_config: Record<string, unknown> | null;
  execution_config: Record<string, unknown> | null;
  retrieval_config: Record<string, unknown> | null;
  cache_config: Record<string, unknown> | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateIntentInput {
  intent_key: string;
  display_name: string;
  /** Required unless prompt_binding is set instead. */
  prompt_template?: string;
  prompt_binding?: PromptBinding | null;
  description: string;
  output_schema?: Record<string, unknown>;
  input_schema?: Record<string, unknown>;
  guardrails_config?: Record<string, unknown>;
  agent_config?: Record<string, unknown>;
  execution_config?: Record<string, unknown>;
  retrieval_config?: Record<string, unknown>;
  cache_config?: Record<string, unknown>;
}

export interface UpdateIntentInput {
  display_name?: string;
  description?: string;
  /** Editing this without prompt_binding detaches any existing binding — see UpdateDomainInput's identical note. */
  prompt_template?: string;
  prompt_binding?: PromptBinding | null;
  output_schema?: Record<string, unknown>;
  input_schema?: Record<string, unknown>;
  guardrails_config?: Record<string, unknown>;
  agent_config?: Record<string, unknown>;
  execution_config?: Record<string, unknown>;
  retrieval_config?: Record<string, unknown>;
  cache_config?: Record<string, unknown>;
  sort_order?: number;
  /** Pass an empty string to clear an existing override. */
  model_override?: string;
  is_active?: boolean;
}

export interface IntentVersionSummary {
  id: string;
  version_number: number;
  changed_fields: string[];
  change_type: 'create' | 'update' | 'restore';
  restored_from_version: number | null;
  created_by: string | null;
  actorName: string | null;
  created_at: string;
}

export interface IntentCatalogEntry {
  domain: string;
  domainLabel: string;
  intent: string;
  displayName: string;
  description: string | null;
  endpoint: string;
  method: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown> | null;
}

/**
 * A domain-scoped view of a Collection — same underlying resource as
 * `client.collections`, exposed here for convenience when you're already
 * working domain-first. Prefer `client.collections` for the full
 * config surface (chunking, retrieval_config, etc.); this sub-resource only
 * covers the create/list/delete + attach-a-document routes nested under a domain.
 */
export interface DomainSource {
  id: string;
  tenant_id: string;
  domain_key: string;
  slug: string;
  label: string;
  color: string;
  created_at: string;
  /** Present on create() only. */
  domain_keys?: string[];
}

export interface CreateDomainSourceInput {
  slug: string;
  label: string;
  color?: string;
}

export interface UploadedDocument {
  id: string;
  name: string;
  chunks: number;
  sizeKb: number;
  uploadedAt: string;
}

export interface QueryDomainInput {
  query: string;
  /** Max results to return. */
  top_k?: number;
}

export interface QueryDomainResult {
  results: Array<{ content: string; score: number; source_id?: string; metadata?: Record<string, unknown> }>;
  total: number;
}

class DomainIntentVersionsResource {
  constructor(private readonly http: HttpClient) {}

  /** Newest first, max 50. */
  async list(domainKey: string, intentKey: string): Promise<IntentVersionSummary[]> {
    const { versions } = await this.http.get<{ versions: IntentVersionSummary[] }>(
      `/v1/domains/${encodeURIComponent(domainKey)}/intents/${encodeURIComponent(intentKey)}/versions`,
    );
    return versions;
  }

  async get(domainKey: string, intentKey: string, versionNumber: number): Promise<IntentVersionSummary & Partial<Intent>> {
    const { version } = await this.http.get<{ version: IntentVersionSummary & Partial<Intent> }>(
      `/v1/domains/${encodeURIComponent(domainKey)}/intents/${encodeURIComponent(intentKey)}/versions/${versionNumber}`,
    );
    return version;
  }

  /** Writes the version's snapshot back onto the live intent. The restore itself is versioned too. */
  async restore(domainKey: string, intentKey: string, versionNumber: number): Promise<Intent> {
    const { intent } = await this.http.post<{ intent: Intent }>(
      `/v1/domains/${encodeURIComponent(domainKey)}/intents/${encodeURIComponent(intentKey)}/versions/${versionNumber}/restore`, {},
    );
    return intent;
  }
}

class DomainIntentsResource {
  readonly versions: DomainIntentVersionsResource;

  constructor(private readonly http: HttpClient) {
    this.versions = new DomainIntentVersionsResource(http);
  }

  async list(domainKey: string): Promise<Intent[]> {
    const { intents } = await this.http.get<{ intents: Intent[] }>(`/v1/domains/${encodeURIComponent(domainKey)}/intents`);
    return intents;
  }

  /** No GET-single-intent route existed before this — now it does. */
  async get(domainKey: string, intentKey: string): Promise<Intent> {
    const { intent } = await this.http.get<{ intent: Intent }>(`/v1/domains/${encodeURIComponent(domainKey)}/intents/${encodeURIComponent(intentKey)}`);
    return intent;
  }

  // /v1/domains/:key/intents predates the snake_case wire convention every
  // other /v1 resource in this SDK uses, and has real external consumers
  // (A3LearningLabs, Qistara, StoryHire per the API's own doc comment) — its
  // request bodies are camelCase. Translated here so this SDK's own public
  // shape stays consistent with every other resource; changing the wire
  // format itself would break those existing integrations.
  async create(domainKey: string, input: CreateIntentInput): Promise<Intent> {
    const { intent } = await this.http.post<{ intent: Intent }>(`/v1/domains/${encodeURIComponent(domainKey)}/intents`, {
      intentKey: input.intent_key,
      displayName: input.display_name,
      description: input.description,
      ...(input.prompt_template !== undefined && { promptTemplate: input.prompt_template }),
      ...(input.prompt_binding !== undefined && { promptBinding: input.prompt_binding }),
      ...(input.output_schema !== undefined && { outputSchema: input.output_schema }),
      ...(input.input_schema !== undefined && { inputSchema: input.input_schema }),
      ...(input.guardrails_config !== undefined && { guardrailsConfig: input.guardrails_config }),
      ...(input.agent_config !== undefined && { agentConfig: input.agent_config }),
      ...(input.execution_config !== undefined && { executionConfig: input.execution_config }),
      ...(input.retrieval_config !== undefined && { retrievalConfig: input.retrieval_config }),
      ...(input.cache_config !== undefined && { cacheConfig: input.cache_config }),
    });
    return intent;
  }

  /**
   * Returns `{ updated: number }`, not the updated Intent — call get() again
   * for the fresh object.
   */
  async update(domainKey: string, intentKey: string, input: UpdateIntentInput): Promise<{ updated: number }> {
    return this.http.patch<{ updated: number }>(`/v1/domains/${encodeURIComponent(domainKey)}/intents/${encodeURIComponent(intentKey)}`, {
      ...(input.display_name !== undefined && { displayName: input.display_name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.prompt_template !== undefined && { promptTemplate: input.prompt_template }),
      ...(input.prompt_binding !== undefined && { promptBinding: input.prompt_binding }),
      ...(input.output_schema !== undefined && { outputSchema: input.output_schema }),
      ...(input.input_schema !== undefined && { inputSchema: input.input_schema }),
      ...(input.guardrails_config !== undefined && { guardrailsConfig: input.guardrails_config }),
      ...(input.agent_config !== undefined && { agentConfig: input.agent_config }),
      ...(input.execution_config !== undefined && { executionConfig: input.execution_config }),
      ...(input.retrieval_config !== undefined && { retrievalConfig: input.retrieval_config }),
      ...(input.cache_config !== undefined && { cacheConfig: input.cache_config }),
      ...(input.sort_order !== undefined && { sortOrder: input.sort_order }),
      ...(input.model_override !== undefined && { modelOverride: input.model_override }),
      ...(input.is_active !== undefined && { isActive: input.is_active }),
    });
  }

  /** Soft delete. */
  async delete(domainKey: string, intentKey: string): Promise<void> {
    await this.http.delete<void>(`/v1/domains/${encodeURIComponent(domainKey)}/intents/${encodeURIComponent(intentKey)}`);
  }
}

class DomainSourcesResource {
  constructor(private readonly http: HttpClient) {}

  async list(domainKey: string): Promise<DomainSource[]> {
    const { sources } = await this.http.get<{ sources: DomainSource[] }>(`/v1/domains/${encodeURIComponent(domainKey)}/sources`);
    return sources;
  }

  async create(domainKey: string, input: CreateDomainSourceInput): Promise<DomainSource> {
    const { sourceType } = await this.http.post<{ sourceType: DomainSource }>(`/v1/domains/${encodeURIComponent(domainKey)}/sources`, input);
    return sourceType;
  }

  async delete(domainKey: string, slug: string): Promise<void> {
    await this.http.delete<void>(`/v1/domains/${encodeURIComponent(domainKey)}/sources/${encodeURIComponent(slug)}`);
  }
}

/**
 * Custom domains — the top-level container tenants configure first (system
 * prompt, retrieval scope, then intents and knowledge underneath). Mirrors
 * the full /v1/domains surface, including intent versioning
 * (`intents.versions`) and the agent/execution/retrieval/cache config
 * blobs. Guardrail policy attachment is still dashboard-only (no /v1 route
 * for that yet — a separate resource entirely).
 */
export class DomainsResource {
  readonly intents: DomainIntentsResource;
  readonly sources: DomainSourcesResource;

  constructor(private readonly http: HttpClient) {
    this.intents = new DomainIntentsResource(http);
    this.sources = new DomainSourcesResource(http);
  }

  async list(): Promise<Domain[]> {
    const { domains } = await this.http.get<{ domains: Domain[] }>('/v1/domains');
    return domains;
  }

  /** Includes this domain's intents and source types. */
  async get(domainKey: string): Promise<Domain> {
    const { domain } = await this.http.get<{ domain: Domain }>(`/v1/domains/${encodeURIComponent(domainKey)}`);
    return domain;
  }

  // /v1/domains predates the snake_case wire convention every other /v1
  // resource in this SDK uses, and has real external consumers
  // (A3LearningLabs, Qistara, StoryHire per the API's own doc comment) — its
  // request bodies are camelCase. Translated here so this SDK's own public
  // shape stays consistent with every other resource.
  async create(input: CreateDomainInput): Promise<Domain> {
    const { domain } = await this.http.post<{ domain: Domain }>('/v1/domains', {
      domainKey: input.domain_key,
      displayName: input.display_name,
      ...(input.description !== undefined && { description: input.description }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.system_prompt !== undefined && { systemPrompt: input.system_prompt }),
      ...(input.prompt_binding !== undefined && { promptBinding: input.prompt_binding }),
      ...(input.context_enrichment_webhook_url !== undefined && { contextEnrichmentWebhookUrl: input.context_enrichment_webhook_url }),
      ...(input.status !== undefined && { status: input.status }),
    });
    return domain;
  }

  /** Returns `{ updated: number }`, not the updated Domain — call get() again for the fresh object. */
  async update(domainKey: string, input: UpdateDomainInput): Promise<{ updated: number }> {
    return this.http.patch<{ updated: number }>(`/v1/domains/${encodeURIComponent(domainKey)}`, {
      ...(input.display_name !== undefined && { displayName: input.display_name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.icon !== undefined && { icon: input.icon }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.system_prompt !== undefined && { systemPrompt: input.system_prompt }),
      ...(input.prompt_binding !== undefined && { promptBinding: input.prompt_binding }),
      ...(input.retrieval_scope !== undefined && { retrievalScope: input.retrieval_scope }),
      ...(input.context_enrichment_webhook_url !== undefined && { contextEnrichmentWebhookUrl: input.context_enrichment_webhook_url }),
      ...(input.status !== undefined && { status: input.status }),
    });
  }

  /** Soft delete. */
  async delete(domainKey: string): Promise<void> {
    await this.http.delete<void>(`/v1/domains/${encodeURIComponent(domainKey)}`);
  }

  /**
   * Direct retrieval — runs this domain's knowledge search with no LLM call
   * and no intent involved. Useful for testing collection/retrieval-scope
   * configuration, or for building your own retrieval-then-generate flow.
   */
  async query(domainKey: string, input: QueryDomainInput): Promise<QueryDomainResult> {
    return this.http.post<QueryDomainResult>(`/v1/domains/${encodeURIComponent(domainKey)}/query`, input);
  }

  /**
   * Uploads a file (base64), extracts text, chunks, embeds, and attaches it
   * to the named source (collection) — a real but narrow ingestion path:
   * no category, no URL crawl, no async job, and it always uses
   * text-embedding-3-small regardless of the collection's own
   * default_embedding_model. For anything beyond a quick file drop, use the
   * dashboard's Knowledge tab today.
   */
  async uploadDocument(domainKey: string, sourceSlug: string, input: { fileBase64: string; fileName: string }): Promise<UploadedDocument> {
    const { document } = await this.http.post<{ document: UploadedDocument }>(
      `/v1/domains/${encodeURIComponent(domainKey)}/sources/${encodeURIComponent(sourceSlug)}/docs`, input,
    );
    return document;
  }
}

/**
 * Flat intent catalog — cuts across every custom domain, for external
 * discovery (mirrors the dashboard's API Explorer page) — plus `run()`/
 * `stream()`, the primary way to actually invoke LiyaEngine: list what you
 * can run here, run it below. Create/update/delete an intent via
 * `client.domains.intents` instead — this resource doesn't own that.
 */
export class IntentsResource {
  constructor(private readonly http: HttpClient) {}

  async listAll(): Promise<IntentCatalogEntry[]> {
    const { intents } = await this.http.get<{ intents: IntentCatalogEntry[]; total: number }>('/v1/intents');
    return intents;
  }

  /**
   * Run any intent — built-in pack or custom domain — and get one JSON
   * response back. This is the endpoint every other execution path
   * (`agents.run()`, a domain's public `/v1/{domain}/{intent}` route)
   * ultimately reaches; call this directly when you don't need an Agent's
   * multi-turn orchestration on top.
   */
  async run(input: RunIntentInput): Promise<RunIntentResult> {
    return this.http.postEnvelope<RunIntentResult>('/v1/run', translateRunInput(input));
  }

  /**
   * Same request shape as `run()`, delivered as a token-by-token stream
   * instead of one response — iterate with `for await`.
   *
   * Built-in packs only (chat, hiring, fintech, healthcare, ehs,
   * compliance). A custom-domain intent throws a LiyaEngineAPIError
   * (`STREAMING_NOT_SUPPORTED`) immediately, before the stream opens — use
   * `run()` for those. Once the stream *has* opened, every other failure
   * (quota, provider error) arrives as an in-band `{type:'error'}` event,
   * not a thrown error — always check `event.type` in your loop.
   */
  stream(input: RunIntentInput): AsyncGenerator<RunStreamEvent, void, undefined> {
    return this.http.stream<RunStreamEvent>('/v1/run/stream', translateRunInput(input));
  }
}
