-- Playoffs mode overhaul: format/holes/status on playoff_brackets,
-- hole-by-hole match play tracking, and SECURITY DEFINER RPCs so
-- participants can update their own matchup without a service-role key.

-- 1. New columns on playoff_brackets
ALTER TABLE playoff_brackets ADD COLUMN IF NOT EXISTS format TEXT CHECK (format IN ('stroke_play', 'match_play'));
ALTER TABLE playoff_brackets ADD COLUMN IF NOT EXISTS holes INT CHECK (holes IN (18, 36)) DEFAULT 18;
ALTER TABLE playoff_brackets ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('scheduled', 'in_progress', 'final')) DEFAULT 'scheduled';

-- 2. Hole-by-hole match play results
CREATE TABLE IF NOT EXISTS playoff_match_holes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matchup_id UUID NOT NULL REFERENCES playoff_brackets(id) ON DELETE CASCADE,
  hole_number INT NOT NULL CHECK (hole_number BETWEEN 1 AND 36),
  result TEXT NOT NULL CHECK (result IN ('player1', 'player2', 'halve')),
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (matchup_id, hole_number)
);

CREATE INDEX IF NOT EXISTS idx_playoff_match_holes_matchup ON playoff_match_holes(matchup_id);

ALTER TABLE playoff_match_holes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read match holes" ON playoff_match_holes;
CREATE POLICY "read match holes" ON playoff_match_holes FOR SELECT USING (true);
-- No direct member write policy: all member writes go through the
-- SECURITY DEFINER RPCs below. Admins can still manage rows directly.
DROP POLICY IF EXISTS "Admins can manage match holes" ON playoff_match_holes;
CREATE POLICY "Admins can manage match holes" ON playoff_match_holes FOR ALL USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- 3. Authorization helper + participant RPCs
CREATE OR REPLACE FUNCTION is_playoff_participant_or_admin(p_matchup_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM playoff_brackets b
    WHERE b.id = p_matchup_id AND (b.player1_id = auth.uid() OR b.player2_id = auth.uid())
  )
  OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin');
$$;

-- Sets the matchup's format + hole count. Never touches winner_id.
CREATE OR REPLACE FUNCTION set_playoff_matchup_format(p_matchup_id UUID, p_format TEXT, p_holes INT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_playoff_participant_or_admin(p_matchup_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_format IS NOT NULL AND p_format NOT IN ('stroke_play', 'match_play') THEN
    RAISE EXCEPTION 'invalid format';
  END IF;
  IF p_holes IS NOT NULL AND p_holes NOT IN (18, 36) THEN
    RAISE EXCEPTION 'invalid holes';
  END IF;

  UPDATE playoff_brackets
  SET format = p_format,
      holes = COALESCE(p_holes, holes),
      updated_at = NOW()
  WHERE id = p_matchup_id;
END;
$$;

-- Records/updates a single hole result for a match-play matchup.
-- Marks the matchup in_progress the first time a hole is logged, and
-- optionally mirrors the client-computed running status text into
-- player1_result/player2_result (the app is the single source of truth
-- for the status algorithm — see src/lib/playoffs.ts computeMatchStatus —
-- this RPC just persists whatever text it's given, or leaves the
-- existing text alone when the params are omitted).
CREATE OR REPLACE FUNCTION upsert_playoff_match_hole(
  p_matchup_id UUID,
  p_hole_number INT,
  p_result TEXT,
  p_player1_result TEXT DEFAULT NULL,
  p_player2_result TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_holes INT;
BEGIN
  IF NOT is_playoff_participant_or_admin(p_matchup_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_result NOT IN ('player1', 'player2', 'halve') THEN
    RAISE EXCEPTION 'invalid result';
  END IF;

  SELECT holes INTO v_holes FROM playoff_brackets WHERE id = p_matchup_id;
  IF p_hole_number < 1 OR p_hole_number > COALESCE(v_holes, 18) THEN
    RAISE EXCEPTION 'hole out of range';
  END IF;

  INSERT INTO playoff_match_holes (matchup_id, hole_number, result, updated_by, updated_at)
  VALUES (p_matchup_id, p_hole_number, p_result, auth.uid(), NOW())
  ON CONFLICT (matchup_id, hole_number)
  DO UPDATE SET result = EXCLUDED.result, updated_by = EXCLUDED.updated_by, updated_at = NOW();

  UPDATE playoff_brackets
  SET status = CASE WHEN status = 'scheduled' THEN 'in_progress' ELSE status END,
      player1_result = COALESCE(p_player1_result, player1_result),
      player2_result = COALESCE(p_player2_result, player2_result),
      updated_at = NOW()
  WHERE id = p_matchup_id;
END;
$$;

-- Sets the matchup's status (e.g. mark a match play matchup final).
CREATE OR REPLACE FUNCTION set_playoff_match_status(p_matchup_id UUID, p_status TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_playoff_participant_or_admin(p_matchup_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF p_status NOT IN ('scheduled', 'in_progress', 'final') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  UPDATE playoff_brackets
  SET status = p_status, updated_at = NOW()
  WHERE id = p_matchup_id;
END;
$$;

GRANT EXECUTE ON FUNCTION is_playoff_participant_or_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION set_playoff_matchup_format(UUID, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_playoff_match_hole(UUID, INT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION set_playoff_match_status(UUID, TEXT) TO authenticated;

-- 4. Defense-in-depth: never allow winner_id to be set to a non-participant.
-- Complements the app-side guard in the admin edit form.
CREATE OR REPLACE FUNCTION guard_playoff_winner() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.winner_id IS NOT NULL
     AND NEW.winner_id <> NEW.player1_id
     AND NEW.winner_id IS DISTINCT FROM NEW.player2_id THEN
    NEW.winner_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_playoff_winner ON playoff_brackets;
CREATE TRIGGER trg_guard_playoff_winner
BEFORE INSERT OR UPDATE ON playoff_brackets
FOR EACH ROW EXECUTE FUNCTION guard_playoff_winner();

-- 5. One-time cleanup: null out any winner_id that has already gone
-- orphaned (e.g. from a prior player edit/re-seed). Safe no-op if there's
-- nothing to clean, and safe for BYE matchups (player2_id null).
UPDATE playoff_brackets
SET winner_id = NULL
WHERE winner_id IS NOT NULL
  AND winner_id <> player1_id
  AND winner_id IS DISTINCT FROM player2_id;
