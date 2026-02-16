-- Chirp templates table for member-managed score commentary
CREATE TABLE IF NOT EXISTS chirp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket TEXT NOT NULL CHECK (bucket IN ('legendary','excellent','solid','mediocre','rough','bad','terrible')),
  template TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chirp_templates_bucket ON chirp_templates(bucket);

-- Auto-update updated_at
CREATE TRIGGER update_chirp_templates_updated_at
  BEFORE UPDATE ON chirp_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE chirp_templates ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read chirps
CREATE POLICY "Authenticated users can read chirps" ON chirp_templates
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Members and admins can insert chirps
CREATE POLICY "Members can insert chirps" ON chirp_templates
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'member'))
  );

-- Members and admins can update any chirp (honor system)
CREATE POLICY "Members can update chirps" ON chirp_templates
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'member'))
  );

-- Members and admins can delete any chirp (honor system)
CREATE POLICY "Members can delete chirps" ON chirp_templates
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('admin', 'member'))
  );
