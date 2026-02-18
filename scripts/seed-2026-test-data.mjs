/**
 * Seed 2026 Event 1 with realistic test scores.
 *
 * Fetches real active members (with handicaps) and real 18-hole courses
 * from the database, generates plausible gross scores, calculates net
 * scores using the same formula as the app, and inserts everything
 * into the database tied to a "Event 1 (TEST)" event.
 *
 * Also switches the 2026 season to regular_season mode so the
 * leaderboard renders.
 *
 * Usage:
 *   node scripts/seed-2026-test-data.mjs [--dry-run]
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

function calculateCourseHandicap(handicapIndex, slope) {
  return Math.round((handicapIndex * slope) / 113);
}

function calculateNetScoreFull(grossScore, handicapIndex, slope, rating) {
  const courseHandicap = calculateCourseHandicap(handicapIndex, slope);
  const netScore = grossScore - courseHandicap;
  const netStrokesOverPar = Math.round(grossScore - courseHandicap - rating);
  return { courseHandicap, netScore, netStrokesOverPar };
}

function calculateNetScorePartial(grossScore, handicapIndex, slope, par, holesPlayed, maxHoles) {
  const fullCourseHandicap = calculateCourseHandicap(handicapIndex, slope);
  const partialHandicap = Math.round(fullCourseHandicap * (holesPlayed / maxHoles));
  const partialPar = Math.round(par * (holesPlayed / maxHoles));
  const netScore = grossScore - partialHandicap;
  const netStrokesOverPar = Math.round(netScore - partialPar);
  return { courseHandicap: partialHandicap, netScore, netStrokesOverPar };
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateGrossScore(par, handicapIndex) {
  const expected = par + Math.round(handicapIndex);
  const variance = randomInt(-5, 8);
  return Math.max(expected + variance, par - 4);
}

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE RUN ===');
  console.log();

  // 1. Fetch the 2026 season
  const { data: season, error: seasonErr } = await supabase
    .from('seasons')
    .select('*')
    .eq('year', SEASON_YEAR)
    .single();

  if (seasonErr || !season) {
    console.error('No 2026 season found. Create it first via admin.', seasonErr);
    process.exit(1);
  }
  console.log(`Found season: ${season.year} (id: ${season.id}, mode: ${season.mode})`);

  // 2. Fetch active members with handicaps
  const { data: members, error: membersErr } = await supabase
    .from('users')
    .select('id, full_name, handicap_index, role')
    .in('role', ['admin', 'member', 'playing_guest'])
    .not('handicap_index', 'is', null)
    .order('full_name');

  if (membersErr || !members?.length) {
    console.error('No active members with handicaps found.', membersErr);
    process.exit(1);
  }
  console.log(`Found ${members.length} active members with handicaps:`);
  for (const m of members) {
    console.log(`  - ${m.full_name} (${m.handicap_index})`);
  }
  console.log();

  // 3. Fetch true 18-hole courses (par/rating filters exclude mislabeled 9-hole entries)
  const { data: courses, error: coursesErr } = await supabase
    .from('courses')
    .select('*')
    .eq('type', '18_holes')
    .gte('par', 68)
    .gte('rating', 60)
    .order('course_name');

  if (coursesErr || !courses?.length) {
    console.error('No 18-hole courses found.', coursesErr);
    process.exit(1);
  }
  console.log(`Found ${courses.length} 18-hole courses`);
  console.log();

  // 4. Find the existing Event 1 for this season
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('*')
    .eq('season_id', season.id)
    .eq('event_number', EVENT_NUMBER)
    .single();

  if (eventErr || !event) {
    console.error(`No Event ${EVENT_NUMBER} found for ${SEASON_YEAR}. Create it via admin first.`, eventErr);
    process.exit(1);
  }
  console.log(`Using event: ${event.name} (id: ${event.id}, holes: ${event.holes})`);

  // 5. Switch season to regular_season and set current event
  if (DRY_RUN) {
    console.log(`[DRY RUN] Would switch season ${SEASON_YEAR} to regular_season`);
  } else {
    const { error: updateErr } = await supabase
      .from('seasons')
      .update({ mode: 'regular_season', current_event_id: event.id })
      .eq('id', season.id);

    if (updateErr) {
      console.error('Failed to update season mode:', updateErr);
      process.exit(1);
    }
    console.log(`Switched ${SEASON_YEAR} season to regular_season`);
  }
  console.log();

  // 6. Generate and insert scores
  // Each member gets 1-3 rounds; ~40% get multiple rounds, ~20% have an in-progress round
  const scores = [];
  const teeTimeBase = new Date('2026-03-07T08:00:00Z');

  function buildScore(member, course, isInProgress, dayOffset) {
    const holesPlayed = isInProgress ? [6, 9, 12, 14, 15][randomInt(0, 4)] : 18;
    const fullGross = generateGrossScore(course.par, member.handicap_index);
    const grossScore = isInProgress
      ? Math.round(fullGross * (holesPlayed / 18))
      : fullGross;

    let courseHandicap, netScore, netStrokesOverPar;
    if (isInProgress) {
      ({ courseHandicap, netScore, netStrokesOverPar } = calculateNetScorePartial(
        grossScore, member.handicap_index, course.slope, course.par, holesPlayed, 18
      ));
    } else {
      ({ courseHandicap, netScore, netStrokesOverPar } = calculateNetScoreFull(
        grossScore, member.handicap_index, course.slope, course.rating
      ));
    }

    const teeTime = new Date(teeTimeBase);
    teeTime.setDate(teeTime.getDate() + dayOffset);
    teeTime.setMinutes(teeTime.getMinutes() + randomInt(0, 480));

    return {
      score: {
        user_id: member.id,
        event_id: event.id,
        course_id: course.id,
        tee_time: teeTime.toISOString(),
        gross_score: grossScore,
        holes_played: holesPlayed,
        is_complete: !isInProgress,
        course_handicap: courseHandicap,
        net_score: netScore,
        net_strokes_over_par: netStrokesOverPar,
        is_retroactive: false,
      },
      display: { grossScore, netScore, netStrokesOverPar, holesPlayed, isInProgress, courseName: course.course_name, teeName: course.tee_name, courseHandicap },
    };
  }

  for (const member of members) {
    const roll = Math.random();
    const numRounds = roll < 0.3 ? 3 : roll < 0.6 ? 2 : 1;

    console.log(`${member.full_name} (${member.handicap_index}) — ${numRounds} round${numRounds > 1 ? 's' : ''}:`);

    for (let r = 0; r < numRounds; r++) {
      const course = courses[randomInt(0, courses.length - 1)];
      // Only the last round of multi-round players may be in-progress
      const isInProgress = (r === numRounds - 1) && Math.random() < 0.2;
      const { score, display } = buildScore(member, course, isInProgress, r * 3);
      scores.push(score);

      const netDisplay = display.netStrokesOverPar === 0 ? 'E' : (display.netStrokesOverPar > 0 ? `+${display.netStrokesOverPar}` : `${display.netStrokesOverPar}`);
      const status = display.isInProgress ? `Thru ${display.holesPlayed}` : 'Thru F';
      console.log(
        `  Rd ${r + 1}: ${display.courseName} (${display.teeName})`.padEnd(65) +
        ` | Gross: ${String(display.grossScore).padEnd(4)} Net: ${display.netScore} (${netDisplay.padEnd(4)})  CH: ${display.courseHandicap}  ${status}`
      );
    }
  }
  console.log();

  if (DRY_RUN) {
    console.log(`[DRY RUN] Would insert ${scores.length} scores`);
  } else {
    const { data: inserted, error: insertErr } = await supabase
      .from('scores')
      .insert(scores)
      .select('id');

    if (insertErr) {
      console.error('Failed to insert scores:', insertErr);
      process.exit(1);
    }
    console.log(`Inserted ${inserted.length} scores`);
  }

  console.log();
  console.log('Done! Open the Leaders tab to verify the leaderboard.');
  console.log('Run `node scripts/cleanup-2026-test-data.mjs` when finished testing.');
}

main().catch(console.error);
