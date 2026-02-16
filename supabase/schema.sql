-- Minerva Tour App - Complete Database Schema
-- Run this in Supabase SQL Editor to set up all tables

-- ============================================
-- TABLES
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'non_playing_guest' CHECK (role IN ('admin', 'member', 'playing_guest', 'non_playing_guest')),
  handicap_index NUMERIC(5, 1),
  ghin_number TEXT,
  profile_picture_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- User provisions (pre-provisioned users by admin)
CREATE TABLE IF NOT EXISTS user_provisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'playing_guest', 'non_playing_guest')),
  provisioned_by UUID REFERENCES users(id),
  claimed_by UUID REFERENCES users(id),
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_provisions_email ON user_provisions(email);

-- Handicap history
CREATE TABLE IF NOT EXISTS handicap_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  handicap_index NUMERIC(5, 1) NOT NULL,
  effective_date DATE NOT NULL,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handicap_history_user_id ON handicap_history(user_id);
CREATE INDEX IF NOT EXISTS idx_handicap_history_effective_date ON handicap_history(effective_date);

-- Events (created before seasons references it)
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL, -- FK added after seasons table
  event_number INTEGER NOT NULL,
  name TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  holes INTEGER NOT NULL CHECK (holes IN (9, 18, 36)),
  is_major BOOLEAN DEFAULT FALSE,
  is_playoff BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_season_id ON events(season_id);
CREATE INDEX IF NOT EXISTS idx_events_dates ON events(start_date, end_date);

-- Seasons
CREATE TABLE IF NOT EXISTS seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  mode TEXT NOT NULL DEFAULT 'off_season' CHECK (mode IN ('off_season', 'regular_season', 'playoffs', 'tournament')),
  current_event_id UUID REFERENCES events(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seasons_year ON seasons(year);
CREATE INDEX IF NOT EXISTS idx_seasons_mode ON seasons(mode);

-- Add FK from events to seasons
ALTER TABLE events ADD CONSTRAINT fk_events_season_id FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;

-- Add unique constraint
ALTER TABLE events ADD CONSTRAINT uq_events_season_event UNIQUE (season_id, event_number);

-- Courses
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_name TEXT NOT NULL,
  tee_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('18_holes', '9_holes', 'front_9', 'back_9')),
  rating NUMERIC(4, 1) NOT NULL,
  slope INTEGER NOT NULL,
  par INTEGER NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  UNIQUE(course_name, tee_name, type, rating, slope, par)
);

CREATE INDEX IF NOT EXISTS idx_courses_course_name ON courses(course_name);
CREATE INDEX IF NOT EXISTS idx_courses_created_by ON courses(created_by);

-- Scores
CREATE TABLE IF NOT EXISTS scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id),
  course_id UUID NOT NULL REFERENCES courses(id),
  tee_time TIMESTAMPTZ,
  gross_score INTEGER,
  holes_played INTEGER,
  is_complete BOOLEAN DEFAULT FALSE,
  course_handicap INTEGER,
  net_score INTEGER,
  net_strokes_over_par INTEGER,
  points_awarded NUMERIC(5, 1),
  combined_with_score_id UUID REFERENCES scores(id),
  is_retroactive BOOLEAN DEFAULT FALSE,
  submitted_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scores_user_id ON scores(user_id);
CREATE INDEX IF NOT EXISTS idx_scores_event_id ON scores(event_id);
CREATE INDEX IF NOT EXISTS idx_scores_course_id ON scores(course_id);
CREATE INDEX IF NOT EXISTS idx_scores_created_at ON scores(created_at);

-- Playoff brackets
CREATE TABLE IF NOT EXISTS playoff_brackets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  flight TEXT NOT NULL CHECK (flight IN ('championship', 'consolation', 'unicorn')),
  round INTEGER NOT NULL,
  matchup_number INTEGER NOT NULL,
  player1_id UUID REFERENCES users(id),
  player2_id UUID REFERENCES users(id),
  winner_id UUID REFERENCES users(id),
  event_id UUID REFERENCES events(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_playoff_brackets_season_id ON playoff_brackets(season_id);

-- Audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_details ON audit_logs USING GIN(details);

-- Tournaments
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  season_id UUID REFERENCES seasons(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  format TEXT,
  settings JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tournaments_season_id ON tournaments(season_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_is_active ON tournaments(is_active);

-- App settings
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('event_start', 'event_end', 'score_posted', 'handicap_update', 'admin_message', 'season_mode', 'tournament', 'general')),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);

-- Trophies / Awards
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

-- Season finishes
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

-- Initial settings
INSERT INTO app_settings (key, value) VALUES
  ('google_photos_url', '{"url": ""}'),
  ('rules_url', '{"url": "https://minervatour.wordpress.com/rules/"}')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE trophies ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_finishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_provisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE handicap_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE playoff_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Users policies (avoid self-referencing queries to prevent infinite recursion)
CREATE POLICY "Authenticated users can read all users" ON users
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update any user" ON users
  FOR UPDATE USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Allow insert for new users" ON users
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can delete users" ON users
  FOR DELETE USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- User provisions policies
CREATE POLICY "Authenticated can read provisions" ON user_provisions
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can insert provisions" ON user_provisions
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can update provisions" ON user_provisions
  FOR UPDATE USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admins can delete provisions" ON user_provisions
  FOR DELETE USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Handicap history policies
CREATE POLICY "Authenticated can read handicap history" ON handicap_history
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can insert handicap history" ON handicap_history
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'));

-- Seasons policies
CREATE POLICY "Anyone can read seasons" ON seasons FOR SELECT USING (true);
CREATE POLICY "Admins can manage seasons" ON seasons FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Events policies
CREATE POLICY "Anyone can read events" ON events FOR SELECT USING (true);
CREATE POLICY "Admins can manage events" ON events FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Courses policies
CREATE POLICY "Anyone can read courses" ON courses FOR SELECT USING (true);
CREATE POLICY "Authenticated users can add courses" ON courses FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can edit courses" ON courses FOR UPDATE USING (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can delete courses" ON courses FOR DELETE USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Scores policies
CREATE POLICY "Anyone can read scores" ON scores FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert scores" ON scores FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own scores or admins any" ON scores FOR UPDATE USING (
  user_id = auth.uid() OR submitted_by = auth.uid() OR
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can delete own scores or admins any" ON scores FOR DELETE USING (
  user_id = auth.uid() OR submitted_by = auth.uid() OR
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Playoff brackets policies
CREATE POLICY "Anyone can read playoff brackets" ON playoff_brackets FOR SELECT USING (true);
CREATE POLICY "Admins can manage playoff brackets" ON playoff_brackets FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Audit logs policies
CREATE POLICY "Admins can read audit logs" ON audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Authenticated users can insert audit logs" ON audit_logs FOR INSERT WITH CHECK (true);

-- Tournaments policies
CREATE POLICY "Anyone can read tournaments" ON tournaments FOR SELECT USING (true);
CREATE POLICY "Admins can manage tournaments" ON tournaments FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- App settings policies
CREATE POLICY "Anyone can read app settings" ON app_settings FOR SELECT USING (true);
CREATE POLICY "Admins can manage app settings" ON app_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Notifications policies
CREATE POLICY "Users can read own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can insert notifications" ON notifications FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "System can insert notifications" ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_seasons_updated_at BEFORE UPDATE ON seasons FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_courses_updated_at BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_scores_updated_at BEFORE UPDATE ON scores FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_playoff_brackets_updated_at BEFORE UPDATE ON playoff_brackets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_tournaments_updated_at BEFORE UPDATE ON tournaments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  provision_role TEXT;
  provision_id UUID;
BEGIN
  -- Check if email is provisioned
  BEGIN
    SELECT up.id, up.role INTO provision_id, provision_role
    FROM public.user_provisions up
    WHERE up.email = NEW.email AND up.claimed_by IS NULL
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    provision_role := NULL;
    provision_id := NULL;
  END;

  -- Create user record with provisioned role or default
  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(provision_role, 'non_playing_guest')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.users.full_name);

  -- Mark provision as claimed
  IF provision_id IS NOT NULL THEN
    UPDATE public.user_provisions SET claimed_by = NEW.id, claimed_at = NOW() WHERE id = provision_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger on auth.users insert
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Trophies policies
CREATE POLICY "Anyone can read trophies" ON trophies FOR SELECT USING (true);
CREATE POLICY "Admins can manage trophies" ON trophies FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Season finishes policies
CREATE POLICY "Anyone can read season finishes" ON season_finishes FOR SELECT USING (true);
CREATE POLICY "Admins can manage season finishes" ON season_finishes FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Create storage bucket for profile pictures
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-pictures', 'profile-pictures', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy for profile pictures
CREATE POLICY "Anyone can read profile pictures" ON storage.objects FOR SELECT USING (bucket_id = 'profile-pictures');
CREATE POLICY "Authenticated users can upload profile pictures" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'profile-pictures' AND auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own profile pictures" ON storage.objects FOR UPDATE USING (bucket_id = 'profile-pictures' AND auth.uid() IS NOT NULL);
CREATE POLICY "Users can delete own profile pictures" ON storage.objects FOR DELETE USING (bucket_id = 'profile-pictures' AND auth.uid() IS NOT NULL);
