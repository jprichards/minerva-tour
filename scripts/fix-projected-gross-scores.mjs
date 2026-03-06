#!/usr/bin/env node
/**
 * Fix Projected Gross Score Import Bug
 *
 * The Glide "Round History" tab stores Projected Gross (not Actual Gross) in its
 * "Gross Score" column for scores entered via direct gross entry (where Over Par
 * and Thru fields are empty). This affected scores across 2020-2025 seasons.
 *
 * Per the commissioner, the correct gross comes from Score Archive:
 *   - "Gross Score (optional)" (col 8) if populated = direct entry gross
 *   - Otherwise derive from Over Par + Par (if Thru matches # of Holes)
 *   Score Archive "Actual Gross" (col 11) implements this logic as a formula.
 *
 * Net scores are recalculated from the corrected gross using:
 *   net_score = gross - course_handicap
 *   net_strokes_over_par = net_score - par
 *
 * Matching strategy:
 *   - 2025: Scores were imported with Glide UUIDs as DB primary key → match by ID
 *   - 2020-2024: Scores got auto-generated UUIDs → match by user + event + gross
 *
 * This script:
 *   1. Reads each year's XLSX Score Archive "Actual Gross" (col 11) for correct gross
 *   2. Recalculates net_score and net_strokes_over_par from corrected gross
 *   3. Updates the database scores table
 *
 * Usage:
 *   node scripts/fix-projected-gross-scores.mjs [--dry-run]
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

const FILES = [
  { file: '(2020) Minerva Tour App.xlsx', year: 2020, matchById: false },
  { file: '(2021) Minerva Tour App.xlsx', year: 2021, matchById: false },
  { file: '(2022) Minerva Tour App.xlsx', year: 2022, matchById: false },
  { file: '(2023) Minerva Tour App.xlsx', year: 2023, matchById: false },
  { file: '(2024) Minerva Tour App.xlsx', year: 2024, matchById: false },
  { file: '(2025) Minerva Tour App.xlsx', year: 2025, matchById: true },
];

function parseEventNumber(evStr) {
  if (typeof evStr === 'number') return evStr;
  if (!evStr) return null;
  const m = String(evStr).match(/Event\s*(\d+)/i);
  if (m) return parseInt(m[1]);
  const n = parseInt(evStr);
  return isNaN(n) ? null : n;
}

async function loadLookups() {
  const { data: users } = await supabase.from('users').select('id, full_name');
  const nameToUserId = new Map();
  for (const u of (users || [])) {
    nameToUserId.set(u.full_name.toLowerCase(), u.id);
  }

  const { data: seasons } = await supabase.from('seasons').select('id, year');
  const yearToSeasonId = new Map();
  for (const s of (seasons || [])) yearToSeasonId.set(s.year, s.id);

  const { data: events } = await supabase.from('events').select('id, season_id, event_number').limit(5000);
  const eventLookup = new Map();
  for (const e of (events || [])) {
    eventLookup.set(`${e.season_id}|${e.event_number}`, e.id);
  }

  return { nameToUserId, yearToSeasonId, eventLookup };
}

async function run() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE FIX ===');
  console.log('Fixing projected gross scores imported from Glide Round History\n');

  const { nameToUserId, yearToSeasonId, eventLookup } = await loadLookups();
  console.log(`Loaded ${nameToUserId.size} users, ${yearToSeasonId.size} seasons\n`);

  let totalFixed = 0;
  let totalSkipped = 0;
  let totalNotFound = 0;

  for (const { file, year, matchById } of FILES) {
    const fp = resolve('docs/glide-app', file);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`${year}: Reading ${file}  [match by ${matchById ? 'Glide ID' : 'user+event+gross'}]`);
    console.log('='.repeat(60));

    const buf = await readFile(fp);
    const wb = XLSX.read(buf);

    const rh = wb.Sheets['Round History'];
    if (!rh) { console.log('  No Round History sheet — skipping'); continue; }
    const rhRows = XLSX.utils.sheet_to_json(rh, { header: 1, defval: '' });
    const rhById = new Map();
    for (let i = 1; i < rhRows.length; i++) {
      const r = rhRows[i];
      const id = r[0], player = r[1];
      if (!id || !player || player === 'For Stats' || player === 'Player') continue;
      rhById.set(String(id), { rhGross: r[8], player: r[1], event: r[4] });
    }

    const sa = wb.Sheets['Score Archive'];
    const ces = wb.Sheets['Current Event Scores'];
    if (!sa && !ces) { console.log('  No Score Archive or CES — skipping'); continue; }

    const corrections = [];

    for (const sheet of [sa, ces]) {
      if (!sheet) continue;
      const saRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      for (let i = 1; i < saRows.length; i++) {
        const r = saRows[i];
        let id = r[24];
        if (!id || !String(id).match(/^[0-9a-f]{8}-/)) id = r[23];
        if (!id || !String(id).match(/^[0-9a-f]{8}-/)) continue;
        id = String(id);

        const actualGross = r[11];
        if (typeof actualGross !== 'number') continue;

        const rhe = rhById.get(id);
        if (!rhe) continue;

        if (rhe.rhGross !== actualGross) {
          corrections.push({
            id,
            player: rhe.player,
            event: rhe.event,
            rhGross: rhe.rhGross,
            actualGross,
          });
        }
      }
    }

    console.log(`  Found ${corrections.length} scores needing correction`);
    if (corrections.length === 0) continue;

    const batchSize = 100;
    let dbScoreMap = new Map();

    if (matchById) {
      const correctionIds = corrections.map(c => c.id);
      let dbScores = [];
      for (let i = 0; i < correctionIds.length; i += batchSize) {
        const batch = correctionIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('scores')
          .select('id, gross_score, course_handicap, course_id, holes_played, net_strokes_over_par')
          .in('id', batch);
        if (error) { console.log(`  DB fetch error: ${error.message}`); continue; }
        dbScores.push(...(data || []));
      }
      dbScoreMap = new Map(dbScores.map(s => [s.id, s]));
    } else {
      const seasonId = yearToSeasonId.get(year);
      if (!seasonId) { console.log(`  No season found for ${year} — skipping`); continue; }

      const eventIdByNum = new Map();
      for (const [key, eid] of eventLookup) {
        if (key.startsWith(seasonId + '|')) {
          const num = parseInt(key.split('|')[1]);
          eventIdByNum.set(num, eid);
        }
      }

      const eventIds = [...eventIdByNum.values()];
      let seasonScores = [];
      for (let i = 0; i < eventIds.length; i += batchSize) {
        const batch = eventIds.slice(i, i + batchSize);
        const { data } = await supabase
          .from('scores')
          .select('id, user_id, event_id, gross_score, course_handicap, course_id, holes_played, net_strokes_over_par')
          .in('event_id', batch);
        if (data) seasonScores.push(...data);
      }

      // Index by "userId|eventId|gross" for both old and corrected gross values
      const scoreIndex = new Map();
      for (const s of seasonScores) {
        const key = `${s.user_id}|${s.event_id}|${s.gross_score}`;
        if (!scoreIndex.has(key)) scoreIndex.set(key, []);
        scoreIndex.get(key).push(s);
      }

      for (const corr of corrections) {
        const userId = nameToUserId.get(corr.player.toLowerCase());
        if (!userId) continue;

        const eventNum = parseEventNumber(corr.event);
        if (!eventNum) continue;

        const eventId = eventIdByNum.get(eventNum);
        if (!eventId) continue;

        // Try matching by old (wrong) gross first, then by corrected gross
        // (in case a previous run already fixed the gross but left NOP wrong)
        for (const g of [corr.rhGross, corr.actualGross]) {
          const key = `${userId}|${eventId}|${g}`;
          const matches = scoreIndex.get(key);
          if (matches && matches.length > 0) {
            const match = matches.shift();
            dbScoreMap.set(corr.id, match);
            if (matches.length === 0) scoreIndex.delete(key);
            break;
          }
        }
      }

      console.log(`  Matched ${dbScoreMap.size} of ${corrections.length} corrections to DB scores`);
    }

    // Fetch course data for par values
    const allDbScores = [...dbScoreMap.values()];
    const courseIds = [...new Set(allDbScores.map(s => s.course_id).filter(Boolean))];
    let courseMap = new Map();
    if (courseIds.length > 0) {
      for (let i = 0; i < courseIds.length; i += batchSize) {
        const batch = courseIds.slice(i, i + batchSize);
        const { data } = await supabase
          .from('courses')
          .select('id, rating, slope, par')
          .in('id', batch);
        if (data) for (const c of data) courseMap.set(c.id, c);
      }
    }

    let yearFixed = 0;
    let yearSkipped = 0;
    let yearNotFound = 0;

    for (const corr of corrections) {
      const dbScore = dbScoreMap.get(corr.id);
      if (!dbScore) {
        yearNotFound++;
        continue;
      }

      const grossAlreadyCorrect = dbScore.gross_score === corr.actualGross;

      const course = courseMap.get(dbScore.course_id);
      const courseHandicap = dbScore.course_handicap;
      let netScore = null;
      let netStrokesOverPar = null;

      if (corr.actualGross != null && courseHandicap != null) {
        netScore = corr.actualGross - courseHandicap;
      }

      if (netScore != null && course) {
        netStrokesOverPar = Math.round(netScore - course.par);
      }

      // Check if anything actually needs updating
      const needsGrossFix = !grossAlreadyCorrect;
      const needsNopFix = dbScore.net_strokes_over_par !== netStrokesOverPar;
      if (!needsGrossFix && !needsNopFix) {
        yearSkipped++;
        continue;
      }

      const update = {
        gross_score: corr.actualGross,
        net_score: netScore,
        net_strokes_over_par: netStrokesOverPar,
      };

      if (!DRY_RUN) {
        const { error } = await supabase
          .from('scores')
          .update(update)
          .eq('id', dbScore.id);
        if (error) {
          console.log(`  [ERROR] ${corr.player} Event ${corr.event}: ${error.message}`);
          continue;
        }
      }

      yearFixed++;
      const tag = needsGrossFix ? 'GROSS+NOP' : 'NOP';
      console.log(`  [${tag}] ${corr.player.padEnd(22)} Event ${String(corr.event).padEnd(3)} gross: ${grossAlreadyCorrect ? corr.actualGross : `${corr.rhGross} → ${corr.actualGross}`} | NOP: ${dbScore.net_strokes_over_par} → ${netStrokesOverPar}`);
    }

    console.log(`  ${year} summary: ${yearFixed} fixed, ${yearSkipped} already correct, ${yearNotFound} not matched`);
    totalFixed += yearFixed;
    totalSkipped += yearSkipped;
    totalNotFound += yearNotFound;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('TOTAL RESULTS');
  console.log('='.repeat(60));
  console.log(`Fixed:         ${totalFixed}`);
  console.log(`Already OK:    ${totalSkipped}`);
  console.log(`Not matched:   ${totalNotFound}`);
  console.log(DRY_RUN ? '\n(Dry run — no changes made)' : '\nDone!');
}

run().catch(console.error);
