import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LiyaEngine } from './client.js';

const BASE_URL = 'https://api.test.liyaengine.ai';

const fixtureVersion = {
  id: 'version_1',
  prompt_id: 'prompt_1',
  version_number: 1,
  content: 'Answer {{question}} using only approved policy.',
  variables: [{ name: 'question', type: 'string', required: true }],
  output_schema: null,
  model_hints: null,
  provenance: { kind: 'prompt_studio' },
  content_hash: 'sha256:abc',
  change_note: null,
  created_by: null,
  created_at: '2026-01-01T00:00:00.000Z',
};

const fixturePrompt = {
  id: 'prompt_1',
  prompt_key: 'support-answer',
  name: 'Support answer',
  description: null,
  role: 'system',
  tags: ['support'],
  status: 'draft',
  created_by: null,
  updated_by: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  versions: [fixtureVersion],
  deployments: [],
};

const server = setupServer(
  http.get(`${BASE_URL}/v1/prompts`, () => HttpResponse.json({ success: true, data: { prompts: [fixturePrompt] } })),
  http.get(`${BASE_URL}/v1/prompts/prompt_1`, () => HttpResponse.json({ success: true, data: { prompt: fixturePrompt } })),
  http.get(`${BASE_URL}/v1/prompts/ghost`, () =>
    HttpResponse.json({ success: false, error: { code: 'PROMPT_NOT_FOUND', message: 'Prompt not found.' } }, { status: 404 }),
  ),
  http.post(`${BASE_URL}/v1/prompts`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.prompt_key === 'support-answer') {
      return HttpResponse.json({ success: false, error: { code: 'PROMPT_KEY_EXISTS', message: 'taken' } }, { status: 409 });
    }
    return HttpResponse.json({ success: true, data: { prompt: { ...fixturePrompt, id: 'prompt_new', prompt_key: body.prompt_key } } }, { status: 201 });
  }),
  http.get(`${BASE_URL}/v1/prompts/prompt_1/versions`, () => HttpResponse.json({ success: true, data: { versions: [fixtureVersion] } })),
  http.post(`${BASE_URL}/v1/prompts/prompt_1/versions`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.content === 'Same content') {
      return HttpResponse.json({ success: false, error: { code: 'PROMPT_VERSION_UNCHANGED', message: 'Prompt configuration matches version 1.' } }, { status: 409 });
    }
    return HttpResponse.json({ success: true, data: { version: { ...fixtureVersion, id: 'version_2', version_number: 2, content: body.content } } }, { status: 201 });
  }),
  http.post(`${BASE_URL}/v1/prompts/prompt_1/publish`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.version_id === 'ghost-version') {
      return HttpResponse.json({ success: false, error: { code: 'PROMPT_VERSION_NOT_FOUND', message: 'Prompt or version not found.' } }, { status: 404 });
    }
    return HttpResponse.json({
      success: true,
      data: {
        deployment: { id: 'deployment_1', environment: 'production', version_id: body.version_id, deployed_by: null, deployment_note: null, deployed_at: '2026-01-01T00:00:00.000Z' },
        unchanged: false,
      },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client(): LiyaEngine {
  return new LiyaEngine({ apiKey: 'liya_test_key', baseUrl: BASE_URL });
}

describe('prompts', () => {
  it('lists prompts', async () => {
    const prompts = await client().prompts.list();
    expect(prompts[0].prompt_key).toBe('support-answer');
  });

  it('gets one prompt', async () => {
    const prompt = await client().prompts.get('prompt_1');
    expect(prompt.name).toBe('Support answer');
  });

  it('throws a typed LiyaEngineAPIError for an unknown prompt', async () => {
    await expect(client().prompts.get('ghost')).rejects.toMatchObject({ name: 'LiyaEngineAPIError', code: 'PROMPT_NOT_FOUND', status: 404 });
  });

  it('creates a prompt and its immutable version 1', async () => {
    const prompt = await client().prompts.create({
      prompt_key: 'refund-status', name: 'Refund status', content: 'Report the refund status for {{order_id}}.',
      variables: [{ name: 'order_id', type: 'string', required: true }],
    });
    expect(prompt.prompt_key).toBe('refund-status');
  });

  it('throws a typed error for a duplicate prompt_key', async () => {
    await expect(client().prompts.create({ prompt_key: 'support-answer', name: 'Dup', content: 'x' })).rejects.toMatchObject({
      code: 'PROMPT_KEY_EXISTS', status: 409,
    });
  });

  it('lists version history', async () => {
    const versions = await client().prompts.versions.list('prompt_1');
    expect(versions[0].version_number).toBe(1);
  });

  it('creates a new version', async () => {
    const version = await client().prompts.versions.create('prompt_1', { content: 'Updated content' });
    expect(version.version_number).toBe(2);
  });

  it('throws PROMPT_VERSION_UNCHANGED for a no-op save', async () => {
    await expect(client().prompts.versions.create('prompt_1', { content: 'Same content' })).rejects.toMatchObject({
      code: 'PROMPT_VERSION_UNCHANGED', status: 409,
    });
  });

  it('publishes a version', async () => {
    const result = await client().prompts.publish('prompt_1', { version_id: 'version_1' });
    expect(result.deployment.version_id).toBe('version_1');
    expect(result.unchanged).toBe(false);
  });

  it('throws a typed error publishing an unknown version', async () => {
    await expect(client().prompts.publish('prompt_1', { version_id: 'ghost-version' })).rejects.toMatchObject({
      code: 'PROMPT_VERSION_NOT_FOUND', status: 404,
    });
  });
});
