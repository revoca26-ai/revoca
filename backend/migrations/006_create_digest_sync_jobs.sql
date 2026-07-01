CREATE TABLE sync_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    integration_id UUID NOT NULL REFERENCES integrations(id),
    trigger TEXT NOT NULL,
    status TEXT NOT NULL,
    items_fetched INT,
    items_ingested INT,
    items_skipped INT,
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE TABLE digest_settings (
    org_id UUID PRIMARY KEY REFERENCES organizations(id),
    enabled BOOLEAN DEFAULT true NOT NULL,
    delivery_hour INT DEFAULT 6 NOT NULL,
    email_recipients TEXT[] DEFAULT '{}' NOT NULL,
    last_sent_at TIMESTAMPTZ
);

CREATE TABLE digest_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id),
    summary TEXT NOT NULL,
    recipient_count INT NOT NULL,
    status TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
