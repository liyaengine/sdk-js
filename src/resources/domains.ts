import type { HttpClient } from '../http.js';

/**
 * Raw LiyaCustomDomain row — v1 create/update only accept the fields listed
 * on CreateDomainInput/UpdateDomainInput below, but reads return every
 * column, including some only the dashboard can currently write:
 * `status`, `guardrail_policy_id`, `prompt_binding`, `tools_config`,
 * `default_top_k`, `default_similarity_threshold`. Those are typed loosely
 * here (or omitted) since this door can't set them yet.
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
  context_enrichment_webhook_url: string | null;
  retrieval_scope: 'domain_only' | 'domain_plus_global' | 'global_only' | null;
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
  system_prompt?: string;
  context_enrichment_webhook_url?: string;
}

export interface UpdateDomainInput {
  display_name?: string;
  description?: string;
  icon?: string;
  color?: string;
  system_prompt?: string;
  retrieval_scope?: 'domain_only' | 'domain_plus_global' | 'global_only';
  context_enrichment_webhook_url?: string;
}

/**
 * Raw LiyaCustomIntent row. `agent_config`/`execution_config`/
 * `retrieval_config`/`cache_config`/`prompt_binding`/`guardrail_policy_id`
 * are real columns but dashboard-only to write today — not yet on
 * CreateIntentInput/UpdateIntentInput.
 */
export interface Intent {
  id: string;
  tenant_id: string;
  domain_key: string;
  intent_key: string;
  display_name: string;
  description: string | null;
  prompt_template: string;
  output_schema: Record<string, unknown> | null;
  input_schema: Record<string, unknown> | null;
  guardrails_config: Record<string, unknown> | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateIntentInput {
  intent_key: string;
  display_name: string;
  /** The actual prompt sent to the model — required. */
  prompt_template: string;
  description?: string;
  output_schema?: Record<string, unknown>;
  input_schema?: Record<string, unknown>;
  guardrails_config?: Record<string, unknown>;
}

export interface UpdateIntentInput {
  display_name?: string;
  description?: string;
  prompt_template?: string;
  output_schema?: Record<string, unknown>;
  input_schema?: Record<string, unknown>;
  guardrails_config?: Record<string, unknown>;
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

class DomainIntentsResource {
  constructor(private readonly http: HttpClient) {}

  async list(domainKey: string): Promise<Intent[]> {
    const { intents } = await this.http.get<{ intents: Intent[] }>(`/v1/domains/${encodeURIComponent(domainKey)}/intents`);
    return intents;
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
      promptTemplate: input.prompt_template,
      ...(input.description !== undefined && { description: input.description }),
      ...(input.output_schema !== undefined && { outputSchema: input.output_schema }),
      ...(input.input_schema !== undefined && { inputSchema: input.input_schema }),
      ...(input.guardrails_config !== undefined && { guardrailsConfig: input.guardrails_config }),
    });
    return intent;
  }

  /**
   * Returns `{ updated: number }`, not the updated Intent — this door has no
   * GET-single-intent route to re-fetch from either. Call list() again if
   * you need the fresh object.
   */
  async update(domainKey: string, intentKey: string, input: UpdateIntentInput): Promise<{ updated: number }> {
    return this.http.patch<{ updated: number }>(`/v1/domains/${encodeURIComponent(domainKey)}/intents/${encodeURIComponent(intentKey)}`, {
      ...(input.display_name !== undefined && { displayName: input.display_name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.prompt_template !== undefined && { promptTemplate: input.prompt_template }),
      ...(input.output_schema !== undefined && { outputSchema: input.output_schema }),
      ...(input.input_schema !== undefined && { inputSchema: input.input_schema }),
      ...(input.guardrails_config !== undefined && { guardrailsConfig: input.guardrails_config }),
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
 * the full /v1/domains surface. Basic CRUD only today — agent/execution/
 * retrieval/cache config, guardrail policy attachment, and versioning are
 * still dashboard-only (no /v1 route yet).
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
      ...(input.context_enrichment_webhook_url !== undefined && { contextEnrichmentWebhookUrl: input.context_enrichment_webhook_url }),
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
      ...(input.retrieval_scope !== undefined && { retrievalScope: input.retrieval_scope }),
      ...(input.context_enrichment_webhook_url !== undefined && { contextEnrichmentWebhookUrl: input.context_enrichment_webhook_url }),
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
 * discovery (mirrors the dashboard's API Explorer page). Read-only; create/
 * update/delete an intent via `client.domains.intents`.
 */
export class IntentsResource {
  constructor(private readonly http: HttpClient) {}

  async listAll(): Promise<IntentCatalogEntry[]> {
    const { intents } = await this.http.get<{ intents: IntentCatalogEntry[]; total: number }>('/v1/intents');
    return intents;
  }
}
