import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LiyaEngine } from './client.js';

const BASE_URL = 'https://api.test.liyaengine.ai';
const seen: Record<string, unknown> = {};

const server = setupServer(
  http.post(`${BASE_URL}/v1/run`, async ({ request }) => {
    seen.run = await request.json();
    return HttpResponse.json({ success: true, data: { response: 'ok' }, meta: {}, usage: {} });
  }),
  http.post(`${BASE_URL}/v1/collections/query`, async ({ request }) => {
    seen.query = await request.json();
    return HttpResponse.json({ success: true, data: { results: [], total: 0 } });
  }),
  http.post(`${BASE_URL}/v1/agents/support/run`, async ({ request }) => {
    seen.agent = await request.json();
    return HttpResponse.json({ success: true, data: { run_id: 'r', session_id: 's', history_truncated: false } });
  }),
  http.post(`${BASE_URL}/v1/documents`, async ({ request }) => {
    seen.upload = await request.json();
    return HttpResponse.json({ success: true, data: { id: 'd' } }, { status: 201 });
  }),
  http.post(`${BASE_URL}/v1/documents/push`, async ({ request }) => {
    seen.push = await request.json();
    return HttpResponse.json({ success: true, data: { source_id: 's', chunks: 1, title: 't' } });
  }),
  http.patch(`${BASE_URL}/v1/documents/doc_1`, async ({ request }) => {
    seen.patch = await request.json();
    const body = seen.patch as { accessGroups: string[] | null };
    return HttpResponse.json({ success: true, data: { id: 'doc_1', access_groups: body.accessGroups, chunks_updated: 4 } });
  }),
  http.patch(`${BASE_URL}/v1/domains/hr`, async ({ request }) => {
    seen.domain = await request.json();
    return HttpResponse.json({ success: true, data: { updated: 1 } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { server.resetHandlers(); for (const k of Object.keys(seen)) delete seen[k]; });
afterAll(() => server.close());

const client = () => new LiyaEngine({ apiKey: 'liya_test_key', baseUrl: BASE_URL });

describe('retrieval access control', () => {
  it('sends access as a top-level field on a run, never inside input', async () => {
    await client().intents.run({ domain: 'hr', intent: 'ask', input: { user_id: 'u1', message: 'hi' }, access: { groups: ['hr'] } });
    expect(seen.run).toMatchObject({ access: { groups: ['hr'] } });
    expect((seen.run as { input: object }).input).not.toHaveProperty('access');
  });

  it('omits access when not given', async () => {
    await client().intents.run({ domain: 'hr', intent: 'ask', input: { user_id: 'u1' } });
    expect(seen.run).not.toHaveProperty('access');
  });

  it('passes access to collections.query and agents.run', async () => {
    await client().collections.query({ query: 'pay', access: { groups: [] } });
    expect(seen.query).toMatchObject({ access: { groups: [] } });
    await client().agents.run('support', { input: { message: 'hi' }, access: { groups: ['gold'] } });
    expect(seen.agent).toMatchObject({ access: { groups: ['gold'] } });
  });

  it('labels documents on upload and push, and relabels with setAccess', async () => {
    await client().documents.upload({ fileBase64: 'ZmFrZQ==', fileName: 'pay.txt', accessGroups: ['hr'] });
    expect(seen.upload).toMatchObject({ accessGroups: ['hr'] });
    await client().documents.push({ content: 'x', accessGroups: null });
    expect(seen.push).toMatchObject({ accessGroups: null });

    const r = await client().documents.setAccess('doc_1', ['hr', 'finance']);
    expect(seen.patch).toEqual({ accessGroups: ['hr', 'finance'] });
    expect(r).toEqual({ id: 'doc_1', access_groups: ['hr', 'finance'], chunks_updated: 4 });
    expect((await client().documents.setAccess('doc_1', null)).access_groups).toBeNull();
  });

  it('turns enforcement on for a domain', async () => {
    await client().domains.update('hr', { retrieval_access: 'enforce' });
    expect(seen.domain).toEqual({ retrievalAccess: 'enforce' });
  });
});
