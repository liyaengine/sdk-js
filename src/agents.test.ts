import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LiyaEngine } from './client.js';

const BASE_URL = 'https://api.test.liyaengine.ai';

const fixtureAgent = {
  id: 'agent_123',
  tenant_id: 'tenant_1',
  agent_key: 'support-triage',
  name: 'Support Triage',
  description: null,
  goal: 'Triage incoming support tickets',
  system_instructions: null,
  model: null,
  temperature: null,
  status: 'draft',
  intent_ids: [],
  workflow_ids: [],
  action_ids: [],
  knowledge_domain_keys: [],
  tools_config: null,
  memory_config: null,
  behavior_config: null,
  guardrail_policy_id: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  effective_runtime_config: { contract_version: 1 },
};

let lastRegressionsUrl = '';
let lastSnooze: { url: string; body: unknown } | undefined;
let lastRegressionPost: { path: string; id: string; body: unknown } | undefined;
const server = setupServer(
  http.get(`${BASE_URL}/v1/agents/regressions/decided`, ({ request }) => {
    lastRegressionsUrl = request.url;
    return HttpResponse.json({ success: true, data: { decisions: [{ id: 'd1', kind: 'rollback', fingerprint: 'rollback:a1:4:3', resource_type: 'agent', resource_id: 'a1', resource_name: 'Dispute triage', title: 'Roll Dispute triage back to version 3', decision: 'staged', reason: null, evidence: {}, from_version: 4, to_version: 3, decided_by_label: 'Lee Park', decided_at: '2026-11-14T10:00:00.000Z', outcome: { state: 'measured', deployed_version: 5, runs: 75, failed: 3, failure_rate: 4, rate_before: 2.9, rate_replaced: 20.8 } }] } });
  }),
  http.post(`${BASE_URL}/v1/agents/regressions/:id/stage`, ({ params }) => {
    lastRegressionPost = { path: 'stage', id: String(params.id), body: null };
    if (params.id === 'rollback:gone:1:0') return HttpResponse.json({ success: false, error: { code: 'PROPOSAL_NOT_OPEN', message: 'closed' } }, { status: 409 });
    return HttpResponse.json({ success: true, data: { staged_version: 3, staged_as_draft: true, decision_id: 'd9', recorded: true } });
  }),
  http.post(`${BASE_URL}/v1/agents/regressions/:id/dismiss`, async ({ params, request }) => {
    lastRegressionPost = { path: 'dismiss', id: String(params.id), body: await request.json() };
    return HttpResponse.json({ success: true, data: { decision_id: 'd10' } });
  }),
  http.get(`${BASE_URL}/v1/agents/limit-proposals`, () => HttpResponse.json({ success: true, data: { window_days: 30, min_stopped_runs: 10, min_stopped_share: 0.05,
    proposals: [{ id: 'limit:a1:steps:20', agent_id: 'a1', agent_key: 'dispute', agent_name: 'Dispute triage', limit: { kind: 'steps', label: 'step limit', status: 'max_steps_exceeded', current: 20, proposed: 30 }, version: 4, runs: 120, stopped: 25, stopped_rate: 20.8, sampled: 10, looping: 1, has_draft: false, cost_note: 'x' }],
    not_proposed: [{ agent_id: 'a2', agent_name: 'KYC', limit_kind: 'steps', limit_label: 'step limit', stopped: 30, runs: 90, reason: 'looping', detail: 'd' }] } })),
  http.post(`${BASE_URL}/v1/agents/limit-proposals/:id/stage`, () => HttpResponse.json({ success: true, data: { limit: 'steps', proposed: 30, staged_as_draft: true, decision_id: 'd1', recorded: true } })),
  http.post(`${BASE_URL}/v1/agents/limit-proposals/:id/dismiss`, async ({ request }) => { lastRegressionPost = { path: 'dismiss', id: 'limit', body: await request.json() }; return HttpResponse.json({ success: true, data: { decision_id: 'd2' } }); }),
  http.post(`${BASE_URL}/v1/agents/limit-proposals/:id/snooze`, async ({ request }) => { lastSnooze = { url: request.url, body: await request.json() }; return HttpResponse.json({ success: true, data: { decision_id: 'd3', snoozed_until: '2026-12-05T00:00:00.000Z' } }); }),
  http.post(`${BASE_URL}/v1/agents/regressions/:id/snooze`, async ({ request }) => { lastSnooze = { url: request.url, body: await request.json() }; return HttpResponse.json({ success: true, data: { decision_id: 'd4', snoozed_until: '2026-12-05T00:00:00.000Z' } }); }),
  // Before /v1/agents/:agentKey, which would take "regressions" for an agent key.
  http.get(`${BASE_URL}/v1/agents/regressions`, ({ request }) => {
    lastRegressionsUrl = request.url;
    return HttpResponse.json({ success: true, data: { window_days: 30, min_version_runs: 20, min_gap_points: 10, regressions: [{
      id: 'rollback:a1:4:3', agent_id: 'a1', agent_key: 'dispute', agent_name: 'Dispute triage', gap_points: 17.9,
      current: { version: 4, runs: 120, failed: 25, failure_rate: 20.8, first_run: '2026-11-16T00:00:00.000Z', last_run: '2026-11-18T00:00:00.000Z' },
      previous: { version: 3, runs: 70, failed: 2, failure_rate: 2.9, first_run: '2026-11-08T00:00:00.000Z', last_run: '2026-11-15T00:00:00.000Z' },
      changes: [{ field: 'system_instructions', label: 'Instructions', before: 'old', after: 'new' }], top_failure: { signature: 'tool failed for #', runs: 22 }, has_draft: false,
      restore: { method: 'POST', path: '/v1/agents/dispute/versions/3/restore' },
    }] } });
  }),
  http.get(`${BASE_URL}/v1/agents`, () =>
    HttpResponse.json({
      success: true,
      data: { agents: [{ agent: 'support-triage', displayName: 'Support Triage', description: null, goal: 'Triage', status: 'active', endpoint: '/v1/agents/support-triage/run', method: 'POST', inputSchema: {} }], total: 1 },
    }),
  ),
  http.get(`${BASE_URL}/v1/agents/:agentKey`, ({ params }) => {
    if (params.agentKey !== 'support-triage') {
      return HttpResponse.json({ success: false, error: { code: 'AGENT_NOT_FOUND', message: 'not found' } }, { status: 404 });
    }
    return HttpResponse.json({ success: true, data: { agent: fixtureAgent } });
  }),
  http.post(`${BASE_URL}/v1/agents`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.agent_key === 'support-triage') {
      return HttpResponse.json({ success: false, error: { code: 'AGENT_KEY_TAKEN', message: 'taken' } }, { status: 409 });
    }
    return HttpResponse.json({ success: true, data: { agent: { ...fixtureAgent, ...body, id: 'agent_new' } } }, { status: 201 });
  }),
  http.patch(`${BASE_URL}/v1/agents/:agentKey`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.status === 'active') {
      return HttpResponse.json({ success: false, error: { code: 'DEPLOY_REQUIRED', message: 'use deploy' } }, { status: 409 });
    }
    return HttpResponse.json({ success: true, data: { agent: { ...fixtureAgent, ...body } } });
  }),
  http.delete(`${BASE_URL}/v1/agents/:agentKey`, () => HttpResponse.json({ success: true })),
  http.post(`${BASE_URL}/v1/agents/:agentKey/deploy`, () =>
    HttpResponse.json({ success: true, data: { agent: { ...fixtureAgent, status: 'active' } } }),
  ),
  http.post(`${BASE_URL}/v1/agents/:agentKey/run`, () =>
    HttpResponse.json({
      success: true,
      data: { run_id: 'run_1', session_id: 'ses_1', history_truncated: false, status: 'completed', output: 'hi', steps: 2, total_cost: 0.001, total_latency_ms: 340 },
    }),
  ),
  http.get(`${BASE_URL}/v1/agents/:agentKey/runs`, () =>
    HttpResponse.json({ success: true, data: { runs: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } } }),
  ),
  http.get(`${BASE_URL}/v1/agents/:agentKey/runs/:runId`, () =>
    HttpResponse.json({ success: true, data: { run: { id: 'run_1' } } }),
  ),
  http.get(`${BASE_URL}/v1/agents/:agentKey/sessions`, () =>
    HttpResponse.json({ success: true, data: { sessions: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } } }),
  ),
  http.get(`${BASE_URL}/v1/agents/:agentKey/sessions/:sessionId/transcript`, () =>
    HttpResponse.json({ success: true, data: { session: { id: 'ses_1' }, turns: [] } }),
  ),
  http.post(`${BASE_URL}/v1/agents/:agentKey/run/stream`, async ({ params }) => {
    if (params.agentKey === 'not-active') {
      return HttpResponse.json({ success: false, error: { code: 'AGENT_NOT_ACTIVE', message: 'not active' } }, { status: 400 });
    }
    const frames = [
      { type: 'step', step: { step_number: 1, type: 'llm_call', model: 'gpt-4o', latency_ms: 300, timestamp: '2026-01-01T00:00:00.000Z' } },
      { type: 'step', step: { step_number: 2, type: 'tool_execution', tool_name: 'lookup_order', tool_success: true, latency_ms: 80, timestamp: '2026-01-01T00:00:00.000Z' } },
      { type: 'done', run_id: 'run_1', session_id: 'ses_1', history_truncated: false, status: 'completed', output: 'Your order shipped.', steps: 2, total_cost: 0.002, total_latency_ms: 500 },
    ];
    const sse = frames.map(f => `data: ${JSON.stringify(f)}\n\n`).join('');
    return new HttpResponse(sse, { headers: { 'Content-Type': 'text/event-stream' } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client(): LiyaEngine {
  return new LiyaEngine({ apiKey: 'liya_test_key', baseUrl: BASE_URL });
}

describe('agents.regressions', () => {
  it('reads roll-back proposals in camelCase and passes the window', async () => {
    const out = await client().agents.regressions({ days: 60 });
    expect(new URL(lastRegressionsUrl).searchParams.get('days')).toBe('60');
    expect(out).toMatchObject({ windowDays: 30, minVersionRuns: 20, minGapPoints: 10 });
    expect(out.regressions[0]).toMatchObject({ agentKey: 'dispute', gapPoints: 17.9, hasDraft: false, topFailure: { runs: 22 }, restore: { path: '/v1/agents/dispute/versions/3/restore' } });
    expect(out.regressions[0].current).toMatchObject({ version: 4, failureRate: 20.8 });
    expect(out.regressions[0].previous.failed).toBe(2);
  });

  it('sends no window when none is given', async () => {
    await client().agents.regressions();
    expect(new URL(lastRegressionsUrl).search).toBe('');
  });
});

describe('agents.stageRegression / dismissRegression / regressionDecisions', () => {
  it('stages with an encoded id and reads the result in camelCase', async () => {
    const out = await client().agents.stageRegression('rollback:a1:4:3');
    expect(lastRegressionPost).toMatchObject({ path: 'stage', id: 'rollback:a1:4:3' });
    expect(out).toEqual({ stagedVersion: 3, stagedAsDraft: true, decisionId: 'd9', recorded: true });
  });

  it('surfaces a proposal that is no longer open as a typed error', async () => {
    await expect(client().agents.stageRegression('rollback:gone:1:0')).rejects.toMatchObject({ name: 'LiyaEngineAPIError', code: 'PROPOSAL_NOT_OPEN', status: 409 });
  });

  it('dismisses with or without a reason', async () => {
    expect(await client().agents.dismissRegression('rollback:a1:4:3', 'The new tools were wanted')).toEqual({ decisionId: 'd10' });
    expect(lastRegressionPost).toMatchObject({ path: 'dismiss', body: { reason: 'The new tools were wanted' } });
    await client().agents.dismissRegression('rollback:a1:4:3');
    expect(lastRegressionPost?.body).toEqual({});
  });

  it('lists decisions with the measured outcome in camelCase', async () => {
    const out = await client().agents.regressionDecisions({ limit: 10 });
    expect(new URL(lastRegressionsUrl).searchParams.get('limit')).toBe('10');
    expect(out[0]).toMatchObject({ decision: 'staged', resourceName: 'Dispute triage', decidedByLabel: 'Lee Park', fromVersion: 4, toVersion: 3 });
    expect(out[0].outcome).toEqual({ state: 'measured', deployedVersion: 5, runs: 75, failed: 3, failureRate: 4, rateBefore: 2.9, rateReplaced: 20.8 });
  });
});

describe('agents.list', () => {
  it('returns the catalog', async () => {
    const agents = await client().agents.list();
    expect(agents).toHaveLength(1);
    expect(agents[0].agent).toBe('support-triage');
  });
});

describe('agents.get', () => {
  it('returns a single agent', async () => {
    const agent = await client().agents.get('support-triage');
    expect(agent.agent_key).toBe('support-triage');
  });

  it('throws a typed 404 for an unknown agent', async () => {
    await expect(client().agents.get('nope')).rejects.toMatchObject({ code: 'AGENT_NOT_FOUND', status: 404 });
  });
});

describe('agents.create', () => {
  it('creates and returns the new agent in draft status', async () => {
    const created = await client().agents.create({ agent_key: 'new-agent', name: 'New Agent', goal: 'Do things' });
    expect(created.id).toBe('agent_new');
    expect(created.agent_key).toBe('new-agent');
  });

  it('throws a typed 409 on a duplicate key', async () => {
    await expect(
      client().agents.create({ agent_key: 'support-triage', name: 'Dup', goal: 'x' }),
    ).rejects.toMatchObject({ code: 'AGENT_KEY_TAKEN', status: 409 });
  });
});

describe('agents.update', () => {
  it('patches and returns the updated agent', async () => {
    const updated = await client().agents.update('support-triage', { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
  });

  it('rejects setting status active directly', async () => {
    await expect(
      // @ts-expect-error - deliberately testing the runtime guard the type system also blocks
      client().agents.update('support-triage', { status: 'active' }),
    ).rejects.toMatchObject({ code: 'DEPLOY_REQUIRED', status: 409 });
  });
});

describe('agents.deploy', () => {
  it('activates the agent', async () => {
    const deployed = await client().agents.deploy('support-triage');
    expect(deployed.status).toBe('active');
  });
});

describe('agents.delete', () => {
  it('resolves without throwing', async () => {
    await expect(client().agents.delete('support-triage')).resolves.toBeUndefined();
  });
});

describe('agents.run', () => {
  it('returns the run result', async () => {
    const result = await client().agents.run('support-triage', { input: { message: 'hi' } });
    expect(result.run_id).toBe('run_1');
    expect(result.output).toBe('hi');
  });
});

describe('agents run history + sessions', () => {
  it('lists runs', async () => {
    const { runs, pagination } = await client().agents.listRuns('support-triage');
    expect(runs).toEqual([]);
    expect(pagination.page).toBe(1);
  });

  it('gets a single run', async () => {
    const run = await client().agents.getRun('support-triage', 'run_1');
    expect(run.id).toBe('run_1');
  });

  it('lists sessions', async () => {
    const { sessions } = await client().agents.listSessions('support-triage');
    expect(sessions).toEqual([]);
  });

  it('gets a session transcript', async () => {
    const { session, turns } = await client().agents.getTranscript('support-triage', 'ses_1');
    expect(session.id).toBe('ses_1');
    expect(turns).toEqual([]);
  });
});

describe('agents.runStream', () => {
  it('yields step frames in real time, ending with a done frame carrying the complete answer', async () => {
    const events = [];
    for await (const event of client().agents.runStream('support-triage', { input: { message: 'Where is my order?' } })) {
      events.push(event);
    }
    expect(events).toEqual([
      { type: 'step', step: { step_number: 1, type: 'llm_call', model: 'gpt-4o', latency_ms: 300, timestamp: '2026-01-01T00:00:00.000Z' } },
      { type: 'step', step: { step_number: 2, type: 'tool_execution', tool_name: 'lookup_order', tool_success: true, latency_ms: 80, timestamp: '2026-01-01T00:00:00.000Z' } },
      { type: 'done', run_id: 'run_1', session_id: 'ses_1', history_truncated: false, status: 'completed', output: 'Your order shipped.', steps: 2, total_cost: 0.002, total_latency_ms: 500 },
    ]);
  });

  it('throws a typed LiyaEngineAPIError for a pre-flight rejection, without yielding any events', async () => {
    const events = [];
    await expect(async () => {
      for (;;) {
        const { value, done } = await client().agents.runStream('not-active', { input: { message: 'hi' } }).next();
        if (done) break;
        events.push(value);
      }
    }).rejects.toMatchObject({ name: 'LiyaEngineAPIError', code: 'AGENT_NOT_ACTIVE', status: 400 });
    expect(events).toHaveLength(0);
  });
});

describe('agents.limitProposals and snooze', () => {
  it('reads limit proposals and the agents that were not proposed, in camelCase', async () => {
    const out = await client().agents.limitProposals({ days: 14 });
    expect(out).toMatchObject({ windowDays: 30, minStoppedRuns: 10, minStoppedShare: 0.05 });
    expect(out.proposals[0]).toMatchObject({ id: 'limit:a1:steps:20', agentName: 'Dispute triage', stoppedRate: 20.8, hasDraft: false, limit: { current: 20, proposed: 30 } });
    expect(out.notProposed[0]).toMatchObject({ reason: 'looping', agentName: 'KYC', limitKind: 'steps' });
  });

  it('stages, dismisses and snoozes a limit proposal, and snoozes a roll-back', async () => {
    const c = client();
    expect(await c.agents.stageLimitProposal('limit:a1:steps:20')).toEqual({ limit: 'steps', proposed: 30, stagedAsDraft: true, decisionId: 'd1', recorded: true });
    expect(await c.agents.dismissLimitProposal('limit:a1:steps:20', 'intended')).toEqual({ decisionId: 'd2' });
    expect(lastRegressionPost?.body).toEqual({ reason: 'intended' });
    expect(await c.agents.snoozeLimitProposal('limit:a1:steps:20', { days: 14 })).toEqual({ decisionId: 'd3', snoozedUntil: '2026-12-05T00:00:00.000Z' });
    expect(lastSnooze?.body).toEqual({ days: 14 });
    await c.agents.snoozeRegression('rollback:a1:4:3', { days: 7, reason: 'later' });
    expect(lastSnooze).toMatchObject({ body: { days: 7, reason: 'later' } });
  });
});
