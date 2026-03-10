-- Add scratch score and scratch points columns to scores table
-- Run this against Supabase SQL Editor before running the reimport script

ALTER TABLE scores
  ADD COLUMN IF NOT EXISTS scratch_strokes_over_rating integer,
  ADD COLUMN IF NOT EXISTS scratch_points_awarded numeric;
