-- Code expects integrations.updated_at; original create table omitted it
ALTER TABLE integrations
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
