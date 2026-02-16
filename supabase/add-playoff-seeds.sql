-- Playoff seeds table
CREATE TABLE IF NOT EXISTS playoff_seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seed_number INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season_id, seed_number),
  UNIQUE(season_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_playoff_seeds_season_id ON playoff_seeds(season_id);

-- RLS policies
ALTER TABLE playoff_seeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read playoff seeds" ON playoff_seeds
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage playoff seeds" ON playoff_seeds
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Add result columns to playoff_brackets
ALTER TABLE playoff_brackets ADD COLUMN IF NOT EXISTS player1_result TEXT;
ALTER TABLE playoff_brackets ADD COLUMN IF NOT EXISTS player2_result TEXT;
