import type { HttpClient } from '../http.js';

/**
 * Tenant-wide knowledge documents — the pool collections REFERENCE rather
 * than own (a document can be attached to zero, one, or many collections).
 * Mirrors /v1/documents (see openapi.yaml).
 */
export interface Document {
  id: string;
  name: string;
  category: string;
  chunks: number;
  sizeKb: number;
  embeddingModel: string | null;
  uploadedBy: string;
  uploadedAt: string;
  collections: Array<{ id: string; slug: string; label: string; color: string }>;
}

export interface DocumentChunk {
  id: string;
  index: number;
  text: string;
  metadata: Record<string, unknown> | null;
}

export interface DocumentDetail extends Document {
  chunkList: DocumentChunk[];
}

export interface UploadDocumentInput {
  /** Base64-encoded file content. Max 10 MB decoded. */
  fileBase64: string;
  fileName: string;
  category?: string;
  /** Every id must belong to this tenant, or the whole request is rejected. */
  collectionIds?: string[];
}

export interface PushDocumentInput {
  /** Mutually exclusive with content. Must be HTTPS with no embedded credentials. */
  url?: string;
  /** Mutually exclusive with url. */
  content?: string;
  title?: string;
  /** Defaults to a deterministic hash if omitted. Re-pushing the same sourceId re-syncs, not duplicates. */
  sourceId?: string;
  category?: string;
  collectionIds?: string[];
}

export interface PushDocumentResult {
  source_id: string;
  chunks: number;
  title: string;
}

export type IngestionJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface IngestionJobRef {
  jobId: string;
  status: IngestionJobStatus;
}

export interface IngestionJob {
  id: string;
  source_type: string;
  name: string;
  status: IngestionJobStatus;
  stage: string | null;
  progress: number;
  result: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface IngestionJobStatusDetail {
  jobId: string;
  status: IngestionJobStatus;
  stage: string | null;
  progress: number;
  /** Present once status is "completed" — the resulting document's summary. */
  entry?: Record<string, unknown>;
  error?: string;
}

export interface CreateUrlIngestionJobInput {
  /** Must be HTTPS with no embedded credentials. */
  url: string;
  /** Crawl depth, 0-3. 0 = just this page. */
  depth?: number;
  category?: string;
  collectionIds?: string[];
}

export interface CreateFileIngestionJobInput {
  fileBase64: string;
  fileName: string;
  category?: string;
  collectionIds?: string[];
}

export interface ListIngestionJobsInput {
  page?: number;
  pageSize?: number;
  status?: IngestionJobStatus;
}

export interface IngestionJobsPage {
  jobs: IngestionJob[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

/**
 * Async ingestion jobs (URL crawl, file upload) — a non-blocking alternative
 * to `documents.upload()`/query for large files or deep crawls. Poll
 * `get()` for status; a completed job's `entry` is the resulting document's
 * summary.
 *
 * Cancellation is cooperative (checked between page fetches / chunk embeds),
 * not instant — and there is no crash-recovery sweep: if the process
 * running a job restarts mid-run, the job is left "running" indefinitely
 * rather than automatically retried or failed. A known limitation, not
 * silently promised away.
 */
class IngestionJobsResource {
  constructor(private readonly http: HttpClient) {}

  async createUrlJob(input: CreateUrlIngestionJobInput): Promise<IngestionJobRef> {
    return this.http.post<IngestionJobRef>('/v1/documents/jobs/url', input);
  }

  async createFileJob(input: CreateFileIngestionJobInput): Promise<IngestionJobRef> {
    return this.http.post<IngestionJobRef>('/v1/documents/jobs/file', input);
  }

  async list(input: ListIngestionJobsInput = {}): Promise<IngestionJobsPage> {
    const params = new URLSearchParams();
    if (input.page !== undefined) params.set('page', String(input.page));
    if (input.pageSize !== undefined) params.set('pageSize', String(input.pageSize));
    if (input.status !== undefined) params.set('status', input.status);
    const qs = params.toString();
    const { jobs, pagination } = await this.http.get<IngestionJobsPage>(`/v1/documents/jobs${qs ? `?${qs}` : ''}`);
    return { jobs, pagination };
  }

  async get(jobId: string): Promise<IngestionJobStatusDetail> {
    return this.http.get<IngestionJobStatusDetail>(`/v1/documents/jobs/${encodeURIComponent(jobId)}`);
  }

  /** Cooperative — the worker notices and stops at its next checkpoint, not instantly. */
  async cancel(jobId: string): Promise<{ job: IngestionJob }> {
    return this.http.post<{ job: IngestionJob }>(`/v1/documents/jobs/${encodeURIComponent(jobId)}/cancel`, {});
  }
}

export class DocumentsResource {
  readonly jobs: IngestionJobsResource;

  constructor(private readonly http: HttpClient) {
    this.jobs = new IngestionJobsResource(http);
  }

  async list(): Promise<Document[]> {
    const { documents } = await this.http.get<{ documents: Document[]; total: number }>('/v1/documents');
    return documents;
  }

  /** Includes the document's full chunk list. */
  async get(id: string): Promise<DocumentDetail> {
    return this.http.get<DocumentDetail>(`/v1/documents/${encodeURIComponent(id)}`);
  }

  /** Removes the document and its embeddings. Cascades collection attachments via FK. */
  async delete(id: string): Promise<void> {
    await this.http.delete<void>(`/v1/documents/${encodeURIComponent(id)}`);
  }

  /**
   * Synchronous — the request blocks until extraction/chunking/embedding
   * completes. For large files, prefer `jobs.createFileJob()` instead. If
   * `collectionIds` names exactly one collection, that collection's own
   * chunking/embedding defaults pre-fill this upload.
   *
   * Unlike `list()`/`get()`, the response here has no `uploadedBy` field —
   * a real, pre-existing asymmetry in the underlying API, not an SDK gap.
   * Call `get(id)` afterward if you need it.
   */
  async upload(input: UploadDocumentInput): Promise<Omit<Document, 'uploadedBy'>> {
    return this.http.post<Omit<Document, 'uploadedBy'>>('/v1/documents', input);
  }

  /**
   * Synchronous — pushes a URL or inline content, upserting by a
   * deterministic source_id. Prefer `jobs.createUrlJob()` for a deep crawl
   * (this only fetches the one URL given, no link-following).
   */
  async push(input: PushDocumentInput): Promise<PushDocumentResult> {
    return this.http.post<PushDocumentResult>('/v1/documents/push', input);
  }
}
