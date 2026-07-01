-- Create queries table
CREATE TABLE queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    user_id UUID NOT NULL REFERENCES users(id),
    question TEXT NOT NULL,
    rewritten_query JSONB,
    answer TEXT,
    confidence FLOAT,
    status TEXT DEFAULT 'processing' NOT NULL,
    latency_ms INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create query_sources table
CREATE TABLE query_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    query_id UUID NOT NULL REFERENCES queries(id),
    chunk_id UUID NOT NULL REFERENCES chunks(id),
    relevance_score FLOAT NOT NULL,
    citation_index INT NOT NULL,
    snippet TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

