ALTER TABLE organizations
ADD COLUMN org_type TEXT DEFAULT 'team' NOT NULL;
