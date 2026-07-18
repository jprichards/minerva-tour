-- Self-service stroke play winner confirmation: unlike match play (where
-- participants can only mark a matchup "final", never touching winner_id),
-- stroke play has no hole-by-hole log to fall back on, so once both
-- players' best-net scores are posted and there's a clear leader, either
-- participant (or an admin) can confirm the winner directly. Scoped to
-- stroke_play matchups only — match play's admin-only winner_id rule is
-- unchanged.

CREATE OR REPLACE FUNCTION confirm_stroke_play_winner(p_matchup_id UUID, p_winner_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_format TEXT;
  v_player1_id UUID;
  v_player2_id UUID;
BEGIN
  IF NOT is_playoff_participant_or_admin(p_matchup_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT format, player1_id, player2_id INTO v_format, v_player1_id, v_player2_id
  FROM playoff_brackets WHERE id = p_matchup_id;

  IF v_format IS DISTINCT FROM 'stroke_play' THEN
    RAISE EXCEPTION 'winner can only be self-confirmed for stroke play matchups';
  END IF;
  IF p_winner_id <> v_player1_id AND p_winner_id IS DISTINCT FROM v_player2_id THEN
    RAISE EXCEPTION 'winner must be one of the two participants';
  END IF;

  UPDATE playoff_brackets
  SET winner_id = p_winner_id,
      status = 'final',
      updated_at = NOW()
  WHERE id = p_matchup_id;
END;
$$;

-- Relies on is_playoff_participant_or_admin from add-playoff-format.sql,
-- and the guard_playoff_winner trigger from the same file remains as
-- defense-in-depth on top of the explicit participant check above.
GRANT EXECUTE ON FUNCTION confirm_stroke_play_winner(UUID, UUID) TO authenticated;
