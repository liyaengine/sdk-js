import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LiyaEngine } from './client.js';
import { LiyaEngineAPIError } from './errors.js';

const BASE_URL = 'https://api.test.liyaengine.ai';

const fixtureCollection = {
  id: 'col_123',
  slug: 'contracts',
  label: 'Contracts',
  color: '#6366f1',
  created_at: '2026-01-01T00:00:00.000Z',
  domain_keys: ['legal-ops'],
  tags: [],
  visibility: 'workspace',
  last_synced_at: null,
  retrieval_config: null,
  default_embedding_model: null,
  default_chunking_strategy: null,
  default_chunk_size: null,
  default_chunk_overlap: null,
};

const server = setupServer(
  http.get(`${BASE_URL}/v1/collections`, () =>
    HttpResponse.json({ success: true, data: { collections: [fixtureCollection] } }),
  ),
  http.get(`${BASE_URL}/v1/collections/:id`, ({ params }) => {
    if (params.id !== fixtureCollection.id) {
      return HttpResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Collection not found.' } },
        { status: 404 },
      );
    }
    return HttpResponse.json({ success: true, data: { collection: fixtureCollection } });
  }),
  http.post(`${BASE_URL}/v1/collections`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.slug === 'contracts') {
      return HttpResponse.json(
        { success: false, error: { code: 'SLUG_CONFLICT', message: "A collection named 'contracts' already exists." } },
        { status: 409 },
      );
    }
    return HttpResponse.json(
      { success: true, data: { collection: { ...fixtureCollection, ...body, id: 'col_new' } } },
      { status: 201 },
    );
  }),
  http.patch(`${BASE_URL}/v1/collections/:id`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ success: true, data: { collection: { ...fixtureCollection, ...body } } });
  }),
  http.delete(`${BASE_URL}/v1/collections/:id`, () => HttpResponse.json({ success: true })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client(): LiyaEngine {
  return new LiyaEngine({ apiKey: 'liya_test_key', baseUrl: BASE_URL });
}

describe('LiyaEngine constructor', () => {
  it('throws without an apiKey', () => {
    // @ts-expect-error - intentionally omitting required field
    expect(() => new LiyaEngine({})).toThrow(/apiKey is required/);
  });
});

describe('collections.list', () => {
  it('unwraps the envelope and returns the array', async () => {
    const collections = await client().collections.list();
    expect(collections).toEqual([fixtureCollection]);
  });
});

describe('collections.get', () => {
  it('returns a single collection', async () => {
    const collection = await client().collections.get('col_123');
    expect(collection.slug).toBe('contracts');
  });

  it('throws a typed LiyaEngineAPIError on 404', async () => {
    await expect(client().collections.get('does-not-exist')).rejects.toMatchObject({
      name: 'LiyaEngineAPIError',
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('LiyaEngineAPIError is a real Error instance', async () => {
    try {
      await client().collections.get('does-not-exist');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(LiyaEngineAPIError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});

describe('collections.create', () => {
  it('creates and returns the new collection', async () => {
    const created = await client().collections.create({
      slug: 'new-collection',
      label: 'New Collection',
      domain_keys: ['legal-ops'],
    });
    expect(created.id).toBe('col_new');
    expect(created.slug).toBe('new-collection');
  });

  it('throws a typed 409 on slug conflict', async () => {
    await expect(
      client().collections.create({ slug: 'contracts', label: 'Contracts', domain_keys: ['legal-ops'] }),
    ).rejects.toMatchObject({ code: 'SLUG_CONFLICT', status: 409 });
  });
});

describe('collections.update', () => {
  it('patches and returns the updated collection', async () => {
    const updated = await client().collections.update('col_123', { label: 'Renamed' });
    expect(updated.label).toBe('Renamed');
  });
});

describe('collections.delete', () => {
  it('resolves without throwing', async () => {
    await expect(client().collections.delete('col_123')).resolves.toBeUndefined();
  });
});
