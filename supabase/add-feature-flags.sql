-- Feature Flags table
-- Supports per-user and per-role targeting for gradual rollouts
CREATE TABLE IF NOT EXISTS feature_flags (
  key TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT false,
  target_user_ids UUID[] DEFAULT '{}',
  target_roles TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read flags (needed for the client hook)
CREATE POLICY "Anyone can read feature flags" ON feature_flags
  FOR SELECT USING (true);

-- Only admins can create/update feature flags
CREATE POLICY "Admins can manage feature flags" ON feature_flags
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- Auto-update updated_at
CREATE TRIGGER tr_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
