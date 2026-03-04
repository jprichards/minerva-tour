# Mock Data Testing Guide

Scripts for seeding and cleaning up test score data to verify the leaderboard, points calculation, and scoring logic before the real season starts.

## Quick Start

```bash
# Preview what will be inserted (no DB changes)
node scripts/seed-2026-test-data.mjs --dry-run

# Seed test data and switch season to regular_season
node scripts/seed-2026-test-data.mjs

# Clean up all test data and switch back to off_season
node scripts/cleanup-2026-test-data.mjs

# Preview cleanup
node scripts/cleanup-2026-test-data.mjs --dry-run
```

## What the Seed Script Does

`scripts/seed-2026-test-data.mjs`

1. Finds the 2026 season and Event 1 (must already exist via admin)
2. Fetches all active members (`role IN ('admin', 'member', 'playing_guest')`) with `handicap_index`
3. Fetches 18-hole courses filtered by `par >= 68` and `rating >= 60` (excludes mislabeled 9-hole courses)
4. Switches the 2026 season to `regular_season` mode and sets `current_event_id` to Event 1
5. Generates scores for all members with these distributions:
   - ~30% get 3 rounds, ~30% get 2 rounds, ~40% get 1 round
   - ~20% of the final round per player is in-progress (partial holes)
   - Each round is on a randomly selected course
6. Inserts all scores into the `scores` table

## What the Cleanup Script Does

`scripts/cleanup-2026-test-data.mjs`

1. Finds 2026 Event 1 by `season_id` + `event_number = 1`
2. Deletes all scores where `event_id` matches Event 1
3. Does NOT delete the event itself (it was pre-existing)
4. Switches the 2026 season back to `off_season` and clears `current_event_id`

## Technical Details

### Configuration Constants

Both scripts share these at the top of the file:

| Constant | Value | Purpose |
|----------|-------|---------|
| `SEASON_YEAR` | `2026` | Which season to target |
| `EVENT_NUMBER` | `1` | Which event to seed scores into |

Change `EVENT_NUMBER` to seed into a different event (e.g., Event 3 for a major).

### Score Generation

**Gross score formula:**
```
expected = par + round(handicapIndex)
variance = randomInt(-5, 8)
grossScore = max(expected + variance, par - 4)
```

**Net score for complete rounds (18h):**
```
courseHandicap = round((handicapIndex * slope) / 113)
netScore = grossScore - courseHandicap
netStrokesOverPar = round(grossScore - courseHandicap - rating)
```

**Net score for partial/in-progress rounds:**
```
fullCourseHandicap = round((handicapIndex * slope) / 113)
partialHandicap = round(fullCourseHandicap * (holesPlayed / maxHoles))
partialPar = round(par * (holesPlayed / maxHoles))
netScore = grossScore - partialHandicap
netStrokesOverPar = round(netScore - partialPar)
```

These mirror the formulas in `src/lib/scoring.ts` (`calculateCourseHandicap`, `calculateNetScore`).

### In-Progress Rounds

In-progress scores have:
- `is_complete: false`
- `holes_played`: one of `[6, 9, 12, 14, 15]`
- `gross_score`: proportional to 18-hole projected score (`round(fullGross * holesPlayed / 18)`)
- Net calculations use the partial formulas above

### Multi-Round Logic

Each member can have 1-3 rounds per event. The leaderboard picks only the best score per user:
- Net mode: lowest `net_strokes_over_par`
- Scratch mode: lowest `scratchStrokesOverRating` (computed client-side)

### Course Filtering

Courses are filtered to avoid bad data from historical imports:
- `type = '18_holes'` (excludes 9-hole, front_9, back_9 types)
- `par >= 68` (excludes 9-hole courses mislabeled as 18-hole)
- `rating >= 60` (excludes courses with 9-hole ratings)

### Database Tables Affected

| Table | Seed Action | Cleanup Action |
|-------|-------------|----------------|
| `scores` | Inserts rows with `event_id` pointing to Event 1 | Deletes all rows with matching `event_id` |
| `seasons` | Updates `mode` to `regular_season`, sets `current_event_id` | Updates `mode` to `off_season`, clears `current_event_id` |
| `events` | Read-only (uses existing Event 1) | No changes |
| `users` | Read-only (fetches members) | No changes |
| `courses` | Read-only (fetches courses) | No changes |

### Score Fields Inserted

```javascript
{
  user_id: UUID,           // from users table
  event_id: UUID,          // from events table (Event 1)
  course_id: UUID,         // from courses table (random)
  tee_time: ISO string,    // within the event date window
  gross_score: integer,    // generated from handicap + variance
  holes_played: integer,   // 18 for complete, 6-15 for in-progress
  is_complete: boolean,    // true for finished rounds
  course_handicap: integer,// calculated from handicapIndex and slope
  net_score: integer,      // gross - courseHandicap
  net_strokes_over_par: integer, // net adjusted for rating/par
  is_retroactive: false,
}
```

## How the Leaderboard Consumes This Data

The leaderboard (`src/app/(protected)/leaderboard/page.tsx`) calculates points entirely client-side:

1. **Current Event view**: Fetches all scores for the active event, groups by user, picks best score per user, ranks them, and assigns points using `calculateRegularEventPoints()` or `calculateMajorEventPoints()` from `src/lib/scoring.ts`
2. **Season Standings view**: Iterates through all season events, ranks per event, sums points across events
3. **In-progress rounds** are included in rankings and get projected points as if their current score holds
4. **Ties** are handled by splitting points evenly via `splitTiedPoints()`

### Points Formulas (from `src/lib/scoring.ts`)

**Regular event:** 1st gets N points (N = participants), 2nd gets N-1, ..., last gets 1

**Major event:** 1st gets max(N * 1.33, 10), then -3, -2, -1, -1, -1, -1... (min 1)

## Possible Future Enhancements

- Seed multiple events to test season standings accumulation
- Add tied scores at specific positions to verify tie-splitting
- Seed 9-hole event scores (Event 2 and Event 4 are 9-hole events)
- Seed major event scores (Event 3 is a major) to verify major point formula
- Seed playoff event scores to verify scratch-only inclusion
- Add specific score values (not random) for deterministic verification
