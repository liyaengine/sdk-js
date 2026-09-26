import type { HttpClient } from '../http.js';

/** Referenced in `content` as `{{name}}`. */
export interface PromptVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  required?: boolean;
  description?: string;
  default?: unknown;
}

export interface PromptModelHints {
  provider?: string;
  model?: string;
  temperature?: number;
  max_output_tokens?: number;
}

export interface PromptVersion {
  id: string;
  prompt_id: string;
  version_number: number;
  content: string;
  variables: PromptVariable[];
  output_schema: Record<string, unknown> | null;
  model_hints: PromptModelHints | null;
  provenance: Record<string, unknown> | null;
  /** Re-verified at PromptBinding resolve time — tamper-evident. */
  content_hash: string;
  change_note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PromptDeployment {
  environment: string;
  version_id: string;
  deployed_at: string;
}

export interface Prompt {
  id: string;
  prompt_key: string;
  name: string;
  description: string | null;
  role: 'system' | 'developer' | 'user' | 'assistant';
  tags: string[];
  status: 'draft' | 'active' | 'archived';
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  /** Only the single latest version — call `versions.list()` for full history. */
  versions: PromptVersion[];
  deployments: PromptDeployment[];
}

export interface PromptContentInput {
  content: string;
  variables?: PromptVariable[];
  output_schema?: Record<string, unknown>;
  model_hints?: PromptModelHints;
  change_note?: string;
}

export interface CreatePromptInput extends PromptContentInput {
  /** Lowercase letters, numbers, hyphens, or underscores. */
  prompt_key: string;
  name: string;
  description?: string;
  role?: 'system' | 'developer' | 'user' | 'assistant';
  tags?: string[];
}

export type CreatePromptVersionInput = PromptContentInput;

export interface ListPromptsFilter {
  /** Matches name, prompt_key, or an exact tag. */
  search?: string;
  status?: 'draft' | 'active' | 'archived';
}

export interface PublishPromptResult {
  deployment: {
    id: string;
    environment: string;
    version_id: string;
    deployed_by: string | null;
    deployment_note: string | null;
    deployed_at: string;
  };
  /** True if the requested version was already the live one — still a success, not an error. */
  unchanged: boolean;
}

class PromptVersionsResource {
  constructor(private readonly http: HttpClient) {}

  /** Newest first, max 100. */
  async list(promptId: string): Promise<PromptVersion[]> {
    const { versions } = await this.http.get<{ versions: PromptVersion[] }>(`/v1/prompts/${encodeURIComponent(promptId)}/versions`);
    return versions;
  }

  /**
   * A no-op save (content/variables/output_schema/model_hints all identical
   * to the current latest version) throws a typed LiyaEngineAPIError
   * (`PROMPT_VERSION_UNCHANGED`, 409) instead of creating an empty entry.
   */
  async create(promptId: string, input: CreatePromptVersionInput): Promise<PromptVersion> {
    const { version } = await this.http.post<{ version: PromptVersion }>(`/v1/prompts/${encodeURIComponent(promptId)}/versions`, input);
    return version;
  }
}

/**
 * Prompt Studio — a versioned, immutably-pinned prompt library. A prompt's
 * content only ever changes by adding a new version via `versions.create()`
 * — there is no update-in-place. `publish()` promotes one exact version to
 * the tenant's production pointer; existing consumers bound via
 * `prompt_binding: { kind: 'library_version', ... }` stay pinned to their
 * own version until explicitly repointed. AI-authoring (draft/improve with
 * Prompt Copilot) is dashboard-only — no SDK equivalent.
 */
export class PromptsResource {
  readonly versions: PromptVersionsResource;

  constructor(private readonly http: HttpClient) {
    this.versions = new PromptVersionsResource(http);
  }

  async list(filter: ListPromptsFilter = {}): Promise<Prompt[]> {
    const params = new URLSearchParams();
    if (filter.search !== undefined) params.set('search', filter.search);
    if (filter.status !== undefined) params.set('status', filter.status);
    const qs = params.toString();
    const { prompts } = await this.http.get<{ prompts: Prompt[] }>(`/v1/prompts${qs ? `?${qs}` : ''}`);
    return prompts;
  }

  async get(promptId: string): Promise<Prompt> {
    const { prompt } = await this.http.get<{ prompt: Prompt }>(`/v1/prompts/${encodeURIComponent(promptId)}`);
    return prompt;
  }

  /** Creates the prompt and its immutable version 1 in one call — there is no separate "create empty prompt" step. */
  async create(input: CreatePromptInput): Promise<Prompt> {
    const { prompt } = await this.http.post<{ prompt: Prompt }>('/v1/prompts', input);
    return prompt;
  }

  async publish(promptId: string, input: { version_id: string; deployment_note?: string }): Promise<PublishPromptResult> {
    return this.http.post<PublishPromptResult>(`/v1/prompts/${encodeURIComponent(promptId)}/publish`, input);
  }
}
