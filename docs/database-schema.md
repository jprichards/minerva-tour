# Database Schema (Reference for New Project)

Use this as the reference when implementing the data model for a new Minerva Tour app. Tables, columns, and RLS notes below should be adapted to your stack (e.g. Supabase/PostgreSQL).

## Tables

### users
Stores user account information and roles. The `id` field directly references `auth.users(id)`.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'non_playing_guest' CHECK (role IN ('admin', 'member', 'playing_guest', 'non_playing_guest')),
  handicap_index NUMERIC(5, 1), -- Current handicap index (0.0 to 54.0)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
```

### handicap_history
Tracks handicap changes over time for each user.

```sql
CREATE TABLE handicap_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  handicap_index NUMERIC(5, 1) NOT NULL,
  effective_date DATE NOT NULL,
  source TEXT, -- 'manual', 'ghin' (for future integration)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_handicap_history_user_id ON handicap_history(user_id);
CREATE INDEX idx_handicap_history_effective_date ON handicap_history(effective_date);
```

### seasons
Represents a golf season.

```sql
CREATE TABLE seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('off_season', 'regular_season', 'playoffs', 'tournament')),
  current_event_id UUID REFERENCES events(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_seasons_year ON seasons(year);
CREATE INDEX idx_seasons_mode ON seasons(mode);
```

### events
Represents a tour event window (typically 2 weeks).

```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  event_number INTEGER NOT NULL, -- 1-9 for regular season
  name TEXT, -- Optional event name
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  holes INTEGER NOT NULL CHECK (holes IN (9, 18, 36)),
  is_major BOOLEAN DEFAULT FALSE,
  is_playoff BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(season_id, event_number)
);

CREATE INDEX idx_events_season_id ON events(season_id);
CREATE INDEX idx_events_dates ON events(start_date, end_date);
```

### courses
Golf courses and tee configurations.

```sql
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_name TEXT NOT NULL,
  tee_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('18_holes', '9_holes', 'front_9', 'back_9')),
  rating NUMERIC(4, 1) NOT NULL, -- Course rating
  slope INTEGER NOT NULL, -- Slope rating
  par INTEGER NOT NULL, -- Par for the course/tee
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  -- Prevent exact duplicates
  UNIQUE(course_name, tee_name, type, rating, slope, par)
);

CREATE INDEX idx_courses_course_name ON courses(course_name);
CREATE INDEX idx_courses_created_by ON courses(created_by);
```

### scores
Golf round scores submitted by members.

```sql
CREATE TABLE scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES events(id), -- NULL for practice rounds or non-event scores
  course_id UUID NOT NULL REFERENCES courses(id),
  tee_time TIMESTAMPTZ,
  gross_score INTEGER NOT NULL,
  holes_played INTEGER NOT NULL CHECK (holes_played IN (9, 18, 36)),
  is_complete BOOLEAN DEFAULT FALSE,
  -- Calculated fields (cached for performance)
  course_handicap INTEGER, -- Course handicap at time of round
  net_score INTEGER, -- Net score after handicap
  net_strokes_over_par INTEGER, -- Net strokes over par (for ranking)
  points_awarded NUMERIC(5, 1), -- Points for this score in the event
  -- For 9-hole bridging
  combined_with_score_id UUID REFERENCES scores(id), -- If this 9-hole score was combined with another
  is_retroactive BOOLEAN DEFAULT FALSE, -- For retroactive scores in unplayable climates
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scores_user_id ON scores(user_id);
CREATE INDEX idx_scores_event_id ON scores(event_id);
CREATE INDEX idx_scores_course_id ON scores(course_id);
CREATE INDEX idx_scores_created_at ON scores(created_at);
CREATE INDEX idx_scores_combined_with_score_id ON scores(combined_with_score_id);
```

### playoff_brackets
Playoff bracket matchups and results.

```sql
CREATE TABLE playoff_brackets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  flight TEXT NOT NULL, -- 'championship', 'consolation', 'unicorn'
  round INTEGER NOT NULL, -- 1, 2, 3 (championship)
  matchup_number INTEGER NOT NULL, -- Position in bracket
  player1_id UUID REFERENCES users(id),
  player2_id UUID REFERENCES users(id),
  winner_id UUID REFERENCES users(id),
  event_id UUID REFERENCES events(id), -- Event window for this matchup
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_playoff_brackets_season_id ON playoff_brackets(season_id);
CREATE INDEX idx_playoff_brackets_event_id ON playoff_brackets(event_id);
```

### audit_logs
Comprehensive audit trail of all actions.

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  action_type TEXT NOT NULL, -- 'login', 'score_submission', 'score_edit', 'course_add', etc.
  entity_type TEXT, -- 'score', 'course', 'user', 'event', etc.
  entity_id UUID, -- ID of the affected entity
  details JSONB, -- Structured data about the action
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_details ON audit_logs USING GIN(details);
```

### tournaments
Tournament configuration and settings.

```sql
CREATE TABLE tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  season_id UUID REFERENCES seasons(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  format TEXT, -- 'member_guest', 'bobby_jones_cup', etc.
  settings JSONB, -- Tournament-specific settings
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tournaments_season_id ON tournaments(season_id);
CREATE INDEX idx_tournaments_is_active ON tournaments(is_active);
```

### app_settings
Global app configuration.

```sql
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- Initial settings
INSERT INTO app_settings (key, value) VALUES
  ('google_photos_url', '{"url": ""}'),
  ('rules_url', '{"url": "https://minervatour.wordpress.com/rules/"}');
```

## Row Level Security (RLS) Policies

### users
- Users can read their own user record
- Admins can read all users
- Admins can update user roles
- Non-playing guests cannot see user details (only public leaderboard data)

### courses
- All authenticated users can read courses
- All authenticated users can create/edit/delete courses (honor system)
- Non-playing guests can only read

### scores
- Users can read their own scores
- All authenticated users can read scores for current event (for leaderboard)
- Users can create/edit/delete their own scores (only in current event window)
- Admins can edit/delete any score

### events
- All authenticated users can read events
- Only admins can create/edit/delete events

### audit_logs
- Only admins can read audit logs

## Notes

- All timestamps use TIMESTAMPTZ for timezone awareness
- UUIDs are used for all primary keys for better distribution and security
- JSONB is used for flexible structured data (tournament settings, audit log details)
- Indexes are created on foreign keys and commonly queried fields
- RLS policies will be implemented in Supabase for security
