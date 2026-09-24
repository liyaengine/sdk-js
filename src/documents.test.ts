import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { LiyaEngine } from './client.js';

const BASE_URL = 'https://api.test.liyaengine.ai';

const fixtureDocument = {
  id: 'doc_123',
  name: 'faq.txt',
  category: 'faq',
  chunks: 3,
  sizeKb: 2,
  embeddingModel: 'text-embedding-3-small',
  uploadedBy: 'user_1',
  uploadedAt: '2026-01-01T00:00:00.000Z',
  collections: [{ id: 'col_123', slug: 'contracts', label: 'Contracts', color: '#6366f1' }],
};

const fixtureDocumentDetail = {
  ...fixtureDocument,
  chunkList: [{ id: 'chk_1', index: 0, text: 'Refunds take 5-7 days.', metadata: null }],
};

const fixtureJob = {
  id: 'job_1',
  source_type: '_unfiled',
  name: 'faq.txt',
  status: 'pending' as const,
  stage: null,
  progress: 0,
  result: null,
  error_message: null,
  created_at: '2026-01-01T00:00:00.000Z',
  started_at: null,
  completed_at: null,
};

const server = setupServer(
  http.get(`${BASE_URL}/v1/documents`, () => HttpResponse.json({ success: true, data: { documents: [fixtureDocument], total: 1 } })),
  http.get(`${BASE_URL}/v1/documents/doc_123`, () => HttpResponse.json({ success: true, data: fixtureDocumentDetail })),
  http.delete(`${BASE_URL}/v1/documents/doc_123`, () => HttpResponse.json({ success: true })),
  http.post(`${BASE_URL}/v1/documents`, () => {
    const { uploadedBy: _uploadedBy, ...rest } = fixtureDocument;
    return HttpResponse.json({ success: true, data: rest }, { status: 201 });
  }),
  http.post(`${BASE_URL}/v1/documents/push`, () =>
    HttpResponse.json({ success: true, data: { source_id: 'src_1', chunks: 3, title: 'FAQ' } }),
  ),

  http.post(`${BASE_URL}/v1/documents/jobs/url`, () =>
    HttpResponse.json({ success: true, data: { jobId: 'job_1', status: 'pending' } }, { status: 202 }),
  ),
  http.post(`${BASE_URL}/v1/documents/jobs/file`, () =>
    HttpResponse.json({ success: true, data: { jobId: 'job_2', status: 'pending' } }, { status: 202 }),
  ),
  http.get(`${BASE_URL}/v1/documents/jobs`, ({ request }) => {
    const url = new URL(request.url);
    expect(url.searchParams.get('status')).toBe('pending');
    return HttpResponse.json({
      success: true,
      data: { jobs: [fixtureJob], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } },
    });
  }),
  http.get(`${BASE_URL}/v1/documents/jobs/job_1`, () =>
    HttpResponse.json({ success: true, data: { jobId: 'job_1', status: 'pending', stage: null, progress: 0 } }),
  ),
  http.post(`${BASE_URL}/v1/documents/jobs/job_1/cancel`, () =>
    HttpResponse.json({ success: true, data: { job: { ...fixtureJob, status: 'cancelled' } } }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function client(): LiyaEngine {
  return new LiyaEngine({ apiKey: 'liya_test_key', baseUrl: BASE_URL });
}

describe('documents', () => {
  it('lists, gets (with chunkList), and deletes', async () => {
    const documents = await client().documents.list();
    expect(documents).toEqual([fixtureDocument]);

    const detail = await client().documents.get('doc_123');
    expect(detail.chunkList).toHaveLength(1);

    await expect(client().documents.delete('doc_123')).resolves.toBeUndefined();
  });

  it('uploads a document — response has no uploadedBy field', async () => {
    const uploaded = await client().documents.upload({
      fileBase64: 'ZmFrZQ==',
      fileName: 'faq.txt',
      category: 'faq',
      collectionIds: ['col_123'],
    });
    expect(uploaded.id).toBe('doc_123');
    expect(uploaded).not.toHaveProperty('uploadedBy');
  });

  it('pushes content by URL and returns the upserted source_id', async () => {
    const pushed = await client().documents.push({ url: 'https://example.com/faq', title: 'FAQ' });
    expect(pushed).toEqual({ source_id: 'src_1', chunks: 3, title: 'FAQ' });
  });
});

describe('documents.jobs', () => {
  it('creates a URL ingestion job', async () => {
    const job = await client().documents.jobs.createUrlJob({ url: 'https://example.com', depth: 1 });
    expect(job).toEqual({ jobId: 'job_1', status: 'pending' });
  });

  it('creates a file ingestion job', async () => {
    const job = await client().documents.jobs.createFileJob({ fileBase64: 'ZmFrZQ==', fileName: 'notes.txt' });
    expect(job).toEqual({ jobId: 'job_2', status: 'pending' });
  });

  it('lists jobs with query params', async () => {
    const page = await client().documents.jobs.list({ status: 'pending' });
    expect(page.jobs).toEqual([fixtureJob]);
    expect(page.pagination.total).toBe(1);
  });

  it('gets a job status', async () => {
    const status = await client().documents.jobs.get('job_1');
    expect(status.status).toBe('pending');
  });

  it('cancels a job', async () => {
    const { job } = await client().documents.jobs.cancel('job_1');
    expect(job.status).toBe('cancelled');
  });
});
