-- Trophies / Awards table
CREATE TABLE IF NOT EXISTS trophies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  award_type TEXT NOT NULL,
  award_name TEXT NOT NULL,
  description TEXT,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trophies_user_id ON trophies(user_id);
CREATE INDEX IF NOT EXISTS idx_trophies_award_type ON trophies(award_type);
CREATE INDEX IF NOT EXISTS idx_trophies_year ON trophies(year);

-- Season finishes table
CREATE TABLE IF NOT EXISTS season_finishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  finish_position TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, year)
);

CREATE INDEX IF NOT EXISTS idx_season_finishes_user_id ON season_finishes(user_id);
CREATE INDEX IF NOT EXISTS idx_season_finishes_year ON season_finishes(year);

-- RLS
ALTER TABLE trophies ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_finishes ENABLE ROW LEVEL SECURITY;

-- Policies: anyone can read, admins can manage
CREATE POLICY "Anyone can read trophies" ON trophies FOR SELECT USING (true);
CREATE POLICY "Admins can manage trophies" ON trophies FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Anyone can read season finishes" ON season_finishes FOR SELECT USING (true);
CREATE POLICY "Admins can manage season finishes" ON season_finishes FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
