import type { HttpClient } from '../http.js';

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

/**
 * Tenant-wide knowledge collections — organize documents, scope retrieval,
 * attach to one or many domains. Mirrors GET/POST /v1/collections and
 * GET/PATCH/DELETE /v1/collections/{id} exactly (see openapi.yaml).
 */
export class CollectionsResource {
  constructor(private readonly http: HttpClient) {}

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
}
