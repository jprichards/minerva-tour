/**
 * Import trophies and season finishes from the Glide "Profile" sheet.
 *
 * Parses:
 * - "Champ Year" column for individual awards
 * - Season finish columns (2017-2023 MT Finish) for standings
 *
 * Matches players to existing users in the database by name.
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const XLSX_PATH = resolve('docs/glide-app/Minerva Tour App.xlsx');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Award classification (mirrors src/lib/trophy-utils.ts)
// BJC emojis represent teams, not locations:
//   🌳 = Team Magnolia
//   🌺 = Team Azalea
//   🇺🇸 = Hilton Head (pre-team era)
// We extract the correct emoji from the "Trophies" column.

const BJC_EMOJI_SET = new Set(['🌳', '🌺', '🇺🇸']);

function extractBjcEmojis(trophiesStr) {
  if (!trophiesStr || typeof trophiesStr !== 'string') return [];
  const result = [];
  const segments = [...trophiesStr];
  let i = 0;
  while (i < segments.length) {
    if (i + 1 < segments.length) {
      const pair = segments[i] + segments[i + 1];
      if (BJC_EMOJI_SET.has(pair)) {
        result.push(pair);
        i += 2;
        continue;
      }
    }
    if (BJC_EMOJI_SET.has(segments[i])) {
      result.push(segments[i]);
    }
    i++;
  }
  return result;
}

const AWARD_EMOJI = {
  minerva_tour_champion: '🏆',
  scratch_champion: '🥇',
  most_improved: '📉',
  bobby_jones_cup: '🌳',
  member_guest: '🍻',
  unicorn: '🦄',
  playoffs_winner: '🎖',
  consolation_winner: '🥈',
  edge_solutions_cup: '📀',
  hole_in_one: '1️⃣',
};

const AWARD_NAMES = {
  minerva_tour_champion: 'Minerva Tour Champion',
  scratch_champion: 'Scratch Champion',
  most_improved: 'Most Improved Golfer',
  bobby_jones_cup: 'Bobby Jones Cup',
  member_guest: 'Member-Guest',
  unicorn: 'Unicorn',
  playoffs_winner: 'Minerva Tour Playoffs',
  consolation_winner: 'Consolation Winner',
  edge_solutions_cup: 'Edge Solutions Cup',
  hole_in_one: 'Hole in One Club',
};

function classifyAward(name) {
  const lower = name.toLowerCase().trim();
  if (lower.includes('minerva tour champion')) return { type: 'minerva_tour_champion', desc: null };
  if (lower.includes('scratch champion')) return { type: 'scratch_champion', desc: null };
  if (lower.includes('most improved')) return { type: 'most_improved', desc: null };
  if (lower.includes('bobby jones cup')) {
    const m = name.match(/\(([^)]+)\)/);
    return { type: 'bobby_jones_cup', desc: m ? m[1].trim() : null };
  }
  if (lower.includes('member-guest') || lower.includes('member guest')) {
    const m = name.match(/\(([^)]+)\)/);
    return { type: 'member_guest', desc: m ? m[1].trim() : null };
  }
  if (lower.includes('unicorn')) return { type: 'unicorn', desc: null };
  if (lower.includes('minerva tour playoff')) return { type: 'playoffs_winner', desc: null };
  if (lower.includes('consolation')) return { type: 'consolation_winner', desc: null };
  if (lower.includes('edge solutions')) return { type: 'edge_solutions_cup', desc: null };
  if (lower.includes('hole in one')) return { type: 'hole_in_one', desc: null };
  return null;
}

function parseChampYear(champYear, trophiesStr) {
  if (!champYear || typeof champYear !== 'string') return [];

  const awards = [];
  const bjcEmojis = trophiesStr ? extractBjcEmojis(trophiesStr) : [];
  let bjcEmojiIdx = 0;

  const lines = champYear.split('\n').map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const entries = line.split(/(?<=\))\s+(?=\d{4}\s)/).flatMap(part =>
      part.split(/\s+(?=\d{4}\s+[A-Z])/).filter(Boolean)
    );

    for (const entry of entries) {
      const yearMatch = entry.match(/^(\d{4})\s+(.+)$/);
      if (!yearMatch) continue;

      const year = parseInt(yearMatch[1]);
      const awardName = yearMatch[2].trim();
      const classified = classifyAward(awardName);
      if (!classified) {
        console.warn(`  Unknown award: "${awardName}"`);
        continue;
      }

      let emoji = AWARD_EMOJI[classified.type];

      // For BJC: consume the next emoji from the Trophies column
      if (classified.type === 'bobby_jones_cup') {
        if (bjcEmojiIdx < bjcEmojis.length) {
          emoji = bjcEmojis[bjcEmojiIdx];
          bjcEmojiIdx++;
        } else {
          const loc = (classified.desc || '').toLowerCase();
          emoji = loc.includes('hilton head') ? '🇺🇸' : '🌳';
        }
      }

      awards.push({
        year,
        award_type: classified.type,
        award_name: AWARD_NAMES[classified.type],
        description: classified.desc,
        emoji,
      });
    }
  }

  return awards;
}

async function run() {
  console.log('Reading xlsx...');
  const buf = await readFile(XLSX_PATH);
  const wb = XLSX.read(buf);
  const ws = wb.Sheets['Profile'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const header = rows[0];
  const nameIdx = header.indexOf('Name');
  const champYearIdx = header.indexOf('Champ Year');
  const trophiesIdx = header.indexOf('Trophies');
  console.log(`Trophies column index: ${trophiesIdx}`);

  // Find season finish columns
  const finishCols = [];
  for (const [i, h] of header.entries()) {
    if (h.toString().match(/\d{4} MT Finish/i)) {
      finishCols.push({ idx: i, year: parseInt(h) });
    }
  }

  console.log(`Found ${finishCols.length} season finish columns: ${finishCols.map(f => f.year).join(', ')}`);

  // Fetch all users from the database
  const { data: users, error: usersError } = await supabase.from('users').select('id, full_name');
  if (usersError) {
    console.error('Error fetching users:', usersError);
    process.exit(1);
  }
  console.log(`Found ${users.length} users in database`);

  // Build name-to-id map (case-insensitive)
  const nameMap = {};
  for (const u of users) {
    if (u.full_name) nameMap[u.full_name.toLowerCase().trim()] = u.id;
  }

  // Clear existing data to allow re-runs
  console.log('\nClearing existing trophy and season finish data...');
  const { error: clearTrophies } = await supabase.from('trophies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (clearTrophies) console.warn('  Warning clearing trophies:', clearTrophies.message);
  const { error: clearFinishes } = await supabase.from('season_finishes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (clearFinishes) console.warn('  Warning clearing season_finishes:', clearFinishes.message);

  let trophyCount = 0;
  let finishCount = 0;
  let unmatchedPlayers = [];
  const trophyInserts = [];
  const finishInserts = [];

  // Process each row
  for (let i = 1; i < rows.length; i++) {
    const name = rows[i][nameIdx];
    if (!name || typeof name !== 'string' || !name.trim()) continue;

    const userId = nameMap[name.toLowerCase().trim()];
    if (!userId) {
      const champYear = rows[i][champYearIdx];
      const hasData = champYear || finishCols.some(f => rows[i][f.idx]);
      if (hasData) unmatchedPlayers.push(name);
      continue;
    }

    // Parse trophies from Champ Year + Trophies columns
    const champYear = rows[i][champYearIdx];
    const trophiesStr = trophiesIdx >= 0 ? rows[i][trophiesIdx] : '';
    if (champYear) {
      const awards = parseChampYear(champYear.toString(), trophiesStr ? trophiesStr.toString() : '');
      for (const award of awards) {
        trophyInserts.push({
          user_id: userId,
          year: award.year,
          award_type: award.award_type,
          award_name: award.award_name,
          description: award.description,
          emoji: award.emoji,
        });
      }
    }

    // Parse season finishes
    for (const fc of finishCols) {
      const pos = rows[i][fc.idx];
      if (pos && typeof pos === 'string' && pos.trim()) {
        finishInserts.push({
          user_id: userId,
          year: fc.year,
          finish_position: pos.trim(),
        });
      }
    }
  }

  console.log(`\nPrepared ${trophyInserts.length} trophy records`);
  console.log(`Prepared ${finishInserts.length} season finish records`);

  if (unmatchedPlayers.length > 0) {
    console.warn(`\nUnmatched players (${unmatchedPlayers.length}): ${unmatchedPlayers.join(', ')}`);
  }

  // Insert trophies in batches
  if (trophyInserts.length > 0) {
    console.log('\nInserting trophies...');
    const batchSize = 50;
    for (let i = 0; i < trophyInserts.length; i += batchSize) {
      const batch = trophyInserts.slice(i, i + batchSize);
      const { error } = await supabase.from('trophies').insert(batch);
      if (error) {
        console.error(`  Error inserting trophies batch ${i / batchSize + 1}:`, error.message);
      } else {
        trophyCount += batch.length;
      }
    }
    console.log(`  Inserted ${trophyCount} trophies`);
  }

  // Insert season finishes in batches
  if (finishInserts.length > 0) {
    console.log('\nInserting season finishes...');
    const batchSize = 50;
    for (let i = 0; i < finishInserts.length; i += batchSize) {
      const batch = finishInserts.slice(i, i + batchSize);
      const { error } = await supabase.from('season_finishes').insert(batch);
      if (error) {
        console.error(`  Error inserting finishes batch ${i / batchSize + 1}:`, error.message);
      } else {
        finishCount += batch.length;
      }
    }
    console.log(`  Inserted ${finishCount} season finishes`);
  }

  // Verify
  const { count: tc } = await supabase.from('trophies').select('*', { count: 'exact', head: true });
  const { count: fc } = await supabase.from('season_finishes').select('*', { count: 'exact', head: true });
  console.log(`\nVerification: ${tc} trophies, ${fc} season finishes in database`);
  console.log('Done!');
}

run().catch(console.error);
