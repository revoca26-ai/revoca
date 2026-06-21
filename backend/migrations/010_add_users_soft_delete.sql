-- Add a deleted_at column to the users table
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;
