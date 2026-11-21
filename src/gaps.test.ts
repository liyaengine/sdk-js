import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LiyaEngine } from './client.js';
import { LiyaEngineAPIError } from './errors.js';

const BASE_URL = 'https://api.test.liyaengine.ai';

const draft = {
  title: 'Shipping to Canada',
  statements: [{ text: 'We ship to every Canadian province.', sources: ['S1'] }],
  body_markdown: 'We ship to every Canadian province.',
  missing: ['Delivery time to Toronto'],
  sources: [{ id: 'S1', kind: 'staff_reply', label: 'Staff reply, 2026-11-10', excerpt: 'Yes, we ship to every Canadian province.' }],
  questions: ['Do you ship to Canada?'],
  gap_ids: ['g1'],
  dropped_unsupported: 1,
  reason: null,
  usage: { tokens: 900, cost: 0.003, served_by: 'platform' },
};

let lastListQuery: URLSearchParams | undefined;
let lastDraftBody: unknown;
let lastCoverageBody: unknown;
let draftCalls = 0;
let draftStatus = 200;

const server = setupServer(
  http.get(`${BASE_URL}/v1/knowledge/gaps`, ({ request }) => {
    lastListQuery = new URL(request.url).searchParams;
    return HttpResponse.json({ success: true, data: { total: 1, by_intent: [{ intent: 'shipping', count: 1, queries: ['Do you ship to Canada?'] }], items: [{ id: 'g1', query: 'Do you ship to Canada?', confidence_score: 0.2, intent: 'shipping', ticket_id: null, resolved: false, created_at: '2026-11-10T00:00:00Z' }] } });
  }),
  http.post(`${BASE_URL}/v1/knowledge/gaps/draft-article`, async ({ request }) => {
    draftCalls += 1;
    lastDraftBody = await request.json();
    if (draftStatus !== 200) return HttpResponse.json({ success: false, error: { code: 'DRAFT_UNAVAILABLE', message: 'The draft could not be written. Try again.' } }, { status: draftStatus });
    return HttpResponse.json({ success: true, data: { draft } });
  }),
  http.post(`${BASE_URL}/v1/knowledge/gaps/check-coverage`, async ({ request }) => {
    lastCoverageBody = await request.json();
    return HttpResponse.json({ success: true, data: { coverage: { checked: 2, answered: 1, not_checked: 0, min_similarity: 0.45, results: [
      { gap_id: 'g1', query: 'Do you ship to Canada?', checked: true, answered: true, top_similarity: 0.71, top_source: 'shipping.md' },
      { gap_id: 'g2', query: 'Is the sky blue?', checked: true, answered: false, top_similarity: 0, top_source: null },
    ] } } });
  }),
  http.get(`${BASE_URL}/v1/memory/outcomes`, ({ request }) => {
    lastListQuery = new URL(request.url).searchParams;
    return HttpResponse.json({ success: true, data: { window_days: 30, outcome_signal: 'run_finished', runs_total: 32, runs_that_opened_notes: 2, success_rate_with_notes: 100, success_rate_without_notes: 96.7, truncated: false, min_runs_with: 30, min_runs_without: 10, files: [{ path: 'agent/a/profile.md', runs_with: 2, success_rate_with: 100, runs_without: 30, success_rate_without: 96.7, delta_points: 3.3, verdict: 'not_enough_data' }], unopened_files: [] } });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { server.resetHandlers(); lastListQuery = undefined; draftCalls = 0; draftStatus = 200; });
afterAll(() => server.close());

const client = () => new LiyaEngine({ apiKey: 'liya_test', baseUrl: BASE_URL });

describe('gaps', () => {
  it('lists open gaps with the window and resolved flag as query parameters', async () => {
    const out = await client().gaps.list({ days: 7, resolved: false });
    expect(out.total).toBe(1);
    expect(out.by_intent[0].intent).toBe('shipping');
    expect(Object.fromEntries(lastListQuery!.entries())).toEqual({ days: '7', resolved: 'false' });
  });

  it('drafts an article from gap ids and returns the draft unwrapped', async () => {
    const d = await client().gaps.draftArticle({ gapIds: ['g1'] });
    expect(lastDraftBody).toEqual({ gap_ids: ['g1'] });
    expect(d).toMatchObject({ title: 'Shipping to Canada', dropped_unsupported: 1, reason: null });
    expect(d.statements[0].sources).toEqual(['S1']);
  });

  it('can draft from a topic, including the unclassified one (null)', async () => {
    await client().gaps.draftArticle({ intent: null });
    expect(lastDraftBody).toEqual({ intent: null });
  });

  it('never retries a draft, because each attempt is a paid model call', async () => {
    draftStatus = 502;
    await expect(client().gaps.draftArticle({ gapIds: ['g1'] })).rejects.toBeInstanceOf(LiyaEngineAPIError);
    expect(draftCalls).toBe(1);
  });

  it('checks coverage and returns camelCase results', async () => {
    const c = await client().gaps.checkCoverage(['g1', 'g2']);
    expect(lastCoverageBody).toEqual({ gap_ids: ['g1', 'g2'] });
    expect(c).toMatchObject({ checked: 2, answered: 1, notChecked: 0, minSimilarity: 0.45 });
    expect(c.results[0]).toEqual({ gapId: 'g1', query: 'Do you ship to Canada?', checked: true, answered: true, topSimilarity: 0.71, topSource: 'shipping.md' });
    expect(c.results[1].topSource).toBeNull();
  });
});

describe('memory.outcomes', () => {
  it('reads per-note outcomes for a window', async () => {
    const o = await client().memory.outcomes({ days: 90 });
    expect(Object.fromEntries(lastListQuery!.entries())).toEqual({ days: '90' });
    expect(o.files[0]).toMatchObject({ path: 'agent/a/profile.md', verdict: 'not_enough_data' });
    expect(o.outcome_signal).toBe('run_finished');
  });
});
