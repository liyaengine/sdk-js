import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LiyaEngine } from './client.js';

const BASE_URL = 'https://api.test.liyaengine.ai';
let lastPut: Record<string, unknown> | undefined;
let lastUrl = '';
const row = { rollback_mode: 'off', limit_mode: 'off', answer_checks_enabled: false, answer_check_sample_pct: 5, answer_check_daily_cap_usd: 5, updated_at: null, updated_by: null };

const server = setupServer(
  http.get(`${BASE_URL}/v1/healing/settings`, () => HttpResponse.json({ success: true, data: { settings: row } })),
  http.put(`${BASE_URL}/v1/healing/settings`, async ({ request }) => {
    lastPut = (await request.json()) as Record<string, unknown>;
    if (lastPut.answer_check_sample_pct === 90) return HttpResponse.json({ success: false, error: { code: 'INVALID_SETTINGS', message: 'out of range' } }, { status: 400 });
    return HttpResponse.json({ success: true, data: { settings: { ...row, ...lastPut, updated_at: '2026-11-21T00:00:00.000Z', updated_by: 'api_key' } } });
  }),
  http.get(`${BASE_URL}/v1/healing/answer-checks`, ({ request }) => {
    lastUrl = request.url;
    return HttpResponse.json({ success: true, data: { window_days: 14, checked: 50, supported: 40, partly_supported: 6, unsupported: 4, unsupported_rate: 8, spent_usd: 1.52, examples: [{ message_id: 'msg_9', verdict: 'unsupported', reason: 'r', checked_at: '2026-11-20T00:00:00.000Z' }] } });
  }),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { server.resetHandlers(); lastPut = undefined; });
afterAll(() => server.close());
const client = () => new LiyaEngine({ apiKey: 'liya_test_key', baseUrl: BASE_URL });

describe('healing', () => {
  it('reads the settings in camelCase, with every default off', async () => {
    expect(await client().healing.settings()).toEqual({ rollbackMode: 'off', limitMode: 'off', answerChecksEnabled: false, answerCheckSamplePct: 5, answerCheckDailyCapUsd: 5, updatedAt: null, updatedBy: null });
  });

  it('sends only the fields given, in snake_case', async () => {
    const out = await client().healing.updateSettings({ rollbackMode: 'stage', answerCheckDailyCapUsd: 8 });
    expect(lastPut).toEqual({ rollback_mode: 'stage', answer_check_daily_cap_usd: 8 });
    expect(out).toMatchObject({ rollbackMode: 'stage', answerCheckDailyCapUsd: 8, updatedBy: 'api_key' });
  });

  it('surfaces a value out of range as a typed error', async () => {
    await expect(client().healing.updateSettings({ answerCheckSamplePct: 90 })).rejects.toMatchObject({ name: 'LiyaEngineAPIError', code: 'INVALID_SETTINGS', status: 400 });
  });

  it('reads what the answer checks found, with the window', async () => {
    const out = await client().healing.answerChecks({ days: 14 });
    expect(new URL(lastUrl).searchParams.get('days')).toBe('14');
    expect(out).toMatchObject({ windowDays: 14, checked: 50, partlySupported: 6, unsupportedRate: 8, spentUsd: 1.52 });
    expect(out.examples[0]).toEqual({ messageId: 'msg_9', verdict: 'unsupported', reason: 'r', checkedAt: '2026-11-20T00:00:00.000Z' });
  });
});
