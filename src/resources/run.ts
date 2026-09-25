/**
 * Types for POST /v1/run and POST /v1/run/stream — the primary way to
 * invoke LiyaEngine directly (no Domain/Agent/Workflow object to create
 * first). Methods live on IntentsResource (client.intents.run/.stream),
 * pairing with its listAll() catalog: list what you can run, then run it.
 */

export type RunPack = 'enterprise-chat' | 'hiring' | 'fintech' | 'healthcare' | 'ehs' | 'compliance' | (string & {});

export interface RunIntentInput {
  /**
   * A custom domain_key, or a built-in pack's domain (chat, hiring,
   * fintech, healthcare, ehs, compliance). Defaults to 'hiring' if neither
   * this nor `pack` is given — a historical default carried over from the
   * API itself, not a recommendation. Pass one explicitly.
   */
  domain?: string;
  /** Product-facing alias for domain (e.g. 'enterprise-chat' resolves to the 'chat' domain). Wins over `domain` if both are set. */
  pack?: RunPack;
  intent: string;
  input?: Record<string, unknown>;
  /** Shorthand for input.message. */
  message?: string;
  session_id?: string;
  retrieval?: Record<string, unknown>;
  guardrails?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
}

export interface RunMeta {
  intent: string;
  domain: string;
  model_used: string;
  tokens_used: number;
  cost_usd: number;
  latency_ms: number;
  cached: boolean;
  agentic_execution?: unknown;
  knowledge_context?: unknown[];
}

export interface RunUsage {
  requests_used: number;
  tokens_used: number;
  requests_remaining: number | null;
  tokens_remaining: number | null;
}

/** data's shape when domain === 'chat'. */
export interface ChatRunData {
  response: {
    content: string;
    intent: string;
    confidence: number | null;
    sources: Array<Record<string, unknown>>;
    metadata: { guardrails_passed: boolean; grounding_verified: boolean; flags: string[] };
    escalation?: Record<string, unknown>;
  };
  session: { id: string | null; turns: number; memory_updated: boolean };
  execution: { steps: number; latency_ms: number; retrieval_ms: number };
}

/** data's shape for every other domain (built-in non-chat, or a custom domain_key). */
export interface StandardRunData {
  output: Record<string, unknown>;
  session_id: string;
  message_id: string;
}

export interface RunIntentResult {
  data: ChatRunData | StandardRunData;
  /**
   * Absent in exactly one narrow case: a chat session that has exhausted its
   * per-session token budget short-circuits to a canned escalation message
   * (still success:true, still ChatRunData-shaped) with no metadata/usage
   * siblings at all — a real, pre-existing envelope inconsistency on this
   * endpoint, not an SDK gap.
   */
  metadata?: RunMeta;
  usage?: RunUsage;
}

export type RunStreamEvent =
  | { type: 'token'; delta: string }
  | { type: 'done'; session_id: string; latency_ms: number; input_tokens: number; output_tokens: number; cost_usd: number; served_by: 'platform' | 'byok' }
  | { type: 'error'; message: string };

export function translateRunInput(input: RunIntentInput): Record<string, unknown> {
  return {
    ...(input.pack !== undefined && { pack: input.pack }),
    ...(input.domain !== undefined && { domain: input.domain }),
    intent: input.intent,
    ...(input.input !== undefined && { input: input.input }),
    ...(input.message !== undefined && { message: input.message }),
    ...(input.session_id !== undefined && { session_id: input.session_id }),
    ...(input.retrieval !== undefined && { retrieval: input.retrieval }),
    ...(input.guardrails !== undefined && { guardrails: input.guardrails }),
    ...(input.metadata !== undefined && { metadata: input.metadata }),
    ...(input.preferences !== undefined && { preferences: input.preferences }),
  };
}
