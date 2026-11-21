import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LiyaEngine } from './client.js';

const BASE_URL = 'https://api.test.liyaengine.ai';

const fixtureSummary = {
  kind: 'request' as const,
  traceId: 'msg_xyz',
  name: 'custom_support_resolve_ticket',
  status: null,
  parent: null,
  sessionId: 'ses_abc',
  requestId: 'req_1',
  userId: 'usr_123',
  intent: 'custom_support_resolve_ticket',
  domain: 'custom:support',
  modelUsed: 'claude-sonnet-5',
  inputTokens: 820,
  outputTokens: 420,
  totalTokens: 1240,
  costUsd: '0.002100',
  latencyMs: 340,
  ttftMs: null,
  flagged: true,
  flagReason: 'PII_EMAIL_REDACTED',
  piiDetected: true,
  issueCategories: ['safety' as const],
  captureMode: 'full' as const,
  commentCount: 0,
  qaScore: 91,
  qaBreakdown: null,
  timestamp: '2026-10-01T10:00:00.000Z',
};

const fixtureTrace = {
  traceId: 'msg_xyz',
  sessionId: 'ses_abc',
  requestId: 'req_1',
  userId: 'usr_123',
  domain: 'custom:support',
  contentAccess: 'full' as const,
  captureMode: 'full' as const,
  intent: 'custom_support_resolve_ticket',
  intentConfidence: null,
  userRequest: 'Where is my refund?',
  content: 'Refunds are processed within 5-7 days.',
  contentHash: null,
  structuredOutput: null,
  modelUsed: 'claude-sonnet-5',
  modelVersion: null,
  systemPromptHash: null,
  inputTokens: 820,
  outputTokens: 420,
  totalTokens: 1240,
  costUsd: '0.002100',
  latencyMs: 340,
  ttftMs: null,
  flagged: false,
  flagReason: null,
  issues: [],
  piiDetected: false,
  fromCache: false,
  qaScore: 91,
  qaBreakdown: null,
  retrievedContext: [{ sourceId: 'src_01', sourceType: 'policy', score: 0.94, snippet: 'Refunds are processed within...' }],
  observations: [],
  timestamp: '2026-10-01T10:00:00.000Z',
};

const fixtureStats = {
  window: { from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' },
  total: 412,
  flagged: 9,
  piiDetected: 30,
  fromCache: 12,
  inputTokens: 100000,
  outputTokens: 40000,
  costUsd: '12.340000',
  latencyMs: { avg: 350, p50: 300, p95: 900, p99: 1500 },
  ttftMs: { p50: 120, p95: 400 },
  qaScore: { avg: 88, scored: 200 },
  issuesByCategory: { safety: 5, validation: 2, grounding: 1, other: 1 },
  byIntent: [],
};

let lastListQuery: URLSearchParams | undefined;
let lastStatsQuery: URLSearchParams | undefined;
let lastClusterQuery: URLSearchParams | undefined;

const server = setupServer(
  http.get(`${BASE_URL}/v1/traces`, ({ request }) => {
    lastListQuery = new URL(request.url).searchParams;
    return HttpResponse.json({
      success: true,
      data: { traces: [fixtureSummary] },
      pagination: { total: 412, limit: 25, offset: 0 },
      sort: { key: 'time', dir: 'desc' },
    });
  }),
  http.get(`${BASE_URL}/v1/traces/stats`, ({ request }) => {
    lastStatsQuery = new URL(request.url).searchParams;
    return HttpResponse.json({ success: true, data: fixtureStats });
  }),
  http.get(`${BASE_URL}/v1/traces/failure-clusters`, ({ request }) => {
    lastClusterQuery = new URL(request.url).searchParams;
    return HttpResponse.json({ success: true, data: {
      window_days: 14, runs_total: 258, runs_failed: 26, failure_rate: 10.1, by_source: { agent: { total: 200, failed: 20 }, workflow: { total: 50, failed: 6 }, request: { total: 8, failed: 0 } }, truncated: false, min_cluster_runs: 3, proposal_min_runs: 10,
      clusters: [{ id: 'run|a1|max_steps_exceeded|x', kind: 'run', resource_kind: 'agent', resource_id: 'a1', resource_name: 'Refunds', title: 'Stopped at the step limit', tool_id: null, signature: 'agent exceeded maximum steps (#)',
        runs: 25, runs_previous_window: 0, runs_ended_failed: 25, first_seen: '2026-11-16T20:28:43.561Z', last_seen: '2026-11-18T10:00:00.000Z', daily: [0, 25], proposal_ready: true,
        cause: { kind: 'limit', label: 'Limit', rule: 'The run stopped at its step limit (status max_steps_exceeded).' },
        changes: [{ at: '2026-11-16T08:00:00.000Z', kind: 'version', label: 'Version 4 saved', by: 'jane', before_first_failure: true }], example_run_ids: ['run_1'] }],
    } });
  }),
  http.get(`${BASE_URL}/v1/traces/msg_xyz`, () => HttpResponse.json({ success: true, data: { trace: fixtureTrace } })),
  http.get(`${BASE_URL}/v1/traces/msg_xyz/eval-case-draft`, () =>
    HttpResponse.json({ success: true, data: { draft: {
      trace_id: 'msg_xyz', domain_key: 'support', intent_key: 'resolve_ticket', message: 'Refund my plan', input: {}, input_available: false,
      observed_output: 'Declined.', expected_output: null, notes: 'From trace msg_xyz.', already_redacted: false,
      datasets: [{ id: 'ds_1', name: 'Refund set', suites: [{ id: 'su_1', name: 'Nightly' }] }],
    } } }),
  ),
  http.get(`${BASE_URL}/v1/traces/msg_missing`, () =>
    HttpResponse.json({ success: false, error: { code: 'TRACE_NOT_FOUND', message: 'Trace not found' } }, { status: 404 }),
  ),
  http.get(`${BASE_URL}/v1/traces/runs/agent/run_1`, () =>
    HttpResponse.json({ success: true, data: { trace: { ...fixtureTrace, kind: 'agent_run', traceId: 'run_1', domain: 'agent' } } }),
  ),
  http.get(`${BASE_URL}/v1/traces/runs/workflow/run_forbidden`, () =>
    HttpResponse.json({ success: false, error: { code: 'EMBED_TOKEN_NOT_ALLOWED', message: 'Use a secret API key to read traces.' } }, { status: 403 }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { server.resetHandlers(); lastListQuery = undefined; lastStatsQuery = undefined; });
afterAll(() => server.close());

function client(): LiyaEngine {
  return new LiyaEngine({ apiKey: 'liya_test', baseUrl: BASE_URL, maxRetries: 0 });
}

describe('traces', () => {
  it('lists traces and keeps the pagination and sort that sit beside data in the envelope', async () => {
    const page = await client().traces.list();
    expect(page.traces).toHaveLength(1);
    expect(page.traces[0].traceId).toBe('msg_xyz');
    expect(page.pagination).toEqual({ total: 412, limit: 25, offset: 0 });
    expect(page.sort).toEqual({ key: 'time', dir: 'desc' });
    expect(lastListQuery?.toString()).toBe('');
  });

  it('sends every filter as the query parameter the API reads', async () => {
    await client().traces.list({
      limit: 10, offset: 20, domain: 'support', intent: 'resolve_ticket', flagged: true, issue: 'safety',
      from: new Date('2026-09-01T00:00:00.000Z'), to: '2026-10-01T00:00:00.000Z',
      userId: 'usr_123', sessionId: 'ses_abc', model: 'claude-sonnet-5', minLatencyMs: 500, fromCache: false,
      capture: 'full', q: 'refund', sort: 'cost', order: 'asc', scope: 'traces', kind: 'agent', nested: true,
    });
    const q = Object.fromEntries(lastListQuery!.entries());
    expect(q).toEqual({
      limit: '10', offset: '20', domain: 'support', intent: 'resolve_ticket', flagged: 'true', issue: 'safety',
      from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z',
      userId: 'usr_123', sessionId: 'ses_abc', model: 'claude-sonnet-5', minLatencyMs: '500', fromCache: 'false',
      capture: 'full', q: 'refund', sort: 'cost', order: 'asc', scope: 'traces', kind: 'agent', nested: 'true',
    });
  });

  it('omits filters that are undefined', async () => {
    await client().traces.list({ domain: 'support', intent: undefined });
    expect(lastListQuery?.toString()).toBe('domain=support');
  });

  it('gets one trace, unwrapping data.trace', async () => {
    const trace = await client().traces.get('msg_xyz');
    expect(trace.traceId).toBe('msg_xyz');
    expect(trace.retrievedContext?.[0].score).toBe(0.94);
    expect(trace.contentAccess).toBe('full');
  });

  it('throws a typed LiyaEngineAPIError for a missing trace', async () => {
    await expect(client().traces.get('msg_missing')).rejects.toMatchObject({ name: 'LiyaEngineAPIError', code: 'TRACE_NOT_FOUND', status: 404 });
  });

  it('drafts an evaluation case from a trace, in camelCase, with no invented input or expected output', async () => {
    const draft = await client().traces.caseDraft('msg_xyz');
    expect(draft).toMatchObject({ traceId: 'msg_xyz', domainKey: 'support', intentKey: 'resolve_ticket', input: {}, inputAvailable: false, expectedOutput: null, observedOutput: 'Declined.' });
    expect(draft.datasets[0].suites[0].name).toBe('Nightly');
  });

  it('reads failure clusters in camelCase and passes the window', async () => {
    const out = await client().traces.failureClusters({ days: 14 });
    expect(lastClusterQuery!.get('days')).toBe('14');
    expect(out).toMatchObject({ windowDays: 14, runsFailed: 26, failureRate: 10.1, minClusterRuns: 3 });
    expect(out.clusters[0]).toMatchObject({ resourceKind: 'agent', resourceName: 'Refunds', runsEndedFailed: 25, proposalReady: true, exampleRunIds: ['run_1'] });
    expect(out.bySource.workflow).toEqual({ total: 50, failed: 6 });
    expect(out.clusters[0].changes[0].beforeFirstFailure).toBe(true);
  });

  it('gets an agent run trace', async () => {
    const trace = await client().traces.getRun('agent', 'run_1');
    expect(trace.kind).toBe('agent_run');
    expect(trace.traceId).toBe('run_1');
  });

  it('surfaces the embed-token refusal as a typed error', async () => {
    await expect(client().traces.getRun('workflow', 'run_forbidden')).rejects.toMatchObject({
      name: 'LiyaEngineAPIError', code: 'EMBED_TOKEN_NOT_ALLOWED', status: 403,
    });
  });

  it('returns stats and passes the same filters', async () => {
    const stats = await client().traces.stats({ domain: 'support', from: '2026-09-01T00:00:00.000Z', flagged: true });
    expect(stats.total).toBe(412);
    expect(stats.latencyMs.p95).toBe(900);
    expect(stats.issuesByCategory.safety).toBe(5);
    expect(Object.fromEntries(lastStatsQuery!.entries())).toEqual({ domain: 'support', from: '2026-09-01T00:00:00.000Z', flagged: 'true' });
  });

  it('url-encodes ids', async () => {
    server.use(http.get(`${BASE_URL}/v1/traces/a%2Fb`, () => HttpResponse.json({ success: true, data: { trace: fixtureTrace } })));
    await expect(client().traces.get('a/b')).resolves.toMatchObject({ traceId: 'msg_xyz' });
  });
});
