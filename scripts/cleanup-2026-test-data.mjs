/**
 * Clean up all 2026 test data seeded by seed-2026-test-data.mjs.
 *
 * 1. Deletes all scores tied to Event 1 for the 2026 season
 * 2. Switches the 2026 season back to off_season mode
 *
 * Does NOT delete the event itself since it was pre-existing.
 *
 * Usage:
 *   node scripts/cleanup-2026-test-data.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const DRY_RUN = process.argv.includes('--dry-run');
const SEASON_YEAR = 2026;
const EVENT_NUMBER = 1;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');
  console.log();

  // 1. Find the 2026 season
  const { data: season, error: seasonErr } = await supabase
    .from('seasons')
    .select('*')
    .eq('year', SEASON_YEAR)
    .single();

  if (seasonErr || !season) {
    console.error('No 2026 season found.', seasonErr);
    process.exit(1);
  }
  console.log(`Found season: ${season.year} (id: ${season.id}, mode: ${season.mode})`);

  // 2. Find Event 1
  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('season_id', season.id)
    .eq('event_number', EVENT_NUMBER)
    .single();

  if (!event) {
    console.log(`No Event ${EVENT_NUMBER} found. Nothing to clean up.`);
  } else {
    console.log(`Found event: ${event.name} (id: ${event.id})`);

    // 3. Count and delete scores for this event
    const { count } = await supabase
      .from('scores')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id);

    console.log(`Found ${count ?? 0} scores to delete`);

    if (DRY_RUN) {
      console.log(`[DRY RUN] Would delete ${count ?? 0} scores`);
    } else {
      const { error: delScoresErr } = await supabase
        .from('scores')
        .delete()
        .eq('event_id', event.id);

      if (delScoresErr) {
        console.error('Failed to delete scores:', delScoresErr);
        process.exit(1);
      }
      console.log(`Deleted ${count ?? 0} scores`);
    }
  }

  // 4. Switch season back to off_season
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would switch season ${SEASON_YEAR} back to off_season`);
  } else {
    const { error: updateErr } = await supabase
      .from('seasons')
      .update({ mode: 'off_season', current_event_id: null })
      .eq('id', season.id);

    if (updateErr) {
      console.error('Failed to reset season mode:', updateErr);
      process.exit(1);
    }
    console.log(`Switched ${SEASON_YEAR} season back to off_season`);
  }

  console.log();
  console.log('Cleanup complete!');
}

main().catch(console.error);
