-- One-time data fix, not a schema change.
--
-- perPlayerLabel() used to mirror the exact same "N & M" closeout text
-- (e.g. "3 & 2") to BOTH players' player1_result/player2_result columns
-- for any match play matchup decided before the last hole. That was
-- fixed in src/lib/playoffs.ts so the loser's side now gets NULL instead
-- (only the winner's row shows the closeout score) -- but any matchup
-- that logged its closing hole *before* that fix was deployed still has
-- the stale duplicate sitting in the DB, since nothing re-triggers the
-- mirror once a match is finished and no more holes get logged.
--
-- This nulls out the loser's stored result for exactly that stale
-- pattern, using the actual hole log (playoff_match_holes) as ground
-- truth for who actually won. Ties ("AS") are untouched -- the "N & M"
-- regex only matches genuine closeout text. Safe to re-run: idempotent,
-- becomes a no-op once the duplicates are gone.

WITH wins AS (
  SELECT matchup_id,
         COUNT(*) FILTER (WHERE result = 'player1') AS p1_wins,
         COUNT(*) FILTER (WHERE result = 'player2') AS p2_wins
  FROM playoff_match_holes
  GROUP BY matchup_id
)
UPDATE playoff_brackets b
SET player2_result = NULL, updated_at = NOW()
FROM wins w
WHERE b.id = w.matchup_id
  AND b.format = 'match_play'
  AND b.player1_result IS NOT NULL
  AND b.player1_result = b.player2_result
  AND b.player1_result ~ '^[0-9]+ & [0-9]+$'
  AND w.p1_wins > w.p2_wins;

WITH wins AS (
  SELECT matchup_id,
         COUNT(*) FILTER (WHERE result = 'player1') AS p1_wins,
         COUNT(*) FILTER (WHERE result = 'player2') AS p2_wins
  FROM playoff_match_holes
  GROUP BY matchup_id
)
UPDATE playoff_brackets b
SET player1_result = NULL, updated_at = NOW()
FROM wins w
WHERE b.id = w.matchup_id
  AND b.format = 'match_play'
  AND b.player2_result IS NOT NULL
  AND b.player1_result = b.player2_result
  AND b.player2_result ~ '^[0-9]+ & [0-9]+$'
  AND w.p2_wins > w.p1_wins;
