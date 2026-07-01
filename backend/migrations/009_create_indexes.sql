CREATE INDEX idx_chunks_org_id ON chunks (org_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_chunks_embedding ON chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE deleted_at IS NULL AND embedding_status = 'ok';

CREATE INDEX idx_chunks_search_vector ON chunks
    USING gin (search_vector) WHERE deleted_at IS NULL;

CREATE INDEX idx_chunks_document_id ON chunks (document_id);

CREATE INDEX idx_queries_org_created ON queries (org_id, created_at DESC, id);

CREATE UNIQUE INDEX uniq_sync_running ON sync_jobs (integration_id)
    WHERE status = 'running';
