import type { HttpClient } from '../http.js';
import type { Document } from './documents.js';

export type ChunkingStrategy = 'fixed' | 'semantic' | 'sliding_window';
export type CollectionVisibility = 'workspace' | 'restricted';

export interface RetrievalConfig {
  scope?: 'collection_only' | 'collection_plus_domain';
  boost_priority?: number;
  fallback_when_empty?: 'domain_fallback' | 'no_results';
}

export interface Collection {
  id: string;
  slug: string;
  label: string;
  color: string;
  created_at: string;
  domain_keys: string[];
  tags: string[];
  visibility: CollectionVisibility;
  last_synced_at: string | null;
  retrieval_config: RetrievalConfig | null;
  default_embedding_model: string | null;
  default_chunking_strategy: ChunkingStrategy | null;
  default_chunk_size: number | null;
  default_chunk_overlap: number | null;
}

export interface CreateCollectionInput {
  slug: string;
  label: string;
  color?: string;
  domain_keys: string[];
  default_embedding_model?: string;
  default_chunking_strategy?: ChunkingStrategy;
  default_chunk_size?: number;
  default_chunk_overlap?: number;
}

export interface UpdateCollectionInput {
  label?: string;
  color?: string;
  tags?: string[];
  visibility?: CollectionVisibility;
  retrieval_config?: RetrievalConfig;
  default_embedding_model?: string;
  default_chunking_strategy?: ChunkingStrategy;
  default_chunk_size?: number;
  default_chunk_overlap?: number;
}

export interface CollectionAnalytics {
  /** No discrete "source" entity exists yet — equals document count. */
  sources: number;
  documents: number;
  chunks: number;
  storage_kb: number;
  embedding_model: string | null;
  indexed: boolean;
  last_synced_at: string | null;
}

export interface CollectionConnections {
  domains: Array<{ domain_key: string; display_name: string }>;
  intents: Array<{ intent_key: string; domain_key: string; display_name: string }>;
  /** Indirect — an Agent only references knowledge at the domain level, not per-collection. */
  agents: Array<{ id: string; name: string; via: string }>;
  /** Always null — no workflow-to-collection link, direct or indirect, exists in the schema. A real answer, not a stub. */
  workflows: null;
}

class CollectionDomainsResource {
  constructor(private readonly http: HttpClient) {}

  async attach(collectionId: string, domainKey: string): Promise<void> {
    await this.http.post<void>(`/v1/collections/${encodeURIComponent(collectionId)}/domains/${encodeURIComponent(domainKey)}`, {});
  }

  /** Detach only — never deletes the collection, even if this was its last attachment. Idempotent. */
  async detach(collectionId: string, domainKey: string): Promise<void> {
    await this.http.delete<void>(`/v1/collections/${encodeURIComponent(collectionId)}/domains/${encodeURIComponent(domainKey)}`);
  }
}

class CollectionDocumentsResource {
  constructor(private readonly http: HttpClient) {}

  async list(collectionId: string): Promise<Document[]> {
    const { documents } = await this.http.get<{ documents: Document[]; total: number }>(`/v1/collections/${encodeURIComponent(collectionId)}/documents`);
    return documents;
  }

  /** Reference only — a collection never owns/copies a document; embeddings are never touched. */
  async attach(collectionId: string, documentId: string): Promise<void> {
    await this.http.post<void>(`/v1/collections/${encodeURIComponent(collectionId)}/documents/${encodeURIComponent(documentId)}`, {});
  }

  /** Detach only; the document itself and its embeddings are untouched. Idempotent. */
  async detach(collectionId: string, documentId: string): Promise<void> {
    await this.http.delete<void>(`/v1/collections/${encodeURIComponent(collectionId)}/documents/${encodeURIComponent(documentId)}`);
  }
}

/**
 * Tenant-wide knowledge collections — organize documents, scope retrieval,
 * attach to one or many domains. Mirrors GET/POST /v1/collections and
 * GET/PATCH/DELETE /v1/collections/{id} exactly (see openapi.yaml).
 */
export class CollectionsResource {
  readonly domains: CollectionDomainsResource;
  readonly documents: CollectionDocumentsResource;

  constructor(private readonly http: HttpClient) {
    this.domains = new CollectionDomainsResource(http);
    this.documents = new CollectionDocumentsResource(http);
  }

  async list(): Promise<Collection[]> {
    const { collections } = await this.http.get<{ collections: Collection[] }>('/v1/collections');
    return collections;
  }

  async get(id: string): Promise<Collection> {
    const { collection } = await this.http.get<{ collection: Collection }>(`/v1/collections/${encodeURIComponent(id)}`);
    return collection;
  }

  async create(input: CreateCollectionInput): Promise<Collection> {
    const { collection } = await this.http.post<{ collection: Collection }>('/v1/collections', input);
    return collection;
  }

  async update(id: string, input: UpdateCollectionInput): Promise<Collection> {
    const { collection } = await this.http.patch<{ collection: Collection }>(`/v1/collections/${encodeURIComponent(id)}`, input);
    return collection;
  }

  async delete(id: string): Promise<void> {
    await this.http.delete<void>(`/v1/collections/${encodeURIComponent(id)}`);
  }

  /** On-the-fly aggregation — no dedicated rollup table, so this reflects live state exactly. */
  async analytics(id: string): Promise<CollectionAnalytics> {
    return this.http.get<CollectionAnalytics>(`/v1/collections/${encodeURIComponent(id)}/analytics`);
  }

  /** What references this collection — domains, intents, agents (indirect via domain), and workflows (always null, see CollectionConnections). */
  async connections(id: string): Promise<CollectionConnections> {
    return this.http.get<CollectionConnections>(`/v1/collections/${encodeURIComponent(id)}/connections`);
  }
}
