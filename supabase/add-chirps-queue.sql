-- Chirps queue + archive columns for the queue-based chirps system
-- Run AFTER the feature flag row is inserted and BEFORE enabling the flag

-- Add queue and archive columns
ALTER TABLE chirp_templates ADD COLUMN IF NOT EXISTS queue_position INTEGER;
ALTER TABLE chirp_templates ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'ai'));
ALTER TABLE chirp_templates ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Index for fast queue reads (ordered by position within bucket)
CREATE INDEX IF NOT EXISTS idx_chirp_templates_queue
  ON chirp_templates(bucket, queue_position)
  WHERE queue_position IS NOT NULL;

-- Index for archive browsing
CREATE INDEX IF NOT EXISTS idx_chirp_templates_archive
  ON chirp_templates(bucket, archived_at)
  WHERE archived_at IS NOT NULL;

-- Atomically pop the next chirp from the queue for a bucket.
-- Uses FOR UPDATE SKIP LOCKED so concurrent requests grab different rows.
-- SECURITY DEFINER so any authenticated user (including playing_guest) can
-- consume chirps — the UPDATE RLS policy only allows admin/member, but chirp
-- consumption is an internal queue operation that should work for all roles.
CREATE OR REPLACE FUNCTION pop_chirp_from_queue(target_bucket TEXT)
RETURNS TABLE(id UUID, template TEXT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE chirp_templates
  SET archived_at = NOW(), queue_position = NULL
  WHERE chirp_templates.id = (
    SELECT ct.id
    FROM chirp_templates ct
    WHERE ct.bucket = target_bucket
      AND ct.queue_position IS NOT NULL
      AND ct.archived_at IS NULL
    ORDER BY ct.queue_position ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING chirp_templates.id, chirp_templates.template;
$$;

-- Archive all existing chirps (run once before initializing the queue with AI)
-- UPDATE chirp_templates SET archived_at = NOW() WHERE archived_at IS NULL AND queue_position IS NULL;

-- ==========================================
-- Bucket consolidation (8 → 6 buckets)
-- Run AFTER deploying the code that removes solid/terrible bucket types.
-- ==========================================

-- Remap removed buckets to their new homes
-- UPDATE chirp_templates SET bucket = 'excellent' WHERE bucket = 'solid';
-- UPDATE chirp_templates SET bucket = 'bad' WHERE bucket = 'terrible';

-- Remove any queued mediocre chirps (no chirp fires for this range)
-- DELETE FROM chirp_templates WHERE bucket = 'mediocre' AND queue_position IS NOT NULL;

-- Clear saved custom bucket ranges (they reference the old 8-bucket structure)
-- DELETE FROM app_settings WHERE key = 'chirp_bucket_ranges';
