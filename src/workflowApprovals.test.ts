import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LiyaEngine } from './client.js';

const BASE_URL = 'https://api.test.liyaengine.ai';

const approval = {
  id: 'appr_1', workflow_id: 'wf_1', workflow_name: 'Refunds', workflow_key: 'refunds', run_id: 'run_1', step_id: 'step_2',
  status: 'pending', title: 'Refund 120', summary: 'Order 1042', context: { trigger: { amount: 120 } },
  assignee_role: null, assignee_user_ids: [], timeout_action: 'reject', expires_at: null,
  decided_by: null, decided_by_type: null, decided_at: null, decision_note: null, created_at: '2026-10-03T00:00:00.000Z',
};

let lastDecisionBody: unknown = null;
let lastListQuery = '';

const server = setupServer(
  http.get(`${BASE_URL}/v1/workflows/approvals`, ({ request }) => {
    lastListQuery = new URL(request.url).search;
    return HttpResponse.json({ success: true, data: [approval] });
  }),
  http.get(`${BASE_URL}/v1/workflows/approvals/:id`, ({ params }) =>
    params.id === 'appr_1'
      ? HttpResponse.json({ success: true, data: approval })
      : HttpResponse.json({ success: false, error: { code: 'APPROVAL_NOT_FOUND', message: 'not found' } }, { status: 404 }),
  ),
  http.post(`${BASE_URL}/v1/workflows/approvals/:id/decision`, async ({ request }) => {
    lastDecisionBody = await request.json();
    if ((lastDecisionBody as { decision: string }).decision === 'reject') {
      return HttpResponse.json({ success: false, error: { code: 'APPROVAL_ALREADY_DECIDED', message: 'This approval is already approved.' } }, { status: 409 });
    }
    return HttpResponse.json({ success: true, data: { approval: { ...approval, status: 'approved' }, run: { run_id: 'run_1', status: 'completed' } } });
  }),
  http.get(`${BASE_URL}/v1/workflows/trigger-catalog`, () =>
    HttpResponse.json({ success: true, data: {
      schedule: { format: '5-field cron', min_interval_minutes: 5, timezone: 'IANA name, default UTC', run_input: 'trigger step config.input' },
      events: [{ event_type: 'document.ingested', description: 'A knowledge document finished ingesting.', filters: ['collection_id', 'domain_key'] }],
    } }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => new LiyaEngine({ apiKey: 'sk_test', baseUrl: BASE_URL });

describe('workflows.approvals', () => {
  it('lists approvals with filters in the query string', async () => {
    const rows = await client().workflows.approvals.list({ status: 'pending', workflowId: 'wf_1', limit: 20 });
    expect(rows[0].title).toBe('Refund 120');
    expect(lastListQuery).toBe('?status=pending&workflow_id=wf_1&limit=20');
  });

  it('gets one approval and surfaces a typed 404', async () => {
    expect((await client().workflows.approvals.get('appr_1')).status).toBe('pending');
    await expect(client().workflows.approvals.get('nope')).rejects.toMatchObject({ code: 'APPROVAL_NOT_FOUND', status: 404 });
  });

  it('decides an approval and returns the resumed run', async () => {
    const result = await client().workflows.approvals.decide('appr_1', { decision: 'approve', note: 'ok', decided_by: 'jane@acme.com' });
    expect(lastDecisionBody).toEqual({ decision: 'approve', note: 'ok', decided_by: 'jane@acme.com' });
    expect(result.run).toEqual({ run_id: 'run_1', status: 'completed' });
  });

  it('throws APPROVAL_ALREADY_DECIDED when someone else decided first', async () => {
    await expect(client().workflows.approvals.decide('appr_1', { decision: 'reject' })).rejects.toMatchObject({ code: 'APPROVAL_ALREADY_DECIDED', status: 409 });
  });
});

describe('workflows.triggerCatalog', () => {
  it('returns event types with their filters', async () => {
    const catalog = await client().workflows.triggerCatalog();
    expect(catalog.events[0]).toEqual(expect.objectContaining({ event_type: 'document.ingested', filters: ['collection_id', 'domain_key'] }));
    expect(catalog.schedule.min_interval_minutes).toBe(5);
  });
});
