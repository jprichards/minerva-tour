-- Add standing_type column to season_finishes to support net vs scratch standings
ALTER TABLE season_finishes ADD COLUMN IF NOT EXISTS standing_type TEXT NOT NULL DEFAULT 'net';

-- Drop the old unique constraint (user_id, year) and replace with (user_id, year, standing_type)
ALTER TABLE season_finishes DROP CONSTRAINT IF EXISTS season_finishes_user_id_year_key;
ALTER TABLE season_finishes ADD CONSTRAINT season_finishes_user_year_type_key UNIQUE(user_id, year, standing_type);
