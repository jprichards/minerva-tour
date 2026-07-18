-- Fixes a second, distinct source of stale match-play result labels
-- (see also fix-stale-closeout-results.sql for the earlier duplicate-
-- closeout-text bug -- this one has a different root cause).
--
-- upsert_playoff_match_hole() wrote player1_result/player2_result via
-- COALESCE(p_player_result, existing_value). The app (src/lib/playoffs.ts,
-- mirrorResultLabels/perPlayerLabel) legitimately computes NULL for the
-- trailing player once a match is decided by an early closeout (e.g. a
-- match that was "6 UP thru 12" becomes "6 & 5" once the deciding hole is
-- logged -- the trailer has no UP/DN label at all once it's a closeout).
-- But COALESCE(NULL, existing) just keeps whatever text was already
-- there, so the trailer's row kept showing its last pre-closeout status
-- (e.g. "6 DN thru 12") forever, even though the leader's row correctly
-- updated to "6 & 5". The app always recomputes and sends BOTH labels on
-- every hole update (never omits one to mean "leave it alone"), so the
-- RPC should just SET, not COALESCE.

-- Part 1: fix the RPC so a NULL from the app is actually persisted.
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
      player1_result = p_player1_result,
      player2_result = p_player2_result,
      updated_at = NOW()
  WHERE id = p_matchup_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_playoff_match_hole(UUID, INT, TEXT, TEXT, TEXT) TO authenticated;

-- Part 2: one-time data fix -- recompute player1_result/player2_result
-- for every match-play matchup that has hole results logged, straight
-- from the hole log (ground truth), using the same algorithm as
-- computeMatchStatus + perPlayerLabel in src/lib/playoffs.ts. This
-- repairs any matchup left with a stale label by the bug above,
-- regardless of exactly which stale pattern it left behind. Safe to
-- re-run: idempotent, becomes a no-op once labels match the hole log.
DO $$
DECLARE
  m RECORD;
  p1_wins INT;
  p2_wins INT;
  played INT;
  lead INT;
  remaining INT;
  decided BOOLEAN;
  leader TEXT;
  p1_label TEXT;
  p2_label TEXT;
BEGIN
  FOR m IN
    SELECT b.id, COALESCE(b.holes, 18) AS holes
    FROM playoff_brackets b
    WHERE b.format = 'match_play'
      AND EXISTS (SELECT 1 FROM playoff_match_holes h WHERE h.matchup_id = b.id)
  LOOP
    SELECT COUNT(*) FILTER (WHERE result = 'player1'),
           COUNT(*) FILTER (WHERE result = 'player2'),
           COUNT(*)
    INTO p1_wins, p2_wins, played
    FROM playoff_match_holes
    WHERE matchup_id = m.id;

    lead := ABS(p1_wins - p2_wins);
    remaining := m.holes - played;
    decided := lead > remaining;
    leader := CASE WHEN p1_wins > p2_wins THEN 'player1' WHEN p2_wins > p1_wins THEN 'player2' ELSE NULL END;

    IF lead = 0 THEN
      -- perPlayerLabel returns 'AS' for both regardless of statusText.
      p1_label := 'AS';
      p2_label := 'AS';
    ELSIF decided AND remaining > 0 THEN
      -- Early closeout ("N & M") -- winner's side only, no UP/DN split.
      IF leader = 'player1' THEN
        p1_label := lead::TEXT || ' & ' || remaining::TEXT;
        p2_label := NULL;
      ELSE
        p1_label := NULL;
        p2_label := lead::TEXT || ' & ' || remaining::TEXT;
      END IF;
    ELSIF played = m.holes THEN
      -- Decided on the very last hole -- still "N UP" / "N DN", no "thru".
      IF leader = 'player1' THEN
        p1_label := lead::TEXT || ' UP';
        p2_label := lead::TEXT || ' DN';
      ELSE
        p1_label := lead::TEXT || ' DN';
        p2_label := lead::TEXT || ' UP';
      END IF;
    ELSE
      IF leader = 'player1' THEN
        p1_label := lead::TEXT || ' UP thru ' || played::TEXT;
        p2_label := lead::TEXT || ' DN thru ' || played::TEXT;
      ELSE
        p1_label := lead::TEXT || ' DN thru ' || played::TEXT;
        p2_label := lead::TEXT || ' UP thru ' || played::TEXT;
      END IF;
    END IF;

    UPDATE playoff_brackets
    SET player1_result = p1_label, player2_result = p2_label, updated_at = NOW()
    WHERE id = m.id
      AND (player1_result IS DISTINCT FROM p1_label OR player2_result IS DISTINCT FROM p2_label);
  END LOOP;
END $$;
