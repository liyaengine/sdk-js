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

let draftCalls = 0;
let draftStatus = 200;

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

  http.get(`${BASE_URL}/v1/documents/flagged-chunks`, () => HttpResponse.json({
    success: true,
    data: {
      chunks: [{
        id: 'chunk_1', source_type: 'document', source_id: 'doc_123', chunk_index: 2,
        content_text: 'stale refund policy text', correction_count: 3,
        flagged_at: '2026-01-02T00:00:00.000Z', created_at: '2026-01-01T00:00:00.000Z',
      }],
      total: 1,
    },
  })),
  http.post(`${BASE_URL}/v1/documents/flagged-chunks/chunk_1/resolve`, () => HttpResponse.json({ success: true })),
  http.get(`${BASE_URL}/v1/documents/flagged-chunks/chunk_1`, () => HttpResponse.json({ success: true, data: {
    chunk: { id: 'chunk_1', source_type: 'document', source_id: 'doc_1', chunk_index: 2, content_text: 'Refunds within 30 days.', document_name: 'policy.pdf', correction_count: 3, flagged_at: '2026-01-02T00:00:00.000Z' },
    corrections: [{ conversation_id: 'c1', question: 'Annual plan?', assistant_reply: '30 days.', staff_reply: '45 days for annual plans.', at: '2026-01-02T00:00:00.000Z' }],
  } })),
  http.post(`${BASE_URL}/v1/documents/flagged-chunks/chunk_1/draft-rewrite`, () => {
    draftCalls += 1;
    return draftStatus === 200
      ? HttpResponse.json({ success: true, data: { draft: { chunk_id: 'chunk_1', original: 'Refunds within 30 days.', revised_text: 'Refunds within 45 days.', edits: [{ id: 'e0', before: 'Refunds within 30 days.', after: 'Refunds within 45 days.', sources: ['C1'], reason: 'Staff said 45', start: 0, end: 23 }], unclear: [], dropped_unsupported: 0, corrections: [], reason: null, usage: { tokens: 900, cost: 0.01, served_by: 'platform' } } } })
      : HttpResponse.json({ success: false, error: { code: 'DRAFT_UNAVAILABLE', message: 'Try again.' } }, { status: draftStatus });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => { server.resetHandlers(); draftCalls = 0; draftStatus = 200; });
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

  it('reads one flagged passage with the corrections behind it', async () => {
    const d = await client().documents.getFlaggedChunk('chunk_1');
    expect(d.chunk).toMatchObject({ id: 'chunk_1', document_name: 'policy.pdf', correction_count: 3 });
    expect(d.corrections[0].staff_reply).toBe('45 days for annual plans.');
  });

  it('drafts checked edits for a flagged passage', async () => {
    const d = await client().documents.draftFlaggedChunkRewrite('chunk_1');
    expect(d).toMatchObject({ chunk_id: 'chunk_1', revised_text: 'Refunds within 45 days.', reason: null, dropped_unsupported: 0 });
    expect(d.edits[0]).toMatchObject({ before: 'Refunds within 30 days.', sources: ['C1'], start: 0, end: 23 });
  });

  it('never retries a draft, because each attempt is a paid model call', async () => {
    draftStatus = 502;
    await expect(client().documents.draftFlaggedChunkRewrite('chunk_1')).rejects.toMatchObject({ code: 'DRAFT_UNAVAILABLE', status: 502 });
    expect(draftCalls).toBe(1);
  });

  it('lists and resolves flagged chunks', async () => {
    const chunks = await client().documents.listFlaggedChunks();
    expect(chunks).toHaveLength(1);
    expect(chunks[0].correction_count).toBe(3);

    await expect(client().documents.resolveFlaggedChunk('chunk_1')).resolves.toBeUndefined();
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
