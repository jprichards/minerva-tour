/**
 * Import playoff finish positions derived from the playoff_brackets table.
 *
 * Championship flight finish logic (6-player bracket, top 2 get byes):
 *   - Winner of the final (max round) = 1st
 *   - Loser of the final = 2nd
 *   - Losers of the semifinals = T3rd
 *   - Losers of round 1 = T5th
 *
 * Only processes the championship flight. Inserts into season_finishes
 * with standing_type = 'playoff'.
 *
 * Usage:
 *   node scripts/import-playoff-finishes.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

async function run() {
  // Fetch all championship flight brackets with season year
  const { data: brackets, error } = await supabase
    .from('playoff_brackets')
    .select('*, season:seasons(year)')
    .eq('flight', 'championship')
    .order('round', { ascending: true })
    .order('matchup_number', { ascending: true });

  if (error) { console.error('Error fetching brackets:', error); process.exit(1); }
  console.log(`Found ${brackets.length} championship brackets`);

  // Group by season year
  const byYear = new Map();
  for (const b of brackets) {
    const year = b.season?.year;
    if (!year) continue;
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(b);
  }

  // Fetch users for name lookups
  const { data: users } = await supabase.from('users').select('id, full_name');
  const userMap = new Map(users.map(u => [u.id, u.full_name]));

  const records = [];

  for (const [year, yearBrackets] of byYear) {
    console.log(`\nProcessing ${year} (${yearBrackets.length} matches)...`);

    const maxRound = Math.max(...yearBrackets.map(b => b.round));
    const playerFinish = new Map(); // player_id -> finish position

    // Track all players who participated
    for (const b of yearBrackets) {
      if (b.player1_id) playerFinish.set(b.player1_id, null);
      if (b.player2_id) playerFinish.set(b.player2_id, null);
    }

    // Process from final round backwards
    for (let round = maxRound; round >= 1; round--) {
      const roundMatches = yearBrackets.filter(b => b.round === round);

      for (const match of roundMatches) {
        if (!match.winner_id) continue;

        // Skip BYE rounds (both results are "BYE")
        if (match.player1_result === 'BYE' && match.player2_result === 'BYE') continue;

        const loserId = match.player1_id === match.winner_id ? match.player2_id : match.player1_id;

        if (round === maxRound) {
          // Final round
          if (playerFinish.get(match.winner_id) === null) playerFinish.set(match.winner_id, 1);
          if (loserId && playerFinish.get(loserId) === null) playerFinish.set(loserId, 2);
        } else if (round === maxRound - 1) {
          // Semifinals
          if (loserId && playerFinish.get(loserId) === null) playerFinish.set(loserId, 3);
        } else if (round === maxRound - 2) {
          // Quarterfinals / Round 1
          if (loserId && playerFinish.get(loserId) === null) playerFinish.set(loserId, 5);
        } else {
          // Earlier rounds (if any)
          const basePos = 5 + (maxRound - 2 - round) * 2;
          if (loserId && playerFinish.get(loserId) === null) playerFinish.set(loserId, basePos);
        }
      }
    }

    // Create records
    for (const [playerId, finish] of playerFinish) {
      if (finish === null) continue;
      const name = userMap.get(playerId) || playerId;
      console.log(`  ${name}: ${ordinal(finish)}`);
      records.push({
        user_id: playerId,
        year,
        finish_position: ordinal(finish),
        standing_type: 'playoff',
      });
    }
  }

  console.log(`\nTotal playoff finish records: ${records.length}`);

  if (DRY_RUN) {
    console.log('[DRY RUN] No records inserted.');
    return;
  }

  // Clear existing playoff finishes
  const { error: delErr } = await supabase
    .from('season_finishes')
    .delete()
    .eq('standing_type', 'playoff');
  if (delErr) console.warn('Warning clearing playoff finishes:', delErr.message);

  // Insert in batches
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error: insertErr } = await supabase.from('season_finishes').insert(batch);
    if (insertErr) {
      console.error(`Error inserting batch at ${i}:`, insertErr.message);
      for (const record of batch) {
        const { error: singleErr } = await supabase.from('season_finishes').insert(record);
        if (singleErr) console.error(`  Failed: ${userMap.get(record.user_id)} ${record.year}: ${singleErr.message}`);
        else inserted++;
      }
    } else {
      inserted += batch.length;
    }
  }

  console.log(`\nInserted ${inserted} playoff finish records.`);
}

run().catch(err => { console.error(err); process.exit(1); });
