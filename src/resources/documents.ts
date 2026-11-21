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
  /**
   * Restrict the document to these groups (visible only to end users who hold at least
   * one). Omitted or `null` = unrestricted. An empty array is rejected.
   */
  accessGroups?: string[] | null;
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
  /**
   * As on upload. Omitted keeps the label a re-pushed document already has, so a
   * re-sync never makes a restricted document public; `null` makes it unrestricted.
   */
  accessGroups?: string[] | null;
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

/** One chunk from the tenant-wide embedding store that accumulated enough human corrections to be flagged for review. */
export interface FlaggedChunk {
  id: string;
  /** What kind of content this chunk came from (document, article, etc.). */
  source_type: string;
  source_id: string;
  chunk_index: number;
  content_text: string;
  correction_count: number;
  flagged_at: string | null;
  created_at: string;
}

/** One thing a person said after the assistant answered from a flagged passage. Conversation text has personal details removed. */
export interface FlaggedChunkCorrection {
  conversation_id: string;
  /** What the customer asked; null when it could not be found. */
  question: string | null;
  assistant_reply: string;
  staff_reply: string;
  at: string;
}

/**
 * A flagged passage and the corrections behind it (`documents.getFlaggedChunk`). Only a count is stored per passage, so the corrections are
 * rebuilt from the conversations that retrieved it: there can be fewer than `correction_count`. A flag is a suspicion, not proof, because a
 * correction counts against every passage retrieved for that reply.
 */
export interface FlaggedChunkDetail {
  chunk: { id: string; source_type: string; source_id: string; chunk_index: number; content_text: string; document_name: string | null; correction_count: number; flagged_at: string | null };
  corrections: FlaggedChunkCorrection[];
}

/** One checked edit to a flagged passage. `before` is an exact quote of the passage (null: text added at the end); `start`/`end` locate it. */
export interface ChunkRewriteEdit {
  id: string;
  before: string | null;
  after: string;
  /** The staff replies (C1, C2…) that support it. */
  sources: string[];
  reason: string;
  start: number | null;
  end: number | null;
}

/** Checked edits that make a flagged passage agree with what staff said (`documents.draftFlaggedChunkRewrite`). Nothing is saved. */
export interface ChunkRewriteDraft {
  chunk_id: string;
  original: string;
  /** The passage with every kept edit applied. */
  revised_text: string;
  edits: ChunkRewriteEdit[];
  /** Why no edit was made, or what the staff replies leave open. */
  unclear: string[];
  /** Edits the model proposed that were dropped: not an exact quote of the passage, or citing a reply that does not say it. */
  dropped_unsupported: number;
  corrections: Array<{ id: string; question: string | null; assistant_reply: string; staff_reply: string }>;
  /** `NO_CORRECTIONS`: no staff reply could be found, no model was called. `NO_CHANGE`: the replies show no error in this passage. */
  reason: 'NO_CORRECTIONS' | 'NO_CHANGE' | null;
  usage: { tokens: number; cost: number; served_by: 'platform' | 'byok' } | null;
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

  /**
   * Change who can see a document without re-embedding it. `null` makes it
   * unrestricted; otherwise an array of groups. Takes effect for every chunk at once.
   */
  async setAccess(id: string, accessGroups: string[] | null): Promise<{ id: string; access_groups: string[] | null; chunks_updated: number }> {
    return this.http.patch<{ id: string; access_groups: string[] | null; chunks_updated: number }>(
      `/v1/documents/${encodeURIComponent(id)}`,
      { accessGroups },
    );
  }

  /**
   * Read/resolve only — what actually flags a chunk (repeated human
   * corrections on a support ticket or conversation) is product-internal
   * logic with no SDK surface. This is the generic, tenant-wide half: any
   * domain's content can end up flagged, regardless of what flagged it.
   */
  async listFlaggedChunks(): Promise<FlaggedChunk[]> {
    const { chunks } = await this.http.get<{ chunks: FlaggedChunk[]; total: number }>('/v1/documents/flagged-chunks');
    return chunks;
  }

  /** A flagged passage in full, with what the customer asked, what the assistant said and what a person said after. Throws 404 `FLAGGED_CHUNK_NOT_FOUND` when it is not flagged. */
  getFlaggedChunk(id: string): Promise<FlaggedChunkDetail> {
    return this.http.get<FlaggedChunkDetail>(`/v1/documents/flagged-chunks/${encodeURIComponent(id)}`);
  }

  /**
   * Checked edits that make the passage agree with what staff said. Each edit quotes the passage word for word and is kept only if a staff reply it
   * cites says it; numbers must come from a cited reply or the text replaced. Calls a model and is metered, so it is never retried. Nothing is saved:
   * a passage cannot be edited in place, so apply `revised_text` in the source document, then `resolveFlaggedChunk`. Throws 429 `QUOTA_EXCEEDED`
   * or 502 `DRAFT_UNAVAILABLE`.
   */
  async draftFlaggedChunkRewrite(id: string): Promise<ChunkRewriteDraft> {
    const { draft } = await this.http.postLongRunning<{ draft: ChunkRewriteDraft }>(`/v1/documents/flagged-chunks/${encodeURIComponent(id)}/draft-rewrite`, {}, 120_000);
    return draft;
  }

  /** Clears the flag and resets the correction count to 0. Does not edit or delete the chunk's content — resolving is an acknowledgement, not a fix. */
  async resolveFlaggedChunk(id: string): Promise<void> {
    await this.http.post<void>(`/v1/documents/flagged-chunks/${encodeURIComponent(id)}/resolve`, {});
  }
}
