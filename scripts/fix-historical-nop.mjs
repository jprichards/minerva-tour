#!/usr/bin/env node

/**
 * Fix incorrect net_strokes_over_par values on historical scores that the
 * reimport could not match to Glide rows.
 *
 * Targets only scores where scratch_strokes_over_rating IS NULL (untouched
 * by reimport) and the stored NOP disagrees with gross - CH - par.
 *
 * Categorisation:
 *   FIXABLE  – 9-hole score on a 9-hole course (gross < 60): recalculate
 *   LEAVE    – 18-hole round on a 9-hole course record: stored NOP is
 *              already correct (calculated against the real 18-hole par in
 *              Glide); the DB course just stores the 9-hole par.
 *   FLAGGED  – Negative course handicap or ambiguous; needs manual review.
 *
 * Usage:
 *   node scripts/fix-historical-nop.mjs              Dry-run (default)
 *   node scripts/fix-historical-nop.mjs --apply      Apply updates
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ─── Categorisation logic (exported for testing) ────────────────────────────

const NINE_HOLE_TYPES = new Set(['front_9', 'back_9', '9_holes']);

export function categorise(score, coursePar, courseType) {
  const calc = score.gross_score - score.course_handicap - coursePar;
  if (score.net_strokes_over_par === calc) return { action: 'CORRECT' };

  if (score.course_handicap < 0) {
    return { action: 'FLAGGED', reason: 'negative CH', calc };
  }

  const is9HoleCourse = NINE_HOLE_TYPES.has(courseType);

  if (is9HoleCourse && score.gross_score > 60) {
    const par18 = coursePar * 2;
    const calc18 = score.gross_score - score.course_handicap - par18;
    if (Math.abs(score.net_strokes_over_par - calc18) <= 1) {
      return { action: 'LEAVE', reason: '18h round on 9h course, stored NOP correct', calc };
    }
    return { action: 'FLAGGED', reason: 'ambiguous high-gross on 9h course', calc };
  }

  if (is9HoleCourse && score.gross_score <= 60) {
    return { action: 'FIX', correctedNop: calc };
  }

  return { action: 'FLAGGED', reason: 'unexpected mismatch', calc };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(APPLY ? '=== APPLYING FIXES ===' : '=== DRY RUN (pass --apply to write) ===');
  console.log();

  const { data: seasons } = await supabase.from('seasons').select('id, year').lt('year', 2026);
  const { data: events } = await supabase.from('events').select('id, season_id, event_number');
  const sMap = new Map(seasons.map(s => [s.id, s.year]));
  const eMap = new Map(events.map(e => [e.id, { num: e.event_number, year: sMap.get(e.season_id) }]));
  const historicalEventIds = new Set(
    events.filter(e => sMap.has(e.season_id)).map(e => e.id),
  );

  // Fetch all complete historical scores not touched by reimport
  const allScores = [];
  let page = 0;
  while (true) {
    const { data } = await supabase
      .from('scores')
      .select('id, gross_score, net_strokes_over_par, course_handicap, course_id, event_id, user_id, tee_time, scratch_strokes_over_rating')
      .eq('is_complete', true)
      .is('scratch_strokes_over_rating', null)
      .range(page * 1000, (page + 1) * 1000 - 1)
      .order('tee_time', { ascending: false });
    if (!data || data.length === 0) break;
    allScores.push(...data.filter(s => historicalEventIds.has(s.event_id)));
    if (data.length < 1000) break;
    page++;
  }

  // Fetch courses & users
  const cids = [...new Set(allScores.map(s => s.course_id))];
  const courses = [];
  for (let i = 0; i < cids.length; i += 50) {
    const { data } = await supabase.from('courses').select('id, course_name, tee_name, par, type').in('id', cids.slice(i, i + 50));
    if (data) courses.push(...data);
  }
  const cMap = new Map(courses.map(c => [c.id, c]));

  const { data: users } = await supabase.from('users').select('id, full_name');
  const uMap = new Map(users.map(u => [u.id, u.full_name]));

  // Categorise each score
  const fixes = [];
  const leaves = [];
  const flagged = [];
  const correct = [];

  for (const s of allScores) {
    const c = cMap.get(s.course_id);
    if (!c) continue;
    const result = categorise(s, c.par, c.type);
    const info = {
      id: s.id,
      player: uMap.get(s.user_id),
      event: eMap.get(s.event_id),
      date: s.tee_time ? new Date(s.tee_time).toLocaleDateString('en-US', { timeZone: 'UTC' }) : 'n/a',
      gross: s.gross_score,
      ch: s.course_handicap,
      par: c.par,
      type: c.type,
      course: c.course_name,
      storedNop: s.net_strokes_over_par,
      ...result,
    };
    if (result.action === 'FIX') fixes.push(info);
    else if (result.action === 'LEAVE') leaves.push(info);
    else if (result.action === 'FLAGGED') flagged.push(info);
    else correct.push(info);
  }

  // Print results
  console.log(`Scores analysed: ${allScores.length}`);
  console.log(`  Already correct: ${correct.length}`);
  console.log(`  Will fix:        ${fixes.length}`);
  console.log(`  Leave alone:     ${leaves.length}`);
  console.log(`  Flagged:         ${flagged.length}`);
  console.log();

  if (fixes.length > 0) {
    console.log('── FIXES ──');
    for (const f of fixes) {
      console.log(`  ${f.player} | ${f.event?.year} E${f.event?.num} | G:${f.gross} CH:${f.ch} par:${f.par}(${f.type}) | NOP: ${f.storedNop} → ${f.correctedNop} | ${f.date} ${f.course}`);
    }
    console.log();
  }

  if (leaves.length > 0) {
    console.log('── LEAVE ALONE (stored NOP correct for 18h par) ──');
    for (const l of leaves) {
      console.log(`  ${l.player} | ${l.event?.year} E${l.event?.num} | G:${l.gross} CH:${l.ch} par:${l.par}(${l.type}) | NOP: ${l.storedNop} (kept) | ${l.date} ${l.course}`);
    }
    console.log();
  }

  if (flagged.length > 0) {
    console.log('── FLAGGED FOR REVIEW ──');
    for (const f of flagged) {
      console.log(`  ${f.player} | ${f.event?.year} E${f.event?.num} | G:${f.gross} CH:${f.ch} par:${f.par}(${f.type}) | NOP: ${f.storedNop} calc:${f.calc} | ${f.reason} | ${f.date} ${f.course}`);
    }
    console.log();
  }

  // Apply fixes
  if (APPLY && fixes.length > 0) {
    console.log('Applying fixes...');
    let updated = 0;
    for (const f of fixes) {
      const { error } = await supabase
        .from('scores')
        .update({ net_strokes_over_par: f.correctedNop })
        .eq('id', f.id);
      if (error) {
        console.error(`  FAILED ${f.id}: ${error.message}`);
      } else {
        updated++;
      }
    }
    console.log(`Updated ${updated}/${fixes.length} scores.`);
  } else if (!APPLY && fixes.length > 0) {
    console.log('(dry-run — pass --apply to write changes)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
