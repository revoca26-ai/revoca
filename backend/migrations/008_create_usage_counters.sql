CREATE TABLE usage_counters (
    org_id UUID NOT NULL REFERENCES organizations(id),
    period TEXT NOT NULL,
    metric TEXT NOT NULL,
    count INT DEFAULT 0 NOT NULL,
    PRIMARY KEY (org_id, period, metric)
);
