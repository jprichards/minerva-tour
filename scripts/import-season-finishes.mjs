/**
 * Import season finishes (net + scratch standings) from all xlsx files (2018-2025).
 *
 * Data sources:
 * - 2020-2025: "Net + Scratch Season Standings" sheet
 *     Col 0 = Net Player, Col 4 = Net Rank, Col 5 = Formatted Net Rank
 *     Col 9 = Scratch Player, Col 13 = Scratch Rank, Col 14 = Formatted Scratch Rank
 * - 2018: "Season Leaderboard (paste to we" sheet
 *     Col 3 = Player, Col 1 = Pos (integer) -- net only
 * - 2019: "Season Leaderboard Trend (paste" sheet
 *     Derive final standings by sorting players by their last event column total (descending) -- net only
 *
 * Clears all existing season_finishes before importing.
 *
 * Usage:
 *   node scripts/import-season-finishes.mjs [--dry-run]
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import XLSX from 'xlsx';
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
  // Fetch all users
  const { data: users, error: usersError } = await supabase.from('users').select('id, full_name');
  if (usersError) { console.error('Error fetching users:', usersError); process.exit(1); }
  console.log(`Found ${users.length} users in database`);

  const nameMap = {};
  for (const u of users) {
    if (u.full_name) nameMap[u.full_name.toLowerCase().trim()] = u.id;
  }

  // Clear existing season finishes
  if (!DRY_RUN) {
    console.log('Clearing existing season_finishes...');
    const { error } = await supabase.from('season_finishes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) console.warn('Warning clearing:', error.message);
  }

  const allRecords = [];
  const unmatchedNames = new Set();

  function matchUser(name) {
    if (!name || typeof name !== 'string') return null;
    const key = name.toLowerCase().trim();
    if (nameMap[key]) return nameMap[key];
    unmatchedNames.add(name);
    return null;
  }

  // --- 2020-2025: Net + Scratch Season Standings ---
  const modernFiles = [
    { year: 2020, file: '(2020) Minerva Tour App.xlsx' },
    { year: 2021, file: '(2021) Minerva Tour App.xlsx' },
    { year: 2022, file: '(2022) Minerva Tour App.xlsx' },
    { year: 2023, file: '(2023) Minerva Tour App.xlsx' },
    { year: 2024, file: '(2024) Minerva Tour App.xlsx' },
    { year: 2025, file: '(2025) Minerva Tour App.xlsx' },
  ];

  for (const { year, file } of modernFiles) {
    console.log(`\nProcessing ${year}...`);
    const path = resolve('docs/glide-app', file);
    let buf;
    try { buf = await readFile(path); } catch { console.warn(`  File not found: ${file}`); continue; }
    const wb = XLSX.read(buf);
    const ws = wb.Sheets['Net + Scratch Season Standings'];
    if (!ws) { console.warn(`  Sheet "Net + Scratch Season Standings" not found in ${file}`); continue; }

    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const header = data[0];

    // Find column indices dynamically (2020 layout differs from 2021+)
    const netPlayerIdx = header.indexOf('Net Player');
    const netRankIdx = header.indexOf('Net Rank');
    const fmtNetRankIdx = header.indexOf('Formatted Net Rank');
    const scratchPlayerIdx = header.indexOf('Scratch Player');
    const scratchRankIdx = header.indexOf('Scratch Rank');
    const fmtScratchRankIdx = header.indexOf('Formatted Scratch Rank');

    let netCount = 0, scratchCount = 0;

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[netPlayerIdx] || row[netPlayerIdx] === '') break;

      // Net finish
      const netPlayer = row[netPlayerIdx];
      const netRank = row[netRankIdx];
      const formattedNetRank = row[fmtNetRankIdx];
      const userId = matchUser(netPlayer);
      if (userId && netRank) {
        allRecords.push({
          user_id: userId,
          year,
          finish_position: formattedNetRank || ordinal(netRank),
          standing_type: 'net',
        });
        netCount++;
      }

      // Scratch finish
      if (scratchPlayerIdx >= 0) {
        const scratchPlayer = row[scratchPlayerIdx];
        const scratchRank = row[scratchRankIdx];
        const formattedScratchRank = row[fmtScratchRankIdx];
        const scratchUserId = matchUser(scratchPlayer);
        if (scratchUserId && scratchRank) {
          allRecords.push({
            user_id: scratchUserId,
            year,
            finish_position: formattedScratchRank || ordinal(scratchRank),
            standing_type: 'scratch',
          });
          scratchCount++;
        }
      }
    }
    console.log(`  ${year}: ${netCount} net, ${scratchCount} scratch`);
  }

  // --- 2018: Season Leaderboard (paste to we ---
  {
    console.log('\nProcessing 2018...');
    const path = resolve('docs/glide-app/(2018) Minerva Tour Stats and Scores.xlsx');
    let buf;
    try { buf = await readFile(path); } catch { console.warn('  File not found'); }
    if (buf) {
      const wb = XLSX.read(buf);
      const ws = wb.Sheets['Season Leaderboard (paste to we'];
      if (ws) {
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        // Row 0 = header (Prev Pos, Pos, Trend, Player, Points)
        // Rows 1+ = data
        let count = 0;
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || !row[3] || row[3] === '') break;
          const player = row[3];
          const pos = row[1];
          const userId = matchUser(player);
          if (userId && pos) {
            allRecords.push({
              user_id: userId,
              year: 2018,
              finish_position: ordinal(pos),
              standing_type: 'net',
            });
            count++;
          }
        }
        console.log(`  2018: ${count} net (no scratch data available)`);
      }
    }
  }

  // --- 2019: Season Leaderboard Trend (paste ---
  {
    console.log('\nProcessing 2019...');
    const path = resolve('docs/glide-app/(2019) Minerva Tour Stats and Scores.xlsx');
    let buf;
    try { buf = await readFile(path); } catch { console.warn('  File not found'); }
    if (buf) {
      const wb = XLSX.read(buf);
      const ws = wb.Sheets['Season Leaderboard Trend (paste'];
      if (ws) {
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
        const header = data[0];
        // Find the last event column index (rightmost numeric column)
        let lastEventIdx = header.length - 1;
        // header looks like: ["Player", null, "Event 1", "Event 2", ..., "Event 12"]

        // Collect all players with their final points
        const players = [];
        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || !row[0] || row[0] === 'Current Totals' || row[0] === '') break;
          players.push({ name: row[0], points: row[lastEventIdx] || 0 });
        }

        // Sort by points descending to get final standings
        players.sort((a, b) => b.points - a.points);

        let count = 0;
        let currentRank = 0;
        let prevPoints = null;
        for (let i = 0; i < players.length; i++) {
          const p = players[i];
          if (p.points !== prevPoints) {
            currentRank = i + 1;
            prevPoints = p.points;
          }
          const userId = matchUser(p.name);
          if (userId) {
            allRecords.push({
              user_id: userId,
              year: 2019,
              finish_position: ordinal(currentRank),
              standing_type: 'net',
            });
            count++;
          }
        }
        console.log(`  2019: ${count} net (no scratch data available)`);
      }
    }
  }

  // --- Insert all records ---
  console.log(`\nTotal records to insert: ${allRecords.length}`);

  if (unmatchedNames.size > 0) {
    console.log(`\nUnmatched player names (${unmatchedNames.size}):`);
    for (const n of unmatchedNames) console.log(`  - ${n}`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would insert:');
    for (const r of allRecords) {
      const user = users.find(u => u.id === r.user_id);
      console.log(`  ${r.year} ${r.standing_type}: ${user?.full_name} -> ${r.finish_position}`);
    }
    return;
  }

  // Insert in batches
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < allRecords.length; i += BATCH) {
    const batch = allRecords.slice(i, i + BATCH);
    const { error } = await supabase.from('season_finishes').insert(batch);
    if (error) {
      console.error(`Error inserting batch at ${i}:`, error.message);
      // Try individual inserts for this batch
      for (const record of batch) {
        const { error: singleErr } = await supabase.from('season_finishes').insert(record);
        if (singleErr) {
          const user = users.find(u => u.id === record.user_id);
          console.error(`  Failed: ${record.year} ${record.standing_type} ${user?.full_name}: ${singleErr.message}`);
        } else {
          inserted++;
        }
      }
    } else {
      inserted += batch.length;
    }
  }

  console.log(`\nInserted ${inserted} season finish records.`);
}

run().catch(err => { console.error(err); process.exit(1); });
