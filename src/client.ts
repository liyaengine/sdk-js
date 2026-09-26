import { HttpClient } from './http.js';
import { CollectionsResource } from './resources/collections.js';
import { AgentsResource } from './resources/agents.js';
import { WorkflowsResource } from './resources/workflows.js';
import { EvaluationsResource } from './resources/evaluations.js';
import { DomainsResource, IntentsResource } from './resources/domains.js';
import { DocumentsResource } from './resources/documents.js';
import { GuardrailPoliciesResource } from './resources/guardrailPolicies.js';
import { PromptsResource } from './resources/prompts.js';

export interface LiyaEngineOptions {
  /** Your tenant's API key (`liya_...`). Required. */
  apiKey: string;
  /** Override the API host — defaults to production. Useful for local/staging. */
  baseUrl?: string;
  /** Per-request timeout in ms. Default 30s. */
  timeoutMs?: number;
  /** Retries on 429/5xx responses and network failures. Default 2. */
  maxRetries?: number;
  /** Inject a custom fetch implementation (tests, non-standard runtimes). */
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = 'https://api.liyaengine.ai';

export class LiyaEngine {
  readonly collections: CollectionsResource;
  readonly agents: AgentsResource;
  readonly workflows: WorkflowsResource;
  readonly evaluations: EvaluationsResource;
  readonly domains: DomainsResource;
  readonly intents: IntentsResource;
  readonly documents: DocumentsResource;
  readonly guardrailPolicies: GuardrailPoliciesResource;
  readonly prompts: PromptsResource;

  constructor(options: LiyaEngineOptions) {
    if (!options.apiKey) {
      throw new Error('LiyaEngine: apiKey is required.');
    }
    const http = new HttpClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries,
      fetch: options.fetch,
    });
    this.collections = new CollectionsResource(http);
    this.agents = new AgentsResource(http);
    this.workflows = new WorkflowsResource(http);
    this.evaluations = new EvaluationsResource(http);
    this.domains = new DomainsResource(http);
    this.intents = new IntentsResource(http);
    this.documents = new DocumentsResource(http);
    this.guardrailPolicies = new GuardrailPoliciesResource(http);
    this.prompts = new PromptsResource(http);
  }
}
