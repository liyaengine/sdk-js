import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LiyaEngine } from './client.js';

const BASE_URL = 'https://api.test.liyaengine.ai';

const fixtureWorkflow = {
  id: 'wf_123',
  tenant_id: 'tenant_1',
  name: 'Lead Intake',
  workflow_key: 'lead-intake',
  description: null,
  is_active: false,
  status: 'draft',
  trigger_type: 'webhook',
  trigger_config: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  steps: [],
};

let lastWfRegression: { url: string; method: string; body: unknown } | undefined;
const server = setupServer(
  // Before /v1/workflows/:workflowIdOrKey, which would take "regressions" for a workflow key.
  http.get(`${BASE_URL}/v1/workflows/regressions/decided`, ({ request }) => {
    lastWfRegression = { url: request.url, method: 'GET', body: null };
    return HttpResponse.json({ success: true, data: { decisions: [{ id: 'd1', kind: 'rollback', fingerprint: 'rollback:workflow:w1:4:3', resource_type: 'workflow', resource_id: 'w1', resource_name: 'KYC review', title: 'Roll KYC review back to version 3', decision: 'staged', reason: null, evidence: {}, from_version: 4, to_version: 3, decided_by_label: 'Lee', decided_at: '2026-11-14T10:00:00.000Z', outcome: null }] } });
  }),
  http.post(`${BASE_URL}/v1/workflows/regressions/:id/stage`, ({ request }) => {
    lastWfRegression = { url: request.url, method: 'POST', body: null };
    return HttpResponse.json({ success: true, data: { staged_version: 3, staged_as_draft: true, decision_id: 'd9', recorded: true } });
  }),
  http.post(`${BASE_URL}/v1/workflows/regressions/:id/snooze`, async ({ request }) => {
    lastWfRegression = { url: request.url, method: 'POST', body: await request.json() };
    return HttpResponse.json({ success: true, data: { decision_id: 'd11', snoozed_until: '2026-12-05T00:00:00.000Z' } });
  }),
  http.post(`${BASE_URL}/v1/workflows/regressions/:id/dismiss`, async ({ request }) => {
    lastWfRegression = { url: request.url, method: 'POST', body: await request.json() };
    return HttpResponse.json({ success: true, data: { decision_id: 'd10' } });
  }),
  http.get(`${BASE_URL}/v1/workflows/regressions`, ({ request }) => {
    lastWfRegression = { url: request.url, method: 'GET', body: null };
    return HttpResponse.json({ success: true, data: { window_days: 30, min_version_runs: 20, min_gap_points: 10, regressions: [{
      id: 'rollback:workflow:w1:4:3', workflow_id: 'w1', workflow_key: 'kyc', workflow_name: 'KYC review', gap_points: 17.9,
      current: { version: 4, runs: 120, failed: 25, failure_rate: 20.8, first_run: '2026-11-16T00:00:00.000Z', last_run: '2026-11-18T00:00:00.000Z' },
      previous: { version: 3, runs: 70, failed: 2, failure_rate: 2.9, first_run: '2026-11-08T00:00:00.000Z', last_run: '2026-11-15T00:00:00.000Z' },
      changes: [{ field: 'workflow', label: '1 step added', before: '', after: '' }], top_failure: { signature: 'http #', runs: 22 }, has_draft: true,
    }] } });
  }),
  http.get(`${BASE_URL}/v1/workflows`, () =>
    HttpResponse.json({ success: true, data: [{ ...fixtureWorkflow, status: 'active', is_active: true, endpoint: '/v1/workflows/lead-intake/run', method: 'POST', inputSchema: {} }] }),
  ),
  http.get(`${BASE_URL}/v1/workflows/:workflowIdOrKey`, ({ params }) => {
    if (params.workflowIdOrKey !== 'lead-intake') {
      return HttpResponse.json({ success: false, error: { code: 'WORKFLOW_NOT_FOUND', message: 'not found' } }, { status: 404 });
    }
    return HttpResponse.json({ success: true, data: { ...fixtureWorkflow, status: 'active', is_active: true, endpoint: '/v1/workflows/lead-intake/run', method: 'POST', inputSchema: {} } });
  }),
  http.post(`${BASE_URL}/v1/workflows`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ success: true, data: { workflow: { ...fixtureWorkflow, ...body, id: 'wf_new', workflow_key: 'wf-new' } } }, { status: 201 });
  }),
  http.patch(`${BASE_URL}/v1/workflows/:workflowIdOrKey`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ success: true, data: { workflow: { ...fixtureWorkflow, ...body } } });
  }),
  http.patch(`${BASE_URL}/v1/workflows/:workflowIdOrKey/toggle`, ({ params }) => {
    if (params.workflowIdOrKey === 'draft-wf') {
      return HttpResponse.json({ success: false, error: { code: 'DEPLOY_REQUIRED', message: 'deploy first' } }, { status: 409 });
    }
    return HttpResponse.json({ success: true, data: { workflow: { ...fixtureWorkflow, status: 'active', is_active: true } } });
  }),
  http.post(`${BASE_URL}/v1/workflows/:workflowIdOrKey/deploy`, () =>
    HttpResponse.json({
      success: true,
      data: {
        workflow: { ...fixtureWorkflow, status: 'active', is_active: true },
        webhook_url: 'https://api.test.liyaengine.ai/webhooks/workflows/abc123',
        webhook_secret: 'plaintext-secret-shown-once',
      },
    }),
  ),
  http.post(`${BASE_URL}/v1/workflows/:workflowIdOrKey/webhook-secret/rotate`, () =>
    HttpResponse.json({
      success: true,
      data: {
        webhook_url: 'https://api.test.liyaengine.ai/webhooks/workflows/abc123',
        webhook_secret: 'new-plaintext-secret',
        previous_secret_valid_until: '2026-01-01T00:05:00.000Z',
      },
    }),
  ),
  http.delete(`${BASE_URL}/v1/workflows/:workflowIdOrKey`, () => HttpResponse.json({ success: true })),
  http.post(`${BASE_URL}/v1/workflows/:workflowIdOrKey/run`, () =>
    HttpResponse.json({
      success: true,
      data: { run_id: 'run_1', conversation_id: 'convo_1', status: 'completed', trace: [] },
    }),
  ),
  http.get(`${BASE_URL}/v1/workflows/:workflowIdOrKey/runs`, () =>
    HttpResponse.json({ success: true, data: { runs: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 } } }),
  ),
  http.get(`${BASE_URL}/v1/workflows/:workflowIdOrKey/runs/:runId`, () =>
    HttpResponse.json({ success: true, data: { run: { id: 'run_1' } } }),
  ),
  http.post(`${BASE_URL}/v1/workflows/:workflowIdOrKey/run/stream`, async ({ params }) => {
    if (params.workflowIdOrKey === 'ghost-wf') {
      return HttpResponse.json({ success: false, error: { code: 'WORKFLOW_NOT_FOUND', message: 'not found' } }, { status: 404 });
    }
    const frames = [
      { type: 'step', step: { stepId: 's1', stepType: 'ai_intent', name: 'Classify', success: true, response: { confidence: 0.9 }, durationMs: 120 } },
      { type: 'step', step: { stepId: 's2', stepType: 'condition', name: 'Confidence check', success: true, durationMs: 5 } },
      { type: 'done', run_id: 'run_1', conversation_id: 'convo_1', status: 'completed', trace: [] },
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

describe('workflows.list', () => {
  it('returns deployed workflows with API-call info attached', async () => {
    const workflows = await client().workflows.list();
    expect(workflows).toHaveLength(1);
    expect(workflows[0].workflow_key).toBe('lead-intake');
    expect(workflows[0].endpoint).toBe('/v1/workflows/lead-intake/run');
  });
});

describe('workflows.get', () => {
  it('returns a single workflow', async () => {
    const workflow = await client().workflows.get('lead-intake');
    expect(workflow.id).toBe('wf_123');
  });

  it('throws a typed 404 for an unknown workflow', async () => {
    await expect(client().workflows.get('nope')).rejects.toMatchObject({ code: 'WORKFLOW_NOT_FOUND', status: 404 });
  });
});

describe('workflows.create', () => {
  it('creates a draft workflow', async () => {
    const created = await client().workflows.create({ name: 'New Flow' });
    expect(created.id).toBe('wf_new');
    expect(created.status).toBe('draft');
  });
});

describe('workflows.update', () => {
  it('patches and returns the updated workflow', async () => {
    const updated = await client().workflows.update('lead-intake', { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
  });
});

describe('workflows.toggle', () => {
  it('flips is_active on an already-deployed workflow', async () => {
    const toggled = await client().workflows.toggle('lead-intake');
    expect(toggled.is_active).toBe(true);
  });

  it('throws a typed 409 when the workflow is still a draft', async () => {
    await expect(client().workflows.toggle('draft-wf')).rejects.toMatchObject({ code: 'DEPLOY_REQUIRED', status: 409 });
  });
});

describe('workflows.deploy', () => {
  it('activates the workflow and returns a one-time webhook secret', async () => {
    const result = await client().workflows.deploy('lead-intake');
    expect(result.workflow.status).toBe('active');
    expect(result.webhook_secret).toBe('plaintext-secret-shown-once');
  });
});

describe('workflows.rotateWebhookSecret', () => {
  it('returns a new one-time secret and the previous grace window', async () => {
    const result = await client().workflows.rotateWebhookSecret('lead-intake', 300);
    expect(result.webhook_secret).toBe('new-plaintext-secret');
    expect(result.previous_secret_valid_until).toBe('2026-01-01T00:05:00.000Z');
  });
});

describe('workflows.delete', () => {
  it('resolves without throwing', async () => {
    await expect(client().workflows.delete('lead-intake')).resolves.toBeUndefined();
  });
});

describe('workflows.run', () => {
  it('returns the run result', async () => {
    const result = await client().workflows.run('lead-intake', { input: { name: 'Ada' } });
    expect(result.run_id).toBe('run_1');
    expect(result.status).toBe('completed');
  });
});

describe('workflows run history', () => {
  it('lists runs', async () => {
    const { runs, pagination } = await client().workflows.listRuns('lead-intake');
    expect(runs).toEqual([]);
    expect(pagination.page).toBe(1);
  });

  it('gets a single run', async () => {
    const run = await client().workflows.getRun('lead-intake', 'run_1');
    expect(run.id).toBe('run_1');
  });
});

describe('workflows.runStream', () => {
  it('yields step frames in real time, ending with a done frame carrying the complete trace', async () => {
    const events = [];
    for await (const event of client().workflows.runStream('lead-intake', { input: { foo: 'bar' } })) {
      events.push(event);
    }
    expect(events).toEqual([
      { type: 'step', step: { stepId: 's1', stepType: 'ai_intent', name: 'Classify', success: true, response: { confidence: 0.9 }, durationMs: 120 } },
      { type: 'step', step: { stepId: 's2', stepType: 'condition', name: 'Confidence check', success: true, durationMs: 5 } },
      { type: 'done', run_id: 'run_1', conversation_id: 'convo_1', status: 'completed', trace: [] },
    ]);
  });

  it('throws a typed LiyaEngineAPIError for a pre-flight rejection, without yielding any events', async () => {
    const events = [];
    await expect(async () => {
      for (;;) {
        const { value, done } = await client().workflows.runStream('ghost-wf').next();
        if (done) break;
        events.push(value);
      }
    }).rejects.toMatchObject({ name: 'LiyaEngineAPIError', code: 'WORKFLOW_NOT_FOUND', status: 404 });
    expect(events).toHaveLength(0);
  });
});

describe('workflows.regressions', () => {
  const client = () => new LiyaEngine({ apiKey: 'liya_test', baseUrl: BASE_URL });
  it('reads roll-back proposals for workflows and maps them to camelCase', async () => {
    const out = await client().workflows.regressions({ days: 60 });
    expect(new URL(lastWfRegression!.url).searchParams.get('days')).toBe('60');
    expect(out).toMatchObject({ windowDays: 30, minVersionRuns: 20, minGapPoints: 10 });
    expect(out.regressions[0]).toMatchObject({ workflowKey: 'kyc', workflowName: 'KYC review', gapPoints: 17.9, hasDraft: true, topFailure: { runs: 22 } });
    expect(out.regressions[0].current).toMatchObject({ version: 4, failureRate: 20.8 });
  });

  it('stages, dismisses and lists decisions', async () => {
    const c = client();
    expect(await c.workflows.stageRegression('rollback:workflow:w1:4:3')).toEqual({ stagedVersion: 3, stagedAsDraft: true, decisionId: 'd9', recorded: true });
    expect(await c.workflows.dismissRegression('rollback:workflow:w1:4:3', 'planned')).toEqual({ decisionId: 'd10' });
    expect(lastWfRegression?.body).toEqual({ reason: 'planned' });
    expect(await c.workflows.snoozeRegression('rollback:workflow:w1:4:3', { days: 30 })).toEqual({ decisionId: 'd11', snoozedUntil: '2026-12-05T00:00:00.000Z' });
    expect(lastWfRegression?.body).toEqual({ days: 30 });
    const d = await c.workflows.regressionDecisions({ limit: 5 });
    expect(new URL(lastWfRegression!.url).searchParams.get('limit')).toBe('5');
    expect(d[0]).toMatchObject({ resourceType: 'workflow', resourceId: 'w1', decision: 'staged' });
  });
});
