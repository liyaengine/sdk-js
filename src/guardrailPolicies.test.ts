import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LiyaEngine } from './client.js';

const BASE_URL = 'https://api.test.liyaengine.ai';

const fixturePolicy = {
  id: 'policy_1',
  name: 'Default Policy',
  description: null,
  is_default: true,
  is_active: true,
  config: { pre_llm: { pii: { enabled: true, mode: 'redact' } } },
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const fixtureVersion = {
  id: 'ver_1',
  version_number: 1,
  changed_fields: ['config'],
  change_type: 'create',
  restored_from_version: null,
  created_by: null,
  actorName: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

const server = setupServer(
  http.get(`${BASE_URL}/v1/guardrail-policies`, () =>
    HttpResponse.json({ success: true, data: { policies: [{ ...fixturePolicy, attached_count: 2 }] } }),
  ),
  http.get(`${BASE_URL}/v1/guardrail-policies/policy_1`, () =>
    HttpResponse.json({ success: true, data: { policy: fixturePolicy } }),
  ),
  http.get(`${BASE_URL}/v1/guardrail-policies/ghost`, () =>
    HttpResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Guardrail policy not found.' } }, { status: 404 }),
  ),
  http.post(`${BASE_URL}/v1/guardrail-policies`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (!body.name) {
      return HttpResponse.json({ success: false, error: { code: 'INVALID_INPUT', message: 'name is required.' } }, { status: 400 });
    }
    return HttpResponse.json({ success: true, data: { policy: { ...fixturePolicy, id: 'policy_new', name: body.name } } }, { status: 201 });
  }),
  http.patch(`${BASE_URL}/v1/guardrail-policies/policy_1`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.is_active === false) {
      return HttpResponse.json({ success: false, error: { code: 'CANNOT_DEACTIVATE_DEFAULT', message: 'This is the tenant default policy — set a different policy as default before deactivating this one.' } }, { status: 400 });
    }
    return HttpResponse.json({ success: true, data: { policy: { ...fixturePolicy, ...body } } });
  }),
  http.delete(`${BASE_URL}/v1/guardrail-policies/policy_1`, () =>
    HttpResponse.json({ success: false, error: { code: 'CANNOT_DELETE_DEFAULT', message: 'This is the tenant default policy — set a different policy as default before deleting this one.' } }, { status: 400 }),
  ),
  http.delete(`${BASE_URL}/v1/guardrail-policies/policy_2`, () => HttpResponse.json({ success: true })),
  http.post(`${BASE_URL}/v1/guardrail-policies/policy_2/set-default`, () => HttpResponse.json({ success: true })),
  http.post(`${BASE_URL}/v1/guardrail-policies/policy_1/attach`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.consumer_id === 'ghost-agent') {
      return HttpResponse.json({ success: false, error: { code: 'CONSUMER_NOT_FOUND', message: "agent 'ghost-agent' not found." } }, { status: 404 });
    }
    return HttpResponse.json({ success: true }, { status: 201 });
  }),
  http.post(`${BASE_URL}/v1/guardrail-policies/policy_1/detach`, () => HttpResponse.json({ success: true })),
  http.get(`${BASE_URL}/v1/guardrail-policies/policy_1/connections`, () =>
    HttpResponse.json({
      success: true,
      data: { domains: [], intents: [], agents: [{ id: 'agent_1', name: 'Support Copilot' }], actions: [] },
    }),
  ),
  http.get(`${BASE_URL}/v1/guardrail-policies/policy_1/analytics`, ({ request }) => {
    const url = new URL(request.url);
    const days = Number(url.searchParams.get('days') ?? '30');
    return HttpResponse.json({
      success: true,
      data: { window_days: days, total_checks: 10, blocked_checks: 2, pass_rate: 0.8, top_issue_codes: [{ code: 'PII_EMAIL_REDACTED', count: 2 }], trend: [] },
    });
  }),
  http.post(`${BASE_URL}/v1/guardrail-policies/test`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (!body.stage || body.content === undefined) {
      return HttpResponse.json({ success: false, error: { code: 'INVALID_INPUT', message: 'stage and content are required.' } }, { status: 400 });
    }
    return HttpResponse.json({ success: true, data: { passed: true, content: body.content, issues: [] } });
  }),
  http.get(`${BASE_URL}/v1/guardrail-policies/policy_1/versions`, () =>
    HttpResponse.json({ success: true, data: { versions: [fixtureVersion] } }),
  ),
  http.get(`${BASE_URL}/v1/guardrail-policies/policy_1/versions/1`, () =>
    HttpResponse.json({ success: true, data: { version: fixtureVersion } }),
  ),
  http.post(`${BASE_URL}/v1/guardrail-policies/policy_1/versions/1/restore`, () =>
    HttpResponse.json({ success: true, data: { policy: fixturePolicy } }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client(): LiyaEngine {
  return new LiyaEngine({ apiKey: 'liya_test_key', baseUrl: BASE_URL });
}

describe('guardrailPolicies', () => {
  it('lists policies with attached_count', async () => {
    const policies = await client().guardrailPolicies.list();
    expect(policies[0].attached_count).toBe(2);
  });

  it('gets one policy', async () => {
    const policy = await client().guardrailPolicies.get('policy_1');
    expect(policy.name).toBe('Default Policy');
  });

  it('throws a typed LiyaEngineAPIError for an unknown policy', async () => {
    await expect(client().guardrailPolicies.get('ghost')).rejects.toMatchObject({
      name: 'LiyaEngineAPIError', code: 'NOT_FOUND', status: 404,
    });
  });

  it('creates a policy', async () => {
    const policy = await client().guardrailPolicies.create({ name: 'Strict Policy', is_default: false });
    expect(policy.name).toBe('Strict Policy');
  });

  it('rejects deactivating the current default policy', async () => {
    await expect(client().guardrailPolicies.update('policy_1', { is_active: false })).rejects.toMatchObject({
      code: 'CANNOT_DEACTIVATE_DEFAULT', status: 400,
    });
  });

  it('rejects deleting the current default policy', async () => {
    await expect(client().guardrailPolicies.delete('policy_1')).rejects.toMatchObject({
      code: 'CANNOT_DELETE_DEFAULT', status: 400,
    });
  });

  it('deletes a non-default policy', async () => {
    await expect(client().guardrailPolicies.delete('policy_2')).resolves.toBeUndefined();
  });

  it('promotes a policy to default', async () => {
    await expect(client().guardrailPolicies.setDefault('policy_2')).resolves.toBeUndefined();
  });

  it('attaches a policy to an agent', async () => {
    await expect(client().guardrailPolicies.attach('policy_1', 'agent', 'agent_1')).resolves.toBeUndefined();
  });

  it('throws CONSUMER_NOT_FOUND attaching to a nonexistent consumer', async () => {
    await expect(client().guardrailPolicies.attach('policy_1', 'agent', 'ghost-agent')).rejects.toMatchObject({
      code: 'CONSUMER_NOT_FOUND', status: 404,
    });
  });

  it('detaches a policy from a domain', async () => {
    await expect(client().guardrailPolicies.detach('policy_1', 'domain', 'dom_1')).resolves.toBeUndefined();
  });

  it('gets real consumer connections', async () => {
    const connections = await client().guardrailPolicies.connections('policy_1');
    expect(connections.agents).toEqual([{ id: 'agent_1', name: 'Support Copilot' }]);
  });

  it('gets analytics with a custom days window', async () => {
    const analytics = await client().guardrailPolicies.analytics('policy_1', 7);
    expect(analytics.window_days).toBe(7);
    expect(analytics.pass_rate).toBe(0.8);
  });

  it('tests an unsaved draft config against real content', async () => {
    const result = await client().guardrailPolicies.test({ stage: 'pre_llm', content: 'hello world', config: {} });
    expect(result).toEqual({ passed: true, content: 'hello world', issues: [] });
  });

  it('rejects a test call missing stage', async () => {
    await expect(client().guardrailPolicies.test({ stage: undefined as any, content: 'x' })).rejects.toMatchObject({
      code: 'INVALID_INPUT', status: 400,
    });
  });

  it('lists, gets, and restores policy versions', async () => {
    const versions = await client().guardrailPolicies.versions.list('policy_1');
    expect(versions[0].version_number).toBe(1);

    const version = await client().guardrailPolicies.versions.get('policy_1', 1);
    expect(version.change_type).toBe('create');

    const restored = await client().guardrailPolicies.versions.restore('policy_1', 1);
    expect(restored.id).toBe('policy_1');
  });
});
