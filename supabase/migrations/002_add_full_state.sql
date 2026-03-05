-- Add full_state JSONB column to store entire app state as single blob
-- This replaces the individual column approach for completeness
ALTER TABLE app_state ADD COLUMN IF NOT EXISTS full_state JSONB DEFAULT '{}'::jsonb;
