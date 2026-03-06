#!/usr/bin/env node
/**
 * Fix net_strokes_over_par for ALL imported scores.
 *
 * The 2018-2024 import scripts computed NOP as:
 *   round(gross - courseHandicap - rating)   ← WRONG for full rounds
 * The correct formula is:
 *   gross - courseHandicap - proportionalPar
 * where proportionalPar = round(par × holesPlayed / maxHoles).
 *
 * This handles full rounds (par unchanged), partial rounds (pro-rated par),
 * and bridged 9-hole courses played for 18 holes (doubled par).
 *
 * Usage:
 *   node scripts/fix-nop-rating-vs-par.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const DRY_RUN = process.argv.includes('--dry-run');
console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE FIX ===');
console.log('Fixing net_strokes_over_par (rating→par formula correction)\n');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: seasons } = await supabase.from('seasons').select('id, year').order('year');
const { data: events } = await supabase.from('events').select('id, season_id, event_number').limit(5000);
const seasonIdToYear = new Map(seasons.map(s => [s.id, s.year]));
const eventToYear = new Map(events.map(e => [e.id, seasonIdToYear.get(e.season_id)]));

// Paginate all scores
let allScores = [];
let from = 0;
while (true) {
  const { data } = await supabase
    .from('scores')
    .select('id, event_id, gross_score, course_handicap, course_id, net_score, net_strokes_over_par, holes_played')
    .range(from, from + 999);
  if (!data || data.length === 0) break;
  allScores.push(...data);
  if (data.length < 1000) break;
  from += 1000;
}
console.log(`Total scores in DB: ${allScores.length}`);

// Load all courses
const courseIds = [...new Set(allScores.map(s => s.course_id).filter(Boolean))];
const courseMap = new Map();
for (let i = 0; i < courseIds.length; i += 100) {
  const batch = courseIds.slice(i, i + 100);
  const { data } = await supabase.from('courses').select('id, rating, par, type').in('id', batch);
  if (data) for (const c of data) courseMap.set(c.id, c);
}

function maxHolesForCourse(course) {
  if (!course) return 18;
  if (course.type === '9_holes' || course.type === 'front_9' || course.type === 'back_9') return 9;
  return 18;
}

const updates = [];
const byYear = {};

for (const s of allScores) {
  const course = courseMap.get(s.course_id);
  if (!course || s.gross_score == null || s.course_handicap == null) continue;

  const maxH = maxHolesForCourse(course);
  const holesPlayed = s.holes_played || maxH;
  const proportionalPar = Math.round(course.par * (holesPlayed / maxH));
  const correctNop = s.gross_score - s.course_handicap - proportionalPar;

  if (s.net_strokes_over_par === correctNop) continue;

  const year = eventToYear.get(s.event_id) || 'unknown';
  if (!byYear[year]) byYear[year] = 0;
  byYear[year]++;

  updates.push({ id: s.id, correctNop, oldNop: s.net_strokes_over_par });
}

console.log(`\nScores needing NOP correction: ${updates.length}`);
console.log('By year:');
for (const y of Object.keys(byYear).sort()) {
  console.log(`  ${y}: ${byYear[y]}`);
}

if (updates.length === 0) {
  console.log('\nNothing to fix!');
  process.exit(0);
}

if (!DRY_RUN) {
  console.log(`\nApplying ${updates.length} NOP corrections...`);
  let fixed = 0;
  let errors = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from('scores')
      .update({ net_strokes_over_par: u.correctNop })
      .eq('id', u.id);
    if (error) {
      errors++;
      if (errors <= 5) console.log(`  [ERROR] ${u.id}: ${error.message}`);
    } else {
      fixed++;
    }
  }
  console.log(`\nDone! Fixed: ${fixed}, Errors: ${errors}`);
} else {
  console.log('\n(Dry run — no changes made)');
}

process.exit(0);
