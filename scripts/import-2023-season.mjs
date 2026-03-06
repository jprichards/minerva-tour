/**
 * Import 2024 season data from the Glide "(2024) Minerva Tour App.xlsx".
 *
 * Imports:
 *   1. Events (12 regular/major events) from the Round History tab
 *   2. Courses (matched to existing DB courses, or created if missing)
 *   3. Scores (with dates, gross, net, points, etc.)
 *
 * Data rows in the "Round History" tab start at row 43 (0-indexed);
 * rows 1-42 are "For Stats" placeholder rows.
 *
 * Usage:
 *   node scripts/import-2024-season.mjs [--dry-run]
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local' });

const XLSX_PATH = resolve('docs/glide-app/(2023) Minerva Tour App.xlsx');
const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SEASON_YEAR = 2023;

// ─── Helpers ────────────────────────────────────────────────

function parseDateStr(dateStr) {
  if (!dateStr) return null;
  try {
    const parts = dateStr.toString().split(' - ');
    const datePart = parts[0].trim();
    const timePart = parts[1] ? parts[1].trim() : '12:00 PM';

    const [month, day, shortYear] = datePart.split('/').map(Number);
    const year = 2000 + shortYear;

    const timeMatch = timePart.match(/(\d+):(\d+)\s*(AM|PM)/i);
    let hours = 0, minutes = 0;
    if (timeMatch) {
      hours = parseInt(timeMatch[1]);
      minutes = parseInt(timeMatch[2]);
      const ampm = timeMatch[3].toUpperCase();
      if (ampm === 'PM' && hours !== 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
    }

    const d = new Date(year, month - 1, day, hours, minutes);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

/**
 * Parse course string like:
 *   "Lookout Mountain Club (Renovated) - Blue (18 Holes)"
 *   "Indian Tree (Colorado) - Blue (18 Holes)"
 *   "Heritage Golf Links - Tradition/Legacy - Blue (18 Holes)"
 *
 * Returns { courseName, teeName, holeType }
 */
function parseCourseString(courseStr) {
  if (!courseStr) return null;

  // Extract hole type from the end: "(18 Holes)" or "(9 Holes)"
  const holeMatch = courseStr.match(/\((\d+)\s*Holes?\)\s*$/i);
  let holeType = '18_holes';
  let rest = courseStr;
  if (holeMatch) {
    holeType = parseInt(holeMatch[1]) === 9 ? '9_holes' : '18_holes';
    rest = courseStr.slice(0, holeMatch.index).trim();
  }

  // Split by " - " and take last segment as tee name, rest as course name
  const dashParts = rest.split(' - ');
  if (dashParts.length >= 2) {
    const teeName = dashParts[dashParts.length - 1].trim();
    const courseName = dashParts.slice(0, -1).join(' - ').trim();
    return { courseName, teeName, holeType };
  }

  return { courseName: rest.trim(), teeName: 'Default', holeType };
}

function calculateCourseHandicap(handicapIndex, slope) {
  return Math.round((handicapIndex * slope) / 113);
}

// ─── Main ───────────────────────────────────────────────────

async function run() {
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== LIVE IMPORT ===');
  console.log(`Importing ${SEASON_YEAR} season data from ${XLSX_PATH}\n`);

  // 1. Read xlsx
  const buf = await readFile(XLSX_PATH);
  const wb = XLSX.read(buf);
  const ws = wb.Sheets['Round History'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // BUG FIX: Round History "Gross Score" (col 8) stores Projected Gross, not
  // Actual Gross, for scores entered via direct gross entry. Build a correction
  // map from Score Archive which has the correct "Actual Gross" column.
  // Note: In 2021/2023 exports, the Score Archive ID column is at index 24 due
  // to a "Tee Time (to date)" formula column present in data but not in header.
  const actualGrossById = new Map();
  const saSheet = wb.Sheets['Score Archive'];
  if (saSheet) {
    const saRows = XLSX.utils.sheet_to_json(saSheet, { header: 1, defval: '' });
    for (let i = 1; i < saRows.length; i++) {
      // Try col 24 first (2021/2023 offset), fall back to col 23
      let id = saRows[i][24];
      if (!id || !String(id).match(/^[0-9a-f]{8}-/)) id = saRows[i][23];
      const actualGross = saRows[i][11]; // Actual Gross
      if (id && String(id).match(/^[0-9a-f]{8}-/) && typeof actualGross === 'number') {
        actualGrossById.set(String(id), actualGross);
      }
    }
    console.log(`  Score Archive gross corrections loaded: ${actualGrossById.size}`);
  }

  // 2. Parse data rows (skip "For Stats" placeholder rows)
  const roundData = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const player = r[1];
    if (!player || player === 'For Stats' || !player.toString().trim()) continue;

    const dateStr = r[3];
    const parsedDate = parseDateStr(dateStr);
    if (!parsedDate) {
      console.warn(`  Skipping row ${i}: unparseable date "${dateStr}" for ${player}`);
      continue;
    }

    const courseStr = r[5] ? r[5].toString().trim() : '';
    const parsed = parseCourseString(courseStr);
    if (!parsed) {
      console.warn(`  Skipping row ${i}: unparseable course "${courseStr}"`);
      continue;
    }

    const rowId = r[0] ? String(r[0]) : '';
    const rhGross = typeof r[8] === 'number' ? r[8] : parseInt(r[8]) || null;
    const correctedGross = actualGrossById.has(rowId) ? actualGrossById.get(rowId) : rhGross;

    roundData.push({
      player: player.toString().trim(),
      handicap: typeof r[2] === 'number' ? r[2] : parseFloat(r[2]) || 0,
      date: parsedDate,
      eventNum: typeof r[4] === 'number' ? r[4] : parseInt(r[4]) || null,
      courseStr,
      courseName: parsed.courseName,
      teeName: parsed.teeName,
      holeType: parsed.holeType,
      rating: typeof r[6] === 'number' ? r[6] : parseFloat(r[6]) || 0,
      slope: typeof r[7] === 'number' ? r[7] : parseInt(r[7]) || 113,
      grossScore: correctedGross,
      holesPlayed: typeof r[9] === 'number' ? r[9] : parseInt(r[9]) || null,
      par: typeof r[10] === 'number' ? r[10] : parseInt(r[10]) || null,
      eventType: r[13] ? r[13].toString().trim() : 'R18',
      finalNetPoints: typeof r[19] === 'number' ? r[19] : parseFloat(r[19]) || null,
    });
  }

  console.log(`Parsed ${roundData.length} rounds from xlsx\n`);

  // 3. Fetch season
  const { data: seasonRows } = await supabase
    .from('seasons')
    .select('*')
    .eq('year', SEASON_YEAR);

  if (!seasonRows || seasonRows.length === 0) {
    console.error(`No ${SEASON_YEAR} season found in database. Create it first.`);
    process.exit(1);
  }
  const season = seasonRows[0];
  console.log(`Season: ${season.year} (${season.id})`);

  // 4. Fetch users
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name')
    .in('role', ['admin', 'member']);

  const nameMap = {};
  for (const u of users) {
    if (u.full_name) nameMap[u.full_name.toLowerCase().trim()] = u.id;
  }

  // 5. Check for unmatched players
  const unmatchedPlayers = new Set();
  for (const rd of roundData) {
    if (!nameMap[rd.player.toLowerCase()]) {
      unmatchedPlayers.add(rd.player);
    }
  }
  if (unmatchedPlayers.size > 0) {
    console.warn(`\nUnmatched players: ${[...unmatchedPlayers].join(', ')}`);
    console.warn('These players will be skipped.\n');
  }

  // 6. Build events from unique event numbers
  const eventMap = new Map(); // eventNum -> { dates, eventType, holes }
  for (const rd of roundData) {
    if (rd.eventNum == null) continue;
    if (!eventMap.has(rd.eventNum)) {
      eventMap.set(rd.eventNum, { dates: [], eventType: rd.eventType, holes: rd.holesPlayed });
    }
    eventMap.get(rd.eventNum).dates.push(rd.date);
  }

  // Check if events already exist for this season
  const { data: existingEvents } = await supabase
    .from('events')
    .select('*')
    .eq('season_id', season.id);

  const existingEventMap = new Map();
  if (existingEvents) {
    for (const e of existingEvents) {
      existingEventMap.set(e.event_number, e);
    }
  }

  console.log(`\n--- Events ---`);
  console.log(`Found ${eventMap.size} events in xlsx, ${existingEventMap.size} already in DB`);

  const eventIdMap = new Map(); // eventNum -> DB event ID

  for (const [eventNum, info] of [...eventMap.entries()].sort((a, b) => a[0] - b[0])) {
    const sortedDates = info.dates.sort((a, b) => a - b);
    const startDate = sortedDates[0];
    const endDate = sortedDates[sortedDates.length - 1];
    const isMajor = info.eventType === 'M';
    const holes = info.holes === 9 ? 9 : 18;

    if (existingEventMap.has(eventNum)) {
      eventIdMap.set(eventNum, existingEventMap.get(eventNum).id);
      console.log(`  Event ${eventNum}: already exists (${existingEventMap.get(eventNum).id})`);
      continue;
    }

    console.log(`  Event ${eventNum}: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()} | ${holes}h | ${isMajor ? 'MAJOR' : 'regular'}`);

    if (!DRY_RUN) {
      const { data: inserted, error } = await supabase
        .from('events')
        .insert({
          season_id: season.id,
          event_number: eventNum,
          name: `Event ${eventNum}${isMajor ? ' (Major)' : ''}`,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          holes,
          is_major: isMajor,
          is_playoff: false,
        })
        .select()
        .single();

      if (error) {
        console.error(`    FAILED: ${error.message}`);
      } else {
        eventIdMap.set(eventNum, inserted.id);
      }
    }
  }

  // Re-fetch events if we inserted any
  if (!DRY_RUN) {
    const { data: allEvents } = await supabase
      .from('events')
      .select('*')
      .eq('season_id', season.id);
    if (allEvents) {
      for (const e of allEvents) {
        eventIdMap.set(e.event_number, e.id);
      }
    }
  }

  // 7. Fetch existing courses and match/create
  const { data: allCourses } = await supabase
    .from('courses')
    .select('id, course_name, tee_name, rating, slope, par, type');

  // Build lookup index: "coursename|teename" -> course
  const courseIndex = new Map();
  for (const c of allCourses) {
    const key = `${c.course_name.toLowerCase()}|${c.tee_name.toLowerCase()}`;
    courseIndex.set(key, c);
  }

  console.log(`\n--- Courses ---`);
  console.log(`${allCourses.length} courses in DB`);

  const courseIdCache = new Map(); // courseStr -> course ID
  let coursesCreated = 0;
  let coursesMatched = 0;

  for (const rd of roundData) {
    if (courseIdCache.has(rd.courseStr)) continue;

    const key = `${rd.courseName.toLowerCase()}|${rd.teeName.toLowerCase()}`;
    const existing = courseIndex.get(key);

    if (existing) {
      courseIdCache.set(rd.courseStr, existing.id);
      coursesMatched++;
      continue;
    }

    // Try fuzzy match: same course name (ignoring tee)
    let fuzzy = null;
    for (const [k, v] of courseIndex) {
      if (k.startsWith(rd.courseName.toLowerCase() + '|')) {
        fuzzy = v;
        break;
      }
    }

    if (fuzzy) {
      // Create the specific tee variant
      console.log(`  Creating tee variant: ${rd.courseName} - ${rd.teeName} (matched course name to ${fuzzy.course_name})`);
    } else {
      console.log(`  Creating new course: ${rd.courseName} - ${rd.teeName} | R:${rd.rating} S:${rd.slope} P:${rd.par}`);
    }

    if (!DRY_RUN) {
      const { data: newCourse, error } = await supabase
        .from('courses')
        .insert({
          course_name: rd.courseName,
          tee_name: rd.teeName,
          type: rd.holeType,
          rating: rd.rating,
          slope: rd.slope,
          par: rd.par || (rd.holeType === '9_holes' ? 36 : 72),
        })
        .select()
        .single();

      if (error) {
        console.error(`    FAILED: ${error.message}`);
      } else {
        courseIdCache.set(rd.courseStr, newCourse.id);
        courseIndex.set(`${rd.courseName.toLowerCase()}|${rd.teeName.toLowerCase()}`, newCourse);
        coursesCreated++;
      }
    } else {
      coursesCreated++;
    }
  }

  console.log(`  Matched: ${coursesMatched}, Created: ${coursesCreated}`);

  // 8. Check for existing scores to avoid duplicates
  const { data: existingScores } = await supabase
    .from('scores')
    .select('id, user_id, event_id, gross_score')
    .in('event_id', [...eventIdMap.values()].filter(Boolean));

  const existingScoreSet = new Set();
  if (existingScores) {
    for (const s of existingScores) {
      existingScoreSet.add(`${s.user_id}|${s.event_id}|${s.gross_score}`);
    }
  }

  // 9. Build score inserts
  console.log(`\n--- Scores ---`);
  const scoreInserts = [];
  let skippedNoUser = 0;
  let skippedNoEvent = 0;
  let skippedNoCourse = 0;
  let skippedDuplicate = 0;

  for (const rd of roundData) {
    const userId = nameMap[rd.player.toLowerCase()];
    if (!userId) { skippedNoUser++; continue; }

    const eventId = rd.eventNum != null ? eventIdMap.get(rd.eventNum) : null;
    if (!eventId) { skippedNoEvent++; continue; }

    const courseId = courseIdCache.get(rd.courseStr);
    if (!courseId) { skippedNoCourse++; continue; }

    // Duplicate check
    const dupeKey = `${userId}|${eventId}|${rd.grossScore}`;
    if (existingScoreSet.has(dupeKey)) { skippedDuplicate++; continue; }

    // Calculate net fields using the app's formula
    const maxHoles = rd.holeType === '9_holes' ? 9 : 18;
    const holesPlayed = rd.holesPlayed || maxHoles;
    let courseHandicap = null;
    let netScore = null;
    let netStrokesOverPar = null;

    if (rd.grossScore != null && rd.handicap != null) {
      const fullCH = calculateCourseHandicap(rd.handicap, rd.slope);
      if (holesPlayed < maxHoles) {
        courseHandicap = Math.round(fullCH * (holesPlayed / maxHoles));
        const partialPar = Math.round((rd.par || maxHoles * 4) * (holesPlayed / maxHoles));
        netScore = rd.grossScore - courseHandicap;
        netStrokesOverPar = Math.round(netScore - partialPar);
      } else {
        courseHandicap = fullCH;
        netScore = rd.grossScore - courseHandicap;
        netStrokesOverPar = Math.round(rd.grossScore - courseHandicap - (rd.par || (maxHoles === 9 ? 36 : 72)));
      }
    }

    scoreInserts.push({
      user_id: userId,
      event_id: eventId,
      course_id: courseId,
      tee_time: rd.date.toISOString(),
      gross_score: rd.grossScore,
      holes_played: holesPlayed,
      is_complete: rd.grossScore != null,
      course_handicap: courseHandicap,
      net_score: netScore,
      net_strokes_over_par: netStrokesOverPar,
      points_awarded: rd.finalNetPoints,
      is_retroactive: true,
    });
  }

  console.log(`Prepared ${scoreInserts.length} scores to insert`);
  console.log(`  Skipped - no user: ${skippedNoUser}`);
  console.log(`  Skipped - no event: ${skippedNoEvent}`);
  console.log(`  Skipped - no course: ${skippedNoCourse}`);
  console.log(`  Skipped - duplicate: ${skippedDuplicate}`);

  if (!DRY_RUN && scoreInserts.length > 0) {
    console.log('\nInserting scores...');
    const batchSize = 50;
    let inserted = 0;
    let failed = 0;

    for (let i = 0; i < scoreInserts.length; i += batchSize) {
      const batch = scoreInserts.slice(i, i + batchSize);
      const { error } = await supabase.from('scores').insert(batch);
      if (error) {
        console.error(`  Batch ${Math.floor(i / batchSize) + 1} failed: ${error.message}`);
        failed += batch.length;
      } else {
        inserted += batch.length;
      }
    }

    console.log(`  Inserted: ${inserted}, Failed: ${failed}`);
  }

  // 10. Verify
  if (!DRY_RUN) {
    const { count: eventCount } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('season_id', season.id);

    const eventIds = [...eventIdMap.values()].filter(Boolean);
    const { count: scoreCount } = await supabase
      .from('scores')
      .select('*', { count: 'exact', head: true })
      .in('event_id', eventIds);

    console.log(`\n--- Verification ---`);
    console.log(`${SEASON_YEAR} events in DB: ${eventCount}`);
    console.log(`${SEASON_YEAR} scores in DB: ${scoreCount}`);
  }

  console.log('\nDone!');
}

run().catch(console.error);
