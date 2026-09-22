import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LiyaEngine } from './client.js';

const BASE_URL = 'https://api.test.liyaengine.ai';

const fixtureDomain = {
  id: 'dom_123',
  tenant_id: 'tenant_1',
  domain_key: 'billing',
  display_name: 'Billing',
  description: null,
  icon: '◆',
  color: '#6366f1',
  system_prompt: null,
  prompt_binding: null,
  context_enrichment_webhook_url: null,
  retrieval_scope: null,
  status: 'active',
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const fixtureIntent = {
  id: 'int_123',
  tenant_id: 'tenant_1',
  domain_key: 'billing',
  intent_key: 'refund-status',
  display_name: 'Refund Status',
  description: 'Answer refund status questions.',
  prompt_template: 'You are a billing assistant...',
  prompt_binding: null,
  output_schema: null,
  input_schema: null,
  guardrails_config: null,
  agent_config: null,
  execution_config: null,
  retrieval_config: null,
  cache_config: null,
  is_active: true,
  sort_order: 0,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const fixtureVersion = {
  id: 'ver_1',
  version_number: 1,
  changed_fields: ['prompt_template'],
  change_type: 'create',
  restored_from_version: null,
  created_by: null,
  actorName: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

const server = setupServer(
  http.get(`${BASE_URL}/v1/domains`, () => HttpResponse.json({ success: true, data: { domains: [fixtureDomain] } })),
  http.post(`${BASE_URL}/v1/domains`, () => HttpResponse.json({ success: true, data: { domain: fixtureDomain } }, { status: 201 })),
  http.get(`${BASE_URL}/v1/domains/billing`, () =>
    HttpResponse.json({ success: true, data: { domain: { ...fixtureDomain, intents: [fixtureIntent], source_types: [] } } }),
  ),
  http.patch(`${BASE_URL}/v1/domains/billing`, () => HttpResponse.json({ success: true, data: { updated: 1 } })),
  http.delete(`${BASE_URL}/v1/domains/billing`, () => HttpResponse.json({ success: true, data: { deleted: 'billing' } })),
  http.post(`${BASE_URL}/v1/domains/billing/query`, () =>
    HttpResponse.json({ success: true, data: { results: [{ content: 'Refunds take 5-7 days.', score: 0.91 }], total: 1 } }),
  ),

  http.get(`${BASE_URL}/v1/domains/billing/intents`, () => HttpResponse.json({ success: true, data: { intents: [fixtureIntent] } })),
  http.get(`${BASE_URL}/v1/domains/billing/intents/refund-status`, () => HttpResponse.json({ success: true, data: { intent: fixtureIntent } })),
  http.post(`${BASE_URL}/v1/domains/billing/intents`, () => HttpResponse.json({ success: true, data: { intent: fixtureIntent } }, { status: 201 })),
  http.patch(`${BASE_URL}/v1/domains/billing/intents/refund-status`, () => HttpResponse.json({ success: true, data: { updated: 1 } })),
  http.delete(`${BASE_URL}/v1/domains/billing/intents/refund-status`, () => HttpResponse.json({ success: true, data: { deleted: 'refund-status' } })),

  http.get(`${BASE_URL}/v1/domains/billing/intents/refund-status/versions`, () => HttpResponse.json({ success: true, data: { versions: [fixtureVersion] } })),
  http.get(`${BASE_URL}/v1/domains/billing/intents/refund-status/versions/1`, () => HttpResponse.json({ success: true, data: { version: fixtureVersion } })),
  http.post(`${BASE_URL}/v1/domains/billing/intents/refund-status/versions/1/restore`, () => HttpResponse.json({ success: true, data: { intent: fixtureIntent } })),

  http.get(`${BASE_URL}/v1/domains/billing/sources`, () =>
    HttpResponse.json({ success: true, data: { sources: [{ id: 'src_1', tenant_id: 'tenant_1', domain_key: 'billing', slug: 'billing-faq', label: 'Billing FAQ', color: '#6366f1', created_at: '2026-01-01T00:00:00.000Z' }] } }),
  ),
  http.post(`${BASE_URL}/v1/domains/billing/sources`, () =>
    HttpResponse.json({ success: true, data: { sourceType: { id: 'src_new', tenant_id: 'tenant_1', domain_key: 'billing', slug: 'billing-faq', label: 'Billing FAQ', color: '#6366f1', created_at: '2026-01-01T00:00:00.000Z', domain_keys: ['billing'] } } }, { status: 201 }),
  ),
  http.delete(`${BASE_URL}/v1/domains/billing/sources/billing-faq`, () => HttpResponse.json({ success: true, data: { deleted: 'billing-faq' } })),
  http.post(`${BASE_URL}/v1/domains/billing/sources/billing-faq/docs`, () =>
    HttpResponse.json({ success: true, data: { document: { id: 'doc_1', name: 'faq.txt', chunks: 3, sizeKb: 2, uploadedAt: '2026-01-01T00:00:00.000Z' } } }, { status: 201 }),
  ),

  http.get(`${BASE_URL}/v1/intents`, () =>
    HttpResponse.json({
      success: true,
      data: { intents: [{ domain: 'billing', domainLabel: 'Billing', intent: 'refund-status', displayName: 'Refund Status', description: null, endpoint: '/v1/billing/refund-status', method: 'POST', inputSchema: {}, outputSchema: null }], total: 1 },
    }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client(): LiyaEngine {
  return new LiyaEngine({ apiKey: 'liya_test_key', baseUrl: BASE_URL });
}

describe('domains', () => {
  it('lists, creates, gets (with nested intents), updates, and deletes', async () => {
    const domains = await client().domains.list();
    expect(domains).toHaveLength(1);

    const created = await client().domains.create({ domain_key: 'billing', display_name: 'Billing', status: 'draft' });
    expect(created.domain_key).toBe('billing');

    const fetched = await client().domains.get('billing');
    expect(fetched.intents).toHaveLength(1);

    const updated = await client().domains.update('billing', { display_name: 'Billing Support', status: 'active' });
    expect(updated.updated).toBe(1);

    await expect(client().domains.delete('billing')).resolves.toBeUndefined();
  });

  it('queries a domain directly', async () => {
    const result = await client().domains.query('billing', { query: 'refund timeline' });
    expect(result.total).toBe(1);
    expect(result.results[0].content).toContain('5-7 days');
  });

  it('uploads a document to a domain source', async () => {
    const doc = await client().domains.uploadDocument('billing', 'billing-faq', { fileBase64: 'aGVsbG8=', fileName: 'faq.txt' });
    expect(doc.chunks).toBe(3);
  });
});

describe('domains.intents', () => {
  it('lists, gets one, creates, updates, and deletes an intent', async () => {
    const intents = await client().domains.intents.list('billing');
    expect(intents).toHaveLength(1);

    const fetched = await client().domains.intents.get('billing', 'refund-status');
    expect(fetched.intent_key).toBe('refund-status');

    const created = await client().domains.intents.create('billing', {
      intent_key: 'refund-status', display_name: 'Refund Status', description: 'Answer refund status questions.',
      prompt_template: 'You are a billing assistant...',
    });
    expect(created.intent_key).toBe('refund-status');

    const updated = await client().domains.intents.update('billing', 'refund-status', {
      display_name: 'Refund Status v2', agent_config: { enabled: true, max_steps: 3 }, sort_order: 2,
    });
    expect(updated.updated).toBe(1);

    await expect(client().domains.intents.delete('billing', 'refund-status')).resolves.toBeUndefined();
  });

  it('creates an intent bound to a Prompt Studio library version instead of inline text', async () => {
    const created = await client().domains.intents.create('billing', {
      intent_key: 'refund-status', display_name: 'Refund Status', description: 'Answer refund status questions.',
      prompt_binding: { kind: 'library_version', prompt_id: 'prompt_1', version_id: 'version_2', content_hash: `sha256:${'a'.repeat(64)}` },
    });
    expect(created.intent_key).toBe('refund-status');
  });
});

describe('domains.intents.versions', () => {
  it('lists, gets, and restores a version', async () => {
    const versions = await client().domains.intents.versions.list('billing', 'refund-status');
    expect(versions).toHaveLength(1);
    expect(versions[0].change_type).toBe('create');

    const version = await client().domains.intents.versions.get('billing', 'refund-status', 1);
    expect(version.version_number).toBe(1);

    const restored = await client().domains.intents.versions.restore('billing', 'refund-status', 1);
    expect(restored.intent_key).toBe('refund-status');
  });
});

describe('domains.sources', () => {
  it('lists, creates, and deletes a source', async () => {
    const sources = await client().domains.sources.list('billing');
    expect(sources).toHaveLength(1);

    const created = await client().domains.sources.create('billing', { slug: 'billing-faq', label: 'Billing FAQ' });
    expect(created.slug).toBe('billing-faq');

    await expect(client().domains.sources.delete('billing', 'billing-faq')).resolves.toBeUndefined();
  });
});

describe('intents.listAll', () => {
  it('returns the flat cross-domain catalog', async () => {
    const catalog = await client().intents.listAll();
    expect(catalog).toHaveLength(1);
    expect(catalog[0].domain).toBe('billing');
  });
});
