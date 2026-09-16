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

const server = setupServer(
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
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client(): LiyaEngine {
  return new LiyaEngine({ apiKey: 'liya_test_key', baseUrl: BASE_URL });
}

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
