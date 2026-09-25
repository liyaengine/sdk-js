import type { HttpClient } from '../http.js';

/**
 * A domain's agentic tool configuration — the custom webhook tools (and
 * enabled platform tools) an agent-mode intent (agent_config.enabled) can
 * call mid-conversation. Was dashboard-only before this; the tool's real
 * definition (endpoint, auth) can now be set from here too, not just
 * referenced by name in an intent's agent_config.tools[].
 */
export interface PlatformTool {
  name: string;
  description: string;
  enabled: boolean;
}

export interface CustomToolInput {
  /** URL-safe slug (/^[a-z0-9_-]+$/) — what agent_config.tools[] references, and what the model passes as tool_name at run time. */
  name: string;
  display_name: string;
  /** The only thing the model sees to decide when/how to call this tool — there's no separate JSON-schema parameter definition today. Be explicit about expected fields here. */
  description: string;
  /** Must be HTTPS with no embedded credentials. */
  endpoint_url: string;
  auth_type: 'none' | 'api_key' | 'bearer';
  /** Write-only. Omit on update to keep the existing stored credential — never blanks one out by omission. Required on first create for any auth_type other than 'none'. */
  auth_value?: string;
}

/** A CustomTool as returned by the API — auth_value replaced by auth_configured; the real credential is never returned once stored. */
export type MaskedCustomTool = Omit<CustomToolInput, 'auth_value'> & { auth_configured: boolean };

export interface DomainToolsConfig {
  platform_tools: PlatformTool[];
  custom_tools: MaskedCustomTool[];
  web_search_configured: boolean;
}

export interface UpdateDomainToolsInput {
  enabled_platform_tools?: string[];
  /** When present, REPLACES the entire custom_tools array — not a per-tool merge/patch. */
  custom_tools?: CustomToolInput[];
  /** '' clears the stored key; omit to leave it unchanged. */
  web_search_api_key?: string;
}

export interface TestDomainToolResult {
  status_code: number;
  ok: boolean;
  body: unknown;
  latency_ms: number;
}

/**
 * Domain-scoped tool configuration. Sits at client.domains.tools rather
 * than a top-level resource — a tool only ever exists in the context of
 * the one domain it's defined on.
 */
export class DomainToolsResource {
  constructor(private readonly http: HttpClient) {}

  async get(domainKey: string): Promise<DomainToolsConfig> {
    return this.http.get<DomainToolsConfig>(`/v1/domains/${encodeURIComponent(domainKey)}/tools`);
  }

  async update(domainKey: string, input: UpdateDomainToolsInput): Promise<{ tools_config: DomainToolsConfig }> {
    return this.http.patch<{ tools_config: DomainToolsConfig }>(`/v1/domains/${encodeURIComponent(domainKey)}/tools`, input);
  }

  /**
   * Dispatches a real request to one custom tool's endpoint_url — the exact
   * same request shape (headers, auth, `_liya_meta` envelope) an agent's
   * real `webhook_sender` tool call would send — without needing a live
   * conversation to trigger it. Useful for verifying a tool definition
   * actually works before wiring it into a deployed intent.
   */
  async test(domainKey: string, toolName: string, payload?: Record<string, unknown>): Promise<TestDomainToolResult> {
    return this.http.post<TestDomainToolResult>(`/v1/domains/${encodeURIComponent(domainKey)}/tools/test`, {
      tool_name: toolName,
      ...(payload !== undefined && { payload }),
    });
  }
}
